/**
 * BudgetCard — Phase-1 category card for the Budget tab.
 *
 * Features delivered in this component:
 *   • Live bar chart fill with color states (green/orange/red) + pulse at ≥90%
 *   • Burn rate chip · Days-left chip · Predicted-overspend banner
 *   • Swipe LEFT  → reveals Delete action (confirmation happens in parent)
 *   • Swipe RIGHT → reveals Edit + Add-Expense actions
 *   • 3-dot menu fallback for accessibility + web preview (gestures are flaky on RN-Web)
 *   • Haptic feedback on action trigger
 *   • Tap anywhere on card → opens Edit
 *
 * Intentionally stateless w.r.t. the data — parent owns mutations and passes
 * `onEdit`, `onDelete`, `onAddExpense` callbacks. This keeps the card pure
 * and memoisable.
 */
import React, { memo, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Platform, Easing } from 'react-native';
import { Swipeable, RectButton } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import {  CATEGORIES, shadowStyle, useAppColors } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';

type Props = {
  item: any;
  onEdit: () => void;
  onDelete: () => void;
  onAddExpense: () => void;
  onInsights?: () => void;  // Phase 2 — long-press / 🧠 button to open AI insights
};

function formatINR(n: number) { return `₹${Math.round(n).toLocaleString('en-IN')}`; }

