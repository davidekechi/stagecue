# 04 — API & Real-Time Event Specification

Base URL: `https://<env-host>.laravel.cloud/api` · JSON only · `Authorization: Bearer <token>` unless marked public.
Every response includes `X-Server-Time: <epoch ms>`. Contract version field: `v: 1`.

Shared JSON fixtures for every example below live in `resources/js/contracts/fixtures/`. Both the Pest and the Vitest suites assert against them.

---

## 1. REST API

### 1.1 `POST /sessions` — create a display session (public, throttled)
Request
```json
{ "displayName": "Main Hall TV" }
```
Response `201`
```json
{
  "session": { "id": "01JD3Q8Z6R0V5M8K2Y7T1N4B9C", "displayName": "Main Hall TV", "status": "active" },
  "device":  { "id": "01JD3Q8Z7A…", "role": "display" },
  "token": "12|Qm9…",                       // Sanctum plain-text token, shown once
  "pairing": { "code": "7KQ2MX", "token": "q3m…43chars", "expiresAt": 1794660600000,
               "url": "https://stagecue-main-xxxx.laravel.cloud/pair#t=q3m…" },
  "realtime": { "key": "…", "host": "…", "port": 443, "scheme": "https" },
  "serverTime": 1794660000000
}
```

### 1.2 `GET /sessions/{sid}` — session info (display | controller)
`200 { session, device, controller: {id,name,pairedAt}|null, pairing: {...}|null /* display only */ }`
Errors: `403 NOT_SESSION_MEMBER`, `410 SESSION_ENDED`.

### 1.3 `DELETE /sessions/{sid}` — end the session (display)
`204`. Broadcasts `session.ended`, then revokes all tokens.

### 1.4 `POST /sessions/{sid}/pairing/regenerate` (display)
`200 { pairing: {code, token, expiresAt, url} }`. The previous code or token is invalidated.

### 1.5 `POST /pairings` — pair a controller (public, throttled)
Request (exactly one of `code` | `token`)
```json
{ "code": "7KQ2MX", "deviceName": "Dave's iPhone" }
```
Response `201`
```json
{ "session": { "id": "01JD3Q…", "displayName": "Main Hall TV" },
  "device":  { "id": "01JD3R…", "role": "controller" },
  "token": "13|Zx…", "realtime": { … }, "serverTime": 1794660012000 }
```
Errors: `404 PAIRING_INVALID` (same response for unknown and used codes, so it cannot be used for enumeration) · `410 PAIRING_EXPIRED` · `429 RATE_LIMITED`.
Side effects: any previous controller is revoked (`controller.revoked` with reason `replaced`). `controller.paired` goes to the Display.

### 1.6 `DELETE /sessions/{sid}/controller` (display) · `DELETE /sessions/{sid}/controller/self` (controller)
`204`. Broadcasts `controller.revoked` with reason `revoked_by_display` or `left`.

### 1.7 `POST /sessions/{sid}/commands` — relay a command (controller)
Request = the command envelope without the server fields (§3.1).
```json
{ "v": 1, "commandId": "0193a3b4-8c2e-7d11-9f0a-5b2c1e4d6f70", "name": "MESSAGE_SHOW",
  "baseRevision": 41, "issuedAt": 1794660100000,
  "payload": { "id": "0193a3b4-8c2e-7d11-9f0a-aaaaaaaaaaaa", "text": "Please take your seats",
               "mode": "timed", "durationMs": 10000, "corner": "tr" } }
```
Responses
- `202 { "commandId": "…", "seq": 57, "relayedAt": 1794660100090, "status": "relayed" }`
- `200 { …, "duplicate": true, "status": "relayed|applied|rejected", "resultCode": null|"INVALID_STATE" }`: a repeat request. It is re-broadcast only if the status is still `relayed`.
- `422 VALIDATION_FAILED { errors }` · `403` · `410` · `429` · `503 RELAY_UNAVAILABLE (retryable)`

> A `202` means **relayed, not applied**. The Display's ack arrives on the `state` event.

### 1.8 `POST /sessions/{sid}/snapshots` — publish state + acks (display)
```json
{ "v": 1, "presentationId": "01JD3S…", "revision": 42, "capturedAtWall": 1794660100180,
  "state": { /* PresentationState, §3.4 */ },
  "computed": { "timerRemainingMs": 512340, "overtimeMs": 0, "messageRemainingMs": 9910 },
  "lastEvents": ["MessageShown"],
  "acks": [ { "commandId": "0193a3b4-…6f70", "seq": 57, "result": "APPLIED" } ] }
```
`202 { "accepted": true, "stored": true }`. `stored:false` means an older revision than the one already stored (it is still broadcast if it carries acks).

