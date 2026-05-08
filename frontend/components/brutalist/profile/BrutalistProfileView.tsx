/**
 * BrutalistProfileView — v10 · "Control Center" master spec.
 *
 * Ownership reset: Profile is no longer a mini-app. It is a
 * **Control Center**. Everything motivational / insight / action-based
 * was moved OUT (to Home / Coach / Rewards). This view owns:
 *
 *   01  HEADER              Avatar + name + phone + Edit
 *   02  QUICK CONTROLS      Payments · Goals · Progress (compact chips)
 *   03  ACCOUNT             Name · Phone · Email
 *   04  SECURITY            Trusted devices · mPIN · Biometric · App lock
 *   05  MONEY               Payments · Bank connections · Gmail auto-import
 *   06  PREFERENCES         Language · Notifications
 *   07  HELP                Help & support · About MintU
 *   08  DANGER ZONE         Log out · Delete account
 *
 * Visual language (strict):
 *   • No cards. No shadows. No BlurView.
 *   • Section header = small caps "— ACCOUNT" over a hairline.
 *   • Rows = Label | Value | > with 1px inner + 2px outer ink borders.
 *   • Danger zone = outline red, no fill.
 */
import React from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, RefreshControl, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { router } from 'expo-router';

import { BR_COLORS, BR_SPACE, BR_TYPE, BR_BORDER } from '../../../utils/brutalist';
import PremiumPlanSection from '../../profile/PremiumPlanSection';
// Round 100X — Mascot evolution surface on Profile. Honestly gated:
// hidden for txnCount === 0 (cold-start), then evolves Spark → Saver
// → Sage → Legend based on REAL streak days. Tier is earned, not faked.
import MascotLevelCard from '../../mascot/MascotLevelCard';
// Round 100Z — Light/Dark/System theme toggle for the new
// Neo-Brutalism palette. Lives under "PREFERENCES" in the Profile.
import NBThemeToggle from '../../neo/NBThemeToggle';

// R100I — soft-route helper. New Profile rows reference screens
// that may not exist yet (export, feedback, rate, permissions).
// Instead of crashing into +not-found, we show a polite "Coming
// soon" toast — keeping the section visible while signalling that
// the affordance is real and on the roadmap.
const softRoute = (path: string, fallbackTitle: string) => () => {
  try { router.push(path as any); }
  catch {
    Toast.show({
      type: 'info',
      text1: fallbackTitle,
      text2: 'Coming soon',
      position: 'bottom',
    });
  }
};
const openStoreReview = () => {
  const url = Platform.OS === 'ios'
    ? 'itms-apps://apps.apple.com/app/id0000000000?action=write-review'
    : 'market://details?id=app.mintu';
  Linking.openURL(url).catch(() => {
    Toast.show({ type: 'info', text1: 'Rate MintU', text2: 'Coming soon to your store', position: 'bottom' });
  });
};

// ─── Props ──────────────────────────────────────────────────────────
export interface BrutalistProfileProps {
  // identity
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  avatar?: string | null;

  // security state
  bioLabel: string;
  bioHwAvail: boolean;
  bioOn: boolean;
  hasPinSet: boolean;
  appLockOn: boolean;

  // integrations / prefs
  langLabel?: string;
  gmailText?: string;
  gmailConnected?: boolean;

  // plumbing
  refreshing: boolean;
  onRefresh: () => void;

  // callbacks
  onEditAvatar: () => void;
  onEditName: () => void;
  onOpenProfileSheet: () => void;
  onEditEmail?: () => void;

  onOpenPaymentMethods: () => void;
  onGoGoals: () => void;
  onGoRewards: () => void;
  onGoBankConnections?: () => void;
  /**
   * Round 99C — Subscriptions screen. Optional so legacy callsites
   * (older simulators / tests that never wire it) keep compiling;
   * the row simply no-ops if absent.
   */
  onGoSubscriptions?: () => void;

  onOpenTrustedDevices: () => void;
  onChangePin: () => void;
  onToggleBio?: () => void;
  onToggleAppLock: () => void;

  onOpenPreferences: () => void;
  onOpenNotifs: () => void;
  onGoGmail: () => void;

  onOpenHelp: () => void;
  onGoAbout: () => void;

  onLogout: () => void;
  onGoDeleteAccount: () => void;

