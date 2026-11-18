# 07 — Implementation Backlog

**Rules for implementation agents**
1. Do the tasks in order within a milestone unless the dependencies allow parallel work. Never start a task whose dependencies are not done.
2. Read the referenced sections of the HLD and LLD before coding. **Do not change architecture, contracts or file layout.** If something seems wrong, stop and record a proposal in `docs/README.md → Ambiguity log` instead.
3. A task is done only when its acceptance criteria are met, its tests are written and passing, `npm run lint && npm run test && vendor/bin/pest` is green, and the change is committed with the message `T<id>: <name>`.
4. `resources/js/core/**` must never import Vue, the DOM, `idb`, Echo or `fetch`.
5. Class: **MVP** unless marked otherwise.

Template: **ID · Name** — Description · Deps · Files · Instructions · Acceptance · Tests

---

## M0 — Foundation & spikes

### T0.1 · Initialise the Laravel application
- **Desc:** A fresh Laravel (latest stable) app on PHP 8.4 with Postgres, Pint and Pest, and the module folders.
- **Deps:** —
- **Files:** whole repo skeleton, `app/Modules/{Sessions,Pairing,Relay}/`, `.editorconfig`, `.gitignore`, `README.md`, `CLAUDE.md`
- **Instructions:** `laravel new` (no starter kit), pick Pest. `php artisan install:api` (Sanctum). `php artisan install:broadcasting` and pick Reverb. Configure `pgsql` locally. Add PSR-4 autoloading for `App\Modules\`. Add a `composer run dev` script running `serve`, `vite`, `reverb:start --debug` and `schedule:work` concurrently.
- **Acceptance:** `composer run dev` boots. `GET /up` returns 200. `vendor/bin/pest` passes.
- **Tests:** the default feature test passes.

### T0.2 · Vue 3 + TypeScript SPA shell
- **Desc:** Vite + Vue 3 + TS strict + vue-router + Pinia + Tailwind v4, served by a catch-all Blade view.
- **Deps:** T0.1
- **Files:** `vite.config.ts`, `tsconfig.json`, `resources/js/{main.ts,router.ts}`, `resources/views/app.blade.php`, `routes/web.php`, `resources/css/app.css`, placeholder views
- **Instructions:** Follow LLD §1 and §4.1. Routes per §4.1 with placeholder views. Add the catch-all web route excluding `api|broadcasting|sw.js|build`, plus `/__shell`. Self-host the Inter variable font (woff2) with `font-display: block`. Define the CSS tokens `--stage-bg`, `--stage-fg`, `--overtime-bg:#C8102E`, `--safe:5%`.
- **Acceptance:** `/`, `/display`, `/control` and `/pair` render client-side. A hard refresh on any route works. `vue-tsc --noEmit` is clean.
- **Tests:** a Vitest smoke test mounting the router.

### T0.3 · SPIKE: Laravel Cloud deploy + WebSocket client events
- **Desc:** Deploy the skeleton to a Cloud `staging` environment with Serverless Postgres + a WebSocket cluster, and prove that private/presence channels and **whispers** work through the managed cluster.
- **Deps:** T0.1, T0.2
- **Files:** `docs/spikes/T0.3-laravel-cloud-websockets.md`, a temporary `/spike` route (remove it afterwards)
- **Instructions:** Follow 06-Deployment §2–4. Build a throwaway page that joins `presence-spike.{id}` from two browsers and whispers every 3 s. Measure the round-trip latency. Record: the injected env var names, the client-event support and settings, the hostname, whether hibernation can be configured, the latency (p50/p95 over 100 messages), and the presence leave detection time after a hard disconnect.
- **Acceptance:** The spike doc records each item. Set `STAGECUE_HEARTBEAT_MODE` to `whisper` or `http` (decision D6). Update `docs/README.md` if the decision changes.
- **Tests:** manual. The results are in the doc.

### T0.4 · CI pipeline
- **Desc:** GitHub Actions per 06-Deployment §10.
- **Deps:** T0.1, T0.2
- **Files:** `.github/workflows/ci.yml`, `package.json` scripts (`lint`, `test`, `test:e2e`, `build`)
- **Acceptance:** The workflow runs on PRs and is green on main. Coverage thresholds are configured (the core gate becomes active once `core/` exists).
- **Tests:** the pipeline itself.

