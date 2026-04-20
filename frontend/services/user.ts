/**
 * services/user.ts — User profile + auth + avatar wrappers.
 */
import api from '../utils/api';
import type { User } from './types';

export async function fetchCurrentUser(): Promise<User> {
  const r = await api.get('/user/me');
  return r.data as User;
}

export async function updateProfile(payload: Partial<User>): Promise<User> {
  const r = await api.put('/user/profile', payload);
  return r.data as User;
}

export async function fetchAvatar(): Promise<{ avatar: string | null }> {
  const r = await api.get('/user/avatar');
  return r.data;
}

export async function uploadAvatar(base64: string): Promise<any> {
  const r = await api.post('/user/avatar', { avatar: base64 });
  return r.data;
}

export async function fetchUpi(): Promise<{ upi?: string; has_upi: boolean }> {
  const r = await api.get('/user/upi');
  return r.data;
}

export async function updateUpi(upi: string): Promise<any> {
  const r = await api.post('/user/upi', { upi });
  return r.data;
}

export async function sendOtp(phone: string): Promise<any> {
  const r = await api.post('/auth/send-otp', { phone });
  return r.data;
}

export async function verifyOtp(phone: string, otp: string): Promise<{ access_token?: string; token?: string; user?: User }> {
  const r = await api.post('/auth/verify-otp', { phone, otp });
  return r.data;
}
