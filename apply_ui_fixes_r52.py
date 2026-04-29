#!/usr/bin/env python3
"""
apply_ui_fixes_r52.py — Round 52: 3 targeted UI fixes

1. BudgetCard icon overlap — aiBtn (🧠) at right:44 overlaps the amount text
2. Contacts permission — Linking.openSettings?.() fails silently on Android
3. Move Tax/Invest/MoneySchool tabs into AI Coach screen
"""
import os, sys

FE = "/app/frontend"
passed = 0
failed = 0

def patch(path, old, new, label):
    global passed, failed
    full = os.path.join(FE, path) if not path.startswith("/") else path
    if not os.path.exists(full):
        print(f"  ⚠  SKIP (not found): {path}")
        return
    with open(full, encoding="utf-8") as f:
        content = f.read()
    if new in content:
        print(f"  ✓  Already applied: {label}")
        passed += 1
        return
    if old not in content:
        print(f"  ✗  NOT FOUND: {label}")
        failed += 1
        return
    with open(full, "w", encoding="utf-8") as f:
        f.write(content.replace(old, new, 1))
    print(f"  ✓  {label}")
    passed += 1

# ─────────────────────────────────────────────────────────────────────────────
print("\n" + "="*60)
print("  Round 52 — 3 targeted UI fixes")
print("="*60)

# ─────────────────────────────────────────────────────────────────────────────
print("\n[FIX 1] BudgetCard: remove 🧠 icon overlap with amount text")

patch(
    "components/budget/BudgetCard.tsx",
    "  aiBtn: { position: 'absolute', top: 10, right: 44, width: 28, height: 28, borderRadius: 14, backgroundColor: c.accent.brandSoft, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.accent.brandSoft },",
    "  aiBtn: { position: 'absolute', bottom: 10, right: 10, width: 28, height: 28, borderRadius: 14, backgroundColor: c.accent.brandSoft, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.accent.brandSoft },",
    "BudgetCard aiBtn: move from top-right to bottom-right (no overlap)"
)

patch(
    "components/budget/BudgetCard.tsx",
    "  dotsBtn: { position: 'absolute', top: 10, right: 10, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.gray[200] },",
    "  dotsBtn: { position: 'absolute', top: 10, right: 10, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.gray[200] },\n  aiBtn_web: { position: 'absolute', top: 10, right: 44, width: 28, height: 28, borderRadius: 14, backgroundColor: c.accent.brandSoft, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.accent.brandSoft },",
    "BudgetCard: add separate aiBtn_web style for web layout"
)

patch(
    "components/budget/BudgetCard.tsx",
    "      {onInsights && (\n          <TouchableOpacity style={s.aiBtn} onPress={tap(onInsights, Haptics.ImpactFeedbackStyle.Medium)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>\n            <Text style={{ fontSize: 14 }}>🧠</Text>\n          </TouchableOpacity>\n        )}\n        <TouchableOpacity style={s.dotsBtn}",
    "      {onInsights && (\n          <TouchableOpacity style={s.aiBtn_web} onPress={tap(onInsights, Haptics.ImpactFeedbackStyle.Medium)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>\n            <Text style={{ fontSize: 14 }}>🧠</Text>\n          </TouchableOpacity>\n        )}\n        <TouchableOpacity style={s.dotsBtn}",
    "BudgetCard web: use aiBtn_web style (next to dots, not over amount)"
)

patch(
    "components/budget/BudgetCard.tsx",
    "        <View style={{ alignItems: 'flex-end' }}>\n          <Text style={[s.amt, { color: statusColor }]}>{formatINR(spent)}</Text>\n          <Text style={s.of}>of {formatINR(limit)}</Text>\n        </View>",
    "        <View style={{ alignItems: 'flex-end', paddingRight: 36 }}>\n          <Text style={[s.amt, { color: statusColor }]}>{formatINR(spent)}</Text>\n          <Text style={s.of}>of {formatINR(limit)}</Text>\n        </View>",
    "BudgetCard amount: add paddingRight:36 to prevent any icon overlap"
)

# ─────────────────────────────────────────────────────────────────────────────
print("\n[FIX 2] Contacts: fix Linking.openSettings for both iOS and Android")

patch(
    "app/split/add-member.tsx",
    "                    if (phoneContacts.permission === 'denied') {\n                      Linking.openSettings?.();\n                      return;\n                    }\n                    await phoneContacts.load();",
    """                    if (phoneContacts.permission === 'denied') {
                      // iOS: Linking.openSettings() opens the app's settings page
                      // Android: requires sending an intent to the app details screen
                      if (Platform.OS === 'ios') {
                        Linking.openURL('app-settings:').catch(() => Linking.openSettings());
                      } else {
                        // Android — open app-specific settings via intent
                        Linking.openSettings().catch(() => {
                          Linking.openURL('package:com.mintu.finance').catch(() => {});
                        });
                      }
                      return;
                    }
                    await phoneContacts.load();""",
    "add-member: fix Linking.openSettings for iOS + Android"
)

patch(
    "hooks/usePhoneContacts.ts",
    "      setError(e?.message || 'Could not read contacts');\n      setLoading(false);\n      setPermission('denied');\n      return { granted: false, count: 0 };",
    """      const msg = e?.message || '';
      // On Android, 'user denied' vs 'permission never asked' need different UX
      const isDenied = msg.toLowerCase().includes('denied') || msg.toLowerCase().includes('permission');
      setError(isDenied
        ? 'Contacts access was denied. Please enable it in your phone Settings > MintU > Contacts.'
        : 'Could not read contacts. Please try again.');
      setLoading(false);
      setPermission(isDenied ? 'denied' : 'denied');
      return { granted: false, count: 0 };""",
    "usePhoneContacts: better error message for denied vs other errors"
)