### T0.5 · Test harnesses
- **Desc:** Vitest (happy-dom, fake-indexeddb, coverage v8), Playwright (2-context fixture `displayPage` + `controllerPage`, `webServer` booting PHP + Reverb), Pest helpers (`createDisplay()`, `pairController()`).
- **Deps:** T0.2
- **Files:** `vitest.config.ts`, `playwright.config.ts`, `e2e/fixtures.ts`, `tests/Pest.php`
- **Acceptance:** Sample tests run in all three runners locally and in CI.
- **Tests:** samples.

### T0.6 · PWA foundation
- **Desc:** vite-plugin-pwa with injectManifest, the `/sw.js` route, shell caching, manifest and placeholder icons.
- **Deps:** T0.2
- **Files:** `vite.config.ts`, `resources/js/sw.ts`, `routes/web.php` (sw route), `public/icons/*`, `app.blade.php`
- **Instructions:** LLD §4.10. Register the SW from `main.ts` (`navigator.serviceWorker.register('/sw.js', { scope: '/' })`) in production builds only.
- **Acceptance:** After a first visit, `/display` loads with DevTools set to Offline. The Lighthouse installability check passes.
- **Tests:** OFF-07 (Playwright, offline after a warm-up visit).

---

## M1 — Core engine (pure TypeScript)

### T1.1 · Domain types, zod schemas, contract fixtures
- **Deps:** T0.5
- **Files:** `core/types.ts`, `core/schemas.ts`, `core/commands.ts`, `resources/js/contracts/fixtures/{command.*.json,state.*.json,snapshot.json,heartbeat.json}`
- **Instructions:** Implement LLD §3.1 exactly. Add zod schemas for the envelope, every payload, `PresentationState` and the snapshot. `commands.ts` exports `DESTRUCTIVE`, `COMMAND_NAMES` and `makeCommand(name, payload, baseRevision)` (uuidv7). Create one fixture per catalogue entry in 04 §4.
- **Acceptance:** Every fixture parses with its schema. Invalid variants fail.
- **Tests:** a schema test per fixture + negative cases.

### T1.2 · Clock abstraction
- **Deps:** T1.1 · **Files:** `core/clock.ts`, `core/__tests__/clock.spec.ts`
- **Instructions:** `Clock`, `systemClock` and `FakeClock` with `advance(ms)`, `jumpWall(ms)` (wall only) and `suspend(ms)` (wall advances, mono does not).
- **Acceptance/Tests:** unit tests for each FakeClock operation.

### T1.3 · Formatting
- **Deps:** T1.1 · **Files:** `core/format.ts`
- **Instructions:** LLD §3.5.
- **Tests:** T-07, T-08 + overtime formatting.

### T1.4 · Timer engine
- **Deps:** T1.2, T1.3 · **Files:** `core/timer.ts`
- **Instructions:** Pure functions `set`, `start`, `pause`, `resume`, `reset`, `clear`, `expire` and `readout(timer, now)`, each returning `{ok, timer} | {ok:false, code}`. Use the pre-conditions in LLD §3.3.
- **Acceptance/Tests:** UNIT T-01…T-13.

### T1.5 · Message engine
- **Deps:** T1.2 · **Files:** `core/message.ts`
- **Instructions:** `show`, `dismiss(id?)`, `expire`, `remaining(msg, now)`.
- **Acceptance/Tests:** UNIT M-01…M-08.

### T1.6 · Presentation reducer
- **Deps:** T1.4, T1.5 · **Files:** `core/reducer.ts`
- **Instructions:** `apply(state, action, now)` per the table in LLD §3.3, including the `STALE_VIEW` rule, the A2 interaction, revision handling and the `events` list. Use an exhaustive `switch` with a `never` check.
- **Acceptance/Tests:** UNIT R-01, R-02, R-06…R-08.

### T1.7 · View derivation
- **Deps:** T1.6 · **Files:** `core/view.ts`
- **Instructions:** LLD §3.4 + HLD §8 priority.
- **Tests:** R-03, R-04, R-05.

### T1.8 · Property-based invariants
- **Deps:** T1.7 · **Files:** `core/__tests__/reducer.property.spec.ts` (fast-check)
- **Tests:** R-09. The core coverage gate of ≥ 90% is enforced.

