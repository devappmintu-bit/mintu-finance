/**
 * SmartSettleSheet — Round 53k Smart Settlements UX.
 *
 * A bottom sheet that shows the optimized debt-simplification plan for
 * a group and lets the user execute their portion atomically with one
 * tap. Backed by:
 *
 *   GET  /api/split/groups/{id}/settle-plan
 *   POST /api/split/groups/{id}/settle-my-part   (with Idempotency-Key)
 *
 * UX rules:
 *   • The user's outgoing rows are highlighted in the accent color.
 *   • The user's incoming rows show a subtle green wash.
 *   • Other rows are muted (still visible — full transparency).
 *   • A net-effect chip ("You pay ₹X / You receive ₹Y / Net ₹Z")
 *     prevents the "wait, what just happened?" anxiety.
 *   • The CTA carries the exact rupee amount that will leave the
 *     user's wallet — no surprises after tap.
 *   • 409 (drift) → toast + auto-refresh, no silent settle.
 *
 * Trust contract:
 *   • A fresh Idempotency-Key is generated per loaded plan. The same
 *     plan + same key replays verbatim on retry; a plan refresh
 *     resets the key (so a re-confirmed user can re-settle if the
 *     plan legitimately changed).
 *   • `expected_total_paise` is sent with every execute call as a
 *     server-side double-check.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Toast from 'react-native-toast-message';
import { makeStyles } from '../../utils/makeStyles';
import { haptic as haptics } from '../../utils/haptics';
import Mascot from '../Mascot';
import { C } from './theme';
import {
  fetchSettlePlan,
  settleMyPart,
  SmartSettlePlan,
  SmartSettleTransfer,
} from '../../services/split';

type Props = {
  visible: boolean;
  groupId: string | null;
  groupName?: string;
  /** Current user's id — used to detect rows where the user is the recipient
   *  (so the net-effect chip can show incoming amounts even when the user
   *  has no outgoing transfers). Optional — falls back to deriving from
   *  my_transfers[0].from when omitted. */
  currentUserId?: string | null;
  onClose: () => void;
  onSettled?: (result: { batch_ref: string; total_paise: number; settled_count: number }) => void;
};

