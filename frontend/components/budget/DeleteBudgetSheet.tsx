/**
 * DeleteBudgetSheet — full-screen confirmation sheet before a budget is deleted.
 * Shown when the user completes a swipe-delete or taps Delete in the 3-dot menu.
 */
import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CATEGORIES } from '../../utils/theme';

type Props = {
  visible: boolean;
  category?: string;
  amount?: number;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function DeleteBudgetSheet({ visible, category, amount, onCancel, onConfirm }: Props) {
  const cat = (CATEGORIES as any)[category || 'Other'] || (CATEGORIES as any).Other;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={s.backdrop} onPress={onCancel} />
      <View style={s.wrap}>
        <View style={s.sheet}>
          <View style={s.handle} />
          <View style={[s.icon, { backgroundColor: '#FEE2E2' }]}>
            <Ionicons name="trash" size={28} color="#B91C1C" />
          </View>
          <Text style={s.title}>Delete this budget?</Text>
          <Text style={s.desc}>
            You&apos;re about to remove the{' '}
            <Text style={{ fontWeight: '800', color: cat.color }}>{category}</Text> budget
            {typeof amount === 'number' ? ` of ₹${Math.round(amount).toLocaleString('en-IN')}` : ''}.
            This action can be undone from the snackbar.
          </Text>
          <View style={s.row}>
            <TouchableOpacity style={[s.btn, s.btnGhost]} onPress={onCancel} activeOpacity={0.85}>
              <Text style={s.btnGhostT}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btn, s.btnDanger]} onPress={onConfirm} activeOpacity={0.85} testID="confirm-delete-budget">
              <Ionicons name="trash-outline" size={16} color="#fff" />
              <Text style={s.btnDangerT}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.55)' },
  wrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 22, paddingTop: 10, paddingBottom: 28, alignItems: 'center' },
  handle: { width: 44, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', marginBottom: 14 },
  icon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title: { fontSize: 19, fontWeight: '800', color: '#111', marginBottom: 8 },
  desc: { fontSize: 13.5, color: '#6B7280', textAlign: 'center', lineHeight: 19, paddingHorizontal: 8, marginBottom: 20 },
  row: { flexDirection: 'row', gap: 10, alignSelf: 'stretch' },
  btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: 14 },
  btnGhost: { backgroundColor: '#F3F4F6' },
  btnGhostT: { fontSize: 14, fontWeight: '700', color: '#374151' },
  btnDanger: { backgroundColor: '#EF4444' },
  btnDangerT: { fontSize: 14, fontWeight: '800', color: '#fff' },
});
