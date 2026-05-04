#!/usr/bin/env bash
# /app/scripts/preview_mode.sh — switch back to the fast static preview.
#
# Stops Metro (expo), frees port 3000, and starts static_web serving
# the prebuilt dist/ bundle. If dist/ is stale, triggers startup.sh
# which rebuilds it first.

set -u
LOG() { echo "[preview_mode] $*"; }

LOG "Stopping expo / metro..."
sudo supervisorctl stop expo 2>/dev/null | tail -1
pkill -9 -f "ngrok start" 2>/dev/null && LOG "  ✓ killed ngrok"
pkill -9 -f "metro"       2>/dev/null || true
sleep 2

LOG "Running startup.sh (rebuilds dist/ if source drifted)..."
bash /app/scripts/startup.sh >/dev/null 2>&1

LOG "Starting static_web..."
sudo supervisorctl start static_web 2>/dev/null | tail -1

sleep 2
if ss -tln 2>/dev/null | grep -q ":3000 "; then
  LOG "  ✓ Static preview listening on :3000"
  exit 0
fi
LOG "  ⚠️  static_web didn't come up. Tail logs:"
tail -15 /var/log/supervisor/static_web.err.log
exit 1
