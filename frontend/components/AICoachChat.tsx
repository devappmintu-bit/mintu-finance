/**
 * MintU AI Coach — full UX upgrade
 *
 * Fixes:
 *   - ScrollView was used but not imported → runtime crash (now imported)
 *   - Broken Unicode emoji escapes (\ud83d\udcb0) → real emojis
 *   - Purple "School" color palette → warm orange
 *
 * New features:
 *   - Smart fallback: if API fails, reply uses the user's real spending context
 *     ("you're saving X% — try cutting top category Y by Z")
 *   - Context awareness: fetches /analytics/summary once, injects into prompts
 *     AND into fallback responses
 *   - Typing simulation: "MintU is thinking…" chip above dots, 600ms min delay
 *   - Sticky suggested prompts strip (always visible above input, not only on empty)
 *   - Clean empty state with welcome + 2 quick CTAs
 *   - Conversational opener using user's name
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView,
  KeyboardAvoidingView, Platform, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import api, { apiSlow } from '../utils/api';
import { fetchAnalyticsSummary } from '../services/transactions';
import { useFinContext } from '../store/financialContext';
import MintULogo from './MintULogo';
import { useAuthStore } from '../store/authStore';
import { useAIPrompt } from '../store/aiPromptStore';
import { useLangStore } from '../store/langStore';
import { COLORS } from '../utils/theme';
import { makeStyles } from '../utils/makeStyles';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { fetchPremiumStatus } from '../services/premium';
import PremiumUnlockTeaser from './premium/PremiumUnlockTeaser';
// R104 — Trust stamp under the latest AI bubble.
import ConfidenceBadge, { tierFromConfidence } from './brutal/ConfidenceBadge';



// R113 FIX — useStyles hoisted above first render-time call
// to avoid Metro/SDK52 TDZ error (`Cannot access X before init.`).
const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.bg.primary },
  // R102 — Compact identity header. Tiny mascot + "MintU Coach" only.
  // The previous bigger logo + 11-px subtitle ("Your personal finance
  // assistant" / "You're saving X% · top: Y") on every visit was the
  // top audit complaint — it shouted "I'm a chatbot" on every screen.
  // Now it's a single line that says who's on the other end. Done.
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border.subtle },
  headerIcon: { width: 30, height: 30, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: c.text.primary, letterSpacing: -0.2 },
  closeBtn: { width: 36, height: 36, borderRadius: 0, backgroundColor: c.bg.card, justifyContent: 'center', alignItems: 'center' },
  chatList: { padding: 16, paddingBottom: 8 },
  msgRow: { flexDirection: 'row', marginBottom: 14 },
  msgRowUser: { justifyContent: 'flex-end' },
  msgRowAi: { justifyContent: 'flex-start' },
  aiAv: { width: 28, height: 28, borderRadius: 0, backgroundColor: c.accent.primary + '12', justifyContent: 'center', alignItems: 'center', marginRight: 8, marginTop: 18 },
  agentLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3, marginLeft: 4 },
  agentLabel: { fontSize: 10, fontWeight: '700', color: c.accent.primary },
  // R100J — Brutalist enforcement: chip pills hardened from
  // borderRadius:999 (round) to 0 (square) with 2-px ink borders.
  // Replaces the soft pill aesthetic that broke the brutalist
  // language elsewhere in the app. Same applies below to
  // premiumBadge, offlinePill, and lockedCTA.
  offlinePill: { fontSize: 8, fontWeight: '900', letterSpacing: 0.6, color: '#fff', backgroundColor: c.text.muted, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 0, borderWidth: 1, borderColor: c.text.primary },
  bubble: { borderRadius: 0, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleUser: { backgroundColor: c.accent.primary, borderBottomRightRadius: 4 },
  // R102 — Warmer off-white AI bubble (was bare card bg). Brings the
  // coach reply visually closer to the chat surface so it stops feeling
  // like a debug card and more like a friendly note.
  bubbleAi: { backgroundColor: '#FFFAF1', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: c.border.card },
  msgText: { fontSize: 14, lineHeight: 21, color: c.text.primary },
  timeLabel: { fontSize: 9, color: c.text.muted, marginTop: 3, marginLeft: 4 },
  typingWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2, paddingHorizontal: 2 },
  typingHint: { fontSize: 12, color: c.text.muted, fontStyle: 'italic' },

  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, paddingBottom: 8, gap: 7 },
  chipSection: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: c.text.muted, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 },
  schoolHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 16 },
  premiumBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: c.accent.primary + '1E', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 0, borderWidth: 1, borderColor: c.accent.primary },
  premiumBadgeT: { fontSize: 9, fontWeight: '900', color: c.accent.primary, letterSpacing: 0.6 },
  lockedSchoolCard: { marginHorizontal: 16, marginBottom: 10, borderRadius: 0, overflow: 'hidden', borderWidth: 1, borderColor: c.accent.primary + '33' },
  lockedSchoolInner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  lockedSchoolIcon: { width: 40, height: 40, borderRadius: 0, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.accent.primary + '33' },
  lockedSchoolTitle: { fontSize: 13.5, fontWeight: '900', color: c.text.primary },
  lockedSchoolSub: { fontSize: 11, color: c.text.secondary, marginTop: 3, lineHeight: 15 },
  lockedCTA: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: '#fff', borderRadius: 0, borderWidth: 1.5, borderColor: c.text.primary },
  lockedCTAT: { fontSize: 11.5, fontWeight: '900', color: c.accent.primary, letterSpacing: 0.2 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: c.bg.card, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 0, borderWidth: 1.5, borderColor: c.text.primary },
  chipSchool: { backgroundColor: c.accent.primary + '12', borderColor: c.accent.primary + '30' },
  chipEmoji: { fontSize: 13 },
  chipText: { fontSize: 12, fontWeight: '500', color: c.text.secondary },

  stickyStrip: {
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 8,
    gap: 8,
  },
  stickyChip: {
    // R100G — proportions revisit. Previous geometry (px:9, py:5,
    // fs:11, br:1.25) read as "stickers" stuck below the chat — too
    // small relative to the chat bubble + send button (44 px tall).
    // Bumped to a clean 36 px tap target with 2 px Brutalist border
    // and accent-on-press behaviour. Chip text scaled to 12 / 700 for
    // legibility at arm's length without becoming billboard-y.
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FAFAF7',
    paddingHorizontal: 12, paddingVertical: 8,
    minHeight: 36,
    borderWidth: 2, borderColor: '#0A0A0A',
  },
  chipTextSticky: {
    fontSize: 12, fontWeight: '700', color: '#0A0A0A', letterSpacing: 0.2,
  },

  // Round 89 — chat input = primary zone (not footer).
  // High-contrast send button (solid ink, accent-on-ink arrow) +
  // tighter padding to pull weight toward the input itself.
  inputRow: {
    flexDirection: 'row',
    paddingHorizontal: 14, paddingVertical: 8, gap: 8,
    borderTopWidth: 1.5, borderTopColor: '#0A0A0A',
    backgroundColor: '#FAFAF7',
  },
  chatInput: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 0,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, color: c.text.primary,
    borderWidth: 1.5, borderColor: '#0A0A0A',
    maxHeight: 90, minHeight: 42,
  },
  sendBtn: {
    width: 44, height: 44,
    borderRadius: 0,
    backgroundColor: '#0A0A0A',
    borderWidth: 2, borderColor: '#0A0A0A',
    justifyContent: 'center', alignItems: 'center',
    alignSelf: 'flex-end',
  },

  // Round 90 — confidence trailer + action card.
  confidenceTxt: {
    fontSize: 11,
    color: '#8A8A8A',
    fontStyle: 'italic',
    marginTop: 4,
    paddingHorizontal: 4,
    lineHeight: 14,
  },
  // R100R — Source-citation accent. Italic provenance line under
  // every grounded AI reply. Subtle / muted on purpose — not a CTA.
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    paddingHorizontal: 4,
  },
  sourceTxt: {
    fontSize: 11,
    color: '#8A8A8A',
    fontStyle: 'italic',
    lineHeight: 14,
    flex: 1,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#0A0A0A',
    borderWidth: 2, borderColor: '#0A0A0A',
  },
  actionCardDone: {
    backgroundColor: '#1A1A1A',
    opacity: 0.85,
  },
  actionLabel: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    marginRight: 10,
  },
  actionPill: {
    backgroundColor: '#E8470A',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1.5,
    borderColor: '#0A0A0A',
  },
  actionPillTxt: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
    color: '#FFFFFF',
  },
  // R102C — Floating reward banner (animated fade in/out).
  rewardBanner: {
    position: 'absolute',
    top: 56,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFE8B0',
    borderWidth: 2,
    borderColor: '#0A0A0A',
    zIndex: 50,
    shadowColor: '#0A0A0A',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 3, height: 3 },
    elevation: 0,
    maxWidth: '80%',
  },
  rewardTxt: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0A0A0A',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  // R102B — Smart follow-up chip row (under latest AI bubble).
  followRow: {
    paddingTop: 8,
    paddingBottom: 2,
    gap: 6,
    flexDirection: 'row',
  },
  followChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#0A0A0A',
    backgroundColor: '#FFFFFF',
  },
  followChipTxt: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0A0A0A',
    letterSpacing: 0.2,
  },
  // R102 — projected savings ghost-pill (existed in JSX, was missing from
  // the stylesheet → TS2339). Subtle italic preview under action label.
  projectedPill: {
    color: '#E8470A',
    fontSize: 10,
    fontStyle: 'italic',
    fontWeight: '700',
    marginTop: 2,
  },
}));

type CoachActionCard = {
  label: string;
  endpoint: string;
  payload: Record<string, any>;
  confirm_text?: string;
  method?: string;
  // Round 92 — projected impact shown BEFORE tap (Duolingo move).
  projected_label?: string;
  projected_impact?: number;
};

type ChatMsg = {
  role: 'user' | 'ai';
  text: string;
  loading?: boolean;
  /** R107 — Streaming reveal flag. When true, the bubble is being
   *  progressively typed (word-by-word) — input stays disabled and a
   *  tiny "live" pulse renders next to the agent label. Cleared
   *  automatically once `text` reaches `fullText`. */
  streaming?: boolean;
  /** R107 — The full final text, retained while we type. Lets the
   *  reveal interpolate without re-fetching. */
  fullText?: string;
  agent?: string;
  agentEmoji?: string;
  ts?: number;
  isFallback?: boolean;
  // Round 90 — Coach v2 fields.
  confidenceLabel?: string;
  /** R104 — Numeric confidence (0..1) for the structured tier badge. */
  confidence?: number;
  // R100R — Italic source-citation accent under AI replies. Backend
  // grounds every reply with a one-liner ("Based on your last 30 days
  // of UPI spends · 47 transactions"). Empty string → no claim → UI
  // suppresses the line entirely (no provenance hallucination).
  source?: string;
  action?: CoachActionCard;
  actionState?: 'idle' | 'busy' | 'done';
  // R102B — Smart follow-up chips, returned per-reply by the backend
  // and rendered ONLY under the latest AI bubble. Per-stage variants
  // (Stage 0..3 — see `_follow_ups_for` in coach_v2.py).
  followUps?: string[];
  // R102B — Coach maturity stage at the time of this reply. Currently
  // informational; future use: render a tiny "S0" pill etc.
  stage?: number;
};

