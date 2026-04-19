/**
 * AboutMintU Modal — app info + legal links + trust signals.
 * Legal pages (Privacy Policy, Terms, Data Protection) are now nested here
 * instead of cluttering the Profile Settings list.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Linking, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../utils/theme';

type Props = { visible: boolean; onClose: () => void };

const APP_VERSION = '2.0.0';

const openLegal = (onClose: () => void, page: 'privacy' | 'terms' | 'data-protection') => {
  onClose();
  // slight delay so modal dismiss animation completes before route push
  setTimeout(() => router.push(`/legal/${page}` as any), 150);
};

export default function AboutMintU({ visible, onClose }: Props) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <Text style={s.title}>About MintU</Text>
          <TouchableOpacity onPress={onClose} style={s.closeBtn}>
            <Ionicons name="close" size={22} color={COLORS.text.primary} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {/* Logo + tagline */}
          <View style={s.logoCard}>
            <View style={s.logoCircle}>
              <Text style={s.logoText}>M</Text>
            </View>
            <Text style={s.appName}>MintU</Text>
            <Text style={s.tagline}>India's smartest money app 🇮🇳</Text>
            <View style={s.versionPill}>
              <Text style={s.versionText}>Version {APP_VERSION}</Text>
            </View>
          </View>

          {/* Mission */}
          <View style={s.card}>
            <Text style={s.cardHead}>Our mission</Text>
            <Text style={s.cardBody}>
              Help every Indian track money effortlessly, save smarter, and build long-term wealth — without the noise.
            </Text>
          </View>

          {/* Trust signals */}
          <View style={s.sectionHead}>
            <Text style={s.sectionTitle}>Trust & Security</Text>
          </View>
          <Row icon="shield-checkmark" color="#10B981" title="Bank-grade encryption" sub="AES-256 at rest · TLS 1.3 in transit" />
          <Row icon="server" color="#059669" title="India servers" sub="Data stored in India per RBI localization" />
          <Row icon="lock-closed" color="#E65100" title="No data selling" sub="Your money data never leaves MintU" />
          <Row icon="eye-off" color={COLORS.accent.primary} title="Minimal data collection" sub="We only ask for what we actually use" />

          {/* Legal section */}
          <View style={s.sectionHead}>
            <Text style={s.sectionTitle}>Legal</Text>
          </View>
          <LinkRow icon="document-text" color={COLORS.accent.primary} title="Privacy Policy" sub="How we handle your data" onPress={() => openLegal(onClose, 'privacy')} />
          <LinkRow icon="reader" color={COLORS.accent.primary} title="Terms of Service" sub="Rules for using MintU" onPress={() => openLegal(onClose, 'terms')} />
          <LinkRow icon="shield-half" color={COLORS.accent.moneyIn} title="Data Protection" sub="IT Act 2000 & RBI compliance" onPress={() => openLegal(onClose, 'data-protection')} />

          {/* Contact */}
          <View style={s.sectionHead}>
            <Text style={s.sectionTitle}>Get in touch</Text>
          </View>
          <LinkRow icon="mail" color="#E65100" title="Support" sub="support@mintu.app" onPress={() => Linking.openURL('mailto:support@mintu.app')} />
          <LinkRow icon="globe" color="#1976D2" title="Website" sub="mintu.app" onPress={() => Linking.openURL('https://mintu.app')} />
          <LinkRow icon="logo-whatsapp" color="#25D366" title="WhatsApp updates" sub="Get product updates" onPress={() => Linking.openURL('https://wa.me/919999999999')} />

          {/* Footer */}
          <View style={s.footer}>
            <Text style={s.madeIn}>🇮🇳 Made with ❤️ in India</Text>
            <Text style={s.copyright}>© {new Date().getFullYear()} MintU Technologies Pvt Ltd</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const Row = ({ icon, color, title, sub }: { icon: string; color: string; title: string; sub: string }) => (
  <View style={s.row}>
    <View style={[s.rowIcon, { backgroundColor: color + '18' }]}><Ionicons name={icon as any} size={18} color={color} /></View>
    <View style={{ flex: 1 }}>
      <Text style={s.rowTitle}>{title}</Text>
      <Text style={s.rowSub}>{sub}</Text>
    </View>
  </View>
);

const LinkRow = ({ icon, color, title, sub, onPress }: { icon: string; color: string; title: string; sub: string; onPress: () => void }) => (
  <TouchableOpacity style={s.row} onPress={onPress} activeOpacity={0.7}>
    <View style={[s.rowIcon, { backgroundColor: color + '18' }]}><Ionicons name={icon as any} size={18} color={color} /></View>
    <View style={{ flex: 1 }}>
      <Text style={s.rowTitle}>{title}</Text>
      <Text style={s.rowSub}>{sub}</Text>
    </View>
    <Ionicons name="chevron-forward" size={16} color={COLORS.text.muted} />
  </TouchableOpacity>
);

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg.primary },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border.subtle, backgroundColor: '#fff' },
  title: { flex: 1, fontSize: 17, fontWeight: '800', color: COLORS.text.primary },
  closeBtn: { padding: 6 },
  scroll: { padding: 16, paddingBottom: 40 },

  logoCard: { alignItems: 'center', padding: 24, backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: COLORS.border.card, marginBottom: 16 },
  logoCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.accent.primary, justifyContent: 'center', alignItems: 'center' },
  logoText: { fontSize: 36, fontWeight: '900', color: '#fff' },
  appName: { fontSize: 24, fontWeight: '900', color: COLORS.text.primary, marginTop: 12 },
  tagline: { fontSize: 13, color: COLORS.text.secondary, marginTop: 4 },
  versionPill: { marginTop: 12, paddingHorizontal: 12, paddingVertical: 4, backgroundColor: COLORS.bg.elevated, borderRadius: 999 },
  versionText: { fontSize: 11, fontWeight: '700', color: COLORS.text.muted },

  card: { padding: 16, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: COLORS.border.card, marginBottom: 16 },
  cardHead: { fontSize: 14, fontWeight: '800', color: COLORS.text.primary, marginBottom: 6 },
  cardBody: { fontSize: 13, color: COLORS.text.secondary, lineHeight: 19 },

  sectionHead: { marginTop: 8, marginBottom: 8, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 12, fontWeight: '800', color: COLORS.text.muted, letterSpacing: 0.8 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: COLORS.border.card, marginBottom: 8 },
  rowIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text.primary },
  rowSub: { fontSize: 11, color: COLORS.text.muted, marginTop: 2 },

  footer: { marginTop: 24, alignItems: 'center', gap: 4 },
  madeIn: { fontSize: 13, fontWeight: '700', color: COLORS.text.primary },
  copyright: { fontSize: 11, color: COLORS.text.muted },
});