---

## M2 — Local Display runtime

### T2.1 · IndexedDB layer
- **Deps:** T1.1 · **Files:** `storage/*.ts`
- **Instructions:** LLD §4.9. Atomic `commit(state, processed?)`, trimming to 500, quarantine of corrupt records, and `requestPersistence()`.
- **Tests:** S-01, S-02, S-03, S-07.

### T2.2 · ClockReconciler
- **Deps:** T1.2 · **Files:** `display/ClockReconciler.ts`
- **Instructions:** LLD §5.1–5.2. Expose `nowEff()`, `sample(): {kind:'normal'|'suspended'|'clockChanged', drift}` and `shiftState(state, drift)`.
- **Tests:** CLK-01…CLK-04.

### T2.3 · TickLoop
- **Deps:** T2.2 · **Files:** `display/TickLoop.ts`
- **Instructions:** LLD §5.3: second-aligned `setTimeout`, an immediate tick on visibility, a rAF watchdog, `start/stop`.
- **Tests:** with FakeClock and fake timers: ticks align to the boundaries, and expiry callbacks fire once.

### T2.4 · DisplayRuntime (local mode)
- **Deps:** T1.7, T2.1, T2.3 · **Files:** `display/DisplayRuntime.ts`, `display/commitQueue.ts`
- **Instructions:** LLD §4.3, §5.5 (boot + historical catch-up), §5.6, §5.7. `local()` for keyboard actions. All mutations go through the mutex. No network yet: inject a no-op publisher.
- **Acceptance:** Reload in the middle of any state reproduces it. The catch-up ordering is correct.
- **Tests:** CLK-05, OFF-05 logic at unit level (runtime + fake IDB + FakeClock).

### T2.5 · Display Pinia store
- **Deps:** T2.4 · **Files:** `stores/display.ts`
- **Instructions:** Readonly projection of `state`, `view` and `now`. Actions delegate to the runtime. The `now` update is the only per-second reactive write.
- **Tests:** the store reflects the runtime emissions. No deep watchers.

---

## M3 — Stage rendering & animation

### T3.1 · Stage skeleton & tokens
- **Deps:** T2.5 · **Files:** `components/stage/Stage.vue`, `StageBlack.vue`, `app.css`
- **Instructions:** LLD §4.4 layout. Container query units. 5% safe area. Standby = black.
- **Tests:** CMP-02, CMP-04.

### T3.2 · StageTimer with corner transform animation
- **Deps:** T3.1 · **Files:** `components/stage/StageTimer.vue`, `components/stage/useTimerTransform.ts`
- **Instructions:** LLD §4.4: one always-mounted element, a centre-origin transform computed from a ResizeObserver, a 500 ms transition, toggled `will-change`, reduced-motion support, tabular nums, the compact overtime pill.
- **Acceptance:** No re-mount across position changes. 60 fps in the Chrome performance panel (no layout events during the transition).
- **Tests:** CMP-01, CMP-03, CMP-05.

### T3.3 · StageMessage + FitText
- **Deps:** T3.1 · **Files:** `StageMessage.vue`, `FitText.vue`
- **Instructions:** Fade/rise transition 300 ms. The text area is the safe area minus the compact timer's corner box. Keep line breaks (`white-space: pre-wrap`). Binary-search fit.
- **Tests:** CMP-07.

### T3.4 · Overtime & state transitions
- **Deps:** T3.2 · **Files:** `StageOvertime.vue`
- **Instructions:** FR-R5. Background crossfade 400 ms. The paused-in-overtime indicator.
- **Tests:** CMP-06.

### T3.5 · DisplayView wiring + keyboard controls
- **Deps:** T3.4 · **Files:** `views/DisplayView.vue`, `display/Keyboard.ts`
- **Instructions:** Mount the runtime on `/display`. Add the D13 keyboard map (LLD §4.5). Add a temporary dev-only local panel (`?dev=1`) with SET 0:10 / message buttons for manual QA. It is removed or hidden in production.
- **Acceptance:** Every MVP display scenario can be exercised locally with the keyboard and the dev panel, without any backend.
- **Tests:** a Playwright local-only test of the keyboard flows (B, Space, D).

---

## M4 — Desktop presentation experience

