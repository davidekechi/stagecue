// T6.2 / 04 §2 — Echo (Reverb) wrapper. Every incoming payload is validated with zod; bad ones are dropped.
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import type { z } from 'zod';
import {
    commandEnvelopeSchema,
    controllerPairedSchema,
    controllerRevokedSchema,
    heartbeatSchema,
    peerHeartbeatSchema,
    sessionEndedSchema,
    stateEventSchema,
} from '@/core/schemas';
import type { CommandEnvelope, HeartbeatPayload, StateEvent } from '@/core/types';
import type { RealtimeConfig } from './ApiClient';

export type SocketState = 'initialized' | 'connecting' | 'connected' | 'unavailable' | 'failed' | 'disconnected';

// ---- minimal Echo surface (so tests can use a fake) ----
export interface ChannelLike {
    listen(event: string, cb: (payload: unknown) => void): ChannelLike;
    subscribed(cb: () => void): ChannelLike;
    error(cb: (e: unknown) => void): ChannelLike;
}
export interface PresenceLike extends ChannelLike {
    here(cb: (members: Member[]) => void): PresenceLike;
    joining(cb: (m: Member) => void): PresenceLike;
    leaving(cb: (m: Member) => void): PresenceLike;
    listenForWhisper(event: string, cb: (payload: unknown) => void): PresenceLike;
    whisper(event: string, data: Record<string, unknown>): PresenceLike;
}
export interface EchoLike {
    private(name: string): ChannelLike;
    join(name: string): PresenceLike;
    leave(name: string): void;
    disconnect(): void;
    connector: { pusher: { connection: { state: string; bind(event: string, cb: (s: { current: string }) => void): void }; connect(): void } };
}

export interface Member {
    id: string;
    role: 'display' | 'controller';
    name: string;
}

export type EchoFactory = (opts: { config: RealtimeConfig; token: string | null; authEndpoint: string }) => EchoLike;

export const defaultEchoFactory: EchoFactory = ({ config, token, authEndpoint }) =>
    new Echo({
        broadcaster: 'reverb',
        key: config.key ?? undefined,
        wsHost: config.host ?? undefined,
        wsPort: config.port,
        wssPort: config.port,
        forceTLS: config.scheme === 'https',
        enabledTransports: ['ws', 'wss'],
        authEndpoint,
        bearerToken: token,
        Pusher,
    }) as unknown as EchoLike;

export interface DisplayHandlers {
    command?(env: CommandEnvelope): void;
    controllerPaired?(p: z.infer<typeof controllerPairedSchema>): void;
    controllerRevoked?(p: z.infer<typeof controllerRevokedSchema>): void;
    sessionEnded?(p: z.infer<typeof sessionEndedSchema>): void;
    peerHeartbeat?(p: z.infer<typeof peerHeartbeatSchema>): void;
    subscribed?(): void;
    error?(e: unknown): void;
}
export interface ControllerHandlers {
    state?(e: StateEvent): void;
    controllerRevoked?(p: z.infer<typeof controllerRevokedSchema>): void;
    sessionEnded?(p: z.infer<typeof sessionEndedSchema>): void;
    peerHeartbeat?(p: z.infer<typeof peerHeartbeatSchema>): void;
    subscribed?(): void;
    error?(e: unknown): void;
}
export interface PresenceHandlers {
    here?(members: Member[]): void;
    joining?(m: Member): void;
    leaving?(m: Member): void;
    heartbeat?(p: HeartbeatPayload): void;
    subscribed?(): void;
    error?(e: unknown): void;
}

export interface RealtimeClientDeps {
    config: RealtimeConfig;
    token: () => string | null;
    baseUrl?: string;
    echoFactory?: EchoFactory;
    onInvalid?: (event: string, issues: unknown) => void;
}

export class RealtimeClient {
    private echo: EchoLike | null = null;
    private state: SocketState = 'initialized';
    private readonly listeners = new Set<(s: SocketState) => void>();
    private presence = new Map<string, PresenceLike>();

    constructor(private readonly deps: RealtimeClientDeps) {}

    get connectionState(): SocketState {
        return this.state;
    }

    /** Subscribes to socket state changes. Returns an unsubscribe function. */
    onConnectionState(cb: (s: SocketState) => void): () => void {
        this.listeners.add(cb);
        cb(this.state);
        return () => this.listeners.delete(cb);
    }

    connect(): EchoLike {
        if (this.echo) return this.echo;
        const echo = (this.deps.echoFactory ?? defaultEchoFactory)({
            config: this.deps.config,
            token: this.deps.token(),
            authEndpoint: `${this.deps.baseUrl ?? ''}/api/broadcasting/auth`,
        });
        this.echo = echo;
        const conn = echo.connector.pusher.connection;
        this.setState(conn.state as SocketState);
        conn.bind('state_change', ({ current }) => this.setState(current as SocketState));
        return echo;
    }

