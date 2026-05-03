/**
 * store/paymentStore.ts — Round 72.
 *
 * Single source of truth for the in-flight checkout flow. Tracks:
 *   • Which plan the user is buying
 *   • Which payment method they picked (UPI · GPay/PhonePe/Paytm · Cards · Wallets)
 *   • The Razorpay subscription_id + short_url returned by the backend
 *   • Status: idle | pending | success | failed (+ error message for retry)
 *
 * Why a global store?
 *   • The checkout sheet, the WebBrowser callback, and the success
 *     screen all need to read/write the same state.
 *   • The deep-link return from Razorpay (premium-activated screen)
 *     consumes `pendingSubId` to confirm the right purchase.
 *
 * Reset strategy: on `success` or after `failed.dismiss`, the store
 * goes back to `idle` and clears all transient data so the next
 * checkout starts clean.
 */
import { create } from 'zustand';
import type { Plan } from '../utils/premium';

export type PaymentMethod =
  | 'upi_gpay'
  | 'upi_phonepe'
  | 'upi_paytm'
  | 'upi_other'
  | 'card'
  | 'wallet';

export type PaymentStatus = 'idle' | 'pending' | 'success' | 'failed';

export interface PaymentState {
  status: PaymentStatus;
  plan: Plan | null;
  method: PaymentMethod | null;
  amount: number;            // ₹ paise-resolved value, e.g. 99
  pendingSubId: string | null;
  shortUrl: string | null;
  errorMsg: string | null;
  // Actions
  begin: (args: { plan: Plan; method: PaymentMethod; amount: number }) => void;
  setPending: (args: { subId: string; shortUrl: string }) => void;
  setSuccess: () => void;
  setFailed: (errorMsg: string) => void;
  setMethod: (m: PaymentMethod) => void;
  reset: () => void;
}

export const usePaymentStore = create<PaymentState>((set) => ({
  status: 'idle',
  plan: null,
  method: null,
  amount: 0,
  pendingSubId: null,
  shortUrl: null,
  errorMsg: null,
  begin: ({ plan, method, amount }) => set({
    status: 'pending', plan, method, amount,
    pendingSubId: null, shortUrl: null, errorMsg: null,
  }),
  setPending: ({ subId, shortUrl }) => set({
    status: 'pending', pendingSubId: subId, shortUrl,
  }),
  setSuccess: () => set({
    status: 'success', errorMsg: null,
  }),
  setFailed: (errorMsg) => set({
    status: 'failed', errorMsg,
  }),
  setMethod: (method) => set({ method }),
  reset: () => set({
    status: 'idle',
    plan: null,
    method: null,
    amount: 0,
    pendingSubId: null,
    shortUrl: null,
    errorMsg: null,
  }),
}));
