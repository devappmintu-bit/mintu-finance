/**
 * utils/deviceContext.ts — Round 88 Auth V2.
 *
 * Builds the per-device payload sent to /auth/verify-otp and
 * /auth/refresh so the backend can:
 *   • Mint a refresh token bound to THIS device.
 *   • Promote the device to "trusted" after first OTP success.
 *   • Render the "Logged in on N devices" list in /auth/me.
 *
 * Fields:
 *   • device_id   — stable per-install UUIDv4 from utils/deviceId
 *                   (SecureStore-backed, survives JS reloads).
 *   • device_name — human label, e.g. "Pixel 8 Pro" or "iPhone 15".
 *                   Sourced from expo-device when available.
 *   • os          — "ios" | "android" | "web". Lower-case for the
 *                   backend's enum-style storage in db.devices.
 *
 * Resilient: any individual lookup that fails silently degrades —
 * we always at least return a `device_id` because that's what the
 * silent-refresh contract relies on.
 */
import { Platform } from 'react-native';
import { getDeviceId } from './deviceId';

let _cachedName: string | null = null;

async function resolveDeviceName(): Promise<string | null> {
  if (_cachedName !== null) return _cachedName;
  try {
    // Lazy import keeps startup cost low and gracefully degrades
    // when expo-device isn't available (web, jest, etc).
    const Device = await import('expo-device');
    const model = (Device as any)?.modelName || (Device as any)?.deviceName || null;
    _cachedName = typeof model === 'string' && model.length > 0 ? model : null;
    return _cachedName;
  } catch {
    _cachedName = null;
    return null;
  }
}

export interface DeviceContextPayload {
  device_id: string;
  device_name?: string;
  os?: string;
}

/** Returns the full device-context payload to be sent on auth calls. */
export async function getDeviceContext(): Promise<DeviceContextPayload> {
  const device_id = await getDeviceId();
  const device_name = (await resolveDeviceName()) || undefined;
  const os = Platform.OS; // "ios" | "android" | "web"
  return { device_id, device_name, os };
}
