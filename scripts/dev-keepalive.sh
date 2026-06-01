#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_FILE="${DEV_LOG_FILE:-/tmp/payroll-next-dev.log}"
PID_FILE="${DEV_PID_FILE:-/tmp/payroll-next-dev.pid}"
HEALTH_URL="${DEV_HEALTH_URL:-http://127.0.0.1:3000/}"

print_usage() {
  cat <<EOF
Usage: bash scripts/dev-keepalive.sh <start|stop|status|health|logs>
EOF
}

is_pid_running() {
  local pid="$1"
  kill -0 "$pid" 2>/dev/null
}

read_pid() {
  if [[ -f "$PID_FILE" ]]; then
    cat "$PID_FILE"
  else
    echo ""
  fi
}

find_next_pid() {
  pgrep -f "node .*/next dev" | head -n 1 || true
}

start_server() {
  local existing_pid=""
  existing_pid="$(read_pid)"

  if [[ -n "$existing_pid" ]] && is_pid_running "$existing_pid"; then
    echo "Dev server already running with PID $existing_pid"
    return 0
  fi

  local detected_pid=""
  detected_pid="$(find_next_pid)"
  if [[ -n "$detected_pid" ]]; then
    echo "$detected_pid" > "$PID_FILE"
    echo "Dev server already running with PID $detected_pid"
    return 0
  fi

  cd "$ROOT_DIR"
  nohup npm run dev > "$LOG_FILE" 2>&1 &
  local npm_pid=$!

  sleep 2

  if is_pid_running "$npm_pid"; then
    echo "$npm_pid" > "$PID_FILE"
    echo "Started dev server (PID $npm_pid)"
    echo "Logs: $LOG_FILE"
    health_check || true
  else
    echo "Failed to start dev server. Check logs: $LOG_FILE" >&2
    return 1
  fi
}

stop_server() {
  local pid=""
  pid="$(read_pid)"

  if [[ -n "$pid" ]] && is_pid_running "$pid"; then
    kill "$pid" 2>/dev/null || true
  fi

  pkill -f "node .*/next dev" 2>/dev/null || true
  pkill -f "npm run dev" 2>/dev/null || true

  rm -f "$PID_FILE"
  echo "Stopped dev server"
}

status_server() {
  local pid=""
  pid="$(read_pid)"

  if [[ -n "$pid" ]] && is_pid_running "$pid"; then
    echo "Dev server running with PID $pid"
    return 0
  fi

  local detected_pid=""
  detected_pid="$(find_next_pid)"
  if [[ -n "$detected_pid" ]]; then
    echo "$detected_pid" > "$PID_FILE"
    echo "Dev server running with PID $detected_pid"
    return 0
  fi

  echo "Dev server is not running"
  return 1
}

health_check() {
  local code=""
  code="$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" || echo "000")"

  if [[ "$code" == "200" || "$code" == "307" || "$code" == "308" ]]; then
    echo "Health OK: $HEALTH_URL -> HTTP $code"
    return 0
  fi

  echo "Health FAIL: $HEALTH_URL -> HTTP $code"
  return 1
}

show_logs() {
  if [[ -f "$LOG_FILE" ]]; then
    tail -n 80 "$LOG_FILE"
  else
    echo "No log file found at $LOG_FILE"
  fi
}

main() {
  local cmd="${1:-}"

  case "$cmd" in
    start)
      start_server
      ;;
    stop)
      stop_server
      ;;
    status)
      status_server
      ;;
    health)
      health_check
      ;;
    logs)
      show_logs
      ;;
    *)
      print_usage
      return 1
      ;;
  esac
}

main "$@"
