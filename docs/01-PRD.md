# 01 — Product Requirements Document (PRD)

**Product:** StageCue — a real-time presentation timer with remote messaging
**Stage:** Pre-development · **Hosting:** Laravel Cloud (`*.laravel.cloud` hostname, no custom domain)
**Sources:** Requirements & Implementation Planning Brief + Addendum (Black Screen, Display-without-Start). Both are folded in below.

---

## 1. Purpose

An operator controls what a large screen shows (countdown, announcements, overtime, blackout) from a phone. The laptop that drives the screen must keep presenting correctly when the phone, the internet or the backend fails.

**Priorities:** reliability first, presentation experience second, extra features third.

## 2. Personas

| Persona | Device | Needs |
|---|---|---|
| **Operator** | Smartphone (Android/iOS), PWA or browser | Fast, large touch controls. A clear connection status. Confidence that a command landed. A preview before going live. |
| **Technician / setup person** | Laptop + HDMI TV/projector | Simple pairing. Moving the display to the TV. Fullscreen. Screens that do not sleep. |
| **Audience** | Looks at the TV | Large, legible timer and messages. Nothing else on screen: no admin UI, no status dots. |

## 3. Application modes

| Mode | Route | Device | Description |
|---|---|---|---|
| Display | `/display` | Laptop → TV | The audience-facing stage. It is authoritative for presentation state. A setup panel shows only when not in fullscreen. |
| Controller | `/control` | Phone | Operator console: timer, messages, blackout, preview, connection status. |
| Pair | `/pair` (also `/pair#t=<token>`) | Phone | Join a session with a QR code or a 6-character code. |
| Preview | Inside `/control` | Phone | A local simulation of the Display. It never affects the live Display. |
| Home | `/` | Any | Choose "Use this device as Display" or "Use this device as Controller". Install hints. |

## 4. Core user flows

### F1 — First-time setup
1. The technician opens `https://<app>.laravel.cloud/display` on the laptop. The laptop's display mode is set to **Extend**.
2. The Display creates a session and shows a QR code, a 6-character code and its connection status in the setup panel.
3. The operator opens `/pair` on the phone. They scan the QR code with the in-app scanner, or type the code.
4. The phone receives a controller token. The setup panel shows "Controller connected: <device name>".
5. The technician clicks **Present on screen…** (Window Management API), or drags the window to the TV and presses **F**. The Display goes fullscreen and hides all admin UI.

### F2 — Running a talk
1. The operator sets 15:00 → **Display Timer**. The TV shows `15:00`, paused.
2. **Start** → the countdown begins.
3. The operator types an announcement, picks **top-right** and **10 s**, checks the **Preview**, then taps **Send Live**.
4. On the TV the timer glides and shrinks into the top-right corner and the message fills the stage. After 10 s the timer glides back.
5. At zero, the TV turns red: **TIME UP!** `+00:00:01`…
6. The operator presses **Reset** (back to `15:00` ready) or **Clear Timer** (stand-by).

### F3 — Failure while live
- The phone loses Wi-Fi. The TV keeps counting and messages expire on schedule. The phone shows **Disconnected**, and its live buttons are disabled or turned into drafts.
- The phone reconnects. It shows **Synchronizing**, receives the Display's state and shows **Connected**. Nothing the phone held overrides the Display.

### F4 — Blackout
- The operator taps **Black Screen**: it sits in a separate, red-bordered zone and needs a hold or a double tap. The TV goes pure black. The timer and message keep running inside.
- **Restore Display** → the TV shows whatever is correct *now* (for example, overtime if the timer expired during the blackout).

## 5. Functional requirements (MVP — all mandatory)

IDs are referenced by the backlog and the tests.

