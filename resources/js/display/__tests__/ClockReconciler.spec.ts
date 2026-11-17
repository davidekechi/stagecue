import { describe, expect, it } from 'vitest';
import { FakeClock } from '@/core/clock';
import { createInitialState } from '@/core/reducer';
import { readout } from '@/core/timer';
import type { PresentationState } from '@/core/types';
import { ClockReconciler } from '../ClockReconciler';

const T0 = 1_794_660_000_000;

function runningState(now: number, remainingMs: number): PresentationState {
    return {
        ...createInitialState('P', now),
        timer: { status: 'running', durationMs: 900_000, startedAtWall: now - (900_000 - remainingMs), endsAtWall: now + remainingMs },
        message: { status: 'showing', id: 'm', text: 't', mode: 'timed', durationMs: 10_000, shownAtWall: now, expiresAtWall: now + 10_000, corner: 'tr' },
    };
}

/** Simulates the tick loop: one second of regular time, then a sample. */
function tickFor(clock: FakeClock, rec: ClockReconciler, seconds: number) {
    const samples = [];
    for (let i = 0; i < seconds; i++) {
        clock.advance(1000);
        samples.push(rec.sample());
    }
    return samples;
}

describe('ClockReconciler', () => {
    it('starts with nowEff equal to the wall clock and follows monotonic time', () => {
        const clock = new FakeClock(T0, 50);
        const rec = new ClockReconciler(clock);
        expect(rec.nowEff()).toBe(T0);
        clock.advance(1234);
        expect(rec.nowEff()).toBe(T0 + 1234);
        expect(rec.offset()).toBe(0);
        expect(tickFor(clock, rec, 3).every((s) => s.kind === 'normal')).toBe(true);
    });

    it.each([
        ['CLK-01 wall +3 h', 3 * 3600_000],
        ['CLK-02 wall −10 min', -10 * 60_000],
    ])('%s with regular ticks: rebased, remaining time unchanged', (_name, jump) => {
        const clock = new FakeClock(T0, 0);
        const rec = new ClockReconciler(clock);
        let state = runningState(rec.nowEff(), 120_000);
        tickFor(clock, rec, 5);
        const remainingBefore = readout(state.timer, rec.nowEff())!.remainingMs;

        clock.advance(1000);
        clock.jumpWall(jump);
        const s = rec.sample();
        expect(s.kind).toBe('clockChanged');
        expect(s.drift).toBe(jump);
        state = ClockReconciler.shiftState(state, s.drift);

        expect(rec.nowEff()).toBe(clock.wallNow()); // re-aligned with the wall clock
        expect(readout(state.timer, rec.nowEff())!.remainingMs).toBe(remainingBefore - 1000); // exactly 1 s elapsed
        expect(state.message.status === 'showing' && state.message.expiresAtWall).toBe(T0 + 10_000 + jump);
        expect(tickFor(clock, rec, 3).every((x) => x.kind === 'normal')).toBe(true);
    });

    it('CLK-03 suspend (mono +0, wall +5 min) → nowEff jumps forward; 2 min left becomes overtime +3:00', () => {
        const clock = new FakeClock(T0, 0);
        const rec = new ClockReconciler(clock);
        const state = runningState(rec.nowEff(), 120_000);
        clock.suspend(5 * 60_000);
        const s = rec.sample();
        expect(s.kind).toBe('suspended');
        expect(rec.nowEff()).toBe(T0 + 5 * 60_000);
        expect(readout(state.timer, rec.nowEff())).toMatchObject({ overtime: true, text: '+00:03:00' });
    });

    it('suspension that lets monotonic time run (frozen tab) is also honoured', () => {
        const clock = new FakeClock(T0, 0);
        const rec = new ClockReconciler(clock);
        clock.advance(10_000); // a frozen tab: no samples for 10 s …
        clock.jumpWall(60_000); // … and the wall moved further (slept in between)
        expect(rec.sample().kind).toBe('suspended');
        expect(rec.nowEff()).toBe(clock.wallNow());
    });

    it('CLK-04 an NTP slew of 300 ms is absorbed gradually without a rebase', () => {
        const clock = new FakeClock(T0, 0);
        const rec = new ClockReconciler(clock);
        clock.advance(1000);
        clock.jumpWall(300);
        const samples = tickFor(clock, rec, 60);
        expect(samples.every((x) => x.kind === 'normal')).toBe(true);
        expect(Math.abs(rec.offset())).toBeLessThan(5);
        // The first adjustment is a fraction of the slew (gradual, not a jump).
        const fresh = new FakeClock(T0, 0);
        const r2 = new ClockReconciler(fresh);
        fresh.advance(1000);
        fresh.jumpWall(300);
        r2.sample();
        expect(r2.offset()).toBe(-270);
    });

    it('shiftState leaves idle/ready timers and no-message states alone', () => {
        const s = createInitialState('P', T0);
        const shifted = ClockReconciler.shiftState({ ...s, timer: { status: 'ready', durationMs: 1000 } }, 500);
        expect(shifted.timer).toEqual({ status: 'ready', durationMs: 1000 });
        expect(shifted.message).toEqual({ status: 'none' });
        expect(shifted.updatedAtWall).toBe(T0 + 500);
        const paused = ClockReconciler.shiftState({ ...s, timer: { status: 'paused', durationMs: 1000, remainingMs: 10, pausedAtWall: 5, startedAtWall: 1 } }, 500);
        expect(paused.timer).toMatchObject({ pausedAtWall: 505, startedAtWall: 501, remainingMs: 10 });
        const persistent = ClockReconciler.shiftState(
            { ...s, message: { status: 'showing', id: 'm', text: 't', mode: 'persistent', durationMs: null, shownAtWall: 1, expiresAtWall: null, corner: 'tr' } },
            5,
        );
        expect(persistent.message).toMatchObject({ shownAtWall: 6, expiresAtWall: null });
    });
});
