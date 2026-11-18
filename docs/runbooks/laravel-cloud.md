# Runbook — Laravel Cloud (T9.1, with spike T0.3 and monitoring T9.4)

Everything in the repo is ready to deploy; these steps need the project's Laravel Cloud account.
Source of truth: [06-Deployment](../06-Deployment.md). Items marked ⚠ must be checked against the live dashboard.

## 1. Create the application
1. Laravel Cloud → **New application** → connect GitHub repo `davidekechi/stagecue`.
2. Region: closest to your venues.
3. Create two environments:

| Environment | Branch | Compute | Hibernation |
|---|---|---|---|
| `production` | `main` | Flex/Pro, 1 replica | **Off** (no cold start during an event — R8) |
| `staging` | `develop` | smallest | On |

> Create the `develop` branch first: `git checkout -b develop && git push -u origin develop`.

## 2. Attach resources (per environment)
- **Database:** Laravel Serverless Postgres. Production: hibernation off / minimum compute > 0 ⚠.
- **WebSockets:** a Laravel Cloud WebSocket cluster (managed Reverb). Attach it to the environment.
- **Scheduler:** enable it (runs `sessions:prune` daily and `pairing:expire` every 5 min).
- No queue workers (all broadcasts are `ShouldBroadcastNow`). No object storage.

## 3. Build & deploy commands
Build:
```bash
composer install --no-dev --prefer-dist --optimize-autoloader --no-interaction
npm ci
npm run build
php artisan optimize
```
Deploy:
```bash
php artisan migrate --force
```
Runtime: PHP 8.4. Node 22 (build only).

## 4. Environment variables
Cloud injects `DB_*` and `REVERB_*` when the resources are attached ⚠ (write down the exact names below). Set the rest:

| Variable | Production | Staging |
|---|---|---|
| `APP_NAME` | `StageCue` | `StageCue` |
| `APP_ENV` | `production` | `staging` |
| `APP_DEBUG` | `false` | `false` |
| `APP_URL` | `https://<assigned host>` | `https://<assigned host>` |
| `LOG_CHANNEL` / `LOG_LEVEL` | `stderr` / `info` | `stderr` / `debug` |
| `BROADCAST_CONNECTION` | `reverb` | `reverb` |
| `CACHE_STORE` | `database` | `database` |
| `SESSION_DRIVER` | `cookie` | `cookie` |
| `QUEUE_CONNECTION` | `sync` | `sync` |
| `STAGECUE_HEARTBEAT_MODE` | from §5 (`whisper` or `http`) | same |
| `STAGECUE_REVERB_CLIENT_HOST/PORT/SCHEME` | only if the browser must use a different WebSocket host than `REVERB_HOST` | |

`APP_URL` builds the QR pairing link, so it must be the public `https://…laravel.cloud` hostname. **Treat the production hostname as permanent** (installed apps and saved state are tied to it — A11).

## 5. Spike T0.3 — do whispers work on the managed WebSocket cluster?
1. Deploy `staging`. Open `https://<staging>/display` on a laptop and `https://<staging>/pair` on a phone; pair.
2. On the Display's setup panel, watch the badge **Controller connected**. On the phone, watch **Display connected**.
3. Leave both open for 2 minutes.
   - Both stay **connected** → whispers work. Keep `STAGECUE_HEARTBEAT_MODE=whisper`.
   - Server shows **online** but the peer flips to **reconnecting / disconnected** after ~9 s → the cluster drops client events. Set `STAGECUE_HEARTBEAT_MODE=http` and redeploy (the HTTP heartbeat is already built — no code change).
4. Close the phone's browser hard (swipe away). Note how long the Display takes to show the phone as not connected.
5. Fill in [docs/spikes/T0.3-laravel-cloud-websockets.md](../spikes/T0.3-laravel-cloud-websockets.md) (env var names, hostname, hibernation options, the results above).

## 6. Deploy on green checks
Settings → Deployments → **Deploy only when GitHub checks pass** (or protect `main` so it needs a green CI and a PR).

## 7. Production smoke test (5 minutes, after every production deploy)
1. Open `/display` → a pairing code and QR appear.
2. Pair a phone by scanning the QR (inside the installed app on iPhone).
3. Display timer 5:00 → Start → the TV counts down, the phone mirror matches.
4. Send "Smoke test" for 5 s → it shows, then disappears.
5. Hold for black screen → black; Restore → back.
6. Unpair from the Display → the phone returns to the pairing screen.

## 8. Monitoring (T9.4)
- **Exceptions & performance:** install Laravel Nightwatch (Cloud integration) or Sentry.
- **Uptime:** an external monitor (Better Stack / UptimeRobot free tier) on `GET https://<host>/up` and `GET https://<host>/api/time`, plus the WebSocket host.
- **Latency:** every relayed command logs `command relayed … relay_ms`; 1 in 10 applied commands logs `command applied … apply_ms` (relay → applied on the Display, server clock). In the Cloud log viewer (or Nightwatch), filter on those messages and chart p95. Targets (NFR-3): tap → render < 500 ms p95.
- Logs never contain tokens or message text (covered by a test).

## 9. Record here
| Item | Value |
|---|---|
| Production hostname | |
| Staging hostname | |
| Injected DB variable names | |
| Injected WebSocket variable names | |
| Heartbeat mode chosen | |
| Date of first production deploy | |
