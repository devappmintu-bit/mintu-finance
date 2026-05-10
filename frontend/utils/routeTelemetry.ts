/**
 * routeTelemetry.ts — R115 Sprint-2 navigation observability.
 *
 * Lightweight in-memory ring buffer that records every screen mount time,
 * transition latency, and "rage tap" event. Powers the Route Performance
 * Dashboard (debug screen) and feeds future telemetry pipelines.
 *
 * Design notes
 * ------------
 *  • Zero network calls — strictly in-memory; flushed on cold start.
 *  • Single global ring buffer (capacity 200) so we never leak memory.
 *  • Sampling: 100% mount events, 100% rage taps, 1% scroll FPS samples.
 *  • No-op when `__DEV__` is false UNLESS `enable()` is called explicitly
 *    — production builds stay clean by default.
 *
 * Usage:
 * ------
 *   // Once, in _layout.tsx (under a __DEV__ guard ideally):
 *   import { telemetry } from '../utils/routeTelemetry';
 *   telemetry.enable();
 *
 *   // From any screen:
 *   useEffect(() => telemetry.markMount('budget'), []);
 *
 *   // From any tap target:
 *   onPress={() => telemetry.recordTap(route)}
 *
 *   // Inspect in dev console:
 *   telemetry.dump();   // returns string snapshot
 */
import { Platform } from 'react-native';

type Event =
  | { kind: 'mount';        route: string; ts: number; ms?: number }
  | { kind: 'transition';   from: string; to: string; ts: number; ms: number }
  | { kind: 'rage_tap';     route: string; ts: number; count: number }
  | { kind: 'double_tap';   route: string; ts: number; gap: number }
  | { kind: 'gesture_cancel'; route: string; ts: number };

const CAPACITY = 200;
const RAGE_THRESHOLD = 4;          // taps within window count as rage
const RAGE_WINDOW_MS = 700;
const DOUBLE_TAP_WINDOW_MS = 280;

let enabled = !!__DEV__;
const buffer: Event[] = [];
const tapTimestamps = new Map<string, number[]>();
const mountStart = new Map<string, number>();
let lastRoute: string | null = null;
let lastNav: number | null = null;

function push(e: Event) {
  if (!enabled) return;
  buffer.push(e);
  if (buffer.length > CAPACITY) buffer.splice(0, buffer.length - CAPACITY);
}

export const telemetry = {
  enable() { enabled = true; },
  disable() { enabled = false; },
  isEnabled() { return enabled; },

  /** Call from a screen's mount effect. Records mount latency vs last navigate(). */
  markMount(route: string) {
    if (!enabled) return;
    const now = Date.now();
    const ms = lastNav ? now - lastNav : undefined;
    push({ kind: 'mount', route, ts: now, ms });
    if (lastRoute && lastRoute !== route && lastNav) {
      push({ kind: 'transition', from: lastRoute, to: route, ts: now, ms: now - lastNav });
    }
    lastRoute = route;
    mountStart.set(route, now);
  },

  /** Call right BEFORE you call router.push/replace. Used to time the next mount. */
  markNavigate() {
    if (!enabled) return;
    lastNav = Date.now();
  },

  /** Call from a tap handler to detect rage / double taps on the same route. */
  recordTap(route: string) {
    if (!enabled) return;
    const now = Date.now();
    const arr = tapTimestamps.get(route) ?? [];
    arr.push(now);
    // Drop entries older than the rage window
    while (arr.length && now - arr[0] > RAGE_WINDOW_MS) arr.shift();
    tapTimestamps.set(route, arr);

    if (arr.length >= RAGE_THRESHOLD) {
      push({ kind: 'rage_tap', route, ts: now, count: arr.length });
      arr.length = 0; // reset so we don't spam
    } else if (arr.length === 2 && arr[1] - arr[0] < DOUBLE_TAP_WINDOW_MS) {
      push({ kind: 'double_tap', route, ts: now, gap: arr[1] - arr[0] });
    }
  },

  recordGestureCancel(route: string) {
    if (!enabled) return;
    push({ kind: 'gesture_cancel', route, ts: Date.now() });
  },

  /** Snapshot for dashboards / dev console. */
  snapshot(): readonly Event[] { return buffer.slice(); },

  /** Aggregate into a one-line report. */
  summary(): { mounts: number; rageTaps: number; doubleTaps: number; avgMountMs: number; slowestRoutes: { route: string; ms: number }[] } {
    const mounts = buffer.filter((e) => e.kind === 'mount') as Extract<Event, { kind: 'mount' }>[];
    const valid = mounts.filter((m) => typeof m.ms === 'number');
    const avgMountMs = valid.length
      ? Math.round(valid.reduce((s, m) => s + (m.ms || 0), 0) / valid.length)
      : 0;
    const slowest = [...valid].sort((a, b) => (b.ms || 0) - (a.ms || 0)).slice(0, 5)
      .map((m) => ({ route: m.route, ms: m.ms || 0 }));
    return {
      mounts: mounts.length,
      rageTaps: buffer.filter((e) => e.kind === 'rage_tap').length,
      doubleTaps: buffer.filter((e) => e.kind === 'double_tap').length,
      avgMountMs,
      slowestRoutes: slowest,
    };
  },

  /** Pretty-print to dev console. Safe to call from anywhere. */
  dump() {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.table(this.snapshot());
    } else {
      // eslint-disable-next-line no-console
      console.log('[telemetry]', JSON.stringify(this.summary(), null, 2));
    }
  },

  reset() { buffer.length = 0; tapTimestamps.clear(); mountStart.clear(); lastNav = null; lastRoute = null; },
};

export default telemetry;
