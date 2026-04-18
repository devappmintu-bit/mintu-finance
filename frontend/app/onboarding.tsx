import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Dimensions, Image } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useLangStore } from '../store/langStore';
import { t } from '../utils/i18n';
import { COLORS, RADIUS, SPACING, ONBOARDING_IMAGES, shadowStyle } from '../utils/theme';

const { width } = Dimensions.get('window');

export default function OnboardingScreen() {
  const { lang } = useLangStore();
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const SLIDES = [
    { id: '1', image: ONBOARDING_IMAGES.save, title: t('onboard_1_title', lang), subtitle: t('onboard_1_desc', lang), accent: COLORS.accent.primary },
    { id: '2', image: ONBOARDING_IMAGES.grow, title: t('onboard_2_title', lang), subtitle: t('onboard_2_desc', lang), accent: COLORS.accent.secondary },
    { id: '3', image: ONBOARDING_IMAGES.welcome, title: t('onboard_3_title', lang), subtitle: t('onboard_3_desc', lang), accent: COLORS.accent.moneyIn },
  ];

  const handleNext = async () => {
    if (activeIndex < SLIDES.length - 1) {
      const nextIndex = activeIndex + 1;
      flatListRef.current?.scrollToOffset({ offset: nextIndex * width, animated: true });
      setActiveIndex(nextIndex);
    } else {
      await AsyncStorage.setItem('onboarding_seen', 'true');
      router.replace('/auth');
    }
  };

  const handleSkip = async () => {
    await AsyncStorage.setItem('onboarding_seen', 'true');
    router.replace('/auth');
  };

  const renderSlide = ({ item }: { item: typeof SLIDES[0] }) => (
    <View style={[styles.slide, { width }]}>
      <View style={styles.imageWrap}>
        <Image source={{ uri: item.image }} style={styles.slideImage} resizeMode="contain" />
      </View>
      <Text style={styles.title}>{item.title}</Text>
      <Text style={styles.subtitle}>{item.subtitle}</Text>
    </View>
  );

  return (
    <View testID="onboarding-screen" style={styles.container}>
      <TouchableOpacity testID="onboarding-skip-btn" style={styles.skipButton} onPress={handleSkip}>
        <Text style={styles.skipText}>{t('skip', lang)}</Text>
      </TouchableOpacity>

      <FlatList
        ref={flatListRef}
        data={SLIDES}
        renderItem={renderSlide}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / width);
          setActiveIndex(index);
        }}
      />

      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === activeIndex && styles.dotActive]} />
          ))}
        </View>
        <TouchableOpacity testID="onboarding-next-btn" style={styles.nextButton} onPress={handleNext}>
          <Text style={styles.nextText}>
            {activeIndex === SLIDES.length - 1 ? t('get_started', lang) : t('next', lang)}
          </Text>
          <Ionicons name="arrow-forward" size={20} color={COLORS.text.inverse} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg.primary },
  skipButton: { position: 'absolute', top: 60, right: 24, zIndex: 10, paddingHorizontal: 16, paddingVertical: 8 },
  skipText: { color: COLORS.text.muted, fontSize: 15, fontWeight: '500' },
  slide: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  imageWrap: { width: 240, height: 240, borderRadius: 120, backgroundColor: COLORS.accent.secondary + '15', justifyContent: 'center', alignItems: 'center', marginBottom: 40 },
  slideImage: { width: 200, height: 200, borderRadius: 100 },
  title: { fontSize: 30, fontWeight: '800', color: COLORS.text.primary, textAlign: 'center', marginBottom: 16, letterSpacing: -0.5 },
  subtitle: { fontSize: 16, color: COLORS.text.secondary, textAlign: 'center', lineHeight: 26, paddingHorizontal: 8 },
  footer: { paddingHorizontal: 24, paddingBottom: 60, gap: 28 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.border.subtle },
  dotActive: { width: 28, backgroundColor: COLORS.accent.primary },
  nextButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.accent.primary, paddingVertical: 18, borderRadius: RADIUS.full, gap: 8,
    ...shadowStyle(COLORS.accent.primary, 6, 16, 0.3, 8),
  },
  nextText: { fontSize: 17, fontWeight: '700', color: COLORS.text.inverse },
});
