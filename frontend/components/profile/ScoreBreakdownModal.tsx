/**
 * ScoreBreakdownModal — tap the hero score to open this. Shows 3 sub-scores
 * (Saving habits, Spending control, Consistency) each with a ring + hint,
 * and the predictive tier progression line.
 *
 * Round 51e — UX upgrade: replaced the bare "Unable to load breakdown"
 * error text with a proper empty/error state UI (icon + message + Retry
 * button), and added a per-attempt request timeout so the spinner can't
 * hang forever on a throttled backend.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import api from '../../utils/api';
import { makeStyles } from '../../utils/makeStyles';
import { COLORS, useAppColors, GLASS } from '../../utils/theme';



// R113 FIX — useStyles hoisted above first render-time call
// to avoid Metro/SDK52 TDZ error (`Cannot access X before init.`).
const useStyles = makeStyles((c) => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: GLASS.solidBg, borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTopWidth: StyleSheet.hairlineWidth, borderColor: GLASS.borderLight, padding: 20, paddingBottom: 32, maxHeight: '86%' },
  grip: { width: 40, height: 4, borderRadius: 2, backgroundColor: c.border.subtle, alignSelf: 'center', marginBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  sheetLabel: { fontSize: 11, fontWeight: '700', color: c.text.muted, letterSpacing: 0.6, textTransform: 'uppercase' },
  sheetTitle: { fontSize: 30, fontWeight: '900', color: c.text.primary, letterSpacing: -1, marginTop: 3 },
  sheetTitleOf: { fontSize: 15, fontWeight: '700', color: c.text.muted },
  closeBtn: { width: 34, height: 34, borderRadius: 0, backgroundColor: c.bg.primary, alignItems: 'center', justifyContent: 'center' },

  predictive: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 12, borderRadius: 0, backgroundColor: '#F56E1E14', borderWidth: 1, borderColor: '#F56E1E33', marginBottom: 14 },
  predictiveTxt: { flex: 1, fontSize: 12.5, fontWeight: '700', color: c.accent.brandDark },

  pillar: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border.subtle },
  ringWrap: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  ringEmoji: { position: 'absolute', fontSize: 24 },
  pillarLabel: { fontSize: 11.5, fontWeight: '700', color: c.text.muted, letterSpacing: 0.3, textTransform: 'uppercase' },
  pillarScore: { fontSize: 22, fontWeight: '900', marginTop: 3, letterSpacing: -0.6 },
  pillarScoreOf: { fontSize: 12, fontWeight: '700', color: c.text.muted },
  pillarHint: { fontSize: 11.5, fontWeight: '600', color: c.text.secondary, marginTop: 2, lineHeight: 15 },

  footerTip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 14 },
  footerTipTxt: { fontSize: 11, fontWeight: '500', color: c.text.muted },

  // Round 51e — error/empty state UI for /profile/score-breakdown failures.
  errorWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 36, paddingHorizontal: 16, gap: 10 },
  errorIconWrap: { width: 64, height: 64, borderRadius: 0, backgroundColor: c.bg.primary, alignItems: 'center', justifyContent: 'center' },
  errorTitle: { fontSize: 16, fontWeight: '800', color: c.text.primary, textAlign: 'center', marginTop: 4 },
  errorSub: { fontSize: 12.5, color: c.text.muted, textAlign: 'center', lineHeight: 18, marginBottom: 6 },
  errorRetry: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: c.accent.primary, paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 0, marginTop: 4,
  },
  errorRetryTxt: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
}));

type Pillar = { key: string; label: string; score: number; emoji: string; hint: string };
type Data = {
  current_score: number;
  next_tier: string;
  points_to_next: number;
  predictive_insight: string;
  status_ring: 'green' | 'orange' | 'red';
  pillars: Pillar[];
};

function Ring({ pct, color, size = 72 }: { pct: number; color: string; size?: number }) {
  const r = (size - 8) / 2;
  const circumference = 2 * Math.PI * r;
  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={COLORS.bg.secondary} strokeWidth={8} fill="none" />
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={8} fill="none" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference - (circumference * Math.min(100, pct)) / 100} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </Svg>
  );
}

export default function ScoreBreakdownModal({ visible, onClose, fallbackScore = 0 }: { visible: boolean; onClose: () => void; fallbackScore?: number }) {
  const s = useStyles();
  const c = useAppColors();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKind, setErrorKind] = useState<null | 'timeout' | 'offline' | 'server'>(null);

  // Round 51e — wrapped in useCallback so the Retry button can re-invoke
  // the same fetch path. Includes a 10s per-request timeout (longer than
  // the default 12s axios timeout to allow for retry-once) and
  // distinguishes timeout vs server vs network errors so the UI can
  // surface a precise message.
  const load = useCallback(() => {
    setLoading(true);
    setErrorKind(null);
    api.get('/profile/score-breakdown', { timeout: 10_000 })
      .then(r => { setData(r.data); setErrorKind(null); })
      .catch((e: any) => {
        setData(null);
        const code = e?.code || '';
        const msg = e?.message || '';
        if (code === 'ECONNABORTED' || /timeout/i.test(msg)) setErrorKind('timeout');
        else if (!e?.response) setErrorKind('offline');
        else setErrorKind('server');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!visible) return;
    load();
  }, [visible, load]);

  const PILLAR_COLORS: Record<string, string> = { saving_habits: COLORS.state.successAlt, spending_control: COLORS.accent.secondary, consistency: '#7C3AED' };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} onPress={() => {}} style={{ width: '100%' }}>
          <View style={s.sheet}>
            <View style={s.grip} />
            <View style={s.header}>
              <View>
                <Text style={s.sheetLabel}>Money Score breakdown</Text>
                <Text style={s.sheetTitle}>{data?.current_score ?? fallbackScore} <Text style={s.sheetTitleOf}>/ 100</Text></Text>
              </View>
              <TouchableOpacity onPress={onClose} hitSlop={10} style={s.closeBtn}>
                <Ionicons name="close" size={20} color={COLORS.text.primary} />
              </TouchableOpacity>
            </View>

            {loading ? (
              <View style={{ padding: 30, alignItems: 'center' }}><ActivityIndicator color={COLORS.accent.brand} /></View>
            ) : data ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Predictive insight */}
                <View style={s.predictive}>
                  <Ionicons name="sparkles" size={14} color={COLORS.accent.brand} />
                  <Text style={s.predictiveTxt}>{data.predictive_insight}</Text>
                </View>

                {/* Pillars */}
                {data.pillars.map((p) => {
                  const color = PILLAR_COLORS[p.key] || COLORS.accent.brand;
                  return (
                    <View key={p.key} style={s.pillar}>
                      <View style={s.ringWrap}>
                        <Ring pct={p.score} color={color} size={72} />
                        <Text style={s.ringEmoji}>{p.emoji}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.pillarLabel}>{p.label}</Text>
                        <Text style={[s.pillarScore, { color }]}>{p.score}<Text style={s.pillarScoreOf}> / 100</Text></Text>
                        <Text style={s.pillarHint} numberOfLines={2}>{p.hint}</Text>
                      </View>
                    </View>
                  );
                })}

                {/* Footer tip */}
                <View style={s.footerTip}>
                  <Ionicons name="information-circle-outline" size={13} color={COLORS.text.muted} />
                  <Text style={s.footerTipTxt}>Complete today's missions to raise every pillar.</Text>
                </View>
              </ScrollView>
            ) : (
              /* Round 51e — proper empty/error state instead of raw text. */
              <View style={s.errorWrap}>
                <View style={s.errorIconWrap}>
                  <Ionicons
                    name={errorKind === 'offline' ? 'cloud-offline-outline' : errorKind === 'timeout' ? 'hourglass-outline' : 'alert-circle-outline'}
                    size={36}
                    color={c.text.muted}
                  />
                </View>
                <Text style={s.errorTitle}>
                  {errorKind === 'offline' ? "You're offline"
                    : errorKind === 'timeout' ? 'Server is busy'
                    : "Couldn't load breakdown"}
                </Text>
                <Text style={s.errorSub}>
                  {errorKind === 'offline'
                    ? 'Connect to the internet and try again.'
                    : errorKind === 'timeout'
                      ? 'This is taking longer than usual. One more try?'
                      : "We'll do better next time. Tap retry."}
                </Text>
                <TouchableOpacity
                  onPress={load}
                  style={s.errorRetry}
                  activeOpacity={0.85}
                  testID="score-breakdown-retry"
                >
                  <Ionicons name="refresh" size={14} color="#FFFFFF" />
                  <Text style={s.errorRetryTxt}>Try again</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

