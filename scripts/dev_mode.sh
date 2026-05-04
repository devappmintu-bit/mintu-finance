#!/usr/bin/env bash
# /app/scripts/dev_mode.sh — switch the preview URL to live Metro.
#
# What this does (in order):
#   1. Stops static_web (frees port 3000).
#   2. Kills any stale ngrok processes that might still be holding
#      the `mintu-finance.ngrok.io` subdomain from a previous boot.
#      Without this the new expo tunnel fails with ERR_NGROK_334.
#   3. Applies the tslib/Metro interop patch (idempotent).
#   4. Starts the expo tunnel — Metro now serves on port 3000.
#
# After this runs, edits to /app/frontend/* are bundled on the fly;
# the preview URL reflects changes without `expo export`.

set -u
LOG() { echo "[dev_mode] $*"; }

LOG "Stopping static_web..."
sudo supervisorctl stop static_web 2>/dev/null | tail -1

LOG "Killing stale ngrok / metro processes..."
pkill -9 -f "ngrok start" 2>/dev/null && LOG "  ✓ killed ngrok"
pkill -9 -f "metro"       2>/dev/null || true
sleep 1

LOG "Applying tslib/Metro patches..."
/app/scripts/apply_metro_patches.sh

LOG "Starting expo supervisor program..."
sudo supervisorctl start expo 2>/dev/null | tail -1

LOG "Waiting for Metro to listen on :3000 (up to 40 s)..."
for i in $(seq 1 40); do
  if ss -tln 2>/dev/null | grep -q ":3000 "; then
    LOG "  ✓ Metro listening (waited ${i}s)"
    exit 0
  fi
  sleep 1
done
LOG "  ⚠️  Metro didn't come up in 40 s. Tail logs:"
tail -15 /var/log/supervisor/expo.err.log
exit 1