### 5.1 Timer engine (FR-T)
| ID | Requirement |
|---|---|
| FR-T1 | Configure hours, minutes and seconds (0:00:01 – 23:59:59). |
| FR-T2 | States: `idle`, `ready` (configured, never started), `running`, `paused` (was running), `overtime` (running past zero). `ready` and `paused` look the same but are separate states internally. |
| FR-T3 | **Display Timer** (`TIMER_SET`) shows the configured duration paused, and it stays unchanged indefinitely. |
| FR-T4 | **Start** (`TIMER_START`) only from `ready`. |
| FR-T5 | **Pause** from `running` or `overtime`. **Resume** from `paused`. |
| FR-T6 | **Reset** → `ready` with the configured duration. **Clear** → `idle`. |
| FR-T7 | Format `H:MM:SS` when ≥ 1 h, otherwise `MM:SS`. Overtime is shown as `+HH:MM:SS`, always with hours (e.g. `+00:04:32`). |
| FR-T8 | Remaining time is computed from an absolute end timestamp. The display updates at least once a second, aligned to second boundaries. |
| FR-T9 | Stays correct across tab suspension, device sleep, reload, browser restart and system clock changes (rules in LLD §5.2). |
| FR-T10 | Enters overtime automatically at zero, and the count-up continues until pause, reset or clear. |

### 5.2 Message engine (FR-M)
| ID | Requirement |
|---|---|
| FR-M1 | Multiline text, up to 500 characters, with line breaks kept. |
| FR-M2 | **Timed** (5/10/15/30/60 s or custom 1–600 s) or **Persistent** (until it is replaced or dismissed). |
| FR-M3 | A new message replaces the current one immediately, and its timer starts fresh. |
| FR-M4 | Manual dismissal at any time (`MESSAGE_DISMISS`). |
| FR-M5 | Message expiry runs on the Display and does not depend on connectivity. |
| FR-M6 | Messages never change the timer's status (they never start, pause or reset it). |
| FR-M7 | Overtime interaction per Ambiguity A2. Setting `overtimeInterruptsMessage` defaults to `false`. |

### 5.3 Stage rendering & animation (FR-R)
| ID | Requirement |
|---|---|
| FR-R1 | With no message, the timer is centred at full size. |
| FR-R2 | With a message, the timer moves to the chosen corner (TL/TR/BL/BR) at about 28% scale over **500 ms**, using a transform-only animation. The message fills the remaining safe area. |
| FR-R3 | Replacing a message keeps the timer in place. If the corner changes, the timer animates to the new corner without disappearing. |
| FR-R4 | After dismissal or expiry, the timer animates back to the centre. |
| FR-R5 | Overtime screen: red background (`#C8102E`), white text, a large bold **TIME UP!** and a large overtime counter. |
| FR-R6 | Blackout: pure `#000` across the whole viewport. No elements are visible, and the cursor is hidden. |
| FR-R7 | Message text auto-fits to the largest size that fits the area (binary-search fit). Minimum readable size is 4vh. |
| FR-R8 | Timer digits use tabular numerals, so the digits do not jitter. |
| FR-R9 | Idle stand-by screen: plain black (configurable later). The StageCue mark is not shown to the audience. |

### 5.4 Display experience (FR-D)
| ID | Requirement |
|---|---|
| FR-D1 | A fullscreen toggle (button + `F`). It uses the Window Management API to choose a screen where that API is available. |
| FR-D2 | No admin controls are visible while in fullscreen. A setup panel shows only outside fullscreen. |
| FR-D3 | Screen Wake Lock while presenting, re-acquired when the page becomes visible again. |
| FR-D4 | Responsive from 1280×720 up to 3840×2160, plus 4:3 projectors. A safe area of 5% on every side. |
| FR-D5 | Local keyboard controls (D13). |
| FR-D6 | Built-in "Connect to TV" instructions in the setup panel, covering Windows (`Win+P` → Extend) and macOS (Displays → Extend). |
| FR-D7 | State recovery after a reload or restart, as documented in HLD §9. |
| FR-D8 | Only one authoritative Display tab per browser (Web Locks). A second tab shows "StageCue Display is already open in another window". |

