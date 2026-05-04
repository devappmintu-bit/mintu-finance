#!/usr/bin/env bash
# /app/scripts/apply_metro_patches.sh
#
# Round 83 — Metro + framer-motion + tslib 2.8.x interop fix.
#
# Why this exists: `tslib/modules/index.js` does `import tslib from
# '../tslib.js'` and then destructures from `tslib.default`. tslib.js
# is a CJS file that sets `exports.__esModule = true`, which causes
# Metro's babel `_interopRequireDefault` to NOT wrap it in
# `{ default: ... }`. Result: `tslib.default` is undefined --> every
# Metro web bundle that transitively pulls framer-motion (via moti)
# crashes at 99% bundled with:
#
#   TypeError: Cannot destructure property '__extends' of
#   'tslib.default' as it is undefined.
#
# Fix: switch the destructure source to a namespace import
# (`import * as tslibAll`) which works with both real-ESM and
# CJS-wrapped modules. Patch lives at
# /app/frontend/node_modules/tslib/modules/index.js.
#
# This script is IDEMPOTENT -- running it twice is a no-op. It is
# called from startup.sh so the patch survives `yarn install`
# (which rewrites node_modules) and container cold-boots.
#
# IMPORTANT: sentinel string is ASCII-only (no unicode arrows) so
# `sed` and `grep` never choke on multibyte chars. Round 87 fix.

set -u

LOG_PREFIX="[metro-patch]"
TS_FILE="/app/frontend/node_modules/tslib/modules/index.js"
SENTINEL="// MintU patch: Metro CJS-ESM interop"

ts() { date -u +'%Y-%m-%dT%H:%M:%SZ'; }
log() { echo "$(ts) ${LOG_PREFIX} $*"; }

if [ ! -f "$TS_FILE" ]; then
  log "tslib not installed yet -- skipping patch (will reapply later)."
  exit 0
fi

if grep -qF "$SENTINEL" "$TS_FILE" 2>/dev/null; then
  log "tslib patch already applied -- no-op."
  exit 0
fi

log "Applying tslib ESM-interop patch to ${TS_FILE}"

# We rewrite ONLY the first line (`import tslib from '../tslib.js';`)
# in-place, prepending the sentinel comment + namespace-import + alias.
# Using python3 here is more reliable than sed for multi-line inserts
# that contain quotes / forward-slashes.
python3 - "$TS_FILE" "$SENTINEL" <<'PYEOF'
import sys
path, sentinel = sys.argv[1], sys.argv[2]
with open(path, 'r') as fh:
    src = fh.read()
old_line = "import tslib from '../tslib.js';"
new_block = (
    f"{sentinel} -- see /app/scripts/apply_metro_patches.sh\n"
    "import * as tslibAll from '../tslib.js';\n"
    "const tslib = tslibAll.default || tslibAll;"
)
if old_line not in src:
    print("ABORT: anchor line not found", file=sys.stderr)
    sys.exit(2)
patched = src.replace(old_line, new_block, 1)
with open(path, 'w') as fh:
    fh.write(patched)
print("OK: patched", path)
PYEOF

if grep -qF "$SENTINEL" "$TS_FILE"; then
  log "OK Patch applied."
else
  log "FAIL Patch did NOT take. Check ${TS_FILE} manually."
  exit 1
fi
