#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/josh/dev/Chronos"
BACKEND_DIR="$APP_DIR/backend"
FRONTEND_DIR="$APP_DIR/frontend"
LOG_DIR="/home/josh/.chronos"
LOG_FILE="$LOG_DIR/chronos-launch.log"
BACKEND_URL="http://127.0.0.1:3001/api/health"
FRONTEND_URL="http://127.0.0.1:5173"
VERCEL_FRONTEND_ORIGIN="https://frontend-seven-flame-gceb9izi76.vercel.app"

mkdir -p "$LOG_DIR"

echo "[$(date --iso-8601=seconds)] Starting Chronos" >> "$LOG_FILE"

cleanup() {
  echo "[$(date --iso-8601=seconds)] Stopping Chronos launcher children" >> "$LOG_FILE"
  if [[ -n "${FRONTEND_PID:-}" ]]; then kill "$FRONTEND_PID" 2>/dev/null || true; fi
  if [[ -n "${BACKEND_PID:-}" ]]; then kill "$BACKEND_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT INT TERM

cd "$BACKEND_DIR"
ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-$VERCEL_FRONTEND_ORIGIN}" npm start >> "$LOG_FILE" 2>&1 &
BACKEND_PID=$!

cd "$FRONTEND_DIR"
npm run dev -- --host 127.0.0.1 >> "$LOG_FILE" 2>&1 &
FRONTEND_PID=$!

echo "Chronos is starting…"
echo "Backend:  $BACKEND_URL"
echo "Frontend: $FRONTEND_URL"
echo "Logs:     $LOG_FILE"
echo
echo "Keep this terminal open while using Chronos."
echo "Close it or press Ctrl+C to stop Chronos."

for _ in {1..40}; do
  if curl -fsS "$BACKEND_URL" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done

for _ in {1..40}; do
  if curl -fsS "$FRONTEND_URL" >/dev/null 2>&1; then
    xdg-open "$FRONTEND_URL" >/dev/null 2>&1 || true
    break
  fi
  sleep 0.25
done

wait
