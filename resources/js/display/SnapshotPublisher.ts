// LLD §6.3 — Display → server snapshots. One request in flight, latest wins, every ack kept.
import type { Ack } from '@/core/types';
import { ApiError, backoffDelay, type SnapshotPayload } from '@/transport/ApiClient';

export const REPUBLISH_MS = 30_000;
export const MAX_ACKS = 50;

export interface SnapshotPublisherDeps {
    /** Builds the snapshot of the CURRENT state (without acks). */
    build: () => Omit<SnapshotPayload, 'acks'>;
    post: (body: SnapshotPayload) => Promise<unknown>;
    /** False while there is no session (local-only mode). */
    enabled: () => boolean;
    onAuthLoss?: (error: ApiError) => void;
    onError?: (error: unknown) => void;
    setTimeout?: (fn: () => void, ms: number) => unknown;
    clearTimeout?: (h: unknown) => void;
    setInterval?: (fn: () => void, ms: number) => unknown;
    clearInterval?: (h: unknown) => void;
    random?: () => number;
}

export class SnapshotPublisher {
    private inFlight = false;
    private dirty = false;
    private pendingAcks: Ack[] = [];
    private failures = 0;
    private retryTimer: unknown = null;
    private periodic: unknown = null;
    /** Set on auth loss: hold everything until the session is replaced and flush() is called. */
    private halted = false;

    constructor(private readonly deps: SnapshotPublisherDeps) {}

    get busy(): boolean {
        return this.inFlight;
    }

    get queuedAcks(): number {
        return this.pendingAcks.length;
    }

    /** Requests a publish (optionally carrying an ack). Coalesced with any request in flight. */
    publishNow(ack?: Ack): void {
        if (ack) this.pendingAcks.push(ack);
        if (!this.deps.enabled() || this.halted) return; // acks wait for the session (they are re-sent on flush)
        if (this.inFlight || this.retryTimer !== null) {
            this.dirty = true;
            return;
        }
        void this.send();
    }

    /** online / socket reconnect: send right away instead of waiting for the back-off. */
    flush(): void {
        if (this.retryTimer !== null) {
            (this.deps.clearTimeout ?? ((h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>)))(this.retryTimer);
            this.retryTimer = null;
        }
        this.failures = 0;
        this.halted = false;
        this.publishNow();
    }

    /** Periodic re-publish (drift correction and liveness of the cached state). */
    start(): void {
        if (this.periodic !== null) return;
        this.periodic = (this.deps.setInterval ?? ((fn, ms) => globalThis.setInterval(fn, ms)))(() => this.publishNow(), REPUBLISH_MS);
    }

    stop(): void {
        if (this.periodic !== null) (this.deps.clearInterval ?? ((h) => globalThis.clearInterval(h as ReturnType<typeof setInterval>)))(this.periodic);
        if (this.retryTimer !== null) (this.deps.clearTimeout ?? ((h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>)))(this.retryTimer);
        this.periodic = this.retryTimer = null;
    }

    private async send(): Promise<void> {
        this.inFlight = true;
        this.dirty = false;
        const acks = this.pendingAcks.splice(0, MAX_ACKS);
        let retry = false;
        try {
            await this.deps.post({ ...this.deps.build(), acks });
            this.failures = 0;
        } catch (error) {
            if (error instanceof ApiError && error.isAuthLoss) {
                this.pendingAcks.unshift(...acks);
                this.halted = true;
                this.deps.onAuthLoss?.(error);
            } else if (error instanceof ApiError && !error.retryable) {
                this.deps.onError?.(error); // a malformed snapshot will not get better: drop it
            } else {
                this.pendingAcks.unshift(...acks);
                this.failures++;
                retry = true;
                this.deps.onError?.(error);
            }
        } finally {
            this.inFlight = false;
        }
        if (retry) {
            const delay = backoffDelay(this.failures - 1, this.deps.random);
            this.retryTimer = (this.deps.setTimeout ?? ((fn, ms) => globalThis.setTimeout(fn, ms)))(() => {
                this.retryTimer = null;
                this.publishNow();
            }, delay);
        } else if (this.dirty || this.pendingAcks.length > 0) {
            this.publishNow();
        }
    }
}
