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
    /** A28: in the session's presence channel right now (the app is open and connected). */
    online?: boolean;
}

export type SessionPhase = 'offline' | 'connecting' | 'ready' | 'error';

export interface DisplaySessionSink {
    onPhase(phase: SessionPhase, detail?: string): void;
    onSession(info: { sessionId: string; displayName: string } | null): void;
    onPairing(p: DisplayPairing | null): void;
    /** A28: every paired phone, oldest first (empty when none). */
    onControllers(list: DisplayController[]): void;
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
    /** A24: the logged-in account. New sessions are opened under it; a stored session from another account is replaced. */
    account?: () => { id: number; token: string } | null;
    online?: () => boolean;
    monoNow?: () => number;
    wallNow?: () => number;
    setTimeout?: (fn: () => void, ms: number) => unknown;
    clearTimeout?: (h: unknown) => void;
    setInterval?: (fn: () => void, ms: number) => unknown;
    clearInterval?: (h: unknown) => void;
}

/** A28: the paired phones from GET /sessions/{sid} (older servers send only `controller`). */
function controllersOf(info: { controller: { id: string; name: string } | null; controllers?: Array<{ id: string; name: string }> }): DisplayController[] {
    const list = info.controllers ?? (info.controller ? [info.controller] : []);
    return list.map((c) => ({ id: c.id, name: c.name }));
}

export class DisplaySession {
    private creds: DeviceCredentials | null = null;
    private rt: RealtimeClient | null = null;
    private heartbeat: Heartbeat | null = null;
    private csm: ConnectionStateMachine | null = null;
    private controllers: DisplayController[] = [];
    /** Device ids currently in the presence channel. */
    private present = new Set<string>();
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

    /** Unpairs one phone (A28), or every phone when no id is given. */
    async revokeController(deviceId?: string): Promise<void> {
        const sid = this.sessionId;
        if (!sid) return;
        try {
            if (deviceId) {
                await this.deps.api.revokeControllerDevice(sid, deviceId);
                this.setControllers(this.controllers.filter((c) => c.id !== deviceId));
            } else {
                await this.deps.api.revokeController(sid);
                this.setControllers([]);
            }
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
                    // A24: a session opened under another account (or before accounts) can't pair this team's phones.
                    const account = this.deps.account?.();
                    if (account && info.session.accountId !== account.id) throw new ApiError(403, 'ACCOUNT_MISMATCH', 'Session belongs to another account', false);
                    config = info.realtime;
                    this.setControllers(controllersOf(info));
                    this.deps.sink.onSession({ sessionId: info.session.id, displayName: info.session.displayName });
                    // A28: a code (with its QR, which only a fresh code has) is always on offer for another phone.
                    await this.regeneratePairing();
                } catch (error) {
                    // 401/403/404/410: the session is gone. Start a new one and KEEP the local presentation state.
                    if (!(error instanceof ApiError && error.isAuthLoss)) throw error;
                    this.creds = null;
                    await this.deps.devices.clear().catch(() => undefined);
                }
            }
            if (!this.creds) {
                const created = await this.deps.api.createSession(this.deps.displayName ?? 'Display', this.deps.account?.()?.token ?? null);
                this.creds = { role: 'display', deviceId: created.device.id, sessionId: created.session.id, token: created.token, name: created.session.displayName, sessionName: created.session.displayName };
                await this.deps.devices.set(this.creds).catch(() => undefined);
                config = created.realtime;
                this.setControllers([]);
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
            online: this.deps.online,
            postHeartbeat: (s, b) => this.deps.api.heartbeat(s, b),
            monoNow: this.deps.monoNow,
            wallNow: this.deps.wallNow,
            setInterval: this.deps.setInterval,
            clearInterval: this.deps.clearInterval,
        });
        this.heartbeat = heartbeat;
        const csm = new ConnectionStateMachine({
            peerAgeMs: () => (this.controllers.length ? heartbeat.peerAgeMs() : Infinity),
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
                    if (!this.controllers.some((c) => c.id === p.deviceId)) this.setControllers([...this.controllers, { id: p.deviceId, name: p.name }]);
                    heartbeat.seen();
                    // D11/HLD §12: the used code is gone; a fresh one is shown for re-pairing.
                    void this.regeneratePairing();
                },
                controllerRevoked: (p) => {
                    if (this.controllers.some((c) => c.id === p.deviceId)) this.setControllers(this.controllers.filter((c) => c.id !== p.deviceId));
                },
                sessionEnded: () => void this.restart(),
                peerHeartbeat: (p) => heartbeat.receive({ role: p.role, revision: p.revision, presentationId: p.presentationId ?? null, sentAt: p.sentAt }),
                subscribed: () => this.deps.publisher.publishNow(),
                error: (e) => this.deps.sink.onPhase('error', `Channel authorisation failed (${JSON.stringify(e)})`),
            }),
            rt.joinPresence(sid, {
                here: (members) => {
                    this.present = new Set(members.filter((m) => m.role === 'controller').map((m) => m.id));
                    if (this.present.size) heartbeat.seen();
                    this.setControllers(this.controllers);
                },
                joining: (m) => {
                    if (m.role !== 'controller') return;
                    this.present.add(m.id);
                    heartbeat.seen();
                    this.setControllers(this.controllers);
                },
                leaving: (m) => {
                    if (this.present.delete(m.id)) this.setControllers(this.controllers);
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
            const due = this.socket !== 'connected' || now - this.lastPoll >= PAIRING_POLL_MS;
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
            const list = controllersOf(info);
            const ids = (l: DisplayController[]) => l.map((c) => c.id).join(',');
            if (ids(list) !== ids(this.controllers)) {
                if (list.some((c) => !this.controllers.some((o) => o.id === c.id))) this.heartbeat?.seen();
                this.setControllers(list);
            }
            if (!info.pairing || info.pairing.code !== this.pairing?.code) await this.regeneratePairing();
        } catch (error) {
            this.handleError(error);
        }
    }

    private async restart(): Promise<void> {
        this.teardown();
        this.creds = null;
        this.setControllers([]);
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
        if (this.pairing) {
            const ms = Math.max(1_000, this.pairing.expiresAt - (this.deps.wallNow ?? Date.now)());
            const code = this.pairing.code;
            // Auto-regenerate on expiry (T6.6), so another phone can always be added (A28).
            this.schedule(() => {
                if (this.pairing?.code === code) void this.regeneratePairing();
            }, ms);
        }
    }

    private setControllers(list: DisplayController[]): void {
        this.controllers = list.map((c) => ({ id: c.id, name: c.name, online: this.present.has(c.id) }));
        this.deps.sink.onControllers(this.controllers);
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
