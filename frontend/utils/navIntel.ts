/**
 * navIntel.ts — R115 Sprint-2 predictive navigation engine.
 *
 * Tracks recency + frequency of route visits per user-session and exposes
 * `predictNext(currentRoute)` which returns the **single most likely**
 * next route. The caller can then prewarm exactly that route (data-fetch
 * + screen mount) to make it feel instant.
 *
 * Important constraints (per master prompt):
 *   • Predict ONLY the top-1 next route. Never the top-3 — that thrashes
 *     low-end Android devices.
 *   • Predict ONLY when confidence ≥ 0.55 (else return null).
 *   • Never preload heavy AI / streaming endpoints. Reserved for cheap
 *     GETs (/transactions, /budgets/live, /pulse/v2/feed, ...).
 *   • In-memory only — cleared on cold-start. Predictions improve as the
 *     session grows.
 *
 * Usage:
 * ------
 *   import { navIntel } from '../utils/navIntel';
 *   navIntel.recordVisit(pathname);                 // every screen mount
 *   const next = navIntel.predictNext(pathname);   // call before idle
 *   if (next) prewarm(next);
 */

interface Edge {
  count: number;
  lastAt: number;
}

const graph = new Map<string, Map<string, Edge>>();
let lastRoute: string | null = null;
const CONFIDENCE_THRESHOLD = 0.55;
const MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Strip dynamic segments (`/transactions/abc123` → `/transactions/[id]`)
 * so we don't pollute the graph with infinite distinct keys.
 */
function normalize(route: string): string {
  if (!route) return '/';
  return route
    .replace(/\/[a-f0-9]{8,}(\?|$)/i, '/[id]$1')
    .replace(/\/\d{6,}(\?|$)/, '/[id]$1');
}

export const navIntel = {
  recordVisit(route: string) {
    const now = Date.now();
    const norm = normalize(route);
    if (lastRoute && lastRoute !== norm) {
      const fromMap = graph.get(lastRoute) ?? new Map<string, Edge>();
      const edge = fromMap.get(norm) ?? { count: 0, lastAt: 0 };
      edge.count += 1;
      edge.lastAt = now;
      fromMap.set(norm, edge);
      graph.set(lastRoute, fromMap);
    }
    lastRoute = norm;
  },

  predictNext(currentRoute: string): string | null {
    const norm = normalize(currentRoute);
    const edges = graph.get(norm);
    if (!edges || edges.size === 0) return null;
    const now = Date.now();

    // Score each candidate: recency-weighted frequency.
    let total = 0;
    let best: { route: string; score: number } | null = null;
    for (const [to, edge] of edges) {
      const age = now - edge.lastAt;
      if (age > MAX_AGE_MS) continue;
      const recency = Math.exp(-age / (10 * 60 * 1000)); // 10-min half-life
      const score = edge.count * (0.4 + 0.6 * recency);
      total += score;
      if (!best || score > best.score) best = { route: to, score };
    }
    if (!best || total === 0) return null;
    const confidence = best.score / total;
    return confidence >= CONFIDENCE_THRESHOLD ? best.route : null;
  },

  /** Pure introspection helper for debugging. */
  snapshot() {
    const out: Record<string, Record<string, number>> = {};
    graph.forEach((edges, from) => {
      out[from] = {};
      edges.forEach((e, to) => { out[from][to] = e.count; });
    });
    return out;
  },

  reset() { graph.clear(); lastRoute = null; },
};

// ─── Prewarm registry ────────────────────────────────────────────────────────
// Each route can register a `prewarm()` function: a cheap, side-effect-only
// data-fetch that hydrates the SWR cache. Calling it twice is a no-op (cache
// dedupe guarantees that). We keep the registry in this module so the call
// site (e.g. <PrewarmHost />) doesn't have to know route specifics.

type Prewarmer = () => void;
const warmers = new Map<string, Prewarmer>();

export function registerPrewarmer(route: string, fn: Prewarmer) {
  warmers.set(normalize(route), fn);
}

export function maybePrewarmNext(currentRoute: string): string | null {
  const next = navIntel.predictNext(currentRoute);
  if (!next) return null;
  const fn = warmers.get(next);
  if (fn) {
    try { fn(); } catch { /* noop — prewarm is best-effort */ }
  }
  return next;
}

export default navIntel;
