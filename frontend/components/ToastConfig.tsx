import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING } from '../utils/theme';

const ToastBase = ({ icon, iconColor, bgColor, borderColor, text1, text2 }: any) => (
  <View style={[styles.toast, { backgroundColor: bgColor, borderColor }]}>
    <Ionicons name={icon} size={20} color={iconColor} />
    <View style={styles.textWrap}>
      {text1 ? <Text style={styles.title} numberOfLines={1}>{text1}</Text> : null}
      {text2 ? <Text style={styles.message} numberOfLines={2}>{text2}</Text> : null}
    </View>
  </View>
);

export const toastConfig = {
  success: (props: any) => (
    <ToastBase
      icon="checkmark-circle"
      iconColor="#2E7D32"
      bgColor="#F0FDF4"
      borderColor="#BBF7D0"
      text1={props.text1}
      text2={props.text2}
    />
  ),
  error: (props: any) => (
    <ToastBase
      icon="close-circle"
      iconColor="#D32F2F"
      bgColor="#FEF2F2"
      borderColor="#FECACA"
      text1={props.text1}
      text2={props.text2}
    />
  ),
  info: (props: any) => (
    <ToastBase
      icon="information-circle"
      iconColor={COLORS.accent.primary}
      bgColor="#FFF7ED"
      borderColor="#FFEDD5"
      text1={props.text1}
      text2={props.text2}
    />
  ),
};

const styles = StyleSheet.create({
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
  },
  textWrap: { flex: 1 },
  title: { fontSize: 14, fontWeight: '700', color: COLORS.text.primary },
  message: { fontSize: 13, color: COLORS.text.secondary, marginTop: 2, lineHeight: 18 },
});
