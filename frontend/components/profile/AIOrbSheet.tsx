/**
 * AIOrbSheet — bottom sheet opened by the floating AI orb.
 *
 * Shows:
 *   • Weekly summary snapshot (top-line numbers)
 *   • 3 quick-action chips (ask, voice-note, plan)
 *   • 2 smart suggestions pulled from /api/profile/score-boosts
 *
 * All buttons navigate into the MintU AI tab where the real chat lives.
 */
import React, { useEffect, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import api from '../../utils/api';
import { makeStyles } from '../../utils/makeStyles';

interface Props { visible: boolean; onClose: () => void; }

type Boost = { id: string; emoji: string; title: string; sub: string; points: number; route: string; cta: string };

export default function AIOrbSheet({ visible, onClose }: Props) {
  const s = useStyles();
  const [weekly, setWeekly] = useState<any>(null);
  const [boosts, setBoosts] = useState<Boost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    Promise.all([
      api.get('/profile/weekly-comparison').catch(() => ({ data: null })),
      api.get('/profile/score-boosts').catch(() => ({ data: { boosts: [] } })),
    ]).then(([w, b]) => {
      setWeekly(w.data);
      setBoosts((b.data?.boosts || []).slice(0, 2));
    }).finally(() => setLoading(false));
  }, [visible]);

  const haptic = () => { if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {}); };

  const openAI = (query?: string) => {
    onClose();
    setTimeout(() => { try { router.push(`/(tabs)/ai${query ? `?q=${encodeURIComponent(query)}` : ''}` as any); } catch {} }, 200);
  };

  const thisWeek = weekly?.this_week;
  const pct = weekly?.pct_better || 0;
  const commentary = weekly?.commentary;

  const quickActions = [
    { icon: 'chatbubble-ellipses-outline' as const, label: 'Ask', query: 'Am I on track this month?' },
    { icon: 'mic-outline' as const, label: 'Voice', query: '' },
    { icon: 'create-outline' as const, label: 'Plan', query: 'Help me plan my weekly budget' },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} onPress={() => {}} style={{ width: '100%' }}>
          <View style={s.sheet}>
            <View style={s.grip} />
            <View style={s.header}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={s.aiBubble}>
                  <Ionicons name="sparkles" size={16} color="#fff" />
                </View>
                <View>
                  <Text style={s.title}>MintU AI Assistant</Text>
                  <Text style={s.sub}>Your financial copilot</Text>
                </View>
              </View>
              <TouchableOpacity onPress={onClose} hitSlop={10} style={s.closeBtn}>
                <Ionicons name="close" size={20} color={'#111827'} />
              </TouchableOpacity>
            </View>

            {loading ? (
              <View style={{ padding: 30, alignItems: 'center' }}><ActivityIndicator color="#7C3AED" /></View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 460 }}>
                {/* Weekly summary */}
                {thisWeek ? (
                  <View style={s.weeklyCard}>
                    <Text style={s.weeklyLabel}>THIS WEEK SO FAR</Text>
                    <View style={s.weeklyRow}>
                      <View style={s.weeklyStat}>
                        <Text style={s.weeklyVal}>₹{Math.round(thisWeek.expense || 0).toLocaleString('en-IN')}</Text>
                        <Text style={s.weeklyStatLbl}>Spent</Text>
                      </View>
                      <View style={s.weeklyDivider} />
                      <View style={s.weeklyStat}>
                        <Text style={[s.weeklyVal, { color: '#059669' }]}>₹{Math.round(thisWeek.saved || 0).toLocaleString('en-IN')}</Text>
                        <Text style={s.weeklyStatLbl}>Saved</Text>
                      </View>
                      <View style={s.weeklyDivider} />
                      <View style={s.weeklyStat}>
                        <Text style={s.weeklyVal}>{thisWeek.txn_count || 0}</Text>
                        <Text style={s.weeklyStatLbl}>Txns</Text>
                      </View>
                    </View>
                    {commentary ? (
                      <View style={s.commentaryRow}>
                        <Ionicons name="sparkles" size={11} color="#7C3AED" />
                        <Text style={s.commentaryTxt} numberOfLines={2}>{commentary}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {/* Quick actions */}
                <Text style={s.sectionLbl}>Quick actions</Text>
                <View style={s.quickRow}>
                  {quickActions.map((q) => (
                    <TouchableOpacity
                      key={q.label}
                      style={s.quickBtn}
                      onPress={() => { haptic(); openAI(q.query); }}
                      activeOpacity={0.85}
                    >
                      <Ionicons name={q.icon} size={18} color={'#7C3AED'} />
                      <Text style={s.quickTxt}>{q.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Smart suggestions */}
                {boosts.length > 0 ? (
                  <>
                    <Text style={s.sectionLbl}>Smart suggestions</Text>
                    {boosts.map((b, i) => (
                      <TouchableOpacity
                        key={b.id}
                        style={[s.suggestion, i > 0 && s.suggestionDivider]}
                        onPress={() => {
                          haptic(); onClose();
                          setTimeout(() => { try { router.push(b.route as any); } catch {} }, 200);
                        }}
                        activeOpacity={0.8}
                      >
                        <Text style={s.suggestionEmoji}>{b.emoji}</Text>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={s.suggestionTitle} numberOfLines={1}>{b.title}</Text>
                          <Text style={s.suggestionSub} numberOfLines={2}>{b.sub}</Text>
                        </View>
                        <View style={s.ptsPill}><Text style={s.ptsTxt}>+{b.points}</Text></View>
                      </TouchableOpacity>
                    ))}
                  </>
                ) : null}

                <TouchableOpacity
                  style={s.openFullBtn}
                  onPress={() => { haptic(); openAI(); }}
                  activeOpacity={0.88}
                >
                  <Ionicons name="chatbubbles" size={16} color={'#fff'} />
                  <Text style={s.openFullTxt}>Open full AI chat</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: c.bg.secondary, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32, maxHeight: '88%' },
  grip: { width: 40, height: 4, borderRadius: 2, backgroundColor: c.border.subtle, alignSelf: 'center', marginBottom: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  aiBubble: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '800', color: c.text.primary },
  sub: { fontSize: 11, fontWeight: '500', color: c.text.muted, marginTop: 2 },
  closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: c.bg.primary, alignItems: 'center', justifyContent: 'center' },

  sectionLbl: { fontSize: 11, fontWeight: '800', color: c.text.muted, letterSpacing: 0.7, textTransform: 'uppercase', marginTop: 14, marginBottom: 8 },

  weeklyCard: { padding: 14, borderRadius: 16, backgroundColor: '#7C3AED0F', borderWidth: 1, borderColor: '#7C3AED2E' },
  weeklyLabel: { fontSize: 10, fontWeight: '800', color: '#7C3AED', letterSpacing: 0.7 },
  weeklyRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  weeklyStat: { flex: 1, alignItems: 'center' },
  weeklyVal: { fontSize: 15, fontWeight: '900', color: c.text.primary, letterSpacing: -0.3 },
  weeklyStatLbl: { fontSize: 10, fontWeight: '600', color: c.text.muted, marginTop: 2 },
  weeklyDivider: { width: 1, height: 28, backgroundColor: '#7C3AED2E' },
  commentaryRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#7C3AED2E' },
  commentaryTxt: { flex: 1, fontSize: 11.5, fontWeight: '700', color: '#6B21A8' },

  quickRow: { flexDirection: 'row', gap: 8 },
  quickBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 11, borderRadius: 12, backgroundColor: '#7C3AED14', borderWidth: 1, borderColor: '#7C3AED2E' },
  quickTxt: { fontSize: 12, fontWeight: '700', color: '#7C3AED' },

  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  suggestionDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border.subtle },
  suggestionEmoji: { fontSize: 22 },
  suggestionTitle: { fontSize: 13, fontWeight: '700', color: c.text.primary },
  suggestionSub: { fontSize: 11, fontWeight: '500', color: c.text.muted, marginTop: 2, lineHeight: 14 },
  ptsPill: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, backgroundColor: '#10B98122' },
  ptsTxt: { fontSize: 10, fontWeight: '900', color: '#059669' },

  openFullBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 12, backgroundColor: '#7C3AED', marginTop: 14 },
  openFullTxt: { fontSize: 13.5, fontWeight: '800', color: '#fff' },
}));
