import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, shadowStyle, UPI_APPS } from '../../utils/theme';

interface Props {
  upiId: string;
}

export default function PaymentMethods({ upiId }: Props) {
  const [payExpanded, setPayExpanded] = useState(false);
  const [upiExpanded, setUpiExpanded] = useState(false);

  return (
    <View style={s.card}>
      <TouchableOpacity style={s.headerRow} onPress={() => setPayExpanded(!payExpanded)} activeOpacity={0.7}>
        <View style={s.iconBox}><Ionicons name="card" size={20} color="#E65100" /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Payment Options</Text>
          <Text style={s.sub}>
            {upiId ? 'UPI linked • Cards, Wallets ready' : 'Tap to set up UPI & cards'}
          </Text>
        </View>
        <Ionicons name={payExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.text.muted} />
      </TouchableOpacity>

      {payExpanded && (
        <>
          {upiId ? (
            <View style={s.recSection}>
              <Text style={s.recLabel}>Recommended</Text>
              {UPI_APPS.slice(0, 3).map((app, i) => (
                <TouchableOpacity key={app.id} style={s.recRow}>
                  <View style={[s.recIcon, { backgroundColor: app.color + '15' }]}>
                    <Ionicons name={app.icon as any} size={18} color={app.color} />
                  </View>
                  <Text style={s.recName}>UPI - {app.name}</Text>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.text.muted} />
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          <Text style={s.allLabel}>All Payment Options</Text>

          <TouchableOpacity style={s.optRow} onPress={() => setUpiExpanded(!upiExpanded)}>
            <Ionicons name="flash" size={18} color="#E65100" />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={s.optName}>UPI</Text>
                {UPI_APPS.map((a) => (
                  <View key={a.id} style={[s.miniIcon, { backgroundColor: a.color + '15' }]}>
                    <Ionicons name={a.icon as any} size={10} color={a.color} />
                  </View>
                ))}
              </View>
              <Text style={s.optOffer}>4 Options</Text>
            </View>
            <Ionicons name={upiExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.text.muted} />
          </TouchableOpacity>
          {upiExpanded && (
            <View style={s.subGrid}>
              {UPI_APPS.map((app) => (
                <TouchableOpacity key={app.id} style={s.subCard}>
                  <Ionicons name={app.icon as any} size={20} color={app.color} />
                  <Text style={s.subName}>{app.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <TouchableOpacity style={s.optRow}>
            <Ionicons name="card" size={18} color="#E65100" />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={s.optName}>Cards</Text>
                <Text style={{ fontSize: 9, color: COLORS.text.muted }}>VISA  MC  RuPay</Text>
              </View>
              <Text style={s.optOffer}>Tokenized · Secure</Text>
            </View>
            <Ionicons name="chevron-down" size={18} color={COLORS.text.muted} />
          </TouchableOpacity>

          <TouchableOpacity style={s.optRow}>
            <Ionicons name="business" size={18} color="#059669" />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={s.optName}>Netbanking</Text>
              <Text style={s.optOffer}>All major banks supported</Text>
            </View>
            <Ionicons name="chevron-down" size={18} color={COLORS.text.muted} />
          </TouchableOpacity>

          <TouchableOpacity style={[s.optRow, { borderBottomWidth: 0 }]}>
            <Ionicons name="wallet" size={18} color="#E65100" />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={s.optName}>Wallet</Text>
              <Text style={s.optOffer}>Paytm · Mobikwik · Amazon Pay</Text>
            </View>
            <Ionicons name="chevron-down" size={18} color={COLORS.text.muted} />
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 20, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(238,221,204,0.6)', ...shadowStyle('#2E1F1A', 2, 10, 0.04, 2) },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  iconBox: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#E6510015', justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: COLORS.text.primary },
  sub: { fontSize: 12, color: COLORS.text.muted, marginTop: 2 },
  recSection: { marginTop: 14 },
  recLabel: { fontSize: 12, fontWeight: '600', color: COLORS.text.muted, marginBottom: 8 },
  recRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border.subtle },
  recIcon: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  recName: { flex: 1, fontSize: 14, fontWeight: '500', color: COLORS.text.primary },
  allLabel: { fontSize: 12, fontWeight: '600', color: COLORS.text.muted, marginBottom: 8, marginTop: 12 },
  optRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border.subtle },
  optName: { fontSize: 14, fontWeight: '600', color: COLORS.text.primary },
  optOffer: { fontSize: 11, fontWeight: '600', color: COLORS.accent.moneyIn, marginTop: 2 },
  miniIcon: { width: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  subGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 10 },
  subCard: { width: '47%', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.bg.primary, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: COLORS.border.subtle, flexGrow: 1 },
  subName: { fontSize: 13, fontWeight: '500', color: COLORS.text.primary },
});
