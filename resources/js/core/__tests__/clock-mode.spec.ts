import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatClock } from '../format';
import { apply, command } from '../reducer';
import { presentationStateSchema } from '../schemas';
import { deriveView } from '../view';
import { fresh, ok, T0, timedMsg } from './helpers';

// A23 — the time of day when no timer is set.
const at = (h: number, m: number) => new Date(2026, 10, 18, h, m, 30).getTime();

describe('formatClock', () => {
    it('12-hour local time with AM/PM', () => {
        expect(formatClock(at(0, 5))).toBe('12:05 AM');
        expect(formatClock(at(9, 41))).toBe('9:41 AM');
        expect(formatClock(at(12, 0))).toBe('12:00 PM');
        expect(formatClock(at(14, 45))).toBe('2:45 PM');
        expect(formatClock(at(23, 59))).toBe('11:59 PM');
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

    it('shows the clock only when no timer is set; moves to the corner with a message; blackout wins', () => {
        const now = at(14, 45);
        let s = ok(apply(fresh(), command('CLOCK_ON'), now));
        expect(deriveView(s, now)).toEqual({ kind: 'clock', text: '2:45 PM' });

        const withMsg = ok(apply(s, command('MESSAGE_SHOW', timedMsg(10_000)), now));
        expect(deriveView(withMsg, now)).toEqual({ kind: 'message', message: { text: 'Please take your seats', corner: 'tr' }, compact: { text: '2:45 PM', overtime: false, clock: true } });

        s = ok(apply(s, command('TIMER_SET', { durationMs: 900_000 }), now));
        expect(deriveView(s, now)).toMatchObject({ kind: 'timer', text: '15:00' }); // a timer takes priority

        const black = ok(apply(ok(apply(fresh(), command('CLOCK_ON'), now)), command('BLACKOUT_ON'), now));
        expect(deriveView(black, now)).toEqual({ kind: 'black' });
        expect(deriveView(fresh(), now)).toEqual({ kind: 'standby' });
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