  /**
   * R100G — Premium card was moved OUT of Home into Profile per user
   * directive ("Move the premium card to profile without fail").
   * Optional so legacy callsites that haven't wired the route yet
   * still compile; the section degrades to a no-op tap if absent.
   */
  onGoPremium?: () => void;

  /** R100T — gate for monetization surfaces (Premium plan card).
   *  When false, suppresses the upsell so cold-start users see Profile
   *  as a clean Control Center, not a paywall. Default true (legacy). */
  showUpsells?: boolean;
}

// ─── Component ──────────────────────────────────────────────────────
export default function BrutalistProfileView(p: BrutalistProfileProps) {
  const name = (p.name || 'You').trim();
  const first = name.split(' ')[0];
  const initial = name.charAt(0).toUpperCase();
  const phone = p.phone || '';

  const gmailText = (p.gmailText || (p.gmailConnected ? 'LINKED' : 'NOT LINKED')).toUpperCase();
  const bioValue = !p.bioHwAvail
    ? 'UNAVAILABLE'
    : (p.bioOn ? 'ON' : 'OFF');
  const appLockValue = p.appLockOn ? 'ON' : 'OFF';
  const pinValue = p.hasPinSet ? 'SET' : 'NOT SET';

  return (
    <SafeAreaView style={styles.bg} edges={['top']}>
      <ScrollView
        style={styles.bg}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={p.refreshing}
            onRefresh={p.onRefresh}
            tintColor={BR_COLORS.ink}
          />
        }
      >
        {/* ══════ 01 ACCOUNT — Avatar card + identity merged ═══════ */}
        <SectionHeader title="Account" />
        <View style={styles.accountCard}>
          <Pressable
            onPress={p.onOpenProfileSheet}
            onLongPress={p.onEditAvatar}
            delayLongPress={350}
            hitSlop={8}
            testID="avatar-node"
            style={styles.avatarWrap}
          >
            {p.avatar ? (
              <Image source={{ uri: p.avatar }} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarLetter}>{initial}</Text>
              </View>
            )}
          </Pressable>

          <View style={styles.headerBody}>
            <Pressable onPress={p.onEditName} testID="profile-edit-name" hitSlop={4}>
              <Text style={styles.nameTxt} numberOfLines={1}>{first.toUpperCase()}</Text>
            </Pressable>
            {phone ? (
              <Text style={styles.phoneTxt} numberOfLines={1}>{phone}</Text>
            ) : null}
            <Pressable
              onPress={p.onEditEmail}
              testID="profile-edit-email"
              hitSlop={4}
              style={styles.emailRow}
            >
              {/* R100U — When no email is set, show a soft optional hint
                  instead of a bare "Add email" placeholder that read like
                  the app was demanding more from the user without reason. */}
              <Text
                style={[
                  styles.emailTxt,
                  !p.email && { color: BR_COLORS.quiet },
                ]}
                numberOfLines={1}
              >
                {p.email || 'Email — optional, for receipts'}
              </Text>
            </Pressable>
          </View>

          <Pressable
            onPress={p.onEditName}
            testID="profile-edit"
            hitSlop={8}
            style={({ pressed }) => [
              styles.editChip,
              pressed && { backgroundColor: BR_COLORS.paperAlt },
            ]}
          >
            <Text style={styles.editTxt}>EDIT</Text>
          </Pressable>
        </View>

        {/* ══════ 02 QUICK CONTROLS — compact 3-chip row ════════════ */}
        {/* R100U — Renamed "Progress" → "Reports". "Progress" was
            ambiguous (progress on what? goals? mission? streaks?) and
            duplicated meaning with the Goals chip next to it. "Reports"
            is unambiguous and matches what the destination actually shows. */}
        <View style={styles.chipRow}>
          <Chip icon="card-outline"   label="Payments" onPress={p.onOpenPaymentMethods} testID="chip-payments" />
          <Chip icon="flag-outline"   label="Goals"    onPress={p.onGoGoals}           testID="chip-goals" />
          <Chip icon="bar-chart-outline" label="Reports" onPress={p.onGoRewards}        testID="chip-progress" />
        </View>

        {/* ══════ 02b PLAN — Premium card (R100G + R100T gate) ═══════
            R100T — Suppressed for cold-start users. The Premium upsell
            now only renders for users who have crossed the "earned the
            pitch" threshold (≥3 txns OR ≥1 budget OR ≥1 split group).
            New users see Profile without an upgrade pitch they can't
            even contextualize yet. */}
        {p.showUpsells !== false ? (
          <PremiumPlanSection onPress={p.onGoPremium} />
        ) : null}

        {/* ══════ R100X · MASCOT EVOLUTION ══════════════════════════════
            Mintu's progression card (Spark → Saver → Sage → Legend).
            Self-gates via txnCount === 0 → returns null. The view is
            inserted between Premium and Security so it sits in the
            "rewards/identity" zone of the Profile, not the utility
            zone. Tier is earned from REAL streak days only. */}
        <MascotLevelCard />

        {/* ══════ 03 SECURITY ═══════════════════════════════════════ */}
        {/* R100U — Added one-line subtitles to demystify mPIN vs App lock
            vs Biometric. Three lock concepts on one screen confused
            first-time users ("which one is which?"). Now each row tells
            you what it is and when it triggers, in plain language. */}
        <Section title="Security">
          <Row label="Trusted devices" onPress={p.onOpenTrustedDevices} testID="row-devices" />
          <Row
            label={p.hasPinSet ? 'Change mPIN' : 'Set mPIN'}
            value={pinValue}
            sub="4-digit code · used when biometric fails"
            onPress={p.onChangePin}
            testID="row-pin"
          />
          <Row
            label={`${p.bioLabel} login`}
            value={bioValue}
            sub="Face / fingerprint to open MintU"
            onPress={p.bioHwAvail ? p.onToggleBio : undefined}
            testID="row-bio"
          />
          <Row
            label="App lock"
            value={appLockValue}
            sub="Re-asks for unlock when you reopen the app"
            onPress={p.onToggleAppLock}
            last
            testID="row-app-lock"
          />
        </Section>

        {/* ══════ 04 MONEY & LINKED ACCOUNTS (merged R100U) ════════════
            Previously this lived in two adjacent sections (MONEY and
            LINKED ACCOUNTS). They cover the same conceptual area —
            "what is connected to my money" — so we collapsed them into
            one. Reduces total Profile sections from 9 → 8 and removes
            a duplicate Gmail row that confused users. */}
        <Section title="Money & linked accounts">
          <Row
            label="Bank connections"
            onPress={p.onGoBankConnections || p.onOpenPaymentMethods}
            testID="row-banks"
          />
          <Row
            label="Subscriptions"
            value="Your subscriptions"
            onPress={p.onGoSubscriptions}
            testID="row-subscriptions"
          />
          <Row
            label="Auto-import (Gmail)"
            value={p.gmailConnected ? 'CONNECTED' : 'NOT LINKED'}
            muted={!p.gmailConnected}
            sub="Reads bank alerts only — never personal mail"
            onPress={p.onGoGmail}
            testID="row-gmail"
          />
          <Row
            label="UPI ID"
            value="Add for instant settlements"
            muted
            onPress={p.onOpenPaymentMethods}
            last
            testID="row-upi"
          />
        </Section>

        {/* ══════ 06 PREFERENCES ════════════════════════════════════ */}
        <Section title="Preferences">
          <Row label="Language" value={p.langLabel || 'English'} onPress={p.onOpenPreferences} testID="row-lang" />
          <Row label="Notifications" onPress={p.onOpenNotifs} last testID="row-notifs" />
        </Section>

        {/* Round 100Z — Light/Dark/System theme toggle for the new
            Neo-Brutalism palette. Sits in Preferences as a segmented
            control, not a Row, because it's a 3-state selector. */}
        <NBThemeToggle />

        {/* ══════ 06b PRIVACY & PERMISSIONS — R100I ════════════════ */}
        {/* User feedback: Profile Control Center was missing critical
            sections (privacy, permissions, data export, linked
            accounts). These sit between Preferences and Help. */}
        <Section title="Privacy & Permissions">
          <Row
            label="App permissions"
            value="Camera · SMS · Notifications"
            onPress={softRoute('/profile/permissions', 'App permissions')}
            testID="row-permissions"
          />
          <Row
            label="Privacy policy"
            onPress={softRoute('/legal/privacy', 'Privacy policy')}
            testID="row-privacy"
          />
          <Row
            label="Terms of service"
            onPress={softRoute('/legal/terms', 'Terms of service')}
            testID="row-terms"
          />
          <Row
            label="Export my data"
            value="JSON · CSV"
            onPress={softRoute('/profile/export-data', 'Export my data')}
            last
            testID="row-export"
          />
        </Section>

        {/* ══════ 06c LINKED ACCOUNTS — merged into Money section above (R100U) ══════ */}

        {/* ══════ 07 HELP ═══════════════════════════════════════════ */}
        <Section title="Help">
          <Row label="Help & support" onPress={p.onOpenHelp} testID="row-help" />
          <Row
            label="Send feedback"
            onPress={softRoute('/profile/feedback', 'Send feedback')}
            testID="row-feedback"
          />
          <Row
            label="Rate MintU"
            value="Help us grow"
            onPress={openStoreReview}
            testID="row-rate"
          />
          <Row label="About MintU" onPress={p.onGoAbout} last testID="row-about" />
        </Section>

        {/* ══════ 07b LOG OUT ═══════════════════════════════════════
            R100T — Logout pulled OUT of Danger Zone. Logging out is
            a normal, recoverable action; pairing it next to "Delete
            account" inflated anxiety for no reason. It now sits in
            its own neutral row above the danger zone. */}
        <View style={{ marginTop: BR_SPACE.xl }}>
          <SectionHeader title="Account" />
          <View style={{ marginTop: BR_SPACE.md }}>
            <Row
              label="Log out"
              value="See you soon"
              onPress={p.onLogout}
              last
              testID="row-logout"
            />
          </View>
        </View>

        {/* ══════ 08 DANGER ZONE ════════════════════════════════════
            Now contains only truly destructive, irreversible actions. */}
        <View style={{ marginTop: BR_SPACE.xl }}>
          <SectionHeader title="Danger zone" danger />
          <View style={{ marginTop: BR_SPACE.md, gap: BR_SPACE.sm }}>
            <DangerBtn label="Delete account" onPress={p.onGoDeleteAccount}  testID="danger-delete" />
          </View>
        </View>

        {/* FOOTER */}
        <View style={styles.footer}>
          <View style={styles.footerRule} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: BR_SPACE.sm }}>
            <Text style={[BR_TYPE.labelSm, { color: BR_COLORS.muted }]}>BANK-GRADE · DATA STAYS IN INDIA</Text>
            <Text style={[BR_TYPE.labelSm, { color: BR_COLORS.muted }]}>V1.0.0</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────