### 1.9 `GET /sessions/{sid}/state` (display | controller)
`200 { "snapshot": {…§1.8 body without acks…} | null, "storedAt": 1794660100200 }`. The Controller treats this as **last known, unconfirmed**.

### 1.10 `POST /sessions/{sid}/heartbeat` (fallback only)
`{ "revision": 42, "presentationId": "…" }` → `204`. Broadcasts `peer.heartbeat` to the opposite role's channel.

### 1.11 `GET /time` (public)
`200 { "serverTime": 1794660000000 }`

### 1.12 `POST /broadcasting/auth` (bearer)
The standard Laravel/Pusher channel authorisation for `private-…` and `presence-…`.

### 1.13 Error codes
| HTTP | code | retryable |
|---|---|---|
| 401 | `UNAUTHENTICATED` (missing, expired or revoked token) | no → the client clears its credentials. A Display re-creates its session and keeps its local state |
| 403 | `NOT_SESSION_MEMBER`, `FORBIDDEN_ROLE` | no |
| 404 | `SESSION_NOT_FOUND`, `PAIRING_INVALID` | no |
| 410 | `SESSION_ENDED`, `PAIRING_EXPIRED` | no |
| 422 | `VALIDATION_FAILED` | no |
| 429 | `RATE_LIMITED` (+`Retry-After`) | yes |
| 503 | `RELAY_UNAVAILABLE` | yes |

---

## 2. WebSocket channels

Client: `laravel-echo` with `broadcaster: 'reverb'`, `authEndpoint: '/api/broadcasting/auth'`, and a bearer header.

| Echo call | Pusher channel | Subscriber | Events |
|---|---|---|---|
| `Echo.private('session.{sid}.display')` | `private-session.{sid}.display` | Display | `.command`, `.controller.paired`, `.controller.revoked`, `.session.ended`, `.peer.heartbeat`* |
| `Echo.private('session.{sid}.controllers')` | `private-session.{sid}.controllers` | Controller | `.state`, `.controller.revoked`, `.session.ended`, `.peer.heartbeat`* |
| `Echo.join('session.{sid}')` | `presence-session.{sid}` | both | `client-heartbeat` (whisper), `here/joining/leaving` |

\* The fallback heartbeat mode only.

---

## 3. Payload schemas

### 3.1 Command envelope (`.command`)
```json
{
  "v": 1,
  "type": "command",
  "sessionId": "01JD3Q8Z6R0V5M8K2Y7T1N4B9C",
  "commandId": "0193a3b4-8c2e-7d11-9f0a-5b2c1e4d6f70",
  "seq": 57,
  "name": "TIMER_START",
  "payload": {},
  "baseRevision": 41,
  "issuer": { "deviceId": "01JD3R…", "role": "controller" },
  "issuedAt": 1794660100000,
  "relayedAt": 1794660100090
}
```
| Field | Set by | Meaning |
|---|---|---|
| `commandId` | Controller | UUIDv7, the idempotency key |
| `seq` | Server | Per-session monotonic. For diagnostics and gap detection |
| `baseRevision` | Controller | The Display revision the operator was looking at |
| `issuedAt` | Controller wall clock | Informational only (clock skew possible) |
| `relayedAt` | Server clock | Used for the 10 s staleness check |

### 3.2 State event (`.state`)
```json
{
  "v": 1, "type": "state", "sessionId": "01JD3Q…",
  "presentationId": "01JD3S…", "revision": 42, "capturedAtWall": 1794660100180,
  "state": { …PresentationState… },
  "computed": { "timerRemainingMs": 512340, "overtimeMs": 0, "messageRemainingMs": 9910 },
  "acks": [ { "commandId": "0193a3b4-…", "seq": 57, "result": "APPLIED" } ]
}
```
`acks[].result` ∈ `APPLIED | REJECTED | DUPLICATE`. When it is `REJECTED`, `code` ∈ `INVALID_STATE | INVALID_PAYLOAD | STALE | STALE_VIEW | UNKNOWN_COMMAND` and `message` is shown to the operator.

