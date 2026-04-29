/**
 * utils/messageDedup.ts — Round 53i
 *
 * Exactly-once delivery guarantee at the realtime layer.
 *
 * Why?
 *   Backend can legitimately deliver the same message twice in a few
 *   benign-but-real scenarios:
 *     • client polled REST in the same tick a WS push arrived
 *     • WS reconnect mid-flight → server re-broadcasts queued events
 *     • duplicate post-commit hook (rare, but possible during deploys)
 *   Without dedup, the chat list grows phantom rows and balance
 *   counters double-count. The fix isn't to make the backend
 *   "perfect" — it's to make the *delivery contract* idempotent.
 *
 * Contract:
 *   • shouldEmit(id) → true on the FIRST sighting of `id`
 *   • shouldEmit(id) → false on every later sighting within the TTL
 *   • Entries auto-expire after TTL_MS (default 60s) so the buffer
 *     stays bounded.
 *   • Insertion-ordered: a late-arriving id never overrides a newer
 *     entry (out-of-order tolerance is built in).
 *
 * Use:
 *   const dedup = createMessageDedup({ ttlMs: 60_000, maxSize: 500 });
 *   ws.onmessage = (ev) => {
 *     if (!dedup.shouldEmit(ev.data.id)) return;
 *     onMessage(ev.data);
 *   };
 */

export interface MessageDedupOptions {
  /** Entries older than this are evicted (ms). Default: 60s. */
  ttlMs?: number;
  /** Hard cap on buffer size (eviction by insertion order). Default: 500. */
  maxSize?: number;
  /** Clock injection for tests. Default: Date.now. */
  now?: () => number;
}

export interface MessageDedup {
  /** Return true if this id has not been seen within the TTL window. */
  shouldEmit: (id: string | null | undefined) => boolean;
  /** Force-clear the buffer (e.g. on WS reconnect). */
  reset: () => void;
  /** Current buffer size — for tests / debug only. */
  size: () => number;
}

export function createMessageDedup(opts: MessageDedupOptions = {}): MessageDedup {
  const ttlMs = opts.ttlMs ?? 60_000;
  const maxSize = opts.maxSize ?? 500;
  const now = opts.now ?? Date.now;

  // Map preserves insertion order, so we can iterate to evict oldest.
  const seen = new Map<string, number>();

  function evictExpired(t: number): void {
    // Walk in insertion order; stop at the first non-expired entry.
    for (const [id, expiresAt] of seen) {
      if (expiresAt > t) break;
      seen.delete(id);
    }
  }

  function evictToCap(): void {
    while (seen.size > maxSize) {
      const first = seen.keys().next().value;
      if (first === undefined) break;
      seen.delete(first);
    }
  }

  return {
    shouldEmit(id) {
      // Never dedup falsy ids — caller controls policy. Returning true
      // means "let it through". Empty/missing ids are best-effort.
      if (!id) return true;
      const t = now();
      evictExpired(t);
      const seenAt = seen.get(id);
      if (seenAt !== undefined && seenAt > t) {
        return false; // duplicate within window
      }
      // Insertion (or refresh) — push to end of map.
      if (seenAt !== undefined) seen.delete(id);
      seen.set(id, t + ttlMs);
      evictToCap();
      return true;
    },
    reset() {
      seen.clear();
    },
    size() {
      return seen.size;
    },
  };
}
