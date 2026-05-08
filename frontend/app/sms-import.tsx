/**
 * SMS Import — Live Scanning Experience (R106).
 *
 * The "magic moment" surface for the SMS → AUTO TRANSACTION ENGINE.
 * Visualises three trust pillars per the Trust Master Prompt:
 *   1. PRIVACY — text never leaves device unless user opts in
 *   2. CONFIDENCE — every parsed row is stamped with a tier
 *   3. PROVENANCE — duplicates / inferred dates / pending review
 *      are shown explicitly, never silently
 *
 * UX flow (3 steps):
 *   ① TRUST     — privacy primer + paste-area
 *   ② SCANNING  — neon "scan beam" sweeps a stack of SMS cards while
 *                 the bulk-parse call runs. Each card flips to its
 *                 resolved status (parsed / duplicate / pending /
 *                 failed) as soon as the response lands. A live
 *                 amount counter ticks up across the parsed batch.
 *   ③ RESULTS   — celebration screen with hard-stamp totals + CTA.
 *
 * Built atop the Brutal primitive library: BrutalCard, BrutalButton,
 * BrutalChip, BrutalInput, ConfidenceBadge.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import api from '../utils/api';
import {
  BrutalCard,
  BrutalButton,
  ConfidenceBadge,
  tierFromConfidence,
  BR_COLORS,
  BR_BORDER,
  BR_RADIUS,
  BR_SHADOW,
  BR_SPACE,
  BR_FONT,
  PALETTE,
} from '../components/brutal';
import { showBrutalToast } from '../store/brutalToastStore';

type Phase = 'trust' | 'scanning' | 'results';

type ScanResult = {
  status: 'parsed' | 'duplicate' | 'failed' | 'pending_review';
  amount?: number;
  category?: string;
  merchant?: string;
  type?: string;
  confidence?: number;
  date_inferred?: boolean;
  is_recurring?: boolean;
  last4?: string | null;
  reason?: string;
};

type CardState = {
  raw: string;
  state: 'queued' | 'scanning' | 'done';
  result?: ScanResult;
};

/* ─── Demo SMS used by the "Try sample" button. Mirrors backend
 *     SAMPLE_INDIAN_SMS but kept inline so the screen renders even
 *     before /api/sms/sample-inbox responds. */
const SAMPLE_SMS: string[] = [
  'Your A/c XX1234 is debited for Rs.450.00 on 15-Apr-26. Info: UPI/SWIGGY/Payment',
  'Rs.2500.00 credited to your A/c XX1234 on 15-Apr-26 by NEFT-SALARY-COMPANY',
  'ICICI Bank Acct XX9012 debited with Rs 1,200.00 on 14-APR-26; Info:AMAZON',
  'Rs.199 debited from your Axis Bank A/c for NETFLIX subscription',
  'Paid Rs.250 to PhonePe for BigBasket order',
  'Your HDFC A/c XX1234 debited Rs.3500.00 for Electricity Bill TATA POWER',
];

/** Split user paste into independent SMS messages.
 *  Splits on blank lines OR "---" dividers. Drops fragments < 10 chars. */
function splitMessages(raw: string): string[] {
  return raw
    .split(/\n\s*\n|^---$/gm)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);
}

/** Animated amount counter that smoothly ticks toward `value`. */
function useTickerValue(target: number, durationMs = 600) {
  const anim = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const id = anim.addListener(({ value }) => setDisplay(Math.round(value)));
    Animated.timing(anim, {
      toValue: target,
      duration: durationMs,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => anim.removeListener(id);
  }, [target, durationMs, anim]);
  return display;
}

/* ─────────────────────────────────────────────────────────────
 *  ScanBeam — neon orange line that sweeps top → bottom over the
 *  SMS card stack while the backend chews. Pure decorative.
 * ──────────────────────────────────────────────────────────── */