### T4.1 · Fullscreen, hint & cursor hiding
- **Deps:** T3.5 · **Files:** `display/Fullscreen.ts`, `components/display/FullscreenHint.vue`
- **Tests:** a unit test with a mocked Fullscreen API. Manual check on RW-01.

### T4.2 · Screen picker (Window Management API)
- **Deps:** T4.1 · **Files:** `display/ScreenPicker.ts`, part of SetupPanel
- **Instructions:** Feature-detect it. Handle a permission denial with the fallback text.
- **Tests:** unit (mocked `getScreenDetails`). Manual check with a second monitor.

### T4.3 · Wake Lock
- **Deps:** T3.5 · **Files:** `display/WakeLock.ts`
- **Tests:** unit (re-acquired on visibilitychange).

### T4.4 · Single-tab lock
- **Deps:** T3.5 · **Files:** `display/SingleTabLock.ts`, router guard
- **Tests:** E2E-17.

### T4.5 · SetupPanel + Connect-to-TV guide
- **Deps:** T4.1–T4.4 · **Files:** `components/display/{SetupPanel,ConnectToTvGuide}.vue`
- **Instructions:** LLD §4.5. Visible only outside fullscreen. Pairing sections are placeholders until M6. Add the diagnostics drawer (recent errors, storage persisted?, revision, clock offset).
- **Acceptance:** In fullscreen, no admin element is in the DOM's visible tree.

### T4.6 · Local-only resilience verification
- **Deps:** T4.5
- **Tests:** OFF-05, OFF-06, OFF-07, OFF-10, OFF-13, OFF-14 in local-only mode (Playwright). **Milestone gate:** the laptop works as a complete standalone presentation timer.

---

## M5 — Back end

### T5.1 · Migrations & models
- **Deps:** T0.1 · **Files:** `database/migrations/*`, `app/Modules/*/Models/*`
- **Instructions:** LLD §2 exactly, including the indexes. Adjust the Sanctum `personal_access_tokens` migration to `ulidMorphs('tokenable')`.
- **Tests:** model factories and relation tests.

### T5.2 · Device auth, middleware, error format, server time
- **Deps:** T5.1 · **Files:** `Http/Middleware/{EnsureSessionMember,AddServerTime}.php`, `bootstrap/app.php`
- **Instructions:** LLD §7.3 (`session.member`, the Sanctum `ability` middleware alias), §7.7 (error JSON), the `X-Server-Time` header on `api/*`. Token sliding expiry for controllers.
- **Tests:** BE-16, BE-17.

### T5.3 · Sessions endpoints
- **Deps:** T5.2 · **Files:** `Modules/Sessions/*`
- **Instructions:** 04 §1.1–1.3. `SessionService`.
- **Tests:** BE-01, BE-14 (end).

### T5.4 · Pairing service & endpoints
- **Deps:** T5.3 · **Files:** `Modules/Pairing/*`
- **Instructions:** 04 §1.4–1.6, LLD §7.2. Codes from a CSPRNG over the given alphabet, retrying on a unique collision. Hash the token with sha256. Transactional consume with `lockForUpdate`.
- **Tests:** BE-02…BE-06, BE-14.

### T5.5 · Command relay
- **Deps:** T5.4, T5.7 · **Files:** `Modules/Relay/{Controllers/CommandController,Services/RelayService,Requests/CommandRequest,Support/CommandCatalogue}.php`
- **Instructions:** 04 §1.7, LLD §7.2/§7.4. Atomic seq with `RETURNING`. Broadcast after commit. The duplicate path. 503 on a broadcast failure.
- **Tests:** BE-07…BE-11, BE-18.

### T5.6 · Snapshot intake & state read
- **Deps:** T5.5 · **Files:** `Modules/Relay/Controllers/SnapshotController.php`
- **Instructions:** 04 §1.8–1.9. Revision rule. Ack → `session_commands` status updates. Enforce the 16 KB size limit.
- **Tests:** BE-12.

### T5.7 · Broadcast events & channel auth
- **Deps:** T5.2 · **Files:** `Modules/Relay/Events/*`, `routes/channels.php`, `config/broadcasting.php`
- **Instructions:** LLD §7.5–7.6. All events `ShouldBroadcastNow` with explicit `broadcastAs` and `broadcastWith`, carrying `v:1`.
- **Tests:** BE-13, event payload snapshots against the fixtures (contract tests).

