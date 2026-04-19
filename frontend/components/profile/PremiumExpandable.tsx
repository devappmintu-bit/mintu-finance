// Profile → Premium card. Saffron MintU theme. Dynamic plan selection with
// Monthly / Yearly (best) / Lifetime tiles. Tapping "Upgrade" opens the
// MockPaymentSheet, which on success activates premium on the backend and
// unlocks perks (Money School gated to Yearly + Lifetime).
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../utils/api';
import { COLORS } from '../../utils/theme';
import MockPaymentSheet from '../MockPaymentSheet';
import Toast from 'react-native-toast-message';

interface Plan {
  id: string;
  label: string;
  price: number;
  period: string;
  savings?: string;
  best_seller?: boolean;
  includes_money_school?: boolean;
  order?: number;
}

const FEATURES = [
  { icon: 'infinite', text: 'Unlimited AI Coach conversations' },
  { icon: 'flash', text: 'Priority GPT-5.2 responses (no queue)' },
  { icon: 'bar-chart', text: 'Advanced analytics & custom reports' },
  { icon: 'trophy', text: 'Exclusive badges & leaderboard perks' },
  { icon: 'close-circle', text: 'Zero ads, ever' },
];
const MONEY_SCHOOL_FEATURE = { icon: 'school', text: 'Money School (Yearly & Lifetime only)' };

interface Props {
  onExplore: () => void;
}

