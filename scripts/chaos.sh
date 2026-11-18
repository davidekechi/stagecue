#!/usr/bin/env bash
# Manual chaos helper for local real-world testing (T8.4 / RW-05).
# Usage: scripts/chaos.sh reverb-down|reverb-up|app-down|app-up|blip [seconds]
set -euo pipefail
cd "$(dirname "$0")/.."
APP_PORT="${APP_PORT:-8123}"
REVERB_PORT="${REVERB_PORT:-8080}"

pids_on() { lsof -t -iTCP:"$1" -sTCP:LISTEN 2>/dev/null || true; }

case "${1:-}" in
  reverb-down) kill $(pids_on "$REVERB_PORT") && echo "Reverb on :$REVERB_PORT stopped" ;;
  reverb-up) nohup php artisan reverb:start --port="$REVERB_PORT" >/dev/null 2>&1 & echo "Reverb starting on :$REVERB_PORT" ;;
  app-down) kill $(pids_on "$APP_PORT") && echo "App on :$APP_PORT stopped" ;;
  app-up) nohup php artisan serve --port="$APP_PORT" >/dev/null 2>&1 & echo "App starting on :$APP_PORT" ;;
  blip)
    secs="${2:-20}"
    "$0" reverb-down; "$0" app-down
    echo "Everything is down for ${secs}s — the Display must keep presenting."
    sleep "$secs"
    "$0" app-up; "$0" reverb-up ;;
  *) echo "usage: $0 reverb-down|reverb-up|app-down|app-up|blip [seconds]"; exit 1 ;;
esac
