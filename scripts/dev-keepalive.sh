#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_FILE="${DEV_LOG_FILE:-/tmp/payroll-next-dev.log}"
PID_FILE="${DEV_PID_FILE:-/tmp/payroll-next-dev.pid}"
SUPERVISOR_PID_FILE="${DEV_SUPERVISOR_PID_FILE:-/tmp/payroll-next-dev-supervisor.pid}"
STOP_FILE="${DEV_STOP_FILE:-/tmp/payroll-next-dev.stop}"
HEALTH_URL="${DEV_HEALTH_URL:-http://127.0.0.1:3000/}"
SERVER_BASE_URL="${DEV_BASE_URL:-http://127.0.0.1:3000}"
PREWARM_ROUTES="${DEV_PREWARM_ROUTES:-/centralportal/login /login?callbackUrl=%2F /ess /remotekiosk}"

print_usage() {
  cat <<EOF
Usage: bash scripts/dev-keepalive.sh <start|start-auto|stop|status|status-auto|health|prewarm|logs>
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

read_supervisor_pid() {
  if [[ -f "$SUPERVISOR_PID_FILE" ]]; then
    cat "$SUPERVISOR_PID_FILE"
  else
    echo ""
  fi
}

clear_pid_files() {
  rm -f "$PID_FILE" "$SUPERVISOR_PID_FILE" "$STOP_FILE"
}

wait_for_health() {
  local retries=60
  local i

  for ((i = 1; i <= retries; i++)); do
    if health_check >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  return 1
}

prewarm_routes() {
  local route
  local start_ts
  local end_ts
  local elapsed

  start_ts="$(date +%s)"
  echo "Prewarm: starting route warmup" >> "$LOG_FILE"

  for route in $PREWARM_ROUTES; do
    curl -s -o /dev/null --max-time 180 "$SERVER_BASE_URL$route" || true
  done

  end_ts="$(date +%s)"
  elapsed=$((end_ts - start_ts))
  echo "Prewarm: completed in ${elapsed}s" >> "$LOG_FILE"
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
    if wait_for_health; then
      health_check || true
      prewarm_routes
    else
      echo "Warning: server did not become healthy within 60s" >&2
    fi
  else
    echo "Failed to start dev server. Check logs: $LOG_FILE" >&2
    return 1
  fi
}

supervise_loop() {
  cd "$ROOT_DIR"

  while true; do
    if [[ -f "$STOP_FILE" ]]; then
      break
    fi

    npm run dev >> "$LOG_FILE" 2>&1 &
    local child_pid=$!
    echo "$child_pid" > "$PID_FILE"

    if wait_for_health; then
      echo "[$(date -Is)] health check passed" >> "$LOG_FILE"
      prewarm_routes
    else
      echo "[$(date -Is)] health check timed out" >> "$LOG_FILE"
    fi

    set +e
    wait "$child_pid"
    local exit_code=$?
    set -e

    if [[ -f "$STOP_FILE" ]]; then
      break
    fi

    echo "[$(date -Is)] dev exited with code $exit_code, restarting in 2s" >> "$LOG_FILE"
    sleep 2
  done

  clear_pid_files
}

start_auto_server() {
  local supervisor_pid=""
  supervisor_pid="$(read_supervisor_pid)"

  if [[ -n "$supervisor_pid" ]] && is_pid_running "$supervisor_pid"; then
    echo "Auto-restart supervisor already running with PID $supervisor_pid"
    if health_check; then
      echo "Dev server is healthy and ready"
      return 0
    fi

    echo "Supervisor is running but dev server is unhealthy, restarting supervisor..."
    stop_server >/dev/null 2>&1 || true
  fi

  rm -f "$STOP_FILE"

  nohup bash "$0" __supervise >> "$LOG_FILE" 2>&1 &
  local started_supervisor_pid=$!
  echo "$started_supervisor_pid" > "$SUPERVISOR_PID_FILE"

  sleep 2

  if is_pid_running "$started_supervisor_pid"; then
    echo "Started auto-restart supervisor (PID $started_supervisor_pid)"
    echo "Logs: $LOG_FILE"
    if wait_for_health; then
      health_check || true
    else
      echo "Warning: server did not become healthy within 60s" >&2
    fi
  else
    echo "Failed to start auto-restart supervisor. Check logs: $LOG_FILE" >&2
    return 1
  fi
}

stop_server() {
  local pid=""
  pid="$(read_pid)"
  local supervisor_pid=""
  supervisor_pid="$(read_supervisor_pid)"

  touch "$STOP_FILE"

  if [[ -n "$supervisor_pid" ]] && is_pid_running "$supervisor_pid"; then
    kill "$supervisor_pid" 2>/dev/null || true
  fi

  if [[ -n "$pid" ]] && is_pid_running "$pid"; then
    kill "$pid" 2>/dev/null || true
  fi

  pkill -f "node .*/next dev" 2>/dev/null || true

  clear_pid_files
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

status_auto_server() {
  local supervisor_pid=""
  supervisor_pid="$(read_supervisor_pid)"

  if [[ -n "$supervisor_pid" ]] && is_pid_running "$supervisor_pid"; then
    echo "Auto-restart supervisor running with PID $supervisor_pid"
    return 0
  fi

  echo "Auto-restart supervisor is not running"
  return 1
}

health_check() {
  local code=""
  code="$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null || true)"

  if [[ -z "$code" ]]; then
    code="000"
  fi

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
    start-auto)
      start_auto_server
      ;;
    stop)
      stop_server
      ;;
    status)
      status_server
      ;;
    status-auto)
      status_auto_server
      ;;
    health)
      health_check
      ;;
    prewarm)
      prewarm_routes
      ;;
    logs)
      show_logs
      ;;
    __supervise)
      supervise_loop
      ;;
    *)
      print_usage
      return 1
      ;;
  esac
}

main "$@"
