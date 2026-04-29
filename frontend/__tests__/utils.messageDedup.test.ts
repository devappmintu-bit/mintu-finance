/**
 * Round 53i — messageDedup unit tests.
 *
 * Verifies the realtime-consistency contract:
 *   ✓ first sighting → emit
 *   ✗ duplicate within window → drop
 *   ✓ duplicate AFTER window → emit again
 *   ✓ out-of-order arrival doesn't break ordering
 *   ✓ falsy ids are pass-through
 *   ✓ buffer cap evicts oldest first
 *   ✓ reset() clears state
 */
import { createMessageDedup } from '../utils/messageDedup';

describe('createMessageDedup', () => {
  it('emits the first sighting of an id', () => {
    const d = createMessageDedup();
    expect(d.shouldEmit('msg-1')).toBe(true);
  });

  it('suppresses an exact duplicate within the TTL window', () => {
    const d = createMessageDedup({ ttlMs: 60_000 });
    expect(d.shouldEmit('m')).toBe(true);
    expect(d.shouldEmit('m')).toBe(false);
    expect(d.shouldEmit('m')).toBe(false);
  });

  it('emits again once the TTL has elapsed', () => {
    let t = 1000;
    const d = createMessageDedup({ ttlMs: 5_000, now: () => t });
    expect(d.shouldEmit('m')).toBe(true);
    t = 7_000; // beyond the 5s TTL
    expect(d.shouldEmit('m')).toBe(true);
  });

  it('does NOT dedup falsy ids — caller policy', () => {
    const d = createMessageDedup();
    expect(d.shouldEmit('')).toBe(true);
    expect(d.shouldEmit('')).toBe(true);
    // @ts-expect-error -- intentionally null
    expect(d.shouldEmit(null)).toBe(true);
    // @ts-expect-error -- intentionally undefined
    expect(d.shouldEmit(undefined)).toBe(true);
  });

  it('handles out-of-order arrival without aliasing', () => {
    let t = 1000;
    const d = createMessageDedup({ ttlMs: 60_000, now: () => t });
    expect(d.shouldEmit('m1')).toBe(true);
    t = 2000;
    expect(d.shouldEmit('m2')).toBe(true);
    t = 3000;
    expect(d.shouldEmit('m3')).toBe(true);
    // A late 'm1' inside its own TTL is still a dup.
    expect(d.shouldEmit('m1')).toBe(false);
    // A new id always emits.
    expect(d.shouldEmit('m4')).toBe(true);
  });

  it('respects the maxSize cap by evicting in insertion order', () => {
    const d = createMessageDedup({ maxSize: 3 });
    d.shouldEmit('a'); // oldest
    d.shouldEmit('b');
    d.shouldEmit('c');
    expect(d.size()).toBe(3);
    // 'b' is still inside the buffer → suppressed.
    expect(d.shouldEmit('b')).toBe(false);
    expect(d.size()).toBe(3);
    d.shouldEmit('d'); // pushes 'a' out → buffer = [b, c, d]
    expect(d.size()).toBe(3);
    // 'c' and 'd' remain → still suppressed.
    expect(d.shouldEmit('c')).toBe(false);
    expect(d.shouldEmit('d')).toBe(false);
    // 'a' was evicted → emits as fresh.
    expect(d.shouldEmit('a')).toBe(true);
  });

  it('expires entries lazily on next call (no timer needed)', () => {
    let t = 1000;
    const d = createMessageDedup({ ttlMs: 1_000, now: () => t });
    d.shouldEmit('a');
    d.shouldEmit('b');
    d.shouldEmit('c');
    expect(d.size()).toBe(3);
    t = 5000; // way past TTL
    // Calling shouldEmit('d') triggers lazy expiry of a/b/c then inserts d.
    d.shouldEmit('d');
    expect(d.size()).toBe(1);
  });

  it('reset() clears the entire buffer', () => {
    const d = createMessageDedup();
    d.shouldEmit('a');
    d.shouldEmit('b');
    expect(d.size()).toBe(2);
    d.reset();
    expect(d.size()).toBe(0);
    expect(d.shouldEmit('a')).toBe(true); // fresh after reset
  });

  it('SCENARIO: WS reconnect re-broadcasts queued events', () => {
    // Backend sends m1, m2, m3 over WS. We render them.
    // WS drops; on reconnect, server replays m2, m3, m4 (server retained them).
    // Without dedup, m2 + m3 would render TWICE.
    const dedup = createMessageDedup();
    const rendered: string[] = [];
    const onMessage = (id: string) => {
      if (dedup.shouldEmit(id)) rendered.push(id);
    };
    onMessage('m1'); onMessage('m2'); onMessage('m3');
    // reconnect → replay
    onMessage('m2'); onMessage('m3'); onMessage('m4');
    expect(rendered).toEqual(['m1', 'm2', 'm3', 'm4']);
  });

  it('SCENARIO: REST poll + WS push race', () => {
    // App polls /messages, WS pushes the same new event in the same tick.
    // Both paths feed the same dedup → exactly one render.
    const dedup = createMessageDedup();
    const rendered: string[] = [];
    const tap = (id: string) => { if (dedup.shouldEmit(id)) rendered.push(id); };
    // Out-of-order: WS arrives first, then poll catches up.
    tap('msg-X');         // WS
    tap('msg-X');         // poll (dup)
    expect(rendered).toEqual(['msg-X']);
  });
});
