// LLD §6.4 — peer liveness. Whisper mode: every 3 s, lost after 9 s. HTTP fallback: 5 s / 15 s.
import type { DeviceRole, HeartbeatPayload } from '@/core/types';

export type HeartbeatMode = 'whisper' | 'http';

export const HEARTBEAT = {
    whisper: { intervalMs: 3_000, lostAfterMs: 9_000 },
    http: { intervalMs: 5_000, lostAfterMs: 15_000 },
} as const;

export interface PeerSignal {
    role: DeviceRole;
    revision: number | null;
    presentationId?: string | null;
    sentAt: number;
}

export interface HeartbeatDeps {
    mode: HeartbeatMode;
    sessionId: string;
    role: DeviceRole;
    deviceId: string;
    /** What we are looking at (revision gap detection on the peer). */
    current: () => { revision: number | null; presentationId: string | null };
    whisper: (sid: string, payload: HeartbeatPayload) => boolean;
    postHeartbeat: (sid: string, body: { revision: number | null; presentationId: string | null }) => Promise<unknown>;
    monoNow?: () => number;
    wallNow?: () => number;
    setInterval?: (fn: () => void, ms: number) => unknown;
    clearInterval?: (h: unknown) => void;
    onPeer?: (signal: PeerSignal) => void;
}

export class Heartbeat {
    private timer: unknown = null;
    private lastPeerMono = -Infinity;
    private readonly monoNow: () => number;
    private readonly wallNow: () => number;

    constructor(private readonly deps: HeartbeatDeps) {
        this.monoNow = deps.monoNow ?? (() => globalThis.performance.now());
        this.wallNow = deps.wallNow ?? (() => Date.now());
    }

    get intervalMs(): number {
        return HEARTBEAT[this.deps.mode].intervalMs;
    }

    get lostAfterMs(): number {
        return HEARTBEAT[this.deps.mode].lostAfterMs;
    }

    start(): void {
        if (this.timer !== null) return;
        this.beat();
        const si = this.deps.setInterval ?? ((fn, ms) => globalThis.setInterval(fn, ms));
        this.timer = si(() => this.beat(), this.intervalMs);
    }

    stop(): void {
        if (this.timer === null) return;
        (this.deps.clearInterval ?? ((h) => globalThis.clearInterval(h as ReturnType<typeof setInterval>)))(this.timer);
        this.timer = null;
    }

    /** Sends one heartbeat now. */
    beat(): void {
        const { revision, presentationId } = this.deps.current();
        if (this.deps.mode === 'whisper') {
            this.deps.whisper(this.deps.sessionId, { v: 1, role: this.deps.role, deviceId: this.deps.deviceId, presentationId, revision, sentAt: this.wallNow() });
        } else {
            void this.deps.postHeartbeat(this.deps.sessionId, { revision, presentationId }).catch(() => undefined);
        }
    }

    /** Feed incoming whispers / `peer.heartbeat` events / presence joins here. Own-role signals are ignored. */
    receive(signal: PeerSignal): void {
        if (signal.role === this.deps.role) return;
        this.lastPeerMono = this.monoNow();
        this.deps.onPeer?.(signal);
    }

    /** Marks the peer as seen without a revision (e.g. a presence `here`/`joining`). */
    seen(): void {
        this.lastPeerMono = this.monoNow();
    }

    /** Milliseconds since the peer was last heard from (Infinity if never). */
    peerAgeMs(): number {
        return this.monoNow() - this.lastPeerMono;
    }
}