### 5.5 Controller (FR-C)
| ID | Requirement |
|---|---|
| FR-C1 | Controls: Display Timer, Start, Pause, Resume, Reset, Clear Timer, Send Message, Clear Message, Black Screen, Restore Display, Preview. |
| FR-C2 | Duration picker (H/M/S steppers + quick chips 5/10/15/20/30 min). Corner picker. Message duration picker. |
| FR-C3 | A live mirror of the Display showing current state, remaining time and blackout. |
| FR-C4 | Every button shows its pending, confirmed or failed state, using the ack. |
| FR-C5 | Two indicators: **Server** (online/offline) and **Display** (connected / reconnecting / synchronizing / disconnected). |
| FR-C6 | While the Display is not connected, live buttons are disabled. Messages can be saved as **pending drafts**, and the operator re-sends them by hand. |
| FR-C7 | Black Screen is visually distinct (red zone) and needs a hold of 600 ms. Restore Display needs one tap and is very prominent when blackout is active. |
| FR-C8 | Touch targets ≥ 48 px, one-handed layout, works at 360×640. |
| FR-C9 | Disconnect / unpair this phone. |

### 5.6 Preview (FR-P)
| ID | Requirement |
|---|---|
| FR-P1 | Renders the same `Stage` component as the Display, in a 16:9 frame, scaled down. |
| FR-P2 | Previews the draft (the message, corner and timer about to be sent) applied to a **clone** of the latest Display state through the pure reducer. |
| FR-P3 | Can simulate overtime and the compact timer ("Preview as overtime" toggle). |
| FR-P4 | Nothing in the preview is sent until the operator taps **Send Live**. |

### 5.7 Pairing, real-time, connection (FR-S)
| ID | Requirement |
|---|---|
| FR-S1 | The Display creates a session with an unguessable ID and a display token. |
| FR-S2 | Pairing by QR (a 32-byte token in the URL fragment) or a 6-character code (Crockford base32 without ambiguous characters). Both are one-time and expire after 10 minutes. |
| FR-S3 | The Display can regenerate the code and revoke the controller. |
| FR-S4 | Commands reach the Display in < 500 ms (p95) under normal network conditions. |
| FR-S5 | Heartbeat 3 s, peer considered lost after 9 s, reconnect with exponential back-off and jitter. |
| FR-S6 | On reconnect the Controller authenticates, requests the state, applies it and shows Synchronized. |
| FR-S7 | Duplicate commands have no effect (idempotent by `commandId`). |

### 5.8 Offline & PWA (FR-O)
| ID | Requirement |
|---|---|
| FR-O1 | The service worker precaches the app shell and assets. It is network-first for navigations, falling back to the cached shell. |
| FR-O2 | The Display's state is in IndexedDB and is written on every significant action. |
| FR-O3 | The app can be installed on Chrome/Edge desktop, Android Chrome and iOS Safari (Add to Home Screen). |
| FR-O4 | `navigator.storage.persist()` is requested on the Display. |

## 6. Non-functional requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-1 | Reliability | Zero dependence on the network for a presentation in progress. No uncaught errors stop the tick loop: the engine is wrapped in an error boundary that keeps the last good state. |
| NFR-2 | Accuracy | Timer drift < 100 ms over 2 h, measured against the wall clock without suspension. After a suspension it re-syncs within 1 s of resuming. |
| NFR-3 | Latency | Controller tap → Display render < 500 ms p95. Controller ack shown < 800 ms p95. |
| NFR-4 | Performance | Display CPU < 5% on a mid-range laptop when idle-ticking. Only the digits re-render. Animations stay at 60 fps (transform/opacity only). |
| NFR-5 | Usability | Pairing in < 60 s for a first-time user. No account needed. |
| NFR-6 | Security | HTTPS only, hashed tokens, rate limiting, per-session authorisation, one-time pairing secrets. |
| NFR-7 | Compatibility | Display: Chrome/Edge (primary), Safari macOS and Firefox (secondary). Controller: Android Chrome, iOS Safari 16.4+. |
| NFR-8 | Accessibility | Controller: WCAG AA contrast and screen-reader labels. Display: high contrast by default. |
| NFR-9 | Maintainability | Core engines at ≥ 90% line coverage. Contract fixtures shared by PHP and TS tests. |

