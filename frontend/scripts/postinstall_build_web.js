#!/usr/bin/env node
/**
 * Round 51b — Post-install build hook.
 *
 * Triggered automatically after `yarn install`. Builds the production web
 * export (`dist/`) ONLY when one of the following is true:
 *
 *   • EMERGENT_DEPLOY=1   (Emergent deploy pipeline)
 *   • CI=true             (Generic CI)
 *   • BUILD_WEB=1         (Explicit user request)
 *
 * Otherwise it's a no-op so local developer installs stay snappy.
 *
 * If the build fails, the script logs the error but exits 0 so it never
 * breaks `yarn install`. The runtime startup.sh has its own fallback
 * (rebuilds on first boot if dist/ is missing).
 *
 * Skips if dist/index.html already exists and the source hash matches —
 * idempotent across re-runs.
 */
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const HASH_FILE = path.join(DIST, '.build_hash');

const TRIGGERS = ['EMERGENT_DEPLOY', 'CI', 'BUILD_WEB'];
const triggered = TRIGGERS.find(
  (k) => process.env[k] === '1' || process.env[k] === 'true'
);

if (!triggered) {
  // Quiet no-op — developer install. The runtime startup.sh handles
  // first-boot rebuild when needed.
  process.exit(0);
}

console.log(`[postinstall] ${triggered}=${process.env[triggered]} → web build pre-flight`);

function walk(dir, exts) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) stack.push(p);
      else if (exts.some((e) => entry.name.endsWith(e))) out.push(p);
    }
  }
  return out;
}

function computeHash() {
  const exts = ['.tsx', '.ts', '.js', '.json'];
  const files = [
    ...walk(path.join(ROOT, 'app'), exts),
    ...walk(path.join(ROOT, 'components'), ['.tsx', '.ts']),
    ...walk(path.join(ROOT, 'utils'), ['.tsx', '.ts']),
    ...walk(path.join(ROOT, 'store'), ['.tsx', '.ts']),
    ...walk(path.join(ROOT, 'constants'), ['.tsx', '.ts']),
    path.join(ROOT, 'package.json'),
    path.join(ROOT, 'babel.config.js'),
    path.join(ROOT, 'metro.config.js'),
    path.join(ROOT, 'app.json'),
  ].filter(fs.existsSync).sort();

  const sha = crypto.createHash('sha256');
  for (const f of files) {
    const buf = fs.readFileSync(f);
    sha.update(crypto.createHash('sha256').update(buf).digest('hex'));
    sha.update(f);
  }
  return sha.digest('hex');
}

const distExists = fs.existsSync(path.join(DIST, 'index.html'));
const storedHash = fs.existsSync(HASH_FILE)
  ? fs.readFileSync(HASH_FILE, 'utf8').trim()
  : '';
const currentHash = computeHash();

if (distExists && storedHash === currentHash) {
  console.log('[postinstall] ✓ dist/ is already fresh (hash match) — skipping build.');
  process.exit(0);
}

console.log(
  `[postinstall] dist/ ${distExists ? 'has stale hash' : 'is missing'} → running yarn build:web (~3min)…`
);

try {
  execSync('yarn build:web', {
    stdio: 'inherit',
    cwd: ROOT,
    env: { ...process.env, EXPO_NO_GIT_STATUS: '1' },
  });
  fs.writeFileSync(HASH_FILE, currentHash + '\n');
  console.log('[postinstall] ✅ web build complete; dist/ ready for deployment.');
  process.exit(0);
} catch (err) {
  console.error('[postinstall] ⚠️  build:web failed:', err.message);
  console.error(
    '[postinstall]    Container will fall back to runtime rebuild via startup.sh.'
  );
  // Exit 0 so install never fails; runtime startup.sh has its own retry.
  process.exit(0);
}
