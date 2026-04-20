/**
 * CoinRedeemPanel — apply earned coins toward a premium / split payment.
 *
 *   [🪙 You have 520 coins]
 *   [  No coins  |  Apply all — ₹52 off  ]
 *   Effective price: ₹47
 *
 * - Fetches balance from /api/coins/status
 * - Calls /api/premium/coin-redeem-preview whenever `apply` flips
 * - Parent receives { coinsToUse } via onChange
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../utils/api';

type Props = {
  plan: string;           // 'monthly' | 'yearly' | 'lifetime' (or split/custom for splits)
  listPrice: number;      // display-only; backend is source-of-truth
  onChange: (payload: { coinsToUse: number; discount: number; effective: number }) => void;
  compact?: boolean;      // tighter layout
};

export default function CoinRedeemPanel({ plan, listPrice, onChange, compact }: Props) {
  const [balance, setBalance] = useState<number | null>(null);
  const [apply, setApply] = useState<boolean>(false);
  const [preview, setPreview] = useState<{ discount: number; effective: number; coins_applied: number } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/coins/status');
        setBalance(Number(res.data?.balance || 0));
      } catch { setBalance(0); }
    })();
  }, []);

  useEffect(() => {
    if (balance == null) return;
    if (!apply) {
      onChange({ coinsToUse: 0, discount: 0, effective: listPrice });
      setPreview({ discount: 0, effective: listPrice, coins_applied: 0 });
      return;
    }
    (async () => {
      setLoading(true);
      try {
        const res = await api.post('/premium/coin-redeem-preview', { plan, coins_to_use: balance });
        const p = res.data;
        setPreview({ discount: p.discount, effective: p.effective_price, coins_applied: p.coins_applied });
        onChange({ coinsToUse: p.coins_applied, discount: p.discount, effective: p.effective_price });
      } catch {
        setPreview(null);
        onChange({ coinsToUse: 0, discount: 0, effective: listPrice });
      } finally { setLoading(false); }
    })();
  }, [apply, balance, plan, listPrice]);

  if (balance == null) {
    return <View style={[s.wrap, compact && s.wrapCompact]}><ActivityIndicator color="#F56E1E" size="small" /></View>;
  }

  if (balance <= 0) {
    return (
      <View style={[s.wrap, compact && s.wrapCompact]}>
        <View style={s.head}>
          <Text style={{ fontSize: 18 }}>🪙</Text>
          <Text style={s.headTxt}>No coins yet — earn some by completing daily quests!</Text>
        </View>
      </View>
    );
  }

  const savings = preview?.discount ?? 0;
  const effective = preview?.effective ?? listPrice;

  return (
    <View style={[s.wrap, compact && s.wrapCompact]}>
      <View style={s.head}>
        <Text style={{ fontSize: 18 }}>🪙</Text>
        <Text style={s.headTxt}>You have <Text style={s.headBold}>{balance}</Text> coins</Text>
      </View>

      <View style={s.segRow}>
        <TouchableOpacity
          style={[s.seg, !apply && s.segOn]}
          onPress={() => setApply(false)}
          activeOpacity={0.85}
          testID="coin-redeem-none"
        >
          <Text style={[s.segTxt, !apply && s.segTxtOn]}>No coins</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.seg, apply && s.segOn]}
          onPress={() => setApply(true)}
          activeOpacity={0.85}
          testID="coin-redeem-all"
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color={apply ? '#fff' : '#F56E1E'} size="small" />
            : <Text style={[s.segTxt, apply && s.segTxtOn]}>Apply all · ₹{savings} off</Text>}
        </TouchableOpacity>
      </View>

      <View style={s.priceRow}>
        <Text style={s.priceLbl}>Effective price</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {savings > 0 && <Text style={s.priceStrike}>₹{listPrice}</Text>}
          <Text style={s.priceVal}>₹{effective}</Text>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { backgroundColor: '#FFF7ED', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#FED7AA', marginBottom: 10 },
  wrapCompact: { padding: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  headTxt: { flex: 1, fontSize: 12, color: '#78350F', fontWeight: '600' },
  headBold: { fontWeight: '800', color: '#7C2D12' },

  segRow: { flexDirection: 'row', gap: 6, backgroundColor: '#FFEFDC', padding: 4, borderRadius: 12 },
  seg: { flex: 1, paddingVertical: 9, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  segOn: { backgroundColor: '#F56E1E' },
  segTxt: { fontSize: 12, fontWeight: '700', color: '#78350F' },
  segTxtOn: { color: '#fff' },

  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#FED7AA' },
  priceLbl: { fontSize: 11, color: '#78350F', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  priceVal: { fontSize: 18, fontWeight: '800', color: '#7C2D12' },
  priceStrike: { fontSize: 13, color: '#9CA3AF', fontWeight: '600', textDecorationLine: 'line-through' },
});
