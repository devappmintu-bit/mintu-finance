// MockPaymentSheet — simulates a 3-second payment gateway flow.
// Designed to match Razorpay's UX (amount card, progress, success check).
// Swap with real Razorpay SDK once user provides API keys.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import MintULogo from './MintULogo';

interface Props {
  visible: boolean;
  planId: string;
  planLabel: string;
  amount: number;
  onClose: () => void;
  onSuccess: () => void;
}

type Phase = 'confirm' | 'processing' | 'success';

export default function MockPaymentSheet({ visible, planId, planLabel, amount, onClose, onSuccess }: Props) {
  const [phase, setPhase] = useState<Phase>('confirm');

  useEffect(() => { if (visible) setPhase('confirm'); }, [visible]);

  const startPayment = () => {
    setPhase('processing');
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    setTimeout(() => {
      setPhase('success');
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      setTimeout(() => { onSuccess(); }, 1200);
    }, 2600);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <View style={s.handle} />
          <View style={s.logoRow}>
            <MintULogo size={36} />
            <Text style={s.brand}>MintU Pay</Text>
            <View style={{ flex: 1 }} />
            {phase === 'confirm' && (
              <TouchableOpacity onPress={onClose} hitSlop={16}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            )}
          </View>

          {phase === 'confirm' && (
            <>
              <View style={s.amountCard}>
                <Text style={s.amountLbl}>Amount to pay</Text>
                <Text style={s.amount}>₹{amount.toLocaleString('en-IN')}</Text>
                <Text style={s.planRow}>{planLabel || planId.toUpperCase()}</Text>
              </View>

              <View style={s.methodsWrap}>
                <Text style={s.methodsTitle}>Payment Method</Text>
                <View style={s.methodRow}>
                  <View style={s.methodIcon}><Ionicons name="phone-portrait" size={18} color="#5F259F" /></View>
                  <Text style={s.methodLbl}>UPI (PhonePe · GPay · Paytm)</Text>
                  <Ionicons name="radio-button-on" size={20} color="#F56E1E" />
                </View>
                <View style={s.methodRow}>
                  <View style={s.methodIcon}><Ionicons name="card" size={18} color="#1E293B" /></View>
                  <Text style={s.methodLbl}>Credit / Debit Card</Text>
                  <Ionicons name="radio-button-off" size={20} color="#CBD5E1" />
                </View>
                <View style={s.methodRow}>
                  <View style={s.methodIcon}><Ionicons name="business" size={18} color="#0F766E" /></View>
                  <Text style={s.methodLbl}>Net Banking</Text>
                  <Ionicons name="radio-button-off" size={20} color="#CBD5E1" />
                </View>
              </View>

              <TouchableOpacity style={s.cta} onPress={startPayment} activeOpacity={0.9}>
                <LinearGradient colors={['#F56E1E', '#C14A06']} style={s.ctaGrad}>
                  <Ionicons name="lock-closed" size={16} color="#fff" />
                  <Text style={s.ctaTxt}>Pay ₹{amount.toLocaleString('en-IN')}</Text>
                </LinearGradient>
              </TouchableOpacity>
              <Text style={s.footNote}>
                This is a MOCK payment sheet. No real charge is made.{"\n"}
                Razorpay will be wired in when live keys are added.
              </Text>
            </>
          )}

          {phase === 'processing' && (
            <View style={s.stateWrap}>
              <ActivityIndicator size="large" color="#F56E1E" />
              <Text style={s.stateTitle}>Processing payment…</Text>
              <Text style={s.stateSub}>Do not close this screen</Text>
            </View>
          )}

          {phase === 'success' && (
            <View style={s.stateWrap}>
              <LinearGradient colors={['#10B981', '#047857']} style={s.checkCircle}>
                <Ionicons name="checkmark" size={42} color="#fff" />
              </LinearGradient>
              <Text style={s.stateTitle}>Payment Successful</Text>
              <Text style={s.stateSub}>Unlocking your premium perks…</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 20 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 14 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  brand: { fontSize: 14, fontWeight: '800', color: '#78350F', letterSpacing: 0.3 },
  amountCard: {
    backgroundColor: '#FFF4E8',
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
    marginBottom: 18,
    borderWidth: 1, borderColor: '#F56E1E30',
  },
  amountLbl: { fontSize: 12, color: '#9A5B1C', letterSpacing: 0.5, fontWeight: '700' },
  amount: { fontSize: 34, fontWeight: '800', color: '#78350F', marginTop: 4 },
  planRow: { fontSize: 12, color: '#9A5B1C', marginTop: 4 },
  methodsWrap: { marginBottom: 18 },
  methodsTitle: { fontSize: 12, color: '#64748B', fontWeight: '700', letterSpacing: 0.5, marginBottom: 8 },
  methodRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 14,
    backgroundColor: '#F9FAFB', borderRadius: 12, marginBottom: 8,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  methodIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  methodLbl: { flex: 1, fontSize: 13, color: '#1E293B', fontWeight: '600' },
  cta: { borderRadius: 999, overflow: 'hidden' },
  ctaGrad: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 16 },
  ctaTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
  footNote: { fontSize: 10, color: '#94A3B8', textAlign: 'center', marginTop: 14, lineHeight: 14 },
  stateWrap: { alignItems: 'center', paddingVertical: 40 },
  stateTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginTop: 18 },
  stateSub: { fontSize: 13, color: '#64748B', marginTop: 6 },
  checkCircle: { width: 78, height: 78, borderRadius: 39, alignItems: 'center', justifyContent: 'center' },
});
