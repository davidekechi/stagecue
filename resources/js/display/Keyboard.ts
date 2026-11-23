// LLD §4.5 / D13 — local Display controls. Work with no network at all.
import type { CommandName, PresentationState, TimerStatus } from '@/core/types';

/** Each action resolves against the live state when it runs (see DisplayRuntime.localResolve). */
export interface KeyboardActions {
    toggleFullscreen(): void;
    toggleBlackout(): void;
    /** Show / hide the time of day over everything (A23, A26). */
    toggleClock(): void;
    /** Start / pause / resume depending on the timer state (see `spaceCommand`). */
    startPause(): void;
    reset(): void;
    dismiss(): void;
    /** Tab: set the timer to 00:01 from any state (product owner request). */
    oneSecond(): void;
}

export const ONE_SECOND_MS = 1_000;

export const RESET_CONFIRM_MS = 1_000;

/** What Space does in each timer state. */
export function spaceCommand(status: TimerStatus): CommandName | null {
    switch (status) {
        case 'ready':
            return 'TIMER_START';
        case 'running':
        case 'overtime':
            return 'TIMER_PAUSE';
        case 'paused':
            return 'TIMER_RESUME';
        case 'idle':
            return null;
    }
}

function isTyping(target: EventTarget | null): boolean {
    if (!target || typeof (target as HTMLElement).tagName !== 'string') return false;
    const el = target as HTMLElement;
    const tag = el.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
}

/** Installs the keyboard map on `target` and returns a disposer. */
export function installKeyboard(target: Pick<Window, 'addEventListener' | 'removeEventListener'>, actions: KeyboardActions, now: () => number = () => Date.now()): () => void {
    let lastResetPress = -Infinity;

    const onKey = (e: KeyboardEvent) => {
        if (e.defaultPrevented || e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
        switch (e.key) {
            case 'f':
            case 'F':
                e.preventDefault();
                actions.toggleFullscreen();
                break;
            case 'b':
            case 'B':
                e.preventDefault();
                actions.toggleBlackout();
                break;
            case 'c':
            case 'C':
                e.preventDefault();
                actions.toggleClock();
                break;
            case ' ':
            case 'Spacebar':
                e.preventDefault();
                actions.startPause();
                break;
            case 'r':
            case 'R': {
                e.preventDefault();
                const t = now();
                if (t - lastResetPress <= RESET_CONFIRM_MS) {
                    lastResetPress = -Infinity;
                    actions.reset();
                } else {
                    lastResetPress = t;
                }
                break;
            }
            case 'Tab':
                // Also keeps Tab from moving focus around the stage.
                e.preventDefault();
                if (!e.shiftKey) actions.oneSecond();
                break;
            case 'd':
            case 'D':
                e.preventDefault();
                actions.dismiss();
                break;
            // Esc: the browser exits fullscreen natively; the SetupPanel reappears on fullscreenchange.
        }
    };

    target.addEventListener('keydown', onKey as EventListener);
    return () => target.removeEventListener('keydown', onKey as EventListener);
}

/** Resolvers for the keyboard actions, evaluated against the state inside the commit queue. */
export const keyResolvers = {
    blackout: (s: PresentationState) => ({ name: (s.display.blackout ? 'BLACKOUT_OFF' : 'BLACKOUT_ON') as CommandName }),
    clock: (s: PresentationState) => ({ name: (s.display.clock ? 'CLOCK_OFF' : 'CLOCK_ON') as CommandName }),
    startPause: (s: PresentationState) => {
        const name = spaceCommand(s.timer.status);
        return name ? { name } : null;
    },
    reset: (s: PresentationState) => (s.timer.status === 'idle' ? null : { name: 'TIMER_RESET' as CommandName }),
    clockOff: (s: PresentationState) => (s.display.clock ? { name: 'CLOCK_OFF' as CommandName } : null),
    oneSecond: () => ({ name: 'TIMER_SET' as CommandName, payload: { durationMs: ONE_SECOND_MS } }),
    dismiss: (s: PresentationState) => (s.message.status === 'showing' ? { name: 'MESSAGE_DISMISS' as CommandName, payload: { id: s.message.id } } : null),
};
