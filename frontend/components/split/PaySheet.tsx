import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, Platform, KeyboardAvoidingView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../../utils/theme';
import { C, UPI_APPS } from './theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  target: any;
  onPayUPI: (partialAmount?: number) => void;
  onPayCash: (partialAmount?: number) => void;
  onPayPartial: (amount: number) => void;
};

export default function PaySheet({ visible, onClose, target, onPayUPI, onPayCash, onPayPartial }: Props) {
  const [partialOn, setPartialOn] = useState(false);
  const [partialAmt, setPartialAmt] = useState('');

  useEffect(() => {
    if (visible) { setPartialOn(false); setPartialAmt(''); }
  }, [visible]);

  const max = target?.amount || 0;
  const amt = parseFloat(partialAmt) || 0;
  const isValid = partialOn ? amt > 0 && amt <= max : true;
  const finalAmt = partialOn ? amt : max;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.mBg}>
        <View style={s.sheet}>
          <View style={s.handle} />
          <Text style={s.sheetT}>{`Pay ₹${(target?.amount || 0).toFixed(0)} to ${target?.to_name || ''}`}</Text>

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

          <Text style={s.payS}>Select payment method</Text>
          {UPI_APPS.map((app) => (
            <TouchableOpacity
              key={app.id}
              style={[s.upiRow, !isValid && { opacity: 0.4 }]}
              disabled={!isValid}
              onPress={() => {
                if (partialOn) onPayPartial(finalAmt);
                else onPayUPI();
              }}
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
            onPress={() => {
              if (partialOn) onPayPartial(finalAmt);
              else onPayCash();
            }}
          >
            <Ionicons name="cash" size={18} color={C.accent} />
            <Text style={s.cashBtnT}>Paid in Cash</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose}><Text style={s.cancelT}>Cancel</Text></TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  mBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: C.sheetBg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.text4, alignSelf: 'center', marginBottom: 16 },
  sheetT: { fontSize: 20, fontWeight: '700', color: C.text1 },
  modeRow: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 8 },
  modeChip: { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  modeOn: { backgroundColor: C.accentDim, borderColor: C.accent },
  modeT: { fontSize: 14, fontWeight: '600', color: C.text3 },
  modeTOn: { color: C.accent, fontWeight: '700' },
  partialBox: { backgroundColor: COLORS.bg.primary, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  amtRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  rupee: { fontSize: 28, fontWeight: '300', color: C.text3, marginRight: 4 },
  amtInput: { fontSize: 32, fontWeight: '800', color: C.text1, minWidth: 60, textAlign: 'center' },
  maxLabel: { fontSize: 14, color: C.text3, marginLeft: 6 },
  errT: { fontSize: 12, color: C.red, textAlign: 'center', marginTop: 4 },
  partialNote: { fontSize: 12, color: C.accent, textAlign: 'center', marginTop: 4, fontWeight: '600' },
  quickRow: { flexDirection: 'row', gap: 8, marginTop: 10, justifyContent: 'center' },
  quickBtn: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 14, backgroundColor: C.accentDim },
  quickT: { fontSize: 13, fontWeight: '700', color: C.accent },
  payS: { fontSize: 14, color: C.text3, marginBottom: 8, marginTop: 4 },
  upiRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  upiIcon: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  upiName: { flex: 1, fontSize: 16, fontWeight: '600', color: C.text1 },
  cashBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, marginTop: 12, borderRadius: 14, backgroundColor: C.accentDim },
  cashBtnT: { fontSize: 15, fontWeight: '600', color: C.accent },
  cancelT: { textAlign: 'center', fontSize: 15, color: C.text3, paddingVertical: 14 },
});