function ScanBeam({ active, height }: { active: boolean; height: number }) {
  const y = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) {
      y.stopAnimation();
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(y, {
          toValue: 1,
          duration: 1400,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(y, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, y]);

  if (!active) return null;
  const translateY = y.interpolate({ inputRange: [0, 1], outputRange: [0, Math.max(60, height)] });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.beam,
        {
          transform: [{ translateY }],
        },
      ]}
    />
  );
}

/* ─────────────────────────────────────────────────────────────
 *  ScanCard — visual representation of a single SMS being parsed.
 *  States: queued | scanning | done(parsed | duplicate | pending |
 *  failed). Flips look on state transition.
 * ──────────────────────────────────────────────────────────── */
function ScanCard({ card, index }: { card: CardState; index: number }) {
  const flip = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (card.state === 'done') {
      Animated.spring(flip, { toValue: 1, useNativeDriver: true, friction: 7 }).start();
    }
  }, [card.state, flip]);

  const r = card.result;
  const isParsed = r?.status === 'parsed';
  const isPending = r?.status === 'pending_review';
  const isDup = r?.status === 'duplicate';
  const isFail = r?.status === 'failed';

  const tone =
    isParsed ? PALETTE.lime :
    isPending ? PALETTE.peach :
    isDup ? PALETTE.lavender :
    isFail ? PALETTE.dangerSoft :
    PALETTE.paper;

  const stamp =
    isParsed ? 'PARSED' :
    isPending ? 'REVIEW' :
    isDup ? 'DUPE' :
    isFail ? 'SKIP' :
    card.state === 'scanning' ? 'SCAN' : 'QUEUED';

  const confidence = r?.confidence ?? 0;
  const tier = tierFromConfidence(confidence);

  return (
    <Animated.View
      style={[
        styles.scanCard,
        { backgroundColor: tone, opacity: card.state === 'queued' ? 0.6 : 1 },
        card.state === 'scanning' && styles.scanCardActive,
        { transform: [{ scale: flip.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }) }] },
      ]}
    >
      {/* Top row: index + status stamp */}
      <View style={styles.scanCardHead}>
        <View style={styles.indexChip}>
          <Text style={styles.indexChipText}>#{String(index + 1).padStart(2, '0')}</Text>
        </View>
        <View style={[styles.stampPill, isFail && { backgroundColor: PALETTE.danger }]}>
          <Text style={[styles.stampPillText, isFail && { color: '#fff' }]}>{stamp}</Text>
        </View>
      </View>

      {/* Raw SMS preview */}
      <Text style={styles.rawSms} numberOfLines={2}>
        {card.raw}
      </Text>

      {/* Resolved row (only after done) */}
      {card.state === 'done' && r && (isParsed || isPending) && (
        <View style={styles.resolvedRow}>
          <View style={styles.resolvedLeft}>
            <Text style={styles.resolvedAmt} numberOfLines={1}>
              {r.type === 'income' ? '+' : ''}₹{Math.round(r.amount || 0).toLocaleString('en-IN')}
            </Text>
            <Text style={styles.resolvedMerchant} numberOfLines={1}>
              {r.merchant || r.category || '—'}
              {r.last4 ? ` · ··${r.last4}` : ''}
            </Text>
          </View>
          <ConfidenceBadge tier={tier} expandable={false} />
        </View>
      )}

      {/* Honest flags */}
      {card.state === 'done' && r && (r.date_inferred || r.is_recurring) && (
        <View style={styles.flagsRow}>
          {r.date_inferred && (
            <View style={[styles.flagChip, { backgroundColor: PALETTE.warningSoft }]}>
              <Ionicons name="calendar-outline" size={10} color={BR_COLORS.ink} />
              <Text style={styles.flagChipText}>DATE INFERRED</Text>
            </View>
          )}
          {r.is_recurring && (
            <View style={[styles.flagChip, { backgroundColor: PALETTE.cyan }]}>
              <Ionicons name="repeat" size={10} color={BR_COLORS.ink} />
              <Text style={styles.flagChipText}>RECURRING</Text>
            </View>
          )}
        </View>
      )}

      {/* Active scan loader */}
      {card.state === 'scanning' && (
        <View style={styles.scanningHint}>
          <View style={styles.dotsRow}>
            <View style={[styles.tinyDot, styles.tinyDotPulse]} />
            <View style={[styles.tinyDot, styles.tinyDotPulse]} />
            <View style={[styles.tinyDot, styles.tinyDotPulse]} />
          </View>
          <Text style={styles.scanningHintText}>AI parsing…</Text>
        </View>
      )}
    </Animated.View>
  );
}

