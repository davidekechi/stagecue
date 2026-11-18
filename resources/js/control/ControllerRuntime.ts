// LLD §4.6, §6.6, HLD §11 — the Controller: intent commands out, snapshots in, never state out.
import { DESTRUCTIVE, makeCommand } from '@/core/commands';
import type { CommandName, CommandPayloads, CommandRequest, StateEvent } from '@/core/types';
import { ApiError, type ApiClient, type RealtimeConfig } from '@/transport/ApiClient';
import { ConnectionStateMachine, type ConnectionStatus } from '@/transport/ConnectionStateMachine';
import { Heartbeat } from '@/transport/Heartbeat';
import type { RealtimeClient, SocketState } from '@/transport/RealtimeClient';
import type { DeviceCredentials } from '@/storage/db';
import type { DeviceRepo } from '@/storage/DeviceRepo';
import type { MetaRepo } from '@/storage/MetaRepo';
import { CommandOutbox, type PendingCommand, type Terminal } from './CommandOutbox';
import type { Mirror } from './MirrorClock';
import { META_REALTIME } from './pairDevice';

export type UnpairReason = 'none' | 'left' | 'revoked' | 'replaced' | 'ended';
export const GAP_WAIT_MS = 1_000;

export interface ControllerSink {
    onMirror(m: Mirror | null): void;
    onOutbox(entries: PendingCommand[]): void;
    onConnection(s: ConnectionStatus): void;
    onSession(info: { sessionName: string; deviceName: string }): void;
    onUnpaired(reason: UnpairReason): void;
    onSocket?(s: SocketState): void;
}

export interface ControllerRuntimeDeps {
    api: ApiClient;
    devices: DeviceRepo;
    meta?: MetaRepo | null;
    makeRealtime: (config: RealtimeConfig, token: () => string | null) => RealtimeClient;
    shellConfig?: RealtimeConfig | null;
    sink: ControllerSink;
    online?: () => boolean;
    monoNow?: () => number;
    wallNow?: () => number;
    setTimeout?: (fn: () => void, ms: number) => unknown;
    clearTimeout?: (h: unknown) => void;
    setInterval?: (fn: () => void, ms: number) => unknown;
    clearInterval?: (h: unknown) => void;
    log?: (msg: string, data?: unknown) => void;
}

export class ControllerRuntime {
    private creds: DeviceCredentials | null = null;
    private rt: RealtimeClient | null = null;
    private heartbeat: Heartbeat | null = null;
    private csm: ConnectionStateMachine | null = null;
    private cleanups: Array<() => void> = [];
    private _mirror: Mirror | null = null;
    private syncId: string | null = null;
    private socket: SocketState = 'initialized';
    private gapTimer: unknown = null;
    private stopped = false;
    readonly outbox: CommandOutbox;
    private readonly monoNow: () => number;

    constructor(private readonly deps: ControllerRuntimeDeps) {
        this.monoNow = deps.monoNow ?? (() => globalThis.performance.now());
        this.outbox = new CommandOutbox({
            post: (req) => this.deps.api.sendCommand(this.creds!.sessionId, req),
            onChange: (e) => this.deps.sink.onOutbox(e),
            onAuthLoss: () => void this.lostPairing('revoked'),
            setTimeout: deps.setTimeout,
            clearTimeout: deps.clearTimeout,
        });
    }

    get mirror(): Mirror | null {
        return this._mirror;
    }

    get token(): string | null {
        return this.creds?.token ?? null;
    }

    get sessionId(): string | null {
        return this.creds?.sessionId ?? null;
    }

    get connection(): ConnectionStatus {
        return this.csm?.status ?? { server: 'offline', peer: 'disconnected' };
    }

    /** Live buttons are enabled only while the Display is reachable (FR-C6). */
    get canSend(): boolean {
        const c = this.connection;
        return c.server === 'online' && (c.peer === 'connected' || c.peer === 'synchronizing');
    }

