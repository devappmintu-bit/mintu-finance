import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from './theme';
import { makeStyles } from '../../utils/makeStyles';
import { useAppColors } from '../../utils/theme';

type Reminder = { id: string; sender_name: string; amount: number; note?: string };

type Props = { received: Reminder[]; onDismiss: (id: string) => void };

export default function RemindersBanner({ received, onDismiss }: Props) {
  const s = useStyles();
  const c = useAppColors();
  if (!received || received.length === 0) return null;
  return (
    <View style={s.banner}>
      <View style={s.head}>
        <Ionicons name="notifications" size={16} color={c.state.warning} />
        <Text style={s.title}>
          {received.length === 1 ? '1 Payment Reminder' : `${received.length} Payment Reminders`}
        </Text>
      </View>
      {received.slice(0, 2).map((rem) => (
        <View key={rem.id} style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={s.text}>
              <Text style={{ fontWeight: '700' }}>{rem.sender_name}</Text>
              {' reminded you about '}
              <Text style={{ fontWeight: '700', color: C.red }}>{`₹${rem.amount.toFixed(0)}`}</Text>
            </Text>
            {rem.note ? <Text style={s.note}>{`"${rem.note}"`}</Text> : null}
          </View>
          <TouchableOpacity onPress={() => onDismiss(rem.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={18} color={c.state.warning} />
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  banner: { backgroundColor: '#FEF3C7', borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#FDE68A' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  title: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, color: '#92400E' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  text: { fontSize: 13, color: '#78350F', lineHeight: 18 },
  note: { fontSize: 12, color: '#92400E', fontStyle: 'italic', marginTop: 2 },
}));