### 3.3 Heartbeat whisper (`client-heartbeat`)
```json
{ "v": 1, "role": "display", "deviceId": "01JD3Q8Z7A…", "presentationId": "01JD3S…", "revision": 42, "sentAt": 1794660103000 }
```
If a controller receives a heartbeat whose `revision` > its mirror revision, and no `state` arrives within 1 s, it sends `SYNC_REQUEST` (gap recovery).

### 3.4 PresentationState (example: running timer + timed message + blackout off)
```json
{
  "schema": 1, "presentationId": "01JD3S…", "revision": 42,
  "display": { "blackout": false, "clock": false },
  "timer":   { "status": "running", "durationMs": 900000, "startedAtWall": 1794660000000, "endsAtWall": 1794660900000 },
  "message": { "status": "showing", "id": "0193a3b4-…aaaa", "text": "Please take your seats", "mode": "timed",
               "durationMs": 10000, "shownAtWall": 1794660100150, "expiresAtWall": 1794660110150, "corner": "tr" },
  "settings":{ "defaultCorner": "tr", "overtimeInterruptsMessage": false, "defaultMessageDurationMs": 10000 },
  "updatedAtWall": 1794660100150
}
```

### 3.5 Other events
```json
// .controller.paired
{ "v":1, "deviceId":"01JD3R…", "name":"Dave's iPhone", "pairedAt":1794660012000 }
// .controller.revoked
{ "v":1, "deviceId":"01JD3R…", "reason":"replaced|revoked_by_display|left|session_ended" }
// .session.ended
{ "v":1, "endedAt":1794670000000 }
```

---

## 4. Command catalogue

| Command | Payload | Valid timer states | Destructive | Domain events emitted | Brief's event name |
|---|---|---|:-:|---|---|
| `PRESENTATION_NEW` | `{}` | any | ✔ | PresentationStarted | PresentationStarted |
| `TIMER_SET` | `{durationMs}` | any | ✔ | TimerSet | (Display Timer) |
| `TIMER_START` | `{}` | ready | | TimerStarted | TimerStarted |
| `TIMER_PAUSE` | `{}` | running, overtime | | TimerPaused | TimerPaused |
| `TIMER_RESUME` | `{}` | paused | | TimerResumed | TimerResumed |
| `TIMER_RESET` | `{}` | ready, running, paused, overtime | ✔ | TimerReset | TimerReset |
| `TIMER_CLEAR` | `{}` | any | ✔ | TimerCleared | — |
| `MESSAGE_SHOW` | `{id,text,mode,durationMs?,corner?}` | any | | MessageShown / MessageReplaced | MessageSent |
| `MESSAGE_DISMISS` | `{id?}` | any | | MessageDismissed (or no-op) | MessageDismissed |
| `BLACKOUT_ON` | `{}` | any | | BlackoutOn | — |
| `BLACKOUT_OFF` | `{}` | any | | BlackoutOff | — |
| `CLOCK_ON` | `{}` | any | | ClockShown | — (A23: time of day when no timer is set) |
| `CLOCK_OFF` | `{}` | any | | ClockHidden | — (A23) |
| `SETTINGS_UPDATE` | `{defaultCorner?, overtimeInterruptsMessage?, defaultMessageDurationMs?}` | any | | SettingsUpdated | — |
| `SYNC_REQUEST` | `{}` | any | | — (publishes a snapshot) | (Reconnecting/Sync) |
| *internal* `TIMER_EXPIRED` | — | running | | TimerExpired, OvertimeStarted | TimerExpired, OvertimeStarted |
| *internal* `MESSAGE_EXPIRED` | — | — | | MessageExpired | — |
| *(server)* pairing | — | — | | controller.paired / revoked | ControllerConnected / ControllerDisconnected |
| *(any change)* | — | — | | `.state` broadcast | PresentationStateUpdated |

The domain events are carried in the snapshot as `lastEvents: DomainEvent[]` (the events produced by the revision that was just applied). The Controller can use them to show toasts such as "Timer expired — overtime".

## 5. Acknowledgement requirements

| Rule | Value |
|---|---|
| Every remote command gets exactly one ack per delivery (`APPLIED`, `REJECTED` or `DUPLICATE`) | mandatory |
| The ack travels in the next snapshot POST, so the ack and the resulting state arrive together | mandatory |
| Controller ack timeout | 3 s → `unconfirmed`, with Retry (same `commandId`) |
| The server marks `session_commands.status` from the acks | mandatory (diagnostics) |
| Local keyboard actions | They are not acked, but they do produce snapshots |
