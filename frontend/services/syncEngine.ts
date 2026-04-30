/**
 * services/syncEngine.ts — Phase 2 background sync engine.
 *
 * Responsibilities:
 *   1. Listen for network reconnect (NetInfo) and app foreground
 *      transitions (AppState). On either, attempt to drain the queue.
 *   2. Drain serially with exponential backoff per item.
 *   3. Hard-cap each item at 5 retries before flipping to FAILED.
 *   4. Re-entrancy guard so two triggers don't run sync() in parallel.
 *
 * Wire-up:
 *   • Call `initSyncEngine()` exactly once at app startup
 *     (see `app/_layout.tsx`).
 *   • Anywhere in the codebase you can fire `triggerSync('reason')`
 *     to nudge a flush (e.g. right after enqueue).
 *
 * The engine NEVER throws — every error path logs to the queue row's
 * `lastError` field and continues with the next item.
 */
import NetInfo from '@react-native-community/netinfo';
import { AppState, AppStateStatus } from 'react-native';

import {
  getQueue,
  removeExpense as removeFromQueue,
  updateExpense as updateQueueRow,
  type OfflineExpense,
} from './offlineQueue';
import { createExpense } from './split';
import { invalidateAfter } from '../utils/cacheGraph';

const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 1000;

let _initialized = false;
let _isSyncing = false;
let _onlineListener: (() => void) | null = null;
let _appStateSub: { remove: () => void } | null = null;

// ── Pub-sub for UI ──────────────────────────────────────────────────
export type SyncEvent =
  | { kind: 'sync_start' }
  | { kind: 'sync_end'; processed: number; succeeded: number; failed: number }
  | { kind: 'item_synced'; id: string; serverId?: string }
  | { kind: 'item_failed'; id: string; retries: number; error: string };

type SyncListener = (e: SyncEvent) => void;
const syncListeners = new Set<SyncListener>();
export function subscribeSync(fn: SyncListener): () => void {
  syncListeners.add(fn);
  return () => {
    syncListeners.delete(fn);
  };
}
function emit(e: SyncEvent): void {
  for (const l of syncListeners) {
    try {
      l(e);
    } catch (e) { if (__DEV__) console.warn('[syncEngine] silent-catch', e); }
  }
}

// ── Per-item readiness check ────────────────────────────────────────
// Honour exponential backoff: 2^retries * 1000ms.
function _isReady(row: OfflineExpense, now: number): boolean {
  if (row.status === 'SYNCED') return false;
  if (row.retries >= MAX_RETRIES) return false; // FAILED — needs manual retry
  if (!row.lastAttemptAt) return true;
  const wait = Math.min(
    BASE_BACKOFF_MS * 2 ** Math.max(0, row.retries),
    60_000, // cap at 60s — don't make users wait forever
  );
  return now - row.lastAttemptAt >= wait;
}

// ── Drain one pass through the queue ────────────────────────────────
async function _drain(reason: string): Promise<void> {
  if (_isSyncing) return;
  _isSyncing = true;
  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  try {
    emit({ kind: 'sync_start' });
    const queue = await getQueue();
    if (queue.length === 0) return;
    // eslint-disable-next-line no-console
    if (__DEV__)
      console.log(
        `[syncEngine] drain start (${reason}) — ${queue.length} items in queue`,
      );

    const now = Date.now();
    for (const row of queue) {
      if (!_isReady(row, now)) continue;
      processed += 1;
      try {
        // The split.createExpense wrapper forwards client_expense_id
        // as the Idempotency-Key header, so retries are safe even if
        // the backend already inserted on a prior attempt.
        const res = await createExpense(
          { ...row.payload, group_id: row.group_id },
          { client_expense_id: row.client_expense_id },
        );
        await updateQueueRow(row.client_expense_id, {
          status: 'SYNCED',
          lastAttemptAt: Date.now(),
          server_id: (res && (res.id || res._id)) || undefined,
          lastError: undefined,
        });
        succeeded += 1;
        emit({
          kind: 'item_synced',
          id: row.client_expense_id,
          serverId: (res && (res.id || res._id)) || undefined,
        });
        // Best-effort cache invalidation so the UI refreshes.
        try {
          await invalidateAfter('split.expense');
        } catch (e) { if (__DEV__) console.warn('[syncEngine] silent-catch', e); }
        // Drop the SYNCED row from the queue immediately. Keeping it
        // around is purely a UX choice; we prefer a clean queue.
        await removeFromQueue(row.client_expense_id);
      } catch (err: any) {
        const nextRetries = (row.retries || 0) + 1;
        const errMsg =
          err?.response?.data?.detail ||
          err?.message ||
          'sync failed';
        const finalStatus =
          nextRetries >= MAX_RETRIES ? 'FAILED' : 'PENDING';
        await updateQueueRow(row.client_expense_id, {
          status: finalStatus,
          retries: nextRetries,
          lastAttemptAt: Date.now(),
          lastError: String(errMsg).slice(0, 200),
        });
        failed += 1;
        emit({
          kind: 'item_failed',
          id: row.client_expense_id,
          retries: nextRetries,
          error: String(errMsg).slice(0, 200),
        });
        // eslint-disable-next-line no-console
        if (__DEV__)
          console.warn(
            `[syncEngine] item ${row.client_expense_id} failed (${nextRetries}/${MAX_RETRIES}):`,
            errMsg,
          );
      }
    }
  } finally {
    _isSyncing = false;
    emit({ kind: 'sync_end', processed, succeeded, failed });
  }
}

// ── Public API ──────────────────────────────────────────────────────
export function triggerSync(reason: string = 'manual'): void {
  // Fire and forget; never block the caller.
  _drain(reason).catch(() => {});
}

export async function retryItem(id: string): Promise<void> {
  await updateQueueRow(id, {
    status: 'PENDING',
    retries: 0,
    lastAttemptAt: undefined,
    lastError: undefined,
  });
  triggerSync('manual_retry');
}

export function initSyncEngine(): void {
  if (_initialized) return;
  _initialized = true;

  // Network reconnect → drain.
  _onlineListener = NetInfo.addEventListener((state) => {
    if (state.isConnected !== false) {
      triggerSync('netinfo_reconnect');
    }
  });

  // App foreground → drain.
  _appStateSub = AppState.addEventListener(
    'change',
    (next: AppStateStatus) => {
      if (next === 'active') {
        triggerSync('app_foreground');
      }
    },
  );

  // Cold-start drain in case there's a pending item from a prior session.
  triggerSync('cold_start');
}

export function teardownSyncEngine(): void {
  if (!_initialized) return;
  try {
    _onlineListener?.();
  } catch (e) { if (__DEV__) console.warn('[syncEngine] silent-catch', e); }
  try {
    _appStateSub?.remove();
  } catch (e) { if (__DEV__) console.warn('[syncEngine] silent-catch', e); }
  _onlineListener = null;
  _appStateSub = null;
  _initialized = false;
}

export function isSyncing(): boolean {
  return _isSyncing;
}
