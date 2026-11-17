# StageCue — agent instructions

This is a real-time presentation timer: a laptop Display plus a phone Controller. It is a Laravel modular monolith with a Vue 3 + TS PWA, hosted on Laravel Cloud.

**Before coding, read `docs/README.md` (binding decisions D1–D14 + the ambiguity log), then the sections of `docs/03-LLD.md` and `docs/04-API-and-Events.md` that your task references.** Work from `docs/07-Backlog.md` in order.

Non-negotiables:
- The Display is authoritative and must never depend on the network for a presentation that is already running.
- Timer truth = absolute timestamps + a monotonic anchor. Never a decrementing counter.
- `resources/js/core/**` is pure TS: no Vue, DOM, IndexedDB, Echo or fetch imports.
- Controllers send intent commands only, never state. Commands are idempotent by `commandId`. Never auto-replay offline commands.
- Blackout is a display flag. It never touches the timer or message state.
- Do not change contracts, file layout or architecture. Propose changes in the `docs/README.md` ambiguity log instead.
- Done = acceptance criteria met + tests written and passing (`npm run lint && npm run test && vendor/bin/pest`) + commit `T<id>: <name>`.
