// LLD §6.5 — server clock offset from X-Server-Time. Used ONLY for the staleness check.

export interface ClockSample {
    offsetMs: number;
    rttMs: number;
}

export const SAMPLE_WINDOW = 5;

export class ServerClock {
    private samples: ClockSample[] = [];
    private best: ClockSample | null;

    constructor(
        private readonly wallNow: () => number = () => Date.now(),
        initial: ClockSample | null = null,
        private readonly onChange?: (best: ClockSample) => void,
    ) {
        this.best = initial;
    }

    /** offset = serverTime − (sendWall + rtt/2); keeps the smallest-RTT sample of the last 5. */
    sample(sendWall: number, receiveWall: number, serverTime: number): void {
        if (!Number.isFinite(serverTime) || receiveWall < sendWall) return;
        const rttMs = receiveWall - sendWall;
        this.samples = [...this.samples, { offsetMs: Math.round(serverTime - (sendWall + rttMs / 2)), rttMs }].slice(-SAMPLE_WINDOW);
        const best = this.samples.reduce((a, b) => (b.rttMs < a.rttMs ? b : a));
        if (!this.best || best.offsetMs !== this.best.offsetMs || best.rttMs !== this.best.rttMs) {
            this.best = best;
            this.onChange?.(best);
        }
    }

    get offset(): number | null {
        return this.best?.offsetMs ?? null;
    }

    /** Estimated server time, or null when unknown (the staleness check is then skipped). */
    now(): number | null {
        return this.best ? this.wallNow() + this.best.offsetMs : null;
    }
}