### T5.8 · Rate limiters
- **Deps:** T5.3 · **Files:** `AppServiceProvider.php`
- **Tests:** BE-05 + command/snapshot limits.

### T5.9 · Scheduled maintenance
- **Deps:** T5.1 · **Files:** `Console/Commands/PruneSessions.php`, `ExpirePairings.php`, `routes/console.php`
- **Tests:** BE-15.

### T5.10 · Runtime client config
- **Deps:** T5.7 · **Files:** `app.blade.php`, `config/stagecue.php`
- **Instructions:** 06-Deployment §4: a JSON config script tag + the `realtime` block in the API responses.
- **Tests:** a feature test asserting that the config is rendered and contains no secret.

### T5.11 · Heartbeat fallback endpoint (**conditional on T0.3 = http**)
- **Deps:** T5.7 · **Files:** `HeartbeatController.php`, `Events/PeerHeartbeat.php`
- **Tests:** a feature test for the broadcast to the opposite role.

---

## M6 — Transport & Display connectivity

### T6.1 · ApiClient + ServerClock
- **Deps:** T5.3, T1.1 · **Files:** `transport/{ApiClient,ServerClock}.ts`
- **Instructions:** Typed `fetch` wrapper with a bearer token, JSON errors → a typed `ApiError` (`code`, `retryable`), timeouts (8 s), and the retry helper with jittered back-off. ServerClock per LLD §6.5.
- **Tests:** unit with a mocked fetch.

### T6.2 · RealtimeClient
- **Deps:** T5.7, T6.1 · **Files:** `transport/RealtimeClient.ts`
- **Instructions:** Echo (reverb) built from the runtime config. Bearer auth on `/api/broadcasting/auth`. Exposes `connectionState$`, `subscribeDisplay`, `subscribeControllers`, `joinPresence`, `whisper` and `reconnect()`. Payloads are parsed with zod; invalid ones are dropped and logged.
- **Tests:** unit with a fake pusher, plus WS-01 integration.

### T6.3 · Heartbeat
- **Deps:** T6.2 · **Files:** `transport/Heartbeat.ts`
- **Instructions:** LLD §6.4. Whisper or HTTP mode from the config. Emits the peer heartbeat age.
- **Tests:** WS-04.

### T6.4 · ConnectionStateMachine + connection store + badge
- **Deps:** T6.3 · **Files:** `transport/ConnectionStateMachine.ts`, `stores/connection.ts`, `components/common/ConnectionBadge.vue`
- **Tests:** a state-table unit test, CMP-11.

### T6.5 · Display remote intake + SnapshotPublisher + session lifecycle
- **Deps:** T6.4, T2.4, T5.6 · **Files:** `display/SnapshotPublisher.ts`, `DisplayRuntime.ts` (remote parts)
- **Instructions:** LLD §6.2–6.3 and the boot connection step of §5.5: create or resume the session, handle 401/410 (create a new session and keep the local state), handle `controller.revoked`/`session.ended`, and trigger a publish on subscription.
- **Tests:** S-04, S-05, S-06, WS-02, WS-03.

### T6.6 · Display pairing UI
- **Deps:** T6.5, T4.5 · **Files:** `components/display/PairingCard.vue`
- **Instructions:** The QR (`qrcode`, the URL from the API), a large monospace code, an expiry countdown, auto-regeneration on expiry while no controller is paired, Regenerate/Revoke buttons, and "Controller connected: <name>".
- **Tests:** a component test, plus E2E-18 (later).

---

## M7 — Mobile Controller

### T7.1 · PairView (code entry + in-app QR scanner)
- **Deps:** T6.1, T5.4 · **Files:** `views/PairView.vue`, `control/QrScanner.ts`
- **Instructions:** Read the `#t=` fragment and strip it, then auto-submit. A code input with 6 boxes, auto-uppercase, ambiguous characters rejected. The scanner uses `qr-scanner` and accepts only same-origin `/pair#t=` URLs. On iOS outside standalone mode, show the R4 guidance. Store the credentials in DeviceRepo, then go to `/control`.
- **Tests:** a component test for parsing and validation. E2E pairing by code.

