// Round 37 — in-app notifications feed client.
// Surfaces the persistent notifications_feed collection to the UI.
import api from '../utils/api';

export type NotifKind = 'transaction' | 'streak' | 'reward' | 'split' | 'goal' | 'budget_alert';

export interface NotifItem {
  id: string;
  kind: NotifKind;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  metadata?: Record<string, any>;
}

export async function fetchNotifications(limit = 50): Promise<NotifItem[]> {
  const r = await api.get(`/notifications?limit=${limit}`);
  return r.data?.notifications || [];
}

export async function fetchUnreadCount(): Promise<number> {
  try {
    const r = await api.get('/notifications/unread-count');
    return Number(r.data?.unread || 0);
  } catch { return 0; }
}

export async function markRead(id: string): Promise<void> {
  try { await api.post('/notifications/mark-read', { notification_id: id }); } catch {}
}

export async function markAllRead(): Promise<number> {
  try {
    const r = await api.post('/notifications/mark-all-read');
    return Number(r.data?.updated || 0);
  } catch { return 0; }
}

// Dev helper — seeds a handful of sample notifications if the feed is empty.
export async function seedSampleNotifications(): Promise<void> {
  try { await api.post('/notifications/seed-sample'); } catch {}
}

// Map notification kind → deep link route. Used on tap.
export function deeplinkFor(kind: NotifKind): string {
  switch (kind) {
    case 'transaction': return '/(tabs)/transactions';
    case 'streak':      return '/(tabs)';
    case 'reward':      return '/rewards-hub';
    case 'split':       return '/(tabs)/split';
    case 'goal':        return '/goals';
    case 'budget_alert':return '/(tabs)/budget';
    default:            return '/(tabs)';
  }
}

// Simple relative-time formatter — Round 42 deduped to utils/time.
export { timeAgo } from '../utils/time';
