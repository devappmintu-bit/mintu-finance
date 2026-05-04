#!/usr/bin/env bash
# /app/scripts/startup.sh — Round 51b
#
# Container/deployment startup hook for the MintU web preview.
#
# Responsibilities:
#   1. Verify or rebuild the production export at /app/frontend/dist/
#      (rebuild trigger = source-hash mismatch OR dist older than 24h).
#   2. Stop the read-only Expo dev server (`supervisorctl stop expo`)
#      so it can't grab port 3000.
#   3. Make sure the [program:static_web] is up.
#   4. If `npx expo export` fails for any reason, FALL BACK to the dev
#      server so the app is never down — surface the error in logs but
#      do not exit non-zero.
#
# Idempotent + safe to re-run.  Also called by web_switcher.sh.

set -uo pipefail

LOG_PREFIX="[startup]"
DIST_DIR="/app/frontend/dist"
HASH_FILE="${DIST_DIR}/.build_hash"
FRONTEND_DIR="/app/frontend"
MAX_AGE_SECONDS=$((24 * 60 * 60))   # 24 hours
LOG_FILE="/var/log/supervisor/web_startup.log"

mkdir -p "$(dirname "$LOG_FILE")"
exec >> "$LOG_FILE" 2>&1

ts() { date -u +'%Y-%m-%dT%H:%M:%SZ'; }
log() { echo "$(ts) ${LOG_PREFIX} $*"; }

log "=================================================="
log "Startup hook firing."

# --- 0. Apply node_modules patches (Metro/tslib, etc.) --------------
# Round 83 — ensures the tslib ESM-interop patch survives yarn
# install + container restarts. The script itself is idempotent and
# is safe to call on every boot.
if [ -x /app/scripts/apply_metro_patches.sh ]; then
  log "→ Applying Metro node_modules patches"
  /app/scripts/apply_metro_patches.sh || log "  ⚠️  Metro patches failed (non-fatal)"
fi

# --- 1. Compute current source hash ---------------------------------------
compute_source_hash() {
  # Hash everything that could change the bundle output.
  # Use find -print0 + sha256sum to avoid arg-list explosion on huge trees.
  {
    find "${FRONTEND_DIR}/app" -type f \( -name '*.tsx' -o -name '*.ts' -o -name '*.js' -o -name '*.json' \) -print0 2>/dev/null
    find "${FRONTEND_DIR}/components" -type f \( -name '*.tsx' -o -name '*.ts' \) -print0 2>/dev/null
    find "${FRONTEND_DIR}/utils" -type f \( -name '*.tsx' -o -name '*.ts' \) -print0 2>/dev/null
    find "${FRONTEND_DIR}/store" -type f \( -name '*.tsx' -o -name '*.ts' \) -print0 2>/dev/null
    find "${FRONTEND_DIR}/constants" -type f \( -name '*.tsx' -o -name '*.ts' \) -print0 2>/dev/null
    printf '%s\0' "${FRONTEND_DIR}/package.json" "${FRONTEND_DIR}/babel.config.js" "${FRONTEND_DIR}/metro.config.js" "${FRONTEND_DIR}/app.json"
  } | xargs -0 -r sha256sum 2>/dev/null | sort | sha256sum | cut -d' ' -f1
}

# --- 2. Decide whether to rebuild dist/ -----------------------------------
needs_rebuild() {
  if [ ! -d "$DIST_DIR" ] || [ ! -f "${DIST_DIR}/index.html" ]; then
    log "  → dist/ missing or empty"; return 0
  fi
  if [ ! -f "$HASH_FILE" ]; then
    log "  → no build hash file"; return 0
  fi

  # Trust very-fresh dist/ regardless of hash format. The postinstall hook
  # (Node.js) and this script (bash) use different hash algorithms, so their
  # hashes won't match each other — but if dist/ was built within the last
  # hour, we know it's the canonical artefact for the current source.
  local mtime now age
  mtime=$(stat -c %Y "${DIST_DIR}/index.html" 2>/dev/null || echo 0)
  now=$(date +%s)
  age=$((now - mtime))
  if [ "$age" -lt 3600 ]; then
    log "  → dist/ is very fresh (age=${age}s — trusting CI/postinstall build)"
    return 1
  fi

  local current_hash stored_hash
  current_hash=$(compute_source_hash)
  stored_hash=$(cat "$HASH_FILE" 2>/dev/null || echo "")

  if [ "$current_hash" != "$stored_hash" ]; then
    log "  → source hash drift detected (was ${stored_hash:0:8}…, now ${current_hash:0:8}…)"
    return 0
  fi

  # Age check (defensive — handles cases where hash is stable but build
  # artefacts somehow corrupted).
  if [ "$age" -gt "$MAX_AGE_SECONDS" ]; then
    log "  → dist/ older than 24h (age=${age}s)"
    return 0
  fi

  log "  → dist/ is fresh (hash match, age=${age}s)"
  return 1
}

rebuild_dist() {
  log "▶︎ Rebuilding production export…"
  cd "$FRONTEND_DIR" || { log "❌ cd to ${FRONTEND_DIR} failed"; return 1; }

  local tmp_dir="${DIST_DIR}.tmp"
  rm -rf "$tmp_dir"

  # Use a long timeout — full export is normally 2–4 min on this hardware.
  if ! timeout 600 npx expo export --platform web --output-dir "$tmp_dir" >> "$LOG_FILE" 2>&1; then
    log "❌ expo export FAILED — leaving previous dist/ in place"
    rm -rf "$tmp_dir"
    return 1
  fi

  if [ ! -f "${tmp_dir}/index.html" ]; then
    log "❌ expo export produced no index.html — leaving previous dist/ in place"
    rm -rf "$tmp_dir"
    return 1
  fi

  # Atomic swap: rename old → trash, new → live.
  if [ -d "$DIST_DIR" ]; then
    mv "$DIST_DIR" "${DIST_DIR}.old" || true
  fi
  mv "$tmp_dir" "$DIST_DIR" || { log "❌ atomic swap failed"; return 1; }
  rm -rf "${DIST_DIR}.old"

  compute_source_hash > "$HASH_FILE"
  log "✅ dist/ rebuilt — size: $(du -sh "$DIST_DIR" | cut -f1)"
  return 0
}

if needs_rebuild; then
  if ! rebuild_dist; then
    log "⚠️  Rebuild failed. Falling back to Expo dev server."
    log "   The static_web program will still try to serve the previous dist/ if present."
    # If no dist/ at all, leave Expo running so the app stays up.
    if [ ! -f "${DIST_DIR}/index.html" ]; then
      log "   No dist/ available — keeping Expo dev server alive."
      exit 0
    fi
  fi
fi

# --- 3. Stop Expo dev server, ensure static_web is running ---------------
if command -v supervisorctl >/dev/null 2>&1; then
  log "▶︎ Switching from Expo dev to static_web on port 3000…"
  supervisorctl stop expo 2>/dev/null || log "  (expo already stopped)"
  # Give expo a moment to release port 3000 before starting static_web.
  sleep 1
  supervisorctl start static_web 2>/dev/null || \
    supervisorctl restart static_web 2>/dev/null || \
    log "  (static_web not registered — supervisor reread/update needed)"
  log "✅ static_web should now be serving on :3000"
else
  log "⚠️  supervisorctl not found — port-3000 swap skipped"
fi

log "Startup hook complete."
exit 0
