# MVP Definition of Done — sign-off (T9.7)

Each of the 23 criteria in [01-PRD §8](../01-PRD.md) with its evidence. **Automated** evidence runs in CI on every push
(`npm run lint && npm run test && vendor/bin/pest` + Playwright). **Manual** evidence comes from
[real-world.md](real-world.md) and [laravel-cloud.md](laravel-cloud.md) and must be filled in on real hardware.

Tag `v1.0.0` only when every row is ✅.

| # | Criterion | Evidence | Status |
|---|---|---|---|
| 1 | Timer configured and started from the phone | E2E-01 `e2e/controller.spec.ts` | ✅ automated |
| 2 | The Display shows the timer in fullscreen | Fullscreen unit tests (`display/__tests__/platform.spec.ts`); **RW-01/RW-02 on a TV** | ⏳ manual |
| 3 | Messages are sent from the phone | E2E-04 `e2e/controller.spec.ts` | ✅ automated |
| 4 | The timer animates into all four corners | CMP-05 `components/stage/__tests__/Stage.spec.ts`; E2E-04 (corner); relay spec | ✅ automated |
| 5 | Messages appear without interrupting the countdown | UNIT M-07; E2E `display-local.spec.ts` | ✅ automated |
| 6 | Messages expire automatically or are dismissed manually | UNIT M-02/M-05; OFF-02, OFF-05 E2E; keyboard D | ✅ automated |
| 7 | The Display keeps working without the phone | OFF-01 `e2e/offline/offline.spec.ts` | ✅ automated |
| 8 | The Display keeps working without the internet | OFF-02, OFF-04 (`e2e/chaos`), no-Reverb E2E | ✅ automated · RW-05 at the venue |
| 9 | The Display recovers its state after a reload or restart | OFF-05, OFF-06 `e2e/local-resilience.spec.ts`; CLK-05 | ✅ automated |
| 10 | Overtime starts automatically at zero | UNIT T-09; `display-local.spec.ts` (TIME UP) | ✅ automated |
| 11 | Overtime shows red with TIME UP and a counter | CMP-06 | ✅ automated |
| 12 | Both devices show connection status accurately | WS-04 (Heartbeat/state machine units); OFF-01/03 E2E; no-Reverb E2E | ✅ automated · confirm on Cloud (T0.3) |
| 13 | Reconnection synchronises the phone | WS-05 (OFF-01 E2E), ControllerRuntime sync tests, chaos WS-07 | ✅ automated |
| 14 | Installable as a PWA | Manifest/SW tests, OFF-07; install prompt tests; **PWA-01…04 on real devices over HTTPS** | ⏳ manual (needs Cloud HTTPS) |
| 15 | Tested on a laptop connected to an external TV or monitor | **RW-01…RW-05** | ⏳ manual |
| 16 | Display a timer without starting it | E2E-02 | ✅ automated |
| 17 | It stays paused until started | UNIT T-02; E2E-03 equivalent (`display-local` frozen check) | ✅ automated |
| 18 | Sending a message does not start a paused timer | UNIT M-07 (all timer states) | ✅ automated |
| 19 | Black Screen blanks the Display | E2E-11; CMP-04 | ✅ automated |
| 20 | Black Screen does not interrupt the timer, message expiry or overtime | UNIT R-04/R-05; OFF-10 | ✅ automated |
| 21 | Restore shows the correct current state | R-05; OFF-10 E2E (overtime after restore) | ✅ automated |
| 22 | Black Screen keeps working offline | OFF-08, OFF-09 | ✅ automated |
| 23 | The Display restores correctly after a reload or a suspension during blackout | OFF-10, CLK-03, DisplayRuntime blackout test | ✅ automated · RW-07 at the venue |

**Summary:** 20 of 23 proven by automated tests. Remaining before `v1.0.0`:
1. Deploy to Laravel Cloud and run spike T0.3 ([laravel-cloud.md](laravel-cloud.md) §5) — also confirms #12 on the managed WebSocket cluster.
2. Real-hardware run of [real-world.md](real-world.md) (RW-01…RW-08) — #2, #15, and venue confirmation of #8/#23.
3. PWA install on Chrome/Edge desktop, Android and iPhone over HTTPS (PWA-01…04) — #14.
4. Browser/OS matrix ([compat-results.md](compat-results.md)).

Then: `git tag v1.0.0 && git push origin v1.0.0`.
