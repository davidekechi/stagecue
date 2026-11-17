import { describe, expect, it } from 'vitest';
import { FakeClock } from '../clock';
import * as timer from '../timer';
import type { TimerState } from '../types';

const D = 900_000;
const T0 = 1_794_660_000_000;
const ok = (r: timer.TimerResult): TimerState => {
    if (!r.ok) throw new Error(`expected ok, got ${r.code}`);
    return r.timer;
};
const idle: TimerState = { status: 'idle' };
const ready = ok(timer.set(idle, D));
const running = ok(timer.start(ready, T0));
const paused = ok(timer.pause(running, T0 + 60_000));
const overtime = ok(timer.expire(running, T0 + D));

describe('timer engine', () => {
    it('T-01 SET 900000 → ready, readout 15:00', () => {
        expect(ready).toEqual({ status: 'ready', durationMs: D });
        expect(timer.readout(ready, T0)?.text).toBe('15:00');
    });

    it('T-02 ready stays unchanged for 5 minutes of fake time', () => {
        const clock = new FakeClock(T0);
        for (let i = 0; i < 300; i++) clock.advance(1000);
        expect(timer.readout(ready, clock.wallNow())).toMatchObject({ text: '15:00', paused: true, overtime: false });
    });

    it('T-03 START from ready → running with endsAt = now + duration', () => {
        expect(running).toEqual({ status: 'running', durationMs: D, endsAtWall: T0 + D, startedAtWall: T0 });
    });

    it('T-04 START from idle/running/paused/overtime → INVALID_STATE', () => {
        for (const t of [idle, running, paused, overtime]) expect(timer.start(t, T0)).toEqual({ ok: false, code: 'INVALID_STATE' });
    });

    it('T-05 PAUSE at +60 s → paused with 840000 remaining', () => {
        expect(paused).toEqual({ status: 'paused', durationMs: D, remainingMs: 840_000, pausedAtWall: T0 + 60_000, startedAtWall: T0 });
        expect(timer.readout(paused, T0 + 500_000)?.text).toBe('14:00');
    });

    it('PAUSE is only valid while running or in overtime', () => {
        for (const t of [idle, ready, paused]) expect(timer.pause(t, T0).ok).toBe(false);
        expect(timer.pause(overtime, T0 + D + 12_000).ok).toBe(true);
    });

    it('T-06 RESUME → running with endsAt = now + 840000', () => {
        const t1 = T0 + 300_000;
        expect(ok(timer.resume(paused, t1))).toEqual({ status: 'running', durationMs: D, endsAtWall: t1 + 840_000, startedAtWall: T0 });
        for (const t of [idle, ready, running, overtime]) expect(timer.resume(t, T0).ok).toBe(false);
    });

    it('T-09 expiry at endsAt → overtime +00:00:00, then +00:00:01 one second later', () => {
        expect(timer.expire(running, T0 + D - 1)).toEqual({ ok: false, code: 'INVALID_STATE' });
        expect(timer.isExpired(running, T0 + D)).toBe(true);
        expect(overtime).toEqual({ status: 'overtime', durationMs: D, endsAtWall: T0 + D, startedAtWall: T0 });
        expect(timer.readout(overtime, T0 + D)?.text).toBe('+00:00:00');
        expect(timer.readout(overtime, T0 + D + 1000)?.text).toBe('+00:00:01');
        expect(timer.expire(overtime, T0 + D + 1).ok).toBe(false);
    });

    it('T-10 pause in overtime, resume → overtime continues from the frozen value', () => {
        const p = ok(timer.pause(overtime, T0 + D + 12_000));
        expect(p).toMatchObject({ status: 'paused', remainingMs: -12_000 });
        expect(timer.readout(p, T0 + D + 99_000)).toMatchObject({ text: '+00:00:12', overtime: true, paused: true });
        const q = T0 + D + 100_000;
        const r = ok(timer.resume(p, q));
        expect(r).toEqual({ status: 'overtime', durationMs: D, endsAtWall: q - 12_000, startedAtWall: T0 });
        expect(timer.readout(r, q + 3_000)?.text).toBe('+00:00:15');
    });

    it('T-11 RESET from each non-idle state → ready(duration)', () => {
        for (const t of [ready, running, paused, overtime]) expect(ok(timer.reset(t))).toEqual({ status: 'ready', durationMs: D });
        expect(timer.reset(idle).ok).toBe(false);
    });

    it('T-12 CLEAR → idle from any state', () => {
        for (const t of [idle, ready, running, paused, overtime]) expect(ok(timer.clear(t))).toEqual({ status: 'idle' });
        expect(timer.readout(idle, T0)).toBeNull();
    });

    it('T-13 2 h with 1 s ticks and ±50 ms jitter → end error < 100 ms', () => {
        const duration = 2 * 3600_000;
        const clock = new FakeClock(T0);
        const t = ok(timer.start(ok(timer.set(idle, duration)), clock.wallNow()));
        let seed = 42;
        const rand = () => ((seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31) * 100 - 50;
        let maxError = 0;
        let expired = false;
        while (!expired) {
            clock.advance(1000 + rand());
            const now = clock.wallNow();
            const r = timer.readout(t, now)!;
            const truth = T0 + duration - now; // what a perfect stopwatch would show
            maxError = Math.max(maxError, Math.abs(r.remainingMs - truth));
            expired = timer.isExpired(t, now);
        }
        expect(clock.wallNow() - T0).toBeGreaterThanOrEqual(duration);
        expect(maxError).toBeLessThan(100);
    });

    it('a running timer past its end reads as overtime before the expiry event lands', () => {
        expect(timer.readout(running, T0 + D + 2_500)).toMatchObject({ overtime: true, text: '+00:00:02', paused: false });
    });

    it('pause/resume keep remaining time exact across many cycles', () => {
        let t = running;
        let now = T0;
        for (let i = 0; i < 50; i++) {
            now += 7_000;
            t = ok(timer.pause(t, now));
            now += 3_000;
            t = ok(timer.resume(t, now));
        }
        expect(timer.readout(t, now)?.remainingMs).toBe(D - 50 * 7_000);
    });
});
