import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { apply, command, internal } from '../reducer';
import { presentationStateSchema } from '../schemas';
import { isExpired as timerExpired } from '../timer';
import { isExpired as messageExpired } from '../message';
import type { Action, Corner, PresentationState } from '../types';
import { fresh, T0 } from './helpers';

const corner = fc.constantFrom<Corner>('tl', 'tr', 'bl', 'br');
const uuid = fc.uuid({ version: 7 });

const actionArb: fc.Arbitrary<Action> = fc.oneof(
    fc.integer({ min: 0, max: 100_000_000 }).map((durationMs) => command('TIMER_SET', { durationMs })),
    fc.constantFrom('TIMER_START', 'TIMER_PAUSE', 'TIMER_RESUME', 'TIMER_RESET', 'TIMER_CLEAR', 'BLACKOUT_ON', 'BLACKOUT_OFF', 'SYNC_REQUEST', 'PRESENTATION_NEW').map((n) =>
        command(n as Parameters<typeof command>[0]),
    ),
    fc
        .record({ id: uuid, text: fc.string({ maxLength: 520 }), mode: fc.constantFrom('timed', 'persistent'), durationMs: fc.option(fc.integer({ min: 0, max: 700_000 })), corner: fc.option(corner) })
        .map((p) => command('MESSAGE_SHOW', p)),
    fc.option(uuid).map((id) => command('MESSAGE_DISMISS', { id })),
    fc.record({ defaultCorner: fc.option(corner, { nil: undefined }), overtimeInterruptsMessage: fc.option(fc.boolean(), { nil: undefined }) }).map((p) => command('SETTINGS_UPDATE', p)),
    fc.constantFrom(internal('TIMER_EXPIRED'), internal('MESSAGE_EXPIRED')),
    fc.anything().map((payload) => command('TIMER_SET', payload)),
);

/** What the Display's tick does: raise due internal events. */
function tick(s: PresentationState, now: number): PresentationState {
    for (const a of [internal('TIMER_EXPIRED'), internal('MESSAGE_EXPIRED')]) {
        const r = apply(s, a, now);
        if (r.ok) s = r.state;
    }
    return s;
}

describe('R-09 property-based invariants', () => {
    it('random command sequences never throw and keep the invariants', () => {
        fc.assert(
            fc.property(fc.array(fc.tuple(actionArb, fc.integer({ min: 0, max: 120_000 })), { maxLength: 60 }), (steps) => {
                let s = fresh();
                let now = T0;
                for (const [action, dt] of steps) {
                    now += dt;
                    const before = s;
                    const r = apply(s, action, now);
                    if (r.ok) {
                        s = r.state;
                        if (r.changed && before.presentationId === s.presentationId) expect(s.revision).toBe(before.revision + 1);
                        if (!r.changed) expect(s).toBe(before);
                        if (before.presentationId !== s.presentationId) expect(s.revision).toBe(0);
                    } else {
                        expect(s).toBe(before);
                    }
                    s = tick(s, now);
                    expect(presentationStateSchema.safeParse(s).success).toBe(true);
                    if (s.timer.status === 'paused') expect(Number.isFinite(s.timer.remainingMs)).toBe(true);
                    expect(timerExpired(s.timer, now)).toBe(false); // no `running` with endsAt ≤ now after a tick
                    expect(messageExpired(s.message, now)).toBe(false);
                }
            }),
            { numRuns: 300 },
        );
    });
});
