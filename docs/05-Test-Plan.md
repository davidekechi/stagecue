# 05 — Test Plan

## 1. Strategy & tooling

| Level | Tool | Location | Runs in CI |
|---|---|---|:-:|
| Unit (core engines) | Vitest + `FakeClock` | `resources/js/core/__tests__` | ✔ |
| Unit (runtimes, storage) | Vitest + `fake-indexeddb` + fake transport | `resources/js/{display,control,storage}/__tests__` | ✔ |
| Component | Vitest + @vue/test-utils (happy-dom) | `resources/js/components/**/__tests__` | ✔ |
| Back-end unit/feature | Pest (+ `Event::fake`, `Broadcast` assertions) | `tests/` | ✔ |
| Contract | Pest + Vitest reading the same `contracts/fixtures/*.json` | both | ✔ |
| WebSocket integration | Pest + a real `php artisan reverb:start` in CI, with a Node client (pusher-js) script | `tests/Realtime` | ✔ |
| E2E | Playwright (Chromium, WebKit, Firefox). Two browser contexts: display + controller. `page.clock` to control time, `context.setOffline()` | `e2e/` | ✔ (Chromium); nightly for all |
| Offline / chaos | Playwright + a script that kills the Reverb/PHP server | `e2e/offline` | ✔ |
| Compatibility | A manual matrix plus Playwright on WebKit/Firefox | — | release |
| Real-world | A manual runbook with real HDMI hardware | `docs/runbooks/` | release |

Coverage gates: `resources/js/core` ≥ 90% lines/branches. Back end ≥ 80%. A PR fails CI if coverage drops below these.

## 2. Unit tests — core

### Timer (UNIT-T)
| ID | Case | Expected |
|---|---|---|
| T-01 | SET 900000 | `ready`, readout `15:00` |
| T-02 | `ready` for 5 min of fake time | readout unchanged `15:00` |
| T-03 | START from ready | `running`, endsAt = now+900000 |
| T-04 | START from idle/running/paused/overtime | `INVALID_STATE` |
| T-05 | PAUSE at +60 s | `paused` remaining 840000 |
| T-06 | RESUME | `running` endsAt = now+840000 |
| T-07 | readout at boundaries: 900000→`15:00`, 899001→`15:00`, 899000→`14:59`, 1→`00:01` | as listed |
| T-08 | ≥ 1 h → `1:00:00`, and 3599999 → `1:00:00`, 3599000 → `59:59` | format rule |
| T-09 | tick at endsAt | `TIMER_EXPIRED` → `overtime`, readout `+00:00:00`. At +1 s `+00:00:01` |
| T-10 | pause in overtime, resume | overtime continues from the frozen value |
| T-11 | RESET from each non-idle state | `ready(duration)` |
| T-12 | CLEAR | `idle` |
| T-13 | 2 h simulated with 1 s ticks and ±50 ms jitter | the end error is < 100 ms |

### Message (UNIT-M)
| ID | Case | Expected |
|---|---|---|
| M-01 | SHOW timed 10 s | showing, expiresAt = now+10000 |
| M-02 | expire at +10 s | `none` |
| M-03 | SHOW persistent, +1 h | still showing |
| M-04 | replace at +5 s with a new 10 s message | the new message, expiresAt reset |
| M-05 | DISMISS with a matching id | `none` |
| M-06 | DISMISS with a stale id | no-op, `changed:false` |
| M-07 | SHOW never changes the timer (for every timer state) | the timer object is deep-equal before and after |
| M-08 | text validation: empty, whitespace, > 500 characters | `INVALID_PAYLOAD` |

### Reducer & view (UNIT-R)
| ID | Case | Expected |
|---|---|---|
| R-01 | revision increments only when `changed` | — |
| R-02 | destructive command with baseRevision < revision | `STALE_VIEW` |
| R-03 | render priority matrix (blackout × message × timer state) | per HLD §8 |
| R-04 | BLACKOUT_ON then 20 min of ticks across expiry | timer → overtime, message expired, view `black` throughout |
| R-05 | BLACKOUT_OFF after R-04 | view `overtime` |
| R-06 | A2 default: timer expires during a timed message | message stays, compact overtime, then the full overtime view after expiry |
| R-07 | A2 with `overtimeInterruptsMessage=true` | message removed at expiry |
| R-08 | A2 with a persistent message | compact overtime until dismissed |
| R-09 | property-based (fast-check): random command sequences | no throw. Invariants hold: revision is monotonic, `paused.remainingMs` finite, no `running` with endsAt ≤ now after a tick |

### Clock reconciliation (UNIT-CLK)
| ID | Case | Expected |
|---|---|---|
| CLK-01 | wall +3 h jump with regular ticks | nowEff continuous. Wall timestamps rebased. Remaining time unchanged |
| CLK-02 | wall −10 min jump | same as CLK-01 |
| CLK-03 | suspend: mono +0, wall +5 min | nowEff jumps +5 min. A timer with 2 min left → overtime +3:00 |
| CLK-04 | NTP slew 300 ms | absorbed gradually, no rebase event |
| CLK-05 | boot catch-up: timer ended 2 min ago, message 1 min ago | ordered application. Overtime `+00:02:00`. Message gone |

