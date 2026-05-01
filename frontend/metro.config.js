// metro.config.js — Round 58 perf pass
const { getDefaultConfig } = require("expo/metro-config");
const path = require('path');
const { FileStore } = require('metro-cache');

const config = getDefaultConfig(__dirname);

// ── Cache: stable on-disk store, shared across web/android ────────
const root = process.env.METRO_CACHE_ROOT || path.join(__dirname, '.metro-cache');
config.cacheStores = [
  new FileStore({ root: path.join(root, 'cache') }),
];

// ── Round 58: PERFORMANCE NOTES ───────────────────────────────────
// We considered turning on `transformer.getTransformOptions →
// inlineRequires: true` here, which would defer require() until
// first use and shave 200-400 ms off cold-start parse. In practice
// it nearly doubled `expo export --platform web` build time under
// our 2-worker constraint, blowing past the 10-min CI timeout.
//
// The same TTI win is achieved at a higher level via `useDeferredEffect`
// and `prefetchRoute` from `hooks/usePerf.ts` — see
// `app/(tabs)/index.tsx` for the canonical usage. That moves the
// perf gain from build-time to runtime where it's actually
// observable on the user's device.

// Reduce the number of workers to decrease resource usage on
// constrained CI / preview containers.
config.maxWorkers = 2;

module.exports = config;
