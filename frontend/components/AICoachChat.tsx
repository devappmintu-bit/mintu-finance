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
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView,
  KeyboardAvoidingView, Platform, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import api, { apiSlow } from '../utils/api';
import MintULogo from './MintULogo';
import { useAuthStore } from '../store/authStore';
import { useLangStore } from '../store/langStore';
import { COLORS } from '../utils/theme';
import { makeStyles } from '../utils/makeStyles';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { fetchPremiumStatus } from '../services/premium';
import PremiumUnlockTeaser from './premium/PremiumUnlockTeaser';

type ChatMsg = { role: 'user' | 'ai'; text: string; loading?: boolean; agent?: string; agentEmoji?: string; ts?: number; isFallback?: boolean };

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

/** Generate a smart offline response using the user's real numbers. */
function smartFallback(userMsg: string, ctx: Ctx): string {
  const lower = userMsg.toLowerCase();
  const savings = ctx.savingsRate ?? 0;
  const top = ctx.topCategory || 'Transport';
  const topAmt = ctx.topCatAmount || 0;

  // Overspending / category-specific
  if (/overspend|too much|spending.*on/.test(lower)) {
    return `Looks like I'm briefly offline 😅 — but here's what I see in your data:\n\nYour top category this month is **${top}** at ${fmtINR(topAmt)}.\n\n💡 Cutting just 20% here would save you ${fmtINR(topAmt * 0.2)}/month.\n\nTry setting a weekly cap for ${top} in the Budget tab.`;
  }

  // How to save X
  if (/how.*save|save.*₹|save \d/.test(lower)) {
    return `I'm offline for a sec, but here's a quick plan based on your spending:\n\n• **${top}** is your biggest category (${fmtINR(topAmt)})\n• Reducing it by ~25% alone saves ${fmtINR(topAmt * 0.25)}\n• Set a daily cash cap of ₹500 for impulse buys\n• Use the 50/30/20 rule (needs/wants/savings)`;
  }

  // Analysis / last N days / report
  if (/last \d|days|analyze|analysis|report/.test(lower)) {
    const total = ctx.totalSpend ?? 0;
    const daily = total / 30;
    return `Quick offline snapshot 📈\n\n• Spent: ${fmtINR(total)} (last 30 days)\n• Avg/day: ${fmtINR(daily)}\n• Top category: **${top}** (${fmtINR(topAmt)})\n• Savings rate: ${savings}%\n\nYou're ${savings >= 20 ? 'doing great' : 'below the 20% benchmark'}. Want to set up auto-alerts for spending spikes?`;
  }

  // Budget tips / SIP / tax / school → generic tip
  if (/budget|sip|tax|invest|mutual fund|credit score/.test(lower)) {
    return `I need a second to think — in the meantime, here's a quick tip:\n\n**Rule of thumb**: allocate 50% to needs, 30% to wants, 20% to savings & investments.\n\nBased on your data, you're at ~${savings}% savings. ${savings >= 20 ? 'Solid! Consider moving excess to an SIP in a large-cap fund.' : 'Aim for 20% — the 10% gap is ~' + fmtINR((ctx.totalSpend || 0) * 0.1) + '/month.'}`;
  }

  // Default compassionate fallback using name + context
  return `Hey ${ctx.name || 'there'} 👋\n\nLooks like I'm offline 😅 But based on your recent data:\n\n• Savings rate: **${savings}%** ${savings >= 20 ? '(great job!)' : '(aim for 20%)'}\n• Top category: ${top} (${fmtINR(topAmt)})\n\nWant tips to reduce your top category?`;
}