### T7.2 · ControllerRuntime, CommandOutbox, ack tracking
- **Deps:** T6.4, T7.1 · **Files:** `control/{ControllerRuntime,CommandOutbox}.ts`, `stores/control.ts`, `components/control/CommandButton.vue`
- **Instructions:** LLD §4.6 (button lifecycle), §6.6 (sync & conflict rules). Retry keeps the `commandId`. Reconnect turns awaiting entries into unconfirmed.
- **Tests:** CMP-08, E2E-15, OFF-12.

### T7.3 · MirrorClock + LiveMirror
- **Deps:** T7.2, T3.4 · **Files:** `control/MirrorClock.ts`, `components/control/LiveMirror.vue`
- **Instructions:** LLD §4.7. Reuses `Stage` in preview mode. Shows the blackout badge.
- **Tests:** unit (mirror countdown correct under skewed device clocks).

### T7.4 · TimerPanel + DurationPicker
- **Deps:** T7.2 · **Files:** `components/control/{TimerPanel,DurationPicker}.vue`
- **Instructions:** The enablement matrix (LLD §4.6). "Display & Start" sends SET, then START after SET's ack. Confirmation dialogs for destructive actions while the timer is active.
- **Tests:** CMP-09, E2E-01, E2E-02, E2E-03.

### T7.5 · MessageComposer + Corner/Duration pickers
- **Deps:** T7.2 · **Files:** `components/control/{MessageComposer,CornerPicker,MessageDurationPicker}.vue`
- **Instructions:** The defaults come from settings (default corner tr, 10 s). Clear Message sends `MESSAGE_DISMISS {id: currentMessageId}`.
- **Tests:** component tests. E2E-04…E2E-08, E2E-10, E2E-14.

### T7.6 · BlackoutZone + Restore Display
- **Deps:** T7.2 · **Files:** `components/control/BlackoutZone.vue`
- **Instructions:** FR-C7. A haptic (`navigator.vibrate(30)`) where supported.
- **Tests:** CMP-10, E2E-11, E2E-12, E2E-13.

### T7.7 · Preview
- **Deps:** T7.3, T7.5 · **Files:** `control/PreviewModel.ts`, `components/control/PreviewSheet.vue`
- **Instructions:** LLD §4.8. The "Preview as overtime" toggle. "Send Live" from inside the sheet.
- **Tests:** CMP-12 + a unit test that the preview never mutates the mirror.

### T7.8 · Offline drafts
- **Deps:** T7.5 · **Files:** `components/control/DraftList.vue`, `storage/DraftRepo.ts`
- **Instructions:** FR-C6, LLD §6.6 rule 6.
- **Tests:** OFF-11.

### T7.9 · Controller session management
- **Deps:** T7.2 · **Files:** `views/ControlView.vue`, menu
- **Instructions:** Unpair (`DELETE controller/self`, then clear the credentials). Handle `controller.revoked`/`session.ended`/401 → go to `/pair` with an explanation. Reconnect on `visibilitychange`.
- **Tests:** E2E-18, RW-06 (manual).

---

## M8 — Resilience & synchronisation hardening

### T8.1 · Sync handshake & revision gating
- **Deps:** T7.3, T6.5 · **Files:** `control/ControllerRuntime.ts`, `transport/*`
- **Instructions:** HLD §11 steps 1–6, LLD §6.6 rules 1–4, and heartbeat-revision gap recovery (04 §3.3).
- **Tests:** WS-05, WS-07, OFF-09.

### T8.2 · Stale & STALE_VIEW user flows
- **Deps:** T8.1
- **Instructions:** On `STALE_VIEW`, refresh the mirror and show "The display changed. Confirm again?". On `STALE`, show "Command arrived too late — not applied".
- **Tests:** E2E-16, S-05.

### T8.3 · Offline E2E suite
- **Deps:** T8.1 · **Files:** `e2e/offline/*.spec.ts`
- **Tests:** OFF-01…OFF-14 against the full stack.

### T8.4 · Chaos tests
- **Deps:** T8.3 · **Files:** `e2e/chaos/*.spec.ts`, `scripts/chaos.sh`
- **Instructions:** Kill and restart Reverb and PHP mid-session. Inject latency of 2 s on the snapshot POST. Send duplicate deliveries.
- **Tests:** OFF-04, WS-07. Concurrent commands from two tabs of the same controller give an ordered, consistent outcome.

