// LLD §5.5 (connect step), §6.2–6.4 — the Display's network side. Everything here is optional:
// the presentation keeps running if any of it fails (A7 local-only mode).
import { ApiError, backoffDelay, type ApiClient, type PairingInfo, type RealtimeConfig } from '@/transport/ApiClient';
import { ConnectionStateMachine, type ConnectionStatus } from '@/transport/ConnectionStateMachine';
import { Heartbeat } from '@/transport/Heartbeat';
import type { RealtimeClient, SocketState } from '@/transport/RealtimeClient';
import type { DeviceCredentials } from '@/storage/db';
import type { DeviceRepo } from '@/storage/DeviceRepo';
import type { MetaRepo } from '@/storage/MetaRepo';
import type { DisplayRuntime } from './DisplayRuntime';
import type { SnapshotPublisher } from './SnapshotPublisher';

export const PAIRING_POLL_MS = 30_000;
/** While the live channel is down, re-check the session this often (pair/unpair without a reload). */
export const FALLBACK_POLL_MS = 5_000;
export const META_REALTIME = 'realtime';

export interface DisplayPairing {
    code: string;
    url: string | null;
    expiresAt: number;
}

export interface DisplayController {
    id: string;
    name: string;
}

export type SessionPhase = 'offline' | 'connecting' | 'ready' | 'error';

export interface DisplaySessionSink {
    onPhase(phase: SessionPhase, detail?: string): void;
    onSession(info: { sessionId: string; displayName: string } | null): void;
    onPairing(p: DisplayPairing | null): void;
    onController(c: DisplayController | null): void;
    onConnection(s: ConnectionStatus): void;
    onSocket?(s: SocketState): void;
}

export interface DisplaySessionDeps {
    runtime: DisplayRuntime;
    publisher: SnapshotPublisher;
    api: ApiClient;
    devices: DeviceRepo;
    meta?: MetaRepo | null;
    makeRealtime: (config: RealtimeConfig, token: () => string | null) => RealtimeClient;
    /** Realtime config rendered into the shell (used until an API response provides one). */
    shellConfig?: RealtimeConfig | null;
    sink: DisplaySessionSink;
    displayName?: string;
    online?: () => boolean;
    monoNow?: () => number;
    wallNow?: () => number;
    setTimeout?: (fn: () => void, ms: number) => unknown;
    clearTimeout?: (h: unknown) => void;
    setInterval?: (fn: () => void, ms: number) => unknown;
    clearInterval?: (h: unknown) => void;
}

export class DisplaySession {
    private creds: DeviceCredentials | null = null;
    private rt: RealtimeClient | null = null;
    private heartbeat: Heartbeat | null = null;
    private csm: ConnectionStateMachine | null = null;
    private controller: DisplayController | null = null;
    private pairing: DisplayPairing | null = null;
    private cleanups: Array<() => void> = [];
    private timers = new Set<unknown>();
    private intervals = new Set<unknown>();
    private attempt = 0;
    private starting: Promise<void> | null = null;
    private stopped = false;
    private socket: SocketState = 'initialized';
    private lastPoll = 0;

    constructor(private readonly deps: DisplaySessionDeps) {}

    get sessionId(): string | null {
        return this.creds?.sessionId ?? null;
    }

    get token(): string | null {
        return this.creds?.token ?? null;
    }

    get isReady(): boolean {
        return this.rt !== null && this.creds !== null;
    }

    /** Creates or resumes the session and subscribes. Safe to call again (e.g. on `online`). */
    start(): Promise<void> {
        this.stopped = false;
        if (this.isReady) return Promise.resolve();
        this.starting ??= this.connect().finally(() => (this.starting = null));
        return this.starting;
    }

    stop(): void {
        this.stopped = true;
        this.teardown();
        for (const t of this.timers) this.ct(t);
        this.timers.clear();
    }

    /** online / visibility / pageshow — reconnect what can be reconnected. */
    wake(): void {
        if (this.stopped) return;
        if (!this.isReady) void this.start();
        else {
            this.rt?.reconnect();
            this.deps.publisher.flush();
        }
    }

    async regeneratePairing(): Promise<void> {
        const sid = this.sessionId;
        if (!sid) return;
        try {
            const { pairing } = await this.deps.api.regeneratePairing(sid);
            this.setPairing(pairing);
        } catch (error) {
            this.handleError(error);
        }
    }

    async revokeController(): Promise<void> {
        const sid = this.sessionId;
        if (!sid) return;
        try {
            await this.deps.api.revokeController(sid);
            this.setController(null);
            await this.regeneratePairing();
        } catch (error) {
            this.handleError(error);
        }
    }

    // ---- connect -------------------------------------------------------------------------------

