/**
 * services/user.ts — User profile + auth + avatar wrappers.
 *
 * Profile writes fire `invalidateAfter('profile')` so /user/me, avatars,
 * payment-methods and home/bundle refetch together. See DATA_GRAPH.md §4.
 */
import api from '../utils/api';
import { invalidateAfter } from '../utils/cacheGraph';
import type { User } from './types';

export async function fetchCurrentUser(): Promise<User> {
  const r = await api.get('/user/me');
  return r.data as User;
}

export async function updateProfile(payload: Partial<User>): Promise<User> {
  const r = await api.put('/user/profile', payload);
  await invalidateAfter('profile');
  return r.data as User;
}

export async function fetchAvatar(): Promise<{ avatar: string | null }> {
  const r = await api.get('/user/avatar');
  return r.data;
}

export async function uploadAvatar(base64: string): Promise<any> {
  const r = await api.post('/user/avatar', { avatar: base64 });
  await invalidateAfter('profile');
  return r.data;
}

export async function deleteAvatar(): Promise<any> {
  const r = await api.delete('/user/avatar');
  await invalidateAfter('profile');
  return r.data;
}

export async function fetchUpi(): Promise<{ upi?: string; has_upi: boolean }> {
  const r = await api.get('/user/upi');
  return r.data;
}

export async function updateUpi(upi: string): Promise<any> {
  const r = await api.post('/user/upi', { upi });
  await invalidateAfter('profile');
  return r.data;
}

export async function sendOtp(phone: string): Promise<any> {
  const r = await api.post('/auth/send-otp', { phone });
  return r.data;
}

/** Backend /auth/verify-otp response shape (Round 49 — was loosely typed
 *  as { access_token?, token?, user? } which forced every consumer to
 *  null-check fields the server always sets on a 200 response).
 */
export interface VerifyOtpResponse {
  token: string;
  user: User & { id: string; name: string; phone: string; money_score: number };
  is_new_user: boolean;
}

export async function verifyOtp(phone: string, otp: string): Promise<VerifyOtpResponse> {
  const r = await api.post('/auth/verify-otp', { phone, otp });
  return r.data as VerifyOtpResponse;
}
