/**
 * services/offlineQueue.ts — Phase 2 offline-first queue.
 *
 * AsyncStorage-backed durable queue for split expense submissions.
 * The queue is the source of truth from the moment a user taps
 * "Split" until the backend confirms an idempotent insert. Survives
 * app kills, restarts, network flaps.
 *
 * Storage shape:
 *   key   = OFFLINE_EXPENSE_QUEUE
 *   value = JSON array of OfflineExpense rows
 *
 * Concurrency:
 *   • All reads return clones; mutations re-write the whole array.
 *   • A module-level mutex serialises concurrent writes so two
 *     simultaneous enqueue() calls cannot lose each other.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const QUEUE_KEY = 'OFFLINE_EXPENSE_QUEUE';

export type OfflineExpenseStatus = 'PENDING' | 'SYNCED' | 'FAILED';

export type OfflineExpense = {
  /** Client-generated UUID. Doubles as the backend Idempotency-Key. */
  client_expense_id: string;
  group_id: string;
  /** The exact body that will be POSTed to /split/expenses. */
  payload: {
    group_id: string;
    paid_by?: string;
    description: string;
    amount: number;
    split_type: string;
    splits: Record<string, number>;
  };
  status: OfflineExpenseStatus;
  retries: number;
  lastAttemptAt?: number;
  /** Optional human-readable last error for debugging / UI. */
  lastError?: string;
  /** Server expense id once the sync succeeds. */
  server_id?: string;
  createdAt: number;
};

// ── UUID v4 ─────────────────────────────────────────────────────────
// Lifted from utils/deviceId.ts so we don't add a new dep. RFC4122 v4.
export function uuid(): string {
  const arr = new Uint8Array(16);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = (globalThis as any).crypto;
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(arr);
  } else {
    for (let i = 0; i < 16; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  arr[6] = (arr[6] & 0x0f) | 0x40;
  arr[8] = (arr[8] & 0x3f) | 0x80;
  const hex = Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ── Mutex ───────────────────────────────────────────────────────────
let _writeChain: Promise<void> = Promise.resolve();
function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = _writeChain.then(fn, fn);
  // Swallow rejections in the chain so one bad write doesn't poison
  // every subsequent caller.
  _writeChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

// ── Pub-sub for UI subscribers ──────────────────────────────────────
type Listener = (q: OfflineExpense[]) => void;
const listeners = new Set<Listener>();
export function subscribeQueue(fn: Listener): () => void {
  listeners.add(fn);
  // Push the current snapshot immediately for new subscribers.
  getQueue()
    .then((q) => {
      try {
        fn(q);
      } catch (e) { if (__DEV__) console.warn('[offlineQueue] silent-catch', e); }
    })
    .catch(() => {});
  return () => {
    listeners.delete(fn);
  };
}
async function notify(): Promise<void> {
  if (listeners.size === 0) return;
  const q = await getQueue();
  for (const l of listeners) {
    try {
      l(q);
    } catch (e) { if (__DEV__) console.warn('[offlineQueue] silent-catch', e); }
  }
}

// ── Read ────────────────────────────────────────────────────────────
export async function getQueue(): Promise<OfflineExpense[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Defensive: drop rows missing required fields.
    return parsed.filter(
      (r) =>
        r &&
        typeof r.client_expense_id === 'string' &&
        typeof r.group_id === 'string' &&
        typeof r.status === 'string',
    );
  } catch {
    return [];
  }
}

export async function getPendingByGroup(groupId: string): Promise<OfflineExpense[]> {
  const q = await getQueue();
  return q.filter((e) => e.group_id === groupId && e.status !== 'SYNCED');
}

// ── Write ────────────────────────────────────────────────────────────
async function _save(rows: OfflineExpense[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(rows));
  } catch {
    // AsyncStorage failures are extremely rare in production. Silent.
  }
}

export async function enqueueExpense(
  expense: Omit<OfflineExpense, 'status' | 'retries' | 'createdAt'> &
    Partial<Pick<OfflineExpense, 'status' | 'retries' | 'createdAt'>>,
): Promise<OfflineExpense> {
  return withWriteLock(async () => {
    const rows = await getQueue();
    // Idempotency at the queue level too: same client_expense_id never
    // gets enqueued twice.
    const existing = rows.find((r) => r.client_expense_id === expense.client_expense_id);
    if (existing) {
      await notify();
      return existing;
    }
    const row: OfflineExpense = {
      ...expense,
      status: expense.status ?? 'PENDING',
      retries: expense.retries ?? 0,
      createdAt: expense.createdAt ?? Date.now(),
    };
    rows.push(row);
    await _save(rows);
    await notify();
    return row;
  });
}

export async function updateExpense(
  id: string,
  updates: Partial<OfflineExpense>,
): Promise<OfflineExpense | null> {
  return withWriteLock(async () => {
    const rows = await getQueue();
    const idx = rows.findIndex((r) => r.client_expense_id === id);
    if (idx < 0) return null;
    rows[idx] = { ...rows[idx], ...updates };
    await _save(rows);
    await notify();
    return rows[idx];
  });
}

export async function removeExpense(id: string): Promise<void> {
  await withWriteLock(async () => {
    const rows = await getQueue();
    const next = rows.filter((r) => r.client_expense_id !== id);
    if (next.length !== rows.length) {
      await _save(next);
      await notify();
    }
  });
}

export async function clearSynced(): Promise<void> {
  await withWriteLock(async () => {
    const rows = await getQueue();
    const next = rows.filter((r) => r.status !== 'SYNCED');
    if (next.length !== rows.length) {
      await _save(next);
      await notify();
    }
  });
}
