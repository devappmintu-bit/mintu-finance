/**
 * services/gmail.ts — Gmail OAuth + auto-import wrappers.
 */
import api from '../utils/api';

export async function fetchGmailStatus(): Promise<{
  connected: boolean;
  email?: string;
  last_sync?: string;
  imported_count?: number;
}> {
  const r = await api.get('/gmail/status');
  return r.data;
}

export async function startGmailOAuth(): Promise<{ auth_url: string; state: string }> {
  const r = await api.get('/oauth/gmail/start');
  return r.data;
}

export async function syncGmailNow(): Promise<{ imported: number; scanned: number }> {
  const r = await api.post('/gmail/sync-now');
  return r.data;
}

export async function disconnectGmail(): Promise<void> {
  await api.delete('/gmail/disconnect');
}