    private async connect(): Promise<void> {
        if (this.deps.online && !this.deps.online()) {
            this.deps.sink.onPhase('offline');
            return;
        }
        this.deps.sink.onPhase('connecting');
        try {
            const stored = await this.deps.devices.get().catch(() => null);
            let config: RealtimeConfig | null = null;
            if (stored?.role === 'display') {
                try {
                    this.creds = stored;
                    const info = await this.deps.api.getSession(stored.sessionId);
                    config = info.realtime;
                    this.setController(info.controller ? { id: info.controller.id, name: info.controller.name } : null);
                    this.deps.sink.onSession({ sessionId: info.session.id, displayName: info.session.displayName });
                    if (!info.controller) await this.regeneratePairing(); // only a fresh code comes with a QR token
                    else this.setPairing(null);
                } catch (error) {
                    // 401/403/404/410: the session is gone. Start a new one and KEEP the local presentation state.
                    if (!(error instanceof ApiError && error.isAuthLoss)) throw error;
                    this.creds = null;
                    await this.deps.devices.clear().catch(() => undefined);
                }
            }
            if (!this.creds) {
                const created = await this.deps.api.createSession(this.deps.displayName ?? 'Display');
                this.creds = { role: 'display', deviceId: created.device.id, sessionId: created.session.id, token: created.token, name: created.session.displayName, sessionName: created.session.displayName };
                await this.deps.devices.set(this.creds).catch(() => undefined);
                config = created.realtime;
                this.setController(null);
                this.setPairing(created.pairing);
                this.deps.sink.onSession({ sessionId: created.session.id, displayName: created.session.displayName });
            }
            config ??= this.deps.shellConfig ?? (await this.deps.meta?.get<RealtimeConfig>(META_REALTIME)) ?? null;
            if (!config?.key) throw new Error('No real-time configuration available');
            await this.deps.meta?.set(META_REALTIME, config).catch(() => undefined);
            if (this.stopped) return;
            this.subscribe(config);
            this.attempt = 0;
            this.deps.sink.onPhase('ready');
        } catch (error) {
            if (this.stopped) return;
            this.teardown();
            const detail = error instanceof Error ? error.message : String(error);
            this.deps.sink.onPhase('error', detail);
            // Retry with back-off; the presentation is unaffected meanwhile.
            this.schedule(() => void this.start(), backoffDelay(this.attempt++));
        }
    }

    private subscribe(config: RealtimeConfig): void {
        const creds = this.creds!;
        const sid = creds.sessionId;
        const rt = this.deps.makeRealtime(config, () => this.token);
        this.rt = rt;
        const heartbeat = new Heartbeat({
            mode: config.heartbeatMode,
            sessionId: sid,
            role: 'display',
            deviceId: creds.deviceId,
            current: () => ({ revision: this.deps.runtime.state.revision, presentationId: this.deps.runtime.state.presentationId }),
            whisper: (s, p) => rt.whisper(s, p),
            postHeartbeat: (s, b) => this.deps.api.heartbeat(s, b),
            monoNow: this.deps.monoNow,
            wallNow: this.deps.wallNow,
            setInterval: this.deps.setInterval,
            clearInterval: this.deps.clearInterval,
        });
        this.heartbeat = heartbeat;
        const csm = new ConnectionStateMachine({
            peerAgeMs: () => (this.controller ? heartbeat.peerAgeMs() : Infinity),
            lostAfterMs: heartbeat.lostAfterMs,
            online: this.deps.online,
            onChange: (s) => this.deps.sink.onConnection(s),
            setInterval: this.deps.setInterval,
            clearInterval: this.deps.clearInterval,
        });
        this.csm = csm;

        this.cleanups.push(
            rt.onConnectionState((s) => {
                const wasUp = this.socket === 'connected';
                this.socket = s;
                csm.setSocket(s);
                // Back online after a gap: catch up on anything (pair/unpair) missed meanwhile.
                if (s === 'connected' && !wasUp) void this.refreshSession();
                this.deps.sink.onSocket?.(s);
                if (s === 'connected') this.deps.publisher.flush();
            }),
            rt.subscribeDisplay(sid, {
                command: (env) => void this.deps.runtime.handleRemote(env),
                controllerPaired: (p) => {
                    this.setController({ id: p.deviceId, name: p.name });
                    heartbeat.seen();
                    // D11/HLD §12: the used code is gone; a fresh one is shown for re-pairing.
                    void this.regeneratePairing();
                },
                controllerRevoked: (p) => {
                    if (this.controller?.id === p.deviceId) {
                        this.setController(null);
                        void this.regeneratePairing();
                    }
                },
                sessionEnded: () => void this.restart(),
                peerHeartbeat: (p) => heartbeat.receive({ role: p.role, revision: p.revision, presentationId: p.presentationId ?? null, sentAt: p.sentAt }),
                subscribed: () => this.deps.publisher.publishNow(),
                error: (e) => this.deps.sink.onPhase('error', `Channel authorisation failed (${JSON.stringify(e)})`),
            }),
            rt.joinPresence(sid, {
                here: (members) => {
                    if (members.some((m) => m.role === 'controller')) heartbeat.seen();
                },
                joining: (m) => {
                    if (m.role === 'controller') heartbeat.seen();
                },
                heartbeat: (p) => heartbeat.receive({ role: p.role, revision: p.revision, presentationId: p.presentationId, sentAt: p.sentAt }),
            }),
            () => rt.disconnect(),
        );
        rt.connect();
        heartbeat.start();
        csm.start();
        this.deps.publisher.start();
        // Publish now, not only on subscribe: with the live channel down, GET /state is the
        // phone's only view of this display (A22).
        this.deps.publisher.publishNow();

        // While the live channel is down: every 5 s. Otherwise, while nobody is paired: every 30 s
        // (A17: a consumed or rotated code is noticed).
        const poll = this.si(() => {
            const now = (this.deps.monoNow ?? (() => performance.now()))();
            const due = this.socket !== 'connected' || (!this.controller && now - this.lastPoll >= PAIRING_POLL_MS);
            if (due) void this.refreshSession();
        }, FALLBACK_POLL_MS);
        this.intervals.add(poll);
    }

