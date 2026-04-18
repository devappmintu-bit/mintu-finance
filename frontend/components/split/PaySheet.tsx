import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, UPI_APPS } from './theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  target: any;
  onPayUPI: () => void;
  onPayCash: () => void;
};

export default function PaySheet({ visible, onClose, target, onPayUPI, onPayCash }: Props) {
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={s.mBg}>
        <View style={s.sheet}>
          <View style={s.handle} />
          <Text style={s.sheetT}>{`Pay ₹${target?.amount?.toFixed(0) || 0} to ${target?.to_name || ''}`}</Text>
          <Text style={s.payS}>Select payment method</Text>
          {UPI_APPS.map((app) => (
            <TouchableOpacity key={app.id} style={s.upiRow} onPress={onPayUPI}>
              <View style={[s.upiIcon, { backgroundColor: app.color + '15' }]}>
                <Ionicons name={app.icon as any} size={22} color={app.color} />
              </View>
              <Text style={s.upiName}>{app.name}</Text>
              <Ionicons name="chevron-forward" size={16} color={C.text4} />
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={s.cashBtn} onPress={onPayCash}>
            <Ionicons name="cash" size={18} color={C.accent} />
            <Text style={s.cashBtnT}>Paid in Cash</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose}><Text style={s.cancelT}>Cancel</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  mBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: C.sheetBg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.text4, alignSelf: 'center', marginBottom: 16 },
  sheetT: { fontSize: 20, fontWeight: '700', color: C.text1 },
  payS: { fontSize: 14, color: C.text3, marginBottom: 16, marginTop: 4 },
  upiRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  upiIcon: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  upiName: { flex: 1, fontSize: 16, fontWeight: '600', color: C.text1 },
  cashBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, marginTop: 12, borderRadius: 14, backgroundColor: C.accentDim },
  cashBtnT: { fontSize: 15, fontWeight: '600', color: C.accent },
  cancelT: { textAlign: 'center', fontSize: 15, color: C.text3, paddingVertical: 14 },
});
