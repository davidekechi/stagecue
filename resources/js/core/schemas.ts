// Runtime validation for every contract (04 §3, §4). Pure: zod only.
import { z } from 'zod';
import type { CommandName } from './types';

export const MAX_TIMER_MS = 86_399_000; // 23:59:59 (FR-T1)
export const MIN_TIMER_MS = 1_000;
export const MAX_MESSAGE_CHARS = 500; // FR-M1
export const MIN_MESSAGE_MS = 1_000;
export const MAX_MESSAGE_MS = 600_000; // FR-M2

const epochMs = z.number().int().nonnegative();
const id = z.string().min(1).max(64);

export const cornerSchema = z.enum(['tl', 'tr', 'bl', 'br']);
export const messageModeSchema = z.enum(['timed', 'persistent']);

export const timerStateSchema = z.discriminatedUnion('status', [
    z.strictObject({ status: z.literal('idle') }),
    z.strictObject({ status: z.literal('ready'), durationMs: z.number().int().positive() }),
    z.strictObject({ status: z.literal('running'), durationMs: z.number().int().positive(), endsAtWall: z.number(), startedAtWall: z.number() }),
    z.strictObject({
        status: z.literal('paused'),
        durationMs: z.number().int().positive(),
        remainingMs: z.number().finite(),
        pausedAtWall: z.number(),
        startedAtWall: z.number(),
    }),
    z.strictObject({ status: z.literal('overtime'), durationMs: z.number().int().positive(), endsAtWall: z.number(), startedAtWall: z.number() }),
]);

export const messageStateSchema = z.discriminatedUnion('status', [
    z.strictObject({ status: z.literal('none') }),
    z.strictObject({
        status: z.literal('showing'),
        id,
        text: z.string().max(MAX_MESSAGE_CHARS),
        mode: messageModeSchema,
        durationMs: z.number().int().positive().nullable(),
        shownAtWall: z.number(),
        expiresAtWall: z.number().nullable(),
        corner: cornerSchema,
    }),
]);

export const settingsSchema = z.strictObject({
    defaultCorner: cornerSchema,
    overtimeInterruptsMessage: z.boolean(),
    defaultMessageDurationMs: z.number().int().min(MIN_MESSAGE_MS).max(MAX_MESSAGE_MS),
});

export const presentationStateSchema = z.strictObject({
    schema: z.literal(1),
    presentationId: id,
    revision: z.number().int().nonnegative(),
    // `clock` was added later (A23): states saved before it load with the clock off.
    display: z.strictObject({ blackout: z.boolean(), clock: z.boolean().default(false) }),
    timer: timerStateSchema,
    message: messageStateSchema,
    settings: settingsSchema,
    updatedAtWall: z.number(),
});

// ---- Command payloads (04 §4, LLD §7.4) ----

const emptyPayload = z.strictObject({});

export const timerSetPayloadSchema = z.strictObject({
    durationMs: z.number().int().min(MIN_TIMER_MS).max(MAX_TIMER_MS),
});

export const messageShowPayloadSchema = z
    .strictObject({
        id: z.uuid(),
        text: z
            .string()
            .max(MAX_MESSAGE_CHARS)
            .refine((t) => t.trim().length > 0, { message: 'Message text must not be blank' }),
        mode: messageModeSchema,
        durationMs: z.number().int().min(MIN_MESSAGE_MS).max(MAX_MESSAGE_MS).nullable().optional(),
        corner: cornerSchema.nullable().optional(),
    })
    .refine((p) => p.mode !== 'timed' || typeof p.durationMs === 'number', {
        message: 'durationMs is required for timed messages',
        path: ['durationMs'],
    });

export const messageDismissPayloadSchema = z.strictObject({ id: z.uuid().nullable().optional() });

export const settingsUpdatePayloadSchema = settingsSchema.partial();

export const payloadSchemas: Record<CommandName, z.ZodType> = {
    TIMER_SET: timerSetPayloadSchema,
    TIMER_START: emptyPayload,
    TIMER_PAUSE: emptyPayload,
    TIMER_RESUME: emptyPayload,
    TIMER_RESET: emptyPayload,
    TIMER_CLEAR: emptyPayload,
    MESSAGE_SHOW: messageShowPayloadSchema,
    MESSAGE_DISMISS: messageDismissPayloadSchema,
    BLACKOUT_ON: emptyPayload,
    BLACKOUT_OFF: emptyPayload,
    CLOCK_ON: emptyPayload,
    CLOCK_OFF: emptyPayload,
    SETTINGS_UPDATE: settingsUpdatePayloadSchema,
    PRESENTATION_NEW: emptyPayload,
    SYNC_REQUEST: emptyPayload,
};

export const commandNameSchema = z.enum([
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
]);

function withValidPayload<T extends { name: CommandName; payload: unknown }>(value: T, ctx: z.RefinementCtx) {
    const result = payloadSchemas[value.name].safeParse(value.payload);
    if (!result.success) {
        for (const issue of result.error.issues) {
            ctx.addIssue({ code: 'custom', message: issue.message, path: ['payload', ...issue.path.map(String)] });
        }
    }
}

