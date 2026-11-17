import { describe, expect, it } from 'vitest';
import { apply, command, internal } from '../reducer';
import { computeTiming, deriveView } from '../view';
import type { MessageState, PresentationState, TimerState } from '../types';
import { fresh, ID_A, ok, run, T0, timedMsg } from './helpers';

const D = 900_000;
const timers: Record<string, TimerState> = {
    idle: { status: 'idle' },
    ready: { status: 'ready', durationMs: D },
    running: { status: 'running', durationMs: D, endsAtWall: T0 + D, startedAtWall: T0 },
    paused: { status: 'paused', durationMs: D, remainingMs: 60_000, pausedAtWall: T0, startedAtWall: T0 },
    pausedOvertime: { status: 'paused', durationMs: D, remainingMs: -12_000, pausedAtWall: T0, startedAtWall: T0 },
    overtime: { status: 'overtime', durationMs: D, endsAtWall: T0 - 5_000, startedAtWall: T0 - D - 5_000 },
};
const showing: MessageState = { status: 'showing', id: ID_A, text: 'Hello', mode: 'persistent', durationMs: null, shownAtWall: T0, expiresAtWall: null, corner: 'bl' };

const state = (timer: TimerState, message: MessageState, blackout: boolean): PresentationState => ({ ...fresh(), timer, message, display: { blackout } });

describe('deriveView', () => {
    it('R-03 render priority matrix: blackout > message > overtime > timer > standby', () => {
        const expected: Record<string, string> = { idle: 'standby', ready: 'timer', running: 'timer', paused: 'timer', pausedOvertime: 'overtime', overtime: 'overtime' };
        for (const [name, timer] of Object.entries(timers)) {
            for (const message of [{ status: 'none' } as MessageState, showing]) {
                for (const blackout of [false, true]) {
                    const v = deriveView(state(timer, message, blackout), T0);
                    const want = blackout ? 'black' : message.status === 'showing' ? 'message' : expected[name];
                    expect(v.kind, `${name}/${message.status}/${blackout}`).toBe(want);
                }
            }
        }
    });

    it('describes the timer, overtime and message views', () => {
        expect(deriveView(state(timers.ready!, { status: 'none' }, false), T0)).toEqual({ kind: 'timer', text: '15:00', paused: true, overtime: false });
        expect(deriveView(state(timers.running!, { status: 'none' }, false), T0 + 1_000)).toEqual({ kind: 'timer', text: '14:59', paused: false, overtime: false });
        expect(deriveView(state(timers.pausedOvertime!, { status: 'none' }, false), T0)).toEqual({ kind: 'overtime', text: '+00:00:12', paused: true });
        expect(deriveView(state(timers.overtime!, showing, false), T0)).toEqual({
            kind: 'message',
            message: { text: 'Hello', corner: 'bl' },
            compact: { text: '+00:00:05', overtime: true },
        });
        expect(deriveView(state(timers.idle!, showing, false), T0)).toMatchObject({ kind: 'message', compact: null });
    });

    it('R-04 blackout across expiry: timer → overtime, message expired, view black throughout', () => {
        let s = run(fresh(), [
            ['TIMER_SET', { durationMs: 5 * 60_000 }, T0],
            ['TIMER_START', {}, T0],
            ['MESSAGE_SHOW', timedMsg(30_000), T0],
            ['BLACKOUT_ON', {}, T0 + 1_000],
        ]);
        for (let now = T0 + 2_000; now <= T0 + 20 * 60_000; now += 1_000) {
            for (const name of ['TIMER_EXPIRED', 'MESSAGE_EXPIRED'] as const) s = ok(apply(s, internal(name), now));
            expect(deriveView(s, now).kind).toBe('black');
        }
        expect(s.timer.status).toBe('overtime');
        expect(s.message.status).toBe('none');

        // R-05 BLACKOUT_OFF afterwards → overtime view with the right value
        s = ok(apply(s, command('BLACKOUT_OFF'), T0 + 20 * 60_000));
        expect(deriveView(s, T0 + 20 * 60_000)).toEqual({ kind: 'overtime', text: '+00:15:00', paused: false });
    });
});

describe('computeTiming', () => {
    it('reports remaining, overtime and message timing', () => {
        const s = ok(apply(state(timers.running!, { status: 'none' }, false), command('MESSAGE_SHOW', timedMsg(10_000)), T0 + 100));
        expect(computeTiming(s, T0 + 180)).toEqual({ timerRemainingMs: D - 180, overtimeMs: 0, messageRemainingMs: 9_920 });
        expect(computeTiming(state(timers.overtime!, { status: 'none' }, false), T0)).toEqual({ timerRemainingMs: -5_000, overtimeMs: 5_000, messageRemainingMs: null });
        expect(computeTiming(fresh(), T0)).toEqual({ timerRemainingMs: null, overtimeMs: 0, messageRemainingMs: null });
    });
});
