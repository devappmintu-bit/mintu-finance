import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, Platform, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';
import Toast from 'react-native-toast-message';
import api from '../utils/api';
import { fetchGmailStatus, startGmailOAuth, syncGmailNow, disconnectGmail } from '../services/gmail';
import { COLORS, SPACING, RADIUS } from '../utils/theme';
import { makeStyles } from '../utils/makeStyles';

type Status = {
  connected: boolean;
  email?: string;
  connected_at?: string;
  last_sync?: string | null;
  imported_count?: number;
};

const BANKS = [
  { name: 'HDFC Bank',    emoji: '🏦', color: '#004C8F' },
  { name: 'SBI',          emoji: '🏦', color: '#22409A' },
  { name: 'ICICI',        emoji: '🏦', color: '#F2A900' },
  { name: 'Axis Bank',    emoji: '🏦', color: '#97144D' },
  { name: 'Kotak',        emoji: '🏦', color: '#EE3124' },
  { name: 'Yes Bank',     emoji: '🏦', color: '#00518F' },
  { name: 'IndusInd',     emoji: '🏦', color: '#A6192E' },
];

const RETURN_URL = (process.env.EXPO_PUBLIC_BACKEND_URL as string) + '/gmail-connected';

export default function GmailConnectScreen() {
  const s = useStyles();
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
      const r = { data: await startGmailOAuth() };
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
      const result = await WebBrowser.openAuthSessionAsync(authUrl, RETURN_URL, { showInRecents: true });
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
      const r = { data: await syncGmailNow() };
      Toast.show({
        type: r.data.imported > 0 ? 'success' : 'info',
        text1: `Fetched ${r.data.fetched} · Imported ${r.data.imported}`,
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
      Toast.show({ type: 'success', text1: 'Disconnected' });
      await fetchStatus();
    } catch {
      Toast.show({ type: 'error', text1: 'Could not disconnect' });
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
        <ActivityIndicator color="#F56E1E" size="large" style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  const connected = !!status?.connected;

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text.primary} />
        </TouchableOpacity>
        <Text style={s.title}>Gmail Auto-Import</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        {/* Hero — condensed copy (Phase 2 trust-first UX) */}
        <LinearGradient colors={connected ? ['#047857', '#10B981'] : ['#F56E1E', '#C14A06']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
          <View style={s.heroIcon}>
            <Ionicons name={connected ? 'checkmark-circle' : 'mail-outline'} size={38} color="#fff" />
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
        </LinearGradient>

        {/* Trust badges row — ONLY when disconnected */}
        {!connected && (
          <View style={s.badgeRow}>
            <View style={s.badge}>
              <Ionicons name="lock-closed" size={14} color="#059669" />
              <Text style={s.badgeTxt}>End-to-end{'\n'}encrypted</Text>
            </View>
            <View style={s.badge}>
              <Ionicons name="eye-off" size={14} color="#059669" />
              <Text style={s.badgeTxt}>Read-only{'\n'}access</Text>
            </View>
            <View style={s.badge}>
              <Ionicons name="flash" size={14} color="#059669" />
              <Text style={s.badgeTxt}>Revoke{'\n'}anytime</Text>
            </View>
          </View>
        )}

        {/* Actions */}
        {!connected ? (
          <TouchableOpacity style={[s.cta, connecting && { opacity: 0.6 }]} disabled={connecting} onPress={connect} activeOpacity={0.85}>
            <LinearGradient colors={['#F56E1E', '#C14A06']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.ctaBg}>
              {connecting
                ? <ActivityIndicator color="#fff" />
                : (
                  <>
                    <Ionicons name="logo-google" size={18} color="#fff" />
                    <Text style={s.ctaT}>Connect with Google</Text>
                  </>
                )}
            </LinearGradient>
          </TouchableOpacity>
        ) : (
          <View style={{ gap: 10 }}>
            <TouchableOpacity style={[s.cta, syncing && { opacity: 0.6 }]} disabled={syncing} onPress={syncNow} activeOpacity={0.85}>
              <LinearGradient colors={['#F56E1E', '#C14A06']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.ctaBg}>
                {syncing
                  ? <ActivityIndicator color="#fff" />
                  : (
                    <>
                      <Ionicons name="sync" size={18} color="#fff" />
                      <Text style={s.ctaT}>Sync now</Text>
                    </>
                  )}
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity style={s.secondary} onPress={disconnect} activeOpacity={0.85}>
              <Ionicons name="unlink-outline" size={16} color="#B91C1C" />
              <Text style={s.secondaryT}>Disconnect Gmail</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* How it works — 3 concise bullets (trimmed from 4 verbose steps) */}
        <Text style={s.sect}>Why it's safe</Text>
        <View style={s.bulletCard}>
          <View style={s.bulletRow}>
            <Ionicons name="shield-checkmark" size={16} color="#059669" />
            <Text style={s.bulletTxt}><Text style={s.bulletBold}>Read-only.</Text> We can&apos;t send or delete emails</Text>
          </View>
          <View style={s.bulletRow}>
            <Ionicons name="filter" size={16} color="#059669" />
            <Text style={s.bulletTxt}><Text style={s.bulletBold}>Bank-only filter.</Text> Personal mail never opened</Text>
          </View>
          <View style={s.bulletRow}>
            <Ionicons name="close-circle" size={16} color="#059669" />
            <Text style={s.bulletTxt}><Text style={s.bulletBold}>Revoke anytime.</Text>{' '}
              <Text style={{ color: '#F56E1E', textDecorationLine: 'underline' }} onPress={() => Linking.openURL('https://myaccount.google.com/permissions')}>
                myaccount.google.com
              </Text>
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.bg.primary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  title: { fontSize: 17, fontWeight: '800', color: c.text.primary, letterSpacing: -0.3 },

  hero: { borderRadius: 24, padding: 22, marginBottom: 14 },
  heroIcon: { alignSelf: 'flex-start', padding: 6, marginBottom: 8 },
  heroTitle: { color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  heroSub: { color: 'rgba(255,255,255,0.9)', fontSize: 13, marginTop: 6, lineHeight: 19 },
  heroStats: { flexDirection: 'row', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.25)' },
  heroStat: { flex: 1 },
  heroStatVal: { color: '#fff', fontSize: 18, fontWeight: '800' },
  heroStatLbl: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '700', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.4 },
  heroStatDiv: { width: 1, backgroundColor: 'rgba(255,255,255,0.25)', marginHorizontal: 12 },

  cta: { borderRadius: 14, overflow: 'hidden' },
  ctaBg: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 15 },
  ctaT: { color: '#fff', fontSize: 15, fontWeight: '800' },

  secondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, backgroundColor: '#FEE2E2', borderRadius: 14 },
  secondaryT: { color: '#B91C1C', fontSize: 14, fontWeight: '700' },

  sect: { fontSize: 11, fontWeight: '800', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 24, marginBottom: 10 },

  bankGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bankChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#F3F4F6' },
  bankEmoji: { fontSize: 12 },
  bankName: { fontSize: 12, fontWeight: '700', color: '#111' },

  stepsCard: { backgroundColor: '#fff', borderRadius: 16, padding: 14, gap: 12, borderWidth: 1, borderColor: '#F3F4F6' },
  step: { flexDirection: 'row', gap: 12 },
  stepNumBg: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#FFF7ED', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FED7AA' },
  stepNum: { fontSize: 12, fontWeight: '800', color: '#C14A06' },
  stepT: { fontSize: 14, fontWeight: '700', color: '#111' },
  stepD: { fontSize: 12, color: '#6B7280', marginTop: 2 },

  // Phase 2 — Trust badge row (3 visual badges replace verbose privacy block)
  badgeRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  badge: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 10 },
  badgeTxt: { fontSize: 10, fontWeight: '800', color: '#065F46', lineHeight: 13 },
  // Phase 2 — condensed bullet card (replaces 4-step wordy block)
  bulletCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, gap: 12, borderWidth: 1, borderColor: '#F3F4F6' },
  bulletRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bulletTxt: { flex: 1, fontSize: 12.5, color: '#374151', fontWeight: '600', lineHeight: 17 },
  bulletBold: { fontWeight: '900', color: '#111' },

  privacy: { flexDirection: 'row', gap: 10, backgroundColor: '#ECFDF5', borderRadius: 14, padding: 12, marginTop: 16, borderWidth: 1, borderColor: '#A7F3D0' },
  privacyT: { fontSize: 13, fontWeight: '800', color: '#065F46' },
  privacyD: { fontSize: 12, color: '#065F46', marginTop: 4, lineHeight: 17 },
}));
