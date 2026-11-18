// LLD §4.8 / FR-P — what the Display WOULD show: the draft applied to a clone of the mirror by the
// pure reducer. Nothing here touches the network or the live mirror.
import { apply, command } from '@/core/reducer';
import { deriveView, type View } from '@/core/view';
import type { MessageShowPayload, PresentationState } from '@/core/types';
import { mirrorStateAt, type Mirror } from './MirrorClock';

export interface PreviewInput {
    mirror: Mirror | null;
    monoNow: number;
    message: MessageShowPayload | null;
    /** FR-P3: show the draft against an overtime timer. */
    asOvertime: boolean;
}

export function previewView(input: PreviewInput): View {
    const base = input.mirror ? mirrorStateAt(input.mirror, input.monoNow) : null;
    const now = base?.now ?? 0;
    let state: PresentationState = base
        ? structuredClone(base.state)
        : { schema: 1, presentationId: 'preview', revision: 0, display: { blackout: false, clock: false }, timer: { status: 'idle' }, message: { status: 'none' }, settings: { defaultCorner: 'tr', overtimeInterruptsMessage: false, defaultMessageDurationMs: 10_000 }, updatedAtWall: 0 };
    if (input.asOvertime) {
        const durationMs = 'durationMs' in state.timer ? state.timer.durationMs : 900_000;
        state = { ...state, timer: { status: 'overtime', durationMs, startedAtWall: now - durationMs - 5_000, endsAtWall: now - 5_000 } };
    }
    // The preview is about content: a blacked-out stage would hide it.
    state = { ...state, display: { ...state.display, blackout: false } };
    if (input.message) {
        const r = apply(state, command('MESSAGE_SHOW', input.message), now);
        if (r.ok) state = r.state;
    }
    return deriveView(state, now);
}
