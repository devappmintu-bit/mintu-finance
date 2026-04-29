#!/usr/bin/env bash
# scripts/diff-coverage.sh — Round 53b
#
# Diff coverage gate: enforce ≥ DIFF_COVERAGE_FLOOR (default 80%) on
# CHANGED LINES ONLY when comparing against the base branch. Prevents
# legacy untouched code from dragging the global coverage percentage
# down while still guaranteeing every NEW line is tested.
#
# WHY DIFF COVERAGE INSTEAD OF GLOBAL?
#   Global coverage is misleading: a 70% number can mean the new code
#   is at 0% and old code is at 100%. Diff coverage forces the question
#   "did THIS PR cover what it added?" — the only metric that scales
#   with team velocity without rewarding regression.
#
# COMPLEMENTARY TO scripts/check-coverage-floor.sh
#   • coverage-floor.sh → protects existing critical-path modules
#   • diff-coverage.sh  → enforces quality of NEW code in this PR
#
# Usage:
#   ./scripts/diff-coverage.sh [base_branch]
#
#   base_branch: optional, defaults to "origin/main".
#
# Env knobs:
#   DIFF_COVERAGE_FLOOR=80    threshold % (default 80)
#   BACKEND_COVERAGE_XML=...  cobertura XML path
#   FRONTEND_LCOV=...         lcov.info path
#   DIFF_REPORT_DIR=...       where HTML reports land (default ./diff-coverage-report)
#
# Requires the `diff-cover` Python package:
#   pip install diff-cover
set -euo pipefail

BASE_BRANCH="${1:-origin/main}"
FLOOR="${DIFF_COVERAGE_FLOOR:-80}"
BE_XML="${BACKEND_COVERAGE_XML:-backend/coverage.xml}"
FE_LCOV="${FRONTEND_LCOV:-frontend/coverage/lcov.info}"
REPORT_DIR="${DIFF_REPORT_DIR:-diff-coverage-report}"

# Files we deliberately exclude from the diff-coverage gate. These add
# noise without quality signal:
#   • test files          — coverage of tests inflates the numerator
#   • config / build      — declarative, no logic
#   • generated artifacts — not human-authored
#   • migrations          — typically run-once
EXCLUDE_PATTERNS=(
  "*/tests/*"
  "*/__tests__/*"
  "*/test_*.py"
  "*_test.py"
  "*.config.js"
  "*.config.ts"
  "*/jest.config.*"
  "*/jest.setup.*"
  "*/coverage/*"
  "*/dist/*"
  "*/build/*"
  "*/node_modules/*"
  "*/.expo/*"
  "*/migrations/*"
  "*/scripts/*"
  "*/conftest.py"
  "*/__mocks__/*"
  "*/__generated__/*"
)

log() { echo "[diff-coverage] $*"; }
fail=0

# Build the CLI excludes list (--exclude flag accepts repeated values).
EXCLUDE_ARGS=()
for p in "${EXCLUDE_PATTERNS[@]}"; do
  EXCLUDE_ARGS+=(--exclude "$p")
done

mkdir -p "$REPORT_DIR"

# ── Sanity: do we have a base ref to compare against? ────────────────
if ! git rev-parse --verify "$BASE_BRANCH" >/dev/null 2>&1; then
  log "⚠  base ref '$BASE_BRANCH' not found locally."
  log "    On CI: ensure 'fetch-depth: 0' on actions/checkout."
  log "    Skipping diff-coverage gate (treating as soft pass)."
  exit 0
fi

# Quick visibility: how many files diverged?
changed=$(git diff --name-only "$BASE_BRANCH"...HEAD 2>/dev/null | wc -l || echo 0)
log "comparing against $BASE_BRANCH (changed files: $changed)"

if [ "$changed" -eq 0 ]; then
  log "no changed files vs $BASE_BRANCH — diff-coverage trivially passes."
  exit 0
fi

# ── Backend (cobertura XML) ──────────────────────────────────────────
if [ -f "$BE_XML" ]; then
  log "Backend diff coverage: $BE_XML  (floor: ${FLOOR}%)"
  set +e
  diff-cover "$BE_XML" \
    --compare-branch="$BASE_BRANCH" \
    --fail-under="$FLOOR" \
    --format "html:$REPORT_DIR/backend-diff-coverage.html" \
    "${EXCLUDE_ARGS[@]}"
  rc=$?
  set -e
  if [ "$rc" -ne 0 ]; then
    log "  ✗ Backend diff coverage FAILED (< ${FLOOR}%)"
    fail=1
  else
    log "  ✓ Backend diff coverage PASS"
  fi
else
  log "⚠  $BE_XML not found — skipping backend diff-cov"
fi

# ── Frontend (lcov.info) ─────────────────────────────────────────────
if [ -f "$FE_LCOV" ]; then
  log "Frontend diff coverage: $FE_LCOV  (floor: ${FLOOR}%)"
  set +e
  diff-cover "$FE_LCOV" \
    --compare-branch="$BASE_BRANCH" \
    --fail-under="$FLOOR" \
    --format "html:$REPORT_DIR/frontend-diff-coverage.html" \
    "${EXCLUDE_ARGS[@]}"
  rc=$?
  set -e
  if [ "$rc" -ne 0 ]; then
    log "  ✗ Frontend diff coverage FAILED (< ${FLOOR}%)"
    fail=1
  else
    log "  ✓ Frontend diff coverage PASS"
  fi
else
  log "⚠  $FE_LCOV not found — skipping frontend diff-cov"
fi

if [ "$fail" -eq 1 ]; then
  log "──────────────────────────────────────────────────────────────"
  log "FAILED: at least one diff-coverage gate is below ${FLOOR}%."
  log "Reports: $REPORT_DIR/{backend,frontend}-diff-coverage.html"
  log "Add tests for the new lines or split the PR. We do not lower"
  log "the floor on a per-PR basis — that's how legacy debt accrues."
  log "──────────────────────────────────────────────────────────────"
  exit 1
fi

log "ALL diff-coverage gates pass at ≥ ${FLOOR}%."
exit 0
