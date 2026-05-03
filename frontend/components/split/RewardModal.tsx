import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { C } from './theme';
import { makeStyles } from '../../utils/makeStyles';

type Props = { visible: boolean; reward: any; onClose: () => void };

export default function RewardModal({ visible, reward, onClose }: Props) {
  const s = useStyles();
  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={s.bg}>
        <View style={s.card}>
          <Text style={s.emoji}>🎉</Text>
          <Text style={s.title}>Settled!</Text>
          <Text style={s.coins}>{`+${reward?.coins_earned || 0} 🪙`}</Text>
          <Text style={s.label}>{reward?.label}</Text>
          {(reward?.cashback_available || 0) > 0 && (
            <View style={s.cashback}>
              <Text style={s.cashbackT}>{`💰 ₹${reward.cashback_available.toFixed(0)} cashback`}</Text>
            </View>
          )}
          <TouchableOpacity onPress={onClose}>
            <View style={[s.btn, { backgroundColor: '#0A0A0A' }]}>
              <Text style={s.btnT}>Awesome!</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  bg: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  card: { backgroundColor: C.sheetBg, borderRadius: 0, padding: 32, width: '85%', alignItems: 'center', borderWidth: 2, borderColor: 'rgba(230,81,0,0.2)' },
  emoji: { fontSize: 48, marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '800', color: C.text1, marginBottom: 12 },
  coins: { fontSize: 36, fontWeight: '900', color: c.state.warning },
  label: { fontSize: 14, fontWeight: '600', color: C.text3, marginTop: 4 },
  cashback: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 0, backgroundColor: C.accentDim },
  cashbackT: { fontSize: 15, fontWeight: '700', color: C.accent },
  btn: { borderRadius: 0, paddingVertical: 16, paddingHorizontal: 48, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  btnT: { fontSize: 16, fontWeight: '700', color: C.inv },
}));