/* ─────────────────────────────────────────────────────────────
 *  Phase 1 — Trust primer + paste textarea
 * ──────────────────────────────────────────────────────────── */
function TrustPanel({
  paste,
  setPaste,
  onScan,
  onUseSample,
}: {
  paste: string;
  setPaste: (v: string) => void;
  onScan: () => void;
  onUseSample: () => void;
}) {
  const messages = useMemo(() => splitMessages(paste), [paste]);
  const count = messages.length;

  return (
    <ScrollView
      contentContainerStyle={styles.scrollPad}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* Hero */}
      <BrutalCard variant="accent" style={{ marginBottom: BR_SPACE['5'] }}>
        <Text style={styles.heroEyebrow}>SMS → AUTO TRANSACTIONS</Text>
        <Text style={styles.heroTitle}>Paste your bank{'\n'}SMS. We do the rest.</Text>
        <Text style={styles.heroSub}>
          Our AI reads bank notifications &amp; UPI alerts, extracts the amount, merchant, and category — and stamps every row with a confidence score.
        </Text>
      </BrutalCard>

      {/* Trust pillars */}
      <View style={styles.pillarsRow}>
        <BrutalCard variant="lime" flat style={styles.pillar}>
          <Ionicons name="lock-closed" size={18} color={BR_COLORS.ink} />
          <Text style={styles.pillarTitle}>PRIVATE</Text>
          <Text style={styles.pillarSub}>Text leaves only when you tap Scan.</Text>
        </BrutalCard>
        <BrutalCard variant="cyan" flat style={styles.pillar}>
          <Ionicons name="sparkles" size={18} color={BR_COLORS.ink} />
          <Text style={styles.pillarTitle}>CONFIDENCE</Text>
          <Text style={styles.pillarSub}>Every row is tier-stamped.</Text>
        </BrutalCard>
        <BrutalCard variant="peach" flat style={styles.pillar}>
          <Ionicons name="git-network" size={18} color={BR_COLORS.ink} />
          <Text style={styles.pillarTitle}>NO DUPES</Text>
          <Text style={styles.pillarSub}>Re-imports are silently skipped.</Text>
        </BrutalCard>
      </View>

      {/* Paste field */}
      <View style={styles.pasteHeader}>
        <Text style={styles.sectionLabel}>PASTE SMS MESSAGES</Text>
        <Pressable onPress={onUseSample} hitSlop={6}>
          <Text style={styles.linkText}>Try sample →</Text>
        </Pressable>
      </View>
      <View style={styles.textareaWrap}>
        <TextInput
          testID="sms-paste-input"
          value={paste}
          onChangeText={setPaste}
          placeholder={
            'Your A/c XX1234 debited Rs.450 UPI/SWIGGY ...\n\nPaste multiple — separate with a blank line.'
          }
          placeholderTextColor={BR_COLORS.textFaint}
          multiline
          textAlignVertical="top"
          style={styles.textarea}
        />
        <View style={styles.pasteFooter}>
          <Text style={styles.pasteCounter}>
            {count > 0 ? `${count} message${count === 1 ? '' : 's'} detected` : 'Awaiting paste…'}
          </Text>
          {!!paste && (
            <Pressable onPress={() => setPaste('')} hitSlop={6}>
              <Text style={styles.linkSub}>Clear</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Primary CTA */}
      <BrutalButton
        testID="sms-scan-cta"
        label={count > 0 ? `Scan ${count} message${count === 1 ? '' : 's'}` : 'Paste to scan'}
        tone="ink"
        size="lg"
        icon="scan-outline"
        fullWidth
        disabled={count === 0}
        onPress={onScan}
        style={{ marginTop: BR_SPACE['4'] }}
      />

      {/* Footnote — privacy honesty */}
      <Text style={styles.footnote}>
        We never store the raw SMS. We extract structured data (amount, merchant, date) and discard the text. Each parsed row is auditable from the transaction detail view.
      </Text>
    </ScrollView>
  );
}

