// Command catalogue helpers (04 §4).
import { uuidv7 } from './ids';
import type { CommandName, CommandPayloads, CommandRequest } from './types';

export const COMMAND_NAMES: readonly CommandName[] = [
    'TIMER_SET',
    'TIMER_START',
    'TIMER_PAUSE',
    'TIMER_RESUME',
    'TIMER_RESET',
    'TIMER_CLEAR',
    'MESSAGE_SHOW',
    'MESSAGE_DISMISS',
    'BLACKOUT_ON',
    'BLACKOUT_OFF',
    'CLOCK_ON',
    'CLOCK_OFF',
    'SETTINGS_UPDATE',
    'PRESENTATION_NEW',
    'SYNC_REQUEST',
] as const;

/** Commands that discard what the operator was looking at (A4, A6). */
export const DESTRUCTIVE: ReadonlySet<CommandName> = new Set<CommandName>(['TIMER_SET', 'TIMER_RESET', 'TIMER_CLEAR', 'PRESENTATION_NEW']);

export function isCommandName(value: unknown): value is CommandName {
    return typeof value === 'string' && (COMMAND_NAMES as readonly string[]).includes(value);
}

/** Builds a Controller command request with a fresh UUIDv7 idempotency key. */
export function makeCommand<N extends CommandName>(
    name: N,
    payload: CommandPayloads[N],
    baseRevision: number | null,
    issuedAt: number = Date.now(),
): CommandRequest<N> {
    return { v: 1, commandId: uuidv7(), name, baseRevision, issuedAt, payload };
}
