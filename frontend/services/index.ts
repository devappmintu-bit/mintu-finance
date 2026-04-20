/**
 * services/index.ts — Typed API service layer.
 *
 * Why this exists:
 *   Screens used to call `api.get('/budgets')` directly (~109 scattered sites).
 *   This made caching, retry, and type safety inconsistent. Now screens call
 *   strongly-typed functions like `fetchBudgets()` that wrap the network layer,
 *   pick up SWR caching automatically, and return well-typed objects.
 *
 * Usage:
 *   import { fetchBudgets } from '@/services';
 *   const budgets = await fetchBudgets();      // Typed Budget[]
 *
 * Adding an endpoint:
 *   1. Add the TS type to `services/types.ts`
 *   2. Add the function to the relevant domain file
 *   3. Re-export here so screens import from one place
 */
export * from './budgets';
export * from './transactions';
export * from './split';
export * from './user';
export * from './premium';
export type * from './types';
