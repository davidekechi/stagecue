// LLD §6.4 — Server / peer connection indicators.
import type { SocketState } from './RealtimeClient';

export type ServerState = 'online' | 'offline';
export type PeerState = 'connected' | 'reconnecting' | 'synchronizing' | 'disconnected';

export interface ConnectionInputs {
    online: boolean;
    socket: SocketState;
    /** ms since the peer's last heartbeat (Infinity if never). */
    peerAgeMs: number;
    syncPending: boolean;
    /** 9 s (whisper) or 15 s (http). */
    lostAfterMs: number;
}

export interface ConnectionStatus {
    server: ServerState;
    peer: PeerState;
}

export const GIVE_UP_MS = 30_000;

export function computeConnection(i: ConnectionInputs): ConnectionStatus {
    const socketUp = i.socket === 'connected';
    const server: ServerState = i.online && socketUp ? 'online' : 'offline';
    let peer: PeerState;
    if (!i.online || !socketUp) peer = i.peerAgeMs < GIVE_UP_MS ? 'reconnecting' : 'disconnected';
    else if (i.syncPending) peer = 'synchronizing';
    else if (i.peerAgeMs <= i.lostAfterMs) peer = 'connected';
    else if (i.peerAgeMs <= GIVE_UP_MS) peer = 'reconnecting';
    else peer = 'disconnected';
    return { server, peer };
}

/** Re-evaluates the inputs every second (ages change with time) and reports changes. */
export class ConnectionStateMachine {
    private timer: unknown = null;
    private last: ConnectionStatus | null = null;
    private socket: SocketState = 'initialized';
    private syncPending = false;

    constructor(
        private readonly deps: {
            peerAgeMs: () => number;
            lostAfterMs: number;
            online?: () => boolean;
            onChange: (s: ConnectionStatus) => void;
            setInterval?: (fn: () => void, ms: number) => unknown;
            clearInterval?: (h: unknown) => void;
        },
    ) {}

    setSocket(s: SocketState): void {
        this.socket = s;
        this.evaluate();
    }

    setSyncPending(p: boolean): void {
        this.syncPending = p;
        this.evaluate();
    }

    get status(): ConnectionStatus {
        return this.last ?? this.compute();
    }

    start(): void {
        if (this.timer !== null) return;
        this.evaluate();
        this.timer = (this.deps.setInterval ?? ((fn, ms) => globalThis.setInterval(fn, ms)))(() => this.evaluate(), 1_000);
    }

    stop(): void {
        if (this.timer === null) return;
        (this.deps.clearInterval ?? ((h) => globalThis.clearInterval(h as ReturnType<typeof setInterval>)))(this.timer);
        this.timer = null;
    }

    evaluate(): ConnectionStatus {
        const s = this.compute();
        if (!this.last || s.server !== this.last.server || s.peer !== this.last.peer) {
            this.last = s;
            this.deps.onChange(s);
        }
        return s;
    }

    private compute(): ConnectionStatus {
        return computeConnection({
            online: this.deps.online ? this.deps.online() : (globalThis.navigator?.onLine ?? true),
            socket: this.socket,
            peerAgeMs: this.deps.peerAgeMs(),
            syncPending: this.syncPending,
            lostAfterMs: this.deps.lostAfterMs,
        });
    }
}
