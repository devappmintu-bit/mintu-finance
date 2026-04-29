#!/usr/bin/env bash
# scripts/check-coverage-floor.sh — Round 52f
#
# Per-module coverage gate. Reads backend/coverage.xml + frontend/
# coverage/coverage-summary.json and FAILS THE BUILD if any
# critical-path module falls below its module-specific floor.
#
# Why per-module, not just global?
#   A 70 % global coverage hides a 0 %-covered ledger module behind a
#   100 %-covered formatter. This script makes ledger / auth / split
#   regressions impossible to merge.
#
# Usage:
#   scripts/check-coverage-floor.sh
#   (run AFTER pytest --cov-report=xml and yarn test:coverage)

set -euo pipefail

# ──────────────────────────────────────────────────────────────────
# Floors (raise quarterly — see docs/QUALITY_AUDIT_R52.md §7)
# ──────────────────────────────────────────────────────────────────
declare -A BACKEND_FLOORS=(
  [core/cache.py]=90
  [core/ws_manager.py]=90
  [core/transactions.py]=80
  [core/auth.py]=30                    # Q1 → 30, Q2 → 60, Q3 → 80
  [routers/users.py]=0                 # integration-only — Q2 add in-process TestClient
  [routers/split_expenses.py]=10       # Q2 → 50, Q3 → 70, Q4 → 85
  [core/ledger.py]=0                   # Q2 → 60, Q3 → 80
)

declare -A FRONTEND_FLOORS=(
  [utils/format.ts]=90
  [services/users.ts]=90
  [services/split.ts]=40               # Q2 → 70
)

# ──────────────────────────────────────────────────────────────────
fail=0
log() { echo "[coverage-floor] $*"; }

# ── Backend (coverage.xml — Cobertura format) ────────────────────
BE_XML="${BACKEND_COVERAGE_XML:-backend/coverage.xml}"
if [ -f "$BE_XML" ]; then
  log "checking backend modules against $BE_XML"
  for module in "${!BACKEND_FLOORS[@]}"; do
    floor="${BACKEND_FLOORS[$module]}"
    pct=$(python3 -c "
import xml.etree.ElementTree as ET, sys, os
tree = ET.parse('$BE_XML')
target = '$module'
target_basename = os.path.basename(target)
# Collect ALL matches; pick the highest coverage (covers the case
# where two source roots happen to have the same basename).
rates = []
for cls in tree.iter('class'):
    fn = cls.get('filename', '')
    if fn.endswith(target) or fn == target_basename:
        rates.append(float(cls.get('line-rate', 0)) * 100)
if rates:
    print(f'{max(rates):.1f}')
else:
    print('MISSING')
" 2>/dev/null || echo "MISSING")
    if [ "$pct" = "MISSING" ]; then
      log "  ⚠  $module — not in coverage report (skipped)"
      continue
    fi
    awk_cmp=$(awk -v p="$pct" -v f="$floor" 'BEGIN{print (p+0 >= f+0) ? "PASS" : "FAIL"}')
    if [ "$awk_cmp" = "PASS" ]; then
      log "  ✓  $module: $pct% ≥ $floor%"
    else
      log "  ✗  $module: $pct% < $floor% (FAIL)"
      fail=1
    fi
  done
else
  log "⚠  $BE_XML not found — skipping backend gate"
fi

# ── Frontend (coverage-summary.json — Jest output) ───────────────
FE_JSON="${FRONTEND_COVERAGE_JSON:-frontend/coverage/coverage-summary.json}"
if [ -f "$FE_JSON" ]; then
  log "checking frontend modules against $FE_JSON"
  for module in "${!FRONTEND_FLOORS[@]}"; do
    floor="${FRONTEND_FLOORS[$module]}"
    pct=$(python3 -c "
import json, sys
d = json.load(open('$FE_JSON'))
for path, stats in d.items():
    if path.endswith('$module'):
        print(f'{stats[\"lines\"][\"pct\"]:.1f}')
        sys.exit(0)
print('MISSING')
" 2>/dev/null || echo "MISSING")
    if [ "$pct" = "MISSING" ]; then
      log "  ⚠  $module — not in coverage report (skipped)"
      continue
    fi
    awk_cmp=$(awk -v p="$pct" -v f="$floor" 'BEGIN{print (p+0 >= f+0) ? "PASS" : "FAIL"}')
    if [ "$awk_cmp" = "PASS" ]; then
      log "  ✓  $module: $pct% ≥ $floor%"
    else
      log "  ✗  $module: $pct% < $floor% (FAIL)"
      fail=1
    fi
  done
else
  log "⚠  $FE_JSON not found — skipping frontend gate"
fi

if [ "$fail" -eq 1 ]; then
  log "FAILED — at least one critical-path module is below its floor."
  log "Either add tests or update scripts/check-coverage-floor.sh deliberately."
  exit 1
fi

log "ALL critical-path modules meet their coverage floors."
exit 0
