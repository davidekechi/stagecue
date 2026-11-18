# Runbook — real-world presentation testing (T9.6)

Run on **staging** (or production before an event) with real hardware. Record results in the tables.
Equipment: the laptop that will drive the TV, its HDMI cable/adapter, the TV or projector, the operator's phone.
Setup: laptop display mode **Extend**; StageCue installed as an app on both devices; laptop on power, sleep and screensaver off.

| ID | Test | How | Pass when | Result | Notes |
|---|---|---|---|---|---|
| RW-01 | Fullscreen on the TV | Open `/display`, **Present on screen…** → pick the TV (or drag the window and press F) | The stage fills the TV; no browser chrome; the setup panel is gone | | |
| RW-02 | Legibility, 1080p and 4K TV | Timer 15:00 and a 2-word message; view from the back row / 10 m | Timer digits fill ~70% of the height; message readable; nothing cropped (5% safe area) | | |
| RW-03 | 4:3 projector | Same as RW-02 on a projector | Nothing cropped; timer fills the width | | |
| RW-04 | 90-minute soak | Timer running, 30 messages, 3 blackouts, 10 min of overtime | No sleep/screensaver; Activity Monitor/Task Manager shows the browser < 5% CPU when idle-ticking | | |
| RW-05 | Venue Wi-Fi pulled for 5 min | Mid-countdown, disconnect the laptop's network for 5 min (or `scripts/chaos.sh blip 300` on a local stack) | The TV never stops counting; messages expire on time; on restore the phone shows **Display connected** again | | |
| RW-06 | Phone locked 3 min | Lock the phone screen for 3 minutes, unlock | Phone resyncs (badge back to **connected**, mirror correct) in < 3 s | | |
| RW-07 | Laptop lid closed / sleep 1 min | Clamshell or sleep for 1 minute, wake | The timer shows the right time (it caught up), within 1 s | | |
| RW-08 | Latency over 100 commands | 100 commands on 4G, then 100 on venue Wi-Fi; read `apply_ms` from the logs (see laravel-cloud.md §8) | p95 < 500 ms | p50: · p95: | |

## Venue checklist (keep with the kit)
- [ ] Laptop: power connected, sleep **never**, screensaver off, notifications silenced (Do Not Disturb).
- [ ] Display: Extend, StageCue window on the TV, fullscreen (F).
- [ ] TV: picture size **Just Scan / Screen Fit**; tilt slightly toward the stage to avoid glare.
- [ ] Phone: StageCue installed, paired, brightness up, auto-lock long.
- [ ] Rehearse: one message from the stage position under stage lighting — check legibility.
- [ ] Messages: keep them to 2–5 words for long rooms (a 48" TV at 40+ rows can carry ~2 short lines).