    async start(): Promise<void> {
        this.stopped = false;
        this.creds = await this.deps.devices.get().catch(() => null);
        if (!this.creds) {
            this.deps.sink.onUnpaired('none');
            return;
        }
        this.deps.sink.onSession({ sessionName: this.creds.sessionName ?? 'Display', deviceName: this.creds.name });
        let config: RealtimeConfig | null = null;
        try {
            const info = await this.deps.api.getSession(this.creds.sessionId);
            config = info.realtime;
            this.deps.sink.onSession({ sessionName: info.session.displayName, deviceName: this.creds.name });
        } catch (error) {
            if (error instanceof ApiError && error.isAuthLoss) return this.lostPairing(error.status === 410 ? 'ended' : 'revoked');
            // Offline: carry on with the cached config; the socket reconnects when it can.
        }
        config ??= (await this.deps.meta?.get<RealtimeConfig>(META_REALTIME).catch(() => undefined)) ?? this.deps.shellConfig ?? null;
        if (!config?.key || this.stopped) return;
        await this.deps.meta?.set(META_REALTIME, config).catch(() => undefined);
        this.subscribe(config);
    }

    stop(): void {
        this.stopped = true;
        this.teardown();
    }

    /** visibilitychange / online / pageshow (R11: mobile sockets die in the background). */
    wake(): void {
        if (this.stopped) return;
        if (!this.rt) void this.start();
        else this.rt.reconnect();
        this.csm?.evaluate();
    }

    /** Builds and sends an intent command with the revision the operator is looking at. */
    send<N extends CommandName>(name: N, payload: CommandPayloads[N]): Promise<Terminal> {
        const base = this._mirror?.state.revision ?? null;
        if (DESTRUCTIVE.has(name) && base === null) return Promise.resolve('rejected'); // needs a mirror (LLD §6.1)
        const req = makeCommand(name, payload, base, this.deps.wallNow?.() ?? Date.now()) as CommandRequest;
        return this.outbox.submit(req);
    }

    retry(commandId: string): Promise<Terminal> {
        return this.outbox.retry(commandId);
    }

    discard(commandId: string): void {
        this.outbox.discard(commandId);
    }

    /** Unpair this phone (FR-C9). */
    async unpair(): Promise<void> {
        const sid = this.sessionId;
        if (sid) await this.deps.api.leave(sid).catch(() => undefined);
        await this.lostPairing('left');
    }

    // ---- snapshots ------------------------------------------------------------------------------

    /** LLD §6.6 rules 2–4. Acks are processed whatever the revision. */
    applySnapshot(e: Pick<StateEvent, 'presentationId' | 'revision' | 'capturedAtWall' | 'state' | 'computed'> & { lastEvents?: StateEvent['lastEvents']; acks?: StateEvent['acks'] }, live = true): void {
        for (const ack of e.acks ?? []) {
            if (ack.commandId === this.syncId) this.finishSync();
            this.outbox.ack(ack);
        }
        const m = this._mirror;
        const newEpoch = !m || m.state.presentationId !== e.presentationId;
        if (!newEpoch && e.revision < m.state.revision) {
            this.deps.log?.('ignored a snapshot with an older revision', { have: m.state.revision, got: e.revision });
            return;
        }
        if (!newEpoch && e.revision === m.state.revision && !live) return; // a cached copy adds nothing
        this._mirror = {
            state: e.state,
            computed: e.computed,
            capturedAtWall: e.capturedAtWall,
            receivedAtMono: this.monoNow(),
            lastEvents: !newEpoch && e.revision === m.state.revision ? m.lastEvents : (e.lastEvents ?? []),
            live: live || (m?.live ?? false),
        };
        if (live && this.syncId === null) this.csm?.setSyncPending(false);
        this.deps.sink.onMirror(this._mirror);
    }

    // ---- connection -----------------------------------------------------------------------------

