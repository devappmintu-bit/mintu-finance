/**
 * services/gmail.ts — Gmail OAuth + auto-import wrappers.
 */
import api from '../utils/api';
import { invalidateAfter } from '../utils/cacheGraph';

export async function fetchGmailStatus(): Promise<{
  connected: boolean;
  email?: string;
  last_sync?: string;
  imported_count?: number;
}> {
  const r = await api.get('/gmail/status');
  return r.data;
}

export async function startGmailOAuth(returnUri?: string): Promise<{ auth_url: string; state: string }> {
  const r = await api.get('/oauth/gmail/start', {
    params: returnUri ? { return_uri: returnUri } : undefined,
  });
  return r.data;
}

export async function syncGmailNow(): Promise<{ imported: number; scanned: number }> {
  const r = await api.post('/gmail/sync-now');
  // Round 59 — sync may import new transactions; reflect on home + list
  // immediately rather than waiting for the next focus-refresh.
  await invalidateAfter('txn');
  return r.data;
}

export async function disconnectGmail(): Promise<void> {
  await api.delete('/gmail/disconnect');
  // Round 59 — invalidate the user doc which carries gmail.connected,
  // and the home bundle that surfaces the connected-email banner.
  await invalidateAfter('profile');
}