/* ─────────────────────────────────────────────────────────────
 *  Phase 2 — Live Scanning
 * ──────────────────────────────────────────────────────────── */
function ScanningPanel({
  cards,
  total,
  doneCount,
  liveAmount,
  onCancel,
}: {
  cards: CardState[];
  total: number;
  doneCount: number;
  liveAmount: number;
  onCancel: () => void;
}) {
  const tickerAmt = useTickerValue(liveAmount, 600);
  const progress = total > 0 ? doneCount / total : 0;
  const heightEstimate = cards.length * 132;

  return (
    <View style={styles.scanScreen}>
      {/* Top bar — counter + cancel */}
      <View style={styles.scanHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.scanTitle}>SCANNING…</Text>
          <Text style={styles.scanSub}>
            {doneCount} of {total} processed
          </Text>
        </View>
        <Pressable onPress={onCancel} hitSlop={6} style={styles.cancelBtn}>
          <Ionicons name="close" size={18} color={BR_COLORS.ink} />
        </Pressable>
      </View>

      {/* Live amount counter */}
      <BrutalCard variant="highlight" style={styles.tickerCard}>
        <Text style={styles.tickerEyebrow}>EXTRACTED SO FAR</Text>
        <Text style={styles.tickerAmount}>
          ₹{tickerAmt.toLocaleString('en-IN')}
        </Text>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${Math.max(4, Math.round(progress * 100))}%` },
            ]}
          />
        </View>
      </BrutalCard>

      {/* Stack of SMS cards being processed */}
      <ScrollView
        contentContainerStyle={styles.scanList}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ position: 'relative' }}>
          <ScanBeam active={progress < 1} height={heightEstimate} />
          {cards.map((c, i) => (
            <ScanCard card={c} index={i} key={i} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────
 *  Phase 3 — Results
 * ──────────────────────────────────────────────────────────── */
function ResultsPanel({
  summary,
  cards,
  onScanMore,
}: {
  summary: {
    parsed: number;
    failed: number;
    duplicate: number;
    pending_review: number;
    recurring_detected: number;
    total: number;
  } | null;
  cards: CardState[];
  onScanMore: () => void;
}) {
  if (!summary) return null;
  const totalParsedAmt = cards.reduce(
    (a, c) =>
      a + (c.result && (c.result.status === 'parsed' || c.result.status === 'pending_review')
        ? Math.abs(c.result.amount || 0)
        : 0),
    0,
  );

  return (
    <ScrollView
      contentContainerStyle={styles.scrollPad}
      showsVerticalScrollIndicator={false}
    >
      {/* Celebration hero */}
      <BrutalCard variant="lime" style={{ marginBottom: BR_SPACE['5'], alignItems: 'center' }}>
        <Text style={styles.celebrateEyebrow}>SCAN COMPLETE</Text>
        <Text style={styles.celebrateAmount}>
          ₹{Math.round(totalParsedAmt).toLocaleString('en-IN')}
        </Text>
        <Text style={styles.celebrateSub}>
          {summary.parsed} transaction{summary.parsed === 1 ? '' : 's'} added to your ledger
        </Text>
      </BrutalCard>

      {/* Stat tiles */}
      <View style={styles.statGrid}>
        <StatTile label="PARSED" value={summary.parsed} tone={PALETTE.lime} />
        <StatTile label="REVIEW" value={summary.pending_review} tone={PALETTE.peach} />
        <StatTile label="DUPES" value={summary.duplicate} tone={PALETTE.lavender} />
        <StatTile label="SKIPPED" value={summary.failed} tone={PALETTE.dangerSoft} />
      </View>

      {summary.recurring_detected > 0 && (
        <BrutalCard variant="cyan" style={{ marginTop: BR_SPACE['4'] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="repeat" size={18} color={BR_COLORS.ink} />
            <Text style={[BR_FONT.h3, { color: BR_COLORS.ink }]}>
              {summary.recurring_detected} subscription{summary.recurring_detected === 1 ? '' : 's'} detected
            </Text>
          </View>
          <Text style={styles.cardSub}>
            We{`'`}ve flagged these as recurring. Review them in your Subscriptions hub.
          </Text>
        </BrutalCard>
      )}

      {summary.pending_review > 0 && (
        <BrutalCard variant="warm" style={{ marginTop: BR_SPACE['4'] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="alert-circle-outline" size={18} color={BR_COLORS.ink} />
            <Text style={[BR_FONT.h3, { color: BR_COLORS.ink }]}>
              {summary.pending_review} need a quick eyeball
            </Text>
          </View>
          <Text style={styles.cardSub}>
            These have low confidence. They{`'`}re saved as PENDING REVIEW so they don{`'`}t pollute your score until you confirm.
          </Text>
        </BrutalCard>
      )}

      {/* CTAs */}
      <View style={{ height: BR_SPACE['6'] }} />
      <BrutalButton
        label="View transactions"
        tone="accent"
        size="lg"
        icon="list-outline"
        fullWidth
        onPress={() => router.replace('/(tabs)/transactions' as any)}
      />
      <View style={{ height: BR_SPACE['3'] }} />
      <BrutalButton
        label="Scan more SMS"
        tone="paper"
        size="md"
        icon="add-outline"
        fullWidth
        onPress={onScanMore}
      />
    </ScrollView>
  );
}