    private subscribe(config: RealtimeConfig): void {
        const creds = this.creds!;
        const sid = creds.sessionId;
        const rt = this.deps.makeRealtime(config, () => this.creds?.token ?? null);
        this.rt = rt;
        const heartbeat = new Heartbeat({
            mode: config.heartbeatMode,
            sessionId: sid,
            role: 'controller',
            deviceId: creds.deviceId,
            current: () => ({ revision: this._mirror?.state.revision ?? null, presentationId: this._mirror?.state.presentationId ?? null }),
            whisper: (s, p) => rt.whisper(s, p),
            postHeartbeat: (s, b) => this.deps.api.heartbeat(s, b),
            monoNow: this.deps.monoNow,
            wallNow: this.deps.wallNow,
            setInterval: this.deps.setInterval,
            clearInterval: this.deps.clearInterval,
            onPeer: (p) => this.checkGap(p.revision, p.presentationId ?? null),
        });
        this.heartbeat = heartbeat;
        const csm = new ConnectionStateMachine({
            peerAgeMs: () => heartbeat.peerAgeMs(),
            lostAfterMs: heartbeat.lostAfterMs,
            online: this.deps.online,
            onChange: (s) => this.deps.sink.onConnection(s),
            setInterval: this.deps.setInterval,
            clearInterval: this.deps.clearInterval,
        });
        this.csm = csm;

        this.cleanups.push(
            rt.onConnectionState((s) => {
                const was = this.socket;
                this.socket = s;
                csm.setSocket(s);
                this.deps.sink.onSocket?.(s);
                if (was === 'connected' && s !== 'connected') this.outbox.invalidateAwaiting();
            }),
            rt.subscribeControllers(sid, {
                state: (e) => this.applySnapshot(e),
                controllerRevoked: (p) => {
                    if (p.deviceId === creds.deviceId) void this.lostPairing(p.reason === 'replaced' ? 'replaced' : p.reason === 'session_ended' ? 'ended' : 'revoked');
                },
                sessionEnded: () => void this.lostPairing('ended'),
                peerHeartbeat: (p) => heartbeat.receive({ role: p.role, revision: p.revision, presentationId: p.presentationId ?? null, sentAt: p.sentAt }),
                subscribed: () => void this.syncHandshake(),
            }),
            rt.joinPresence(sid, {
                here: (members) => {
                    if (members.some((m) => m.role === 'display')) heartbeat.seen();
                },
                joining: (m) => {
                    if (m.role === 'display') heartbeat.seen();
                },
                heartbeat: (p) => heartbeat.receive({ role: p.role, revision: p.revision, presentationId: p.presentationId, sentAt: p.sentAt }),
            }),
            () => rt.disconnect(),
        );
        rt.connect();
        heartbeat.start();
        csm.start();
    }

    /** HLD §11 steps 3–6: paint the cached snapshot, then ask the Display for a fresh one. */
    private async syncHandshake(): Promise<void> {
        const sid = this.sessionId;
        if (!sid) return;
        this.csm?.setSyncPending(true);
        if (this._mirror) this._mirror = { ...this._mirror, live: false };
        try {
            const { snapshot } = await this.deps.api.getState(sid);
            if (snapshot) this.applySnapshot({ ...snapshot, acks: [] }, false);
        } catch (error) {
            if (error instanceof ApiError && error.isAuthLoss) return this.lostPairing('revoked');
        }
        await this.requestSync();
    }

    private async requestSync(): Promise<void> {
        const sid = this.sessionId;
        if (!sid) return;
        const req = makeCommand('SYNC_REQUEST', {}, this._mirror?.state.revision ?? null);
        this.syncId = req.commandId;
        try {
            await this.deps.api.sendCommand(sid, req as CommandRequest);
        } catch (error) {
            if (error instanceof ApiError && error.isAuthLoss) return this.lostPairing('revoked');
            this.syncId = null; // the Display may be unreachable; the heartbeat gap check will try again
        }
    }

    private finishSync(): void {
        this.syncId = null;
        this.csm?.setSyncPending(false);
    }

    /** 04 §3.3 — the Display is ahead and no state arrived within 1 s: ask for it. */
    private checkGap(revision: number | null, presentationId: string | null): void {
        const m = this._mirror;
        const behind = revision !== null && (!m || m.state.presentationId !== presentationId || revision > m.state.revision);
        if (!behind || this.gapTimer !== null) return;
        this.gapTimer = (this.deps.setTimeout ?? ((f, t) => globalThis.setTimeout(f, t)))(() => {
            this.gapTimer = null;
            const now = this._mirror;
            const stillBehind = revision !== null && (!now || now.state.presentationId !== presentationId || revision > now.state.revision);
            if (stillBehind && this.syncId === null) void this.requestSync();
        }, GAP_WAIT_MS);
    }

    private async lostPairing(reason: UnpairReason): Promise<void> {
        this.teardown();
        this.creds = null;
        this._mirror = null;
        await this.deps.devices.clear().catch(() => undefined);
        this.deps.sink.onMirror(null);
        this.deps.sink.onUnpaired(reason);
    }

    private teardown(): void {
        this.heartbeat?.stop();
        this.csm?.stop();
        for (const fn of this.cleanups.splice(0)) fn();
        if (this.gapTimer !== null) (this.deps.clearTimeout ?? ((h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>)))(this.gapTimer);
        this.gapTimer = null;
        this.rt = null;
        this.heartbeat = null;
        this.csm = null;
    }
}
