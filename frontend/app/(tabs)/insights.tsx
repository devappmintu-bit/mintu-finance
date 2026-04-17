import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  TextInput, KeyboardAvoidingView, Platform, FlatList, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../utils/api';
import { useAuthStore } from '../../store/authStore';
import { useLangStore } from '../../store/langStore';
import { COLORS, RADIUS, SPACING } from '../../utils/theme';

type ChatMsg = { role: 'user' | 'ai'; text: string; loading?: boolean; agent?: string; agentEmoji?: string; ts?: number };

const QUICK_CHIPS = [
  { label: 'Am I overspending?', emoji: '📊' },
  { label: 'Set a food budget', emoji: '🎯' },
  { label: 'Who owes me?', emoji: '🤝' },
  { label: 'Weekly report', emoji: '📈' },
  { label: 'Save on subscriptions', emoji: '🧠' },
  { label: 'Best SIP for me?', emoji: '💰' },
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
  const flatRef = useRef<FlatList>(null);

  useEffect(() => {
    setMessages([{
      role: 'ai',
      text: `Hey ${user?.name || 'there'}! 👋\n\nI'm your personal AI money coach. I can help you with:\n\n💸 Track & analyze spending\n🎯 Set & manage budgets\n🤝 Split bills with friends\n📊 Weekly insights & trends\n💰 Investment advice\n\nTry tapping a chip below or ask me anything!`,
      agent: 'MintU AI',
      agentEmoji: '✨',
      ts: Date.now(),
    }]);
  }, []);

  const sendMessage = async (text: string) => {
    if (!text.trim() || chatLoading) return;
    const userMsg: ChatMsg = { role: 'user', text: text.trim(), ts: Date.now() };
    const loadingMsg: ChatMsg = { role: 'ai', text: '', loading: true, ts: Date.now() };
    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setInput('');
    setChatLoading(true);
    try {
      const res = await api.post('/ai/agent-chat', { message: text.trim(), lang });
      const agentInfo = res.data.agent;
      setMessages(prev => [...prev.slice(0, -1), {
        role: 'ai',
        text: res.data.reply,
        agent: agentInfo?.name || 'AI Coach',
        agentEmoji: agentInfo?.emoji || '🤖',
        ts: Date.now(),
      }]);
    } catch {
      setMessages(prev => [...prev.slice(0, -1), {
        role: 'ai',
        text: "Something went wrong on my end 😅\nCould you try asking again?",
        agent: 'MintU AI',
        agentEmoji: '⚠️',
        ts: Date.now(),
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
    return (
      <View style={[styles.msgContainer, isUser ? styles.msgContainerUser : styles.msgContainerAi]}>
        {!isUser && (
          <View style={styles.aiAvatarWrap}>
            <View style={styles.aiAvatar}>
              <Ionicons name="sparkles" size={14} color={COLORS.accent.primary} />
            </View>
          </View>
        )}
        <View style={{ maxWidth: '80%' }}>
          {!isUser && item.agent && !item.loading && (
            <Text style={styles.agentLabel}>{item.agentEmoji} {item.agent}</Text>
          )}
          <View style={[styles.msgBubble, isUser ? styles.bubbleUser : styles.bubbleAi]}>
            {item.loading ? (
              <TypingDots />
            ) : (
              <Text style={[styles.msgText, isUser ? styles.textUser : styles.textAi]}>{item.text}</Text>
            )}
          </View>
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
  agentLabel: { fontSize: 11, fontWeight: '600', color: COLORS.accent.primary, marginBottom: 4, marginLeft: 4 },
  msgBubble: { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12 },
  bubbleUser: { backgroundColor: COLORS.accent.primary, borderBottomRightRadius: 6 },
  bubbleAi: { backgroundColor: COLORS.bg.card, borderBottomLeftRadius: 6, borderWidth: 1, borderColor: COLORS.border.card },
  msgText: { fontSize: 15, lineHeight: 22 },
  textUser: { color: '#fff' },
  textAi: { color: COLORS.text.primary },
  timeLabel: { fontSize: 10, color: COLORS.text.muted, marginTop: 4, marginLeft: 4 },
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
