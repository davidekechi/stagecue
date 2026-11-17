// LLD §5.3 — second-aligned tick scheduling with a visibility kick and a rAF watchdog.

export interface TickLoopDeps {
    nowEff: () => number;
    monoNow: () => number;
    onTick: () => void;
    onError?: (error: unknown) => void;
    setTimeout?: (fn: () => void, ms: number) => unknown;
    clearTimeout?: (handle: unknown) => void;
    requestAnimationFrame?: ((fn: () => void) => unknown) | null;
    cancelAnimationFrame?: ((handle: unknown) => void) | null;
    document?: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'> | null;
}

export const WATCHDOG_MS = 3_000;

export class TickLoop {
    private timer: unknown = null;
    private raf: unknown = null;
    private running = false;
    private lastTickMono = 0;
    private readonly st: (fn: () => void, ms: number) => unknown;
    private readonly ct: (handle: unknown) => void;
    private readonly onVisibility = () => {
        if (this.deps.document?.visibilityState === 'visible') this.tickNow();
    };

    constructor(private readonly deps: TickLoopDeps) {
        this.st = deps.setTimeout ?? ((fn, ms) => globalThis.setTimeout(fn, ms));
        this.ct = deps.clearTimeout ?? ((h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>));
    }

    get isRunning(): boolean {
        return this.running;
    }

    start(): void {
        if (this.running) return;
        this.running = true;
        this.deps.document?.addEventListener('visibilitychange', this.onVisibility);
        this.tickNow();
        this.watch();
    }

    stop(): void {
        this.running = false;
        this.deps.document?.removeEventListener('visibilitychange', this.onVisibility);
        if (this.timer !== null) this.ct(this.timer);
        if (this.raf !== null) this.deps.cancelAnimationFrame?.(this.raf);
        this.timer = this.raf = null;
    }

    /** Ticks immediately and re-aligns the schedule (used on wake-ups). */
    tickNow(): void {
        if (!this.running) return;
        if (this.timer !== null) this.ct(this.timer);
        this.timer = null;
        this.fire();
    }

    /** Milliseconds until just after the next second boundary of effective time. */
    static delayFor(nowEff: number): number {
        return 1000 - (((nowEff % 1000) + 1000) % 1000) + 5;
    }

    private fire(): void {
        this.lastTickMono = this.deps.monoNow();
        try {
            this.deps.onTick();
        } catch (error) {
            // NFR-1: an error in a tick must never stop the loop.
            this.deps.onError?.(error);
        }
        this.schedule();
    }

    private schedule(): void {
        if (!this.running) return;
        this.timer = this.st(() => {
            this.timer = null;
            if (this.running) this.fire();
        }, TickLoop.delayFor(this.deps.nowEff()));
    }

    private watch(): void {
        const raf = this.deps.requestAnimationFrame;
        if (!raf || !this.running) return;
        this.raf = raf(() => {
            this.raf = null;
            if (!this.running) return;
            const visible = (this.deps.document?.visibilityState ?? 'visible') === 'visible';
            if (visible && this.deps.monoNow() - this.lastTickMono > WATCHDOG_MS) this.tickNow();
            this.watch();
        });
    }
}