const BudgetCard = memo(function BudgetCard({ item, onEdit, onDelete, onAddExpense, onInsights }: Props) {
  const s = useStyles();
  const c = useAppColors();
  const limit = Number(item.amount ?? item.budget ?? 0);
  const spent = Number(item.spent ?? 0);
  const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0;
  const over = Math.max(0, spent - limit);
  const remaining = Math.max(0, limit - spent);
  const burnRate = Number(item.burn_rate ?? 0);
  const daysLeft = Number(item.days_left ?? 0);
  const projectedOver = Number(item.projected_over ?? 0);
  const projectedSpend = Number(item.projected_spend ?? 0);
  const status = String(item.status || 'healthy');

  const isOver = spent > limit && limit > 0;
  const isRisk = !isOver && projectedOver > 0;
  const isWarn = !isOver && !isRisk && pct >= 80;

  // Color-psychology states
  const statusColor = isOver ? '#EF4444' : isWarn ? '#F59E0B' : isRisk ? '#F97316' : '#10B981';
  const bgTint = isOver ? '#FEF2F2' : isWarn ? '#FFFBEB' : isRisk ? '#FFF7ED' : '#F0FDF4';
  const cat = (CATEGORIES as any)[item.category] || (CATEGORIES as any).Other;
  const emoji = cat.emoji || '💰';

  // ─── Animations ──────────────────────────────────────────────
  // Bar fill animates in on mount + whenever pct changes
  const fillAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fillAnim, {
      toValue: pct,
      duration: 650,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [pct]);

  // Pulse near-limit / over-limit
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!(isOver || isWarn || isRisk)) { pulse.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.04, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1.0, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isOver, isWarn, isRisk]);

  // Shake once when just overspent
  const shake = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isOver) return;
    Animated.sequence([
      Animated.timing(shake, { toValue: 1, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -1, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 1, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  }, [isOver]);

  const translateX = shake.interpolate({ inputRange: [-1, 1], outputRange: [-4, 4] });

  // ─── Haptic-wrapped handlers ─────────────────────────────────
  const tap = (fn: () => void, impact: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => () => {
    try { Haptics.impactAsync(impact); } catch {}
    fn();
  };

  // ─── Web fallback: 3-dot overlay ─────────────────────────────
  const [menuOpen, setMenuOpen] = useState(false);
  if (Platform.OS === 'web') {
    return (
      <Animated.View style={[s.card, { backgroundColor: bgTint, borderColor: statusColor + '33', transform: [{ scale: pulse }, { translateX }] }]}>
        <TouchableOpacity style={s.cardBody} activeOpacity={0.85} onPress={tap(onEdit)} onLongPress={onInsights ? tap(onInsights, Haptics.ImpactFeedbackStyle.Medium) : undefined} delayLongPress={350}>
          <CardContent item={item} emoji={emoji} catColor={cat.color} statusColor={statusColor}
            limit={limit} spent={spent} pct={pct} over={over} remaining={remaining}
            burnRate={burnRate} daysLeft={daysLeft} projectedOver={projectedOver} projectedSpend={projectedSpend}
            fillAnim={fillAnim} isOver={isOver} isWarn={isWarn} isRisk={isRisk} status={status} />
        </TouchableOpacity>
        {onInsights && (
          <TouchableOpacity style={s.aiBtn} onPress={tap(onInsights, Haptics.ImpactFeedbackStyle.Medium)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ fontSize: 14 }}>🧠</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={s.dotsBtn} onPress={() => setMenuOpen(v => !v)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="ellipsis-horizontal" size={16} color={c.text.muted} />
        </TouchableOpacity>
        {menuOpen && (
          <View style={s.menu}>
            <TouchableOpacity style={s.menuItem} onPress={tap(() => { setMenuOpen(false); onEdit(); })}>
              <Ionicons name="create-outline" size={16} color={c.state.info} /><Text style={[s.menuT, { color: c.state.info }]}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.menuItem} onPress={tap(() => { setMenuOpen(false); onAddExpense(); }, Haptics.ImpactFeedbackStyle.Medium)}>
              <Ionicons name="add-circle-outline" size={16} color={c.state.success} /><Text style={[s.menuT, { color: c.state.success }]}>+ Expense</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.menuItem} onPress={tap(() => { setMenuOpen(false); onDelete(); }, Haptics.ImpactFeedbackStyle.Heavy)}>
              <Ionicons name="trash-outline" size={16} color={c.state.danger} /><Text style={[s.menuT, { color: c.state.danger }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>
    );
  }

  // ─── Native: gesture swipe ───────────────────────────────────
  const rowRef = useRef<Swipeable>(null);
  const close = () => rowRef.current?.close();

  const renderRight = (_p: any, dragX: Animated.AnimatedInterpolation<number>) => {
    const scale = dragX.interpolate({ inputRange: [-100, -40, 0], outputRange: [1, 0.8, 0.3], extrapolate: 'clamp' });
    return (
      <RectButton style={s.rightAct} onPress={() => { close(); tap(onDelete, Haptics.ImpactFeedbackStyle.Heavy)(); }}>
        <Animated.View style={{ transform: [{ scale }], alignItems: 'center' }}>
          <Ionicons name="trash-outline" size={22} color="#FFFFFF" />
          <Text style={s.actTxt}>Delete</Text>
        </Animated.View>
      </RectButton>
    );
  };

  const renderLeft = (_p: any, dragX: Animated.AnimatedInterpolation<number>) => {
    const scale = dragX.interpolate({ inputRange: [0, 40, 150], outputRange: [0.3, 0.8, 1], extrapolate: 'clamp' });
    return (
      <View style={{ flexDirection: 'row' }}>
        <RectButton style={s.leftActEdit} onPress={() => { close(); tap(onEdit)(); }}>
          <Animated.View style={{ transform: [{ scale }], alignItems: 'center' }}>
            <Ionicons name="create-outline" size={20} color="#FFFFFF" />
            <Text style={s.actTxt}>Edit</Text>
          </Animated.View>
        </RectButton>
        <RectButton style={s.leftActAdd} onPress={() => { close(); tap(onAddExpense, Haptics.ImpactFeedbackStyle.Medium)(); }}>
          <Animated.View style={{ transform: [{ scale }], alignItems: 'center' }}>
            <Ionicons name="add" size={22} color="#FFFFFF" />
            <Text style={s.actTxt}>Expense</Text>
          </Animated.View>
        </RectButton>
      </View>
    );
  };

  return (
    <Swipeable
      ref={rowRef}
      renderRightActions={renderRight}
      renderLeftActions={renderLeft}
      overshootRight={false}
      overshootLeft={false}
      friction={2}
      rightThreshold={50}
      leftThreshold={50}
      onSwipeableWillOpen={() => { try { Haptics.selectionAsync(); } catch {} }}
    >
      <Animated.View style={[s.card, { backgroundColor: bgTint, borderColor: statusColor + '33', transform: [{ scale: pulse }, { translateX }] }]}>
        <TouchableOpacity style={s.cardBody} activeOpacity={0.9} onPress={tap(onEdit)} onLongPress={onInsights ? tap(onInsights, Haptics.ImpactFeedbackStyle.Medium) : undefined} delayLongPress={350}>
          <CardContent item={item} emoji={emoji} catColor={cat.color} statusColor={statusColor}
            limit={limit} spent={spent} pct={pct} over={over} remaining={remaining}
            burnRate={burnRate} daysLeft={daysLeft} projectedOver={projectedOver} projectedSpend={projectedSpend}
            fillAnim={fillAnim} isOver={isOver} isWarn={isWarn} isRisk={isRisk} status={status} />
        </TouchableOpacity>
        {onInsights && (
          <TouchableOpacity style={s.aiBtn} onPress={tap(onInsights, Haptics.ImpactFeedbackStyle.Medium)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ fontSize: 14 }}>🧠</Text>
          </TouchableOpacity>
        )}
      </Animated.View>
    </Swipeable>
  );
});

export default BudgetCard;

// ─── Inner layout (shared between web + native renderers) ─────────
function CardContent({ item, emoji, catColor, statusColor, limit, spent, pct, over, remaining,
  burnRate, daysLeft, projectedOver, projectedSpend, fillAnim, isOver, isWarn, isRisk, status }: any) {
  const s = useStyles();
  const c = useAppColors();
  const fillWidth = fillAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] });
  return (
    <>
      <View style={s.row1}>
        <View style={[s.icon, { backgroundColor: catColor + '22' }]}>
          <Text style={{ fontSize: 18 }}>{emoji}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={s.name} numberOfLines={1}>{item.category}</Text>
          <Text style={s.period}>{String(item.period || 'monthly').toUpperCase()}{item.recurring === false ? ' · ONE-TIME' : ''}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[s.amt, { color: statusColor }]}>{formatINR(spent)}</Text>
          <Text style={s.of}>of {formatINR(limit)}</Text>
        </View>
      </View>

      {/* Animated gradient fill — glassy soft-UI.
          Round 38 — wrap with progressbar role + value so screen readers
          announce "{category} budget, 47 percent of ₹5000 used". */}
      <View
        style={s.track}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`${item.category} budget`}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(Math.min(100, pct || 0)), text: `${formatINR(spent)} of ${formatINR(limit)} used` }}
      >
        <Animated.View style={[s.fill, { width: fillWidth }]}>
          <LinearGradient
            colors={[statusColor, statusColor + 'AA']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ flex: 1, borderRadius: 4 }}
          />
        </Animated.View>
      </View>

      <View style={s.row2}>
        <Text style={s.pct}>{Math.round(pct)}% used</Text>
        {isOver ? (
          <Text style={[s.tail, { color: c.state.danger }]}>over by {formatINR(over)}</Text>
        ) : (
          <Text style={[s.tail, { color: c.state.success }]}>{formatINR(remaining)} left</Text>
        )}
      </View>

      {/* Insight chips row */}
      <View style={s.chipsRow}>
        <View style={s.chip}>
          <Ionicons name="flame-outline" size={11} color={c.text.muted} />
          <Text style={s.chipT}>{formatINR(burnRate)}/day</Text>
        </View>
        <View style={s.chip}>
          <Ionicons name="calendar-outline" size={11} color={c.text.muted} />
          <Text style={s.chipT}>{daysLeft}d left</Text>
        </View>
        {status === 'healthy' && (
          <View style={[s.chip, { backgroundColor: c.state.successBg, borderColor: c.state.successBorder }]}>
            <Ionicons name="checkmark-circle" size={11} color={c.state.success} />
            <Text style={[s.chipT, { color: c.state.success }]}>On track</Text>
          </View>
        )}
      </View>

      {/* Predicted-overspend banner */}
      {isRisk && (
        <View style={s.warnBanner}>
          <Ionicons name="trending-up" size={13} color="#9A3412" />
          <Text style={s.warnT}>At current pace you&apos;ll exceed by {formatINR(projectedOver)}</Text>
        </View>
      )}
      {isOver && (
        <View style={s.overBanner}>
          <Ionicons name="alert-circle" size={13} color={c.state.danger} />
          <Text style={s.overT}>Overspent · {formatINR(over)} above limit</Text>
        </View>
      )}
    </>
  );
}

