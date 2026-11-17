// LLD §5.1–5.2 — effective wall time and wall/monotonic reconciliation.
import type { Clock } from '@/core/clock';
import type { MessageState, PresentationState, TimerState } from '@/core/types';

export type SampleKind = 'normal' | 'suspended' | 'clockChanged';
export interface Sample {
    kind: SampleKind;
    /** wall − effective time at the moment of the sample (ms). */
    drift: number;
}

export const SLEW_LIMIT_MS = 1_500;
export const SLEW_FACTOR = 0.1;

/**
 * nowEff = anchorWall + (mono − anchorMono).
 *
 * - normal: |drift| < 1.5 s → slew 10% of the drift into the anchor (absorbs NTP corrections).
 * - suspended: the wall clock moved forward by more than the monotonic clock AND the sample is not a
 *   regular tick (ticks were missed, dMono > 2 s, or monotonic time did not advance at all, dMono < 0.5 s,
 *   which is what a wake-up sample from visibilitychange/pageshow looks like) → trust the wall clock.
 * - clockChanged: regular ticks but the wall clock jumped → trust mono; the caller rebases the
 *   persisted wall timestamps by `drift` (see `shiftState`).
 */
export class ClockReconciler {
    private anchorWall: number;
    private anchorMono: number;
    private lastWall: number;
    private lastMono: number;

    constructor(private readonly clock: Clock) {
        this.anchorWall = this.lastWall = clock.wallNow();
        this.anchorMono = this.lastMono = clock.monoNow();
    }

    nowEff(): number {
        return Math.round(this.anchorWall + (this.clock.monoNow() - this.anchorMono));
    }

    /** Offset of the effective timeline from the wall clock (diagnostics). */
    offset(): number {
        return this.nowEff() - this.clock.wallNow();
    }

    sample(): Sample {
        const mono = this.clock.monoNow();
        const wall = this.clock.wallNow();
        const dMono = mono - this.lastMono;
        const dWall = wall - this.lastWall;
        const drift = wall - (this.anchorWall + (mono - this.anchorMono));
        this.lastMono = mono;
        this.lastWall = wall;

        if (Math.abs(drift) < SLEW_LIMIT_MS) {
            this.anchorWall += drift * SLEW_FACTOR;
            return { kind: 'normal', drift };
        }
        const wallAhead = dWall > dMono + 1_000;
        if (wallAhead && (dMono > 2_000 || dMono < 500)) {
            this.anchorWall = wall;
            this.anchorMono = mono;
            return { kind: 'suspended', drift };
        }
        this.anchorWall += drift;
        return { kind: 'clockChanged', drift };
    }

    /** Rebases every persisted wall timestamp by `drift` so remaining times are unchanged. */
    static shiftState(state: PresentationState, drift: number): PresentationState {
        return { ...state, timer: shiftTimer(state.timer, drift), message: shiftMessage(state.message, drift), updatedAtWall: state.updatedAtWall + drift };
    }
}

function shiftTimer(t: TimerState, d: number): TimerState {
    switch (t.status) {
        case 'idle':
        case 'ready':
            return t;
        case 'running':
        case 'overtime':
            return { ...t, endsAtWall: t.endsAtWall + d, startedAtWall: t.startedAtWall + d };
        case 'paused':
            return { ...t, pausedAtWall: t.pausedAtWall + d, startedAtWall: t.startedAtWall + d };
    }
}

function shiftMessage(m: MessageState, d: number): MessageState {
    if (m.status !== 'showing') return m;
    return { ...m, shownAtWall: m.shownAtWall + d, expiresAtWall: m.expiresAtWall === null ? null : m.expiresAtWall + d };
}