### Storage & runtime (UNIT-S)
| ID | Case | Expected |
|---|---|---|
| S-01 | commit then load round-trip | deep-equal |
| S-02 | corrupt record | quarantined, fresh state, warning |
| S-03 | state + processed command written atomically (abort mid-tx) | neither or both |
| S-04 | duplicate commandId delivered twice | applied once. The second ack is `DUPLICATE` |
| S-05 | `relayedAt` 11 s old (with a server clock offset) | `STALE` |
| S-06 | publisher coalescing: 10 publishes while one is in flight | 2 requests, the last carries all acks |
| S-07 | QuotaExceeded on write | the runtime continues. The warning flag is set |

## 3. Back-end tests (Pest)
| ID | Case |
|---|---|
| BE-01 | create session → 201, token works, pairing code shape and expiry |
| BE-02 | pair by code / by token → controller token. Code consumed (a second use gives 404) |
| BE-03 | expired pairing → 410 |
| BE-04 | pairing replaces the previous controller → old token gets 401. `controller.revoked` broadcast |
| BE-05 | 6th pairing attempt per minute per IP → 429 |
| BE-06 | 20 failed attempts on a session → code rotated |
| BE-07 | command validation per catalogue entry (datasets) |
| BE-08 | command from the display token → 403. From another session's controller → 403 |
| BE-09 | command relayed → `CommandRelayed` broadcast on the correct channel. `seq` increments |
| BE-10 | duplicate commandId → 200 duplicate. Re-broadcast only if still `relayed` |
| BE-11 | concurrent commands (parallel requests) → unique, gapless seq |
| BE-12 | snapshot with a lower revision → `stored:false`. Acks still update `session_commands` |
| BE-13 | channel auth: display/controllers/presence matrix (member, wrong session, revoked) |
| BE-14 | revoke controller / leave / end session |
| BE-15 | prune command honours retention |
| BE-16 | every response has `X-Server-Time` |
| BE-17 | error format for each code in 04 §1.13 |
| BE-18 | Reverb down → 503 `RELAY_UNAVAILABLE` |

## 4. Component tests (CMP)
| ID | Component | Case |
|---|---|---|
| CMP-01 | StageTimer | renders text with tabular-nums, paused indicator |
| CMP-02 | Stage | for each `View` kind, the correct child is rendered |
| CMP-03 | Stage | the timer element is **not re-mounted** across centre→corner→corner→centre (same DOM node) |
| CMP-04 | Stage | blackout leaves no visible descendants and hides the cursor |
| CMP-05 | Stage | `--timer-transform` is set correctly for all 4 corners at 1920×1080 and 1024×768 |
| CMP-06 | StageOvertime | red background token, "TIME UP!", `+HH:MM:SS` |
| CMP-07 | FitText | long text shrinks to fit, short text grows to the cap |
| CMP-08 | CommandButton | states: sending → awaiting → confirmed / rejected / unconfirmed + retry |
| CMP-09 | TimerPanel | button enablement matrix per timer state |
| CMP-10 | BlackoutZone | a 600 ms hold is required. A tap does nothing. Restore is a single tap |
| CMP-11 | ConnectionBadge | the four peer states + server state |
| CMP-12 | PreviewSheet | renders the draft. Does not call the ApiClient |

## 5. WebSocket integration (WS)
| ID | Case | Expected |
|---|---|---|
| WS-01 | Display subscribes to its private + presence channels | success |
| WS-02 | Controller command → Display receives it | < 300 ms locally |
| WS-03 | Display snapshot → Controller `state` | ack matches the commandId |
| WS-04 | heartbeat whispers flow both ways. Stop one side | the peer shows `reconnecting` at 9 s and `disconnected` at 30 s |
| WS-05 | Controller socket dropped and restored | synchronizing → connected. The mirror equals the Display state |
| WS-06 | revoked controller tries to subscribe | auth 403 |
| WS-07 | Reverb restarted mid-session | both sides reconnect and re-subscribe automatically |
| WS-08 | whisper from an unauthorised client | not delivered |

