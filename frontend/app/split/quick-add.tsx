/**
 * Split · Quick Add (Draft) — Round 51j.
 *
 * Lean capture surface for the "I just paid for X, I'll figure out
 * who owes me later" use case. NO group required.
 *
 * Why a separate screen?
 *   The full /split/add-expense screen requires a group, members,
 *   participants, payer selection, splits — totally wrong for a
 *   2-second receipt capture. This screen does ONE thing well:
 *   amount + description → saved as a draft → user moves on.
 *
 * Drafts later show in /split/drafts where users one-tap-attach
 * them to a group.
 */
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { createDraftExpense } from '../../services/split';
import { useAppColors, COLORS, SPACING } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';
import { fmtINR } from '../../utils/format';

const SUGGESTIONS = [
  { label: 'Food', emoji: '🍔' },
  { label: 'Travel', emoji: '🚕' },
  { label: 'Rent', emoji: '🏠' },
  { label: 'Groceries', emoji: '🛒' },
  { label: 'Movie', emoji: '🎬' },
  { label: 'Drinks', emoji: '🍻' },
];

export default function QuickAddDraft() {
  const c = useAppColors();
  const s = useStyles();
  const [amount, setAmount] = useState('');
  const [desc, setDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const amountNum = Number(amount) || 0;
  const canSave = amountNum > 0 && desc.trim().length > 0 && !submitting;

  const onSave = async () => {
    if (!canSave) return;
    setSubmitting(true);
    try {
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await createDraftExpense({ amount: amountNum, description: desc.trim() });
      Toast.show({
        type: 'success',
        text1: 'Saved as draft ✓',
        text2: 'Attach it to a group anytime from Drafts.',
      });
      router.replace('/split/drafts' as any);
    } catch (e: any) {
      Toast.show({
        type: 'error',
        text1: 'Could not save draft',
        text2: e?.response?.data?.detail || 'Please try again',
      });
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn} accessibilityLabel="Close">
          <Ionicons name="close" size={22} color={c.text.primary} />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={s.title}>Quick add</Text>
          <Text style={s.subtitle}>Saved as draft — attach to a group later</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

          <View style={s.amountCard}>
            <Text style={s.rupee}>₹</Text>
            <TextInput
              value={amount}
              onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ''))}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={c.gray[300]}
              style={s.amountInput}
              autoFocus
              testID="qa-amount"
            />
          </View>

          <Text style={s.label}>DESCRIPTION</Text>
          <TextInput
            value={desc}
            onChangeText={setDesc}
            placeholder="What was this for?"
            placeholderTextColor={c.text.muted}
            style={s.descInput}
            testID="qa-desc"
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.suggRow} contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
            {SUGGESTIONS.map(sg => (
              <TouchableOpacity key={sg.label} style={s.suggChip} onPress={() => setDesc(sg.label)} activeOpacity={0.8}>
                <Text style={s.suggEmoji}>{sg.emoji}</Text>
                <Text style={s.suggTxt}>{sg.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={s.hintCard}>
            <Ionicons name="information-circle-outline" size={16} color={c.accent.tertiary} />
            <Text style={s.hintTxt}>
              No group? No problem. Save it now, attach to a group later in one tap.
            </Text>
          </View>

          <View style={{ height: 20 }} />
        </ScrollView>

        <View style={s.ctaWrap}>
          <TouchableOpacity
            disabled={!canSave}
            onPress={onSave}
            activeOpacity={0.88}
            style={[s.ctaBtn, !canSave && s.ctaDisabled]}
            testID="qa-submit"
          >
            <LinearGradient
              colors={canSave ? [COLORS.accent.brand, COLORS.accent.brandDark] : ['#D1D5DB', COLORS.text.muted]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={s.ctaGrad}
            >
              {submitting ? <ActivityIndicator color="#FFFFFF" /> : (
                <>
                  <Ionicons name="bookmark" size={16} color="#FFFFFF" />
                  <Text style={s.ctaTxt}>
                    {amountNum > 0 ? `Save draft · ${fmtINR(amountNum)}` : 'Enter amount'}
                  </Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.bg.primary },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: c.border.subtle,
  },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg.secondary },
  title: { fontSize: 16, fontWeight: '900', color: c.text.primary, letterSpacing: -0.2 },
  subtitle: { fontSize: 11, fontWeight: '700', color: c.text.muted, marginTop: 1 },
  scroll: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: 100, gap: 10 },

  amountCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 20, paddingHorizontal: 18,
    borderRadius: 20, backgroundColor: c.accent.brandSoft,
    borderWidth: 1, borderColor: c.accent.brand + '33',
  },
  rupee: { fontSize: 42, fontWeight: '900', color: c.accent.brandDark },
  amountInput: { flex: 1, fontSize: 44, fontWeight: '900', color: c.text.primary, letterSpacing: -1.5, padding: 0 },

  label: { fontSize: 10, fontWeight: '900', color: c.text.muted, letterSpacing: 1.2, marginTop: 6 },
  descInput: {
    fontSize: 15, fontWeight: '700', color: c.text.primary,
    backgroundColor: c.bg.secondary, borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 14,
    borderWidth: 1, borderColor: c.border.subtle,
  },
  suggRow: { },
  suggChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: c.bg.secondary, borderWidth: 1, borderColor: c.border.subtle },
  suggEmoji: { fontSize: 13 },
  suggTxt: { fontSize: 11.5, fontWeight: '800', color: c.text.secondary },

  hintCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: c.accent.tertiary + '12',
    borderRadius: 12, padding: 12, marginTop: 6,
  },
  hintTxt: { flex: 1, fontSize: 12.5, color: c.text.secondary, lineHeight: 17, fontWeight: '600' },

  ctaWrap: { padding: SPACING.lg, borderTopWidth: 1, borderTopColor: c.border.subtle, backgroundColor: c.bg.primary },
  ctaBtn: { borderRadius: 14, overflow: 'hidden' },
  ctaDisabled: { opacity: 0.65 },
  ctaGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 16 },
  ctaTxt: { fontSize: 15, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.2 },
}));
