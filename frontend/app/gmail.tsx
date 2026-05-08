import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, Platform, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { router } from 'expo-router';
import Toast from 'react-native-toast-message';
import api from '../utils/api';
import { fetchGmailStatus, startGmailOAuth, syncGmailNow, disconnectGmail } from '../services/gmail';
import { StaggeredEntrance } from '../components/primitives';
import { COLORS, SPACING, RADIUS, useAppColors } from '../utils/theme';
import { makeStyles } from '../utils/makeStyles';
import { showError, showSuccess } from '../utils/toast';
import { BrutalScreenHeader } from '../components/brutal';



// R113 FIX — useStyles hoisted above first render-time call
// to avoid Metro/SDK52 TDZ error (`Cannot access X before init.`).
const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.bg.primary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  title: { fontSize: 17, fontWeight: '800', color: c.text.primary, letterSpacing: -0.3 },

  hero: { borderRadius: 0, padding: 22, marginBottom: 14 },
  heroIcon: { alignSelf: 'flex-start', padding: 6, marginBottom: 8 },
  heroTitle: { color: c.bg.elevated, fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  heroSub: { color: 'rgba(255,255,255,0.9)', fontSize: 13, marginTop: 6, lineHeight: 19 },
  heroStats: { flexDirection: 'row', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.25)' },
  heroStat: { flex: 1 },
  heroStatVal: { color: c.bg.elevated, fontSize: 18, fontWeight: '800' },
  heroStatLbl: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '700', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.4 },
  heroStatDiv: { width: 1, backgroundColor: 'rgba(255,255,255,0.25)', marginHorizontal: 12 },

  cta: { borderRadius: 0, overflow: 'hidden' },
  ctaBg: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 15 },
  ctaT: { color: c.bg.elevated, fontSize: 15, fontWeight: '800' },

  secondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, backgroundColor: c.state.dangerBg, borderRadius: 0 },
  secondaryT: { color: c.state.danger, fontSize: 14, fontWeight: '700' },

  sect: { fontSize: 11, fontWeight: '800', color: c.gray[400], textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 24, marginBottom: 10 },

  bankGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bankChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.bg.elevated, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: c.gray[100] },
  bankEmoji: { fontSize: 12 },
  bankName: { fontSize: 12, fontWeight: '700', color: c.text.primary },

  stepsCard: { backgroundColor: c.bg.elevated, borderRadius: 0, padding: 14, gap: 12, borderWidth: 1, borderColor: c.gray[100] },
  step: { flexDirection: 'row', gap: 12 },
  /* Pill border — brand-soft alpha (intentional aesthetic per Round 50). */
  stepNumBg: { width: 26, height: 26, borderRadius: 0, backgroundColor: c.accent.brandSoft, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.accent.brand + '33' },
  stepNum: { fontSize: 12, fontWeight: '800', color: c.accent.brandDark },
  stepT: { fontSize: 14, fontWeight: '700', color: c.text.primary },
  stepD: { fontSize: 12, color: c.text.muted, marginTop: 2 },

  // Phase 2 — Trust badge row (3 visual badges replace verbose privacy block)
  badgeRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  badge: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: c.state.successBg, borderWidth: 1, borderColor: c.state.successBorder, borderRadius: 0, paddingVertical: 10, paddingHorizontal: 10 },
  badgeTxt: { fontSize: 10, fontWeight: '800', color: c.state.success, lineHeight: 13 },
  // Phase 2 — condensed bullet card (replaces 4-step wordy block)
  bulletCard: { backgroundColor: c.bg.elevated, borderRadius: 0, padding: 14, gap: 12, borderWidth: 1, borderColor: c.gray[100] },
  bulletRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bulletTxt: { flex: 1, fontSize: 12.5, color: c.text.secondary, fontWeight: '600', lineHeight: 17 },
  bulletBold: { fontWeight: '900', color: c.text.primary },

  privacy: { flexDirection: 'row', gap: 10, backgroundColor: c.state.successBg, borderRadius: 0, padding: 12, marginTop: 16, borderWidth: 1, borderColor: c.state.successBorder },
  privacyT: { fontSize: 13, fontWeight: '800', color: c.state.success },
  privacyD: { fontSize: 12, color: c.state.success, marginTop: 4, lineHeight: 17 },
}));

