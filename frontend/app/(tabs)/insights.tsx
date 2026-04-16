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
  { label: 'Where did I overspend?', emoji: '📊' },
  { label: 'Set a food budget', emoji: '🎯' },
  { label: 'Who owes me?', emoji: '🤝' },
  { label: 'Weekly spending report', emoji: '📈' },
  { label: 'How to save on subscriptions?', emoji: '🧠' },
  { label: 'Best SIP for me?', emoji: '💰' },
];

const APP_LINK = 'https://mintu.app/download';

export default function InsightsScreen() {
  const { user } = useAuthStore();
  const { lang } = useLangStore();
  const [tab, setTab] = useState<'coach' | 'insights'>('coach');
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  // Insights tab data
  const [waste, setWaste] = useState<any>(null);
  const [insights, setInsights] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [statsCard, setStatsCard] = useState<any>(null);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [refreshingInsights, setRefreshingInsights] = useState(false);
  const flatRef = useRef<FlatList>(null);

  useEffect(() => {
    loadInsightsData();
    setMessages([{
      role: 'ai',
      text: `Hey ${user?.name || 'there'}! 👋 I'm your AI money coach. Ask me anything about your finances — I know your numbers! Try the quick chips below 👇`,
    }]);
  }, []);

  const loadInsightsData = async () => {
    try {
      const [wasteRes, statsRes, shareRes] = await Promise.all([
        api.get('/waste-detector'),
        api.get('/stats/overview'),
        api.get('/share/stats-card'),
      ]);
      setWaste(wasteRes.data);
      setStats(statsRes.data);
      setStatsCard(shareRes.data);
    } catch (e) { console.error(e); }
    try {
      const insRes = await api.get(`/insights/daily?lang=${lang}`);
      setInsights(insRes.data);
    } catch (e) { console.error(e); }
    finally { setInsightsLoading(false); setRefreshingInsights(false); }
  };

  const refreshInsights = () => {
    setRefreshingInsights(true);
    loadInsightsData();
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || chatLoading) return;
    const userMsg: ChatMsg = { role: 'user', text: text.trim() };
    const loadingMsg: ChatMsg = { role: 'ai', text: '', loading: true };
    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setInput('');
    setChatLoading(true);
    try {
      const res = await api.post('/ai/agent-chat', { message: text.trim(), lang });
      const agentInfo = res.data.agent;
      const replyText = `${agentInfo?.emoji || '🤖'} *${agentInfo?.name || 'AI'}*\n\n${res.data.reply}`;
      setMessages(prev => [...prev.slice(0, -1), { role: 'ai', text: replyText }]);
    } catch {
      setMessages(prev => [...prev.slice(0, -1), { role: 'ai', text: "Oops, something went wrong. Try again? 🙏" }]);
    } finally { setChatLoading(false); }
  };

  const shareContent = (text: string, platform: string) => {
    const fullText = `${text}\n\n📲 Download MintU: ${APP_LINK}`;
    if (platform === 'whatsapp') {
      Linking.openURL(`whatsapp://send?text=${encodeURIComponent(fullText)}`).catch(() => Share.share({ message: fullText }));
    } else {
      Share.share({ message: fullText });
    }
  };

  const renderChatMsg = ({ item }: { item: ChatMsg }) => (
    <View style={[s.msgRow, item.role === 'user' ? s.msgUser : s.msgAi]}>
      {item.role === 'ai' && (
        <View style={s.aiAvatar}><Ionicons name="sparkles" size={14} color={COLORS.accent.primary} /></View>
      )}
      <View style={[s.msgBubble, item.role === 'user' ? s.bubbleUser : s.bubbleAi]}>
        {item.loading ? (
          <View style={{ flexDirection: 'row', gap: 4, padding: 4 }}>
            <ActivityIndicator size="small" color={COLORS.accent.primary} />
            <Text style={{ color: COLORS.text.muted, fontSize: 13 }}>Thinking...</Text>
          </View>
        ) : (
          <Text style={[s.msgText, item.role === 'user' ? s.textUser : s.textAi]}>{item.text}</Text>
        )}
      </View>
    </View>
  );

  // COACH TAB — Pure chat
  const renderCoach = () => (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }} keyboardVerticalOffset={100}>
      <FlatList
        ref={flatRef}
        data={messages}
        keyExtractor={(_, i) => String(i)}
        renderItem={renderChatMsg}
        contentContainerStyle={s.chatList}
        onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: true })}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipsRow}>
        {QUICK_CHIPS.map((chip, i) => (
          <TouchableOpacity key={i} style={s.chip} onPress={() => sendMessage(chip.label)} disabled={chatLoading}>
            <Text style={s.chipEmoji}>{chip.emoji}</Text>
            <Text style={s.chipText}>{chip.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <View style={s.inputRow}>
        <TextInput style={s.chatInput} value={input} onChangeText={setInput} placeholder="Ask your AI coach..." placeholderTextColor={COLORS.text.muted} onSubmitEditing={() => sendMessage(input)} returnKeyType="send" editable={!chatLoading} />
        <TouchableOpacity style={[s.sendBtn, (!input.trim() || chatLoading) && s.sendDisabled]} onPress={() => sendMessage(input)} disabled={!input.trim() || chatLoading}>
          <Ionicons name="send" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );

  // INSIGHTS TAB — Score, Waste, Charts, Tips, Share
  const renderInsightsTab = () => {
    if (insightsLoading) return <ActivityIndicator size="large" color={COLORS.accent.primary} style={{ marginTop: 60 }} />;
    const moneyScore = insights?.money_score || user?.money_score || 50;
    const scoreColor = moneyScore >= 75 ? '#10B981' : moneyScore >= 50 ? '#F59E0B' : '#EF4444';
    const pieData = Object.entries(stats?.category_breakdown || {}).map(([cat, amount]: [string, any]) => ({
      value: amount, color: CATEGORIES[cat]?.color || '#64748B', text: cat,
    }));
    const totalSpent = pieData.reduce((sum, d) => sum + d.value, 0);

    return (
      <ScrollView contentContainerStyle={s.insightsScroll} showsVerticalScrollIndicator={false}>
        {/* Refresh */}
        <TouchableOpacity style={s.refreshRow} onPress={refreshInsights}>
          <Ionicons name="refresh" size={16} color={COLORS.accent.primary} />
          <Text style={s.refreshText}>{refreshingInsights ? 'Refreshing...' : 'Refresh insights'}</Text>
        </TouchableOpacity>

        {/* Money Score Hero */}
        <View style={[s.scoreHero, { borderColor: scoreColor + '30' }]}>
          <View style={[s.scoreRing, { borderColor: scoreColor }]}>
            <Text style={[s.scoreVal, { color: scoreColor }]}>{moneyScore}</Text>
            <Text style={s.scoreOf}>/100</Text>
          </View>
          <View style={{ flex: 1, marginLeft: SPACING.lg }}>
            <Text style={s.scoreLabel}>Money Score</Text>
            <Text style={[s.scoreGrade, { color: scoreColor }]}>{moneyScore >= 75 ? 'Excellent! 🏆' : moneyScore >= 50 ? 'Good 💪' : 'Needs Work 📈'}</Text>
            <TouchableOpacity style={s.shareScoreBtn} onPress={() => shareContent(`My MintU Money Score: ${moneyScore}/100! 💸`, 'general')}>
              <Ionicons name="share-social" size={12} color={COLORS.accent.primary} />
              <Text style={s.shareScoreTxt}>Share Score</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Waste Detector */}
        {waste && waste.category_waste?.length > 0 && (
          <View style={s.wasteCard}>
            <View style={s.wasteBadge}><Ionicons name="flame" size={14} color="#EF4444" /><Text style={s.wasteBadgeText}>WASTE DETECTOR</Text></View>
            {waste.category_waste.slice(0, 3).map((w: any, i: number) => (
              <View key={i} style={s.wasteItem}>
                <Text style={s.wasteShock}>{w.shock_text}</Text>
                {w.equivalences?.slice(0, 2).map((eq: any, j: number) => (
                  <Text key={j} style={s.wasteEq}>{eq.emoji} That's {eq.text}</Text>
                ))}
              </View>
            ))}
            {waste.comparison && <Text style={s.wasteCompare}>{waste.comparison.text}</Text>}
            <View style={s.wasteShareRow}>
              <TouchableOpacity style={s.waShareBtn} onPress={() => shareContent(waste.shareable_text, 'whatsapp')}>
                <Ionicons name="logo-whatsapp" size={14} color="#fff" /><Text style={s.waShareTxt}>WhatsApp</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.genShareBtn} onPress={() => shareContent(waste.shareable_text, 'general')}>
                <Ionicons name="share-social" size={14} color={COLORS.accent.primary} /><Text style={s.genShareTxt}>Share</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Shareable Stats Card */}
        {statsCard && (
          <View style={s.shareCard}>
            <Text style={s.shareHeadline}>{statsCard.card_data?.headline}</Text>
            <Text style={s.shareSub}>{statsCard.card_data?.subtitle}</Text>
            <View style={s.shareStatsRow}>
              {statsCard.card_data?.stats?.map((st: any, i: number) => (
                <View key={i} style={s.shareStat}>
                  <Text style={[s.shareStatVal, { color: st.color === 'green' ? '#10B981' : st.color === 'red' ? '#EF4444' : COLORS.accent.primary }]}>{st.value}</Text>
                  <Text style={s.shareStatLbl}>{st.label}</Text>
                </View>
              ))}
            </View>
            {statsCard.card_data?.badge && <Text style={s.shareBadgeTxt}>{statsCard.card_data.badge}</Text>}
            <Text style={s.appLinkText}>📲 mintu.app/download</Text>
            <View style={s.shareActions}>
              <TouchableOpacity style={s.waBtn} onPress={() => shareContent(statsCard.whatsapp_text, 'whatsapp')}>
                <Ionicons name="logo-whatsapp" size={16} color="#fff" /><Text style={s.waBtnText}>WhatsApp</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.igBtn} onPress={() => shareContent(statsCard.instagram_caption, 'general')}>
                <Ionicons name="share-social" size={16} color={COLORS.accent.primary} /><Text style={s.igBtnText}>Share</Text>
              </TouchableOpacity>
            </View>
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

        {/* AI Recommendations */}
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
      {tab === 'coach' ? renderCoach() : renderInsightsTab()}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg.primary },
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
  chipsRow: { paddingHorizontal: SPACING.lg, paddingVertical: 8, gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.bg.secondary, paddingHorizontal: 14, paddingVertical: 10, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border.subtle },
  chipEmoji: { fontSize: 14 },
  chipText: { fontSize: 13, fontWeight: '500', color: COLORS.text.secondary },
  inputRow: { flexDirection: 'row', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, gap: 8, borderTopWidth: 1, borderTopColor: COLORS.border.subtle, backgroundColor: COLORS.bg.primary },
  chatInput: { flex: 1, backgroundColor: COLORS.bg.secondary, borderRadius: RADIUS.full, paddingHorizontal: 18, paddingVertical: 12, fontSize: 15, color: COLORS.text.primary, borderWidth: 1, borderColor: COLORS.border.subtle },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.accent.primary, justifyContent: 'center', alignItems: 'center' },
  sendDisabled: { opacity: 0.4 },
  // Insights tab
  insightsScroll: { padding: SPACING.lg },
  refreshRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, marginBottom: 8 },
  refreshText: { fontSize: 13, fontWeight: '600', color: COLORS.accent.primary },
  // Score hero
  scoreHero: { backgroundColor: COLORS.bg.card, borderRadius: RADIUS.card, padding: SPACING.xl, marginBottom: SPACING.lg, borderWidth: 2, flexDirection: 'row', alignItems: 'center' },
  scoreRing: { width: 80, height: 80, borderRadius: 40, borderWidth: 5, justifyContent: 'center', alignItems: 'center' },
  scoreVal: { fontSize: 30, fontWeight: '900' },
  scoreOf: { fontSize: 12, color: COLORS.text.muted, marginTop: -4 },
  scoreLabel: { fontSize: 13, color: COLORS.text.muted },
  scoreGrade: { fontSize: 18, fontWeight: '700', marginTop: 2 },
  shareScoreBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, backgroundColor: COLORS.accent.primary + '10', paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full, alignSelf: 'flex-start' },
  shareScoreTxt: { fontSize: 12, fontWeight: '600', color: COLORS.accent.primary },
  // Waste
  wasteCard: { backgroundColor: '#FEF2F2', borderRadius: RADIUS.card, padding: SPACING.xl, marginBottom: SPACING.lg, borderWidth: 1, borderColor: '#FECACA' },
  wasteBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACING.md },
  wasteBadgeText: { fontSize: 11, fontWeight: '700', color: '#EF4444', letterSpacing: 0.8 },
  wasteItem: { marginBottom: SPACING.md },
  wasteShock: { fontSize: 16, fontWeight: '700', color: '#1F2937', marginBottom: 6 },
  wasteEq: { fontSize: 14, color: '#6B7280', lineHeight: 22, marginLeft: 4 },
  wasteCompare: { fontSize: 13, fontWeight: '600', color: '#6B7280', marginTop: 8 },
  wasteShareRow: { flexDirection: 'row', gap: 8, marginTop: SPACING.md },
  waShareBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#25D366', paddingHorizontal: 16, paddingVertical: 10, borderRadius: RADIUS.full },
  waShareTxt: { fontSize: 13, fontWeight: '600', color: '#fff' },
  genShareBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 10, borderRadius: RADIUS.full },
  genShareTxt: { fontSize: 13, fontWeight: '600', color: COLORS.accent.primary },
  // Share card
  shareCard: { backgroundColor: COLORS.bg.card, borderRadius: RADIUS.card, padding: SPACING.xl, marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.accent.primary + '20' },
  shareHeadline: { fontSize: 20, fontWeight: '800', color: COLORS.text.primary, marginBottom: 4 },
  shareSub: { fontSize: 14, color: COLORS.text.muted, marginBottom: SPACING.lg },
  shareStatsRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: SPACING.md },
  shareStat: { alignItems: 'center' },
  shareStatVal: { fontSize: 18, fontWeight: '800' },
  shareStatLbl: { fontSize: 11, color: COLORS.text.muted, marginTop: 4 },
  shareBadgeTxt: { textAlign: 'center', fontSize: 14, fontWeight: '600', color: COLORS.accent.primary, marginBottom: 6 },
  appLinkText: { textAlign: 'center', fontSize: 12, color: COLORS.accent.primary, marginBottom: SPACING.md, fontWeight: '500' },
  shareActions: { flexDirection: 'row', justifyContent: 'center', gap: 12 },
  waBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#25D366', paddingHorizontal: 20, paddingVertical: 10, borderRadius: RADIUS.full },
  waBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  igBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.accent.primary + '12', paddingHorizontal: 20, paddingVertical: 10, borderRadius: RADIUS.full },
  igBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.accent.primary },
  // Generic card
  card: { backgroundColor: COLORS.bg.card, borderRadius: RADIUS.card, padding: SPACING.xl, marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.border.card },
  cardTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text.primary, marginBottom: 4 },
});
