/**
 * cacheGraph — declarative invalidation map for the MintU data layer.
 *
 * A single call to `invalidateAfter('txn')` wipes every cache key that
 * could be stale after a transaction write, per the cache dependency
 * matrix in /app/docs/DATA_GRAPH.md §4. Every mounted `useSwr` hook
 * whose URL overlaps with one of those keys will automatically refetch
 * — achieving real-time UI sync without a pub/sub backbone.
 *
 * Usage (from a service mutation):
 *   import { invalidateAfter } from '../utils/cacheGraph';
 *   await api.post('/transactions', payload);
 *   await invalidateAfter('txn');
 *
 * Benefits:
 *   • Single source of truth for "what depends on what"
 *   • Zero chance of forgetting to invalidate a dependent cache
 *   • Grep-able — search `invalidateAfter('` for audit
 *   • Extensible — add a new entity by editing GRAPH below
 */
import { invalidate } from './swrGet';

// Keys mirror the write-verbs in DATA_GRAPH.md §4.
export type WriteKey =
  | 'txn'
  | 'budget'
  | 'goal'
  | 'split.expense'
  | 'split.settle'
  | 'split.group'
  | 'split.member'
  | 'split.reminder'
  | 'coin.reward'
  | 'profile'
  // Round 59 — added to fix stale UI bugs in 4 services that wrote
  // without invalidating their caches (notifications.ts, rewards.ts,
  // premium.ts, nudges.ts). See round59 audit in test_result.md.
  | 'notification'
  | 'reward.claim'
  | 'premium.tier'
  | 'nudge';

// Cache prefixes for each write-key. These are matched with startsWith()
// against any live useSwr URL so callers don't have to enumerate every
// possible query-param variant.
const GRAPH: Record<WriteKey, string[]> = {
  txn: [
    '/transactions',
    '/analytics/summary',
    '/stats/overview',
    '/home/bundle',
    '/home/snapshot',
    '/ai/predict',
    '/ai/insights',
    '/alerts/smart',
    '/reports/weekly',
    '/budgets',               // usage % changes
    '/rewards/wallet',        // coin-per-expense
    '/gamification/status',   // streak update
  ],
  budget: [
    '/budgets',
    '/budgets/overview',
    '/home/bundle',
    '/analytics/summary',
    '/stats/overview',
    '/ai/insights',
    '/alerts/smart',
    '/reports/weekly',
  ],
  goal: [
    '/goals',
    '/home/bundle',
    '/ai/insights',
  ],
  'split.expense': [
    '/split/balances',
    '/split/activity',
    '/split/groups',          // covers /split/groups, /split/groups/{id}/..., /summary, /expenses
    '/home/bundle',
  ],
  'split.settle': [
    '/split/balances',
    '/split/activity',
    '/split/groups',
    '/split/reminders',
    '/home/bundle',
    '/rewards/wallet',        // settle earns coins
    '/gamification/status',   // settle affects streak + score
    '/leaderboard',
    '/missions/available',
  ],
  'split.group': [
    '/split/groups',
    '/split/balances',
    '/split/activity',
    '/home/bundle',
  ],
  'split.member': [
    '/split/groups',
    '/split/balances',
  ],
  'split.reminder': [
    '/split/reminders',
  ],
  'coin.reward': [
    '/rewards/wallet',
    '/rewards/marketplace',
    '/gamification/status',
    '/leaderboard',
    '/home/bundle',
    '/user/me',               // reward_coins is on user doc
    '/missions/available',
  ],
  profile: [
    '/user/me',
    '/user/payment-methods',
    '/home/bundle',
  ],
  // Round 59 — fixed-stale-ui write keys.
  notification: [
    '/notifications',
    '/notifications/unread-count',
    '/home/bundle',           // unread badge surface in greeting card
  ],
  'reward.claim': [
    '/rewards/wallet',
    '/rewards/marketplace',
    '/rewards/redemptions',
    '/coin-ledger',
    '/gamification/status',
    '/leaderboard',
    '/home/bundle',
    '/user/me',               // reward_coins is on user doc
  ],
  'premium.tier': [
    '/premium/status',
    '/user/me',
    '/home/bundle',
  ],
  nudge: [
    '/nudges',                // covers /nudges/list, /nudges/active
    '/home/bundle',           // home shows top nudge
  ],
};

/**
 * Invalidate every cache key downstream of the given write-key.
 * Always awaitable, best-effort — failures inside `invalidate()` are
 * swallowed there so a flaky AsyncStorage never breaks a mutation.
 */
export async function invalidateAfter(key: WriteKey): Promise<void> {
  const prefixes = GRAPH[key] || [];
  // Dedup paranoia — if someone adds duplicate entries we only fire once.
  const unique = Array.from(new Set(prefixes));
  await Promise.all(unique.map((p) => invalidate(p)));
}

/**
 * Compose multiple invalidations in one pass. Useful when a single
 * action is known to span multiple write-keys (e.g. `settle-with-rewards`
 * which hits both `split.settle` AND `coin.reward`).
 */
export async function invalidateAll(keys: WriteKey[]): Promise<void> {
  await Promise.all(keys.map(invalidateAfter));
}

/**
 * Escape hatch — call with a raw URL prefix when you need to invalidate
 * something not in the graph yet. Prefer to add a WriteKey entry instead.
 */
export async function invalidateRaw(prefix: string): Promise<void> {
  await invalidate(prefix);
}

// Re-export the graph itself so tests / devtools can inspect it.
export const CACHE_GRAPH = GRAPH;
