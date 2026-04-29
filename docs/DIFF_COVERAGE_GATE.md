# Round 53b — Diff Coverage Gate

## What it is
A CI gate that enforces **≥ 80% test coverage on every line CHANGED in a
PR**, regardless of the global coverage percentage. Complements (does
not replace) the per-module coverage floor at
`scripts/check-coverage-floor.sh`.

## Why two gates instead of one?

| Gate                       | What it protects                       | When it fires |
|----------------------------|----------------------------------------|---------------|
| `check-coverage-floor.sh`  | Existing critical-path modules don't regress | Every push & PR |
| `diff-coverage.sh`         | New code in this PR is tested ≥ 80%    | PRs only      |

The floor stops critical modules sliding backwards. The diff gate stops
new untested code from sneaking in. Together they make the codebase
**self-improving** — every PR raises the bar.

## Why diff coverage instead of global %?
Global % is misleading. A 70% global number could mean:
- new code is 0%, old code is 100% (project rotting), OR
- new code is 90%, old code is 60% (project healing).

Diff coverage forces the right question:
> *"Did **this PR** cover what it added?"*

That's the only metric that scales with team velocity without rewarding
regression.

## How it runs

### CI (GitHub Actions)
Defined in `.github/workflows/quality.yml` as the `diff-coverage` job:
```yaml
diff-coverage:
  if: github.event_name == 'pull_request'
  needs: [backend, frontend]
  steps:
    - uses: actions/checkout@v4
      with: { fetch-depth: 0 }   # full history for git diff
    - run: pip install diff-cover==10.2.0
    - uses: actions/download-artifact@v4    # backend-coverage
    - uses: actions/download-artifact@v4    # frontend-coverage
    - run: bash scripts/diff-coverage.sh "origin/${{ github.base_ref }}"
    - uses: actions/upload-artifact@v4
      with: { name: diff-coverage-reports, path: diff-coverage-report/ }
```
HTML reports are uploaded as a workflow artifact for reviewer feedback.

### Local
```bash
# 1. Generate coverage first
cd backend && pytest --cov=. --cov-report=xml:coverage.xml
cd ../frontend && yarn test:coverage

# 2. Run the gate against your base branch (default origin/main)
bash scripts/diff-coverage.sh
# or pin a different base:
bash scripts/diff-coverage.sh origin/develop
```

## Tunable knobs
| Env var                   | Default                              | Purpose |
|---------------------------|--------------------------------------|---------|
| `DIFF_COVERAGE_FLOOR`     | `80`                                 | % threshold |
| `BACKEND_COVERAGE_XML`    | `backend/coverage.xml`               | cobertura XML |
| `FRONTEND_LCOV`           | `frontend/coverage/lcov.info`        | lcov input |
| `DIFF_REPORT_DIR`         | `diff-coverage-report`               | HTML output |

## Excluded paths (don't inflate signal)
- `*/tests/*`, `*/__tests__/*`, `test_*.py`, `*_test.py`
- `*.config.js/ts`, `jest.config.*`, `jest.setup.*`
- `*/coverage/*`, `*/dist/*`, `*/build/*`, `*/node_modules/*`, `*/.expo/*`
- `*/migrations/*`, `*/scripts/*`, `*/conftest.py`, `*/__mocks__/*`,
  `*/__generated__/*`

## Failure example
```
[diff-coverage] Backend diff coverage: backend/coverage.xml  (floor: 80%)
-------------
Diff Coverage
Diff: origin/main...HEAD
-------------
backend/routers/widgets.py (62.5%): Missing lines 45,46,47,52
-------------
Total:   24 lines
Missing: 9 lines
Coverage: 62%
-------------
[diff-coverage]   ✗ Backend diff coverage FAILED (< 80%)
[diff-coverage] FAILED: at least one diff-coverage gate is below 80%.
[diff-coverage] Reports: diff-coverage-report/{backend,frontend}-diff-coverage.html
exit 1
```

## Round 53b verification (this PR)
Running the gate against `HEAD~1`:
```
Backend diff coverage: 95% (123 lines, 5 missing)
  • backend/core/ledger_invariant.py: 96.8%
  • backend/core/money.py:            95.1%
Frontend diff coverage: no JS/TS lines changed → trivially passes
ALL diff-coverage gates pass at ≥ 80%.   exit 0
```
