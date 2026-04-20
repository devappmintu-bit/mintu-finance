// Profile → Premium card. Saffron MintU theme. Dynamic plan selection with
// Monthly / Yearly (best) / Lifetime tiles. Tapping "Upgrade" opens the
// MockPaymentSheet, which on success activates premium on the backend and
// unlocks perks (Money School gated to Yearly + Lifetime).
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import api from '../../utils/api';
import PremiumComparison from '../premium/PremiumComparison';
import CoinRedeemPanel from '../premium/CoinRedeemPanel';
import { COLORS } from '../../utils/theme';
import MockPaymentSheet from '../MockPaymentSheet';
import Toast from 'react-native-toast-message';
import { useLangStore } from '../../store/langStore';
import { t } from '../../utils/i18n';

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

// Feature-row i18n keys — a localised string is resolved at render time.
const FEATURE_KEYS = [
  { icon: 'infinite', key: 'feature_unlimited_ai' },
  { icon: 'flash', key: 'feature_priority_ai' },
  { icon: 'bar-chart', key: 'feature_advanced_analytics' },
  { icon: 'trophy', key: 'feature_exclusive_badges' },
  { icon: 'close-circle', key: 'feature_zero_ads' },
];

interface Props {
  onExplore: () => void;
}

export default function PremiumExpandable({ onExplore }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [coinRedeem, setCoinRedeem] = useState<{ coinsToUse: number; discount: number; effective: number }>({ coinsToUse: 0, discount: 0, effective: 0 });
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selected, setSelected] = useState<string>('yearly');
  const [status, setStatus] = useState<{ is_premium: boolean; plan?: string; tier?: string; premium_until?: string } | null>(null);
  const [showPay, setShowPay] = useState(false);
  const { lang } = useLangStore();

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
      const res = await api.post('/premium/mock-activate', { plan: selected, coins_to_use: coinRedeem.coinsToUse });
      setShowPay(false);
      Toast.show({
        type: 'success',
        text1: t('premium_unlocked', lang),
        text2: res.data.money_school_access ? t('money_school_open', lang) : t('enjoy_perks', lang),
      });
      fetchStatus();
    } catch (e: any) {
      Toast.show({ type: 'error', text1: t('activation_failed', lang), text2: e?.response?.data?.detail || t('try_again', lang) });
    }
  };

  // Already premium? Show a post-payment card with reports entry.
  if (status?.is_premium) {
    return (
      <LinearGradient colors={['#F56E1E', '#C14A06']} style={[s.card, { padding: 16 }]}>
        <View style={s.headerRow}>
          <View style={s.iconBoxActive}><Ionicons name="diamond" size={22} color="#F56E1E" /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.titleActive}>{t('premium_active', lang)}</Text>
            <Text style={s.subActive} numberOfLines={1}>
              {status.plan ? `${String(status.plan).toUpperCase()} ${t('plan', lang)}` : ''}
              {status.premium_until ? ` · ${t('until', lang)} ${new Date(status.premium_until).toLocaleDateString()}` : ''}
            </Text>
          </View>
          <Ionicons name="checkmark-circle" size={26} color="#fff" />
        </View>

        {/* Premium perks quick-access row (post-payment) */}
        <View style={s.perksRow}>
          <TouchableOpacity style={s.perkBtn} onPress={() => router.push('/premium-reports' as any)} activeOpacity={0.85}>
            <Ionicons name="analytics" size={18} color="#fff" />
            <Text style={s.perkTxt}>{t('deep_reports', lang)}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.perkBtn} onPress={onExplore} activeOpacity={0.85}>
            <Ionicons name="trophy" size={18} color="#fff" />
            <Text style={s.perkTxt}>{t('premium_perks', lang)}</Text>
          </TouchableOpacity>
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
            <Text style={s.title}>MintU {t('premium', lang)}</Text>
            <Text style={s.sub}>{t('premium_fallback_sub', lang)}</Text>
          </View>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.accent.primary} />
        </TouchableOpacity>

        {expanded && (
          <View style={s.body}>
            {/* PLAN TILES — dynamic, highlighted selection */}
            <View style={s.plansRow}>
              {plans.map(p => {
                const isOn = selected === p.id;
                const planLbl = t(`plan_${p.id}`, lang) !== `plan_${p.id}` ? t(`plan_${p.id}`, lang) : p.id.charAt(0).toUpperCase() + p.id.slice(1);
                const periodLbl = p.period === 'per month' ? t('per_month', lang)
                                : p.period === 'per year' ? t('per_year', lang)
                                : p.period === 'one-time' ? t('one_time', lang)
                                : p.period;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[s.planTile, isOn && s.planTileOn]}
                    onPress={() => setSelected(p.id)}
                    activeOpacity={0.85}
                  >
                    {p.best_seller && (
                      <View style={s.badge}><Text style={s.badgeTxt}>{t('best_seller_badge', lang)}</Text></View>
                    )}
                    <Text style={[s.planId, isOn && s.planIdOn]} numberOfLines={1}>
                      {planLbl}
                    </Text>
                    <Text style={[s.planPrice, isOn && s.planPriceOn]}>₹{p.price.toLocaleString('en-IN')}</Text>
                    <Text style={[s.planPeriod, isOn && s.planPeriodOn]} numberOfLines={1}>
                      {periodLbl}
                    </Text>
                    {!!p.savings && <Text style={[s.planSave, isOn && s.planSaveOn]} numberOfLines={1}>{p.savings}</Text>}
                    {!!p.includes_money_school && (
                      <View style={[s.schoolPill, isOn && s.schoolPillOn]}>
                        <Ionicons name="school" size={9} color={isOn ? '#fff' : '#F56E1E'} />
                        <Text style={[s.schoolTxt, isOn && { color: '#fff' }]}>{t('money_school_pill', lang)}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* FEATURES */}
            {FEATURE_KEYS.map((f, i) => (
              <View key={i} style={s.featureRow}>
                <View style={s.check}><Ionicons name="checkmark" size={12} color="#fff" /></View>
                <Ionicons name={f.icon as any} size={15} color="#C14A06" />
                <Text style={s.featureText}>{t(f.key, lang)}</Text>
              </View>
            ))}
            <View style={[s.featureRow, !chosen?.includes_money_school && { opacity: 0.55 }]}>
              <View style={[s.check, !chosen?.includes_money_school && { backgroundColor: '#D1D5DB' }]}>
                <Ionicons name={chosen?.includes_money_school ? 'checkmark' : 'close'} size={12} color="#fff" />
              </View>
              <Ionicons name="school" size={15} color="#C14A06" />
              <Text style={s.featureText}>{t('feature_money_school', lang)}</Text>
            </View>

            {/* Coin redeem — apply earned coins for an instant discount */}
            {chosen && (
              <CoinRedeemPanel
                plan={selected}
                listPrice={chosen.price || 0}
                onChange={setCoinRedeem}
              />
            )}

            {/* CTA row */}
            <View style={s.ctaRow}>
              <View>
                <Text style={s.ctaTotalLbl}>{t('total_today', lang)}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {coinRedeem.discount > 0 && (
                    <Text style={{ fontSize: 12, color: '#9CA3AF', fontWeight: '600', textDecorationLine: 'line-through' }}>
                      ₹{(chosen?.price || 0).toLocaleString('en-IN')}
                    </Text>
                  )}
                  <Text style={s.ctaTotal}>
                    ₹{Math.max(0, (chosen?.price || 0) - coinRedeem.discount).toLocaleString('en-IN')}
                  </Text>
                </View>
              </View>
              <TouchableOpacity style={s.cta} onPress={() => setShowPay(true)} disabled={!chosen}>
                <LinearGradient colors={['#F56E1E', '#C14A06']} style={s.ctaGrad}>
                  <Text style={s.ctaText}>{t('upgrade', lang)}</Text>
                  <Ionicons name="arrow-forward" size={16} color="#fff" />
                </LinearGradient>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={s.seeAll} onPress={() => setShowComparison(v => !v)}>
              <Text style={s.seeAllTxt}>
                {showComparison ? '▲ Hide comparison' : `${t('see_all_benefits', lang)} →`}
              </Text>
            </TouchableOpacity>

            {showComparison && (
              <View style={{ marginTop: 12 }}>
                <PremiumComparison onClose={() => setShowComparison(false)} />
              </View>
            )}
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

  perksRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  perkBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 11, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  perkTxt: { color: '#fff', fontWeight: '800', fontSize: 12.5 },
});