### T8.5 · Service worker update safety
- **Deps:** T0.6, T4.5
- **Instructions:** LLD §4.10 update flow.
- **Tests:** PWA-05.

---

## M9 — PWA completion, production & release

### T9.1 · Laravel Cloud production environment
- **Deps:** T0.3, M5 done · **Files:** `docs/runbooks/laravel-cloud.md`
- **Instructions:** 06-Deployment §2–5, §10–12. Create the `production` env on `main` and `staging` on `develop`. Turn hibernation off for prod. Attach the DB + WebSockets. Set the env vars. Enable the scheduler. Turn on deploy-on-green-checks. Record the assigned hostnames in the runbook and in `APP_URL`.
- **Acceptance:** Both environments deploy from git. A production smoke test (06 §11.4) passes.

### T9.2 · Icons, manifest polish, install prompts
- **Deps:** T0.6 · **Files:** `public/icons/*`, `components/common/InstallPrompt.vue`
- **Instructions:** Final icons (192, 512, maskable, apple-touch-icon 180). `beforeinstallprompt` handling. An iOS "Share → Add to Home Screen" hint.
- **Tests:** PWA-01…PWA-04.

### T9.3 · Security headers & hardening
- **Deps:** T9.1 · **Instructions:** 06-Deployment §5. Confirm that no tokens are logged and that the fragment is stripped.
- **Tests:** a feature test of the headers. A manual check with securityheaders.com.

### T9.4 · Monitoring
- **Deps:** T9.1 · **Instructions:** 06-Deployment §7 (Nightwatch or Sentry, uptime monitors, relay and apply latency logging).
- **Acceptance:** A dashboard shows the latency p95 from staging tests.

### T9.5 · Browser/OS compatibility pass
- **Deps:** M8 done · **Tests:** the 05 §9 matrix. Record the results in `docs/runbooks/compat-results.md`. File and fix blockers.

### T9.6 · Real-world presentation testing
- **Deps:** T9.5 · **Files:** `docs/runbooks/real-world.md`
- **Tests:** RW-01…RW-08 on real hardware. Results recorded, including the latency figures.

### T9.7 · MVP Definition-of-Done sign-off
- **Deps:** all · **Instructions:** Walk the 23 DoD items in 01-PRD §8 and link the evidence (test run, video, runbook result) for each one.
- **Acceptance:** Every item has evidence. Tag `v1.0.0`.

---

## Parallelisation map

```
M0 ─┬─ M1 ── M2 ── M3 ── M4 ─────────┐
    └─ M5 (back end, in parallel with M1–M4) ─┴─ M6 ── M7 ── M8 ── M9
```
Two agents can work in parallel: **Agent A** on the front-end core and display (M1–M4) and **Agent B** on the back end (M5). They meet at M6. Contract fixtures (T1.1) must be merged before T5.7.

---

## Post-MVP backlog (do not start before T9.7)

| ID | Feature | Notes |
|---|---|---|
| P-01 | Saved timer presets | IDB on the controller first, then server-side with accounts |
| P-02 | Saved message templates + categories | |
| P-03 | User accounts (Fortify / starter kit auth), password reset | Devices get linked to users. **Partly done (A24):** username/password sign-up and login, sessions owned by an account, same-account pairing. Still open: password reset, changing the password, team members with separate logins |
| P-04 | Multiple controllers + primary controller + activity indicators | Remove "replace on pair". Presence list UI. `baseRevision` conflicts are already handled |
| P-05 | Multiple displays per account | A dashboard listing sessions |
| P-06 | Branding: logos, backgrounds, fonts, colours, custom TIME UP text | The tokens already exist. Assets go in Cloud object storage + SW runtime cache |
| P-07 | Advanced layouts & transitions | |
| P-08 | History & analytics | Built on `session_commands` + snapshots |
| P-09 | Local-network fallback via WebRTC DataChannel | Signalled through Reverb while online |
| P-10 | Custom domain + origin migration | 06-Deployment §9 |
| P-11 | Subscriptions, payments (Cashier), organisations, multi-tenant, admin | |
| P-12 | Client error reporting endpoint | 06-Deployment §7 |
