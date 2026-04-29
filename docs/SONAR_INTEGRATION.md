# SonarCloud Integration — One-Time Setup Runbook (Round 53j)

## What's already wired (no action needed)

- ✅ `sonar-project.properties` — module config for backend (Python) and frontend (TypeScript), coverage report paths, `sonar.qualitygate.wait=true` (job fails if the gate fails).
- ✅ `.github/workflows/quality.yml` → `sonar` job — runs after `backend` + `frontend` jobs, downloads their coverage artifacts, invokes `SonarSource/sonarqube-scan-action@v4` with `SONAR_TOKEN`.
- ✅ Graceful skip — when `SONAR_TOKEN` is unset, the job logs a clear message and exits 0 (no false-red builds for forks / first-run repos).
- ✅ Fork-PR safe — secrets aren't available on forked PRs, so the job skips itself there. Sonar runs on the merge-back push instead.

## What you need to do (one-time)

### 1. Create the SonarCloud project

1. Sign in to https://sonarcloud.io with your GitHub account
2. **+** → **Analyze new project** → pick the repo
3. Choose **GitHub Actions** as the analysis method
4. SonarCloud will display a `SONAR_TOKEN` value — **copy it**
5. Confirm the org slug in SonarCloud matches `sonar.organization` in `sonar-project.properties`. If it doesn't, edit the property file (or override in CI with `-Dsonar.organization=...`).

### 2. Add the secret to GitHub

```
GitHub repo → Settings → Secrets and variables → Actions → New repository secret
  Name:  SONAR_TOKEN
  Value: <paste from step 1>
```

### 3. Configure the *New Code* quality gate (the most important step)

In SonarCloud UI:

```
Project → Administration → Quality Gates → Create / select gate
```

Required conditions on **New Code** (the diff since the last analysed commit):

| Metric                         | Operator | Threshold |
|--------------------------------|----------|-----------|
| Coverage                       | ≥        | **80 %**  |
| Duplicated lines (%)           | ≤        | 3 %       |
| New Bugs                       | =        | 0         |
| New Vulnerabilities            | =        | 0         |
| New Security Hotspots Reviewed | =        | 100 %     |
| Maintainability Rating         | =        | **A**     |

Then attach the gate to the project (**Project Settings → Quality Gate → use selected gate**).

### 4. Make the `sonar` job *required* for merge

```
GitHub repo → Settings → Branches → Branch protection rules → main
  ✓ Require status checks to pass before merging
  ✓ Require branches to be up to date before merging
  Add:  sonar
        Backend · pytest --cov
        Frontend · jest --coverage
        Per-module coverage floor (critical-path gate)
        Diff coverage (PR-only gate, ≥80% on changed lines)
```

## Verification checklist

After step 4:

- [ ] Open a draft PR with one trivial line change → CI runs → `sonar` shows green.
- [ ] Open a PR that adds an untested function → diff-coverage gate AND/OR Sonar new-code gate fails → merge button disabled.
- [ ] SonarCloud dashboard shows coverage trend, code-smell count, security-hotspot list.
- [ ] On a fork PR, `sonar` is *skipped* (logged, not failed). On the post-merge push to `main`, it runs and updates the dashboard.

## How this complements the existing local gates

| Gate | Scope | Where it runs | Failure cost |
|------|-------|---------------|--------------|
| `scripts/check-coverage-floor.sh` | Per-module floors on critical paths | every push + PR | hard fail |
| `scripts/diff-coverage.sh`        | ≥80% on PR-changed lines           | PR only          | hard fail |
| **SonarCloud Quality Gate**       | **All gates above + maintainability + bugs + duplications + security** | every push + PR (when token set) | hard fail (`qualitygate.wait=true`) |

The local scripts give fast feedback for solo devs; Sonar gives org-wide enforcement, historical tracking, and a unified dashboard. They overlap intentionally — you want the gate to fail at the cheapest point that catches the issue.

## Troubleshooting

**"⚠  SONAR_TOKEN is NOT configured"** in the workflow logs
  → You haven't added the secret yet. Step 2 above.

**Sonar job runs but reports `Could not find ... organization`**
  → The `sonar.organization` value in `sonar-project.properties` doesn't match your SonarCloud org slug. Edit the file or override with `-Dsonar.organization=<slug>` in the workflow.

**Sonar gate is green locally but red on SonarCloud**
  → The local diff-coverage check uses `git diff` against the base branch; SonarCloud uses its own *New Code* definition (default: previous version / branch / 30-day window). Visit the project's New Code settings if the definitions diverge.

**Coverage shows 0% on Sonar despite tests passing**
  → The coverage artifacts aren't being downloaded into the right paths. Verify `.github/workflows/quality.yml` runs the coverage steps before the sonar job and that `sonar-project.properties` points at the right files (`backend/coverage.xml`, `frontend/coverage/lcov.info`).
