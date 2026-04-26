// Instagram-story-style fullscreen news viewer with tap-to-next, swipe, and progress bars.
// Used from the NewsCarousel on the home screen — tap any card to open.
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, TouchableWithoutFeedback,
  Animated, Dimensions, ScrollView, Platform, Linking,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';

const { width: W, height: H } = Dimensions.get('window');
const STORY_DURATION_MS = 6000; // 6s per story

const categoryGradient = (cat: string): [string, string] => {
  switch (cat) {
    case 'alert':      return ['#DC2626', '#7F1D1D'];
    case 'market':     return ['#047857', '#064E3B'];
    case 'scheme':     return ['#B45309', '#78350F'];
    case 'tip':        return ['#B45309', '#92400E'];
    case 'banking':    return ['#7C2D12', '#431407'];
    case 'investment': return ['#065F46', '#064E3B'];
    default:           return [COLORS.accent.primary, '#78350F'];
  }
};

interface Props {
  visible: boolean;
  articles: any[];
  startIndex: number;
  onClose: () => void;
}

export default function NewsStoryViewer({ visible, articles, startIndex, onClose }: Props) {
  const s = useStyles();
  const [idx, setIdx] = useState(startIndex);
  const [paused, setPaused] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const anim = useRef<Animated.CompositeAnimation | null>(null);

  // Keep idx in sync when the viewer opens
  useEffect(() => { if (visible) setIdx(startIndex); }, [visible, startIndex]);

  // Run the progress bar animation, advance on completion
  useEffect(() => {
    if (!visible) return;
    progress.setValue(0);
    if (paused) { anim.current?.stop(); return; }
    anim.current = Animated.timing(progress, {
      toValue: 1,
      duration: STORY_DURATION_MS,
      useNativeDriver: false,
    });
    anim.current.start(({ finished }) => {
      if (finished) goNext();
    });
    return () => anim.current?.stop();
  }, [idx, visible, paused]);

  const goNext = () => {
    if (idx >= articles.length - 1) { onClose(); return; }
    setIdx(i => i + 1);
  };
  const goPrev = () => { if (idx > 0) setIdx(i => i - 1); };

  if (!visible || !articles?.length) return null;
  const cur = articles[idx] || {};
  const gradient = categoryGradient(cur.category);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose} statusBarTranslucent>
      <View style={s.bg}>
        {/* Progress bars */}
        <View style={s.progressRow}>
          {articles.map((_, i) => (
            <View key={i} style={s.progressTrack}>
              <Animated.View
                style={[
                  s.progressFill,
                  {
                    width: i < idx ? '100%' : i === idx
                      ? progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })
                      : '0%',
                  },
                ]}
              />
            </View>
          ))}
        </View>

        {/* Header */}
        <View style={s.header}>
          <View style={s.pill}><View style={s.liveDot} /><Text style={s.pillText}>LIVE</Text></View>
          <Text style={s.cat}>{String(cur.category || '').toUpperCase()}</Text>
          <TouchableOpacity onPress={onClose} style={s.closeBtn} hitSlop={10}>
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Tap zones for prev/next; center region scrolls */}
        <TouchableWithoutFeedback
          onPressIn={() => setPaused(true)}
          onPressOut={() => setPaused(false)}
        >
          <View style={s.content}>
            <LinearGradient colors={gradient} style={s.gradCard}>
              <Text style={s.emoji}>{cur.emoji || '📰'}</Text>
              <Text style={s.title}>{cur.title || ''}</Text>

              <ScrollView
                style={{ maxHeight: H * 0.45, marginTop: 18 }}
                contentContainerStyle={{ paddingBottom: 8 }}
                showsVerticalScrollIndicator={false}
              >
                <Text style={s.summary}>{cur.summary || ''}</Text>

                {/* Read full article CTA — opens the source URL in in-app browser */}
                {!!cur.source_url && (
                  <TouchableOpacity
                    style={s.readMoreBtn}
                    activeOpacity={0.8}
                    onPress={async () => {
                      try {
                        if (Platform.OS === 'web') await Linking.openURL(cur.source_url);
                        else await WebBrowser.openBrowserAsync(cur.source_url, { dismissButtonStyle: 'close' });
                      } catch { try { await Linking.openURL(cur.source_url); } catch {} }
                    }}
                  >
                    <Ionicons name="open-outline" size={14} color="#fff" />
                    <Text style={s.readMoreTxt}>Read on {cur.source || 'source'}</Text>
                    <Ionicons name="arrow-forward" size={14} color="#fff" />
                  </TouchableOpacity>
                )}
              </ScrollView>

              <View style={s.footer}>
                <Ionicons name="newspaper" size={12} color="rgba(255,255,255,0.75)" />
                <TouchableOpacity
                  onPress={async () => {
                    if (!cur.source_url) return;
                    try {
                      if (Platform.OS === 'web') await Linking.openURL(cur.source_url);
                      else await WebBrowser.openBrowserAsync(cur.source_url);
                    } catch {}
                  }}
                  style={{ flex: 1 }}
                  activeOpacity={cur.source_url ? 0.6 : 1}
                >
                  <Text style={s.source}>{cur.source || 'MintU'}{cur.source_url ? ' · tap to open' : ''}</Text>
                </TouchableOpacity>
                <Text style={s.pagination}>{idx + 1} / {articles.length}</Text>
              </View>
            </LinearGradient>
          </View>
        </TouchableWithoutFeedback>

        {/* Left tap zone — prev */}
        <TouchableWithoutFeedback onPress={goPrev}>
          <View style={[s.tapZone, { left: 0, width: W * 0.3 }]} />
        </TouchableWithoutFeedback>
        {/* Right tap zone — next */}
        <TouchableWithoutFeedback onPress={goNext}>
          <View style={[s.tapZone, { right: 0, width: W * 0.3 }]} />
        </TouchableWithoutFeedback>

        {/* Hint */}
        <Text style={s.hint}>Tap left/right · Hold to pause</Text>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  bg: { flex: 1, backgroundColor: '#000' },
  progressRow: { flexDirection: 'row', gap: 4, paddingTop: Platform.OS === 'ios' ? 56 : 32, paddingHorizontal: 12, marginBottom: 12 },
  progressTrack: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: c.bg.elevated, borderRadius: 2 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, marginBottom: 18 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: 'rgba(220,38,38,0.9)', borderRadius: 999 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.bg.elevated },
  pillText: { color: c.bg.elevated, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  cat: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '800', letterSpacing: 1.5, flex: 1 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  content: { flex: 1, padding: 18 },
  gradCard: { flex: 1, borderRadius: 24, padding: 26, justifyContent: 'flex-start' },
  emoji: { fontSize: 72, marginBottom: 18 },
  title: { fontSize: 26, fontWeight: '900', color: c.bg.elevated, lineHeight: 34, letterSpacing: -0.3 },
  summary: { fontSize: 17, color: 'rgba(255,255,255,0.92)', lineHeight: 26 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 20, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.15)' },
  source: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.75)', letterSpacing: 1, flex: 1 },
  readMoreBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
    paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 24,
    alignSelf: 'flex-start',
    marginTop: 20,
  },
  readMoreTxt: { color: c.bg.elevated, fontSize: 13, fontWeight: '700', flex: 1 },
  pagination: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.55)' },
  tapZone: { position: 'absolute', top: 100, bottom: 60 },
  hint: { position: 'absolute', bottom: 24, alignSelf: 'center', color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: '600' },
}));
