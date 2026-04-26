# TypeScript Strict-Mode Guard

**Status**: 🟢 Active since Round 49 (Apr 25 2026)

## What It Protects

The MintU frontend has **zero TypeScript errors** as of Round 49. This guard
ensures we stay there. It blocks both:

1. **Local commits** that introduce TS errors (via git pre-commit hook).
2. **PRs / pushes** that introduce TS errors (via GitHub Actions).

Without this guard, the next feature PR that touches RN style code can silently
re-widen literal types and the count climbs back to 2200+ within weeks. The
structural fix in `utils/makeStyles.ts` only holds while every consumer
file keeps using `NamedStyles<T>`-compatible factories.

## How To Install Locally (once per clone)

```bash
bash /app/scripts/install-git-hooks.sh
```

This installs a pre-commit hook at `.git/hooks/pre-commit` that:
- Skips if no `frontend/**` files are staged (don't pay cost for backend-only commits).
- Runs `npx tsc --noEmit` in `/app/frontend`.
- Aborts the commit on any error.

## How To Run Manually

```bash
cd /app/frontend && yarn typecheck
```

Watch mode for active development:

```bash
cd /app/frontend && yarn typecheck:watch
```

## CI (GitHub Actions)

`.github/workflows/typecheck.yml` runs `yarn typecheck` on every push and PR
to `main`/`master`. The job fails if `tsc --noEmit` returns any errors.

## Bypass (Emergency Only)

```bash
git commit --no-verify -m "WIP: <reason>"
```

**Use sparingly.** CI will still fail the PR; the local bypass only buys you
time to push a half-done branch for collaboration. Always follow up with a
commit that restores zero errors before requesting review.

## Adding A New File With A `// TODO: runtime fix needed` Comment

Only accepted if:
1. The TODO is genuinely a runtime concern (variable references, missing impl).
2. The cast is `as unknown as X` (never bare `as any` to satisfy lint).
3. A tracking issue is opened referencing the file and line.

See Round 49 final report — five such TODOs were created during the cleanup
for genuine runtime bugs that pre-dated the type sweep.

## Round 49 Baseline (Reference)

| Metric          | Value |
|-----------------|-------|
| Errors before   | 2,228 |
| Errors after    | **0** |
| Files modified  | 17    |
| `// TODO`s left | 5     |
| Key fix         | `utils/makeStyles.ts` — `NamedStyles<T>` constraint |
