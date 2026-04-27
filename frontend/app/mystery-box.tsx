/**
 * Mystery Box — full-screen dopamine ritual (Wave 3 / polish).
 *
 * Flow:
 *   1. User enters with a closed pulsing box, a "Tap to unwrap" hint.
 *   2. Tap → API spin() fires → box starts shaking + shimmering.
 *   3. After ~1.8s, box explodes (scale-out + opacity-out) and
 *      reward card bursts in from center with confetti.
 *   4. User can "Collect & Continue" to return, or "Open another"
 *      if free spins are left.
 *
 * Reuses the server-authoritative /rewards/spin endpoint — every
 * Mystery Box tap is a real spin (with the 2× event multiplier
 * already baked in on the server).
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Easing, Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import Confetti from '../components/Confetti';
import { spinWheel, fetchRewardsSummary } from '../services/rewards';
import { makeStyles } from '../utils/makeStyles';
import { COLORS, useAppColors } from '../utils/theme';
import { MysteryBoxSkeleton } from '../components/SkeletonLoader';

type Stage = 'idle' | 'opening' | 'revealed';

export default function MysteryBoxScreen() {
  const s = useStyles();
  const c = useAppColors();
  const [stage, setStage] = useState<Stage>('idle');
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [reward, setReward] = useState<any>(null);
  const [coins, setCoins] = useState(0);
  const [freeLeft, setFreeLeft] = useState(0);
  const [canSpin, setCanSpin] = useState(false);
  const [confettiTrigger, setConfettiTrigger] = useState(false);
  const [multApplied, setMultApplied] = useState<number | null>(null);

  // Animations
  const pulse = useRef(new Animated.Value(1)).current;       // idle breathing
  const shake = useRef(new Animated.Value(0)).current;       // opening wiggle
  const boxScale = useRef(new Animated.Value(1)).current;    // explode shrink
  const boxOpacity = useRef(new Animated.Value(1)).current;  // fade out
  const rewardScale = useRef(new Animated.Value(0)).current; // card burst
  const rewardOpacity = useRef(new Animated.Value(0)).current;
  const rayRotate = useRef(new Animated.Value(0)).current;   // rays behind reward

  // Load summary to decide if user can open a box
  useEffect(() => {
    (async () => {
      try {
        const d = await fetchRewardsSummary();
        setCoins(d.coins || 0);
        setFreeLeft(d.free_spins_left || 0);
        setCanSpin(!!(d.can_spin_with_free || d.can_spin_with_coins));
      } catch (e) {
        Toast.show({ type: 'error', text1: 'Could not load your coins' });
      } finally {
        setLoadingSummary(false);
      }
    })();
  }, []);

  // Idle breathing loop
  useEffect(() => {
    if (stage !== 'idle') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.06, duration: 1100, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
        Animated.timing(pulse, { toValue: 1,    duration: 1100, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [stage, pulse]);

  // Reveal → rotate rays
  useEffect(() => {
    if (stage !== 'revealed') return;
    const loop = Animated.loop(
      Animated.timing(rayRotate, { toValue: 1, duration: 8000, easing: Easing.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [stage, rayRotate]);

  const open = async () => {
    if (stage !== 'idle' || !canSpin) return;

    try { if (Platform.OS !== 'web') await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch {}

    setStage('opening');

    // Shake sequence
    const shakeSeq = Animated.sequence(
      [25, -20, 22, -18, 16, -14, 10, -8, 6, -4, 2, 0].map(v =>
        Animated.timing(shake, { toValue: v, duration: 60, useNativeDriver: true })
      )
    );
    shakeSeq.start();

    // Start spin in parallel with animation
    let result: any = null;
    try {
      result = await spinWheel();
    } catch (e: any) {
      setStage('idle');
      Toast.show({ type: 'error', text1: 'Spin failed', text2: e?.response?.data?.detail || 'Try again' });
      return;
    }

    // Allow shake to complete (~0.9s) then explode
    await new Promise(r => setTimeout(r, 900));

    Animated.parallel([
      Animated.timing(boxScale, { toValue: 1.35, duration: 220, easing: Easing.out(Easing.back(1.6)), useNativeDriver: true }),
      Animated.timing(boxOpacity, { toValue: 0, duration: 260, useNativeDriver: true }),
    ]).start(() => {
      // Reveal
      const resolved = result.resolved_prize || result.prize;
      setReward(resolved);
      setCoins(result.coins);
      setFreeLeft(result.free_spins_left);
      setMultApplied(resolved?.multiplier_applied || null);

      setStage('revealed');
      setConfettiTrigger(true);
      setTimeout(() => setConfettiTrigger(false), 2200);

      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

      Animated.parallel([
        Animated.timing(rewardScale, { toValue: 1, duration: 520, easing: Easing.out(Easing.back(1.35)), useNativeDriver: true }),
        Animated.timing(rewardOpacity, { toValue: 1, duration: 420, useNativeDriver: true }),
      ]).start();
    });
  };

  const openAnother = async () => {
    // Reset state to idle
    setReward(null);
    setMultApplied(null);
    boxScale.setValue(1);
    boxOpacity.setValue(1);
    rewardScale.setValue(0);
    rewardOpacity.setValue(0);
    shake.setValue(0);
    // Refresh canSpin
    try {
      const d = await fetchRewardsSummary();
      setCoins(d.coins || 0);
      setFreeLeft(d.free_spins_left || 0);
      setCanSpin(!!(d.can_spin_with_free || d.can_spin_with_coins));
    } catch {}
    setStage('idle');
  };

  if (loadingSummary) {
    return (
      <SafeAreaView style={s.container}>
        <MysteryBoxSkeleton />
      </SafeAreaView>
    );
  }

  const rayRotation = rayRotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <Confetti trigger={confettiTrigger} />
      <LinearGradient colors={['#4C1D95', '#7C3AED', '#8B5CF6']} style={StyleSheet.absoluteFillObject} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={14} style={s.iconBtn} testID="mb-back">
          <Ionicons name="close" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={{ alignItems: 'center', flex: 1 }}>
          <Text style={s.eyebrow}>✨ MYSTERY BOX</Text>
          <Text style={s.hdrTitle}>What will you get?</Text>
        </View>
        <View style={s.coinsPill}>
          <Text style={s.coinsTxt}>🪙 {coins}</Text>
        </View>
      </View>

      {/* Main stage */}
      <View style={s.stage}>
        {stage !== 'revealed' && (
          <Animated.View
            style={[
              s.boxWrap,
              {
                transform: [
                  { translateX: shake },
                  { scale: Animated.multiply(pulse, boxScale) },
                ],
                opacity: boxOpacity,
              },
            ]}
          >
            {/* Box body */}
            <LinearGradient colors={['#FCD34D', COLORS.accent.secondary]} style={s.boxBody} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <Text style={s.boxQ}>?</Text>
            </LinearGradient>
            {/* Box lid */}
            <LinearGradient colors={[COLORS.accent.secondary, '#B45309']} style={s.boxLid} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
            {/* Ribbon */}
            <View style={s.ribbonV} />
            <View style={s.ribbonH} />
            {/* Bow */}
            <View style={s.bow}>
              <Text style={{ fontSize: 22 }}>🎀</Text>
            </View>
          </Animated.View>
        )}

        {stage === 'revealed' && reward && (
          <Animated.View style={[s.rewardWrap, { transform: [{ scale: rewardScale }], opacity: rewardOpacity }]}>
            {/* Rotating rays */}
            <Animated.View style={[s.rays, { transform: [{ rotate: rayRotation }] }]}>
              {[0, 45, 90, 135].map((deg) => (
                <View
                  key={deg}
                  style={[
                    s.ray,
                    { transform: [{ rotate: `${deg}deg` }] },
                  ]}
                />
              ))}
            </Animated.View>
            {/* Reward card */}
            <View style={s.rewardCard}>
              <Text style={s.rewardEmoji}>{reward.emoji || '🎁'}</Text>
              <Text style={s.rewardTitle}>{reward.label}</Text>
              {multApplied && multApplied > 1 && (
                <View style={s.multPill}>
                  <Text style={s.multTxt}>⚡ {multApplied}× EVENT BONUS</Text>
                </View>
              )}
              <Text style={s.rewardSub}>
                {reward.kind === 'coins' && 'Added to your balance'}
                {reward.kind === 'cashback' && 'Credited as coins'}
                {reward.kind === 'voucher' && '30-day voucher in your wallet'}
                {reward.kind === 'free_spin' && 'Free spins added'}
                {reward.kind === 'none' && 'Better luck next time!'}
              </Text>
            </View>
          </Animated.View>
        )}
      </View>

      {/* Footer CTAs */}
      <View style={s.footer}>
        {stage === 'idle' && (
          <>
            <Text style={s.hintTxt}>
              {canSpin
                ? (freeLeft > 0 ? `✨ ${freeLeft} free box${freeLeft === 1 ? '' : 'es'} today` : '💎 Costs 10 coins')
                : '🚫 Out of spins — earn more coins via missions'}
            </Text>
            <TouchableOpacity onPress={open} disabled={!canSpin} activeOpacity={0.88}>
              <LinearGradient
                colors={canSpin ? [COLORS.accent.secondary, COLORS.accent.brand] : [COLORS.text.muted, '#4B5563']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={s.cta}
              >
                <Ionicons name="gift" size={18} color="#fff" />
                <Text style={s.ctaTxt}>{canSpin ? 'Tap to Unwrap' : 'Out of Spins'}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </>
        )}

        {stage === 'opening' && (
          <Text style={s.hintTxt}>✨ Opening…</Text>
        )}

        {stage === 'revealed' && (
          <View style={{ gap: 10 }}>
            <TouchableOpacity onPress={() => router.back()} activeOpacity={0.88}>
              <LinearGradient colors={[COLORS.state.successAlt, COLORS.state.success]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.cta}>
                <Ionicons name="checkmark-circle" size={18} color="#fff" />
                <Text style={s.ctaTxt}>Collect & Continue</Text>
              </LinearGradient>
            </TouchableOpacity>
            {canSpin && (
              <TouchableOpacity onPress={openAnother} activeOpacity={0.88}>
                <View style={s.ghostCta}>
                  <Ionicons name="gift-outline" size={16} color="#fff" />
                  <Text style={s.ghostTxt}>Open another box</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: '#4C1D95' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  iconBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.5, color: 'rgba(255,255,255,0.85)' },
  hdrTitle: { fontSize: 16, fontWeight: '900', color: c.bg.elevated, marginTop: 2, letterSpacing: -0.2 },
  coinsPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)' },
  coinsTxt: { fontSize: 12, fontWeight: '900', color: c.bg.elevated },

  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },

  // Box
  boxWrap: { width: 220, height: 220, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  boxBody: { position: 'absolute', bottom: 0, width: 200, height: 160, borderRadius: 14, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  boxLid: { position: 'absolute', top: 20, width: 210, height: 44, borderRadius: 10 },
  boxQ: { fontSize: 68, fontWeight: '900', color: c.bg.elevated, textShadowColor: 'rgba(0,0,0,0.25)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6 },
  ribbonV: { position: 'absolute', top: 18, bottom: 0, width: 18, backgroundColor: c.state.danger, left: 101 },
  ribbonH: { position: 'absolute', left: 10, right: 10, height: 18, top: 82, backgroundColor: c.state.danger },
  bow: { position: 'absolute', top: 4, alignSelf: 'center' },

  // Reward
  rewardWrap: { alignItems: 'center', justifyContent: 'center' },
  rays: { position: 'absolute', width: 360, height: 360, alignItems: 'center', justifyContent: 'center' },
  ray: { position: 'absolute', width: 340, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)' },
  rewardCard: { backgroundColor: c.bg.elevated, paddingHorizontal: 22, paddingVertical: 26, borderRadius: 22, alignItems: 'center', gap: 10, minWidth: 260, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 10 },
  rewardEmoji: { fontSize: 64 },
  rewardTitle: { fontSize: 20, fontWeight: '900', color: c.text.primary, letterSpacing: -0.3, textAlign: 'center' },
  rewardSub: { fontSize: 13, color: c.text.muted, fontWeight: '700', textAlign: 'center' },
  multPill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: c.accent.secondary },
  multTxt: { fontSize: 10.5, fontWeight: '900', color: '#92400E', letterSpacing: 0.4 },

  // Footer
  footer: { paddingHorizontal: 20, paddingBottom: 28, paddingTop: 12, gap: 10, alignItems: 'center' },
  hintTxt: { fontSize: 12.5, color: 'rgba(255,255,255,0.9)', fontWeight: '700', textAlign: 'center' },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 15, paddingHorizontal: 36, borderRadius: 999, minWidth: 240, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 5 },
  ctaTxt: { fontSize: 15, fontWeight: '900', color: c.bg.elevated, letterSpacing: 0.3 },
  ghostCta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 12, borderRadius: 999, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.4)', minWidth: 240 },
  ghostTxt: { fontSize: 13, fontWeight: '800', color: c.bg.elevated, letterSpacing: 0.2 },
}));
