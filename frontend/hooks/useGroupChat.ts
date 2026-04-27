/**
 * useGroupChat — Round 51k.
 *
 * React hook that manages a real-time WebSocket subscription to a
 * MintU split group's chat. Designed to LAYER on top of the existing
 * 8-second HTTP poll (which is kept as a fallback) — the WS path
 * delivers sub-second updates when connected, and the poll guarantees
 * eventual consistency when the socket is down.
 *
 * Public surface:
 *   const { connected } = useGroupChat({
 *     groupId,
 *     enabled,         // false to pause (e.g. when sheet is closed)
 *     onMessage,       // (msgDoc) => void  — fires for each broadcast
 *   });
 *
 * Reconnect strategy:
 *   • Exponential backoff: 1s → 2s → 4s → 8s → 16s → 30s (cap).
 *   • Random ±20 % jitter so a service restart doesn't thunder-herd.
 *   • Reset to 1s after a successful "connected" handshake.
 *   • Stops trying when `enabled` flips to false or the component unmounts.
 *
 * Heartbeat:
 *   • 25 s ping → server replies `pong`.
 *   • If no pong within 10 s of a ping, force-close + reconnect.
 *
 * Auth:
 *   • Uses the same JWT the rest of the app uses (read from authStore).
 *   • If the token is missing we never open the socket — caller's
 *     existing HTTP polling stays the only data source.
 *
 * Why broadcast-only?
 *   Sending messages still goes through HTTP POST. This keeps audit
 *   logs, retry semantics, and idempotency in one place — and the
 *   server's WS broadcaster fans the response back over the socket
 *   so the sender's own list updates sub-second too.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { Platform, AppState, type AppStateStatus } from 'react-native';
import Constants from 'expo-constants';
import { useAuthStore } from '../store/authStore';

type Options = {
  groupId: string | null | undefined;
  enabled: boolean;
  onMessage: (msg: any) => void;
};

const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;
const PING_INTERVAL_MS = 25000;
const PONG_TIMEOUT_MS = 10000;

function getWsBase(): string | null {
  // Prefer the runtime-configured backend URL so prod/preview/dev all
  // pick up the right host (and HTTPS upgrades to WSS).
  const httpBase: string =
    (Constants?.expoConfig as any)?.extra?.EXPO_PUBLIC_BACKEND_URL ||
    (process.env.EXPO_PUBLIC_BACKEND_URL as string) ||
    '';
  if (!httpBase) return null;
  // Tolerate trailing slash.
  const cleaned = httpBase.replace(/\/+$/, '');
  if (cleaned.startsWith('https://')) return 'wss://' + cleaned.slice('https://'.length);
  if (cleaned.startsWith('http://'))  return 'ws://'  + cleaned.slice('http://'.length);
  // Already protocol-less? Default to wss:// for safety on web.
  return (Platform.OS === 'web' ? 'wss://' : 'ws://') + cleaned;
}

export default function useGroupChat({ groupId, enabled, onMessage }: Options) {
  const { token } = useAuthStore();
  const [connected, setConnected] = useState(false);

  // We keep all mutable state in refs so the connect closure isn't
  // recreated on every render (which would loop reconnects).
  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef<number>(BASE_BACKOFF_MS);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pongTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedByUsRef = useRef<boolean>(false);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  // Keep the latest "should we be connected?" flag in a ref so the
  // post-close timer doesn't reconnect after the parent unmounts.
  const aliveRef = useRef<boolean>(true);

  const cleanupTimers = useCallback(() => {
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    if (pingTimerRef.current) { clearInterval(pingTimerRef.current); pingTimerRef.current = null; }
    if (pongTimerRef.current) { clearTimeout(pongTimerRef.current); pongTimerRef.current = null; }
  }, []);

  const closeSocket = useCallback(() => {
    cleanupTimers();
    closedByUsRef.current = true;
    try { wsRef.current?.close(); } catch {}
    wsRef.current = null;
    setConnected(false);
  }, [cleanupTimers]);

  const scheduleReconnect = useCallback((open: () => void) => {
    if (!aliveRef.current) return;
    const jitter = (Math.random() - 0.5) * 0.4 * backoffRef.current;
    const wait = Math.min(MAX_BACKOFF_MS, Math.max(250, backoffRef.current + jitter));
    backoffRef.current = Math.min(MAX_BACKOFF_MS, backoffRef.current * 2);
    reconnectTimerRef.current = setTimeout(open, wait);
  }, []);

  const startHeartbeat = useCallback(() => {
    if (pingTimerRef.current) clearInterval(pingTimerRef.current);
    pingTimerRef.current = setInterval(() => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== 1 /* OPEN */) return;
      try {
        ws.send(JSON.stringify({ type: 'ping' }));
        if (pongTimerRef.current) clearTimeout(pongTimerRef.current);
        pongTimerRef.current = setTimeout(() => {
          // No pong in time — assume zombie connection.
          if (__DEV__) console.warn('[useGroupChat] pong timeout — recycling socket');
          try { ws.close(); } catch {}
        }, PONG_TIMEOUT_MS);
      } catch { /* socket already dead — onclose will fire */ }
    }, PING_INTERVAL_MS);
  }, []);

  const open = useCallback(() => {
    if (!aliveRef.current) return;
    if (!enabled || !groupId || !token) return;
    const wsBase = getWsBase();
    if (!wsBase) return;

    closedByUsRef.current = false;
    const url = `${wsBase}/api/ws/split/${groupId}?token=${encodeURIComponent(token)}`;
    let ws: WebSocket;
    try { ws = new WebSocket(url); } catch (e) {
      if (__DEV__) console.warn('[useGroupChat] open() threw', e);
      scheduleReconnect(open);
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      // Wait for the server-side {type:"connected"} ack before flipping
      // the visible flag — that confirms auth + membership succeeded.
    };

    ws.onmessage = (ev: MessageEvent) => {
      let payload: any;
      try { payload = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data)); }
      catch { return; }

      if (!payload || typeof payload !== 'object') return;
      switch (payload.type) {
        case 'connected':
          backoffRef.current = BASE_BACKOFF_MS; // reset backoff
          setConnected(true);
          startHeartbeat();
          break;
        case 'message':
          if (payload.data) {
            try { onMessageRef.current(payload.data); }
            catch (e) { if (__DEV__) console.warn('[useGroupChat] onMessage threw', e); }
          }
          break;
        case 'pong':
          if (pongTimerRef.current) { clearTimeout(pongTimerRef.current); pongTimerRef.current = null; }
          break;
        default: /* ignore unknown */
      }
    };

    ws.onerror = () => {
      // RN/web don't always give us details — onclose will fire too.
      // We just let onclose drive reconnects.
    };

    ws.onclose = () => {
      setConnected(false);
      if (pingTimerRef.current) { clearInterval(pingTimerRef.current); pingTimerRef.current = null; }
      if (pongTimerRef.current) { clearTimeout(pongTimerRef.current); pongTimerRef.current = null; }
      wsRef.current = null;
      if (closedByUsRef.current) return; // intentional close — no reconnect
      scheduleReconnect(open);
    };
  }, [enabled, groupId, token, scheduleReconnect, startHeartbeat]);

  // Lifecycle
  useEffect(() => {
    aliveRef.current = true;
    if (enabled && groupId && token) {
      backoffRef.current = BASE_BACKOFF_MS;
      open();
    }
    return () => {
      aliveRef.current = false;
      closeSocket();
    };
  }, [enabled, groupId, token, open, closeSocket]);

  // App state — close on background to save battery, reopen on foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active' && enabled && groupId && token) {
        if (!wsRef.current) {
          backoffRef.current = BASE_BACKOFF_MS;
          open();
        }
      } else if (next === 'background' || next === 'inactive') {
        closeSocket();
      }
    });
    return () => { sub.remove(); };
  }, [enabled, groupId, token, open, closeSocket]);

  return { connected };
}