## 6. E2E (Playwright, two contexts)
| ID | Scenario | Expected |
|---|---|---|
| E2E-01 | Pair by code → Display Timer 15:00 → Start | the Display counts down. The Controller mirror matches ±1 s |
| E2E-02 | Display Timer without starting | `15:00` shown, paused |
| E2E-03 | wait 5 min (clock.fastForward) | still `15:00` |
| E2E-04 | send a message | the message is visible on the Display |
| E2E-05 | repeat for corners TL/TR/BL/BR | the bounding box of the timer is in the expected quadrant after 600 ms |
| E2E-06 | message during the countdown | the countdown value keeps decreasing (sampled 3×) |
| E2E-07 | timed message 5 s | gone after 5 s. The timer is centred again |
| E2E-08 | persistent message + Clear Message | gone |
| E2E-09 | timer reaches 0 | red, TIME UP!, `+00:00:0x` increasing |
| E2E-10 | message while paused | the timer is still paused (value unchanged after 10 s) |
| E2E-11 | Black Screen during the countdown / message / overtime | all pixels are black (screenshot luminance check) |
| E2E-12 | blackout across expiry, then Restore | overtime shown with the correct value |
| E2E-13 | Restore table from the addendum §1.3 (6 rows) | each row as specified |
| E2E-14 | replace messages quickly 10× in 5 s | no timer reset. Final message shown. No console errors |
| E2E-15 | double-tap send (same commandId retried) | applied once |
| E2E-16 | STALE_VIEW: Display changes state while the controller is offline, then a destructive command is sent | rejected, the mirror refreshes, a confirm prompt appears |
| E2E-17 | second `/display` tab | "already open" screen |
| E2E-18 | revoke the controller from the Display | the Controller is sent to `/pair` |

## 7. Offline & resilience (OFF)
| ID | Scenario | Expected |
|---|---|---|
| OFF-01 | the Controller context goes offline mid-countdown | the Display continues. The Controller shows disconnected and drafts only |
| OFF-02 | the Display context goes offline | the Display continues. The message expires on time. Overtime starts |
| OFF-03 | both show the correct indicators throughout OFF-01/02 | — |
| OFF-04 | kill the PHP server + Reverb | the Display continues. Recovery when restarted |
| OFF-05 | reload the Display while running + showing a message | same remaining time ±1 s. The message keeps its original expiry |
| OFF-06 | close the context, wait 2 min (clock), reopen | overtime/remaining correct. The session resumes |
| OFF-07 | the Display loads `/display` with the network offline (after a first visit) | the shell loads from the SW. Local mode works |
| OFF-08 | blackout, then the Display goes offline | it stays black |
| OFF-09 | blackout, then the Controller disconnects | it stays black. On reconnect the Controller shows "Black screen active" |
| OFF-10 | blackout + reload | still black after the reload. Restore shows the correct state |
| OFF-11 | a command composed while offline | saved as a draft. Not sent on reconnect until "Send now" |
| OFF-12 | the ack is lost (block the snapshot POST once) | the Controller shows unconfirmed. Retry → `DUPLICATE`/applied once |
| OFF-13 | tab hidden 10 min (emulated) then shown | the readout is correct within 1 s |
| OFF-14 | simulated system clock change (page.clock.setSystemTime jump while running) | the remaining time is unaffected (rule 3) |

## 8. PWA (PWA)
| ID | Case |
|---|---|
| PWA-01 | Lighthouse PWA installability passes (Chrome desktop) |
| PWA-02 | Install on Windows/macOS Chrome & Edge. Launches `/display` from the shortcut |
| PWA-03 | Install on Android Chrome. The controller works standalone |
| PWA-04 | iOS Safari Add to Home Screen. Pair with the in-app scanner inside the standalone app |
| PWA-05 | SW update while the timer is running → no auto reload. The banner appears in the SetupPanel |

## 9. Browser / OS compatibility matrix (release gate)
| | Chrome | Edge | Safari | Firefox |
|---|:-:|:-:|:-:|:-:|
| Windows 11 (Display) | ✔ full | ✔ full | — | ✔ (no screen picker) |
| macOS 14+ (Display) | ✔ full | ✔ full | ✔ (no screen picker) | ✔ (no screen picker) |
| Android 13+ (Controller) | ✔ | — | — | best-effort |
| iOS 16.4+ (Controller) | via WebKit | — | ✔ | — |

For each cell, check: fullscreen, wake lock, install, offline shell, the reload recovery path, and the QR scan (controllers).

## 10. Real-world tests (RW): runbook `docs/runbooks/real-world.md`
| ID | Test |
|---|---|
| RW-01 | Laptop + HDMI TV, extended desktop. Move the window or use the screen picker. Fullscreen on the TV |
| RW-02 | 1080p TV and 4K TV: legibility from 10 m. No overscan cropping (5% safe area) |
| RW-03 | A 4:3 projector |
| RW-04 | 90-minute soak: running, 30 messages, 3 blackouts, overtime 10 min. CPU < 5%. No sleep or screensaver |
| RW-05 | Pull the venue Wi-Fi for 5 min mid-talk, then restore it |
| RW-06 | Phone screen locked for 3 min, then unlocked → resync < 3 s |
| RW-07 | Laptop lid closed in clamshell mode / sleep for 1 min, then opened → the timer is correct |
| RW-08 | Measure the command latency (p50/p95) over 100 commands on 4G and on venue Wi-Fi |
