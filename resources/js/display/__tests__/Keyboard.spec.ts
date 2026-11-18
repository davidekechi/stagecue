import { describe, expect, it, vi } from 'vitest';
import { apply, command, createInitialState } from '@/core/reducer';
import { deriveView } from '@/core/view';
import { installKeyboard, keyResolvers, spaceCommand, type KeyboardActions } from '../Keyboard';

function setup(target: EventTarget = new EventTarget()) {
    let t = 0;
    const actions: KeyboardActions = { toggleFullscreen: vi.fn(), toggleBlackout: vi.fn(), toggleClock: vi.fn(), startPause: vi.fn(), reset: vi.fn(), dismiss: vi.fn(), oneSecond: vi.fn() };
    const dispose = installKeyboard(target as unknown as Window, actions, () => t);
    const press = (key: string, init: KeyboardEventInit = {}, at?: number) => {
        if (at !== undefined) t = at;
        target.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true, ...init }));
    };
    return { actions, press, dispose };
}

describe('Keyboard', () => {
    it('maps Space by timer state', () => {
        expect(spaceCommand('ready')).toBe('TIMER_START');
        expect(spaceCommand('running')).toBe('TIMER_PAUSE');
        expect(spaceCommand('overtime')).toBe('TIMER_PAUSE');
        expect(spaceCommand('paused')).toBe('TIMER_RESUME');
        expect(spaceCommand('idle')).toBeNull();
    });

    it('F, B, Space and D trigger their actions', () => {
        const { actions, press } = setup();
        press('f');
        press('B');
        press(' ');
        press('d');
        press('c');
        expect(actions.toggleClock).toHaveBeenCalledTimes(1);
        expect(actions.toggleFullscreen).toHaveBeenCalledTimes(1);
        expect(actions.toggleBlackout).toHaveBeenCalledTimes(1);
        expect(actions.startPause).toHaveBeenCalledTimes(1);
        expect(actions.dismiss).toHaveBeenCalledTimes(1);
    });

    it('R needs a double press within 1 s', () => {
        const { actions, press } = setup();
        press('r', {}, 0);
        press('r', {}, 1_500);
        expect(actions.reset).not.toHaveBeenCalled();
        press('r', {}, 2_400);
        expect(actions.reset).toHaveBeenCalledTimes(1);
        press('r', {}, 2_500); // the pair was consumed
        expect(actions.reset).toHaveBeenCalledTimes(1);
    });

    it('ignores typing in inputs, modifier chords and auto-repeat, and can be disposed', () => {
        const { actions, press, dispose } = setup(window);
        const input = document.createElement('input');
        document.body.appendChild(input);
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true }));
        press('b', { ctrlKey: true });
        press('b', { repeat: true });
        expect(actions.toggleBlackout).not.toHaveBeenCalled();
        dispose();
        press('b');
        expect(actions.toggleBlackout).not.toHaveBeenCalled();
        input.remove();
    });

    it('resolvers decide against the live state', () => {
        const s = createInitialState('P', 0);
        expect(keyResolvers.blackout(s)).toEqual({ name: 'BLACKOUT_ON' });
        expect(keyResolvers.blackout({ ...s, display: { blackout: true, clock: false } })).toEqual({ name: 'BLACKOUT_OFF' });
        expect(keyResolvers.clock(s)).toEqual({ name: 'CLOCK_ON' });
        expect(keyResolvers.clock({ ...s, display: { blackout: false, clock: true } })).toEqual({ name: 'CLOCK_OFF' });
        expect(keyResolvers.startPause(s)).toBeNull();
        expect(keyResolvers.startPause({ ...s, timer: { status: 'ready', durationMs: 1000 } })).toEqual({ name: 'TIMER_START' });
        expect(keyResolvers.reset(s)).toBeNull();
        expect(keyResolvers.reset({ ...s, timer: { status: 'ready', durationMs: 1000 } })).toEqual({ name: 'TIMER_RESET' });
        expect(keyResolvers.dismiss(s)).toBeNull();
        const msg = { status: 'showing' as const, id: 'm', text: 't', mode: 'persistent' as const, durationMs: null, shownAtWall: 0, expiresAtWall: null, corner: 'tr' as const };
        expect(keyResolvers.dismiss({ ...s, message: msg })).toEqual({ name: 'MESSAGE_DISMISS', payload: { id: 'm' } });
    });

    it('Tab sets 00:01 (Shift+Tab does nothing) and keeps focus where it is', () => {
        const { actions, press } = setup();
        const e = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
        const target = new EventTarget();
        const other = setup(target);
        target.dispatchEvent(e);
        expect(e.defaultPrevented).toBe(true);
        expect(other.actions.oneSecond).toHaveBeenCalledTimes(1);
        press('Tab', { shiftKey: true });
        expect(actions.oneSecond).not.toHaveBeenCalled();
    });

    it('Tab → 00:01 from any timer state, and replaces the clock on the stage', () => {
        const T = new Date(2026, 10, 18, 14, 45, 30).getTime();
        let s = createInitialState('P', T);
        s = { ...s, display: { blackout: false, clock: true } };
        expect(deriveView(s, T).kind).toBe('clock');
        for (const timer of [
            { status: 'idle' as const },
            { status: 'running' as const, durationMs: 600_000, endsAtWall: T + 300_000, startedAtWall: T - 300_000 },
            { status: 'paused' as const, durationMs: 600_000, remainingMs: 42_000, pausedAtWall: T },
        ]) {
            const r = apply({ ...s, timer } as typeof s, command(keyResolvers.oneSecond().name, keyResolvers.oneSecond().payload), T);
            expect(r.ok).toBe(true);
            const next = (r as { state: typeof s }).state;
            expect(next.timer).toEqual({ status: 'ready', durationMs: 1000 });
            expect(deriveView(next, T)).toMatchObject({ kind: 'timer', text: '00:01' });
            expect(next.display.clock).toBe(true); // clearing the timer brings the clock back
        }
    });
});
