#!/usr/bin/env bash
# PAY-73: run the check once at start-up (so every deploy proves itself), then
# daily at CHECK_AT_UTC (default 20:30 UTC = 04:30 Manila, two hours after
# Dokploy's 02:30 Manila backup).
set -u
AT="${CHECK_AT_UTC:-20:30}"
/opt/backup-check/check.sh || true
while true; do
  now=$(date -u +%s)
  next=$(date -u -d "today $AT" +%s)
  [ "$next" -le "$now" ] && next=$(date -u -d "tomorrow $AT" +%s)
  echo "[backup-check] next check at $(date -u -d "@$next" +%FT%TZ)"
  sleep $((next - now))
  /opt/backup-check/check.sh || true
done