type Status = {
  connected: boolean;
  email?: string;
  connected_at?: string;
  last_sync?: string | null;
  imported_count?: number;
};

// Indian bank brand colors (third-party visual identity, kept as literal hex
// per Round 50 audit — these are protected trademarks/brand colors).
const BANKS = [
  { name: 'HDFC Bank',    emoji: '🏦', color: '#004C8F' },
  { name: 'SBI',          emoji: '🏦', color: '#22409A' },
  { name: 'ICICI',        emoji: '🏦', color: '#F2A900' },
  { name: 'Axis Bank',    emoji: '🏦', color: '#97144D' },
  { name: 'Kotak',        emoji: '🏦', color: '#EE3124' },
  { name: 'Yes Bank',     emoji: '🏦', color: '#00518F' },
  { name: 'IndusInd',     emoji: '🏦', color: '#A6192E' },
];

// Gmail OAuth return URL — environment-agnostic.
//
// ▸ Web: always use window.location.origin + '/gmail-connected'.
//   This works identically on preview URL, custom domains, and prod.
// ▸ Native (iOS/Android): window is undefined → use the app's deep
//   link scheme ('mintu://gmail-connected'), declared in app.json.
//   `expo-web-browser` intercepts this scheme and closes the auth
//   session once the OAuth provider redirects to it.
// Round 47 deploy hardening — explicit Platform.OS branch instead of
// `typeof window` heuristic. This is more reliable across SSR, hermetic
// builds, and unusual JS contexts where `window` may exist but
// `location.origin` is empty.
// ▸ Web: always use the live origin (preview URL, custom domain, prod
//   all work because window.location.origin is set by the browser).
// ▸ Native (iOS/Android): use the app's deep link scheme
//   ('mintu://gmail-connected'), declared in app.json. `expo-web-browser`
//   intercepts this scheme and closes the auth session once the OAuth
//   provider redirects to it.
// ─────────────────────────────────────────────────────────────────────
//  REDIRECT URI — runtime-aware via expo-auth-session
//
//  Different Expo runtimes need different OAuth callback URLs:
//    • Web preview          → window.location.origin + '/gmail-connected'
//    • Standalone iOS / APK → 'mintu://gmail-connected'
//    • Expo Go              → 'exp://<lan-ip>:port/--/gmail-connected'
//
//  AuthSession.makeRedirectUri() handles ALL three correctly. We pass
//  this URI to:
//    1. expo-web-browser as the second arg (so it knows when to close
//       the in-app browser)
//    2. (optionally) the backend so its callback redirects to the
//       *current* runtime's URI instead of a hardcoded scheme.
//
//  Production caveat: the Google OAuth Console must whitelist
//  `https://api.<your-domain>/api/oauth/gmail/callback` (the *backend*
//  callback, not the deep link). The backend then redirects to the
//  deep link below — Google never sees the deep-link URL.
// ─────────────────────────────────────────────────────────────────────
function computeReturnUrl(): string {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return window.location.origin + '/gmail-connected';
    }
    return '/gmail-connected';
  }
  // expo-auth-session figures out the right scheme for Expo Go vs
  // standalone vs dev-client at runtime.
  return AuthSession.makeRedirectUri({
    scheme: 'mintu',
    path: 'gmail-connected',
    // In Expo Go, fall back to the legacy proxy so OAuth still works
    // even if the dev hasn't run a custom dev-client build yet.
    preferLocalhost: false,
  });
}

