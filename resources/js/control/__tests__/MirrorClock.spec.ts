import { describe, expect, it } from 'vitest';
import { createInitialState } from '@/core/reducer';
import type { PresentationState } from '@/core/types';
import { mirrorNow, mirrorStateAt, mirrorView, type Mirror } from '../MirrorClock';

const DISPLAY_T = 1_794_660_000_000;

function mirror(state: Partial<PresentationState>, receivedAtMono: number): Mirror {
    return {
        state: { ...createInitialState('P', DISPLAY_T), revision: 5, ...state },
        computed: { timerRemainingMs: null, overtimeMs: 0, messageRemainingMs: null },
        capturedAtWall: DISPLAY_T,
        receivedAtMono,
        lastEvents: [],
        live: true,
    };
}

describe('MirrorClock', () => {
    it('counts down from the receipt using this device’s monotonic clock only', () => {
        const m = mirror({ timer: { status: 'running', durationMs: 900_000, startedAtWall: DISPLAY_T - 60_000, endsAtWall: DISPLAY_T + 840_000 } }, 5_000);
        expect(mirrorNow(m, 5_000)).toBe(DISPLAY_T);
        expect(mirrorView(m, 5_000)).toMatchObject({ kind: 'timer', text: '14:00' });
        expect(mirrorView(m, 15_000)).toMatchObject({ kind: 'timer', text: '13:50' });
    });

    it('is correct under a skewed device clock (the phone thinks it is 1 h later)', () => {
        const realDateNow = Date.now;
        Date.now = () => realDateNow() + 3_600_000;
        try {
            const m = mirror({ timer: { status: 'running', durationMs: 60_000, startedAtWall: DISPLAY_T, endsAtWall: DISPLAY_T + 60_000 } }, 100);
            expect(mirrorView(m, 100 + 30_000)).toMatchObject({ kind: 'timer', text: '00:30' });
        } finally {
            Date.now = realDateNow;
        }
    });

    it('freezes while ready/paused and applies the expiries the Display will raise', () => {
        const paused = mirror({ timer: { status: 'paused', durationMs: 60_000, remainingMs: 42_000, pausedAtWall: DISPLAY_T, startedAtWall: DISPLAY_T } }, 0);
        expect(mirrorView(paused, 600_000)).toMatchObject({ kind: 'timer', text: '00:42', paused: true });
        const m = mirror(
            {
                timer: { status: 'running', durationMs: 10_000, startedAtWall: DISPLAY_T, endsAtWall: DISPLAY_T + 10_000 },
                message: { status: 'showing', id: 'm', text: 'Hi', mode: 'timed', durationMs: 5_000, shownAtWall: DISPLAY_T, expiresAtWall: DISPLAY_T + 5_000, corner: 'tr' },
            },
            0,
        );
        expect(mirrorView(m, 3_000)).toMatchObject({ kind: 'message' });
        expect(mirrorStateAt(m, 12_000).state.timer.status).toBe('overtime');
        expect(mirrorView(m, 12_000)).toEqual({ kind: 'overtime', text: '+00:00:02', paused: false });
        expect(mirrorView(null, 0)).toEqual({ kind: 'standby' });
    });
});