export default function PremiumExpandable({ onExplore }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selected, setSelected] = useState<string>('yearly');
  const [status, setStatus] = useState<{ is_premium: boolean; plan?: string; tier?: string; premium_until?: string } | null>(null);
  const [showPay, setShowPay] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await api.get('/premium/status');
      setStatus({
        is_premium: !!res.data.is_premium,
        tier: res.data.tier,
        plan: res.data.plan || (res.data as any).premium_plan,
        premium_until: res.data.premium_until,
      });
      // Flatten the PRICING dict coming from backend.
      const list: Plan[] = Object.entries(res.data.pricing || {})
        .filter(([k]) => k !== 'intro')
        .map(([id, v]: [string, any]) => ({ id, ...v }))
        .sort((a, b) => (a.order || 0) - (b.order || 0));
      setPlans(list);
      // Default-select the best-seller once data arrives.
      const best = list.find(p => (p as any).best_seller);
      if (best) setSelected(best.id);
    } catch {}
  };

  useEffect(() => { fetchStatus(); }, []);

  const chosen = plans.find(p => p.id === selected);

  const onPaymentSuccess = async () => {
    try {
      const res = await api.post('/premium/mock-activate', { plan: selected });
      setShowPay(false);
      Toast.show({
        type: 'success',
        text1: 'Premium unlocked!',
        text2: res.data.money_school_access ? 'Money School is now open for you.' : 'Enjoy every premium perk.',
      });
      fetchStatus();
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Activation failed', text2: e?.response?.data?.detail || 'Try again' });
    }
  };

  // Already premium? Show a success card.
  if (status?.is_premium) {
    return (
      <LinearGradient colors={['#F56E1E', '#C14A06']} style={[s.card, { padding: 16 }]}>
        <View style={s.headerRow}>
          <View style={s.iconBoxActive}><Ionicons name="diamond" size={22} color="#F56E1E" /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.titleActive}>Premium Active</Text>
            <Text style={s.subActive} numberOfLines={1}>
              {status.plan ? `${String(status.plan).toUpperCase()} plan` : ''}
              {status.premium_until ? ` · until ${new Date(status.premium_until).toLocaleDateString()}` : ''}
            </Text>
          </View>
          <Ionicons name="checkmark-circle" size={26} color="#fff" />
        </View>
      </LinearGradient>
    );
  }

  return (
    <>
      <LinearGradient colors={['#FFF4E8', '#FFE4CC']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.card}>
        <TouchableOpacity style={s.header} onPress={() => setExpanded(!expanded)} activeOpacity={0.85}>
          <LinearGradient colors={['#F56E1E', '#C14A06']} style={s.iconBox}>
            <Ionicons name="diamond" size={22} color="#fff" />
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>MintU Premium</Text>
            <Text style={s.sub}>Unlock AI, reports, Money School & more</Text>
          </View>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.accent.primary} />
        </TouchableOpacity>

        {expanded && (
          <View style={s.body}>
            {/* PLAN TILES — dynamic, highlighted selection */}
            <View style={s.plansRow}>
              {plans.map(p => {
                const isOn = selected === p.id;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[s.planTile, isOn && s.planTileOn]}
                    onPress={() => setSelected(p.id)}
                    activeOpacity={0.85}
                  >
                    {p.best_seller && (
                      <View style={s.badge}><Text style={s.badgeTxt}>BEST</Text></View>
                    )}
                    <Text style={[s.planId, isOn && s.planIdOn]} numberOfLines={1}>
                      {p.id.charAt(0).toUpperCase() + p.id.slice(1)}
                    </Text>
                    <Text style={[s.planPrice, isOn && s.planPriceOn]}>₹{p.price.toLocaleString('en-IN')}</Text>
                    <Text style={[s.planPeriod, isOn && s.planPeriodOn]} numberOfLines={1}>
                      {p.period}
                    </Text>
                    {!!p.savings && <Text style={[s.planSave, isOn && s.planSaveOn]} numberOfLines={1}>{p.savings}</Text>}
                    {!!p.includes_money_school && (
                      <View style={[s.schoolPill, isOn && s.schoolPillOn]}>
                        <Ionicons name="school" size={9} color={isOn ? '#fff' : '#F56E1E'} />
                        <Text style={[s.schoolTxt, isOn && { color: '#fff' }]}>Money School</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* FEATURES */}
            {FEATURES.map((f, i) => (
              <View key={i} style={s.featureRow}>
                <View style={s.check}><Ionicons name="checkmark" size={12} color="#fff" /></View>
                <Ionicons name={f.icon as any} size={15} color="#C14A06" />
                <Text style={s.featureText}>{f.text}</Text>
              </View>
            ))}
            <View style={[s.featureRow, !chosen?.includes_money_school && { opacity: 0.55 }]}>
              <View style={[s.check, !chosen?.includes_money_school && { backgroundColor: '#D1D5DB' }]}>
                <Ionicons name={chosen?.includes_money_school ? 'checkmark' : 'close'} size={12} color="#fff" />
              </View>
              <Ionicons name="school" size={15} color="#C14A06" />
              <Text style={s.featureText}>{MONEY_SCHOOL_FEATURE.text}</Text>
            </View>

            {/* CTA row */}
            <View style={s.ctaRow}>
              <View>
                <Text style={s.ctaTotalLbl}>Total today</Text>
                <Text style={s.ctaTotal}>₹{(chosen?.price || 0).toLocaleString('en-IN')}</Text>
              </View>
              <TouchableOpacity style={s.cta} onPress={() => setShowPay(true)} disabled={!chosen}>
                <LinearGradient colors={['#F56E1E', '#C14A06']} style={s.ctaGrad}>
                  <Text style={s.ctaText}>Upgrade</Text>
                  <Ionicons name="arrow-forward" size={16} color="#fff" />
                </LinearGradient>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={s.seeAll} onPress={onExplore}>
              <Text style={s.seeAllTxt}>See all benefits →</Text>
            </TouchableOpacity>
          </View>
        )}
      </LinearGradient>

      <MockPaymentSheet
        visible={showPay}
        planId={selected}
        planLabel={chosen?.label || ''}
        amount={chosen?.price || 0}
        onClose={() => setShowPay(false)}
        onSuccess={onPaymentSuccess}
      />
    </>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: 20, marginBottom: 14, borderWidth: 1, borderColor: '#F56E1E55', overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox: { width: 42, height: 42, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  iconBoxActive: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '800', color: '#78350F' },
  titleActive: { fontSize: 16, fontWeight: '800', color: '#fff' },
  sub: { fontSize: 12, color: '#9A5B1C', marginTop: 2 },
  subActive: { fontSize: 12, color: 'rgba(255,255,255,0.9)', marginTop: 2 },
  body: { padding: 14, paddingTop: 4 },

  plansRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  planTile: {
    flex: 1, paddingVertical: 14, paddingHorizontal: 10,
    borderRadius: 14, borderWidth: 1.5, borderColor: '#F0C89A',
    backgroundColor: '#fff',
    alignItems: 'center', position: 'relative',
  },
  planTileOn: { borderColor: '#F56E1E', backgroundColor: '#F56E1E', shadowColor: '#F56E1E', shadowOpacity: 0.3, shadowRadius: 6 },
  badge: { position: 'absolute', top: -9, backgroundColor: '#10B981', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  badgeTxt: { fontSize: 9, color: '#fff', fontWeight: '800', letterSpacing: 0.5 },
  planId: { fontSize: 11, fontWeight: '700', color: '#78350F', letterSpacing: 0.5 },
  planIdOn: { color: 'rgba(255,255,255,0.9)' },
  planPrice: { fontSize: 18, fontWeight: '800', color: '#78350F', marginTop: 4 },
  planPriceOn: { color: '#fff' },
  planPeriod: { fontSize: 10, color: '#9A5B1C', marginTop: 2 },
  planPeriodOn: { color: 'rgba(255,255,255,0.9)' },
  planSave: { fontSize: 10, color: '#10B981', marginTop: 4, fontWeight: '700' },
  planSaveOn: { color: '#FFE7A0' },
  schoolPill: { flexDirection: 'row', gap: 3, alignItems: 'center', paddingHorizontal: 6, paddingVertical: 2, marginTop: 6, borderRadius: 8, backgroundColor: '#FFE4CC' },
  schoolPillOn: { backgroundColor: 'rgba(255,255,255,0.22)' },
  schoolTxt: { fontSize: 9, fontWeight: '700', color: '#F56E1E' },

  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  check: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center' },
  featureText: { flex: 1, fontSize: 13, color: '#4A2A06' },

  ctaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#F0C89A' },
  ctaTotalLbl: { fontSize: 11, color: '#9A5B1C' },
  ctaTotal: { fontSize: 22, fontWeight: '800', color: '#78350F' },
  cta: { borderRadius: 999, overflow: 'hidden' },
  ctaGrad: { flexDirection: 'row', gap: 8, paddingHorizontal: 22, paddingVertical: 12, alignItems: 'center' },
  ctaText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  seeAll: { alignItems: 'center', marginTop: 10 },
  seeAllTxt: { fontSize: 12, color: '#C14A06', fontWeight: '700' },
});
