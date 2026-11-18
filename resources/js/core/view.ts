// LLD §3.4 + HLD §8 — render priority: blackout > message > timer (overtime) > standby.
import { formatClock } from './format';
import { remaining as messageRemaining } from './message';
import { readout } from './timer';
import type { Computed, Corner, PresentationState } from './types';

export type View =
    | { kind: 'black' }
    | { kind: 'standby' }
    | { kind: 'timer'; text: string; paused: boolean; overtime: false }
    | { kind: 'overtime'; text: string /* +HH:MM:SS */; paused: boolean }
    | { kind: 'clock'; text: string /* 2:45 PM */ }
    | { kind: 'message'; message: { text: string; corner: Corner }; compact: null | { text: string; overtime: boolean; clock?: boolean } };

export type ViewKind = View['kind'];

export function deriveView(s: PresentationState, now: number): View {
    if (s.display.blackout) return { kind: 'black' };
    const t = readout(s.timer, now);
    // A23: with no timer set, the time of day can take the timer's place (and its corner).
    const clock = !t && s.display.clock ? formatClock(now) : null;
    if (s.message.status === 'showing') {
        return {
            kind: 'message',
            message: { text: s.message.text, corner: s.message.corner },
            compact: t ? { text: t.text, overtime: t.overtime } : clock ? { text: clock, overtime: false, clock: true } : null,
        };
    }
    if (clock) return { kind: 'clock', text: clock };
    if (!t) return { kind: 'standby' };
    return t.overtime ? { kind: 'overtime', text: t.text, paused: t.paused } : { kind: 'timer', text: t.text, paused: t.paused, overtime: false };
}

/** The `computed` block of a snapshot (04 §1.8). */
export function computeTiming(s: PresentationState, now: number): Computed {
    const t = readout(s.timer, now);
    return {
        timerRemainingMs: t ? t.remainingMs : null,
        overtimeMs: t ? t.overtimeMs : 0,
        messageRemainingMs: messageRemaining(s.message, now),
    };
}
