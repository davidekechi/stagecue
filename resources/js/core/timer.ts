// LLD §3.3 / §5.4 — pure timer engine. Truth is an absolute end timestamp; nothing decrements.
import { formatCountdown, formatOvertime } from './format';
import type { RejectCode, TimerState } from './types';

export type TimerResult = { ok: true; timer: TimerState } | { ok: false; code: RejectCode };

const invalid = (): TimerResult => ({ ok: false, code: 'INVALID_STATE' });

export function set(_timer: TimerState, durationMs: number): TimerResult {
    return { ok: true, timer: { status: 'ready', durationMs } };
}

export function start(timer: TimerState, now: number): TimerResult {
    if (timer.status !== 'ready') return invalid();
    return { ok: true, timer: { status: 'running', durationMs: timer.durationMs, endsAtWall: now + timer.durationMs, startedAtWall: now } };
}

export function pause(timer: TimerState, now: number): TimerResult {
    if (timer.status !== 'running' && timer.status !== 'overtime') return invalid();
    return {
        ok: true,
        timer: {
            status: 'paused',
            durationMs: timer.durationMs,
            remainingMs: timer.endsAtWall - now,
            pausedAtWall: now,
            startedAtWall: timer.startedAtWall,
        },
    };
}

export function resume(timer: TimerState, now: number): TimerResult {
    if (timer.status !== 'paused') return invalid();
    const endsAtWall = now + timer.remainingMs;
    const status = timer.remainingMs > 0 ? 'running' : 'overtime';
    return { ok: true, timer: { status, durationMs: timer.durationMs, endsAtWall, startedAtWall: timer.startedAtWall } };
}

export function reset(timer: TimerState): TimerResult {
    if (timer.status === 'idle') return invalid();
    return { ok: true, timer: { status: 'ready', durationMs: timer.durationMs } };
}

export function clear(_timer: TimerState): TimerResult {
    return { ok: true, timer: { status: 'idle' } };
}

/** Internal TIMER_EXPIRED: running → overtime with the same end timestamp. */
export function expire(timer: TimerState, now: number): TimerResult {
    if (timer.status !== 'running' || now < timer.endsAtWall) return invalid();
    return { ok: true, timer: { status: 'overtime', durationMs: timer.durationMs, endsAtWall: timer.endsAtWall, startedAtWall: timer.startedAtWall } };
}

export function isExpired(timer: TimerState, now: number): boolean {
    return timer.status === 'running' && now >= timer.endsAtWall;
}

export interface Readout {
    /** Remaining ms; ≤ 0 means overtime. */
    remainingMs: number;
    overtimeMs: number;
    text: string;
    overtime: boolean;
    /** True when the clock is not moving (ready or paused). */
    paused: boolean;
}

/** Derives the visible readout at `now`. `null` when the timer is idle (nothing to show). */
export function readout(timer: TimerState, now: number): Readout | null {
    let remainingMs: number;
    let paused: boolean;
    switch (timer.status) {
        case 'idle':
            return null;
        case 'ready':
            remainingMs = timer.durationMs;
            paused = true;
            break;
        case 'paused':
            remainingMs = timer.remainingMs;
            paused = true;
            break;
        case 'running':
        case 'overtime':
            remainingMs = timer.endsAtWall - now;
            paused = false;
            break;
        default: {
            const _exhaustive: never = timer;
            return _exhaustive;
        }
    }
    const overtime = timer.status === 'overtime' || remainingMs <= 0;
    const overtimeMs = overtime ? Math.max(0, -remainingMs) : 0;
    return { remainingMs, overtimeMs, overtime, paused, text: overtime ? formatOvertime(overtimeMs) : formatCountdown(remainingMs) };
}
