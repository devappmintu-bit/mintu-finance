/**
 * MoreSettingsSheet — CONFIGURATION ONLY (per master spec v8).
 *
 * Strict rules applied:
 *   • No Achievements / Leaderboard (these moved to Profile's Progress Snapshot).
 *   • No duplicate sections.
 *   • Strict order: PLAN · SECURITY · PREFERENCES · INTEGRATIONS · SUPPORT.
 *   • Integrations explains state + permissions + clear CTA.
 *
 * (Danger Zone lives on the Profile screen, not here, to avoid duplication.)
 */
import React from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BSection from './BSection';
import BRow from './BRow';
import BButton from './BButton';
import { BR_COLORS, BR_SPACE, BR_TYPE, BR_BORDER } from '../../utils/brutalist';

export interface MoreSettingsSheetProps {
  isPro: boolean;
  bioLabel: string;
  bioHwAvail: boolean;
  bioOn: boolean;
  hasPinSet: boolean;
  appLockOn: boolean;
  langLabel?: string;
  gmailText?: string;
  gmailConnected?: boolean;

  onOpenPremium: () => void;
  onToggleBio?: () => void;
  onChangePin: () => void;
  onToggleAppLock: () => void;
  onOpenPreferences: () => void;
  onOpenNotifs: () => void;
  onGoGmail: () => void;
  onOpenHelp: () => void;
  onGoAbout: () => void;
}

export default function MoreSettingsSheet(p: MoreSettingsSheetProps) {
  const gmailText = (p.gmailText || '').toUpperCase();
  const gmailConnected = !!p.gmailConnected && !/^NOT/.test(gmailText);
  return (
    <ScrollView
      style={styles.bg}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      {/* Plan moved to Profile (monetization visibility). Support moved to Profile (trust layer). */}

      {/* 01 SECURITY */}
      <BSection index="01" title="Security">
        <View>
          <BRow
            first
            label={`${p.bioLabel} login`}
            value={!p.bioHwAvail ? 'Unavailable' : (p.bioOn ? 'ON' : 'OFF')}
            onPress={p.bioHwAvail ? p.onToggleBio : undefined}
          />
          <BRow
            label={p.hasPinSet ? 'Change mPIN' : 'Set mPIN'}
            onPress={p.onChangePin}
          />
          <BRow
            label="App lock on background"
            value={p.appLockOn ? 'ON' : 'OFF'}
            onPress={p.onToggleAppLock}
          />
        </View>
      </BSection>

      {/* 02 PREFERENCES */}
      <BSection index="02" title="Preferences">
        <View>
          <BRow first label="Language" value={p.langLabel} onPress={p.onOpenPreferences} />
          <BRow label="Notifications" onPress={p.onOpenNotifs} />
        </View>
      </BSection>

      {/* 03 INTEGRATIONS */}
      <BSection index="03" title="Integrations">
        <View style={styles.integrationCard}>
          <View style={styles.integrationHeader}>
            <View style={styles.integrationIcon}>
              <Ionicons name="logo-google" size={16} color={BR_COLORS.ink} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[BR_TYPE.bodyBold]}>Gmail auto-import</Text>
              <Text style={[BR_TYPE.meta]}>Auto-detect bills + statements from your inbox</Text>
            </View>
            <View style={[styles.statusPill, gmailConnected ? styles.statusOn : styles.statusOff]}>
              <Text style={[styles.statusText, { color: gmailConnected ? '#fff' : BR_COLORS.ink }]}>
                {(p.gmailText || (gmailConnected ? 'LINKED' : 'NOT LINKED')).toUpperCase()}
              </Text>
            </View>
          </View>

          <View style={styles.permsBox}>
            <Text style={[BR_TYPE.labelSm, { color: BR_COLORS.muted, marginBottom: 6 }]}>WE READ ONLY:</Text>
            <PermLine text="Bill receipts (electricity, telecom, OTT)" />
            <PermLine text="Bank & card statement summaries" />
            <PermLine text="Payment confirmations from merchants" />
            <Text style={[BR_TYPE.meta, { marginTop: BR_SPACE.sm, color: BR_COLORS.muted }]}>
              We never read personal email. Revoke anytime in Google account.
            </Text>
          </View>

          <BButton
            label={gmailConnected ? 'MANAGE  →' : 'CONNECT GMAIL  →'}
            variant={gmailConnected ? 'ink' : 'accent'}
            onPress={p.onGoGmail}
            style={{ marginTop: BR_SPACE.md }}
          />
        </View>
      </BSection>

      <View style={{ height: 32 }} />
      <Text style={[BR_TYPE.labelSm, { color: BR_COLORS.muted, textAlign: 'center' }]}>
        BANK-GRADE · DATA IN INDIA
      </Text>
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

function PermLine({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 4 }}>
      <Ionicons name="checkmark" size={12} color={BR_COLORS.positive} style={{ marginTop: 3, marginRight: 6 }} />
      <Text style={[BR_TYPE.body, { fontSize: 13, color: BR_COLORS.ink, flex: 1 }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: BR_COLORS.paper },
  scroll: { paddingHorizontal: BR_SPACE.lg, paddingBottom: 40 },

  proCard: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: BR_SPACE.md, paddingVertical: BR_SPACE.md,
    borderColor: BR_COLORS.line, borderWidth: BR_BORDER.hair,
    backgroundColor: BR_COLORS.paper,
  },

  integrationCard: {
    paddingVertical: BR_SPACE.md,
  },
  integrationHeader: { flexDirection: 'row', alignItems: 'center', gap: BR_SPACE.md },
  integrationIcon: {
    width: 32, height: 32,
    borderColor: BR_COLORS.ink, borderWidth: BR_BORDER.hair,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  statusPill: {
    paddingHorizontal: 8, paddingVertical: 4,
    borderColor: BR_COLORS.ink, borderWidth: BR_BORDER.hair,
  },
  statusOn:  { backgroundColor: BR_COLORS.positive },
  statusOff: { backgroundColor: BR_COLORS.paperAlt },
  statusText: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },

  permsBox: {
    marginTop: BR_SPACE.md,
    padding: BR_SPACE.md,
    borderColor: BR_COLORS.line, borderWidth: BR_BORDER.hair,
    backgroundColor: '#fff',
  },
});
