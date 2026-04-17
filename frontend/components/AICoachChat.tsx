import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, FlatList, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../utils/api';
import { useAuthStore } from '../store/authStore';
import { useLangStore } from '../store/langStore';
import { COLORS, RADIUS, SPACING } from '../utils/theme';

type ChatMsg = { role: 'user' | 'ai'; text: string; loading?: boolean; agent?: string; agentEmoji?: string; ts?: number };

const QUICK_CHIPS = [
  { label: 'Am I overspending?', emoji: '\ud83d\udcca' },
  { label: 'Set a food budget', emoji: '\ud83c\udfaf' },
  { label: 'Who owes me?', emoji: '\ud83e\udd1d' },
  { label: 'Weekly report', emoji: '\ud83d\udcc8' },
  { label: 'Save on subscriptions', emoji: '\ud83e\udde0' },
  { label: 'Best SIP for me?', emoji: '\ud83d\udcb0' },
];

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
    anim(dot1, 0).start(); anim(dot2, 150).start(); anim(dot3, 300).start();
  }, []);
  return (
    <View style={{ flexDirection: 'row', gap: 4, padding: 6, alignItems: 'center' }}>
      {[dot1, dot2, dot3].map((d, i) => (
        <Animated.View key={i} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.accent.primary, opacity: d }} />
      ))}
    </View>
  );
};