type Ctx = {
  name: string;
  totalSpend?: number;
  savingsRate?: number;
  topCategory?: string;
  topCatAmount?: number;
};

const PERSONAL_CHIPS = [
  { label: 'Where am I overspending?', emoji: '📊' },
  { label: 'How can I save ₹5,000?', emoji: '💰' },
  { label: 'Analyze my last 7 days', emoji: '📈' },
  { label: 'Give me budget tips', emoji: '🎯' },
];

const SCHOOL_CHIPS = [
  { label: 'Teach me about SIPs', emoji: '🎓' },
  { label: 'How to save income tax?', emoji: '💵' },
  { label: 'What is a mutual fund?', emoji: '🧠' },
  { label: 'Improve my credit score', emoji: '💳' },
  { label: '50/30/20 budget rule', emoji: '⚖️' },
  { label: 'Emergency fund explained', emoji: '🛡️' },
];

const fmtINR = (n?: number) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;

/** Round 89 Strike 2 refine — decision-first offline fallback.
 *
 * Was: multi-bullet "Hey {name} 👋 Looks like I'm offline 😅 — …"
 *      paragraph + snapshot + tip list. This created the "dual
 *      format" problem — online replies were decision-shaped, but
 *      offline replies reverted to the legacy report shape.
 *
 * Now: same 3-line contract as the backend system prompt —
 *      Core insight → (optional why) → → Action. Max 4 lines.
 *      Never greets by name. Never says "offline 😅".
 *      The user can't tell online from offline — which is the point.
 */