const useStyles = makeStyles((c) => ({
  card: { borderRadius: 18, padding: 14, marginBottom: 10, borderWidth: 1 },
  cardBody: {},

  row1: { flexDirection: 'row', alignItems: 'center' },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 15, fontWeight: '800', color: c.text.primary },
  period: { fontSize: 10, color: c.text.muted, fontWeight: '700', letterSpacing: 0.3, marginTop: 2 },
  amt: { fontSize: 16, fontWeight: '800' },
  of: { fontSize: 11, color: c.text.muted, fontWeight: '600', marginTop: 2 },

  track: { height: 7, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.06)', overflow: 'hidden', marginTop: 10 },
  fill: { height: '100%', borderRadius: 4 },

  row2: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  pct: { fontSize: 10.5, color: c.text.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  tail: { fontSize: 11, fontWeight: '800' },

  chipsRow: { flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1, borderColor: c.gray[200], borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  chipT: { fontSize: 10.5, color: c.text.secondary, fontWeight: '700' },

  warnBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, backgroundColor: c.accent.brandSoft, borderWidth: 1, borderColor: c.accent.brandSoft },
  warnT: { fontSize: 11.5, fontWeight: '700', color: '#9A3412', flex: 1 },
  overBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, backgroundColor: c.state.dangerBg, borderWidth: 1, borderColor: c.state.dangerBorder },
  overT: { fontSize: 11.5, fontWeight: '800', color: c.state.danger, flex: 1 },

  rightAct: { backgroundColor: c.state.danger, justifyContent: 'center', alignItems: 'center', width: 92, borderRadius: 16, marginBottom: 10, marginLeft: 8 },
  leftActEdit: { backgroundColor: c.state.info, justifyContent: 'center', alignItems: 'center', width: 78, borderRadius: 16, marginBottom: 10, marginRight: 6 },
  leftActAdd: { backgroundColor: c.state.success, justifyContent: 'center', alignItems: 'center', width: 82, borderRadius: 16, marginBottom: 10, marginRight: 6 },
  actTxt: { color: c.bg.elevated, fontSize: 11, fontWeight: '800', marginTop: 3 },

  dotsBtn: { position: 'absolute', top: 10, right: 10, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.gray[200] },
  aiBtn: { position: 'absolute', top: 10, right: 44, width: 28, height: 28, borderRadius: 14, backgroundColor: c.accent.brandSoft, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.accent.brandSoft },
  menu: { position: 'absolute', top: 42, right: 8, backgroundColor: c.bg.elevated, borderRadius: 12, paddingVertical: 6, paddingHorizontal: 4, borderWidth: 1, borderColor: c.gray[200], zIndex: 10, minWidth: 130, ...shadowStyle('#000000', 8, 14, 0.1, 10) },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 },
  menuT: { fontSize: 13, fontWeight: '700' },
}));
