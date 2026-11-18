// T6.1 — typed fetch wrapper for the StageCue API (04 §1).
import type { Ack, CommandRequest, Computed, DomainEvent, PresentationState } from '@/core/types';
import type { ServerClock } from './ServerClock';

export interface RealtimeConfig {
    key: string | null;
    host: string | null;
    port: number;
    scheme: string;
    heartbeatMode: 'whisper' | 'http';
    staleMs: number;
}

export interface PairingInfo {
    code: string;
    token?: string;
    expiresAt: number;
    url?: string;
}

export interface CreateSessionResponse {
    session: { id: string; displayName: string; status: string; accountId?: number | null };
    device: { id: string; role: 'display' };
    token: string;
    pairing: Required<PairingInfo>;
    realtime: RealtimeConfig;
    serverTime: number;
}

export interface SessionInfo {
    session: { id: string; displayName: string; status: string; accountId?: number | null };
    device: { id: string; role: 'display' | 'controller' };
    controller: { id: string; name: string; pairedAt: number | null } | null;
    pairing: PairingInfo | null;
    realtime: RealtimeConfig;
    serverTime: number;
}

export interface PairResponse {
    session: { id: string; displayName: string };
    device: { id: string; role: 'controller' };
    token: string;
    realtime: RealtimeConfig;
    serverTime: number;
}

export interface CommandResponse {
    commandId: string;
    seq: number;
    relayedAt: number;
    status: 'pending' | 'relayed' | 'applied' | 'rejected' | 'duplicate';
    duplicate?: boolean;
    resultCode?: string | null;
}

export interface SnapshotPayload {
    v: 1;
    presentationId: string;
    revision: number;
    capturedAtWall: number;
    state: PresentationState;
    computed: Computed;
    lastEvents: DomainEvent[];
    acks: Ack[];
}

export class ApiError extends Error {
    constructor(
        public readonly status: number,
        public readonly code: string,
        message: string,
        public readonly retryable: boolean,
        public readonly details?: unknown,
    ) {
        super(message);
        this.name = 'ApiError';
    }

    /** Credentials are gone (missing/expired/revoked token, ended session, not a member). */
    get isAuthLoss(): boolean {
        return this.status === 401 || this.status === 403 || this.status === 410 || this.code === 'SESSION_NOT_FOUND';
    }
}

export interface ApiClientDeps {
    baseUrl?: string;
    token?: () => string | null;
    fetch?: typeof fetch;
    serverClock?: ServerClock;
    wallNow?: () => number;
    timeoutMs?: number;
}

export const DEFAULT_TIMEOUT_MS = 8_000;

export class ApiClient {
    private readonly f: typeof fetch;
    private readonly wallNow: () => number;

    constructor(private readonly deps: ApiClientDeps = {}) {
        this.f = deps.fetch ?? ((...args) => globalThis.fetch(...args));
        this.wallNow = deps.wallNow ?? (() => Date.now());
    }

    async request<T>(method: string, path: string, body?: unknown, opts: { auth?: boolean; bearer?: string | null } = {}): Promise<T> {
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        const token = opts.bearer !== undefined ? opts.bearer : opts.auth === false ? null : (this.deps.token?.() ?? null);
        if (token) headers.Authorization = `Bearer ${token}`;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.deps.timeoutMs ?? DEFAULT_TIMEOUT_MS);
        const sent = this.wallNow();
        let res: Response;
        try {
            res = await this.f(`${this.deps.baseUrl ?? ''}/api${path}`, {
                method,
                headers,
                body: body === undefined ? undefined : JSON.stringify(body),
                signal: controller.signal,
                credentials: 'omit',
            });
        } catch (error) {
            const aborted = (error as { name?: string })?.name === 'AbortError';
            throw new ApiError(0, aborted ? 'TIMEOUT' : 'NETWORK', aborted ? 'The server did not answer in time.' : 'The server could not be reached.', true);
        } finally {
            clearTimeout(timer);
        }

        const serverTime = Number(res.headers.get('X-Server-Time'));
        if (res.headers.has('X-Server-Time')) this.deps.serverClock?.sample(sent, this.wallNow(), serverTime);

        if (res.status === 204) return undefined as T;
        const json = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string; retryable?: boolean; errors?: unknown } } | null;
        if (!res.ok) {
            const e = json?.error;
            throw new ApiError(res.status, e?.code ?? `HTTP_${res.status}`, e?.message ?? res.statusText, e?.retryable ?? res.status >= 500, e?.errors);
        }
        return json as T;
    }

    // ---- endpoints (04 §1) ----
    /** A24: needs the account token of the logged-in team. */
    createSession(displayName: string, accountToken: string | null = null) {
        return this.request<CreateSessionResponse>('POST', '/sessions', { displayName }, { bearer: accountToken });
    }
    getSession(sid: string) {
        return this.request<SessionInfo>('GET', `/sessions/${sid}`);
    }
    endSession(sid: string) {
        return this.request<void>('DELETE', `/sessions/${sid}`);
    }
    regeneratePairing(sid: string) {
        return this.request<{ pairing: Required<PairingInfo> }>('POST', `/sessions/${sid}/pairing/regenerate`);
    }
    revokeController(sid: string) {
        return this.request<void>('DELETE', `/sessions/${sid}/controller`);
    }
    leave(sid: string) {
        return this.request<void>('DELETE', `/sessions/${sid}/controller/self`);
    }
    /** A24: the phone's account must be the one the Display is logged in to. */
    pair(input: { code: string } | { token: string }, deviceName: string, accountToken: string | null = null) {
        return this.request<PairResponse>('POST', '/pairings', { ...input, deviceName }, { bearer: accountToken });
    }
    sendCommand(sid: string, command: CommandRequest) {
        return this.request<CommandResponse>('POST', `/sessions/${sid}/commands`, command);
    }
    postSnapshot(sid: string, snapshot: SnapshotPayload) {
        return this.request<{ accepted: true; stored: boolean }>('POST', `/sessions/${sid}/snapshots`, snapshot);
    }
    getState(sid: string) {
        return this.request<{ snapshot: Omit<SnapshotPayload, 'acks'> | null; storedAt: number | null }>('GET', `/sessions/${sid}/state`);
    }
    heartbeat(sid: string, body: { revision: number | null; presentationId: string | null }) {
        return this.request<void>('POST', `/sessions/${sid}/heartbeat`, body);
    }
    time() {
        return this.request<{ serverTime: number }>('GET', '/time', undefined, { auth: false });
    }
}

/** Exponential back-off 1, 2, 4, 8, 15 s (max) with ±20% jitter (LLD §6.4). */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
    const base = Math.min(15_000, 1_000 * 2 ** Math.max(0, attempt));
    return Math.round(base * (0.8 + random() * 0.4));
}

/** Retries retryable ApiErrors with jittered back-off. Non-retryable errors are thrown at once. */
export async function withRetry<T>(
    fn: () => Promise<T>,
    opts: { retries?: number; sleep?: (ms: number) => Promise<void>; random?: () => number; shouldStop?: () => boolean } = {},
): Promise<T> {
    const retries = opts.retries ?? 5;
    const sleep = opts.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
    for (let attempt = 0; ; attempt++) {
        try {
            return await fn();
        } catch (error) {
            const retryable = error instanceof ApiError && error.retryable;
            if (!retryable || attempt >= retries || opts.shouldStop?.()) throw error;
            await sleep(backoffDelay(attempt, opts.random));
        }
    }
}
