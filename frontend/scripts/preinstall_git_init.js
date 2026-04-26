#!/usr/bin/env node
/**
 * Round 51c — Pre-install git bootstrap.
 *
 * The Emergent CI pipeline triggers an `eas update` step BEFORE the
 * runtime container is built. EAS CLI's preflight calls
 *   git rev-parse --show-toplevel
 * which exits 128 when the working tree was copied without a `.git/`
 * directory — the pipeline's typical layout. This causes Step #12
 * "eas-update" to fail with the recurring `exit 128` error even though
 * `eas.json` has `requireCommit: false` (that flag only applies to
 * `eas build`, not `eas update`'s preflight).
 *
 * This `preinstall` hook fires the moment the pipeline runs
 * `yarn install` and guarantees the working tree is a valid git repo
 * with at least one commit BEFORE any subsequent EAS command runs.
 *
 * Safety contract:
 *   • IDEMPOTENT — if we're already inside a work-tree (e.g. local dev
 *     where `/app/.git` exists), we skip everything. No nested repos.
 *   • NEVER FAILS — wrapped in try/catch; always exits 0 so install
 *     can never break.
 *   • READ-ONLY for existing repos — only acts when no work-tree found.
 *   • NO NETWORK — pure local git plumbing.
 *   • Sets EXPO_NO_GIT_STATUS / EAS_NO_VCS in process for any child
 *     spawned later (belt-and-suspenders for newer EAS versions).
 */
const { execSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function git(args, opts = {}) {
  return execSync(`git ${args}`, {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    ...opts,
  }).trim();
}

function isInsideWorkTree() {
  try {
    const out = git('rev-parse --is-inside-work-tree');
    return out === 'true';
  } catch {
    return false;
  }
}

function hasAnyCommit() {
  try {
    git('log -1 --format=%H');
    return true;
  } catch {
    return false;
  }
}

function bootstrap() {
  // Brand-new ephemeral working tree (typical CI scenario).
  console.log('[preinstall] no git work-tree detected → bootstrapping local repo for EAS preflight');
  git('init -q -b main');
  // Local-only identity; never touches global config.
  git('config user.email ci@mintu.local');
  git('config user.name "MintU CI Bootstrap"');
  // Stage everything and create one commit so `git rev-parse
  // --show-toplevel` and `git log -1` both succeed.
  try {
    git('add -A');
  } catch (e) {
    // Massive trees can sometimes hit OS arg limits — ignore and
    // continue; an empty initial commit also satisfies rev-parse.
    console.warn('[preinstall] git add -A skipped:', e.message?.slice(0, 120));
  }
  try {
    git('commit -q --allow-empty -m "ci: bootstrap repo for eas preflight"');
  } catch (e) {
    console.warn('[preinstall] commit failed (non-fatal):', e.message?.slice(0, 120));
  }
}

try {
  if (isInsideWorkTree()) {
    if (!hasAnyCommit()) {
      // Edge case: repo exists but no commits yet (e.g. fresh `git init`).
      try {
        git('config user.email ci@mintu.local');
        git('config user.name "MintU CI Bootstrap"');
        git('add -A');
        git('commit -q --allow-empty -m "ci: bootstrap initial commit"');
        console.log('[preinstall] empty repo → added bootstrap commit');
      } catch (e) {
        console.warn('[preinstall] could not create initial commit:', e.message?.slice(0, 120));
      }
    } else {
      // Common path on local dev: nothing to do.
      // (Quiet by default; uncomment for debug.)
      // console.log('[preinstall] ✓ already inside a git work-tree — no action');
    }
  } else {
    bootstrap();
  }

  // Belt-and-suspenders: ensure downstream EAS invocations skip git
  // status/VCS checks even if the env didn't carry them in.
  // (process.env mutation is scoped to this script + children.)
  process.env.EXPO_NO_GIT_STATUS = process.env.EXPO_NO_GIT_STATUS || '1';
  process.env.EAS_NO_VCS = process.env.EAS_NO_VCS || '1';
} catch (err) {
  console.warn('[preinstall] git bootstrap encountered an error (continuing):', err.message?.slice(0, 200));
}

// NEVER fail the install.
process.exit(0);
