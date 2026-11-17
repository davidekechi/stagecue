import { describe, expect, it } from 'vitest';
import * as message from '../message';
import { apply, command, createInitialState } from '../reducer';
import type { MessageShowPayload, MessageState, PresentationState, TimerState } from '../types';

const T0 = 1_794_660_000_000;
const ID_A = '0193a3b4-8c2e-7d11-9f0a-aaaaaaaaaaaa';
const ID_B = '0193a3b4-8c2e-7d11-9f0a-bbbbbbbbbbbb';
const timed = (id = ID_A, durationMs = 10_000): MessageShowPayload => ({ id, text: 'Please take your seats', mode: 'timed', durationMs, corner: 'tr' });

describe('message engine', () => {
    it('M-01 SHOW timed 10 s → showing, expiresAt = now + 10000', () => {
        const m = message.show(timed(), T0, 'bl');
        expect(m).toEqual({ status: 'showing', id: ID_A, text: 'Please take your seats', mode: 'timed', durationMs: 10_000, shownAtWall: T0, expiresAtWall: T0 + 10_000, corner: 'tr' });
        expect(message.remaining(m, T0 + 4_000)).toBe(6_000);
    });

    it('M-02 expires at +10 s', () => {
        const m = message.show(timed(), T0, 'tr');
        expect(message.expire(m, T0 + 9_999).changed).toBe(false);
        expect(message.expire(m, T0 + 10_000)).toEqual({ changed: true, message: { status: 'none' } });
        expect(message.remaining(m, T0 + 20_000)).toBe(0);
    });

    it('M-03 a persistent message is still showing after 1 h', () => {
        const m = message.show({ id: ID_A, text: 'Hi', mode: 'persistent' }, T0, 'bl');
        expect(m).toMatchObject({ status: 'showing', expiresAtWall: null, durationMs: null, corner: 'bl' });
        expect(message.expire(m, T0 + 3_600_000).changed).toBe(false);
        expect(message.remaining(m, T0)).toBeNull();
    });

    it('M-04 replacing at +5 s with a new 10 s message resets the expiry', () => {
        let s: PresentationState = createInitialState('P', T0);
        s = ok(apply(s, command('MESSAGE_SHOW', timed(ID_A)), T0));
        const r = apply(s, command('MESSAGE_SHOW', timed(ID_B)), T0 + 5_000);
        expect(r.ok && r.events).toEqual(['MessageReplaced']);
        expect(r.ok && r.state.message).toMatchObject({ id: ID_B, expiresAtWall: T0 + 15_000 });
    });

    it('M-05 DISMISS with a matching id → none', () => {
        const m = message.show(timed(), T0, 'tr');
        expect(message.dismiss(m, ID_A)).toEqual({ changed: true, message: { status: 'none' } });
        expect(message.dismiss(m)).toEqual({ changed: true, message: { status: 'none' } });
    });

    it('M-06 DISMISS with a stale id → no-op', () => {
        const m = message.show(timed(ID_B), T0, 'tr');
        expect(message.dismiss(m, ID_A)).toEqual({ changed: false, message: m });
        const none: MessageState = { status: 'none' };
        expect(message.dismiss(none, ID_A)).toEqual({ changed: false, message: none });
        let s = ok(apply(createInitialState('P', T0), command('MESSAGE_SHOW', timed(ID_B)), T0));
        const r = apply(s, command('MESSAGE_DISMISS', { id: ID_A }), T0 + 1);
        expect(r).toMatchObject({ ok: true, changed: false });
        s = ok(r);
        expect(s.revision).toBe(1);
    });

    it('M-07 SHOW never changes the timer, for every timer state', () => {
        const timers: TimerState[] = [
            { status: 'idle' },
            { status: 'ready', durationMs: 900_000 },
            { status: 'running', durationMs: 900_000, endsAtWall: T0 + 900_000, startedAtWall: T0 },
            { status: 'paused', durationMs: 900_000, remainingMs: 1_000, pausedAtWall: T0, startedAtWall: T0 },
            { status: 'overtime', durationMs: 900_000, endsAtWall: T0 - 5_000, startedAtWall: T0 - 905_000 },
        ];
        for (const t of timers) {
            const s = { ...createInitialState('P', T0), timer: t };
            const before = structuredClone(t);
            const r = apply(s, command('MESSAGE_SHOW', timed()), T0 + 100);
            expect(r.ok && r.state.timer).toEqual(before);
        }
    });

    it('M-08 text validation: empty, whitespace, > 500 chars → INVALID_PAYLOAD', () => {
        const s = createInitialState('P', T0);
        for (const text of ['', '   \n\t', 'x'.repeat(501)]) {
            expect(apply(s, command('MESSAGE_SHOW', { ...timed(), text }), T0)).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' });
        }
    });

    it('uses the default corner when none is given', () => {
        const m = message.show({ id: ID_A, text: 'x', mode: 'timed', durationMs: 5_000 }, T0, 'bl');
        expect(m.status === 'showing' && m.corner).toBe('bl');
    });
});

function ok(r: ReturnType<typeof apply>): PresentationState {
    if (!r.ok) throw new Error(r.code);
    return r.state;
}
