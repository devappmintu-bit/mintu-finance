import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  TextInput, KeyboardAvoidingView, Platform, FlatList, Share, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../utils/api';
import { useAuthStore } from '../../store/authStore';
import { useLangStore } from '../../store/langStore';
import { COLORS, RADIUS, SPACING, CATEGORIES } from '../../utils/theme';
import { PieChart } from 'react-native-gifted-charts';

type ChatMsg = { role: 'user' | 'ai'; text: string; loading?: boolean };

const QUICK_CHIPS = [
  { label: 'Am I overspending?', emoji: '👀' },
  { label: 'How can I save more?', emoji: '💰' },
  { label: 'Best SIP for me?', emoji: '📈' },
  { label: 'Review my budget', emoji: '📊' },
  { label: 'Waste detector', emoji: '🔥' },
];

export default function InsightsScreen() {
  const { user } = useAuthStore();
  const { lang } = useLangStore();
  const [tab, setTab] = useState<'coach' | 'insights'>('coach');
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [waste, setWaste] = useState<any>(null);
  const [statsCard, setStatsCard] = useState<any>(null);
  const [insights, setInsights] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const scrollRef = useRef<ScrollView>(null);
  const flatRef = useRef<FlatList>(null);

  useEffect(() => {
    loadData();
    // Greeting message
    setMessages([{
      role: 'ai',
      text: `Hey ${user?.name || 'there'}! 👋 I'm your AI money coach. Ask me anything about your finances — I know your numbers! Try the quick chips below 👇`,
    }]);
  }, []);

  const loadData = async () => {
    try {
      const [wasteRes, shareRes, statsRes] = await Promise.all([
        api.get('/waste-detector'),
        api.get('/share/stats-card'),
        api.get('/stats/overview'),
      ]);
      setWaste(wasteRes.data);
      setStatsCard(shareRes.data);
      setStats(statsRes.data);
    } catch (e) { console.error(e); }

    try {
      const insRes = await api.get(`/insights/daily?lang=${lang}`);
      setInsights(insRes.data);
    } catch (e) { console.error(e); }
    finally { setDataLoading(false); }
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || chatLoading) return;
    const userMsg: ChatMsg = { role: 'user', text: text.trim() };
    const loadingMsg: ChatMsg = { role: 'ai', text: '', loading: true };
    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setInput('');
    setChatLoading(true);

    try {
      const res = await api.post('/ai/chat', { message: text.trim(), lang });
      setMessages(prev => [
        ...prev.slice(0, -1),
        { role: 'ai', text: res.data.reply },
      ]);
    } catch {
      setMessages(prev => [
        ...prev.slice(0, -1),
        { role: 'ai', text: "Oops, something went wrong. Try again? 🙏" },
      ]);
    } finally { setChatLoading(false); }
  };

  const shareStats = async (platform: 'whatsapp' | 'instagram' | 'general') => {
    if (!statsCard) return;
    const text = platform === 'whatsapp' ? statsCard.whatsapp_text : statsCard.instagram_caption;
    if (platform === 'whatsapp') {
      Linking.openURL(`whatsapp://send?text=${encodeURIComponent(text)}`).catch(() => Share.share({ message: text }));
    } else {
      Share.share({ message: text });
    }
  };

  const renderChatMsg = ({ item }: { item: ChatMsg }) => (
    <View style={[s.msgRow, item.role === 'user' ? s.msgUser : s.msgAi]}>
      {item.role === 'ai' && (
        <View style={s.aiAvatar}><Ionicons name="sparkles" size={14} color={COLORS.accent.primary} /></View>
      )}
      <View style={[s.msgBubble, item.role === 'user' ? s.bubbleUser : s.bubbleAi]}>
        {item.loading ? (
          <ActivityIndicator size="small" color={COLORS.accent.primary} />
        ) : (
          <Text style={[s.msgText, item.role === 'user' ? s.textUser : s.textAi]}>{item.text}</Text>
        )}
      </View>
    </View>
  );

  // Tab: Coach
  const renderCoach = () => (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }} keyboardVerticalOffset={100}>
      <FlatList
        ref={flatRef}
        data={messages}
        keyExtractor={(_, i) => String(i)}
        renderItem={renderChatMsg}
        contentContainerStyle={s.chatList}
        onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: true })}
        ListHeaderComponent={
          <>
            {/* Shareable Stats Card */}
            {statsCard && (
              <View style={s.shareCard}>
                <Text style={s.shareHeadline}>{statsCard.card_data?.headline}</Text>
                <Text style={s.shareSub}>{statsCard.card_data?.subtitle}</Text>
                <View style={s.shareStatsRow}>
                  {statsCard.card_data?.stats?.map((st: any, i: number) => (
                    <View key={i} style={s.shareStat}>
                      <Text style={[s.shareStatVal, { color: st.color === 'green' ? COLORS.accent.moneyIn : st.color === 'red' ? COLORS.accent.moneyOut : COLORS.accent.primary }]}>{st.value}</Text>
                      <Text style={s.shareStatLbl}>{st.label}</Text>
                    </View>
                  ))}
                </View>
                {statsCard.card_data?.badge && <Text style={s.shareBadge}>{statsCard.card_data.badge}</Text>}
                <View style={s.shareActions}>
                  <TouchableOpacity style={s.waBtn} onPress={() => shareStats('whatsapp')}>
                    <Ionicons name="logo-whatsapp" size={16} color="#fff" />
                    <Text style={s.waBtnText}>Share</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.igBtn} onPress={() => shareStats('general')}>
                    <Ionicons name="share-social" size={16} color={COLORS.accent.primary} />
                    <Text style={s.igBtnText}>Share</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Waste Detector */}
            {waste && waste.category_waste?.length > 0 && (
              <View style={s.wasteCard}>
                <View style={s.wasteBadge}><Ionicons name="flame" size={14} color="#EF4444" /><Text style={s.wasteBadgeText}>WASTE DETECTOR</Text></View>
                {waste.category_waste.slice(0, 2).map((w: any, i: number) => (
                  <View key={i} style={s.wasteItem}>
                    <Text style={s.wasteShock}>{w.shock_text}</Text>
                    {w.equivalences?.map((eq: any, j: number) => (
                      <Text key={j} style={s.wasteEq}>{eq.emoji} That's {eq.text}</Text>
                    ))}
                  </View>
                ))}
                {waste.comparison && <Text style={s.wasteCompare}>{waste.comparison.text}</Text>}
                <TouchableOpacity style={s.wasteShareBtn} onPress={() => Share.share({ message: waste.shareable_text })}>
                  <Ionicons name="share-social" size={14} color={COLORS.accent.primary} />
                  <Text style={s.wasteShareText}>Share this reality check</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        }
      />

      {/* Quick chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipsRow}>
        {QUICK_CHIPS.map((chip, i) => (
          <TouchableOpacity key={i} style={s.chip} onPress={() => sendMessage(chip.label)} disabled={chatLoading}>
            <Text style={s.chipEmoji}>{chip.emoji}</Text>
            <Text style={s.chipText}>{chip.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Input */}
      <View style={s.inputRow}>
        <TextInput
          style={s.chatInput}
          value={input}
          onChangeText={setInput}
          placeholder="Ask your AI coach..."
          placeholderTextColor={COLORS.text.muted}
          onSubmitEditing={() => sendMessage(input)}
          returnKeyType="send"
          editable={!chatLoading}
        />
        <TouchableOpacity style={[s.sendBtn, (!input.trim() || chatLoading) && s.sendDisabled]} onPress={() => sendMessage(input)} disabled={!input.trim() || chatLoading}>
          <Ionicons name="send" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );

  // Tab: Insights (existing)
  const renderInsights = () => {
    const pieData = Object.entries(stats?.category_breakdown || {}).map(
      ([cat, amount]: [string, any]) => ({
        value: amount, color: CATEGORIES[cat]?.color || '#64748B', text: cat,
      })
    );
    const totalSpent = pieData.reduce((sum, d) => sum + d.value, 0);
    const moneyScore = insights?.money_score || user?.money_score || 50;
    const scoreColor = moneyScore >= 75 ? COLORS.accent.moneyIn : moneyScore >= 50 ? COLORS.accent.warning : COLORS.accent.moneyOut;

    return (
      <ScrollView contentContainerStyle={s.insightsScroll}>
        {/* Score */}
        <View style={s.scoreCard}>
          <View style={s.scoreRow}>
            <View style={[s.scoreCircle, { borderColor: scoreColor }]}>
              <Text style={[s.scoreVal, { color: scoreColor }]}>{moneyScore}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.scoreLbl}>Money Score</Text>
              <Text style={[s.scoreGrade, { color: scoreColor }]}>
                {moneyScore >= 75 ? 'Excellent' : moneyScore >= 50 ? 'Good' : 'Needs Work'}
              </Text>
            </View>
          </View>
        </View>

        {/* AI Insight */}
        {insights?.insight_text && (
          <View style={s.aiCard}>
            <View style={s.aiBadgeRow}><Ionicons name="sparkles" size={14} color={COLORS.accent.warning} /><Text style={s.aiBadgeLabel}>AI INSIGHT</Text></View>
            <Text style={s.aiText}>{insights.insight_text}</Text>
          </View>
        )}

        {/* Pie Chart */}
        {pieData.length > 0 && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Expense Breakdown</Text>
            <View style={{ alignItems: 'center', marginVertical: SPACING.lg }}>
              <PieChart data={pieData} donut radius={85} innerRadius={55} innerCircleColor={COLORS.bg.card}
                centerLabelComponent={() => (
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.text.primary }}>{'\u20B9'}{totalSpent.toFixed(0)}</Text>
                    <Text style={{ fontSize: 11, color: COLORS.text.muted }}>Total</Text>
                  </View>
                )}
              />
            </View>
            {pieData.map((item, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: item.color, marginRight: 10 }} />
                <Text style={{ flex: 1, fontSize: 14, color: COLORS.text.secondary }}>{item.text}</Text>
                <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.text.primary }}>{'\u20B9'}{item.value.toFixed(0)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Recommendations */}
        {insights?.recommendations?.length > 0 && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Smart Tips</Text>
            {insights.recommendations.map((rec: string, i: number) => (
              <View key={i} style={{ flexDirection: 'row', marginTop: 12 }}>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.accent.primary + '15', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.accent.primary }}>{i+1}</Text>
                </View>
                <Text style={{ flex: 1, fontSize: 14, color: COLORS.text.secondary, lineHeight: 21 }}>{rec}</Text>
              </View>
            ))}
          </View>
        )}
        <View style={{ height: 24 }} />
      </ScrollView>
    );
  };

  return (
    <SafeAreaView style={s.container}>
      {/* Tab Switcher */}
      <View style={s.tabBar}>
        <TouchableOpacity style={[s.tabBtn, tab === 'coach' && s.tabActive]} onPress={() => setTab('coach')}>
          <Ionicons name="chatbubbles" size={16} color={tab === 'coach' ? COLORS.accent.primary : COLORS.text.muted} />
          <Text style={[s.tabText, tab === 'coach' && s.tabTextActive]}>AI Coach</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tabBtn, tab === 'insights' && s.tabActive]} onPress={() => setTab('insights')}>
          <Ionicons name="analytics" size={16} color={tab === 'insights' ? COLORS.accent.primary : COLORS.text.muted} />
          <Text style={[s.tabText, tab === 'insights' && s.tabTextActive]}>Insights</Text>
        </TouchableOpacity>
      </View>

      {tab === 'coach' ? renderCoach() : (dataLoading ? <ActivityIndicator size="large" color={COLORS.accent.primary} style={{ marginTop: 60 }} /> : renderInsights())}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg.primary },
  // Tabs
  tabBar: { flexDirection: 'row', paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, gap: 8 },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: RADIUS.full, backgroundColor: COLORS.bg.secondary },
  tabActive: { backgroundColor: COLORS.accent.primary + '12', borderWidth: 1, borderColor: COLORS.accent.primary + '30' },
  tabText: { fontSize: 14, fontWeight: '600', color: COLORS.text.muted },
  tabTextActive: { color: COLORS.accent.primary },
  // Chat
  chatList: { padding: SPACING.lg, paddingBottom: 8 },
  msgRow: { flexDirection: 'row', marginBottom: 12, maxWidth: '85%' },
  msgUser: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  msgAi: { alignSelf: 'flex-start' },
  aiAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.accent.primary + '15', justifyContent: 'center', alignItems: 'center', marginRight: 8, marginTop: 4 },
  msgBubble: { borderRadius: 18, paddingHorizontal: 16, paddingVertical: 12, maxWidth: '100%' },
  bubbleUser: { backgroundColor: COLORS.accent.primary, borderBottomRightRadius: 4 },
  bubbleAi: { backgroundColor: COLORS.bg.card, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: COLORS.border.card },
  msgText: { fontSize: 15, lineHeight: 22 },
  textUser: { color: '#fff' },
  textAi: { color: COLORS.text.primary },
  // Chips
  chipsRow: { paddingHorizontal: SPACING.lg, paddingVertical: 8, gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.bg.secondary, paddingHorizontal: 14, paddingVertical: 10, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border.subtle },
  chipEmoji: { fontSize: 14 },
  chipText: { fontSize: 13, fontWeight: '500', color: COLORS.text.secondary },
  // Input
  inputRow: { flexDirection: 'row', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, gap: 8, borderTopWidth: 1, borderTopColor: COLORS.border.subtle, backgroundColor: COLORS.bg.primary },
  chatInput: { flex: 1, backgroundColor: COLORS.bg.secondary, borderRadius: RADIUS.full, paddingHorizontal: 18, paddingVertical: 12, fontSize: 15, color: COLORS.text.primary, borderWidth: 1, borderColor: COLORS.border.subtle },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.accent.primary, justifyContent: 'center', alignItems: 'center' },
  sendDisabled: { opacity: 0.4 },
  // Shareable card
  shareCard: { backgroundColor: COLORS.bg.card, borderRadius: RADIUS.card, padding: SPACING.xl, marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.accent.primary + '20' },
  shareHeadline: { fontSize: 20, fontWeight: '800', color: COLORS.text.primary, marginBottom: 4 },
  shareSub: { fontSize: 14, color: COLORS.text.muted, marginBottom: SPACING.lg },
  shareStatsRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: SPACING.lg },
  shareStat: { alignItems: 'center' },
  shareStatVal: { fontSize: 18, fontWeight: '800' },
  shareStatLbl: { fontSize: 11, color: COLORS.text.muted, marginTop: 4 },
  shareBadge: { textAlign: 'center', fontSize: 14, fontWeight: '600', color: COLORS.accent.primary, marginBottom: SPACING.md },
  shareActions: { flexDirection: 'row', justifyContent: 'center', gap: 12 },
  waBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#25D366', paddingHorizontal: 20, paddingVertical: 10, borderRadius: RADIUS.full },
  waBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  igBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.accent.primary + '12', paddingHorizontal: 20, paddingVertical: 10, borderRadius: RADIUS.full },
  igBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.accent.primary },
  // Waste
  wasteCard: { backgroundColor: '#FEF2F2', borderRadius: RADIUS.card, padding: SPACING.xl, marginBottom: SPACING.lg, borderWidth: 1, borderColor: '#FECACA' },
  wasteBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACING.md },
  wasteBadgeText: { fontSize: 11, fontWeight: '700', color: '#EF4444', letterSpacing: 0.8 },
  wasteItem: { marginBottom: SPACING.md },
  wasteShock: { fontSize: 16, fontWeight: '700', color: '#1F2937', marginBottom: 6 },
  wasteEq: { fontSize: 14, color: '#6B7280', lineHeight: 22, marginLeft: 4 },
  wasteCompare: { fontSize: 13, fontWeight: '600', color: '#6B7280', marginTop: 8 },
  wasteShareBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: SPACING.md, paddingVertical: 10, borderRadius: RADIUS.full, backgroundColor: '#fff' },
  wasteShareText: { fontSize: 13, fontWeight: '600', color: COLORS.accent.primary },
  // Insights tab
  insightsScroll: { padding: SPACING.lg },
  scoreCard: { backgroundColor: COLORS.bg.card, borderRadius: RADIUS.card, padding: SPACING.xl, marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.border.card },
  scoreRow: { flexDirection: 'row', alignItems: 'center' },
  scoreCircle: { width: 68, height: 68, borderRadius: 34, borderWidth: 4, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.lg },
  scoreVal: { fontSize: 26, fontWeight: '800' },
  scoreLbl: { fontSize: 12, color: COLORS.text.muted, marginBottom: 4 },
  scoreGrade: { fontSize: 16, fontWeight: '700' },
  aiCard: { backgroundColor: COLORS.bg.card, borderRadius: RADIUS.card, padding: SPACING.xl, marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.accent.warning + '20' },
  aiBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACING.md },
  aiBadgeLabel: { fontSize: 11, fontWeight: '700', color: COLORS.accent.warning, letterSpacing: 0.8 },
  aiText: { fontSize: 15, color: COLORS.text.secondary, lineHeight: 23 },
  card: { backgroundColor: COLORS.bg.card, borderRadius: RADIUS.card, padding: SPACING.xl, marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.border.card },
  cardTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text.primary, marginBottom: 4 },
});
