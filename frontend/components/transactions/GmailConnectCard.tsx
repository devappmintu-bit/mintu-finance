/**
 * GmailConnectCard — compact "Connect Gmail" CTA for the Transactions tab.
 *
 * Shows only when Gmail is NOT yet connected. Tapping navigates to /gmail.
 * Silently hides after connection to stay out of the way.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';
import { fetchGmailStatus } from '../../services/gmail';

export default function GmailConnectCard() {
  const s = useStyles();
  const [show, setShow] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetchGmailStatus()
      .then((s) => { if (mounted && !s.connected) setShow(true); })
      .catch(() => { /* silent */ });
    return () => { mounted = false; };
  }, []);

  if (!show) return null;

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={() => router.push('/gmail' as any)}
      style={s.wrap}
    >
      <LinearGradient
        colors={['#FFF7ED', '#FFEBD2']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={s.card}
      >
        <View style={s.icon}>
          <Ionicons name="mail" size={20} color={COLORS.accent.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Auto-import bank emails</Text>
          <Text style={s.sub}>Connect Gmail — MintU reads bank alerts only, never personal mail.</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={COLORS.accent.primary} />
      </LinearGradient>
    </TouchableOpacity>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { marginHorizontal: 16, marginTop: 10, marginBottom: 6 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 16,
    borderWidth: 1, borderColor: '#FED7AA',
  },
  icon: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 14, fontWeight: '800', color: c.text.primary },
  sub: { fontSize: 11.5, color: c.text.secondary, marginTop: 2, lineHeight: 15 },
}));
