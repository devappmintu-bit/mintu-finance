import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, Platform, KeyboardAvoidingView, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';
import { C, UPI_APPS } from './theme';
import CoinRedeemPanel from '../premium/CoinRedeemPanel';
import SheetHeader from '../ui/SheetHeader';
import { useIsOnline } from '../../hooks/useIsOnline';

type Props = {
  visible: boolean;
  onClose: () => void;
  target: any;
  onPayUPI: (coinsToUse?: number) => void;
  onPayCash: (coinsToUse?: number) => void;
  onPayPartial: (amount: number, coinsToUse?: number) => void;
  /** When provided, PaySheet shows a Razorpay CTA. Invoked with the effective
   *  amount (after partial selection) + coins the user chose to redeem. The
   *  parent handles the WebBrowser + order-create flow. */
  onPayRazorpay?: (amount: number, coinsToUse?: number) => void;
};

export default function PaySheet({ visible, onClose, target, onPayUPI, onPayCash, onPayPartial, onPayRazorpay }: Props) {
  const s = useStyles();
  const isOnline = useIsOnline();
  const [partialOn, setPartialOn] = useState(false);
  const [partialAmt, setPartialAmt] = useState('');
  const [coinRedeem, setCoinRedeem] = useState<{ coinsToUse: number; discount: number; effective: number }>({
    coinsToUse: 0, discount: 0, effective: 0,
  });

  useEffect(() => {
    if (visible) {
      setPartialOn(false);
      setPartialAmt('');
      setCoinRedeem({ coinsToUse: 0, discount: 0, effective: 0 });
    }
  }, [visible]);

  const max = target?.amount || 0;
  const amt = parseFloat(partialAmt) || 0;
  const isValid = (partialOn ? amt > 0 && amt <= max : true) && isOnline;
  const finalAmt = partialOn ? amt : max;

  // Coin panel operates on the currently selected amount so discount reflects real spend.
  const coinListPrice = useMemo(() => (partialOn ? amt || max : max), [partialOn, amt, max]);

  const triggerPay = (kind: 'upi' | 'cash') => {
    if (!isValid) return;
    if (partialOn) onPayPartial(finalAmt, coinRedeem.coinsToUse);
    else if (kind === 'upi') onPayUPI(coinRedeem.coinsToUse);
    else onPayCash(coinRedeem.coinsToUse);
  };

  const effectiveDisplay = coinRedeem.coinsToUse > 0 && coinListPrice > 0
    ? Math.max(0, coinListPrice - coinRedeem.discount)
    : coinListPrice;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.mBg}>
        <View style={s.sheet}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
            <SheetHeader
              title={`Pay ₹${(target?.amount || 0).toFixed(0)}`}
              subtitle={target?.to_name ? `to ${target.to_name}` : undefined}
              onClose={onClose}
            />

            <View style={s.modeRow}>
              <TouchableOpacity style={[s.modeChip, !partialOn && s.modeOn]} onPress={() => setPartialOn(false)}>
                <Text style={[s.modeT, !partialOn && s.modeTOn]}>Pay full</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modeChip, partialOn && s.modeOn]} onPress={() => setPartialOn(true)}>
                <Text style={[s.modeT, partialOn && s.modeTOn]}>Pay partial</Text>
              </TouchableOpacity>
            </View>

            {partialOn && (
              <View style={s.partialBox}>
                <View style={s.amtRow}>
                  <Text style={s.rupee}>₹</Text>
                  <TextInput
                    style={s.amtInput}
                    value={partialAmt}
                    onChangeText={setPartialAmt}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={C.text4}
                    autoFocus
                  />
                  <Text style={s.maxLabel}>{` / ₹${max.toFixed(0)}`}</Text>
                </View>
                {amt > max && <Text style={s.errT}>{`Cannot exceed ₹${max.toFixed(0)}`}</Text>}
                {amt > 0 && amt <= max && amt < max && (
                  <Text style={s.partialNote}>{`Remaining: ₹${(max - amt).toFixed(0)} will still be owed`}</Text>
                )}
                <View style={s.quickRow}>
                  {[25, 50, 75].map((pct) => (
                    <TouchableOpacity key={pct} style={s.quickBtn} onPress={() => setPartialAmt(String(Math.round(max * pct / 100)))}>
                      <Text style={s.quickT}>{`${pct}%`}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity style={s.quickBtn} onPress={() => setPartialAmt(String(Math.round(max)))}>
                    <Text style={s.quickT}>Full</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* 🪙 Coin redemption slider — spend earned coins to offset this payment */}
            {coinListPrice > 0 && (
              <CoinRedeemPanel
                context="split"
                amount={coinListPrice}
                listPrice={coinListPrice}
                compact
                onChange={setCoinRedeem}
              />
            )}

            {coinRedeem.coinsToUse > 0 && (
              <View style={s.netBox}>
                <Text style={s.netLbl}>Cash outflow after coins</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={s.netStrike}>₹{Math.round(coinListPrice)}</Text>
                  <Text style={s.netVal}>₹{Math.round(effectiveDisplay)}</Text>
                </View>
              </View>
            )}

            <Text style={s.payS}>{!isOnline ? "Offline — payment unavailable" : 'Select payment method'}</Text>
            {onPayRazorpay && (
              <TouchableOpacity
                style={[s.rzpBtn, !isValid && { opacity: 0.4 }]}
                disabled={!isValid}
                onPress={() => { if (isValid) onPayRazorpay(finalAmt, coinRedeem.coinsToUse); }}
                activeOpacity={0.88}
              >
                <LinearGradient
                  colors={['#F56E1E', '#C14A06']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={s.rzpInner}
                >
                  <View style={s.rzpIcon}>
                    <Ionicons name="card" size={20} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rzpTitle}>Pay with Razorpay</Text>
                    <Text style={s.rzpSub}>Cards · Netbanking · UPI · Wallets</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#fff" />
                </LinearGradient>
              </TouchableOpacity>
            )}
            {UPI_APPS.map((app) => (
              <TouchableOpacity
                key={app.id}
                style={[s.upiRow, !isValid && { opacity: 0.4 }]}
                disabled={!isValid}
                onPress={() => triggerPay('upi')}
              >
                <View style={[s.upiIcon, { backgroundColor: app.color + '15' }]}>
                  <Ionicons name={app.icon as any} size={22} color={app.color} />
                </View>
                <Text style={s.upiName}>{app.name}</Text>
                <Ionicons name="chevron-forward" size={16} color={C.text4} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[s.cashBtn, !isValid && { opacity: 0.4 }]}
              disabled={!isValid}
              onPress={() => triggerPay('cash')}
            >
              <Ionicons name="cash" size={18} color={C.accent} />
              <Text style={s.cashBtnT}>Paid in Cash</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose}><Text style={s.cancelT}>Cancel</Text></TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  mBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: C.sheetBg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24, maxHeight: '92%' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.text4, alignSelf: 'center', marginVertical: 10 },
  sheetT: { fontSize: 20, fontWeight: '700', color: C.text1 },
  modeRow: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 8 },
  modeChip: { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  modeOn: { backgroundColor: C.accentDim, borderColor: C.accent },
  modeT: { fontSize: 14, fontWeight: '600', color: C.text3 },
  modeTOn: { color: C.accent, fontWeight: '700' },
  partialBox: { backgroundColor: c.bg.primary, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  amtRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  rupee: { fontSize: 28, fontWeight: '300', color: C.text3, marginRight: 4 },
  amtInput: { fontSize: 32, fontWeight: '800', color: C.text1, minWidth: 60, textAlign: 'center' },
  maxLabel: { fontSize: 14, color: C.text3, marginLeft: 6 },
  errT: { fontSize: 12, color: C.red, textAlign: 'center', marginTop: 4 },
  partialNote: { fontSize: 12, color: C.accent, textAlign: 'center', marginTop: 4, fontWeight: '600' },
  quickRow: { flexDirection: 'row', gap: 8, marginTop: 10, justifyContent: 'center' },
  quickBtn: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 14, backgroundColor: C.accentDim },
  quickT: { fontSize: 13, fontWeight: '700', color: C.accent },
  netBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#ECFDF5', borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#A7F3D0' },
  netLbl: { fontSize: 11, fontWeight: '800', color: '#065F46', textTransform: 'uppercase', letterSpacing: 0.4 },
  netStrike: { fontSize: 13, color: c.gray[400], fontWeight: '600', textDecorationLine: 'line-through' },
  netVal: { fontSize: 18, fontWeight: '800', color: '#065F46' },
  payS: { fontSize: 14, color: C.text3, marginBottom: 8, marginTop: 4 },
  upiRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  upiIcon: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  upiName: { flex: 1, fontSize: 16, fontWeight: '600', color: C.text1 },
  cashBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, marginTop: 12, borderRadius: 14, backgroundColor: C.accentDim },
  cashBtnT: { fontSize: 15, fontWeight: '600', color: C.accent },
  rzpBtn: { borderRadius: 14, overflow: 'hidden', marginBottom: 10, shadowColor: c.accent.brandDark, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.22, shadowRadius: 10, elevation: 5 },
  rzpInner: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14 },
  rzpIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  rzpTitle: { color: c.bg.elevated, fontSize: 15, fontWeight: '900', letterSpacing: 0.2 },
  rzpSub: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '700', marginTop: 1 },
  cancelT: { textAlign: 'center', fontSize: 15, color: C.text3, paddingVertical: 14 },
}));