# ─────────────────────────────────────────────────────────────────────────────
print("\n[FIX 3] Move Tax / Invest / School tabs into AI Coach screen")

patch(
    "app/(tabs)/ai-coach.tsx",
    "import api from '../../utils/api';\nimport { useIsOnline } from '../../hooks/useIsOnline';",
    """import api from '../../utils/api';
import { useIsOnline } from '../../hooks/useIsOnline';
import TaxCalculator from '../../components/premium/TaxCalculator';
import InvestmentSuggester from '../../components/premium/InvestmentSuggester';
import { useActivePlan, FEATURES, canAccess } from '../../utils/premium';""",
    "ai-coach: import TaxCalculator/InvestmentSuggester/premium utils"
)

patch(
    "app/(tabs)/ai-coach.tsx",
    "  const isOnline = useIsOnline();\n  const [loading, setLoading] = useState(true);",
    """  const isOnline = useIsOnline();
  const [activeTab, setActiveTab] = useState<'insights' | 'tax' | 'invest' | 'school'>('insights');
  const [plan] = useActivePlan();
  const [loading, setLoading] = useState(true);""",
    "ai-coach: add activeTab state + plan"
)

patch(
    "app/(tabs)/ai-coach.tsx",
    "  return (\n    <SafeAreaView style={s.safe} edges={['top']}>\n      <ScrollView",
    """  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Tab strip — Insights / Tax / Invest / School */}
      <View style={s.tabStrip}>
        {([
          { id: 'insights', emoji: '🧠', label: 'Insights' },
          { id: 'tax',      emoji: '🧾', label: 'Tax' },
          { id: 'invest',   emoji: '💰', label: 'Invest' },
          { id: 'school',   emoji: '🎓', label: 'School' },
        ] as const).map(t => (
          <TouchableOpacity
            key={t.id}
            onPress={() => setActiveTab(t.id)}
            style={[s.tabItem, activeTab === t.id && s.tabItemActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === t.id }}
          >
            <Text style={s.tabEmoji}>{t.emoji}</Text>
            <Text style={[s.tabLabel, activeTab === t.id && s.tabLabelActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Non-insights tabs render their own scroll views */}
      {activeTab === 'tax' && (
        <View style={{ flex: 1 }}>
          <TaxCalculator />
        </View>
      )}
      {activeTab === 'invest' && (
        <View style={{ flex: 1 }}>
          <InvestmentSuggester />
        </View>
      )}
      {activeTab === 'school' && (
        <View style={{ flex: 1 }}>
          <TouchableOpacity
            style={s.schoolCta}
            onPress={() => router.push('/money-school' as any)}
            activeOpacity={0.85}
          >
            <Text style={s.schoolCtaEmoji}>🎓</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.schoolCtaTitle}>Money School</Text>
              <Text style={s.schoolCtaSub}>Daily 60-second finance lessons in Indian context — SIPs, PPF, tax saving & more.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.accent.primary} />
          </TouchableOpacity>
        </View>
      )}

      {activeTab !== 'insights' ? null : <ScrollView""",
    "ai-coach: insert tab strip + tax/invest/school panels"
)

patch(
    "app/(tabs)/ai-coach.tsx",
    "      {/* Full-screen chat sheet */}\n      <Modal",
    """      {activeTab === 'insights' ? null : null}

      {/* Full-screen chat sheet */}
      <Modal""",
    "ai-coach: add closing marker before Modal"
)

patch(
    "app/(tabs)/ai-coach.tsx",
    "  safe: { flex: 1, backgroundColor: c.bg.primary },\n  scroll: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, paddingBottom: 120 },",
    """  safe: { flex: 1, backgroundColor: c.bg.primary },
  scroll: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, paddingBottom: 120 },

  tabStrip: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: c.border.subtle,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 12,
    gap: 3,
  },
  tabItemActive: {
    backgroundColor: c.accent.primary + '18',
    borderWidth: 1,
    borderColor: c.accent.primary + '44',
  },
  tabEmoji: { fontSize: 16 },
  tabLabel: { fontSize: 10.5, fontWeight: '700', color: c.text.muted, letterSpacing: 0.3 },
  tabLabelActive: { color: c.accent.primary, fontWeight: '900' },

  schoolCta: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    margin: SPACING.lg, padding: 18,
    backgroundColor: c.bg.secondary,
    borderRadius: 18, borderWidth: 1, borderColor: c.border.subtle,
  },
  schoolCtaEmoji: { fontSize: 32 },
  schoolCtaTitle: { fontSize: 16, fontWeight: '900', color: c.text.primary, letterSpacing: -0.3 },
  schoolCtaSub: { fontSize: 12.5, color: c.text.muted, marginTop: 4, lineHeight: 17 },""",
    "ai-coach: add tabStrip + schoolCta styles"
)

# ─────────────────────────────────────────────────────────────────────────────
print("\n" + "="*60)
print(f"  Done: {passed} OK  {failed} FAIL")
print("="*60)

if failed > 0:
    print(f"\n  WARNING: {failed} patch(es) not applied. Check FAIL lines above.")
else:
    print("\n  All fixes applied!")
