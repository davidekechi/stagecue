import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatClock } from '../format';
import { apply, command } from '../reducer';
import { presentationStateSchema } from '../schemas';
import { deriveView } from '../view';
import { fresh, ok, T0, timedMsg } from './helpers';

// A23 — the time of day when no timer is set.
const at = (h: number, m: number) => new Date(2026, 10, 18, h, m, 30).getTime();

describe('formatClock', () => {
    it('12-hour local time, two-digit hours, seconds, AM/PM', () => {
        expect(formatClock(at(0, 5))).toBe('12:05:30 AM');
        expect(formatClock(at(9, 41))).toBe('09:41:30 AM');
        expect(formatClock(at(12, 0))).toBe('12:00:30 PM');
        expect(formatClock(at(14, 45))).toBe('02:45:30 PM');
        expect(formatClock(at(23, 59))).toBe('11:59:30 PM');
        expect(formatClock(new Date(2026, 10, 18, 7, 3, 9).getTime())).toBe('07:03:09 AM');
    });
});

describe('clock mode', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('CLOCK_ON / CLOCK_OFF toggle the flag (no-ops when already set) and never touch the timer', () => {
        let s = fresh();
        const r = apply(s, command('CLOCK_ON'), T0);
        expect(r).toMatchObject({ ok: true, changed: true, events: ['ClockShown'] });
        s = ok(r);
        expect(s.display).toEqual({ blackout: false, clock: true });
        expect(apply(s, command('CLOCK_ON'), T0)).toMatchObject({ changed: false });
        s = ok(apply(s, command('BLACKOUT_ON'), T0));
        expect(s.display).toEqual({ blackout: true, clock: true }); // blackout keeps the clock flag
        s = ok(apply(s, command('CLOCK_OFF'), T0));
        expect(s.display).toEqual({ blackout: true, clock: false });
        expect(s.timer).toEqual({ status: 'idle' });
    });

    it('A26: the clock covers the timer, TIME UP and the black screen; off returns to what was underneath', () => {
        const now = at(14, 45);
        const clockOn = (st: ReturnType<typeof fresh>) => ok(apply(st, command('CLOCK_ON'), now));
        const clockOff = (st: ReturnType<typeof fresh>) => ok(apply(st, command('CLOCK_OFF'), now));

        expect(deriveView(clockOn(fresh()), now)).toEqual({ kind: 'clock', text: '02:45:30 PM' });

        // Counting down underneath: the clock shows; off → the countdown, which kept running.
        const running = ok(apply(ok(apply(fresh(), command('TIMER_SET', { durationMs: 900_000 }), now)), command('TIMER_START'), now));
        const covered = clockOn(running);
        expect(deriveView(covered, now + 60_000).kind).toBe('clock');
        expect(covered.timer).toEqual(running.timer); // the clock never touches the timer
        expect(deriveView(clockOff(covered), now + 60_000)).toMatchObject({ kind: 'timer', text: '14:00' });

        // TIME UP underneath.
        expect(deriveView(covered, now + 960_000).kind).toBe('clock');
        expect(deriveView(clockOff(covered), now + 960_000).kind).toBe('overtime');

        // Black screen underneath: the clock wins; off → black again.
        const black = clockOn(ok(apply(fresh(), command('BLACKOUT_ON'), now)));
        expect(deriveView(black, now).kind).toBe('clock');
        expect(deriveView(clockOff(black), now)).toEqual({ kind: 'black' });

        expect(deriveView(fresh(), now)).toEqual({ kind: 'standby' });
    });

    it('A26: a message over the clock shows the time in its corner (but not under a black screen)', () => {
        const now = at(14, 45);
        const withMsg = ok(apply(ok(apply(fresh(), command('CLOCK_ON'), now)), command('MESSAGE_SHOW', timedMsg(10_000)), now));
        expect(deriveView(withMsg, now)).toEqual({ kind: 'message', message: { text: 'Please take your seats', corner: 'tr' }, compact: { text: '02:45:30 PM', overtime: false, clock: true } });
        const withTimer = ok(apply(withMsg, command('TIMER_SET', { durationMs: 900_000 }), now));
        expect(deriveView(withTimer, now)).toMatchObject({ kind: 'message', compact: { clock: true } });
        expect(deriveView(ok(apply(withMsg, command('BLACKOUT_ON'), now)), now).kind).toBe('clock');
        // Clock off: the message with the timer in the corner, as before.
        expect(deriveView(ok(apply(withTimer, command('CLOCK_OFF'), now)), now)).toMatchObject({ kind: 'message', compact: { text: '15:00', overtime: false } });
    });

    it('a new presentation keeps the clock preference', () => {
        const s = ok(apply(ok(apply(fresh(), command('CLOCK_ON'), T0)), command('PRESENTATION_NEW'), T0));
        expect(s.display.clock).toBe(true);
    });

    it('states saved before the clock existed still load (clock off)', () => {
        const old = { ...fresh(), display: { blackout: true } };
        const parsed = presentationStateSchema.parse(old);
        expect(parsed.display).toEqual({ blackout: true, clock: false });
    });
});
