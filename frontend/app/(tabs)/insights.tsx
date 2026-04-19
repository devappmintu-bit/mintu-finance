import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  TextInput, KeyboardAvoidingView, Platform, FlatList, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import api from '../../utils/api';
import { useAuthStore } from '../../store/authStore';
import { useLangStore } from '../../store/langStore';
import { COLORS, RADIUS, SPACING } from '../../utils/theme';

type CTAButton = { id: string; label: string; icon: string; action: string };
type ChatMsg = {
  role: 'user' | 'ai';
  text: string;
  loading?: boolean;
  agent?: string;
  agentEmoji?: string;
  ts?: number;
  mode?: 'no_data' | 'partial' | 'full';
  issues?: string[];
  ctas?: CTAButton[];
};

const QUICK_CHIPS = [
  { label: 'Am I overspending?', emoji: '📊' },
  { label: 'Where is my money going?', emoji: '💸' },
  { label: 'Set a realistic budget', emoji: '🎯' },
  { label: 'Who owes me money?', emoji: '🤝' },
  { label: 'How can I save more?', emoji: '💡' },
  { label: 'Weekly spending report', emoji: '📈' },
];

// Typing dots animation
const TypingDots = () => {
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
    anim(dot1, 0).start();
    anim(dot2, 150).start();
    anim(dot3, 300).start();
  }, []);
  return (
    <View style={{ flexDirection: 'row', gap: 4, padding: 6, alignItems: 'center' }}>
      {[dot1, dot2, dot3].map((d, i) => (
        <Animated.View key={i} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.accent.primary, opacity: d }} />
      ))}
    </View>
  );
};

