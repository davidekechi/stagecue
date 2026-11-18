// LLD §4.7 / A5 — the Controller never uses its own (or the Display's) wall clock for the countdown.
// It anchors the snapshot to its own monotonic clock at receipt.
import { apply, internal } from '@/core/reducer';
import { deriveView, type View } from '@/core/view';
import type { Computed, DomainEvent, PresentationState } from '@/core/types';

export interface Mirror {
    state: PresentationState;
    computed: Computed;
    /** The Display's effective time when it captured the snapshot. */
    capturedAtWall: number;
    /** performance.now() on THIS device when the snapshot arrived. */
    receivedAtMono: number;
    lastEvents: DomainEvent[];
    /** false = "last known" (GET /state), true = a live snapshot since the last (re)subscribe. */
    live: boolean;
}

/**
 * The Display's timeline as seen from here: capturedAtWall + (mono elapsed since receipt).
 * Equivalent to `remainingMsAtReceipt − elapsed`, and immune to clock skew between the devices.
 */
export function mirrorNow(m: Mirror, monoNow: number): number {
    return m.capturedAtWall + Math.max(0, monoNow - m.receivedAtMono);
}

/** The mirror's state at `monoNow`, with any expiry the Display will raise already applied. */
export function mirrorStateAt(m: Mirror, monoNow: number): { state: PresentationState; now: number } {
    const now = mirrorNow(m, monoNow);
    let state = m.state;
    for (const name of ['TIMER_EXPIRED', 'MESSAGE_EXPIRED'] as const) {
        const due = name === 'TIMER_EXPIRED' ? (state.timer.status === 'running' ? state.timer.endsAtWall : null) : state.message.status === 'showing' ? state.message.expiresAtWall : null;
        if (due !== null && now >= due) {
            const r = apply(state, internal(name), due);
            if (r.ok) state = r.state;
        }
    }
    return { state, now };
}

export function mirrorView(m: Mirror | null, monoNow: number): View {
    if (!m) return { kind: 'standby' };
    const { state, now } = mirrorStateAt(m, monoNow);
    return deriveView(state, now);
}
