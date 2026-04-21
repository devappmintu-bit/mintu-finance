/**
 * BudgetInsightsSheet — Phase 2 AI insights for one category.
 *
 *  [🧠 Food · AI Insight]
 *  Tags: Impulse heavy · 62% after 9 PM · Up 28% vs last month
 *  Tips:
 *    • Skip 2 Swiggy orders/wk → save ₹1,600/mo
 *    • 80% happens post-9PM — try cooling-off
 *  Auto apply: Raise to ₹3,500 · Alert me at 80%
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import api from '../../utils/api';
import { makeStyles } from '../../utils/makeStyles';

const TONE_COLOR: Record<string, { bg: string; fg: string; border: string }> = {
  success: { bg: '#DCFCE7', fg: '#065F46', border: '#86EFAC' },
  warning: { bg: '#FEF3C7', fg: '#92400E', border: '#FDE68A' },
  danger:  { bg: '#FEE2E2', fg: '#B91C1C', border: '#FCA5A5' },
  info:    { bg: '#DBEAFE', fg: '#1E40AF', border: '#93C5FD' },
  neutral: { bg: '#F3F4F6', fg: '#374151', border: '#E5E7EB' },
};

type Props = {
  visible: boolean;
  category?: string | null;
  onClose: () => void;
  onApplied?: () => void; // refresh parent after apply
};

export default function BudgetInsightsSheet({ visible, category, onClose, onApplied }: Props) {
  const s = useStyles();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [applying, setApplying] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!category) return;
    setLoading(true);
    try {
      const r = await api.get(`/budgets/ai-insights/${encodeURIComponent(category)}`);
      setData(r.data);
    } catch {
      setData(null);
    } finally { setLoading(false); }
  }, [category]);

  useEffect(() => { if (visible) load(); }, [visible, load]);

  const apply = async (action: any) => {
    if (!category) return;
    setApplying(action.action + (action.payload?.amount || ''));
    try {
      const r = await api.post(`/budgets/ai-apply/${encodeURIComponent(category)}`, action);
      if (r.data?.ok) {
        Toast.show({ type: 'success', text1: 'Applied ✨', text2: action.label });
        onApplied?.();
        onClose();
      } else {
        Toast.show({ type: 'error', text1: 'Could not apply' });
      }
    } catch {
      Toast.show({ type: 'error', text1: 'Error' });
    } finally {
      setApplying(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={s.wrap}>
        <View style={s.sheet}>
          <View style={s.handle} />
          <View style={s.header}>
            <View style={s.aiBadge}><Text style={{ fontSize: 16 }}>🧠</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>{category} · AI Insight</Text>
              <Text style={s.sub}>Pattern-based recommendations from your 60-day history</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color="#6B7280" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator color="#F56E1E" size="large" style={{ marginVertical: 40 }} />
          ) : !data ? (
            <Text style={s.err}>Could not load insights</Text>
          ) : (
            <>
              {/* Behaviour tags */}
              <Text style={s.sect}>Behaviour</Text>
              <View style={s.tagRow}>
                {(data.tags || []).map((tg: any, i: number) => {
                  const c = TONE_COLOR[tg.tone] || TONE_COLOR.neutral;
                  return (
                    <View key={i} style={[s.tag, { backgroundColor: c.bg, borderColor: c.border }]}>
                      <Text style={[s.tagT, { color: c.fg }]}>{tg.label}</Text>
                    </View>
                  );
                })}
              </View>

              {/* Tips */}
              <Text style={s.sect}>Smart tips</Text>
              {(data.tips || []).map((tip: any, i: number) => (
                <View key={i} style={s.tipRow}>
                  <View style={s.bullet}><Ionicons name="bulb" size={12} color="#F59E0B" /></View>
                  <Text style={s.tipT}>{tip.text}</Text>
                  {tip.save > 0 && (
                    <View style={s.saveChip}>
                      <Text style={s.saveT}>Save ₹{Number(tip.save).toLocaleString('en-IN')}</Text>
                    </View>
                  )}
                </View>
              ))}

              {/* Auto-apply actions */}
              {(data.auto_apply || []).length > 0 && (
                <>
                  <Text style={s.sect}>One-tap actions</Text>
                  {(data.auto_apply || []).map((a: any, i: number) => {
                    const key = a.action + (a.payload?.amount || '');
                    const busy = applying === key;
                    return (
                      <TouchableOpacity
                        key={i}
                        style={[s.actBtn, busy && { opacity: 0.6 }]}
                        disabled={busy}
                        onPress={() => apply(a)}
                        activeOpacity={0.85}
                      >
                        <Ionicons name={a.action === 'enable_alert' ? 'notifications-outline' : 'sparkles-outline'} size={16} color="#F56E1E" />
                        <Text style={s.actT}>{a.label}</Text>
                        {busy ? <ActivityIndicator size="small" color="#F56E1E" /> : <Ionicons name="chevron-forward" size={14} color="#9CA3AF" />}
                      </TouchableOpacity>
                    );
                  })}
                </>
              )}

              {/* Stats */}
              {data.stats && (
                <View style={s.statsBox}>
                  <View style={s.stat}><Text style={s.statV}>₹{Math.round(data.stats.monthly_avg).toLocaleString('en-IN')}</Text><Text style={s.statL}>Monthly avg</Text></View>
                  <View style={s.statDiv} />
                  <View style={s.stat}><Text style={s.statV}>{data.stats.txn_count_60d}</Text><Text style={s.statL}>60-day txns</Text></View>
                  <View style={s.statDiv} />
                  <View style={s.stat}><Text style={[s.statV, { color: data.stats.delta_pct > 0 ? '#B91C1C' : '#059669' }]}>{data.stats.delta_pct > 0 ? '+' : ''}{data.stats.delta_pct}%</Text><Text style={s.statL}>vs last mo</Text></View>
                </View>
              )}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.55)' },
  wrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24, maxHeight: '90%' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginVertical: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  aiBadge: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFF7ED', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FED7AA' },
  title: { fontSize: 17, fontWeight: '800', color: '#111' },
  sub: { fontSize: 11.5, color: '#6B7280', marginTop: 2 },
  err: { textAlign: 'center', color: '#B91C1C', padding: 30, fontSize: 13 },

  sect: { fontSize: 10.5, fontWeight: '800', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 16, marginBottom: 8 },

  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
  tagT: { fontSize: 11.5, fontWeight: '700' },

  tipRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  bullet: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFFBEB', alignItems: 'center', justifyContent: 'center' },
  tipT: { flex: 1, fontSize: 13, color: '#374151', lineHeight: 18 },
  saveChip: { backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  saveT: { fontSize: 10.5, fontWeight: '800', color: '#065F46' },

  actBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF7ED', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8, borderWidth: 1, borderColor: '#FED7AA' },
  actT: { flex: 1, fontSize: 13.5, fontWeight: '700', color: '#7C2D12' },

  statsBox: { flexDirection: 'row', marginTop: 16, backgroundColor: '#F9FAFB', borderRadius: 14, paddingVertical: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  stat: { flex: 1, alignItems: 'center' },
  statV: { fontSize: 15, fontWeight: '800', color: '#111' },
  statL: { fontSize: 10, color: '#6B7280', fontWeight: '700', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.3 },
  statDiv: { width: 1, backgroundColor: '#E5E7EB' },
}));
