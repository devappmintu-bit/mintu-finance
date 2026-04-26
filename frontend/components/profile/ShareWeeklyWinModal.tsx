/**
 * ShareWeeklyWinModal — preview, capture and share the WeeklyWinCard.
 *
 * Flow:
 *   1. User opens modal (from BeatLastWeek share button).
 *   2. Modal shows the WeeklyWinCard rendered full-size (unchanged for screenshot).
 *   3. User taps "Share" → we call captureRef() on the ViewShot ref,
 *      then shareImageSmart() delegates to expo-sharing (native) or
 *      navigator.share / download (web).
 *   4. Optional "Copy text" secondary action copies the viral caption only.
 *
 * Keeps the UI simple + single-purpose. Never blocks if the share fails.
 */
import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import WeeklyWinCard, { type WeeklyWinCardProps } from './WeeklyWinCard';
import { shareImageSmart, copyToClipboard } from '../../utils/share';
import { useAppColors } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';

interface Props {
  visible: boolean;
  onClose: () => void;
  cardProps: WeeklyWinCardProps;
  /** Caption used as fallback text + clipboard copy. */
  caption?: string;
}

const DEFAULT_CAPTION = 'Tracking every rupee with MintU — join me: https://mintu.app';

export default function ShareWeeklyWinModal({ visible, onClose, cardProps, caption }: Props) {
  const shotRef = useRef<ViewShot>(null);
  const [sharing, setSharing] = useState(false);
  const c = useAppColors();
  const s = useStyles();

  const haptic = () => { if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };

  const finalCaption = caption || defaultCaption(cardProps);

  const onShare = async () => {
    if (!shotRef.current) return;
    haptic();
    setSharing(true);
    try {
      const uri = await captureRef(shotRef, {
        format: 'png',
        quality: 1,
        result: Platform.OS === 'web' ? 'data-uri' : 'tmpfile',
      });
      await shareImageSmart({
        uri,
        fallbackText: finalCaption,
        filename: 'mintu-weekly-win.png',
      });
    } catch (e) {
      Toast.show({ type: 'error', text1: 'Could not capture card', text2: 'Please try again in a moment.' });
    } finally {
      setSharing(false);
    }
  };

  const onCopy = async () => {
    haptic();
    await copyToClipboard(finalCaption, 'Caption copied · paste it anywhere');
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'overFullScreen'}>
      <SafeAreaView style={s.bg} edges={['top']}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityLabel="Close">
            <Ionicons name="close" size={26} color={c.text.primary} />
          </TouchableOpacity>
          <Text style={s.hTitle}>Share your win</Text>
          <View style={{ width: 26 }} />
        </View>

        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <Text style={s.eyebrow}>PREVIEW</Text>
          <Text style={s.subtitle}>This is exactly how it'll look when you share 🎉</Text>

          {/* Captured card — ViewShot wraps exactly what becomes the image */}
          <View style={s.cardHost}>
            <ViewShot ref={shotRef} options={{ format: 'png', quality: 1 }} style={s.shotBox}>
              <WeeklyWinCard {...cardProps} />
            </ViewShot>
          </View>

          {/* Caption preview */}
          <View style={s.captionBox}>
            <Text style={s.capLabel}>Caption</Text>
            <Text style={s.capTxt}>{finalCaption}</Text>
          </View>

          {/* Actions */}
          <TouchableOpacity style={[s.primary, sharing && { opacity: 0.7 }]} onPress={onShare} disabled={sharing} activeOpacity={0.85}>
            {sharing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="share-social" size={18} color="#fff" />
                <Text style={s.primaryTxt}>Share image</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={s.secondary} onPress={onCopy} activeOpacity={0.8}>
            <Ionicons name="copy-outline" size={16} color={c.text.primary} />
            <Text style={s.secondaryTxt}>Copy caption</Text>
          </TouchableOpacity>

          <Text style={s.hint}>
            Tip: your share goes out as a high-res PNG. Perfect for WhatsApp,
            Instagram Stories, or anywhere your people hang out.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function defaultCaption(p: WeeklyWinCardProps): string {
  const base = `${p.heroValue} ${p.heroLabel.toLowerCase()} this week.`;
  return `${base} ${p.tagline}\n\nTracked on MintU · https://mintu.app`;
}

const useStyles = makeStyles((c) => ({
  bg: { flex: 1, backgroundColor: c.bg.primary },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border.subtle,
  },
  hTitle: { fontSize: 17, fontWeight: '800', color: c.text.primary, letterSpacing: -0.3 },

  scroll: { padding: 20, paddingBottom: 40 },
  eyebrow: { fontSize: 10.5, fontWeight: '900', color: c.text.muted, letterSpacing: 1.2 },
  subtitle: { fontSize: 14, fontWeight: '600', color: c.text.primary, marginTop: 4, marginBottom: 16 },

  cardHost: { alignItems: 'center', marginBottom: 18 },
  shotBox: { borderRadius: 28, overflow: 'hidden' },

  captionBox: {
    backgroundColor: c.bg.secondary, borderRadius: 14,
    padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border.subtle,
    marginBottom: 18,
  },
  capLabel: { fontSize: 10, fontWeight: '900', color: c.text.muted, letterSpacing: 1, marginBottom: 6 },
  capTxt: { fontSize: 13, fontWeight: '600', color: c.text.primary, lineHeight: 19 },

  primary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: c.accent.primary, paddingVertical: 15, borderRadius: 14,
    shadowColor: c.accent.primary, shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4,
  },
  primaryTxt: { fontSize: 15, fontWeight: '800', color: c.bg.elevated, letterSpacing: -0.2 },

  secondary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 10, paddingVertical: 13, borderRadius: 14,
    borderWidth: 1, borderColor: c.border.subtle,
  },
  secondaryTxt: { fontSize: 13.5, fontWeight: '700', color: c.text.primary },

  hint: { fontSize: 12, fontWeight: '500', color: c.text.muted, marginTop: 16, textAlign: 'center', lineHeight: 17 },
}));