    subscribeDisplay(sid: string, h: DisplayHandlers): () => void {
        const name = `session.${sid}.display`;
        const ch = this.connect().private(name);
        this.on(ch, '.command', commandEnvelopeSchema, h.command);
        this.on(ch, '.controller.paired', controllerPairedSchema, h.controllerPaired);
        this.on(ch, '.controller.revoked', controllerRevokedSchema, h.controllerRevoked);
        this.on(ch, '.session.ended', sessionEndedSchema, h.sessionEnded);
        this.on(ch, '.peer.heartbeat', peerHeartbeatSchema, h.peerHeartbeat);
        ch.subscribed(() => h.subscribed?.());
        ch.error((e) => h.error?.(e));
        return () => this.echo?.leave(name);
    }

    subscribeControllers(sid: string, h: ControllerHandlers): () => void {
        const name = `session.${sid}.controllers`;
        const ch = this.connect().private(name);
        this.on(ch, '.state', stateEventSchema, h.state as ((v: unknown) => void) | undefined);
        this.on(ch, '.controller.revoked', controllerRevokedSchema, h.controllerRevoked);
        this.on(ch, '.session.ended', sessionEndedSchema, h.sessionEnded);
        this.on(ch, '.peer.heartbeat', peerHeartbeatSchema, h.peerHeartbeat);
        ch.subscribed(() => h.subscribed?.());
        ch.error((e) => h.error?.(e));
        return () => this.echo?.leave(name);
    }

    joinPresence(sid: string, h: PresenceHandlers): () => void {
        const name = `session.${sid}`;
        const ch = this.connect().join(name);
        this.presence.set(sid, ch);
        ch.here((m) => h.here?.(m))
            .joining((m) => h.joining?.(m))
            .leaving((m) => h.leaving?.(m))
            .listenForWhisper('heartbeat', (payload) => {
                const r = heartbeatSchema.safeParse(payload);
                if (r.success) h.heartbeat?.(r.data);
                else this.deps.onInvalid?.('client-heartbeat', r.error.issues);
            });
        ch.subscribed(() => h.subscribed?.());
        ch.error((e) => h.error?.(e));
        return () => {
            this.presence.delete(sid);
            this.echo?.leave(name);
        };
    }

    /** Sends a `client-heartbeat` whisper on the presence channel. */
    whisper(sid: string, payload: HeartbeatPayload): boolean {
        const ch = this.presence.get(sid);
        if (!ch || this.state !== 'connected') return false;
        try {
            ch.whisper('heartbeat', payload as unknown as Record<string, unknown>);
            return true;
        } catch {
            return false;
        }
    }

    /** Called on online / visibilitychange / pageshow: nudge the socket if it is not connected. */
    reconnect(): void {
        if (this.echo && this.state !== 'connected' && this.state !== 'connecting') this.echo.connector.pusher.connect();
    }

    disconnect(): void {
        this.echo?.disconnect();
        this.echo = null;
        this.presence.clear();
        this.setState('disconnected');
    }

    private on<S extends z.ZodType>(ch: ChannelLike, event: string, schema: S, cb?: (v: z.infer<S>) => void): void {
        if (!cb) return;
        ch.listen(event, (payload) => {
            const r = schema.safeParse(payload);
            if (r.success) cb(r.data);
            else this.deps.onInvalid?.(event, r.error.issues);
        });
    }

    private setState(s: SocketState): void {
        if (s === this.state) return;
        this.state = s;
        for (const l of this.listeners) l(s);
    }
}

/** Reads the runtime config rendered into the shell (06-Deployment §4). */
export function readShellConfig(doc: Pick<Document, 'getElementById'> | undefined = globalThis.document): RealtimeConfig | null {
    const el = doc?.getElementById('stagecue-config');
    if (!el?.textContent) return null;
    try {
        const raw = JSON.parse(el.textContent) as { reverb?: { key: string; host: string; port: number; scheme: string }; heartbeatMode?: string; staleMs?: number };
        if (!raw.reverb?.key) return null;
        return {
            key: raw.reverb.key,
            host: raw.reverb.host,
            port: Number(raw.reverb.port),
            scheme: raw.reverb.scheme,
            heartbeatMode: raw.heartbeatMode === 'http' ? 'http' : 'whisper',
            staleMs: Number(raw.staleMs ?? 10_000),
        };
    } catch {
        return null;
    }
}