function StatTile({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <View style={[styles.statTile, { backgroundColor: tone }]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/* ═════════════════════════════════════════════════════════════
 *  ROUTE
 * ════════════════════════════════════════════════════════════ */
export default function SMSImportScreen() {
  const [phase, setPhase] = useState<Phase>('trust');
  const [paste, setPaste] = useState('');
  const [cards, setCards] = useState<CardState[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [liveAmount, setLiveAmount] = useState(0);
  // Tracks a paced reveal of completed cards so the UX matches the
  // backend's per-message audit trail without depending on streaming.
  const cancelRef = useRef(false);

  const useSample = useCallback(() => {
    setPaste(SAMPLE_SMS.join('\n\n'));
  }, []);

  const startScan = useCallback(async () => {
    const messages = splitMessages(paste);
    if (messages.length === 0) {
      showBrutalToast('Paste at least one SMS', 'warning');
      return;
    }
    cancelRef.current = false;
    const initial: CardState[] = messages.map((raw) => ({ raw, state: 'queued' }));
    setCards(initial);
    setLiveAmount(0);
    setSummary(null);
    setPhase('scanning');

    // Mark the first card as scanning straight away so the UI feels
    // alive even before the network resolves.
    setCards((prev) => prev.map((c, i) => (i === 0 ? { ...c, state: 'scanning' } : c)));

    let resp: any = null;
    let err: any = null;
    try {
      const res = await api.post('/sms/bulk-parse', { messages });
      resp = res.data;
    } catch (e: any) {
      err = e;
    }

    if (err) {
      showBrutalToast(err?.response?.data?.detail || 'Parse failed', 'danger');
      setPhase('trust');
      return;
    }

    const results: ScanResult[] = Array.isArray(resp?.results) ? resp.results : [];

    // Pace the reveal — at most 7 cards per second, but if we have
    // more than 14 messages we accelerate so the user never waits >2s
    // for the final card to flip.
    const stepMs = Math.max(140, Math.min(420, Math.round(1800 / Math.max(1, messages.length))));
    let runningAmt = 0;

    for (let i = 0; i < messages.length; i++) {
      if (cancelRef.current) return;
      // Reveal current as scanning briefly, then settle to done with result.
      setCards((prev) =>
        prev.map((c, idx) => (idx === i ? { ...c, state: 'scanning' } : c)),
      );
      // tiny pause to let the scanning state breathe
      // (use a Promise so we don't block the UI thread)
      await new Promise((r) => setTimeout(r, Math.min(stepMs, 220)));

      const r = results[i] || { status: 'failed', reason: 'no-result' };
      if (r.status === 'parsed' || r.status === 'pending_review') {
        runningAmt += Math.abs(Number(r.amount || 0));
        setLiveAmount(runningAmt);
      }
      setCards((prev) =>
        prev.map((c, idx) => (idx === i ? { ...c, state: 'done', result: r as ScanResult } : c)),
      );
      // Eagerly mark the next card as scanning so the beam feels continuous.
      if (i + 1 < messages.length) {
        setCards((prev) =>
          prev.map((c, idx) => (idx === i + 1 ? { ...c, state: 'scanning' } : c)),
        );
      }
      await new Promise((r) => setTimeout(r, stepMs));
    }

    setSummary({
      parsed: resp?.parsed ?? 0,
      failed: resp?.failed ?? 0,
      duplicate: resp?.duplicate ?? 0,
      pending_review: resp?.pending_review ?? 0,
      recurring_detected: resp?.recurring_detected ?? 0,
      total: resp?.total ?? messages.length,
    });
    // Bust SWR caches so transactions tab shows fresh data immediately.
    try {
      const { invalidate } = await import('../utils/swrGet');
      await invalidate?.('/transactions');
      await invalidate?.('/stats/overview');
      await invalidate?.('/budgets/live');
    } catch {
      /* noop — non-fatal */
    }
    setPhase('results');
    if ((resp?.parsed ?? 0) > 0) {
      showBrutalToast(`+${resp.parsed} added · ₹${Math.round(runningAmt).toLocaleString('en-IN')}`, 'positive', 2400);
    }
  }, [paste]);

  const reset = useCallback(() => {
    cancelRef.current = true;
    setPaste('');
    setCards([]);
    setSummary(null);
    setLiveAmount(0);
    setPhase('trust');
  }, []);

  const cancel = useCallback(() => {
    cancelRef.current = true;
    setPhase('trust');
  }, []);

  const doneCount = useMemo(() => cards.filter((c) => c.state === 'done').length, [cards]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => (phase === 'scanning' ? cancel() : router.back())}
          hitSlop={8}
          style={styles.headerBtn}
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={20} color={BR_COLORS.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>SMS IMPORT</Text>
        <View style={styles.headerBtn} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        {phase === 'trust' && (
          <TrustPanel
            paste={paste}
            setPaste={setPaste}
            onScan={startScan}
            onUseSample={useSample}
          />
        )}
        {phase === 'scanning' && (
          <ScanningPanel
            cards={cards}
            total={cards.length}
            doneCount={doneCount}
            liveAmount={liveAmount}
            onCancel={cancel}
          />
        )}
        {phase === 'results' && (
          <ResultsPanel summary={summary} cards={cards} onScanMore={reset} />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* ─────────────────────────────────────────────────────────────
 *  STYLES
 * ──────────────────────────────────────────────────────────── */
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BR_COLORS.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: BR_SPACE['4'],
    paddingVertical: BR_SPACE['3'],
    borderBottomWidth: BR_BORDER.base,
    borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.bg,
  },
  headerBtn: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: BR_BORDER.base,
    borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.card,
    ...(BR_SHADOW.xs as any),
  },
  headerTitle: {
    ...BR_FONT.stamp,
    color: BR_COLORS.ink,
    fontSize: 13,
  },

  scrollPad: {
    padding: BR_SPACE['4'],
    paddingBottom: BR_SPACE['16'],
  },

  /* Hero */
  heroEyebrow: {
    ...BR_FONT.stamp,
    color: BR_COLORS.ink,
    opacity: 0.7,
    marginBottom: BR_SPACE['2'],
  },
  heroTitle: {
    ...BR_FONT.h1,
    color: '#fff',
    fontSize: 28,
    marginBottom: BR_SPACE['2'],
  },
  heroSub: {
    ...BR_FONT.body,
    color: '#fff',
    opacity: 0.95,
    fontSize: 13,
    lineHeight: 18,
  },

  /* Pillars */
  pillarsRow: {
    flexDirection: 'row',
    gap: BR_SPACE['2'],
    marginBottom: BR_SPACE['5'],
  },
  pillar: {
    flex: 1,
    padding: BR_SPACE['3'],
    minHeight: 96,
    gap: 4,
  },
  pillarTitle: {
    ...BR_FONT.stamp,
    fontSize: 10,
    color: BR_COLORS.ink,
    marginTop: 4,
  },
  pillarSub: {
    ...BR_FONT.caption,
    color: BR_COLORS.ink,
    opacity: 0.85,
    fontSize: 10,
    fontWeight: '700',
  },

  /* Paste */
  pasteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: BR_SPACE['2'],
  },
  sectionLabel: {
    ...BR_FONT.stamp,
    color: BR_COLORS.ink,
    fontSize: 11,
  },
  linkText: {
    ...BR_FONT.caption,
    color: BR_COLORS.ink,
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  linkSub: {
    ...BR_FONT.caption,
    color: BR_COLORS.textMuted,
    fontSize: 11,
    textDecorationLine: 'underline',
  },
  textareaWrap: {
    backgroundColor: BR_COLORS.card,
    borderWidth: BR_BORDER.thick,
    borderColor: BR_COLORS.ink,
    borderRadius: BR_RADIUS.sm,
    ...(BR_SHADOW.sm as any),
  },
  textarea: {
    minHeight: 160,
    padding: BR_SPACE['4'],
    fontSize: 14,
    color: BR_COLORS.text,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace' }),
    lineHeight: 20,
  },
  pasteFooter: {
    paddingHorizontal: BR_SPACE['3'],
    paddingVertical: BR_SPACE['2'],
    borderTopWidth: BR_BORDER.fine,
    borderColor: BR_COLORS.line,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: BR_COLORS.bgWarm,
  },
  pasteCounter: {
    ...BR_FONT.caption,
    color: BR_COLORS.ink,
    fontSize: 11,
  },
  footnote: {
    ...BR_FONT.caption,
    color: BR_COLORS.textMuted,
    fontSize: 11,
    marginTop: BR_SPACE['4'],
    lineHeight: 16,
  },

  /* Scan screen */
  scanScreen: { flex: 1, padding: BR_SPACE['4'] },
  scanHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: BR_SPACE['3'],
  },
  scanTitle: { ...BR_FONT.stamp, color: BR_COLORS.ink, fontSize: 13 },
  scanSub: { ...BR_FONT.caption, color: BR_COLORS.textMuted, fontSize: 11, marginTop: 2 },
  cancelBtn: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: BR_BORDER.base, borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.card,
  },
  tickerCard: {
    alignItems: 'center',
    paddingVertical: BR_SPACE['5'],
    marginBottom: BR_SPACE['4'],
  },
  tickerEyebrow: {
    ...BR_FONT.stamp,
    color: BR_COLORS.ink,
    fontSize: 10,
    marginBottom: BR_SPACE['1'],
  },
  tickerAmount: {
    ...BR_FONT.numericLg,
    fontSize: 40,
    color: BR_COLORS.ink,
  },
  progressTrack: {
    marginTop: BR_SPACE['3'],
    width: '100%',
    height: 12,
    backgroundColor: BR_COLORS.card,
    borderWidth: BR_BORDER.base,
    borderColor: BR_COLORS.ink,
  },
  progressFill: {
    height: '100%',
    backgroundColor: PALETTE.brand,
  },
  scanList: {
    gap: BR_SPACE['3'],
    paddingBottom: BR_SPACE['8'],
  },

  /* Scan card */
  scanCard: {
    padding: BR_SPACE['3'],
    borderWidth: BR_BORDER.base,
    borderColor: BR_COLORS.ink,
    borderRadius: BR_RADIUS.sm,
    marginBottom: BR_SPACE['3'],
    ...(BR_SHADOW.sm as any),
  },
  scanCardActive: {
    borderColor: PALETTE.brand,
    borderWidth: BR_BORDER.thick,
  },
  scanCardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: BR_SPACE['2'],
  },
  indexChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: BR_COLORS.ink,
  },
  indexChipText: {
    ...BR_FONT.stamp,
    color: '#fff',
    fontSize: 9,
  },
  stampPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: BR_BORDER.fine,
    borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.card,
  },
  stampPillText: {
    ...BR_FONT.stamp,
    color: BR_COLORS.ink,
    fontSize: 9,
  },
  rawSms: {
    ...BR_FONT.caption,
    color: BR_COLORS.text,
    fontSize: 11,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace' }),
    lineHeight: 15,
    marginBottom: BR_SPACE['2'],
  },
  resolvedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: BR_SPACE['2'],
    paddingTop: BR_SPACE['2'],
    borderTopWidth: BR_BORDER.fine,
    borderColor: BR_COLORS.lineStrong,
  },
  resolvedLeft: { flex: 1 },
  resolvedAmt: { ...BR_FONT.h3, color: BR_COLORS.ink },
  resolvedMerchant: {
    ...BR_FONT.caption,
    color: BR_COLORS.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
  flagsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: BR_SPACE['2'],
    flexWrap: 'wrap',
  },
  flagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: BR_BORDER.fine,
    borderColor: BR_COLORS.ink,
  },
  flagChipText: {
    ...BR_FONT.stamp,
    color: BR_COLORS.ink,
    fontSize: 8,
  },
  scanningHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: BR_SPACE['2'],
  },
  scanningHintText: {
    ...BR_FONT.caption,
    color: BR_COLORS.textMuted,
    fontSize: 10,
  },
  dotsRow: { flexDirection: 'row', gap: 3 },
  tinyDot: { width: 5, height: 5, backgroundColor: BR_COLORS.ink },
  tinyDotPulse: { opacity: 0.5 },

  /* Beam */
  beam: {
    position: 'absolute',
    left: -6,
    right: -6,
    top: 0,
    height: 4,
    backgroundColor: PALETTE.brand,
    opacity: 0.6,
    zIndex: 50,
    ...Platform.select({
      web: { boxShadow: `0 0 18px 2px ${PALETTE.brand}` as any },
      default: {
        shadowColor: PALETTE.brand,
        shadowOpacity: 0.8,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 0 },
      },
    }),
  },

  /* Results */
  celebrateEyebrow: {
    ...BR_FONT.stamp,
    color: BR_COLORS.ink,
    fontSize: 11,
  },
  celebrateAmount: {
    ...BR_FONT.numericLg,
    fontSize: 44,
    color: BR_COLORS.ink,
    marginTop: BR_SPACE['2'],
  },
  celebrateSub: {
    ...BR_FONT.body,
    color: BR_COLORS.ink,
    fontSize: 13,
    marginTop: BR_SPACE['1'],
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: BR_SPACE['2'],
  },
  statTile: {
    flexBasis: '48%',
    paddingVertical: BR_SPACE['4'],
    paddingHorizontal: BR_SPACE['3'],
    borderWidth: BR_BORDER.thick,
    borderColor: BR_COLORS.ink,
    borderRadius: BR_RADIUS.sm,
    alignItems: 'center',
    ...(BR_SHADOW.sm as any),
  },
  statValue: {
    ...BR_FONT.numericLg,
    fontSize: 30,
    color: BR_COLORS.ink,
  },
  statLabel: {
    ...BR_FONT.stamp,
    color: BR_COLORS.ink,
    fontSize: 10,
    marginTop: 4,
  },
  cardSub: {
    ...BR_FONT.caption,
    color: BR_COLORS.ink,
    opacity: 0.85,
    fontSize: 12,
    marginTop: BR_SPACE['1'],
    lineHeight: 17,
  },
});
