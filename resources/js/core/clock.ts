// LLD §3.2 — injectable clock. Wall = epoch ms, mono = performance.now()-like ms.

export interface Clock {
    wallNow(): number;
    monoNow(): number;
}

export const systemClock: Clock = {
    wallNow: () => Date.now(),
    monoNow: () => globalThis.performance.now(),
};

/** Deterministic clock for tests. */
export class FakeClock implements Clock {
    private wall: number;
    private mono: number;

    constructor(wallStart = 1_794_660_000_000, monoStart = 1_000) {
        this.wall = wallStart;
        this.mono = monoStart;
    }

    wallNow(): number {
        return this.wall;
    }

    monoNow(): number {
        return this.mono;
    }

    /** Normal passage of time: both clocks advance. */
    advance(ms: number): void {
        this.wall += ms;
        this.mono += ms;
    }

    /** A system clock change: only the wall clock moves (may be negative). */
    jumpWall(ms: number): void {
        this.wall += ms;
    }

    /** Device sleep / frozen tab: real (wall) time passes, the monotonic clock does not. */
    suspend(ms: number): void {
        this.wall += ms;
    }
}
