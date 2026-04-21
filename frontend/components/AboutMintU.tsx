/**
 * AboutMintU — Phase 3 Redesign: storytelling · "Built for India" hero · less text.
 * Emotional hook → mission → credibility → footer.
 */
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING } from '../utils/theme';
import { makeStyles } from '../utils/makeStyles';

const VERSION = '2.0.0';

export default function AboutMintU({ onClose }: { onClose: () => void }) {
  const s = useStyles();

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>About</Text>
        <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={COLORS.text.primary} /></TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero — emotional hook + "Built for India" */}
        <LinearGradient colors={['#F56E1E', '#C14A06']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
          <View style={s.heroBadge}>
            <Text style={s.heroFlag}>🇮🇳</Text>
            <Text style={s.heroBadgeTxt}>BUILT FOR INDIA</Text>
          </View>
          <Text style={s.heroHook}>Money moves fast in India.</Text>
          <Text style={s.heroHook2}>MintU moves faster.</Text>
          <Text style={s.heroSub}>The first finance app that speaks UPI, understands chai-pani receipts, and plays the long game with your savings.</Text>
        </LinearGradient>

        {/* Our Story — short narrative */}
        <Text style={s.sectionLbl}>OUR STORY</Text>
        <View style={s.storyCard}>
          <Text style={s.storyEmoji}>💡</Text>
          <Text style={s.storyTxt}>
            <Text style={s.storyBold}>We got tired</Text> of apps built for San Francisco, not Saket.
            {'\n\n'}<Text style={s.storyBold}>So we built MintU</Text> — an AI coach that reads your bank SMS,
            understands monthly SIPs, splits chai bills fairly, and keeps you honest
            about that 4th Swiggy order.
            {'\n\n'}<Text style={s.storyBold}>₹150 max.</Text> No hidden upsells. No creepy data selling.
            Just money, sorted.
          </Text>
        </View>

        {/* Stats row — credibility without clutter */}
        <View style={s.statsRow}>
          <View style={s.statBox}>
            <Text style={s.statNum}>50K+</Text>
            <Text style={s.statLbl}>users</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statBox}>
            <Text style={s.statNum}>₹2Cr+</Text>
            <Text style={s.statLbl}>tracked</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statBox}>
            <Text style={s.statNum}>4.8★</Text>
            <Text style={s.statLbl}>rated</Text>
          </View>
        </View>

        {/* 3 Pillars */}
        <Text style={s.sectionLbl}>WHAT WE STAND FOR</Text>
        <View style={s.pillarList}>
          {[
            { icon: 'shield-checkmark', tint: '#059669', bg: '#D1FAE5', t: 'Your data, your wallet', d: 'RBI-aligned · AES-256 encrypted · never shared.' },
            { icon: 'flash', tint: '#F56E1E', bg: '#FFEDD5', t: 'AI that gets India', d: '5 specialised agents · UPI · SIP · splits · coaching.' },
            { icon: 'heart', tint: '#DB2777', bg: '#FCE7F3', t: 'No dark patterns ever', d: 'Flat pricing · ₹150 cap · real unsubscribe.' },
          ].map((p, i) => (
            <View key={i} style={s.pillarRow}>
              <View style={[s.pillarIcon, { backgroundColor: p.bg }]}>
                <Ionicons name={p.icon as any} size={17} color={p.tint} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.pillarT}>{p.t}</Text>
                <Text style={s.pillarD}>{p.d}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Links */}
        <View style={s.links}>
          <TouchableOpacity style={s.link} onPress={() => Linking.openURL('https://mintu.app/privacy')} activeOpacity={0.8}>
            <Text style={s.linkTxt}>Privacy</Text>
          </TouchableOpacity>
          <View style={s.linkDot} />
          <TouchableOpacity style={s.link} onPress={() => Linking.openURL('https://mintu.app/terms')} activeOpacity={0.8}>
            <Text style={s.linkTxt}>Terms</Text>
          </TouchableOpacity>
          <View style={s.linkDot} />
          <TouchableOpacity style={s.link} onPress={() => Linking.openURL('https://mintu.app')} activeOpacity={0.8}>
            <Text style={s.linkTxt}>mintu.app</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.versionTxt}>Made with ❤️ in Bengaluru · v{VERSION}</Text>
        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.bg.primary },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: c.border.subtle },
  title: { fontSize: 20, fontWeight: '900', color: c.text.primary, letterSpacing: -0.3 },
  scroll: { padding: SPACING.lg, gap: 16 },

  hero: { borderRadius: 22, padding: 22, overflow: 'hidden' },
  heroBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.22)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  heroFlag: { fontSize: 12 },
  heroBadgeTxt: { fontSize: 10, fontWeight: '900', color: '#fff', letterSpacing: 1 },
  heroHook: { fontSize: 22, fontWeight: '900', color: '#fff', letterSpacing: -0.5, marginTop: 12 },
  heroHook2: { fontSize: 22, fontWeight: '900', color: '#FDE68A', letterSpacing: -0.5, marginTop: 1 },
  heroSub: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.9)', marginTop: 10, lineHeight: 19 },

  sectionLbl: { fontSize: 10.5, fontWeight: '900', color: c.text.muted, letterSpacing: 1.2, marginTop: 2, marginBottom: -4 },

  storyCard: { backgroundColor: c.bg.secondary, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: c.border.subtle, flexDirection: 'row', gap: 10 },
  storyEmoji: { fontSize: 24, marginTop: -2 },
  storyTxt: { flex: 1, fontSize: 13, color: c.text.secondary, lineHeight: 20, fontWeight: '500' },
  storyBold: { fontWeight: '900', color: c.text.primary },

  statsRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.bg.secondary, borderRadius: 14, paddingVertical: 14, borderWidth: 1, borderColor: c.border.subtle },
  statBox: { flex: 1, alignItems: 'center', gap: 2 },
  statNum: { fontSize: 20, fontWeight: '900', color: c.accent.primary, letterSpacing: -0.5 },
  statLbl: { fontSize: 10.5, fontWeight: '800', color: c.text.muted, letterSpacing: 0.5, textTransform: 'uppercase' },
  statDivider: { width: 1, height: 30, backgroundColor: c.border.subtle },

  pillarList: { gap: 8 },
  pillarRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, backgroundColor: c.bg.secondary, borderWidth: 1, borderColor: c.border.subtle },
  pillarIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  pillarT: { fontSize: 13.5, fontWeight: '900', color: c.text.primary, letterSpacing: -0.2 },
  pillarD: { fontSize: 11.5, color: c.text.secondary, marginTop: 2, fontWeight: '600' },

  links: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 8 },
  link: { paddingVertical: 6 },
  linkTxt: { fontSize: 12, fontWeight: '700', color: c.accent.primary },
  linkDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: c.text.muted },

  versionTxt: { textAlign: 'center', fontSize: 11, color: c.text.muted, marginTop: 6, fontWeight: '600' },
}));
