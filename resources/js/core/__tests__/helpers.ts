import { apply, command, createInitialState, internal } from '../reducer';
import type { ApplyResult, MessageShowPayload, PresentationState } from '../types';

export const T0 = 1_794_660_000_000;
export const ID_A = '0193a3b4-8c2e-7d11-9f0a-aaaaaaaaaaaa';
export const ID_B = '0193a3b4-8c2e-7d11-9f0a-bbbbbbbbbbbb';

export const fresh = (now = T0) => createInitialState('01JD3S0000000000000000PRES', now);

export function ok(r: ApplyResult): PresentationState {
    if (!r.ok) throw new Error(`expected ok, got ${r.code}`);
    return r.state;
}

export const timedMsg = (durationMs = 10_000, id = ID_A, corner: MessageShowPayload['corner'] = 'tr'): MessageShowPayload => ({
    id,
    text: 'Please take your seats',
    mode: 'timed',
    durationMs,
    corner,
});

/** Runs a script of [name, payload?, at] steps and returns the final state. */
export function run(s: PresentationState, steps: Array<[Parameters<typeof command>[0] | 'TIMER_EXPIRED' | 'MESSAGE_EXPIRED', unknown, number]>) {
    for (const [name, payload, at] of steps) {
        s = ok(name === 'TIMER_EXPIRED' || name === 'MESSAGE_EXPIRED' ? apply(s, internal(name), at) : apply(s, command(name, payload), at));
    }
    return s;
}
