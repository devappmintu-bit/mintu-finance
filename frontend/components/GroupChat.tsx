import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, Modal, ScrollView,
  AppState, AppStateStatus,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import api from '../utils/api';
import { useAuthStore } from '../store/authStore';
import { useLangStore } from '../store/langStore';
import { t } from '../utils/i18n';
import { COLORS, RADIUS, SPACING } from '../utils/theme';
import { makeStyles } from '../utils/makeStyles';
import { MEMBER_COLORS, STICKERS } from './split/theme';
import ExpenseMessage from './split/ExpenseMessage';
import ExpensesTab from './split/ExpensesTab';
import Toast from 'react-native-toast-message';
import { FlashList, type FlashListRef } from '@shopify/flash-list';

// Format currency for display (₹1.2K, ₹12K, ₹1.2L)
const fmtCompact = (n: number) => {
  const v = Math.round(Math.abs(n));
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)}K`;
  return `₹${v.toLocaleString('en-IN')}`;
};

interface Props {
  group: any;
  onClose: () => void;
  onAddExpense: (group: any) => void;
  onManage: (group: any) => void;
  onEditExpense?: (expense: any, group: any) => void;
  onDirectPay?: (debt: any, group: any) => void;
  onRemind?: (debt: any, group: any) => void;
}

export default function GroupChat({ group, onClose, onAddExpense, onManage, onEditExpense, onDirectPay, onRemind }: Props) {
  const s = useStyles();
  const { user } = useAuthStore();
  const { lang } = useLangStore();
  const [tab, setTab] = useState<'chat' | 'expenses'>('chat');
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const flatRef = useRef<FlashListRef<any>>(null);

  // When true, further polls halt — the group is gone (deleted / user
  // removed). Prevents the 404-spam loops we were seeing in backend logs.
  const goneRef = useRef(false);

  const loadMessages = useCallback(async () => {
    if (goneRef.current) return;
    try {
      const res = await api.get(`/split/groups/${group.id}/messages`);
      setMessages(res.data || []);
    } catch (e: any) {
      if (e?.response?.status === 404) {
        goneRef.current = true;
        Toast.show({ type: 'info', text1: 'Group no longer available' });
        try { onClose(); } catch {}
      }
    }
  }, [group.id, onClose]);

  const loadSummary = useCallback(async () => {
    if (goneRef.current) return;
    try {
      const res = await api.get(`/split/groups/${group.id}/summary`);
      setSummary(res.data);
    } catch (e: any) {
      if (e?.response?.status === 404) {
        goneRef.current = true;
        try { onClose(); } catch {}
      }
    }
  }, [group.id, onClose]);

  useEffect(() => { goneRef.current = false; loadMessages(); loadSummary(); }, [group.id]);

  // Adaptive polling: 8s when foreground+active, pauses when app goes to
  // background, resumes (with immediate refresh) on foreground. Previously
  // fired every 5s unconditionally — 1 req / 5s / user × chats open is a
  // lot of baseline traffic for no benefit when the user isn't looking.
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    let appStateSub: { remove: () => void } | null = null;

    const FG_INTERVAL = 8000;   // ~2× slower than before while focused
    const BG_INTERVAL = 60000;  // 1 min when backgrounded (last-resort safety)

    const start = (ms: number) => {
      if (interval) clearInterval(interval);
      interval = setInterval(() => {
        if (!goneRef.current) loadMessages();
      }, ms);
    };

    // Start with foreground cadence
    start(FG_INTERVAL);

    const handle = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        // Returning to foreground — immediate refresh + fast cadence
        if (!goneRef.current) loadMessages();
        start(FG_INTERVAL);
      } else if (nextState === 'background' || nextState === 'inactive') {
        start(BG_INTERVAL);
      }
    };
    appStateSub = AppState.addEventListener('change', handle);

    return () => {
      if (interval) clearInterval(interval);
      if (appStateSub) appStateSub.remove();
    };
  }, [loadMessages]);

  const sendMessage = async (content: string, type = 'text') => {
    if (!content.trim() && type === 'text') return;
    setSending(true);
    try {
      await api.post(`/split/groups/${group.id}/messages`, { content: content.trim(), type });
      setInput('');
      setShowStickers(false);
      await loadMessages();
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 200);
    } catch { Toast.show({ type: 'error', text1: 'Error', text2: 'Could not send' }); }
    finally { setSending(false); }
  };

  const sendSticker = (emoji: string) => sendMessage(emoji, 'sticker');

  const formatTime = (iso: string) => {
    try { return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
  };
  const formatDate = (iso: string) => {
    try { return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return ''; }
  };

  const renderMsg = useCallback(({ item }: { item: any }) => {
    const isMe = item.sender_id === user?.id;

    // System message
    if (item.type === 'system') {
      return (
        <View style={s.systemRow}>
          <View style={s.systemLine} />
          <Text style={s.systemText}>{item.content}</Text>
          <View style={s.systemLine} />
        </View>
      );
    }

    // Expense card (extracted to components/split/ExpenseMessage.tsx)
    if (item.type === 'expense' && item.expense_data) {
      return <ExpenseMessage item={item} isMe={isMe} formatTime={formatTime} />;
    }

    // Sticker
    if (item.type === 'sticker') {
      return (
        <View style={[s.msgRow, isMe ? s.msgRowR : s.msgRowL]}>
          {!isMe && <View style={[s.avatar, { backgroundColor: MEMBER_COLORS[1] + '20' }]}><Text style={[s.avatarT, { color: MEMBER_COLORS[1] }]}>{(item.sender_name || '?')[0]}</Text></View>}
          <View>
            {!isMe && <Text style={s.senderName}>{item.sender_name}</Text>}
            <Text style={s.stickerText}>{item.content}</Text>
            <Text style={[s.time, isMe && { textAlign: 'right' }]}>{formatTime(item.created_at)}</Text>
          </View>
        </View>
      );
    }

    // Text message
    return (
      <View style={[s.msgRow, isMe ? s.msgRowR : s.msgRowL]}>
        {!isMe && <View style={[s.avatar, { backgroundColor: MEMBER_COLORS[2] + '20' }]}><Text style={[s.avatarT, { color: MEMBER_COLORS[2] }]}>{(item.sender_name || '?')[0]}</Text></View>}
        <View style={{ maxWidth: '78%' }}>
          {!isMe && <Text style={s.senderName}>{item.sender_name}</Text>}
          <View style={[s.bubble, isMe ? s.bubbleMe : s.bubbleOther]}>
            <Text style={[s.bubbleText, isMe && { color: '#fff' }]}>{item.content}</Text>
          </View>
          <Text style={[s.time, isMe && { textAlign: 'right' }]}>{formatTime(item.created_at)}</Text>
        </View>
      </View>
    );
  }, [user?.id, s]);

  // Expenses tab content is now in components/split/ExpensesTab.tsx

  const memberCount = group.members?.length || summary?.member_count || 0;
  const groupInitials = (group.members || []).slice(0, 3);

  // === Net position from summary.simplified_debts (You get / You owe / Settled) ===
  const { netAmount, netState } = useMemo(() => {
    const me = user?.id;
    if (!me || !summary?.simplified_debts) return { netAmount: 0, netState: 'settled' as 'get' | 'owe' | 'settled' };
    let owe = 0, get = 0;
    (summary.simplified_debts || []).forEach((d: any) => {
      if (d.from_id === me) owe += Number(d.amount || 0);
      else if (d.to_id === me) get += Number(d.amount || 0);
    });
    const n = get - owe;
    let st: 'get' | 'owe' | 'settled' = 'settled';
    if (Math.abs(n) > 0.5) st = n > 0 ? 'get' : 'owe';
    return { netAmount: n, netState: st };
  }, [summary, user?.id]);

  // Top debt row (for quick-settle CTA in header)
  const topDebtToMe = useMemo(() => {
    const me = user?.id;
    if (!me || !summary?.simplified_debts) return null;
    const mine = (summary.simplified_debts || []).filter((d: any) => d.from_id === me || d.to_id === me);
    mine.sort((a: any, b: any) => Number(b.amount || 0) - Number(a.amount || 0));
    return mine[0] || null;
  }, [summary, user?.id]);

  const heroGradient: [string, string] =
    netState === 'get' ? [COLORS.state.successAlt, '#047857']
    : netState === 'owe' ? [COLORS.accent.brand, COLORS.accent.brandDark]
    : [COLORS.text.muted, '#374151'];

  const haptic = () => { if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };

  return (
    <SafeAreaView style={s.container}>
      {/* === PREMIUM HEADER — saffron hero with net-balance + quick actions === */}
      <LinearGradient colors={heroGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.heroHeader}>
        <View style={s.heroTopRow}>
          <TouchableOpacity onPress={() => { haptic(); onClose(); }} hitSlop={14} style={s.heroBackBtn} testID="gc-back">
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={s.heroAvatars}>
            {groupInitials.slice(0, 3).map((m: any, i: number) => (
              <View key={i} style={[s.heroAv, { marginLeft: i > 0 ? -10 : 0, zIndex: 3 - i }]}>
                <Text style={s.heroAvT}>{(m.name || '?')[0]?.toUpperCase()}</Text>
              </View>
            ))}
            {memberCount > 3 && (
              <View style={[s.heroAv, { marginLeft: -10, backgroundColor: 'rgba(0,0,0,0.2)' }]}>
                <Text style={s.heroAvT}>+{memberCount - 3}</Text>
              </View>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.heroName} numberOfLines={1}>{group.name}</Text>
            <Text style={s.heroSub}>{memberCount} member{memberCount === 1 ? '' : 's'}</Text>
          </View>
          <TouchableOpacity onPress={() => { haptic(); onManage(group); }} hitSlop={14} style={s.heroMoreBtn} testID="gc-manage">
            <Ionicons name="ellipsis-vertical" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={s.netRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.netEyebrow}>
              {netState === 'get' ? '🟢 YOU GET' : netState === 'owe' ? '🔴 YOU OWE' : '⚪ ALL SETTLED'}
            </Text>
            <Text style={s.netAmount} numberOfLines={1}>
              {netState === 'settled' ? '₹0' : `${netState === 'get' ? '+' : '−'}${fmtCompact(Math.abs(netAmount))}`}
            </Text>
          </View>
          {netState === 'owe' && topDebtToMe && onDirectPay && (
            <TouchableOpacity
              onPress={() => { haptic(); onDirectPay(topDebtToMe, group); }}
              activeOpacity={0.88}
              style={s.settleChip}
              testID="gc-settle"
            >
              <Ionicons name="flash" size={13} color={COLORS.accent.brandDark} />
              <Text style={s.settleChipTxt}>Settle</Text>
            </TouchableOpacity>
          )}
          {netState === 'get' && topDebtToMe && onRemind && (
            <TouchableOpacity
              onPress={() => { haptic(); onRemind(topDebtToMe, group); }}
              activeOpacity={0.88}
              style={s.settleChip}
              testID="gc-remind"
            >
              <Ionicons name="notifications" size={13} color="#047857" />
              <Text style={[s.settleChipTxt, { color: '#047857' }]}>Remind</Text>
            </TouchableOpacity>
          )}
        </View>
      </LinearGradient>

      {/* Tabs */}
      <View style={s.tabs}>
        <TouchableOpacity style={[s.tab, tab === 'chat' && s.tabOn]} onPress={() => setTab('chat')}>
          <Text style={[s.tabText, tab === 'chat' && s.tabTextOn]}>{t('chat', lang) !== 'chat' ? t('chat', lang) : 'Chat'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tab, tab === 'expenses' && s.tabOn]} onPress={() => { setTab('expenses'); loadSummary(); }}>
          <Text style={[s.tabText, tab === 'expenses' && s.tabTextOn]}>{t('expenses', lang)}</Text>
        </TouchableOpacity>
      </View>

      {tab === 'expenses' ? (
        <ExpensesTab
          summary={summary}
          currentUserId={user?.id}
          onAddExpense={() => onAddExpense(group)}
          onEditExpense={onEditExpense ? (exp: any) => onEditExpense(exp, group) : undefined}
          onDirectPay={onDirectPay ? (debt: any) => onDirectPay(debt, group) : undefined}
          onRemind={onRemind ? (debt: any) => onRemind(debt, group) : undefined}
          onDeleteExpense={async (exp: any) => {
            // Optimistic remove from summary
            setSummary((prev: any) => prev ? { ...prev, recent_expenses: (prev.recent_expenses || []).filter((e: any) => (e.id || e._id) !== (exp.id || exp._id)) } : prev);
            try {
              await api.delete(`/split/expenses/${exp.id || exp._id}`);
              Toast.show({ type: 'success', text1: t('expense_removed', lang) });
              loadSummary();
            } catch {
              Toast.show({ type: 'error', text1: t('error', lang) });
              loadSummary();
            }
          }}
        />
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }} keyboardVerticalOffset={10}>
          <FlashList
            ref={flatRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMsg}
            contentContainerStyle={s.chatList}
            onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: true })}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={s.emptyChat}>
                <Text style={s.emptyChatEmoji}>💬</Text>
                <Text style={s.emptyChatTitle}>{group.name}</Text>
                <Text style={s.emptyChatSub}>Chat, plan, and keep track of who owes what in one place.</Text>
              </View>
            }
          />

          {/* Sticker picker */}
          {showStickers && (
            <View style={s.stickerBar}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
                {STICKERS.map((st, i) => (
                  <TouchableOpacity key={i} style={s.stickerBtn} onPress={() => sendSticker(st)}>
                    <Text style={s.stickerEmoji}>{st}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Input bar */}
          <View style={s.inputBar}>
            <TouchableOpacity style={s.splitBtn} onPress={() => onAddExpense(group)}>
              <Text style={s.splitBtnT}>Split expense</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowStickers(!showStickers)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name={showStickers ? 'close-circle' : 'happy-outline'} size={24} color={showStickers ? COLORS.accent.primary : COLORS.text.muted} />
            </TouchableOpacity>
            <TextInput style={s.msgInput} value={input} onChangeText={setInput} placeholder="Message..." placeholderTextColor={COLORS.text.muted}
              onSubmitEditing={() => sendMessage(input)} returnKeyType="send" editable={!sending} />
            <TouchableOpacity style={[s.sendBtn, (!input.trim() || sending) && { opacity: 0.3 }]} onPress={() => sendMessage(input)} disabled={!input.trim() || sending}>
              <Ionicons name="send" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.bg.primary },
  // === Premium Hero Header ===
  heroHeader: {
    paddingTop: 4,
    paddingBottom: 14,
    paddingHorizontal: 14,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    gap: 12,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  heroBackBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  heroMoreBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  heroAvatars: { flexDirection: 'row' },
  heroAv: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.28)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)', justifyContent: 'center', alignItems: 'center' },
  heroAvT: { fontSize: 12, fontWeight: '900', color: '#fff' },
  heroName: { fontSize: 16, fontWeight: '900', color: '#fff', letterSpacing: -0.2 },
  heroSub: { fontSize: 11, color: 'rgba(255,255,255,0.82)', fontWeight: '700', marginTop: 1 },
  netRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4, paddingTop: 2 },
  netEyebrow: { fontSize: 9.5, fontWeight: '900', letterSpacing: 1.1, color: 'rgba(255,255,255,0.85)' },
  netAmount: { fontSize: 30, fontWeight: '900', color: '#fff', letterSpacing: -1, marginTop: 2 },
  settleChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: '#fff' },
  settleChipTxt: { fontSize: 12, fontWeight: '900', color: COLORS.accent.brandDark, letterSpacing: -0.1 },

  // Legacy header (kept for reference)
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border.subtle },
  headerAvatars: { flexDirection: 'row' },
  headerAv: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: c.bg.primary },
  headerAvT: { fontSize: 12, fontWeight: '700' },
  headerName: { fontSize: 16, fontWeight: '700', color: c.text.primary },
  headerSub: { fontSize: 11, color: c.text.muted },
  // Tabs
  tabs: { flexDirection: 'row', borderBottomWidth: 2, borderBottomColor: c.border.subtle },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabOn: { borderBottomWidth: 2, borderBottomColor: c.accent.primary, marginBottom: -2 },
  tabText: { fontSize: 14, fontWeight: '600', color: c.text.muted },
  tabTextOn: { color: c.accent.primary },
  // Chat
  chatList: { padding: 16, paddingBottom: 8 },
  emptyChat: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40 },
  emptyChatEmoji: { fontSize: 48, marginBottom: 12 },
  emptyChatTitle: { fontSize: 20, fontWeight: '700', color: c.text.primary, marginBottom: 8 },
  emptyChatSub: { fontSize: 14, color: c.text.muted, textAlign: 'center', lineHeight: 21 },
  // Messages
  msgRow: { flexDirection: 'row', marginBottom: 12 },
  msgRowL: { justifyContent: 'flex-start' },
  msgRowR: { justifyContent: 'flex-end' },
  avatar: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginRight: 8, marginTop: 16 },
  avatarT: { fontSize: 12, fontWeight: '700' },
  senderName: { fontSize: 11, fontWeight: '600', color: c.accent.primary, marginBottom: 3, marginLeft: 2 },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, maxWidth: '100%' },
  bubbleMe: { backgroundColor: c.accent.primary, borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: c.bg.card, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: c.border.card },
  bubbleText: { fontSize: 14, lineHeight: 20, color: c.text.primary },
  time: { fontSize: 9, color: c.text.muted, marginTop: 3, marginLeft: 2 },
  // Sticker
  stickerText: { fontSize: 44, marginVertical: 4 },
  // System
  systemRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 8, gap: 8 },
  systemLine: { flex: 1, height: 1, backgroundColor: c.border.subtle },
  systemText: { fontSize: 11, color: c.text.muted, textAlign: 'center' },
  // Expense card
  // Sticker bar
  stickerBar: { paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.border.subtle, backgroundColor: c.bg.card },
  stickerBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: c.bg.primary, justifyContent: 'center', alignItems: 'center' },
  stickerEmoji: { fontSize: 24 },
  // Input bar
  inputBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.border.subtle },
  splitBtn: { backgroundColor: c.accent.primary + '12', paddingHorizontal: 14, paddingVertical: 9, borderRadius: RADIUS.full, borderWidth: 1, borderColor: c.accent.primary + '25' },
  splitBtnT: { fontSize: 12, fontWeight: '700', color: c.accent.primary },
  msgInput: { flex: 1, backgroundColor: c.bg.card, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, fontSize: 14, color: c.text.primary, borderWidth: 1, borderColor: c.border.card },
  sendBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: c.accent.primary, justifyContent: 'center', alignItems: 'center' },
  // Expenses tab
}));