function smartFallback(userMsg: string, ctx: Ctx): string {
  const lower = userMsg.toLowerCase();
  const savings = ctx.savingsRate ?? 0;
  const top = ctx.topCategory || '';
  const topAmt = ctx.topCatAmount || 0;
  const total = ctx.totalSpend ?? 0;

  // No data at all — one line, one action.
  if (!top && !total) {
    return `No expenses tracked yet — I can't see patterns to analyse.\n**→ Add your first expense and I'll take it from there.**`;
  }

  // Overspend / cut-category intent
  if (/overspend|too much|spending.*on|cut.*category/.test(lower) && top) {
    return `${top} is your biggest bucket at ${fmtINR(topAmt)} this month.\n*Cutting 20 % here saves ${fmtINR(topAmt * 0.2)}/month.*\n**→ Open Budget and cap ${top} for the next 2 weeks.**`;
  }

  // Save X amount intent
  if (/how.*save|save.*₹|save \d/.test(lower)) {
    const target = Math.max(topAmt * 0.25, 1000);
    return `Quickest win: cut ${top || 'your top category'} by 25 % — worth ${fmtINR(target)}.\n**→ Set a weekly cap in Budget; I'll nudge you when you breach.**`;
  }

  // Analysis / spend summary intent
  if (/last \d|days|analyze|analysis|report|summary/.test(lower)) {
    const daily = total / 30;
    const verdict = savings >= 20 ? 'On track' : 'Under the 20 % savings bar';
    return `${fmtINR(total)} spent in 30 days (avg ${fmtINR(daily)}/day). ${verdict}.\n**→ ${savings >= 20 ? 'Create a goal to absorb the surplus.' : 'Trim ' + (top || 'one category') + ' by 10 % to hit 20 %.'}**`;
  }

  // Budget / SIP / tax / invest intent
  if (/budget|sip|tax|invest|mutual fund|credit score/.test(lower)) {
    return `You're saving ${savings}% — target is 20 %.\n**→ ${savings >= 20 ? 'Move the extra into an SIP this month (Groww/Zerodha).' : 'Cut ' + (top || 'top category') + ' by 10 % to close the gap.'}**`;
  }

  // Generic fallback — still decision-first, never assistant-y.
  if (top) {
    return `${top} = ${fmtINR(topAmt)} this month, your biggest single bucket.\n**→ Trim 10-20 % here; it's the fastest lever you have.**`;
  }
  return `I can see your data but need more to spot patterns.\n**→ Log a few more expenses this week and ask me again.**`;
}

const TypingDots = () => {
  const s = useStyles();
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;
  // R100G — staged progress copy. Before this the user saw a single
  // "MintU is thinking" line for the entire 15-25s LLM round-trip;
  // most thought the app had hung. Now the copy ticks through three
  // beats so progress feels real:
  //   0–3s    "MintU is thinking"
  //   3–9s    "Reading your money story…"
  //   9s+     "Almost there — drafting your reply"
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  useEffect(() => {
    const t1 = setTimeout(() => setStage(1), 3000);
    const t2 = setTimeout(() => setStage(2), 9000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  useEffect(() => {
    const anim = (dot: Animated.Value, delay: number) =>
      Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(dot, { toValue: 0.3, duration: 300, useNativeDriver: true }),
      ]));
    anim(dot1, 0).start(); anim(dot2, 150).start(); anim(dot3, 300).start();
  }, []);
  const hint = stage === 0
    ? 'MintU is thinking'
    : stage === 1
      ? 'Reading your money story'
      : 'Almost there — drafting reply';
  return (
    <View style={s.typingWrap}>
      <Text style={s.typingHint}>{hint}</Text>
      <View style={{ flexDirection: 'row', gap: 3, alignItems: 'center' }}>
        {[dot1, dot2, dot3].map((d, i) => (
          <Animated.View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.accent.primary, opacity: d }} />
        ))}
      </View>
    </View>
  );
};

