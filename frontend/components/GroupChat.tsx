import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, FlatList,
  KeyboardAvoidingView, Platform, Modal, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../utils/api';
import { useAuthStore } from '../store/authStore';
import { COLORS, RADIUS, SPACING } from '../utils/theme';
import Toast from 'react-native-toast-message';

const STICKERS = ['😂', '🔥', '💰', '🎉', '👍', '❤️', '😭', '🤑', '💸', '🙏', '👏', '🍕', '🛒', '✈️', '🏠', '🎯', '💪', '🤝', '😎', '🥳', '☕', '🍺', '🎬', '⛽'];
const MEMBER_COLORS = ['#E65100', '#FFB300', '#2E7D32', '#D32F2F', '#6A1B9A', '#C62828', '#1565C0', '#F57F17'];

interface Props {
  group: any;
  onClose: () => void;
  onAddExpense: (group: any) => void;
  onManage: (group: any) => void;
}

export default function GroupChat({ group, onClose, onAddExpense, onManage }: Props) {
  const { user } = useAuthStore();
  const [tab, setTab] = useState<'chat' | 'expenses'>('chat');
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const flatRef = useRef<FlatList>(null);

  const loadMessages = useCallback(async () => {
    try {
      const res = await api.get(`/split/groups/${group.id}/messages`);
      setMessages(res.data || []);
    } catch { }
  }, [group.id]);

  const loadSummary = useCallback(async () => {
    try {
      const res = await api.get(`/split/groups/${group.id}/summary`);
      setSummary(res.data);
    } catch { }
  }, [group.id]);

  useEffect(() => { loadMessages(); loadSummary(); }, []);

  // Poll for new messages every 5s
  useEffect(() => {
    const interval = setInterval(loadMessages, 5000);
    return () => clearInterval(interval);
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

  const renderMsg = ({ item }: { item: any }) => {
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

    // Expense card (GPay-style: big amount, avatars, progress bar, X/N paid)
    if (item.type === 'expense' && item.expense_data) {
      const ed = item.expense_data;
      const totalSplits = ed.split_count || ed.splits_count || 0;
      // Count paid: 1 (the payer) + anyone with a settlement toward this expense (approximated via group-level)
      const paidCount = ed.paid_count != null ? ed.paid_count : 1;
      const progressPct = totalSplits > 0 ? Math.min(100, (paidCount / totalSplits) * 100) : 100;
      const isFullyPaid = paidCount >= totalSplits;
      const memberNames: string[] = ed.member_names || [];
      return (
        <View style={[s.msgRow, isMe ? s.msgRowR : s.msgRowL]}>
          {!isMe && <View style={[s.avatar, { backgroundColor: MEMBER_COLORS[0] + '20' }]}><Text style={[s.avatarT, { color: MEMBER_COLORS[0] }]}>{(item.sender_name || '?')[0]}</Text></View>}
          <View style={{ maxWidth: '82%' }}>
            {!isMe && <Text style={s.senderName}>{item.sender_name}</Text>}
            <View style={s.expenseCard}>
              <View style={s.expHead}>
                <View style={[s.expEmojiWrap]}>
                  <Ionicons name="receipt" size={16} color={COLORS.accent.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.expTitle} numberOfLines={1}>{item.content}</Text>
                  <Text style={s.expSub} numberOfLines={1}>Paid by {ed.paid_by} · {totalSplits} {totalSplits === 1 ? 'person' : 'people'}</Text>
                </View>
              </View>
              <Text style={s.expenseAmount}>₹{Number(ed.amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</Text>
              {/* Avatar stack */}
              {memberNames.length > 0 && (
                <View style={s.avatarStack}>
                  {memberNames.slice(0, 5).map((nm, i) => (
                    <View key={i} style={[s.stackAvatar, { backgroundColor: MEMBER_COLORS[i % MEMBER_COLORS.length] + '22', marginLeft: i === 0 ? 0 : -10, zIndex: 5 - i }]}>
                      <Text style={[s.stackAvT, { color: MEMBER_COLORS[i % MEMBER_COLORS.length] }]}>{(nm || '?')[0].toUpperCase()}</Text>
                    </View>
                  ))}
                  {memberNames.length > 5 && (
                    <View style={[s.stackAvatar, { backgroundColor: COLORS.bg.secondary, marginLeft: -10 }]}>
                      <Text style={[s.stackAvT, { color: COLORS.text.secondary }]}>+{memberNames.length - 5}</Text>
                    </View>
                  )}
                </View>
              )}
              {/* Progress bar */}
              <View style={s.progressTrack}>
                <View style={[s.progressFill, { width: `${progressPct}%`, backgroundColor: isFullyPaid ? COLORS.accent.moneyIn : COLORS.accent.primary }]} />
              </View>
              <View style={s.expFooter}>
                <Text style={[s.expStatus, isFullyPaid && { color: COLORS.accent.moneyIn }]}>
                  {isFullyPaid ? '✅ All settled' : `${paidCount} of ${totalSplits} paid`}
                </Text>
                {!isFullyPaid && (
                  <Text style={s.expPerPerson}>₹{Math.round((ed.amount || 0) / Math.max(totalSplits, 1)).toLocaleString('en-IN')} each</Text>
                )}
              </View>
            </View>
            <Text style={[s.time, isMe && { textAlign: 'right' }]}>{formatTime(item.created_at)}</Text>
          </View>
        </View>
      );
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
  };

  // === EXPENSES TAB ===
  const renderExpensesTab = () => {
    const owedByYou = summary?.simplified_debts?.filter((d: any) => d.from_id === user?.id).reduce((s: number, d: any) => s + d.amount, 0) || 0;
    const owedToYou = summary?.simplified_debts?.filter((d: any) => d.to_id === user?.id).reduce((s: number, d: any) => s + d.amount, 0) || 0;

    return (
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {/* Balance summary */}
        <View style={s.balanceCard}>
          <View style={s.balHalf}>
            <Text style={s.balAmount}>₹{owedByYou.toFixed(0)}</Text>
            <Text style={s.balLabel}>Owed by you</Text>
          </View>
          <View style={s.balDivider} />
          <View style={s.balHalf}>
            <Text style={[s.balAmount, { color: COLORS.accent.moneyIn }]}>₹{owedToYou.toFixed(0)}</Text>
            <Text style={s.balLabel}>Owed to you</Text>
          </View>
        </View>

        {/* Debts */}
        {summary?.simplified_debts?.length > 0 && (
          <>
            <Text style={s.secTitle}>Settle Up</Text>
            {summary.simplified_debts.map((d: any, i: number) => (
              <View key={i} style={s.debtRow}>
                <View style={[s.avatar, { backgroundColor: MEMBER_COLORS[i % 8] + '20' }]}>
                  <Text style={[s.avatarT, { color: MEMBER_COLORS[i % 8] }]}>{(d.from_name || '?')[0]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.debtNames}>{d.from_name} → {d.to_name}</Text>
                </View>
                <Text style={s.debtAmt}>₹{d.amount.toFixed(0)}</Text>
              </View>
            ))}
          </>
        )}

        {/* Recent expenses */}
        {summary?.recent_expenses?.length > 0 && (
          <>
            <Text style={[s.secTitle, { marginTop: 16 }]}>Recent Expenses</Text>
            {summary.recent_expenses.map((e: any, i: number) => (
              <View key={i} style={s.expRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.expDesc}>{e.description}</Text>
                  <Text style={s.expMeta}>Paid by {e.paid_by_name}</Text>
                </View>
                <Text style={s.expAmt}>₹{e.amount.toFixed(0)}</Text>
              </View>
            ))}
          </>
        )}

        <TouchableOpacity style={s.addExpBtn} onPress={() => onAddExpense(group)}>
          <Text style={s.addExpBtnT}>Split expense</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  const memberCount = group.members?.length || summary?.member_count || 0;
  const groupInitials = (group.members || []).slice(0, 3);

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text.primary} />
        </TouchableOpacity>
        <View style={s.headerAvatars}>
          {groupInitials.slice(0, 3).map((m: any, i: number) => (
            <View key={i} style={[s.headerAv, { marginLeft: i > 0 ? -8 : 0, backgroundColor: MEMBER_COLORS[i % 8] + '20', zIndex: 3 - i }]}>
              <Text style={[s.headerAvT, { color: MEMBER_COLORS[i % 8] }]}>{(m.name || '?')[0]}</Text>
            </View>
          ))}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.headerName} numberOfLines={1}>{group.name}</Text>
          <Text style={s.headerSub}>{memberCount} members</Text>
        </View>
        <TouchableOpacity onPress={() => onManage(group)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="ellipsis-vertical" size={20} color={COLORS.text.muted} />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={s.tabs}>
        <TouchableOpacity style={[s.tab, tab === 'chat' && s.tabOn]} onPress={() => setTab('chat')}>
          <Text style={[s.tabText, tab === 'chat' && s.tabTextOn]}>Chat</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tab, tab === 'expenses' && s.tabOn]} onPress={() => { setTab('expenses'); loadSummary(); }}>
          <Text style={[s.tabText, tab === 'expenses' && s.tabTextOn]}>Expenses</Text>
        </TouchableOpacity>
      </View>

      {tab === 'expenses' ? renderExpensesTab() : (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }} keyboardVerticalOffset={10}>
          <FlatList
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

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg.primary },
  // Header
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border.subtle },
  headerAvatars: { flexDirection: 'row' },
  headerAv: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: COLORS.bg.primary },
  headerAvT: { fontSize: 12, fontWeight: '700' },
  headerName: { fontSize: 16, fontWeight: '700', color: COLORS.text.primary },
  headerSub: { fontSize: 11, color: COLORS.text.muted },
  // Tabs
  tabs: { flexDirection: 'row', borderBottomWidth: 2, borderBottomColor: COLORS.border.subtle },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabOn: { borderBottomWidth: 2, borderBottomColor: COLORS.accent.primary, marginBottom: -2 },
  tabText: { fontSize: 14, fontWeight: '600', color: COLORS.text.muted },
  tabTextOn: { color: COLORS.accent.primary },
  // Chat
  chatList: { padding: 16, paddingBottom: 8 },
  emptyChat: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40 },
  emptyChatEmoji: { fontSize: 48, marginBottom: 12 },
  emptyChatTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text.primary, marginBottom: 8 },
  emptyChatSub: { fontSize: 14, color: COLORS.text.muted, textAlign: 'center', lineHeight: 21 },
  // Messages
  msgRow: { flexDirection: 'row', marginBottom: 12 },
  msgRowL: { justifyContent: 'flex-start' },
  msgRowR: { justifyContent: 'flex-end' },
  avatar: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginRight: 8, marginTop: 16 },
  avatarT: { fontSize: 12, fontWeight: '700' },
  senderName: { fontSize: 11, fontWeight: '600', color: COLORS.accent.primary, marginBottom: 3, marginLeft: 2 },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, maxWidth: '100%' },
  bubbleMe: { backgroundColor: COLORS.accent.primary, borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: COLORS.bg.card, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: COLORS.border.card },
  bubbleText: { fontSize: 14, lineHeight: 20, color: COLORS.text.primary },
  time: { fontSize: 9, color: COLORS.text.muted, marginTop: 3, marginLeft: 2 },
  // Sticker
  stickerText: { fontSize: 44, marginVertical: 4 },
  // System
  systemRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 8, gap: 8 },
  systemLine: { flex: 1, height: 1, backgroundColor: COLORS.border.subtle },
  systemText: { fontSize: 11, color: COLORS.text.muted, textAlign: 'center' },
  // Expense card
  expenseCard: {
    backgroundColor: COLORS.bg.card,
    borderRadius: RADIUS.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border.card,
    minWidth: 240,
    gap: 10,
  },
  expHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  expEmojiWrap: { width: 32, height: 32, borderRadius: 10, backgroundColor: COLORS.accent.primary + '15', justifyContent: 'center', alignItems: 'center' },
  expTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text.primary },
  expSub: { fontSize: 11, color: COLORS.text.muted, marginTop: 1 },
  expenseAmount: { fontSize: 28, fontWeight: '800', color: COLORS.text.primary },
  avatarStack: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  stackAvatar: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: COLORS.bg.card },
  stackAvT: { fontSize: 11, fontWeight: '700' },
  progressTrack: { height: 4, backgroundColor: COLORS.bg.secondary, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  expFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  expStatus: { fontSize: 12, fontWeight: '700', color: COLORS.accent.primary },
  expPerPerson: { fontSize: 11, color: COLORS.text.muted, fontWeight: '600' },
  // Sticker bar
  stickerBar: { paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: COLORS.border.subtle, backgroundColor: COLORS.bg.card },
  stickerBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: COLORS.bg.primary, justifyContent: 'center', alignItems: 'center' },
  stickerEmoji: { fontSize: 24 },
  // Input bar
  inputBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: COLORS.border.subtle },
  splitBtn: { backgroundColor: COLORS.accent.primary + '12', paddingHorizontal: 14, paddingVertical: 9, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.accent.primary + '25' },
  splitBtnT: { fontSize: 12, fontWeight: '700', color: COLORS.accent.primary },
  msgInput: { flex: 1, backgroundColor: COLORS.bg.card, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, fontSize: 14, color: COLORS.text.primary, borderWidth: 1, borderColor: COLORS.border.card },
  sendBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.accent.primary, justifyContent: 'center', alignItems: 'center' },
  // Expenses tab
  balanceCard: { flexDirection: 'row', backgroundColor: COLORS.bg.card, borderRadius: RADIUS.xl, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border.card },
  balHalf: { flex: 1, alignItems: 'center' },
  balAmount: { fontSize: 24, fontWeight: '800', color: COLORS.text.primary },
  balLabel: { fontSize: 12, color: COLORS.text.muted, marginTop: 4 },
  balDivider: { width: 1, backgroundColor: COLORS.border.subtle },
  secTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text.muted, marginBottom: 10 },
  debtRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border.subtle },
  debtNames: { fontSize: 14, fontWeight: '600', color: COLORS.text.primary },
  debtAmt: { fontSize: 16, fontWeight: '800', color: COLORS.accent.moneyOut },
  expRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border.subtle },
  expDesc: { fontSize: 14, fontWeight: '600', color: COLORS.text.primary },
  expMeta: { fontSize: 11, color: COLORS.text.muted, marginTop: 2 },
  expAmt: { fontSize: 16, fontWeight: '700', color: COLORS.text.primary },
  addExpBtn: { backgroundColor: COLORS.accent.primary + '12', borderRadius: RADIUS.full, paddingVertical: 16, alignItems: 'center', marginTop: 20, borderWidth: 1, borderColor: COLORS.accent.primary + '25' },
  addExpBtnT: { fontSize: 15, fontWeight: '700', color: COLORS.accent.primary },
});
