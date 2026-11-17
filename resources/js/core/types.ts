// LLD §3.1 — shared domain types. Pure: no imports from the app.

export type Corner = 'tl' | 'tr' | 'bl' | 'br';

export type TimerState =
    | { status: 'idle' }
    | { status: 'ready'; durationMs: number } // never started since SET/RESET
    | { status: 'running'; durationMs: number; endsAtWall: number; startedAtWall: number }
    | { status: 'paused'; durationMs: number; remainingMs: number; pausedAtWall: number; startedAtWall: number } // remainingMs may be < 0 (paused in overtime)
    | { status: 'overtime'; durationMs: number; endsAtWall: number; startedAtWall: number };

export type TimerStatus = TimerState['status'];

export type MessageMode = 'timed' | 'persistent';

export type MessageState =
    | { status: 'none' }
    | {
          status: 'showing';
          id: string;
          text: string;
          mode: MessageMode;
          durationMs: number | null;
          shownAtWall: number;
          expiresAtWall: number | null;
          corner: Corner;
      };

export interface Settings {
    defaultCorner: Corner;
    overtimeInterruptsMessage: boolean;
    defaultMessageDurationMs: number;
}

export interface PresentationState {
    schema: 1;
    presentationId: string;
    revision: number;
    display: { blackout: boolean };
    timer: TimerState;
    message: MessageState;
    settings: Settings;
    updatedAtWall: number;
}

export type CommandName =
    | 'TIMER_SET'
    | 'TIMER_START'
    | 'TIMER_PAUSE'
    | 'TIMER_RESUME'
    | 'TIMER_RESET'
    | 'TIMER_CLEAR'
    | 'MESSAGE_SHOW'
    | 'MESSAGE_DISMISS'
    | 'BLACKOUT_ON'
    | 'BLACKOUT_OFF'
    | 'SETTINGS_UPDATE'
    | 'PRESENTATION_NEW'
    | 'SYNC_REQUEST';

export type InternalEvent = 'TIMER_EXPIRED' | 'MESSAGE_EXPIRED';

export type Action =
    | { kind: 'command'; name: CommandName; payload: unknown; commandId: string; baseRevision: number | null }
    | { kind: 'internal'; name: InternalEvent };

export type RejectCode = 'INVALID_STATE' | 'INVALID_PAYLOAD' | 'STALE' | 'STALE_VIEW' | 'DUPLICATE' | 'UNKNOWN_COMMAND';

export type DomainEvent =
    | 'TimerSet'
    | 'TimerStarted'
    | 'TimerPaused'
    | 'TimerResumed'
    | 'TimerReset'
    | 'TimerCleared'
    | 'TimerExpired'
    | 'OvertimeStarted'
    | 'MessageShown'
    | 'MessageReplaced'
    | 'MessageDismissed'
    | 'MessageExpired'
    | 'BlackoutOn'
    | 'BlackoutOff'
    | 'SettingsUpdated'
    | 'PresentationStarted'
    | 'ClockAdjusted'; // LLD §5.2 (see ambiguity log A12)

export type ApplyResult =
    | { ok: true; state: PresentationState; events: DomainEvent[]; changed: boolean }
    | { ok: false; code: RejectCode; message: string };

// ---- Payloads (04 §4) ----

export interface TimerSetPayload {
    durationMs: number;
}

export interface MessageShowPayload {
    id: string;
    text: string;
    mode: MessageMode;
    durationMs?: number | null;
    corner?: Corner | null;
}

export interface MessageDismissPayload {
    id?: string | null;
}

export type SettingsUpdatePayload = Partial<Settings>;

export type EmptyPayload = Record<string, never>;

export interface CommandPayloads {
    TIMER_SET: TimerSetPayload;
    TIMER_START: EmptyPayload;
    TIMER_PAUSE: EmptyPayload;
    TIMER_RESUME: EmptyPayload;
    TIMER_RESET: EmptyPayload;
    TIMER_CLEAR: EmptyPayload;
    MESSAGE_SHOW: MessageShowPayload;
    MESSAGE_DISMISS: MessageDismissPayload;
    BLACKOUT_ON: EmptyPayload;
    BLACKOUT_OFF: EmptyPayload;
    SETTINGS_UPDATE: SettingsUpdatePayload;
    PRESENTATION_NEW: EmptyPayload;
    SYNC_REQUEST: EmptyPayload;
}

// ---- Wire contracts (04 §3) ----

export type DeviceRole = 'display' | 'controller';

/** What a Controller POSTs to /commands (04 §1.7). */
export interface CommandRequest<N extends CommandName = CommandName> {
    v: 1;
    commandId: string;
    name: N;
    baseRevision: number | null;
    issuedAt: number;
    payload: CommandPayloads[N];
}

/** What the Display receives on `.command` (04 §3.1). */
export interface CommandEnvelope {
    v: 1;
    type: 'command';
    sessionId: string;
    commandId: string;
    seq: number;
    name: CommandName;
    payload: unknown;
    baseRevision: number | null;
    issuer: { deviceId: string; role: DeviceRole };
    issuedAt: number;
    relayedAt: number;
}

export type AckResult = 'APPLIED' | 'REJECTED' | 'DUPLICATE';

export interface Ack {
    commandId: string;
    seq?: number | null;
    result: AckResult;
    code?: RejectCode | null;
    message?: string | null;
}

export interface Computed {
    timerRemainingMs: number | null;
    overtimeMs: number;
    messageRemainingMs: number | null;
}

/** Display → server body (04 §1.8). */
export interface SnapshotBody {
    v: 1;
    presentationId: string;
    revision: number;
    capturedAtWall: number;
    state: PresentationState;
    computed: Computed;
    lastEvents: DomainEvent[];
    acks: Ack[];
}

/** Server → Controller `.state` event (04 §3.2). */
export interface StateEvent extends SnapshotBody {
    type: 'state';
    sessionId: string;
}

export interface HeartbeatPayload {
    v: 1;
    role: DeviceRole;
    deviceId: string;
    presentationId: string | null;
    revision: number | null;
    sentAt: number;
}