function SectionHeader({ title, danger }: { title: string; danger?: boolean }) {
  const color = danger ? BR_COLORS.negative : BR_COLORS.muted;
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTxt, { color }]}>— {title.toUpperCase()}</Text>
      <View style={[styles.sectionRule, danger && { backgroundColor: BR_COLORS.negative }]} />
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: BR_SPACE.xl }}>
      <SectionHeader title={title} />
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Row({
  label, value, sub, onPress, muted, last, testID,
}: {
  label: string;
  value?: string;
  /** R100U — Optional one-line clarifier shown below the label.
   *  Used to demystify dense settings rows (e.g. "mPIN", "App lock")
   *  where a 1-word label isn't enough for first-time users. */
  sub?: string;
  onPress?: () => void;
  muted?: boolean;
  last?: boolean;
  testID?: string;
}) {
  const content = (
    <View style={[styles.row, !last && styles.rowDivider]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[BR_TYPE.body, styles.rowLabel]} numberOfLines={1}>
          {label}
        </Text>
        {sub ? (
          <Text
            style={{
              fontSize: 11,
              color: BR_COLORS.quiet,
              marginTop: 2,
              lineHeight: 14,
            }}
            numberOfLines={1}
          >
            {sub}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text
          style={[
            BR_TYPE.meta,
            styles.rowValue,
            { color: muted ? BR_COLORS.quiet : BR_COLORS.muted },
          ]}
          numberOfLines={1}
        >
          {value}
        </Text>
      ) : null}
      {onPress ? (
        <Ionicons name="chevron-forward" size={14} color={BR_COLORS.ink} style={{ marginLeft: 6 }} />
      ) : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [pressed && { backgroundColor: BR_COLORS.paperAlt }]}
    >
      {content}
    </Pressable>
  );
}

