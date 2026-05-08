/**
 * MascotShareCard — viral moment surface.
 *
 * Renders a screenshot-worthy card with mascot + headline + stat.
 * Caller controls visibility + share trigger; component is just the
 * visual primitive. The hook `useShareMascotMoment` (sibling) handles
 * actual share intent via `expo-sharing` when available, else copies
 * to clipboard as text.
 *
 * Design: maximum WhatsApp-shareable density. Brutalist frame, mascot
 * front-and-centre, big quote, MintU watermark.
 */
import React from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import MascotPresence from './MascotPresence';
import { MascotMood } from '../../hooks/useMascotMood';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Headline shown in big text. */
  title: string;
  /** Optional sub-quote / context. */
  quote?: string;
  /** Optional stat chip (e.g., "7-day streak" or "₹12,300 saved"). */
  statLabel?: string;
  mood?: MascotMood;
};

function tryShare(text: string): Promise<void> {
  // Web/native fallback: copy to clipboard. Native expo-sharing only
  // accepts file URIs, not plain text — we keep this simple and
  // copy-friendly so users can paste into WhatsApp/IG.
  return Clipboard.setStringAsync(text).then(() => {});
}

export default function MascotShareCard({ visible, onClose, title, quote, statLabel, mood = 'celebrating' }: Props) {
  const [copied, setCopied] = React.useState(false);

  const composedText = `${title}${quote ? `\n\n“${quote}”` : ''}${statLabel ? `\n\n— ${statLabel} via MintU` : '\n\n— via MintU'}`;

  const handleShare = async () => {
    try {
      await tryShare(composedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* best-effort */
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.frame}>
            <MascotPresence size={120} mood={mood} showWhenGated />
            <Text style={styles.title} numberOfLines={3}>{title}</Text>
            {quote ? <Text style={styles.quote} numberOfLines={4}>{`“${quote}”`}</Text> : null}
            {statLabel ? (
              <View style={styles.statChip}>
                <Text style={styles.statText}>{statLabel}</Text>
              </View>
            ) : null}
            <Text style={styles.watermark}>MintU · Smart money, simple life</Text>
          </View>

          <View style={styles.actions}>
            <Pressable onPress={onClose} style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && styles.btnPressed]}>
              <Text style={styles.btnGhostText}>CLOSE</Text>
            </Pressable>
            <Pressable onPress={handleShare} style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.btnPressed]}>
              <Text style={styles.btnPrimaryText}>{copied ? 'COPIED ✓' : (Platform.OS === 'web' ? 'COPY MOMENT' : 'COPY & SHARE')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: '#0B0B0B',
    shadowColor: '#0B0B0B',
    shadowOffset: { width: 6, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  frame: {
    paddingHorizontal: 24,
    paddingVertical: 28,
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFEDD5',
    borderBottomWidth: 2,
    borderBottomColor: '#0B0B0B',
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0B0B0B',
    textAlign: 'center',
    letterSpacing: -0.5,
    lineHeight: 26,
    marginTop: 4,
  },
  quote: {
    fontSize: 14,
    fontStyle: 'italic',
    fontWeight: '600',
    color: '#525252',
    textAlign: 'center',
    lineHeight: 20,
  },
  statChip: {
    backgroundColor: '#0B0B0B',
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 4,
  },
  statText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  watermark: { fontSize: 10, fontWeight: '700', color: '#9A3412', letterSpacing: 1, marginTop: 8 },
  actions: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
  },
  btn: { flex: 1, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  btnGhost: { borderRightWidth: 2, borderRightColor: '#0B0B0B' },
  btnPrimary: { backgroundColor: '#FF6B1A' },
  btnPressed: { opacity: 0.8 },
  btnGhostText: { fontSize: 12, fontWeight: '900', letterSpacing: 1, color: '#0B0B0B' },
  btnPrimaryText: { fontSize: 12, fontWeight: '900', letterSpacing: 1, color: '#FFFFFF' },
});