export default function InsightsScreen() {
  const { user } = useAuthStore();
  const { lang } = useLangStore();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [ctx, setCtx] = useState<{ totalSpend?: number; savingsRate?: number; topCategory?: string; topCatAmount?: number }>({});
  const flatRef = useRef<FlatList>(null);

  // Load user's spending context once — used for prompt enrichment AND smart fallback
  useEffect(() => {
    api.get('/analytics/summary').then((r) => {
      const d = r.data || {};
      const cats = Array.isArray(d.categories) ? d.categories : [];
      const topCat = cats[0];
      setCtx({
        totalSpend: d.total_expense || 0,
        savingsRate: Math.round(d.savings_rate || 0),
        topCategory: topCat?.category || topCat?.name,
        topCatAmount: topCat?.amount,
      });
    }).catch(() => {});
  }, []);

  // Smart offline-aware fallback that uses the user's real numbers
  const smartFallback = (userText: string): string => {
    const lower = userText.toLowerCase();
    const savings = ctx.savingsRate ?? 0;
    const top = ctx.topCategory || 'Transport';
    const topAmt = ctx.topCatAmount || 0;
    const fmt = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
    if (/overspend|too much|spending.*on/.test(lower)) {
      return `Looks like I'm briefly offline 😅 — but based on your data:\n\nTop category is **${top}** at ${fmt(topAmt)}.\n\n💡 Cutting 20% here saves ${fmt(topAmt * 0.2)}/month. Try a weekly cap in Budget.`;
    }
    if (/how.*save|save.*₹|save \d/.test(lower)) {
      return `I'm offline for a sec, but here's a plan:\n\n• **${top}** is your biggest category (${fmt(topAmt)})\n• Reduce ~25% → saves ${fmt(topAmt * 0.25)}\n• Daily cash cap of ₹500 for impulse buys\n• Use the 50/30/20 rule`;
    }
    if (/analyze|report|last \d|week|days/.test(lower)) {
      const total = ctx.totalSpend ?? 0;
      return `Quick offline snapshot 📈\n\n• Spent: ${fmt(total)} (last 30d)\n• Avg/day: ${fmt(total / 30)}\n• Top: **${top}** (${fmt(topAmt)})\n• Savings rate: ${savings}%\n\nYou're ${savings >= 20 ? 'doing great' : 'below the 20% benchmark'}.`;
    }
    return `Hey ${user?.name || 'there'} 👋\n\nLooks like I'm offline 😅 But here's what I see:\n\n• Savings rate: **${savings}%** ${savings >= 20 ? '(great!)' : '(aim 20%)'}\n• Top category: ${top} (${fmt(topAmt)})\n\nWant tips to reduce your top category?`;
  };

  useEffect(() => {
    setMessages([{
      role: 'ai',
      text: `Hey ${user?.name || 'there'} 👋\n\nI'm your AI Money Coach — I can see your spending and help you save smarter.\n\nTap a quick prompt below or ask me anything like "where am I overspending?"`,
      agent: 'AI Money Coach',
      agentEmoji: '✨',
      ts: Date.now(),
    }]);
  }, [user?.name]);

  // ─── CTA Handler — routes the AI's suggested action button ───
  const handleCTA = (cta: CTAButton) => {
    if (!cta?.action) return;
    const [kind, payload] = cta.action.split(':');
    if (kind === 'navigate' && payload) {
      try { router.push(payload as any); } catch { /* noop */ }
    } else if (kind === 'modal') {
      // Trigger the relevant modal on target screen via query param
      if (payload === 'sms_scan') router.push('/transactions?openSmsScan=1' as any);
    }
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || chatLoading) return;
    const userMsg: ChatMsg = { role: 'user', text: text.trim(), ts: Date.now() };
    const loadingMsg: ChatMsg = { role: 'ai', text: '', loading: true, ts: Date.now() };
    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setInput('');
    setChatLoading(true);
    const sentAt = Date.now();
    try {
      const res = await api.post('/ai/agent-chat', {
        message: text.trim(),
        lang,
        context: {
          total_spend: ctx.totalSpend,
          savings_rate: ctx.savingsRate,
          top_category: ctx.topCategory,
          top_category_amount: ctx.topCatAmount,
        },
      });
      const elapsed = Date.now() - sentAt;
      if (elapsed < 600) await new Promise((r) => setTimeout(r, 600 - elapsed));
      const agentInfo = res.data.agent;
      setMessages(prev => [...prev.slice(0, -1), {
        role: 'ai',
        text: res.data.reply,
        agent: agentInfo?.name || 'AI Coach',
        agentEmoji: agentInfo?.emoji || '🤖',
        ts: Date.now(),
        mode: res.data.mode,
        issues: res.data.issues || [],
        ctas: res.data.ctas || [],
      }]);
    } catch {
      // Smart fallback — NEVER just "server unreachable"
      const elapsed = Date.now() - sentAt;
      if (elapsed < 600) await new Promise((r) => setTimeout(r, 600 - elapsed));
      setMessages(prev => [...prev.slice(0, -1), {
        role: 'ai',
        text: smartFallback(text),
        agent: 'AI Money Coach',
        agentEmoji: '📡',
        ts: Date.now(),
        mode: 'partial',
      }]);
    } finally { setChatLoading(false); }
  };

  const formatTime = (ts?: number) => {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };

  const renderChatMsg = ({ item, index }: { item: ChatMsg; index: number }) => {
    const isUser = item.role === 'user';
    const modeMeta = item.mode === 'no_data'
      ? { label: 'No data yet', color: '#94A3B8', bg: '#94A3B815' }
      : item.mode === 'partial'
      ? { label: 'Low confidence', color: '#F59E0B', bg: '#F59E0B15' }
      : item.mode === 'full'
      ? { label: 'High confidence', color: '#10B981', bg: '#10B98115' }
      : null;
    return (
      <View style={[styles.msgContainer, isUser ? styles.msgContainerUser : styles.msgContainerAi]}>
        {!isUser && (
          <View style={styles.aiAvatarWrap}>
            <View style={styles.aiAvatar}>
              <Ionicons name="sparkles" size={14} color={COLORS.accent.primary} />
            </View>
          </View>
        )}
        <View style={{ maxWidth: '85%', flex: isUser ? 0 : 1 }}>
          {!isUser && item.agent && !item.loading && (
            <View style={styles.aiMetaRow}>
              <Text style={styles.agentLabel}>{item.agentEmoji} {item.agent}</Text>
              {modeMeta && (
                <View style={[styles.modePill, { backgroundColor: modeMeta.bg }]}>
                  <View style={[styles.modeDot, { backgroundColor: modeMeta.color }]} />
                  <Text style={[styles.modePillText, { color: modeMeta.color }]}>{modeMeta.label}</Text>
                </View>
              )}
            </View>
          )}
          <View style={[styles.msgBubble, isUser ? styles.bubbleUser : styles.bubbleAi]}>
            {item.loading ? (
              <TypingDots />
            ) : (
              <Text style={[styles.msgText, isUser ? styles.textUser : styles.textAi]}>{item.text}</Text>
            )}
          </View>

          {/* Detected issues (if any) */}
          {!isUser && !item.loading && item.issues && item.issues.length > 0 && (
            <View style={styles.issuesBox}>
              <Ionicons name="alert-circle" size={13} color="#E65100" />
              <Text style={styles.issuesText}>{item.issues[0]}</Text>
            </View>
          )}

          {/* Partial-mode prompt: sharpen insights by adding more data */}
          {!isUser && !item.loading && item.mode === 'partial' && (
            <TouchableOpacity
              style={styles.sharpenBtn}
              onPress={() => router.push('/transactions' as any)}
              activeOpacity={0.85}
            >
              <View style={styles.sharpenIconWrap}>
                <Ionicons name="sparkles" size={14} color="#F59E0B" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sharpenTitle}>Sharpen insights</Text>
                <Text style={styles.sharpenSub}>Add more transactions to unlock high-confidence analysis</Text>
              </View>
              <Ionicons name="arrow-forward" size={14} color="#F59E0B" />
            </TouchableOpacity>
          )}

          {/* Action CTAs */}
          {!isUser && !item.loading && item.ctas && item.ctas.length > 0 && (
            <View style={styles.ctaRow}>
              {item.ctas.map((cta, i) => (
                <TouchableOpacity key={cta.id + i} style={styles.ctaBtn} onPress={() => handleCTA(cta)} activeOpacity={0.7}>
                  <Ionicons name={cta.icon as any} size={14} color={COLORS.accent.primary} />
                  <Text style={styles.ctaText} numberOfLines={1}>{cta.label}</Text>
                  <Ionicons name="arrow-forward" size={12} color={COLORS.accent.primary} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {!item.loading && (
            <Text style={[styles.timeLabel, isUser && { textAlign: 'right' }]}>{formatTime(item.ts)}</Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="sparkles" size={20} color={COLORS.accent.primary} />
        </View>
        <View>
          <Text style={styles.headerTitle}>AI Coach</Text>
          <Text style={styles.headerSub}>Your personal finance assistant</Text>
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }} keyboardVerticalOffset={100}>
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={(_, i) => String(i)}
          renderItem={renderChatMsg}
          contentContainerStyle={styles.chatList}
          onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: true })}
          showsVerticalScrollIndicator={false}
        />

        {/* Quick Chips */}
        {messages.length <= 2 && (
          <View style={styles.chipsWrap}>
            {QUICK_CHIPS.map((chip, i) => (
              <TouchableOpacity key={i} style={styles.chip} onPress={() => sendMessage(chip.label)} disabled={chatLoading}>
                <Text style={styles.chipEmoji}>{chip.emoji}</Text>
                <Text style={styles.chipText}>{chip.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Input */}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.chatInput}
            value={input}
            onChangeText={setInput}
            placeholder="Ask your AI coach..."
            placeholderTextColor={COLORS.text.muted}
            onSubmitEditing={() => sendMessage(input)}
            returnKeyType="send"
            editable={!chatLoading}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || chatLoading) && styles.sendDisabled]}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg.primary },
  // Header
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border.subtle },
  headerIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.accent.primary + '12', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text.primary },
  headerSub: { fontSize: 12, color: COLORS.text.muted, marginTop: 1 },
  // Chat
  chatList: { padding: SPACING.lg, paddingBottom: 8 },
  msgContainer: { flexDirection: 'row', marginBottom: 16 },
  msgContainerUser: { justifyContent: 'flex-end' },
  msgContainerAi: { justifyContent: 'flex-start' },
  aiAvatarWrap: { marginRight: 8, marginTop: 20 },
  aiAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.accent.primary + '12', justifyContent: 'center', alignItems: 'center' },
  agentLabel: { fontSize: 11, fontWeight: '600', color: COLORS.accent.primary },
  aiMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6, marginLeft: 4 },
  modePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  modeDot: { width: 6, height: 6, borderRadius: 3 },
  modePillText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  msgBubble: { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12 },
  bubbleUser: { backgroundColor: COLORS.accent.primary, borderBottomRightRadius: 6 },
  bubbleAi: { backgroundColor: COLORS.bg.card, borderBottomLeftRadius: 6, borderWidth: 1, borderColor: COLORS.border.card },
  msgText: { fontSize: 14, lineHeight: 21 },
  textUser: { color: '#fff' },
  textAi: { color: COLORS.text.primary },
  timeLabel: { fontSize: 10, color: COLORS.text.muted, marginTop: 4, marginLeft: 4 },
  // Detected issues
  issuesBox: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFF4E5', borderLeftWidth: 3, borderLeftColor: '#E65100', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, marginTop: 8 },
  issuesText: { flex: 1, fontSize: 12, color: '#7C2D12', fontWeight: '500', lineHeight: 17 },
  // Partial-mode sharpen insights nudge
  sharpenBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#F59E0B40', borderRadius: 12, padding: 10, marginTop: 8 },
  sharpenIconWrap: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F59E0B20', justifyContent: 'center', alignItems: 'center' },
  sharpenTitle: { fontSize: 12, fontWeight: '800', color: '#92400E' },
  sharpenSub: { fontSize: 11, color: '#B45309', marginTop: 1 },
  // CTA action buttons
  ctaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  ctaBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.accent.primary + '12', borderWidth: 1, borderColor: COLORS.accent.primary + '35', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  ctaText: { fontSize: 12, fontWeight: '700', color: COLORS.accent.primary, maxWidth: 180 },
  // Chips
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: SPACING.lg, paddingBottom: 8, gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.bg.card, paddingHorizontal: 14, paddingVertical: 10, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border.card },
  chipEmoji: { fontSize: 14 },
  chipText: { fontSize: 13, fontWeight: '500', color: COLORS.text.secondary },
  // Input
  inputRow: { flexDirection: 'row', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, gap: 8, borderTopWidth: 1, borderTopColor: COLORS.border.subtle, backgroundColor: COLORS.bg.primary },
  chatInput: { flex: 1, backgroundColor: COLORS.bg.card, borderRadius: 24, paddingHorizontal: 18, paddingVertical: 12, fontSize: 15, color: COLORS.text.primary, borderWidth: 1, borderColor: COLORS.border.card, maxHeight: 100 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.accent.primary, justifyContent: 'center', alignItems: 'center', alignSelf: 'flex-end' },
  sendDisabled: { opacity: 0.4 },
});
