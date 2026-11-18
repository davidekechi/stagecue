// LLD §3.3 — the presentation reducer. Pure: `now` is an effective wall time supplied by the caller.
import { DESTRUCTIVE, isCommandName } from './commands';
import { ulid } from './ids';
import * as msg from './message';
import { payloadSchemas } from './schemas';
import * as timer from './timer';
import type {
    Action,
    ApplyResult,
    DomainEvent,
    MessageDismissPayload,
    MessageShowPayload,
    PresentationState,
    RejectCode,
    Settings,
    SettingsUpdatePayload,
    TimerSetPayload,
} from './types';

export const DEFAULT_SETTINGS: Settings = {
    defaultCorner: 'tr',
    overtimeInterruptsMessage: false,
    defaultMessageDurationMs: 10_000,
};

export interface ReducerDeps {
    /** Generates a new presentation epoch id (ULID). Injectable for deterministic tests. */
    newPresentationId: (now: number) => string;
}

const defaultDeps: ReducerDeps = { newPresentationId: (now) => ulid(now) };

export function createInitialState(presentationId: string, now: number, settings: Settings = DEFAULT_SETTINGS): PresentationState {
    return {
        schema: 1,
        presentationId,
        revision: 0,
        display: { blackout: false, clock: false },
        timer: { status: 'idle' },
        message: { status: 'none' },
        settings: { ...settings },
        updatedAtWall: now,
    };
}

const MESSAGES: Record<RejectCode, string> = {
    INVALID_STATE: 'That action is not possible in the current timer state.',
    INVALID_PAYLOAD: 'The command was malformed.',
    STALE: 'Command arrived too late — not applied.',
    STALE_VIEW: 'The display changed. Confirm again?',
    DUPLICATE: 'This command was already processed.',
    UNKNOWN_COMMAND: 'Unknown command.',
};

export function reject(code: RejectCode, message: string = MESSAGES[code]): ApplyResult {
    return { ok: false, code, message };
}

type Step = { state: PresentationState; events: DomainEvent[]; changed: boolean };

const unchanged = (state: PresentationState): Step => ({ state, events: [], changed: false });

function validate(a: Action): { ok: true; payload: unknown } | { ok: false; result: ApplyResult } {
    if (a.kind === 'internal') return { ok: true, payload: undefined };
    if (!isCommandName(a.name)) return { ok: false, result: reject('UNKNOWN_COMMAND') };
    const parsed = payloadSchemas[a.name].safeParse(a.payload ?? {});
    if (!parsed.success) {
        const detail = parsed.error.issues[0]?.message;
        return { ok: false, result: reject('INVALID_PAYLOAD', detail ? `The command was malformed: ${detail}` : MESSAGES.INVALID_PAYLOAD) };
    }
    return { ok: true, payload: parsed.data };
}

function timerStep(s: PresentationState, r: timer.TimerResult, event: DomainEvent): Step | ApplyResult {
    if (!r.ok) return reject(r.code);
    return { state: { ...s, timer: r.timer }, events: [event], changed: true };
}

/**
 * Applies one action. Never throws for well-typed input; invalid input produces a rejection.
 * After any `changed:true` result the revision is incremented and `updatedAtWall = now`.
 */