export default function GmailConnectScreen() {
  const s = useStyles();
  const c = useAppColors();
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const r = { data: await fetchGmailStatus() };
      setStatus(r.data);
    } catch (e) {
      setStatus({ connected: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const connect = async () => {
    setConnecting(true);
    try {
      const returnUrl = computeReturnUrl();
      // Pass our deep-link to the backend so it can redirect back to the
      // *current* runtime (web preview, dev-client, or standalone).
      const r = { data: await startGmailOAuth(Platform.OS === 'web' ? undefined : returnUrl) };
      const authUrl: string = r.data.auth_url;
      if (!authUrl) throw new Error('no auth url');
      if (Platform.OS === 'web') {
        // On web, open the consent flow in a new tab; backend redirect closes it
        window.open(authUrl, '_blank');
        // Poll status for ~60s while user signs in
        const start = Date.now();
        const tick = async () => {
          const s = await fetchGmailStatus().catch(() => null);
          if (s?.connected) { setStatus(s); setConnecting(false); Toast.show({ type: 'success', text1: 'Gmail connected', text2: s.email }); return; }
          if (Date.now() - start > 90_000) { setConnecting(false); return; }
          setTimeout(tick, 2500);
        };
        tick();
        return;
      }
      const result = await WebBrowser.openAuthSessionAsync(authUrl, returnUrl, { showInRecents: true });
      if (result.type === 'success' || result.type === 'dismiss') {
        await fetchStatus();
      }
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Could not start Gmail OAuth', text2: e?.response?.data?.detail || e?.message });
    } finally {
      setConnecting(false);
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      const r = { data: await syncGmailNow() } as { data: { imported: number; scanned: number; fetched?: number; skipped?: number } };
      Toast.show({
        type: r.data.imported > 0 ? 'success' : 'info',
        text1: `Fetched ${r.data.fetched ?? r.data.scanned} · Imported ${r.data.imported}`,
        text2: r.data.skipped ? `${r.data.skipped} already seen` : undefined,
      });
      await fetchStatus();
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Sync failed', text2: e?.response?.data?.detail || 'Try reconnecting' });
    } finally {
      setSyncing(false);
    }
  };

  const disconnect = async () => {
    try {
      await disconnectGmail();
      showSuccess('Disconnected');
      await fetchStatus();
    } catch {
      showError('Could not disconnect');
    }
  };

  const fmtTime = (iso?: string | null) => {
    if (!iso) return 'Never';
    try {
      const d = new Date(iso);
      const m = (Date.now() - d.getTime()) / 60000;
      if (m < 1) return 'Just now';
      if (m < 60) return `${Math.floor(m)}m ago`;
      if (m < 1440) return `${Math.floor(m / 60)}h ago`;
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch { return 'Unknown'; }
  };

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <ActivityIndicator color={c.accent.brand} size="large" style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  const connected = !!status?.connected;

  return (
    <SafeAreaView style={s.container}>
      <BrutalScreenHeader
        title="GMAIL AUTO-IMPORT"
        subtitle={connected ? 'CONNECTED · SYNCING' : 'READ-ONLY · BANK ALERTS ONLY'}
      />

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        <StaggeredEntrance delayMs={70} duration={420} distance={14}>
        {/* Hero — condensed copy (Phase 2 trust-first UX) */}
        <View style={[s.hero, { backgroundColor: '#0A0A0A' }]}>
          <View style={s.heroIcon}>
            <Ionicons name={connected ? 'checkmark-circle' : 'mail-outline'} size={38} color="#FFFFFF" />
          </View>
          <Text style={s.heroTitle}>{connected ? 'Gmail connected' : 'Auto-import bank SMS'}</Text>
          <Text style={s.heroSub}>
            {connected
              ? `Syncing ${status?.email || 'your inbox'} every 15 min`
              : 'Read-only · bank alerts only · never personal mail'}
          </Text>
          {connected && (
            <View style={s.heroStats}>
              <View style={s.heroStat}>
                <Text style={s.heroStatVal}>{status?.imported_count || 0}</Text>
                <Text style={s.heroStatLbl}>Imported</Text>
              </View>
              <View style={s.heroStatDiv} />
              <View style={s.heroStat}>
                <Text style={s.heroStatVal}>{fmtTime(status?.last_sync || undefined)}</Text>
                <Text style={s.heroStatLbl}>Last sync</Text>
              </View>
            </View>
          )}
        </View>

        {/* Trust badges row — ONLY when disconnected */}
        {!connected && (
          <View style={s.badgeRow}>
            <View style={s.badge}>
              <Ionicons name="lock-closed" size={14} color={c.state.success} />
              <Text style={s.badgeTxt}>End-to-end{'\n'}encrypted</Text>
            </View>
            <View style={s.badge}>
              <Ionicons name="eye-off" size={14} color={c.state.success} />
              <Text style={s.badgeTxt}>Read-only{'\n'}access</Text>
            </View>
            <View style={s.badge}>
              <Ionicons name="flash" size={14} color={c.state.success} />
              <Text style={s.badgeTxt}>Revoke{'\n'}anytime</Text>
            </View>
          </View>
        )}

        {/* Actions */}
        {!connected ? (
          <TouchableOpacity style={[s.cta, connecting && { opacity: 0.6 }]} disabled={connecting} onPress={connect} activeOpacity={0.85}>
            <View style={[s.ctaBg, { backgroundColor: '#0A0A0A' }]}>
              {connecting
                ? <ActivityIndicator color="#FFFFFF" />
                : (
                  <>
                    <Ionicons name="logo-google" size={18} color="#FFFFFF" />
                    <Text style={s.ctaT}>Connect with Google</Text>
                  </>
                )}
            </View>
          </TouchableOpacity>
        ) : (
          <View style={{ gap: 10 }}>
            <TouchableOpacity style={[s.cta, syncing && { opacity: 0.6 }]} disabled={syncing} onPress={syncNow} activeOpacity={0.85}>
              <View style={[s.ctaBg, { backgroundColor: '#0A0A0A' }]}>
                {syncing
                  ? <ActivityIndicator color="#FFFFFF" />
                  : (
                    <>
                      <Ionicons name="sync" size={18} color="#FFFFFF" />
                      <Text style={s.ctaT}>Sync now</Text>
                    </>
                  )}
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={s.secondary} onPress={disconnect} activeOpacity={0.85}>
              <Ionicons name="unlink-outline" size={16} color={c.state.danger} />
              <Text style={s.secondaryT}>Disconnect Gmail</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* How it works — 3 concise bullets (trimmed from 4 verbose steps) */}
        <Text style={s.sect}>Why it's safe</Text>
        <View style={s.bulletCard}>
          <View style={s.bulletRow}>
            <Ionicons name="shield-checkmark" size={16} color={c.state.success} />
            <Text style={s.bulletTxt}><Text style={s.bulletBold}>Read-only.</Text> We can&apos;t send or delete emails</Text>
          </View>
          <View style={s.bulletRow}>
            <Ionicons name="filter" size={16} color={c.state.success} />
            <Text style={s.bulletTxt}><Text style={s.bulletBold}>Bank-only filter.</Text> Personal mail never opened</Text>
          </View>
          <View style={s.bulletRow}>
            <Ionicons name="close-circle" size={16} color={c.state.success} />
            <Text style={s.bulletTxt}><Text style={s.bulletBold}>Revoke anytime.</Text>{' '}
              <Text style={{ color: c.accent.brand, textDecorationLine: 'underline' }} onPress={() => Linking.openURL('https://myaccount.google.com/permissions')}>
                myaccount.google.com
              </Text>
            </Text>
          </View>
        </View>
        </StaggeredEntrance>
      </ScrollView>
    </SafeAreaView>
  );
}