export default function AICoachChat({ onClose }: { onClose: () => void }) {
  const { user } = useAuthStore();
  const { lang } = useLangStore();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const flatRef = useRef<FlatList>(null);

  useEffect(() => {
    setMessages([{
      role: 'ai',
      text: `Hey ${user?.name || 'there'}! \ud83d\udc4b\n\nI'm your personal AI money coach. Ask me anything about:\n\n\ud83d\udcb8 Spending analysis\n\ud83c\udfaf Budget management\n\ud83e\udd1d Split bills\n\ud83d\udcca Weekly insights\n\ud83d\udcb0 Investment tips`,
      agent: 'MintU AI', agentEmoji: '\u2728', ts: Date.now(),
    }]);
  }, []);

  const sendMessage = async (text: string) => {
    if (!text.trim() || chatLoading) return;
    const userMsg: ChatMsg = { role: 'user', text: text.trim(), ts: Date.now() };
    const loadingMsg: ChatMsg = { role: 'ai', text: '', loading: true, ts: Date.now() };
    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setInput(''); setChatLoading(true);
    try {
      const res = await api.post('/ai/agent-chat', { message: text.trim(), lang });
      const agentInfo = res.data.agent;
      setMessages(prev => [...prev.slice(0, -1), {
        role: 'ai', text: res.data.reply,
        agent: agentInfo?.name || 'AI Coach', agentEmoji: agentInfo?.emoji || '\ud83e\udd16', ts: Date.now(),
      }]);
    } catch {
      setMessages(prev => [...prev.slice(0, -1), {
        role: 'ai', text: "Something went wrong \ud83d\ude05 Try again?",
        agent: 'MintU AI', agentEmoji: '\u26a0\ufe0f', ts: Date.now(),
      }]);
    } finally { setChatLoading(false); }
  };

  const formatTime = (ts?: number) => {
    if (!ts) return '';
    return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };

  // Format AI text with bold, bullet points, and ₹ highlights
  const formatAIText = (text: string, isUser: boolean) => {
    if (isUser) return <Text style={[s.msgText, { color: '#fff' }]}>{text}</Text>;

    const parts: React.ReactNode[] = [];
    const lines = text.split('\n');
    lines.forEach((line, li) => {
      if (li > 0) parts.push(<Text key={`br${li}`}>{'\n'}</Text>);
      // Process bold **text** and ₹ amounts
      const segments = line.split(/(\*\*[^*]+\*\*|₹[\d,]+(?:\.\d+)?)/g);
      segments.forEach((seg, si) => {
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

  const renderMsg = ({ item }: { item: ChatMsg }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[s.msgRow, isUser ? s.msgRowUser : s.msgRowAi]}>
        {!isUser && (
          <View style={s.aiAv}><Ionicons name="sparkles" size={13} color={COLORS.accent.primary} /></View>
        )}
        <View style={{ maxWidth: '80%' }}>
          {!isUser && item.agent && !item.loading && (
            <Text style={s.agentLabel}>{item.agentEmoji} {item.agent}</Text>
          )}
          <View style={[s.bubble, isUser ? s.bubbleUser : s.bubbleAi]}>
            {item.loading ? <TypingDots /> : formatAIText(item.text, isUser)}
          </View>
          {!item.loading && <Text style={[s.timeLabel, isUser && { textAlign: 'right' }]}>{formatTime(item.ts)}</Text>}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <View style={s.headerIcon}><Ionicons name="sparkles" size={18} color={COLORS.accent.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>AI Coach</Text>
          <Text style={s.headerSub}>Your personal finance assistant</Text>
        </View>
        <TouchableOpacity onPress={onClose} style={s.closeBtn}>
          <Ionicons name="close" size={22} color={COLORS.text.primary} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }} keyboardVerticalOffset={10}>
        <FlatList ref={flatRef} data={messages} keyExtractor={(_, i) => String(i)} renderItem={renderMsg}
          contentContainerStyle={s.chatList} onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: true })} showsVerticalScrollIndicator={false} />

        {messages.length <= 2 && (
          <View style={s.chipsWrap}>
            {QUICK_CHIPS.map((c, i) => (
              <TouchableOpacity key={i} style={s.chip} onPress={() => sendMessage(c.label)} disabled={chatLoading}>
                <Text style={s.chipEmoji}>{c.emoji}</Text>
                <Text style={s.chipText}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={s.inputRow}>
          <TextInput style={s.chatInput} value={input} onChangeText={setInput} placeholder="Ask your AI coach..." placeholderTextColor={COLORS.text.muted}
            onSubmitEditing={() => sendMessage(input)} returnKeyType="send" editable={!chatLoading} multiline />
          <TouchableOpacity style={[s.sendBtn, (!input.trim() || chatLoading) && { opacity: 0.4 }]} onPress={() => sendMessage(input)} disabled={!input.trim() || chatLoading}>
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg.primary },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border.subtle },
  headerIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.accent.primary + '12', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text.primary },
  headerSub: { fontSize: 11, color: COLORS.text.muted },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.bg.card, justifyContent: 'center', alignItems: 'center' },
  chatList: { padding: 16, paddingBottom: 8 },
  msgRow: { flexDirection: 'row', marginBottom: 14 },
  msgRowUser: { justifyContent: 'flex-end' },
  msgRowAi: { justifyContent: 'flex-start' },
  aiAv: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.accent.primary + '12', justifyContent: 'center', alignItems: 'center', marginRight: 8, marginTop: 18 },
  agentLabel: { fontSize: 10, fontWeight: '600', color: COLORS.accent.primary, marginBottom: 3, marginLeft: 4 },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleUser: { backgroundColor: COLORS.accent.primary, borderBottomRightRadius: 4 },
  bubbleAi: { backgroundColor: COLORS.bg.card, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: COLORS.border.card },
  msgText: { fontSize: 14, lineHeight: 21, color: COLORS.text.primary },
  timeLabel: { fontSize: 9, color: COLORS.text.muted, marginTop: 3, marginLeft: 4 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, paddingBottom: 8, gap: 7 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.bg.card, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: COLORS.border.card },
  chipEmoji: { fontSize: 13 },
  chipText: { fontSize: 12, fontWeight: '500', color: COLORS.text.secondary },
  inputRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8, borderTopWidth: 1, borderTopColor: COLORS.border.subtle },
  chatInput: { flex: 1, backgroundColor: COLORS.bg.card, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, color: COLORS.text.primary, borderWidth: 1, borderColor: COLORS.border.card, maxHeight: 90 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.accent.primary, justifyContent: 'center', alignItems: 'center', alignSelf: 'flex-end' },
});
