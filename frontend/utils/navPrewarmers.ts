/**
 * navPrewarmers.ts — R115 Sprint-2 prewarm registry seeding.
 *
 * Imported once from `_layout.tsx`. Registers cheap GET prewarmers for
 * the routes a user is most likely to land on next. Each prewarmer is a
 * fire-and-forget that hydrates the SWR cache so when the user actually
 * navigates, the screen renders against warm data.
 *
 * Constraints (from master prompt):
 *   • Top-1 prewarm only — registry exposes one fn per route.
 *   • Cheap GETs only — never AI streams or paginated big-list calls.
 *   • Idempotent — calling twice within the SWR TTL is a no-op.
 */
import { registerPrewarmer } from './navIntel';
import { swrGet } from './api';

const cheapGet = (url: string, ttl = 30_000) => () => {
  try { swrGet(url, { staleAfter: ttl }); } catch { /* noop */ }
};

registerPrewarmer('/(tabs)',              cheapGet('/home/bundle', 20_000));
registerPrewarmer('/(tabs)/index',        cheapGet('/home/bundle', 20_000));
registerPrewarmer('/(tabs)/transactions', cheapGet('/transactions?limit=30', 15_000));
registerPrewarmer('/(tabs)/budget',       cheapGet('/budgets/live', 20_000));
registerPrewarmer('/(tabs)/split',        cheapGet('/split/groups', 20_000));
registerPrewarmer('/pulse-v2',            cheapGet('/pulse/v2/feed?limit=30', 30_000));

export {};
