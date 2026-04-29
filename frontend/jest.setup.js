/**
 * jest.setup.js — Round 52e
 *
 * Lean setup for the ts-jest path: only stubs the globals that our
 * pure utility / service code references at import time. We do NOT
 * pull in the React Native test setup here (see jest.config.js
 * comment for the rationale).
 */

// expo-haptics + expo-constants — referenced by hooks/useGroupChat etc.
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}), { virtual: true });

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: { extra: { EXPO_PUBLIC_BACKEND_URL: 'https://test.local' } },
  },
}), { virtual: true });

// process.env fallback for hooks that read it directly.
process.env.EXPO_PUBLIC_BACKEND_URL = 'https://test.local';