export default function AICoachChat({ onClose }: { onClose?: () => void }) {
  const s = useStyles();
  const { user } = useAuthStore();
  const { lang } = useLangStore();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  // Round 90 — keep latest messages in a ref so action card handlers
  // can read up-to-date data without re-creating callbacks.
  const messagesRef = useRef<ChatMsg[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  const [input, setInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [ctx, setCtx] = useState<Ctx>({ name: user?.name || 'there' });
  const [isPremium, setIsPremium] = useState(false);
  // Round 90 — LLM-generated suggested chips (refreshed per session).
  const [suggestedChips, setSuggestedChips] = useState<string[] | null>(null);
  // R102C — Emotional reward loop. After an action card succeeds we
  // flash a brief celebratory banner ("🎯 Cap set — baseline started")
  // for ~2.5s. The audit called out "setting a cap feels empty" — this
  // gives the user dopamine + progress signal (Duolingo / Headspace
  // pattern). Auto-fades. No modal, no scroll-shift.
  const [reward, setReward] = useState<string | null>(null);
  const rewardOpacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!reward) return;
    rewardOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(rewardOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(2200),
      Animated.timing(rewardOpacity, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(() => setReward(null));
  }, [reward, rewardOpacity]);
  const fireReward = useCallback((label: string) => {
    const lc = (label || '').toLowerCase();
    if (lc.includes('cap') || lc.includes('budget')) {
      setReward('🎯 Cap set — baseline started');
    } else if (lc.includes('expense') || lc.includes('log')) {
      setReward('✅ Logged — one step toward your baseline');
    } else if (lc.includes('goal')) {
      setReward('🏆 Goal created — let\u2019s make it happen');
    } else {
      setReward('🎉 Done — moving forward');
    }
  }, [rewardOpacity]);

  // Load suggestions once on mount; backend returns deterministic
  // fallback for empty-data users so this is always safe.
  useEffect(() => {
    let alive = true;
    api.get('/coach/suggestions')
      .then(r => {
        if (alive && Array.isArray(r?.data?.suggestions)) {
          setSuggestedChips(r.data.suggestions);
        }
      })
      .catch(() => { /* keep static fallback */ });
    return () => { alive = false; };
  }, []);

  // Round 90 — execute an action card.  One tap. No navigation.
  const executeAction = useCallback(async (msgIdx: number) => {
    setMessages((prev) => {
      const m = prev[msgIdx];
      if (!m?.action || m.actionState === 'busy' || m.actionState === 'done') return prev;
      const next = [...prev];
      next[msgIdx] = { ...m, actionState: 'busy' };
      return next;
    });
    try {
      const m = (messagesRef.current as ChatMsg[] | undefined)?.[msgIdx];
      const action = m?.action;
      if (!action) return;
      await api.post('/coach/actions/execute', {
        label: action.label,
        endpoint: action.endpoint,
        payload: action.payload || {},
        method: action.method || 'POST',
      });
      setMessages((prev) => {
        const next = [...prev];
        const cur = next[msgIdx];
        if (cur) next[msgIdx] = { ...cur, actionState: 'done' };
        return next;
      });
      // R102C — Fire celebration banner so the action doesn't feel
      // empty. Pulls the success copy from the action label/confirm.
      try {
        const m2 = (messagesRef.current as ChatMsg[] | undefined)?.[msgIdx];
        fireReward(m2?.action?.confirm_text || m2?.action?.label || '');
      } catch { /* never let UX feedback crash the success path */ }
    } catch {
      setMessages((prev) => {
        const next = [...prev];
        const cur = next[msgIdx];
        if (cur) next[msgIdx] = { ...cur, actionState: 'idle' };
        return next;
      });
    }
  }, [fireReward]);

  // Fetch premium status — Money School chips are gated behind this
  useEffect(() => {
    (async () => {
      try {
        const p = await fetchPremiumStatus();
        setIsPremium(!!p?.is_premium);
      } catch { /* default: locked */ }
    })();
  }, []);
  const flatRef = useRef<FlashListRef<any>>(null);

  // Round 82 — SSoT-first consumption. Subscribe to useFinContext so
  // this component re-renders when the SSoT gains fresh data (via any
  // hydrate path). Fall back to the bespoke fetch only during cold-
  // start when the SSoT hasn't been populated yet. Zero regression.
  const finTxns = useFinContext((s: any) => s.transactions);

  useEffect(() => {
    // SSoT-first — if the store already knows the monthly spend,
    // derive directly and skip the fetch.
    if (finTxns && Number(finTxns.monthlySpend || 0) > 0) {
      const cats = finTxns.categories || {};
      // Pick the top-spend category by amount.
      const entries = Object.entries(cats) as Array<[string, number]>;
      const top = entries.sort((a, b) => Number(b[1]) - Number(a[1]))[0];
      setCtx((prev) => ({
        ...prev,
        totalSpend:   Number(finTxns.monthlySpend || 0),
        topCategory:  top?.[0],
        topCatAmount: top?.[1] ? Number(top[1]) : undefined,
      }));
      return; // SSoT satisfied — skip the network call entirely.
    }
    // Fallback: SSoT cold — fetch directly, same as before.
    (async () => {
      try {
        const d = (await fetchAnalyticsSummary()) || {};
        const cats = Array.isArray(d.categories) ? d.categories : [];
        const topCat = cats[0];
        setCtx((prev) => ({
          ...prev,
          totalSpend: d.total_expense || 0,
          savingsRate: Math.round(d.savings_rate || 0),
          topCategory: topCat?.category || topCat?.name,
          topCatAmount: topCat?.amount,
        }));
      } catch {
        /* keep defaults */
      }
    })();
  }, [finTxns]);

  // Round 89 Strike 2 refine — state-driven welcome, NO intro after first use.
  //
  // Previously we shipped "Hey {name} 👋 I'm your personal money coach…"
  // on every open, which felt assistant-y and generic after the user
  // already knows what MintU is. New behavior:
  //
  //   • Returning user (flag in AsyncStorage)  →  start empty. The
  //     user types, taps a chip, or arrives with a prefill — the chat
  //     begins from silence, like Perplexity / ChatGPT.
  //   • First-time user + no transactions       →  ONE terse line:
  //     "You haven't added any expenses yet. Start with your first one."
  //   • First-time user + some transactions     →  ONE line reflecting
  //     state: "I see {N} expenses so far — ask me anything about them."
  //
  //   • R100G — Pulse handoff override: when the user arrives from a
  //     Pulse card (`pending` is set with kind='pulse'), we SKIP the
  //     generic welcome entirely. The PulseContextPill + auto-fired
  //     prompt + reply already fill the screen with relevant content;
  //     showing "you haven't added any expenses yet" on top of that
  //     was a Day-0 trust crack the user explicitly flagged.
  //
  // Flag is persisted so the welcome never fires twice for the same user.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // R100G — short-circuit when arriving from Pulse. Read the
        // store synchronously here (no subscription) so we don't
        // re-render on context changes after the welcome fires.
        const pendingNow = useAIPrompt.getState().pending;
        if (pendingNow?.context?.kind === 'pulse') {
          // Mark welcomed so future visits don't double-show the
          // generic welcome; the Pulse handoff is the welcome.
          await AsyncStorage.setItem('mintu_coach_welcomed_v2', 'true');
          return;
        }
        const seen = await AsyncStorage.getItem('mintu_coach_welcomed_v2');
        if (seen === 'true' || !alive) return;
        // R100W — bug fix: was `finTxns?.length` (undefined → 0). The
        // FinContext exposes `transactions: { count, monthlySpend, … }`
        // not an array. So users with real transactions saw the
        // "haven't added any expenses yet" welcome — exactly the
        // hallucination the audit flagged. Now we read .count and
        // ALSO fall back to monthlySpend>0 as a positive signal in
        // case the count field is stale on cold-tab open.
        const txnCount = Number(
          (finTxns as any)?.count ??
          (finTxns as any)?.length ??
          0
        );
        const hasMonthlySpend = Number((finTxns as any)?.monthlySpend ?? 0) > 0;
        let text = '';
        if (txnCount === 0 && !hasMonthlySpend) {
          text = "You haven't added any expenses yet. Start with your first one — I'll take it from there.";
        } else if (txnCount > 0) {
          text = `I see ${txnCount} ${txnCount === 1 ? 'expense' : 'expenses'} tracked. Ask me anything about them.`;
        } else {
          // monthlySpend > 0 but count missing — generic, non-claiming.
          text = "Ask me anything about your money — I have your recent activity loaded.";
        }
        setMessages([{
          role: 'ai', text,
          agent: 'Mintu', agentEmoji: '✨', ts: Date.now(),
        }]);
        await AsyncStorage.setItem('mintu_coach_welcomed_v2', 'true');
      } catch { /* noop */ }
    })();
    return () => { alive = false; };
    // Intentional: fire ONCE when the chat mounts; not on user/txn changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Round 59 — Auto-send any prompt parked in the AI Quick Sheet store.
  // Runs once after the welcome banner mounts so the user sees the
  // greeting → their question → AI reply in the right order.
  useEffect(() => {
    const pending = useAIPrompt.getState().consume();
    if (pending) {
      // Defer so the welcome message renders first, giving a natural
      // pacing instead of two messages flashing simultaneously.
      const t = setTimeout(() => sendMessage(pending.prompt), 250);
      return () => clearTimeout(t);
    }
    // Intentionally not listing sendMessage in deps — we ONLY want to
    // pull the parked prompt at mount time. Subsequent prompts come
    // through the input field in the normal way.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || chatLoading) return;
    const userMsg: ChatMsg = { role: 'user', text: text.trim(), ts: Date.now() };
    const loadingMsg: ChatMsg = { role: 'ai', text: '', loading: true, ts: Date.now() };
    setMessages((prev) => [...prev, userMsg, loadingMsg]);
    setInput('');
    setChatLoading(true);
    const sentAt = Date.now();

    // R108 — Try true SSE token streaming first. Falls back to the
    // existing /coach/chat (faux-stream reveal) if the streaming
    // endpoint errors, the runtime can't open ReadableStreams, or
    // the user is on a build older than R108. The fallback path is
    // identical to R107 so we keep all metadata + UX guarantees.
    const streamingTs = Date.now() + 1; // bubble identifier, distinct from loadingMsg.ts
    let streamSucceeded = false;
    try {
      const accessToken = (await import('../store/authStore')).useAuthStore.getState().accessToken;
      const apiBase =
        (process.env.EXPO_PUBLIC_BACKEND_URL || '') + '/api';
      const ctrl = new AbortController();
      const resp = await fetch(`${apiBase}/coach/chat-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: accessToken ? `Bearer ${accessToken}` : '',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({ message: text.trim(), lang }),
        signal: ctrl.signal,
      });
      if (!resp.ok || !resp.body) throw new Error(`stream-http-${resp.status}`);

      // Replace the loading bubble with an empty streaming bubble immediately.
      setMessages((prev) => [
        ...prev.slice(0, -1),
        {
          role: 'ai',
          text: '',
          streaming: true,
          agent: 'AI Coach',
          agentEmoji: '🤖',
          ts: streamingTs,
        },
      ]);

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let acc = '';
      let doneEvent: any = null;
        // SSE parser — scan for `data: …\n\n` events and dispatch each.
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        while (true) {
          const sep = buf.indexOf('\n\n');
          if (sep < 0) break;
          const raw = buf.slice(0, sep).trim();
          buf = buf.slice(sep + 2);
          if (!raw.startsWith('data:')) continue;
          const payload = raw.slice(5).trim();
          if (!payload) continue;
          try {
            const evt = JSON.parse(payload);
            if (evt.type === 'chunk' && typeof evt.delta === 'string') {
              acc += evt.delta;
              const snapshot = acc;
              setMessages((prev) =>
                prev.map((m) => (m.ts === streamingTs ? { ...m, text: snapshot } : m)),
              );
            } else if (evt.type === 'done') {
              doneEvent = evt;
            }
          } catch {
            /* malformed line; skip */
          }
        }
      }

      // Settle bubble with final metadata from the done event.
      const incomingAction = doneEvent?.actions && doneEvent.actions.length > 0
        ? (doneEvent.actions[0] as CoachActionCard)
        : undefined;
      const finalText: string = (doneEvent?.reply || acc || '').trim() || smartFallback(text, ctx);
      setMessages((prev) =>
        prev.map((m) => (m.ts === streamingTs ? {
          ...m,
          text: finalText,
          fullText: finalText,
          streaming: false,
          confidenceLabel: typeof doneEvent?.confidence_label === 'string' ? doneEvent.confidence_label : '',
          confidence: typeof doneEvent?.confidence === 'number' ? doneEvent.confidence : undefined,
          source: typeof doneEvent?.source === 'string' ? doneEvent.source : '',
          action: incomingAction,
          actionState: incomingAction ? 'idle' : undefined,
          followUps: Array.isArray(doneEvent?.follow_ups) ? doneEvent.follow_ups : undefined,
          stage: typeof doneEvent?.stage === 'number' ? doneEvent.stage : undefined,
        } : m)),
      );
      // Refresh chips for next turn.
      api.get('/coach/suggestions')
        .then(r => Array.isArray(r?.data?.suggestions) && setSuggestedChips(r.data.suggestions))
        .catch(() => {});
      streamSucceeded = true;
    } catch {
      streamSucceeded = false;
    }

    if (streamSucceeded) {
      setChatLoading(false);
      return;
    }

    // R107 fallback path — non-stream POST + faux-stream reveal.
    try {
      const res = await apiSlow.post('/coach/chat', {
        message: text.trim(),
        lang,
      });
      const data = res.data || {};
      const incomingAction = Array.isArray(data.actions) && data.actions.length > 0
        ? (data.actions[0] as CoachActionCard)
        : undefined;
      const fullText: string = (data.reply || smartFallback(text, ctx)) as string;
      const fbTs = Date.now();
      setMessages((prev) => [
        ...prev.slice(0, -1),
        {
          role: 'ai',
          text: '',
          fullText,
          streaming: true,
          agent: 'AI Coach',
          agentEmoji: '🤖',
          ts: fbTs,
          confidenceLabel: typeof data.confidence_label === 'string' ? data.confidence_label : '',
          confidence: typeof data.confidence === 'number' ? data.confidence : undefined,
          source: typeof data.source === 'string' ? data.source : '',
          action: incomingAction,
          actionState: incomingAction ? 'idle' : undefined,
          followUps: Array.isArray(data.follow_ups) ? data.follow_ups : undefined,
          stage: typeof data.stage === 'number' ? data.stage : undefined,
        },
      ]);
      revealText(fbTs, fullText);

      api.get('/coach/suggestions')
        .then(r => Array.isArray(r?.data?.suggestions) && setSuggestedChips(r.data.suggestions))
        .catch(() => {});
    } catch {
      // Smart fallback — NEVER just "server unreachable"
      const elapsed = Date.now() - sentAt;
      if (elapsed < 600) await new Promise((r) => setTimeout(r, 600 - elapsed));
      setMessages((prev) => [
        ...prev.slice(0, -1),
        {
          role: 'ai',
          text: smartFallback(text, ctx),
          agent: 'AI Money Coach',
          agentEmoji: '📡',
          ts: Date.now(),
          isFallback: true,
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  }, [chatLoading, lang, ctx, revealText]);

  /** R107 — Word-by-word reveal driven off setInterval. We append
   *  whole words at once (with their trailing whitespace) so React
   *  re-renders are bounded (~30/s instead of ~250/s for char-mode).
   *  ts is the bubble's identifier — we look up the message by ts so
   *  the reveal correctly stops if the user clears the chat mid-flight.
   */
  const revealText = useCallback((ts: number, fullText: string) => {
    if (!fullText) {
      setMessages((prev) => prev.map((m) => (m.ts === ts ? { ...m, text: '', streaming: false, fullText: undefined } : m)));
      return;
    }
    // Tokenize on word boundaries while preserving whitespace + line breaks.
    const tokens = fullText.match(/\S+\s*|\s+/g) || [fullText];
    let idx = 0;
    let acc = '';
    // Word-aware pacing: ~26ms/token for short replies, faster for long ones
    // so we never make the user wait more than ~1.6s for the full reveal.
    const stepMs = Math.max(14, Math.min(38, Math.round(1600 / Math.max(1, tokens.length))));
    const id = setInterval(() => {
      if (idx >= tokens.length) {
        clearInterval(id);
        setMessages((prev) => prev.map((m) => (m.ts === ts ? { ...m, text: fullText, streaming: false } : m)));
        return;
      }
      acc += tokens[idx];
      idx += 1;
      const snapshot = acc;
      setMessages((prev) => prev.map((m) => (m.ts === ts ? { ...m, text: snapshot } : m)));
    }, stepMs);
  }, []);

  const formatTime = (ts?: number) => {
    if (!ts) return '';
    return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };

  // Format AI text — bold, bullets, ₹ highlight
  const formatAIText = (text: string, isUser: boolean) => {
    if (isUser) return <Text style={[s.msgText, { color: '#fff' }]}>{text}</Text>;
    const parts: React.ReactNode[] = [];
    text.split('\n').forEach((line, li) => {
      if (li > 0) parts.push(<Text key={`br${li}`}>{'\n'}</Text>);
      line.split(/(\*\*[^*]+\*\*|₹[\d,]+(?:\.\d+)?)/g).forEach((seg, si) => {
        if (seg.startsWith('**') && seg.endsWith('**')) {
          parts.push(<Text key={`${li}-${si}`} style={{ fontWeight: '700', color: COLORS.text.primary }}>{seg.slice(2, -2)}</Text>);
        } else if (seg.startsWith('₹')) {
          parts.push(<Text key={`${li}-${si}`} style={{ fontWeight: '800', color: COLORS.accent.primary }}>{seg}</Text>);
        } else {
          parts.push(<Text key={`${li}-${si}`}>{seg}</Text>);
        }
      });
    });
    return <Text style={s.msgText}>{parts}</Text>;
  };

  const renderMsg = useCallback(({ item, index }: { item: ChatMsg; index: number }) => {
    const isUser = item.role === 'user';
    // R102 — Density rebuild. Hide noise (timestamp, source, confidence,
    // agent label) on every message EXCEPT the latest cluster. Repetition
    // was the #1 audit complaint — disclaimers re-rendering on every reply
    // made the coach feel scripted and admin-y. Now the chat reads like
    // a real conversation: only the most recent AI bubble carries the
    // "where this came from" line; older bubbles are pure content.
    const isLatestAi = !isUser && index === messages.length - 1;
    const showAgentLabel = isLatestAi && !!item.agent && !item.loading && item.isFallback;
    const showTimestamp = isLatestAi && !item.loading;
    const showSource = isLatestAi && !item.loading && !item.isFallback && !!item.source;
    // R102 — only surface confidence pill when it's actually a signal
    // ("low" / "uncertain"); kill the chatty "medium confidence" trailer.
    const showConfidence =
      isLatestAi &&
      !item.loading &&
      !!item.confidenceLabel &&
      /low|uncertain|estimate/i.test(item.confidenceLabel);
    return (
      <View style={[s.msgRow, isUser ? s.msgRowUser : s.msgRowAi]}>
        {!isUser && (
          <View style={s.aiAv}><MintULogo size={22} /></View>
        )}
        <View style={{ maxWidth: '80%' }}>
          {!isUser && showAgentLabel && (
            <View style={s.agentLabelRow}>
              <Text style={s.agentLabel}>{item.agentEmoji} {item.agent}</Text>
              {item.isFallback && <Text style={s.offlinePill}>offline</Text>}
            </View>
          )}
          <View style={[s.bubble, isUser ? s.bubbleUser : s.bubbleAi]}>
            {item.loading ? <TypingDots /> : formatAIText(item.text, isUser)}
          </View>
          {/* R102 — provenance + confidence are now rendered ONLY on the
              latest AI bubble (and only when meaningful). Older bubbles
              are pure content. Cuts the visual chatter the audit
              flagged ("disclaimer repeated every message"). */}
          {/* R104 — Trust stamp on the latest AI reply. Replaces the
              old free-text confidence trailer with a structured badge:
              VERIFIED (≥0.7) / ESTIMATED (≥0.4) / SUGGESTED (<0.4).
              Tap to reveal the evidence trace (source list + coverage
              + last-updated). Only renders on the LATEST AI bubble so
              older replies stay visually calm. */}
          {isLatestAi && !item.loading && !item.isFallback && typeof item.confidence === 'number' && (
            <View style={{ marginTop: 6 }}>
              <ConfidenceBadge
                tier={tierFromConfidence(item.confidence)}
                provenance={{
                  confidence: item.confidence,
                  sources: item.source ? [item.source] : undefined,
                  lastUpdated: item.ts ? formatTime(item.ts) : undefined,
                }}
                expandable
              />
            </View>
          )}
          {showSource && (
            <View style={s.sourceRow} testID="coach-source-citation">
              <Ionicons name="document-text-outline" size={11} color="#8A8A8A" />
              <Text style={s.sourceTxt}>{item.source}</Text>
            </View>
          )}
          {showConfidence && (
            <Text style={s.confidenceTxt}>{item.confidenceLabel}</Text>
          )}
          {/* Round 90 — Action card under AI reply. One tap. No nav. */}
          {!isUser && !item.loading && item.action && (
            <TouchableOpacity
              testID="coach-action-card"
              onPress={() => executeAction(index)}
              disabled={item.actionState === 'busy' || item.actionState === 'done'}
              style={[
                s.actionCard,
                item.actionState === 'done' && s.actionCardDone,
              ]}
              activeOpacity={0.85}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.actionLabel} numberOfLines={2}>
                  {item.actionState === 'done'
                    ? (item.action.confirm_text || 'Done')
                    : item.action.label}
                </Text>
                {/* Round 92 — projected savings ghost-pill (consequence
                    visible BEFORE tap → Duolingo move). */}
                {!!item.action.projected_label && item.actionState !== 'done' && (
                  <Text style={s.projectedPill} numberOfLines={1}>
                    {item.action.projected_label}
                  </Text>
                )}
              </View>
              <View style={s.actionPill}>
                <Text style={s.actionPillTxt}>
                  {item.actionState === 'busy' ? '...' : item.actionState === 'done' ? '✓' : 'TAP'}
                </Text>
              </View>
            </TouchableOpacity>
          )}
          {showTimestamp && <Text style={[s.timeLabel, isUser && { textAlign: 'right' }]}>{formatTime(item.ts)}</Text>}
          {/* R102B — Smart follow-up chips. Render only on the latest
              AI bubble to avoid stale prompts cluttering the scroll
              history. Tap → fires sendMessage with the chip text. */}
          {isLatestAi && !item.loading && Array.isArray(item.followUps) && item.followUps.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={s.followRow}
              testID="coach-follow-ups"
            >
              {item.followUps.slice(0, 4).map((fu, i) => (
                <TouchableOpacity
                  key={`fu-${index}-${i}`}
                  style={s.followChip}
                  onPress={() => sendMessage(fu)}
                  disabled={chatLoading}
                  activeOpacity={0.8}
                >
                  <Text style={s.followChipTxt}>{fu}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    );
  }, [s, executeAction, messages.length, chatLoading, sendMessage]);

  // Suggested prompts — always visible above input (not only on empty state).
  const showBigChips = messages.length <= 1;

  // R102 — Contextual dynamic chips. Replaces the static FAQ-style
  // PERSONAL_CHIPS list with prompts that map to the user's CURRENT
  // financial state. The audit called the old chips "FAQ support
  // center content" — these new chips feel like the coach already
  // understands what the user is dealing with.
  //
  // States (ordered — first hit wins):
  //   no_data       → 0 transactions tracked
  //   overspending  → top category amount > 40% of total spend
  //   has_data      → general personal-finance starter set
  // Chips also include the LLM-server-suggested set when present —
  // those are already context-aware on the backend.
  const contextualChips = React.useMemo(() => {
    const txnCount = Number((finTxns as any)?.count ?? 0);
    const totalSpend = Number(ctx.totalSpend || 0);
    const topAmt = Number(ctx.topCatAmount || 0);
    const overspendingTop =
      totalSpend > 0 && topAmt > 0 && topAmt / totalSpend > 0.4;
    if (suggestedChips && suggestedChips.length > 0) {
      // Backend already returns state-aware suggestions — prefer those.
      return suggestedChips.slice(0, 4).map((label) => ({ label, emoji: '💬' }));
    }
    if (txnCount === 0) {
      return [
        { label: 'Help me start', emoji: '🌱' },
        { label: 'Set my first budget', emoji: '🎯' },
        { label: 'What should I track first?', emoji: '👀' },
        { label: 'Import SMS safely', emoji: '🔒' },
      ];
    }
    if (overspendingTop) {
      return [
        { label: `Where did I overspend?`, emoji: '📊' },
        { label: `Reduce ${ctx.topCategory || 'top'} spending`, emoji: '✂️' },
        { label: 'Show biggest leaks', emoji: '🕳️' },
        { label: 'Save ₹5,000 this month', emoji: '💰' },
      ];
    }
    return [
      { label: 'How am I doing this month?', emoji: '📈' },
      { label: 'Build my monthly plan', emoji: '🗺️' },
      { label: 'Save more this month', emoji: '💰' },
      { label: 'Analyze my last 7 days', emoji: '🔍' },
    ];
  }, [suggestedChips, finTxns, ctx.totalSpend, ctx.topCatAmount, ctx.topCategory]);

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <View style={s.headerIcon}><MintULogo size={26} /></View>
        <Text style={s.headerTitle}>MintU Coach</Text>
        {!!onClose && (
          <TouchableOpacity onPress={onClose} style={s.closeBtn}>
            <Ionicons name="close" size={22} color={COLORS.text.primary} />
          </TouchableOpacity>
        )}
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }} keyboardVerticalOffset={10}>
        {/* R100E — "📌 From Pulse" context pill. Renders only when the
            user arrived from a Pulse card. Sits above the chat list so
            the user always knows the AI's reply is grounded in that
            specific news item. */}
        <PulseContextPill />
        {/* R102C — Floating reward banner. Shown briefly after an
            action card succeeds. Absolutely positioned so it doesn't
            shift the chat layout — fades in/out via Animated.Value. */}
        {reward && (
          <Animated.View
            pointerEvents="none"
            style={[s.rewardBanner, { opacity: rewardOpacity }]}
            testID="coach-reward-banner"
          >
            <Text style={s.rewardTxt}>{reward}</Text>
          </Animated.View>
        )}
        <FlashList
          ref={flatRef}
          data={messages}
          keyExtractor={(_, i) => String(i)}
          renderItem={renderMsg}
          contentContainerStyle={s.chatList}
          onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: true })}
          showsVerticalScrollIndicator={false}
        />

        {/* Round 89 Strike 2 refine — empty-state chips are now
            always a horizontal strip (not a 2-row tile grid). User
            feedback: the big beige cards competed with the chat
            surface and looked like dead zones. Chips feel like
            affordances, not content. */}
        {showBigChips && (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.stickyStrip}
              keyboardShouldPersistTaps="handled"
            >
              {contextualChips.map((c, i) => (
                <TouchableOpacity
                  key={`big-${i}`}
                  style={s.stickyChip}
                  onPress={() => sendMessage(c.label)}
                  disabled={chatLoading}
                  activeOpacity={0.8}
                >
                  <Text style={s.chipEmoji}>{c.emoji}</Text>
                  <Text style={s.chipTextSticky}>{c.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {/* Premium unlock teaser still shown once below chips —
                hidden for Pro users. Kept here so free users have a
                path to the School bundle without a full tile grid. */}
            <View style={{ paddingHorizontal: 16 }}>
              <PremiumUnlockTeaser context="ai_unlimited" />
            </View>
          </>
        )}

        {/* Always-visible quick prompts strip (even after conversation started) */}
        {!showBigChips && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.stickyStrip} keyboardShouldPersistTaps="handled">
            {contextualChips.map((c, i) => (
              <TouchableOpacity
                key={`stk-${i}`}
                style={s.stickyChip}
                onPress={() => sendMessage(c.label)}
                disabled={chatLoading}
                activeOpacity={0.8}
              >
                <Text style={s.chipEmoji}>{c.emoji}</Text>
                <Text style={s.chipTextSticky}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        <View style={s.inputRow}>
          <TextInput
            style={s.chatInput}
            value={input}
            onChangeText={setInput}
            placeholder="Ask your AI coach…"
            placeholderTextColor={COLORS.text.muted}
            onSubmitEditing={() => sendMessage(input)}
            returnKeyType="send"
            editable={!chatLoading}
            multiline
          />
          <TouchableOpacity
            style={[s.sendBtn, (!input.trim() || chatLoading) && { opacity: 0.4 }]}
            onPress={() => sendMessage(input)}
            disabled={!input.trim() || chatLoading}
          >
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}



/**
 * PulseContextPill — R100E.
 *
 * Renders the "📌 From Pulse" header above the chat when the user
 * arrived via the Money Signal Layer. Subscribes reactively to
 * `useAIPrompt.activeContext` so it appears the instant the Pulse
 * modal pushes context (before the auto-fire even completes).
 *
 * Why a separate component: keeps the main chat render tight, lets
 * the subscription be a single shallow selector, and isolates a
 * future "tap to dismiss" affordance if needed.
 */
function PulseContextPill() {
  const ctx = useAIPrompt((s) => s.activeContext);
  if (!ctx || ctx.kind !== 'pulse') return null;
  return (
    <View style={pillSt.wrap}>
      <View style={pillSt.head}>
        <Text style={pillSt.kicker}>📌 FROM PULSE</Text>
        {ctx.source ? (
          <Text style={pillSt.source} numberOfLines={1}>
            {ctx.source}
          </Text>
        ) : null}
      </View>
      <Text style={pillSt.headline} numberOfLines={2}>
        {ctx.headline}
      </Text>
      {ctx.impacts && ctx.impacts.length > 0 ? (
        <View style={pillSt.impactList}>
          {ctx.impacts.slice(0, 3).map((imp, idx) => (
            <Text key={idx} style={pillSt.impactRow} numberOfLines={1}>
              → {imp.text}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const pillSt = StyleSheet.create({
  wrap: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 2,
    borderColor: '#0A0A0A',
    backgroundColor: '#FFF7E8',
  },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  kicker: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
    color: '#0A0A0A',
  },
  source: {
    fontSize: 10,
    color: '#6B6B6B',
    fontWeight: '700',
    maxWidth: 160,
    letterSpacing: 0.5,
  },
  headline: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0A0A0A',
    lineHeight: 18,
    letterSpacing: -0.2,
    marginBottom: 6,
  },
  impactList: {
    borderTopWidth: 1,
    borderTopColor: '#0A0A0A',
    paddingTop: 6,
  },
  impactRow: {
    fontSize: 12,
    color: '#0A0A0A',
    lineHeight: 18,
    fontWeight: '600',
  },
});
