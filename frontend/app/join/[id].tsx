/**
 * Join Group · Deeplink Landing Screen (`/join/[id]`)
 *
 * Entered when a user taps an invite link shared from the Add Member flow.
 * Behavior:
 *   • Not logged in → redirects to /auth, then returns here via `?next=`
 *   • Logged in → calls GET /split/groups/{id}/preview for a lightweight
 *     card (name, member count, creator, avatar stack)
 *   • User taps "Join group" → POST /split/groups/{id}/join (idempotent) →
 *     lands on the group detail screen.
 *   • Already a member → one-tap "Open group" shortcut.
 *
 * Edge cases:
 *   • Invalid / deleted group → friendly error with "Go to MintU" CTA
 *   • Network failure → inline retry
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { previewGroupForJoin, joinGroup } from '../../services/split';
import { useAuthStore } from '../../store/authStore';
import { makeStyles } from '../../utils/makeStyles';
import { COLORS, SPACING } from '../../utils/theme';

const getInitials = (n?: string) => {
  if (!n) return '?';
  const p = n.trim().split(/\s+/).slice(0, 2);
  return p.map(x => x[0]).join('').toUpperCase() || '?';
};

export default function JoinGroupScreen() {
  const s = useStyles();
  const params = useLocalSearchParams<{ id?: string }>();
  const gid = params.id ? String(params.id) : '';
  const token = useAuthStore(st => st.token);

  const [preview, setPreview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await previewGroupForJoin(gid);
      setPreview(data);
    } catch (e: any) {
      if (e?.response?.status === 404) setError('This invite link is no longer valid.');
      else setError('Could not load this group. Please check your connection.');
    } finally { setLoading(false); }
  };

  useEffect(() => {
    // Not authenticated → bounce to auth with a return URL so we can come back after login
    if (!token) {
      const next = encodeURIComponent(`/join/${gid}`);
      router.replace(`/auth?next=${next}` as any);
      return;
    }
    if (!gid) {
      setError('This link is missing a group ID.');
      setLoading(false);
      return;
    }
    load();
  }, [gid, token]);

  const handleJoin = async () => {
    if (!preview || joining) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setJoining(true);
    try {
      await joinGroup(gid);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Toast.show({ type: 'success', text1: `Joined ${preview.name}` });
      // Navigate to the group detail or Split tab
      router.replace(`/split/group/${gid}` as any);
    } catch {
      Toast.show({ type: 'error', text1: 'Could not join group', text2: 'Please try again.' });
    } finally { setJoining(false); }
  };

  const handleOpen = () => {
    router.replace(`/split/group/${gid}` as any);
  };

  // ─── Render ─────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={s.bg}>
        <ActivityIndicator style={{ flex: 1 }} color={COLORS.accent.primary} />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={s.bg}>
        <View style={s.center}>
          <View style={s.errIcon}>
            <Ionicons name="alert-circle" size={32} color={COLORS.state.danger} />
          </View>
          <Text style={s.title}>Oops</Text>
          <Text style={s.subtitle}>{error}</Text>
          <TouchableOpacity style={s.primaryBtn} onPress={() => router.replace('/(tabs)' as any)} activeOpacity={0.85}>
            <Text style={s.primaryTxt}>Go to MintU</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={load} style={s.retryBtn} activeOpacity={0.7}>
            <Ionicons name="refresh" size={14} color={COLORS.text.muted} />
            <Text style={s.retryTxt}>Try again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!preview) return <SafeAreaView style={s.bg} />;

  return (
    <SafeAreaView style={s.bg}>
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => router.replace('/(tabs)' as any)} style={s.iconBtn} hitSlop={8} accessibilityLabel="Close">
          <Ionicons name="close" size={22} color={COLORS.text.primary} />
        </TouchableOpacity>
        <Text style={s.topBarTxt}>MintU</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={s.scroll}>
        {/* Group hero card — signature orange gradient */}
        <LinearGradient
          colors={[COLORS.accent.brand, COLORS.accent.brandDark]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={s.hero}
        >
          <Text style={s.heroEmoji}>{preview.emoji || '👥'}</Text>
          <Text style={s.overline}>INVITED TO JOIN</Text>
          <Text style={s.heroName} numberOfLines={2}>{preview.name}</Text>

          {preview.creator?.name ? (
            <Text style={s.heroBy} numberOfLines={1}>by {preview.creator.name}</Text>
          ) : null}

          {/* Avatar stack */}
          <View style={s.stack}>
            {(preview.member_preview || []).slice(0, 5).map((m: any, i: number) => (
              <View key={i} style={[s.stackAvatar, { marginLeft: i === 0 ? 0 : -10, zIndex: 10 - i }]}>
                <Text style={s.stackInitials}>{getInitials(m.name)}</Text>
              </View>
            ))}
            {preview.member_count > 5 ? (
              <View style={[s.stackAvatar, s.stackMore, { marginLeft: -10, zIndex: 1 }]}>
                <Text style={s.stackMoreTxt}>+{preview.member_count - 5}</Text>
              </View>
            ) : null}
          </View>

          <Text style={s.heroMeta}>
            {preview.member_count} {preview.member_count === 1 ? 'member' : 'members'}
          </Text>
        </LinearGradient>

        {/* CTA */}
        {preview.already_member ? (
          <>
            <View style={s.alreadyBadgeRow}>
              <Ionicons name="checkmark-circle" size={16} color={COLORS.state.success} />
              <Text style={s.alreadyTxt}>You're already in this group</Text>
            </View>
            <TouchableOpacity style={s.primaryBtn} onPress={handleOpen} activeOpacity={0.85}>
              <Ionicons name="arrow-forward" size={16} color="#fff" />
              <Text style={s.primaryTxt}>Open group</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={s.joinHint}>Split bills, track who owes what, and settle up in seconds.</Text>
            <TouchableOpacity
              style={[s.primaryBtn, joining && { opacity: 0.7 }]}
              onPress={handleJoin}
              disabled={joining}
              activeOpacity={0.85}
              testID="join-group-cta"
            >
              {joining ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="person-add" size={16} color="#fff" />
                  <Text style={s.primaryTxt}>Join group</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity onPress={() => router.replace('/(tabs)' as any)} style={s.ghostBtn} activeOpacity={0.7}>
          <Text style={s.ghostTxt}>Not now</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  bg: { flex: 1, backgroundColor: c.bg.primary },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
  },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg.secondary },
  topBarTxt: { fontSize: 15, fontWeight: '900', color: c.text.primary, letterSpacing: -0.2 },

  scroll: { padding: SPACING.lg, gap: 14 },

  hero: {
    borderRadius: 24, padding: 24, alignItems: 'center', overflow: 'hidden',
    shadowColor: COLORS.accent.brandDark, shadowOpacity: 0.2, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 6,
  },
  heroEmoji: { fontSize: 44 },
  overline: { fontSize: 10.5, fontWeight: '900', color: 'rgba(255,255,255,0.78)', letterSpacing: 1.4, marginTop: 12 },
  heroName: { fontSize: 28, fontWeight: '900', color: '#fff', letterSpacing: -0.8, marginTop: 4, textAlign: 'center' },
  heroBy: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.88)', marginTop: 4 },
  heroMeta: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.88)', marginTop: 10 },

  stack: { flexDirection: 'row', marginTop: 14 },
  stackAvatar: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: COLORS.accent.brandDark,
  },
  stackInitials: { fontSize: 12, fontWeight: '900', color: COLORS.accent.brandDark },
  stackMore: { backgroundColor: 'rgba(0,0,0,0.3)', borderColor: '#fff' },
  stackMoreTxt: { fontSize: 10.5, fontWeight: '900', color: '#fff' },

  joinHint: { fontSize: 13, fontWeight: '600', color: c.text.muted, textAlign: 'center', marginTop: 4, lineHeight: 18 },

  alreadyBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', marginTop: 4 },
  alreadyTxt: { fontSize: 13, fontWeight: '700', color: c.state.success },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: c.accent.primary,
    paddingVertical: 15, borderRadius: 14, marginTop: 8,
  },
  primaryTxt: { fontSize: 15, fontWeight: '900', color: '#fff', letterSpacing: -0.2 },

  ghostBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  ghostTxt: { fontSize: 13, fontWeight: '700', color: c.text.muted },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
  errIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: c.state.dangerBg, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title: { fontSize: 22, fontWeight: '900', color: c.text.primary, letterSpacing: -0.4 },
  subtitle: { fontSize: 14, fontWeight: '500', color: c.text.muted, marginTop: 8, textAlign: 'center', lineHeight: 20, maxWidth: 320 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12, marginTop: 6 },
  retryTxt: { fontSize: 13, fontWeight: '700', color: c.text.muted },
}));