/** Minimal RFC4122-v4 UUID — uses crypto.getRandomValues when available. */
function uuidv4(): string {
  const arr = new Uint8Array(16);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = (globalThis as any).crypto;
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(arr);
  else for (let i = 0; i < 16; i++) arr[i] = Math.floor(Math.random() * 256);
  arr[6] = (arr[6] & 0x0f) | 0x40;
  arr[8] = (arr[8] & 0x3f) | 0x80;
  const hex = Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const fmtRupee = (n: number) => `\u20b9${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export default function SmartSettleSheet({ visible, groupId, groupName, currentUserId, onClose, onSettled }: Props) {
  const s = useStyles();

  const [plan, setPlan] = useState<SmartSettlePlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Polish: post-success celebration overlay (mascot + sparkle).
  const [celebrating, setCelebrating] = useState<{ count: number; total: number } | null>(null);
  // Idempotency key bound to a specific loaded plan; rotates on refresh.
  const [idemKey, setIdemKey] = useState<string>(() => uuidv4());

  // ── Polish: micro-animations (coin sparkle + mascot peek) ────────
  // Reusing the built-in Animated API — no new deps. Three coin-emoji
  // refs that fly upward+outward when the CTA fires; a celebration
  // mascot scales in on success.
  const coin1 = useRef(new Animated.Value(0)).current;
  const coin2 = useRef(new Animated.Value(0)).current;
  const coin3 = useRef(new Animated.Value(0)).current;
  const mascotScale = useRef(new Animated.Value(0)).current;
  const mascotPeek = useRef(new Animated.Value(0)).current;

  const loadPlan = useCallback(
    async (gid: string, opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      setError(null);
      try {
        const data = await fetchSettlePlan(gid);
        setPlan(data);
        setIdemKey(uuidv4()); // fresh key per fresh plan
      } catch (e: any) {
        const msg = e?.response?.data?.detail || 'Could not load settlement plan';
        setError(msg);
        setPlan(null);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (visible && groupId) {
      // Reset state on each open so we never show stale plans.
      setPlan(null);
      setError(null);
      setSubmitting(false);
      setCelebrating(null);
      mascotScale.setValue(0);
      mascotPeek.setValue(0);
      coin1.setValue(0); coin2.setValue(0); coin3.setValue(0);
      loadPlan(groupId);
    }
  }, [visible, groupId, loadPlan, mascotScale, mascotPeek, coin1, coin2, coin3]);

  // Polish: tiny mascot peek animation once the plan finishes loading.
  // A subtle "I simplified this for you" beat that draws the eye to the
  // header without stealing focus from the plan list.
  useEffect(() => {
    if (plan && !loading && !error) {
      Animated.spring(mascotPeek, {
        toValue: 1,
        useNativeDriver: true,
        damping: 12,
        stiffness: 110,
      }).start();
    }
  }, [plan, loading, error, mascotPeek]);

  // Polish: coin-fly animation. Each coin scales in then translates
  // upward+outward so it visually "leaves" the user toward receivers.
  const playCoinAnimation = useCallback(() => {
    coin1.setValue(0); coin2.setValue(0); coin3.setValue(0);
    const mk = (v: Animated.Value, delay: number) =>
      Animated.timing(v, {
        toValue: 1,
        duration: 720,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      });
    Animated.parallel([mk(coin1, 0), mk(coin2, 90), mk(coin3, 180)]).start();
  }, [coin1, coin2, coin3]);

  // Polish: mascot celebration scale-in for the success overlay.
  const playCelebration = useCallback(() => {
    mascotScale.setValue(0);
    Animated.spring(mascotScale, {
      toValue: 1,
      useNativeDriver: true,
      damping: 9,
      stiffness: 130,
    }).start();
  }, [mascotScale]);

  // ── Net-effect math ─────────────────────────────────────────────
  // Resolve "me" id: prefer the explicit prop, fall back to deriving from
  // any outgoing transfer (works whenever the user has at least one).
  const meId = currentUserId || plan?.my_transfers[0]?.from || null;
  const { outgoingPaise, incomingPaise, netPaise, hasOutgoing } = useMemo(() => {
    if (!plan) return { outgoingPaise: 0, incomingPaise: 0, netPaise: 0, hasOutgoing: false };
    const out = plan.my_total_outgoing_paise || 0;
    const inc = meId
      ? plan.transfers
          .filter((t) => t.to === meId)
          .reduce((sum, t) => sum + t.amount_paise, 0)
      : 0;
    return {
      outgoingPaise: out,
      incomingPaise: inc,
      netPaise: out - inc,
      hasOutgoing: out > 0,
    };
  }, [plan, meId]);

  // ── Settle CTA handler ──────────────────────────────────────────
  const onSettleMyPart = useCallback(async () => {
    if (!plan || !groupId || !hasOutgoing || submitting) return;
    setSubmitting(true);
    haptics.light(); // tactile confirmation that the tap registered
    playCoinAnimation(); // start coins flying in parallel with the API
    try {
      const result = await settleMyPart(groupId, plan.my_total_outgoing_paise, idemKey, 'upi');
      // Polish: brief celebration overlay before closing — the user
      // *sees* the success, not just a flash of text.
      haptics.success();
      setCelebrating({ count: result.settled_count, total: result.total_amount });
      playCelebration();
      Toast.show({
        type: 'success',
        text1: '\u26a1 Smart-settled!',
        text2: `${result.settled_count} optimized transfer${result.settled_count !== 1 ? 's' : ''} of ${fmtRupee(result.total_amount)}`,
      });
      // Hold the celebration ~1.2s — long enough to register, short
      // enough not to feel like a chore.
      setTimeout(() => {
        onSettled?.({
          batch_ref: result.batch_ref,
          total_paise: result.total_paise,
          settled_count: result.settled_count,
        });
        onClose();
      }, 1200);
    } catch (e: any) {
      const status = e?.response?.status;
      const detail = e?.response?.data?.detail;
      if (status === 409) {
        haptics.warning();
        // Plan drifted — auto refresh and let the user re-confirm.
        Toast.show({
          type: 'info',
          text1: 'Plan changed',
          text2: 'Refreshing the latest plan\u2026',
        });
        await loadPlan(groupId, { silent: true });
      } else if (status === 400) {
        Toast.show({
          type: 'info',
          text1: 'Already settled',
          text2: detail || 'Nothing to settle in this group',
        });
        await loadPlan(groupId, { silent: true });
      } else {
        haptics.error();
        Toast.show({
          type: 'error',
          text1: 'Could not settle',
          text2: detail || 'Please try again in a moment',
        });
      }
    } finally {
      setSubmitting(false);
    }
  }, [plan, groupId, hasOutgoing, submitting, idemKey, onSettled, onClose, loadPlan, playCoinAnimation, playCelebration]);

  // ── Render helpers ──────────────────────────────────────────────
  const renderTransferRow = (t: SmartSettleTransfer, idx: number) => {
    const isIncoming = !!meId && t.to === meId;
    const rowStyle = [
      s.row,
      t.is_mine && s.rowMine,
      !t.is_mine && isIncoming && s.rowIncoming,
    ];
    const labelColor = t.is_mine ? C.accent : isIncoming ? C.green : C.text2;
    const amountColor = t.is_mine ? C.accent : isIncoming ? C.green : C.text2;
    return (
      <View key={`${t.from}-${t.to}-${idx}`} style={rowStyle}>
        <View style={s.rowNames}>
          <Text style={[s.rowName, { color: labelColor }]} numberOfLines={1}>
            {t.is_mine ? 'You' : t.from_name}
          </Text>
          <Ionicons name="arrow-forward" size={14} color={C.text4} style={{ marginHorizontal: 6 }} />
          <Text style={[s.rowName, { color: labelColor }]} numberOfLines={1}>
            {isIncoming ? 'You' : t.to_name}
          </Text>
        </View>
        <Text style={[s.rowAmt, { color: amountColor }]}>{fmtRupee(t.amount)}</Text>
        {t.is_mine && (
          <View style={s.mineDot}>
            <Ionicons name="flash" size={11} color={C.inv} />
          </View>
        )}
      </View>
    );
  };

  const subtext = !plan
    ? ''
    : plan.transfers.length === 0
    ? "Everything's already balanced \ud83c\udf89"
    : hasOutgoing
    ? "I simplified this for you \u2728"
    : "Sit tight \u2014 others owe you in this group";

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <View style={s.handle} />

          {/* Header */}
          <View style={s.header}>
            {/* Polish: mascot peek next to title — soft scale-in once
                the plan loads. Small (32px) so it doesn't dominate. */}
            <Animated.View
              style={{
                transform: [
                  { scale: mascotPeek.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
                ],
                opacity: mascotPeek,
              }}
            >
              <Mascot size={32} />
            </Animated.View>
            <View style={{ flex: 1 }}>
              <Text style={s.title} numberOfLines={1}>
                Simplified settlements
              </Text>
              {!!groupName && (
                <Text style={s.subtitle} numberOfLines={1}>
                  {groupName}
                </Text>
              )}
            </View>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={28} color={C.text4} />
            </TouchableOpacity>
          </View>

          {/* Body */}
          {loading ? (
            <View style={s.center}>
              <ActivityIndicator size="large" color={C.accent} />
              <Text style={s.muted}>Optimizing payments…</Text>
            </View>
          ) : error ? (
            <View style={s.center}>
              <Ionicons name="alert-circle" size={32} color={C.red} />
              <Text style={[s.muted, { marginTop: 8 }]} numberOfLines={3}>
                {error}
              </Text>
              <TouchableOpacity
                onPress={() => groupId && loadPlan(groupId)}
                style={s.retryBtn}
                accessibilityRole="button"
                accessibilityLabel="Retry"
              >
                <Text style={s.retryT}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : !plan || plan.transfers.length === 0 ? (
            <View style={s.center}>
              <Text style={{ fontSize: 36 }}>\ud83c\udf89</Text>
              <Text style={[s.muted, { marginTop: 8, color: C.green, fontWeight: '700' }]}>
                Everyone's settled up
              </Text>
              <Text style={[s.muted, { marginTop: 4 }]}>No transfers needed in this group.</Text>
            </View>
          ) : (
            <>
              <Text style={s.subtext}>{subtext}</Text>

              {/* Plan list */}
              <ScrollView
                style={s.list}
                contentContainerStyle={{ paddingBottom: 8 }}
                showsVerticalScrollIndicator={false}
              >
                {plan.transfers.map(renderTransferRow)}
              </ScrollView>

              {/* Net-effect chip */}
              <View style={s.netBox}>
                <View style={s.netRow}>
                  <Text style={s.netLbl}>You pay</Text>
                  <Text style={[s.netVal, { color: C.accent }]}>{fmtRupee(outgoingPaise / 100)}</Text>
                </View>
                <View style={s.netRow}>
                  <Text style={s.netLbl}>You receive</Text>
                  <Text style={[s.netVal, { color: C.green }]}>{fmtRupee(incomingPaise / 100)}</Text>
                </View>
                <View style={s.netDivider} />
                <View style={s.netRow}>
                  <Text style={[s.netLbl, { fontWeight: '800', color: C.text1 }]}>Net effect</Text>
                  <Text
                    style={[
                      s.netVal,
                      { fontWeight: '800', color: netPaise > 0 ? C.accent : netPaise < 0 ? C.green : C.text2 },
                    ]}
                  >
                    {netPaise === 0
                      ? "You're even \ud83c\udf89"
                      : netPaise > 0
                      ? `You pay ${fmtRupee(netPaise / 100)}`
                      : `You receive ${fmtRupee(Math.abs(netPaise) / 100)}`}
                  </Text>
                </View>
              </View>

              {/* Primary CTA */}
              <TouchableOpacity
                onPress={onSettleMyPart}
                disabled={!hasOutgoing || submitting}
                accessibilityRole="button"
                accessibilityLabel={
                  hasOutgoing ? `Settle my part of ${fmtRupee(outgoingPaise / 100)}` : 'Nothing to settle'
                }
                activeOpacity={0.85}
                style={{ marginTop: 14 }}
              >
                <LinearGradient
                  colors={hasOutgoing ? [C.accent, C.accentLight] : [C.border, C.border]}
                  style={[s.cta, !hasOutgoing && { opacity: 0.6 }]}
                >
                  {submitting ? (
                    <>
                      <ActivityIndicator size="small" color={C.inv} />
                      <Text style={s.ctaT}> Settling…</Text>
                    </>
                  ) : hasOutgoing ? (
                    <>
                      <Ionicons name="flash" size={16} color={C.inv} />
                      <Text style={s.ctaT}> Settle my part ({fmtRupee(outgoingPaise / 100)})</Text>
                    </>
                  ) : (
                    <Text style={[s.ctaT, { color: C.text3 }]}>Nothing to settle</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              {/* Secondary close */}
              <TouchableOpacity
                onPress={onClose}
                style={s.closeBtn}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Text style={s.closeT}>Close</Text>
              </TouchableOpacity>
            </>
          )}

          {/* ── Polish: flying coins overlay during submission ──
              Three coin emojis spring upward+outward from the CTA
              area to visually represent money "leaving" the user. */}
          {submitting && !celebrating && (
            <View pointerEvents="none" style={s.flyingCoins}>
              {[coin1, coin2, coin3].map((v, i) => (
                <Animated.Text
                  key={i}
                  style={[
                    s.coin,
                    {
                      opacity: v.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] }),
                      transform: [
                        {
                          translateY: v.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, -120 - i * 12],
                          }),
                        },
                        {
                          translateX: v.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, (i - 1) * 60],
                          }),
                        },
                        {
                          scale: v.interpolate({
                            inputRange: [0, 0.4, 1],
                            outputRange: [0.4, 1.2, 0.6],
                          }),
                        },
                        {
                          rotate: v.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0deg', `${(i % 2 ? 1 : -1) * 360}deg`],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  {'\ud83d\udcb0'}
                </Animated.Text>
              ))}
            </View>
          )}

          {/* ── Polish: post-success celebration overlay ──
              Mascot springs in with sparkles + the just-settled total.
              Holds for ~1.2s then the sheet auto-closes (handled in
              onSettleMyPart). */}
          {celebrating && (
            <View style={s.celebrateOverlay} pointerEvents="auto">
              <Animated.View
                style={{
                  transform: [{ scale: mascotScale }],
                  opacity: mascotScale,
                  alignItems: 'center',
                }}
              >
                <Mascot size={88} glow />
                <View style={s.celebrateBadge}>
                  <Text style={s.celebrateBadgeT}>
                    \u26a1 All settled!
                  </Text>
                </View>
                <Text style={s.celebrateAmt}>{fmtRupee(celebrating.total)}</Text>
                <Text style={s.celebrateSub}>
                  in {celebrating.count} optimized transfer{celebrating.count !== 1 ? 's' : ''}
                </Text>
                <View style={s.sparkleRow}>
                  <Text style={s.sparkle}>{'\u2728'}</Text>
                  <Text style={s.sparkle}>{'\ud83c\udf89'}</Text>
                  <Text style={s.sparkle}>{'\u2728'}</Text>
                </View>
              </Animated.View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles(() => ({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: C.sheetBg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
    maxHeight: '92%',
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.text4, alignSelf: 'center', marginVertical: 8 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    marginBottom: 6,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: C.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 18, fontWeight: '800', color: C.text1 },
  subtitle: { fontSize: 12, color: C.text3, marginTop: 2 },
  subtext: { fontSize: 13, color: C.text3, marginBottom: 10, marginTop: 2 },

  list: { maxHeight: 280, marginTop: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'transparent',
    marginVertical: 3,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  rowMine: {
    backgroundColor: C.accentDim,
    borderColor: C.accent + '40',
  },
  rowIncoming: {
    backgroundColor: C.greenDim,
    borderColor: C.green + '30',
  },
  rowNames: { flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  rowName: { fontSize: 14, fontWeight: '700', maxWidth: '45%' },
  rowAmt: { fontSize: 15, fontWeight: '800', marginLeft: 8 },
  mineDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },

  netBox: {
    marginTop: 14,
    backgroundColor: C.bg,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  netRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  netLbl: { fontSize: 13, color: C.text2, fontWeight: '600' },
  netVal: { fontSize: 14, fontWeight: '700' },
  netDivider: { height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginVertical: 6 },

  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    gap: 4,
  },
  ctaT: { fontSize: 16, fontWeight: '800', color: C.inv },
  closeBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  closeT: { fontSize: 14, color: C.text3, fontWeight: '600' },

  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  muted: { fontSize: 13, color: C.text3, textAlign: 'center', marginTop: 8 },
  retryBtn: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: C.accentDim,
    borderWidth: 1,
    borderColor: C.accent + '40',
  },
  retryT: { fontSize: 14, fontWeight: '700', color: C.accent },

  // Polish: flying-coin overlay (anchored above the CTA, below the
  // celebration overlay so coins disappear before mascot appears).
  flyingCoins: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    height: 0,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  coin: {
    position: 'absolute',
    fontSize: 28,
  },

  // Polish: post-success celebration overlay — fills the sheet with
  // a translucent backdrop + animated mascot + sparkles.
  celebrateOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: C.sheetBg + 'F2',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 32,
  },
  celebrateBadge: {
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: C.accent + '18',
    borderWidth: 1,
    borderColor: C.accent + '30',
  },
  celebrateBadgeT: { fontSize: 13, fontWeight: '800', color: C.accent, letterSpacing: 0.3 },
  celebrateAmt: { fontSize: 36, fontWeight: '900', color: C.text1, marginTop: 12 },
  celebrateSub: { fontSize: 13, color: C.text3, marginTop: 4, fontWeight: '600' },
  sparkleRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  sparkle: { fontSize: 22 },
}));