function Chip({
  icon, label, onPress, testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.chip,
        pressed && { backgroundColor: BR_COLORS.paperAlt },
      ]}
    >
      <Ionicons name={icon} size={16} color={BR_COLORS.ink} />
      <Text style={styles.chipTxt} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

function DangerBtn({
  label, onPress, testID,
}: {
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.dangerBtn,
        pressed && { backgroundColor: '#FBEAEA' },
      ]}
    >
      <Text style={styles.dangerBtnTxt}>{label.toUpperCase()}</Text>
    </Pressable>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: BR_COLORS.paper },
  scroll: { paddingHorizontal: BR_SPACE.lg, paddingTop: BR_SPACE.sm, paddingBottom: 140 },

  // 01 ACCOUNT CARD — Avatar + identity (merged from prior header)
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: BR_SPACE.md,
    paddingHorizontal: BR_SPACE.md,
    borderTopWidth: BR_BORDER.bold,
    borderBottomWidth: BR_BORDER.bold,
    borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.paper,
    marginTop: BR_SPACE.md,
    marginBottom: BR_SPACE.lg,
  },
  avatarWrap: { position: 'relative' },
  avatar: {
    width: 56, height: 56,
    borderWidth: BR_BORDER.bold, borderColor: BR_COLORS.ink,
    borderRadius: 0,
  },
  avatarFallback: {
    backgroundColor: BR_COLORS.paperAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarLetter: { fontSize: 20, fontWeight: '900', color: BR_COLORS.ink },

  headerBody: { flex: 1, paddingLeft: BR_SPACE.md },
  nameTxt: {
    fontSize: 22, lineHeight: 24, fontWeight: '900', letterSpacing: -0.5,
    color: BR_COLORS.ink,
  },
  phoneTxt: {
    ...BR_TYPE.meta,
    color: BR_COLORS.muted,
    marginTop: 4,
  },
  emailRow: {
    marginTop: 2,
  },
  emailTxt: {
    ...BR_TYPE.meta,
    color: BR_COLORS.muted,
  },

  editChip: {
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: BR_BORDER.hair, borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.paper,
  },
  editTxt: {
    fontSize: 10, fontWeight: '800', letterSpacing: 1.5,
    color: BR_COLORS.ink,
  },

  // 02 QUICK CONTROLS — 3 equal chips
  chipRow: {
    flexDirection: 'row',
    borderWidth: BR_BORDER.hair,
    borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.paper,
  },
  chip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRightWidth: BR_BORDER.hair,
    borderColor: BR_COLORS.ink,
  },
  chipTxt: {
    ...BR_TYPE.body,
    fontSize: 13, fontWeight: '700',
    color: BR_COLORS.ink,
  },

  // Section header — small caps + hairline
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: BR_SPACE.sm,
  },
  sectionTxt: {
    fontSize: 10, fontWeight: '800', letterSpacing: 2,
  },
  sectionRule: {
    flex: 1,
    height: BR_BORDER.hair,
    backgroundColor: BR_COLORS.line,
  },
  sectionBody: {
    marginTop: BR_SPACE.md,
    borderTopWidth: BR_BORDER.bold,
    borderBottomWidth: BR_BORDER.bold,
    borderColor: BR_COLORS.ink,
  },

  // Row — standardized
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: BR_SPACE.sm,
    minHeight: 52,
    backgroundColor: BR_COLORS.paper,
  },
  rowDivider: {
    borderBottomWidth: BR_BORDER.hair,
    borderColor: BR_COLORS.line,
  },
  rowLabel: {
    flex: 1,
    color: BR_COLORS.ink,
  },
  rowValue: {
    maxWidth: 160,
    textAlign: 'right',
    marginRight: 4,
  },

  // Danger zone
  dangerBtn: {
    paddingVertical: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: BR_BORDER.bold,
    borderColor: BR_COLORS.negative,
    backgroundColor: BR_COLORS.paper,
  },
  dangerBtnTxt: {
    fontSize: 12, fontWeight: '900', letterSpacing: 2,
    color: BR_COLORS.negative,
  },

  // Footer
  footer: { marginTop: BR_SPACE.xl },
  footerRule: { height: BR_BORDER.hair, backgroundColor: BR_COLORS.line },
});