    /** Re-reads the session over HTTP: who is paired, and whether the code is still the one shown. */
    async refreshSession(): Promise<void> {
        const sid = this.sessionId;
        if (!sid) return;
        this.lastPoll = (this.deps.monoNow ?? (() => performance.now()))();
        try {
            const info = await this.deps.api.getSession(sid);
            const c = info.controller ? { id: info.controller.id, name: info.controller.name } : null;
            if (c?.id !== this.controller?.id) {
                this.setController(c);
                if (c) this.heartbeat?.seen();
            }
            if (c) {
                if (this.pairing && !this.pairing.url) this.setPairing(null);
            } else if (!info.pairing || info.pairing.code !== this.pairing?.code) {
                await this.regeneratePairing();
            }
        } catch (error) {
            this.handleError(error);
        }
    }

    private async restart(): Promise<void> {
        this.teardown();
        this.creds = null;
        this.setController(null);
        this.setPairing(null);
        this.deps.sink.onSession(null);
        await this.deps.devices.clear().catch(() => undefined);
        if (!this.stopped) await this.start();
    }

    /** Called by the SnapshotPublisher / API failures. Auth loss → new session, local state kept. */
    handleError(error: unknown): void {
        if (error instanceof ApiError && error.isAuthLoss && !this.stopped) void this.restart();
    }

    private setPairing(p: PairingInfo | null): void {
        this.pairing = p ? { code: p.code, url: p.url ?? null, expiresAt: p.expiresAt } : null;
        this.deps.sink.onPairing(this.pairing);
        if (this.pairing && !this.controller) {
            const ms = Math.max(1_000, this.pairing.expiresAt - (this.deps.wallNow ?? Date.now)());
            const code = this.pairing.code;
            // Auto-regenerate on expiry while no controller is paired (T6.6).
            this.schedule(() => {
                if (!this.controller && this.pairing?.code === code) void this.regeneratePairing();
            }, ms);
        }
    }

    private setController(c: DisplayController | null): void {
        this.controller = c;
        this.deps.sink.onController(c);
        this.csm?.evaluate();
    }

    private teardown(): void {
        this.heartbeat?.stop();
        this.csm?.stop();
        this.deps.publisher.stop();
        for (const fn of this.cleanups.splice(0)) fn();
        for (const i of this.intervals) (this.deps.clearInterval ?? ((h) => globalThis.clearInterval(h as ReturnType<typeof setInterval>)))(i);
        this.intervals.clear();
        this.rt = null;
        this.heartbeat = null;
        this.csm = null;
    }

    private schedule(fn: () => void, ms: number): void {
        const h = (this.deps.setTimeout ?? ((f, t) => globalThis.setTimeout(f, t)))(() => {
            this.timers.delete(h);
            fn();
        }, ms);
        this.timers.add(h);
    }

    private ct(h: unknown): void {
        (this.deps.clearTimeout ?? ((x) => globalThis.clearTimeout(x as ReturnType<typeof setTimeout>)))(h);
    }

    private si(fn: () => void, ms: number): unknown {
        return (this.deps.setInterval ?? ((f, t) => globalThis.setInterval(f, t)))(fn, ms);
    }
}