## 7. MVP vs post-MVP feature matrix

| Feature | MVP | Post-MVP | Notes |
|---|:-:|:-:|---|
| Timer engine (set/start/pause/resume/reset/clear) | ✅ | | |
| Display Timer without starting (`ready` state) | ✅ | | Addendum |
| Overtime mode (red, TIME UP, count-up) | ✅ | | |
| Message engine (timed/persistent/replace/dismiss) | ✅ | | |
| Animated corner repositioning | ✅ | | |
| Black Screen / Restore Display | ✅ | | Addendum |
| Fullscreen Display + setup panel | ✅ | | |
| Window Management API screen picker | ✅ | | Progressive enhancement |
| Wake Lock | ✅ | | |
| Keyboard local controls | ✅ | | |
| Mobile Controller + Preview | ✅ | | |
| QR + code pairing, revoke | ✅ | | |
| Reverb real-time, heartbeat, reconnect | ✅ | | |
| IndexedDB persistence + reload recovery | ✅ | | |
| Idempotent commands, pending drafts | ✅ | | |
| PWA install + offline shell | ✅ | | |
| In-app QR scanner | ✅ | | Required for iOS PWA (HLD R4) |
| Quick timer chips (fixed list) | ✅ | | Trivial. Not user-saved presets. |
| Saved timer presets | | ✅ | |
| Saved message templates | | ✅ | |
| Multiple controllers / roles / conflict UI | | ✅ | |
| User accounts, login, password reset, social login | | ✅ | |
| Multiple displays per account | | ✅ | |
| Branding (logos, backgrounds, fonts, colours, themes) | | ✅ | The theme tokens in the MVP make this cheaper later |
| Custom TIME UP text | | ✅ | |
| Advanced layouts and transitions | | ✅ | |
| History / analytics | | ✅ | `session_commands` log is a seed |
| Local Wi-Fi fallback (WebRTC) | | ✅ | Investigated only |
| Subscriptions, payments, multi-tenant, admin dashboard | | ✅ | |
| Custom domain | | ✅ | Origin migration procedure documented |

## 8. MVP Definition of Done

The brief and the addendum together give 23 criteria. Each one maps to a test ID in 05-Test-Plan.

1. Timer configured and started from the phone (E2E-01).
2. The Display shows the timer in fullscreen (RW-02).
3. Messages are sent from the phone (E2E-04).
4. The timer animates into all four corners (CMP-05, E2E-05).
5. Messages appear without interrupting the countdown (E2E-06).
6. Messages expire automatically or are dismissed manually (E2E-07, E2E-08).
7. The Display keeps working without the phone (OFF-01).
8. The Display keeps working without the internet (OFF-02).
9. The Display recovers its state after a reload or restart (OFF-05, OFF-06).
10. Overtime starts automatically at zero (UNIT-T-09, E2E-09).
11. Overtime shows red with TIME UP and a counter (CMP-06).
12. Both devices show connection status accurately (WS-04, OFF-03).
13. Reconnection synchronises the phone (WS-05).
14. Installable as a PWA (PWA-01..04).
15. Tested on a laptop connected to an external TV or monitor (RW-01..RW-05).
16. Display a timer without starting it (E2E-02).
17. It stays paused until started (E2E-03, 5-minute wait).
18. Sending a message does not start a paused timer (E2E-10).
19. Black Screen blanks the Display (E2E-11).
20. Black Screen does not interrupt the timer, message expiry or overtime (UNIT-R-04, E2E-12).
21. Restore shows the correct current state (E2E-13).
22. Black Screen keeps working offline (OFF-08, OFF-09).
23. The Display restores correctly after a reload or a suspension during blackout (OFF-10).
