#!/usr/bin/env bash
# pre-commit-typecheck.sh — block any commit that breaks `tsc --noEmit`.
#
# Why this exists:
#   In Round 49 (Apr 25 2026) we drove the frontend TypeScript error count
#   from 2,228 to 0 via a single structural fix in utils/makeStyles.ts plus
#   a long tail of small file-level fixes. Without a guard, every PR that
#   touches RN style code can silently re-widen literal types or re-introduce
#   missing-property bugs and we'd be back at 2200+ within weeks.
#
# Behaviour:
#   • Only runs when staged files include something under /app/frontend/.
#   • Runs `npx tsc --noEmit` from /app/frontend.
#   • Exits non-zero on any error → commit is aborted with a clear message.
#   • Skip with `git commit --no-verify` for emergencies (logged in CI).
#
# Install:
#   bash /app/scripts/install-git-hooks.sh
#   (adds a thin trampoline to .git/hooks/pre-commit that execs this script)

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo /app)"
FRONTEND="$ROOT/frontend"

# Skip if no frontend changes are staged.
if ! git diff --cached --name-only | grep -q '^frontend/'; then
  exit 0
fi

if [ ! -d "$FRONTEND" ]; then
  echo "[pre-commit-typecheck] $FRONTEND not found — skipping."
  exit 0
fi

echo "[pre-commit-typecheck] Running tsc --noEmit on /app/frontend …"
cd "$FRONTEND"

if npx --no-install tsc --noEmit 2>&1; then
  echo "[pre-commit-typecheck] ✅ Zero TypeScript errors. Proceeding with commit."
  exit 0
else
  cat <<'MSG'

──────────────────────────────────────────────────────────────────
  ❌ TypeScript errors detected — commit blocked.
──────────────────────────────────────────────────────────────────
  Fix the errors above, OR if this is a documented WIP:
     git commit --no-verify -m "…"
  (use sparingly — CI will still fail on the PR.)

  To investigate locally:
     cd /app/frontend && yarn typecheck
──────────────────────────────────────────────────────────────────
MSG
  exit 1
fi