// ---- Wire envelopes ----

export const commandRequestSchema = z
    .strictObject({
        v: z.literal(1),
        commandId: z.uuid(),
        name: commandNameSchema,
        baseRevision: z.number().int().nonnegative().nullable(),
        issuedAt: epochMs,
        payload: z.unknown(),
    })
    .superRefine(withValidPayload);

const commandEnvelopeFields = {
    v: z.literal(1),
    type: z.literal('command'),
    sessionId: id,
    commandId: z.uuid(),
    seq: z.number().int().positive(),
    name: commandNameSchema,
    payload: z.unknown(),
    baseRevision: z.number().int().nonnegative().nullable(),
    issuer: z.strictObject({ deviceId: id, role: z.enum(['display', 'controller']) }),
    issuedAt: epochMs,
    relayedAt: epochMs,
};

/** Envelope shape only: the Display's reducer validates the payload and acks INVALID_PAYLOAD (LLD §6.2). */
export const commandEnvelopeBaseSchema = z.object(commandEnvelopeFields);

export const commandEnvelopeSchema = z
    .strictObject({
        v: z.literal(1),
        type: z.literal('command'),
        sessionId: id,
        commandId: z.uuid(),
        seq: z.number().int().positive(),
        name: commandNameSchema,
        payload: z.unknown(),
        baseRevision: z.number().int().nonnegative().nullable(),
        issuer: z.strictObject({ deviceId: id, role: z.enum(['display', 'controller']) }),
        issuedAt: epochMs,
        relayedAt: epochMs,
    })
    .superRefine(withValidPayload);

export const rejectCodeSchema = z.enum(['INVALID_STATE', 'INVALID_PAYLOAD', 'STALE', 'STALE_VIEW', 'DUPLICATE', 'UNKNOWN_COMMAND']);

export const ackSchema = z.strictObject({
    commandId: z.uuid(),
    seq: z.number().int().positive().nullable().optional(),
    result: z.enum(['APPLIED', 'REJECTED', 'DUPLICATE']),
    code: rejectCodeSchema.nullable().optional(),
    message: z.string().max(500).nullable().optional(),
});

export const domainEventSchema = z.enum([
    'TimerSet',
    'TimerStarted',
    'TimerPaused',
    'TimerResumed',
    'TimerReset',
    'TimerCleared',
    'TimerExpired',
    'OvertimeStarted',
    'MessageShown',
    'MessageReplaced',
    'MessageDismissed',
    'MessageExpired',
    'BlackoutOn',
    'BlackoutOff',
    'ClockShown',
    'ClockHidden',
    'SettingsUpdated',
    'PresentationStarted',
    'ClockAdjusted',
]);

export const computedSchema = z.strictObject({
    timerRemainingMs: z.number().nullable(),
    overtimeMs: z.number().nonnegative(),
    messageRemainingMs: z.number().nullable(),
});

const snapshotFields = {
    v: z.literal(1),
    presentationId: id,
    revision: z.number().int().nonnegative(),
    capturedAtWall: epochMs,
    state: presentationStateSchema,
    computed: computedSchema,
    lastEvents: z.array(domainEventSchema).default([]),
    acks: z.array(ackSchema).max(50).default([]),
};

export const snapshotBodySchema = z.strictObject(snapshotFields);

export const stateEventSchema = z.strictObject({
    ...snapshotFields,
    type: z.literal('state'),
    sessionId: id,
});

/** `GET /state` returns the snapshot without acks (04 §1.9). */
export const storedSnapshotSchema = z.object({
    v: z.literal(1),
    presentationId: id,
    revision: z.number().int().nonnegative(),
    capturedAtWall: epochMs,
    state: presentationStateSchema,
    computed: computedSchema,
    lastEvents: z.array(domainEventSchema).optional(),
});

export const heartbeatSchema = z.strictObject({
    v: z.literal(1),
    role: z.enum(['display', 'controller']),
    deviceId: id,
    presentationId: id.nullable(),
    revision: z.number().int().nonnegative().nullable(),
    sentAt: epochMs,
});

export const controllerPairedSchema = z.strictObject({ v: z.literal(1), deviceId: id, name: z.string(), pairedAt: epochMs });
export const controllerRevokedSchema = z.strictObject({
    v: z.literal(1),
    deviceId: id,
    reason: z.enum(['replaced', 'revoked_by_display', 'left', 'session_ended']),
});
export const sessionEndedSchema = z.strictObject({ v: z.literal(1), endedAt: epochMs });
export const peerHeartbeatSchema = z.strictObject({
    v: z.literal(1),
    role: z.enum(['display', 'controller']),
    revision: z.number().int().nonnegative().nullable(),
    presentationId: id.nullable().optional(),
    sentAt: epochMs,
});
