# Browser / OS compatibility results (T9.5)

## Automated (Playwright, 2026-11-18, macOS host)

Full E2E suite (31 scenarios incl. offline, chaos and the no-Reverb fallback) against the production build with the CSP active.

| Engine | Stands in for | Result |
|---|---|---|
| Chromium | Chrome, Edge (Windows/macOS), Android Chrome | ✅ 31/31 |
| Firefox | Firefox (Windows/macOS) | ✅ 30/30 (+1 skipped: OFF-07 offline-SW emulation is Chromium-only) |
| WebKit | Safari (macOS), iOS Safari / PWA | ✅ 30/30 (+1 skipped: OFF-07) |

CI runs Chromium on every push; `.github/workflows/nightly.yml` runs Firefox and WebKit nightly.

### Issues found and fixed in this pass
| Issue | Engines | Fix |
|---|---|---|
| Phone stuck on "Synchronizing" after both servers restarted (its SYNC_REQUEST was lost while the Display re-subscribed) | WebKit (timing) | SYNC_REQUEST is retried every 3 s until answered |
| Heartbeats still sent while the device reported offline | all | Skipped while `navigator.onLine` is false |
| Service worker sat in the path of `/api` requests | all | API/broadcasting requests no longer pass through the SW |

## Manual matrix (release gate — fill in on real devices, 05-Test-Plan §9)

Check per cell: **F** fullscreen · **W** wake lock · **I** install · **O** offline shell · **R** reload recovery · **Q** QR scan (controllers).

| | Chrome | Edge | Safari | Firefox |
|---|---|---|---|---|
| Windows 11 (Display) | F W I O R | F W I O R | — | F W O R (no screen picker) |
| macOS 14+ (Display) | F W I O R | F W I O R | F W O R (no screen picker) | F W O R (no screen picker) |
| Android 13+ (Controller) | I O Q | — | — | best-effort |
| iOS 16.4+ (Controller) | via WebKit | — | I O Q (Add to Home Screen; scan **inside** the installed app — R4) | — |

| Device / browser | Date | Tester | Result | Notes |
|---|---|---|---|---|
| | | | | |