const TypingDots = () => {
  const s = useStyles();
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const anim = (dot: Animated.Value, delay: number) =>
      Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(dot, { toValue: 0.3, duration: 300, useNativeDriver: true }),
      ]));
    anim(dot1, 0).start(); anim(dot2, 150).start(); anim(dot3, 300).start();
  }, []);
  return (
    <View style={s.typingWrap}>
      <Text style={s.typingHint}>MintU is thinking</Text>
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
  const [input, setInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [ctx, setCtx] = useState<Ctx>({ name: user?.name || 'there' });
  const [isPremium, setIsPremium] = useState(false);

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

  // Load the user's real spending context once — used for prompt enrichment AND for offline fallback.
  useEffect(() => {
    (async () => {
      try {
        const r = await api.get('/analytics/summary');
        const d = r.data || {};
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
  }, []);

  // Rich conversational welcome (recomputed once name loads)
  useEffect(() => {
    setMessages([{
      role: 'ai',
      text: `Hey ${user?.name || 'there'} 👋\n\nI'm your personal money coach — I see your spending and can help you save smarter.\n\nTap a quick prompt below, or ask me anything like **"where am I overspending?"**`,
      agent: 'AI Money Coach', agentEmoji: '✨', ts: Date.now(),
    }]);
  }, [user?.name]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || chatLoading) return;
    const userMsg: ChatMsg = { role: 'user', text: text.trim(), ts: Date.now() };
    const loadingMsg: ChatMsg = { role: 'ai', text: '', loading: true, ts: Date.now() };
    setMessages((prev) => [...prev, userMsg, loadingMsg]);
    setInput('');
    setChatLoading(true);
    const sentAt = Date.now();
    try {
      // Round 51d — use slow-path axios (30s timeout). AI agents often
      // take 12-25s on cold-CPU; with the default 12s the request would
      // time out and trigger the offline toast even though the device is
      // perfectly online and the lesson would have arrived in 16s.
      const res = await apiSlow.post('/ai/agent-chat', {
        message: text.trim(),
        lang,
        // Send context so backend can personalise (ignored if backend doesn't use it)
        context: {
          total_spend: ctx.totalSpend,
          savings_rate: ctx.savingsRate,
          top_category: ctx.topCategory,
          top_category_amount: ctx.topCatAmount,
        },
      });
      // Ensure min 600ms "thinking" delay so typing dots feel real, not jumpy.
      const elapsed = Date.now() - sentAt;
      if (elapsed < 600) await new Promise((r) => setTimeout(r, 600 - elapsed));
      const agentInfo = res.data?.agent;
      setMessages((prev) => [
        ...prev.slice(0, -1),
        {
          role: 'ai',
          text: res.data?.reply || smartFallback(text, ctx),
          agent: agentInfo?.name || 'AI Coach',
          agentEmoji: agentInfo?.emoji || '🤖',
          ts: Date.now(),
        },
      ]);
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

  const renderMsg = useCallback(({ item }: { item: ChatMsg }) => {
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
          {!item.loading && <Text style={[s.timeLabel, isUser && { textAlign: 'right' }]}>{formatTime(item.ts)}</Text>}
        </View>
      </View>
    );
  }, [s]);

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
        <FlashList
          ref={flatRef}
          data={messages}
          keyExtractor={(_, i) => String(i)}
          renderItem={renderMsg}
          contentContainerStyle={s.chatList}
          onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: true })}
          showsVerticalScrollIndicator={false}
        />

        {/* Empty-state big chip grid */}
        {showBigChips && (
          <ScrollView style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Unlimited-chats teaser — auto-hides for Pro users */}
            <PremiumUnlockTeaser context="ai_unlimited" />
            <Text style={s.chipSection}>📊 ANALYZE MY MONEY</Text>
            <View style={s.chipsWrap}>
              {PERSONAL_CHIPS.map((c, i) => (
                <TouchableOpacity key={`p${i}`} style={s.chip} onPress={() => sendMessage(c.label)} disabled={chatLoading}>
                  <Text style={s.chipEmoji}>{c.emoji}</Text>
                  <Text style={s.chipText}>{c.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={s.schoolHeaderRow}>
              <Text style={s.chipSection}>🎓 MONEY SCHOOL</Text>
              {!isPremium && (
                <View style={s.premiumBadge}>
                  <Ionicons name="lock-closed" size={10} color={COLORS.accent.primary} />
                  <Text style={s.premiumBadgeT}>PREMIUM</Text>
                </View>
              )}
            </View>
            {!isPremium ? (
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => router.push('/money-school' as any)}
                style={s.lockedSchoolCard}
                testID="ai-coach-school-locked"
              >
                <LinearGradient
                  colors={['#FFF7E8', '#FFE7C7']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={s.lockedSchoolInner}
                >
                  <View style={s.lockedSchoolIcon}>
                    <Ionicons name="school" size={22} color={COLORS.accent.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.lockedSchoolTitle}>Unlock AI Money School</Text>
                    <Text style={s.lockedSchoolSub} numberOfLines={2}>
                      Daily personalised lessons on SIPs, tax, mutual funds, credit score & more — included with Premium.
                    </Text>
                  </View>
                  <View style={s.lockedCTA}>
                    <Text style={s.lockedCTAT}>Upgrade</Text>
                    <Ionicons name="arrow-forward" size={13} color={COLORS.accent.primary} />
                  </View>
                </LinearGradient>
                {/* Locked preview chips — muted */}
                <View style={[s.chipsWrap, { opacity: 0.5 }]}>
                  {SCHOOL_CHIPS.slice(0, 4).map((c, i) => (
                    <View key={`locked-${i}`} style={[s.chip, s.chipSchool]}>
                      <Ionicons name="lock-closed" size={10} color={COLORS.text.muted} />
                      <Text style={s.chipText}>{c.label}</Text>
                    </View>
                  ))}
                </View>
              </TouchableOpacity>
            ) : (
              <View style={s.chipsWrap}>
                {SCHOOL_CHIPS.map((c, i) => (
                  <TouchableOpacity key={`s${i}`} style={[s.chip, s.chipSchool]} onPress={() => sendMessage(c.label)} disabled={chatLoading}>
                    <Text style={s.chipEmoji}>{c.emoji}</Text>
                    <Text style={s.chipText}>{c.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </ScrollView>
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
  headerIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: c.text.primary },
  headerSub: { fontSize: 11, color: c.text.muted, marginTop: 1 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.bg.card, justifyContent: 'center', alignItems: 'center' },
  chatList: { padding: 16, paddingBottom: 8 },
  msgRow: { flexDirection: 'row', marginBottom: 14 },
  msgRowUser: { justifyContent: 'flex-end' },
  msgRowAi: { justifyContent: 'flex-start' },
  aiAv: { width: 28, height: 28, borderRadius: 14, backgroundColor: c.accent.primary + '12', justifyContent: 'center', alignItems: 'center', marginRight: 8, marginTop: 18 },
  agentLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3, marginLeft: 4 },
  agentLabel: { fontSize: 10, fontWeight: '700', color: c.accent.primary },
  offlinePill: { fontSize: 8, fontWeight: '800', color: '#fff', backgroundColor: '#9CA3AF', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, letterSpacing: 0.5 },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleUser: { backgroundColor: c.accent.primary, borderBottomRightRadius: 4 },
  bubbleAi: { backgroundColor: c.bg.card, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: c.border.card },
  msgText: { fontSize: 14, lineHeight: 21, color: c.text.primary },
  timeLabel: { fontSize: 9, color: c.text.muted, marginTop: 3, marginLeft: 4 },
  typingWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2, paddingHorizontal: 2 },
  typingHint: { fontSize: 12, color: c.text.muted, fontStyle: 'italic' },

  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, paddingBottom: 8, gap: 7 },
  chipSection: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: c.text.muted, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 },
  schoolHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 16 },
  premiumBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: c.accent.primary + '1E', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, borderWidth: 1, borderColor: c.accent.primary + '44' },
  premiumBadgeT: { fontSize: 9, fontWeight: '900', color: c.accent.primary, letterSpacing: 0.6 },
  lockedSchoolCard: { marginHorizontal: 16, marginBottom: 10, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: c.accent.primary + '33' },
  lockedSchoolInner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  lockedSchoolIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.accent.primary + '33' },
  lockedSchoolTitle: { fontSize: 13.5, fontWeight: '900', color: c.text.primary },
  lockedSchoolSub: { fontSize: 11, color: c.text.secondary, marginTop: 3, lineHeight: 15 },
  lockedCTA: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: '#fff', borderRadius: 999 },
  lockedCTAT: { fontSize: 11.5, fontWeight: '900', color: c.accent.primary, letterSpacing: 0.2 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: c.bg.card, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: c.border.card },
  chipSchool: { backgroundColor: c.accent.primary + '12', borderColor: c.accent.primary + '30' },
  chipEmoji: { fontSize: 13 },
  chipText: { fontSize: 12, fontWeight: '500', color: c.text.secondary },

  stickyStrip: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  stickyChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: c.accent.primary + '10', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: c.accent.primary + '25' },
  chipTextSticky: { fontSize: 12, fontWeight: '600', color: c.text.primary },

  inputRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8, borderTopWidth: 1, borderTopColor: c.border.subtle, backgroundColor: '#fff' },
  chatInput: { flex: 1, backgroundColor: c.bg.card, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, color: c.text.primary, borderWidth: 1, borderColor: c.border.card, maxHeight: 90 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: c.accent.primary, justifyContent: 'center', alignItems: 'center', alignSelf: 'flex-end' },
}));
