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

/** Backend /auth/verify-otp response shape — Round 88 Auth V2.
 *
 * When the client sends `device_id` (which we ALWAYS do now from
 * verifyOtpWithDevice), the backend also returns a 15-minute
 * `access_token` + a 30-day `refresh_token` so the client can
 * silently re-auth without another OTP round-trip.
 *
 * The legacy 30-day `token` is still emitted for backwards-compat —
 * but new clients should prefer `access_token` and use the silent
 * refresh path in utils/api.ts instead.
 */
export interface VerifyOtpResponse {
  /** Legacy 30-day JWT — still issued for backwards compatibility. */
  token: string;
  user: User & { id: string; name: string; phone: string; money_score: number };
  is_new_user: boolean;
  // ── Round 88 V2 fields — present when device_id was sent ────────────
  /** Short-lived 15-minute access JWT. Use as the bearer token. */
  access_token?: string;
  /** Seconds until access_token expires (== 900). */
  access_expires_in?: number;
  /** Opaque 64-char refresh token — store in SecureStore. */
  refresh_token?: string;
  /** Echo of the device_id the client sent. */
  device_id?: string;
  /** True after first successful OTP — device is now trusted. */
  is_trusted_device?: boolean;
}

/** Optional device context payload — sent on /auth/verify-otp so the
 *  backend can mint a refresh token and trust this device. Sourced
 *  from utils/deviceId + react-native Platform. */
export interface DeviceContext {
  device_id?: string;
  device_name?: string;
  os?: string;
}

/** Legacy signature kept for backwards compat — does NOT mint a
 *  refresh token. Prefer `verifyOtpWithDevice`. */
export async function verifyOtp(phone: string, otp: string, name?: string): Promise<VerifyOtpResponse> {
  const r = await api.post('/auth/verify-otp', { phone, otp, ...(name ? { name } : {}) });
  return r.data as VerifyOtpResponse;
}

/** Round 88 — V2 verify with device context. Returns access_token +
 *  refresh_token + is_trusted_device. */
export async function verifyOtpWithDevice(
  phone: string,
  otp: string,
  device: DeviceContext,
  name?: string,
): Promise<VerifyOtpResponse> {
  const r = await api.post('/auth/verify-otp', {
    phone,
    otp,
    ...(name ? { name } : {}),
    ...device,
  });
  return r.data as VerifyOtpResponse;
}

/** Round 88 — exchange a refresh token for a new access+refresh pair.
 *  Called by the silent-refresh interceptor in utils/api.ts on 401. */
export async function refreshAccessToken(refreshToken: string, device?: DeviceContext): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: string;
  token_type: string;
  scope: string;
}> {
  const r = await api.post('/auth/refresh', {
    refresh_token: refreshToken,
    ...(device || {}),
  });
  return r.data;
}

/** Round 88 — single-device logout. Server revokes the session
 *  bound to this refresh token. Idempotent: safe to retry. */
export async function logoutSession(refreshToken: string): Promise<{ revoked: boolean }> {
  const r = await api.post('/auth/logout', { refresh_token: refreshToken });
  return r.data;
}

/** Round 88 — revoke every active session for the current user
 *  (requires a valid access token). */
export async function logoutAll(): Promise<{ revoked: number }> {
  const r = await api.post('/auth/logout-all');
  return r.data;
}

/** Round 88 — current user + active sessions + known devices. */
export async function fetchAuthMe(): Promise<{
  user: { id: string; phone: string; name: string; money_score: number; created_at?: string };
  sessions: Array<{ id: string; device_id: string; created_at: string; last_used_at: string; expires_at: string; user_agent?: string; ip?: string }>;
  devices: Array<{ user_id: string; device_id: string; device_name?: string; os?: string; is_trusted?: boolean; created_at: string; last_used_at: string }>;
  access_token_ttl_seconds: number;
}> {
  const r = await api.get('/auth/me');
  return r.data;
}

/** Round 89 — lightweight sessions+devices payload for the Profile
 *  > Security > Trusted devices screen. */
export async function listSessions(): Promise<{
  sessions: Array<{ id: string; device_id: string; created_at: string; last_used_at: string; expires_at: string; user_agent?: string; ip?: string }>;
  devices: Array<{ user_id: string; device_id: string; device_name?: string; os?: string; is_trusted?: boolean; created_at: string; last_used_at: string }>;
}> {
  const r = await api.get('/auth/sessions');
  return r.data;
}

/** Round 89 — revoke a single session by id. Idempotent; ownership
 *  is enforced server-side. */
export async function revokeSession(sessionId: string): Promise<{ revoked: boolean }> {
  const r = await api.delete(`/auth/sessions/${encodeURIComponent(sessionId)}`);
  return r.data;
}
