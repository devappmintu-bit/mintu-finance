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
  agent?: string;
  agentEmoji?: string;
  ts?: number;
  isFallback?: boolean;
  // Round 90 — Coach v2 fields.
  confidenceLabel?: string;
  // R100R — Italic source-citation accent under AI replies. Backend
  // grounds every reply with a one-liner ("Based on your last 30 days
  // of UPI spends · 47 transactions"). Empty string → no claim → UI
  // suppresses the line entirely (no provenance hallucination).
  source?: string;
  action?: CoachActionCard;
  actionState?: 'idle' | 'busy' | 'done';
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
    } catch {
      setMessages((prev) => {
        const next = [...prev];
        const cur = next[msgIdx];
        if (cur) next[msgIdx] = { ...cur, actionState: 'idle' };
        return next;
      });
    }
  }, []);

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
    try {
      // Round 90 — migrate to /coach/chat (memory + actions + confidence).
      const res = await apiSlow.post('/coach/chat', {
        message: text.trim(),
        lang,
      });
      // Ensure min 600ms "thinking" delay so typing dots feel real, not jumpy.
      const elapsed = Date.now() - sentAt;
      if (elapsed < 600) await new Promise((r) => setTimeout(r, 600 - elapsed));
      const data = res.data || {};
      const incomingAction = Array.isArray(data.actions) && data.actions.length > 0
        ? (data.actions[0] as CoachActionCard)
        : undefined;
      setMessages((prev) => [
        ...prev.slice(0, -1),
        {
          role: 'ai',
          text: data.reply || smartFallback(text, ctx),
          agent: 'AI Coach',
          agentEmoji: '🤖',
          ts: Date.now(),
          confidenceLabel: typeof data.confidence_label === 'string' ? data.confidence_label : '',
          source: typeof data.source === 'string' ? data.source : '',
          action: incomingAction,
          actionState: incomingAction ? 'idle' : undefined,
        },
      ]);
      // Refresh chips for next turn (per spec — "refresh on each session").
      // Fire-and-forget; chips stay stable if the request fails.
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
  }, [chatLoading, lang, ctx]);

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
    return (
      <View style={[s.msgRow, isUser ? s.msgRowUser : s.msgRowAi]}>
        {!isUser && (
          <View style={s.aiAv}><MintULogo size={22} /></View>
        )}
        <View style={{ maxWidth: '80%' }}>
          {!isUser && item.agent && !item.loading && (
            <View style={s.agentLabelRow}>
              <Text style={s.agentLabel}>{item.agentEmoji} {item.agent}</Text>
              {item.isFallback && <Text style={s.offlinePill}>offline</Text>}
            </View>
          )}
          <View style={[s.bubble, isUser ? s.bubbleUser : s.bubbleAi]}>
            {item.loading ? <TypingDots /> : formatAIText(item.text, isUser)}
          </View>
          {/* R100R — Source citation accent. Italic provenance line
              shown below every grounded AI reply ("Based on your last
              30 days of UPI spends · 47 transactions"). Suppressed for
              fallback / cold-start so we never claim provenance we
              don't have. Goes ABOVE the confidence trailer because
              "where it came from" must be visible before "how sure". */}
          {!isUser && !item.loading && !item.isFallback && !!item.source && (
            <View style={s.sourceRow} testID="coach-source-citation">
              <Ionicons name="document-text-outline" size={11} color="#8A8A8A" />
              <Text style={s.sourceTxt}>{item.source}</Text>
            </View>
          )}
          {/* Round 90 — Confidence trailer (medium / low only). */}
          {!isUser && !item.loading && !!item.confidenceLabel && (
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
          {!item.loading && <Text style={[s.timeLabel, isUser && { textAlign: 'right' }]}>{formatTime(item.ts)}</Text>}
        </View>
      </View>
    );
  }, [s, executeAction]);

  // Suggested prompts — always visible above input (not only on empty state).
  const showBigChips = messages.length <= 1;

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <View style={s.headerIcon}><MintULogo size={34} /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>AI Coach</Text>
          <Text style={s.headerSub}>
            {ctx.savingsRate != null
              ? `You're saving ${ctx.savingsRate}% · top: ${ctx.topCategory || '—'}`
              : 'Your personal finance assistant'}
          </Text>
        </View>
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
              {(suggestedChips && suggestedChips.length > 0
                ? suggestedChips.map((label) => ({ label, emoji: '💬' }))
                : PERSONAL_CHIPS
              ).map((c, i) => (
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
            {PERSONAL_CHIPS.map((c, i) => (
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

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.bg.primary },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border.subtle },
  headerIcon: { width: 40, height: 40, borderRadius: 0, backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: c.text.primary },
  headerSub: { fontSize: 11, color: c.text.muted, marginTop: 1 },
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
  bubbleAi: { backgroundColor: c.bg.card, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: c.border.card },
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
}));


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