export function apply(s: PresentationState, a: Action, now: number, deps: ReducerDeps = defaultDeps): ApplyResult {
    const v = validate(a);
    if (!v.ok) return v.result;

    if (a.kind === 'command' && DESTRUCTIVE.has(a.name) && a.baseRevision !== null && a.baseRevision < s.revision) {
        return reject('STALE_VIEW');
    }

    let step: Step | ApplyResult;
    switch (a.name) {
        case 'TIMER_SET':
            step = timerStep(s, timer.set(s.timer, (v.payload as TimerSetPayload).durationMs), 'TimerSet');
            break;
        case 'TIMER_START':
            step = timerStep(s, timer.start(s.timer, now), 'TimerStarted');
            break;
        case 'TIMER_PAUSE':
            step = timerStep(s, timer.pause(s.timer, now), 'TimerPaused');
            break;
        case 'TIMER_RESUME':
            step = timerStep(s, timer.resume(s.timer, now), 'TimerResumed');
            break;
        case 'TIMER_RESET':
            step = timerStep(s, timer.reset(s.timer), 'TimerReset');
            break;
        case 'TIMER_CLEAR':
            step = timerStep(s, timer.clear(s.timer), 'TimerCleared');
            break;
        case 'TIMER_EXPIRED': {
            // Idempotent: ignored unless the running timer has actually reached its end.
            const r = timer.expire(s.timer, now);
            if (!r.ok) {
                step = unchanged(s);
                break;
            }
            const events: DomainEvent[] = ['TimerExpired', 'OvertimeStarted'];
            let message = s.message;
            if (s.settings.overtimeInterruptsMessage && message.status === 'showing') {
                message = { status: 'none' };
                events.push('MessageDismissed');
            }
            step = { state: { ...s, timer: r.timer, message }, events, changed: true };
            break;
        }
        case 'MESSAGE_SHOW': {
            const payload = v.payload as MessageShowPayload;
            const replaced = s.message.status === 'showing';
            step = {
                state: { ...s, message: msg.show(payload, now, s.settings.defaultCorner) },
                events: [replaced ? 'MessageReplaced' : 'MessageShown'],
                changed: true,
            };
            break;
        }
        case 'MESSAGE_DISMISS': {
            const r = msg.dismiss(s.message, (v.payload as MessageDismissPayload).id);
            step = r.changed ? { state: { ...s, message: r.message }, events: ['MessageDismissed'], changed: true } : unchanged(s);
            break;
        }
        case 'MESSAGE_EXPIRED': {
            const r = msg.expire(s.message, now);
            step = r.changed ? { state: { ...s, message: r.message }, events: ['MessageExpired'], changed: true } : unchanged(s);
            break;
        }
        case 'BLACKOUT_ON':
            step = s.display.blackout ? unchanged(s) : { state: { ...s, display: { ...s.display, blackout: true } }, events: ['BlackoutOn'], changed: true };
            break;
        case 'BLACKOUT_OFF':
            step = !s.display.blackout ? unchanged(s) : { state: { ...s, display: { ...s.display, blackout: false } }, events: ['BlackoutOff'], changed: true };
            break;
        case 'CLOCK_ON':
            step = s.display.clock ? unchanged(s) : { state: { ...s, display: { ...s.display, clock: true } }, events: ['ClockShown'], changed: true };
            break;
        case 'CLOCK_OFF':
            step = !s.display.clock ? unchanged(s) : { state: { ...s, display: { ...s.display, clock: false } }, events: ['ClockHidden'], changed: true };
            break;
        case 'SETTINGS_UPDATE': {
            const patch = v.payload as SettingsUpdatePayload;
            const settings: Settings = { ...s.settings, ...stripUndefined(patch) };
            const differs = (Object.keys(settings) as (keyof Settings)[]).some((k) => settings[k] !== s.settings[k]);
            step = differs ? { state: { ...s, settings }, events: ['SettingsUpdated'], changed: true } : unchanged(s);
            break;
        }
        case 'PRESENTATION_NEW': {
            // A new epoch: revision restarts at 0 (it is not incremented below).
            const created = createInitialState(deps.newPresentationId(now), now, s.settings);
            const fresh = { ...created, display: { ...created.display, clock: s.display.clock } };
            return { ok: true, state: fresh, events: ['PresentationStarted'], changed: true };
        }
        case 'SYNC_REQUEST':
            step = unchanged(s);
            break;
        default: {
            const _exhaustive: never = a;
            return reject('UNKNOWN_COMMAND', `Unknown action ${String((_exhaustive as Action).name)}`);
        }
    }

    if ('ok' in step) return step;
    if (!step.changed) return { ok: true, state: s, events: [], changed: false };
    return { ok: true, state: { ...step.state, revision: s.revision + 1, updatedAtWall: now }, events: step.events, changed: true };
}

function stripUndefined<T extends object>(o: T): Partial<T> {
    return Object.fromEntries(Object.entries(o).filter(([, value]) => value !== undefined)) as Partial<T>;
}

export const command = (
    name: Extract<Action, { kind: 'command' }>['name'],
    payload: unknown = {},
    opts: { commandId?: string; baseRevision?: number | null } = {},
): Action => ({ kind: 'command', name, payload, commandId: opts.commandId ?? 'local', baseRevision: opts.baseRevision ?? null });

export const internal = (name: Extract<Action, { kind: 'internal' }>['name']): Action => ({ kind: 'internal', name });
