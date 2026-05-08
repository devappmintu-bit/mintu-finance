/**
 * /brutal-showcase — Phase 1 showcase screen.
 *
 * Renders every primitive in every variant so we (and design QA) can
 * visually confirm tokens are wired correctly before Phase 2 (nav)
 * and Phase 3 (Home) consume them.
 *
 * Hidden route — reach via the URL bar at /brutal-showcase. Not in
 * the bottom-tab IA. Will be removed once Phase 8 completes.
 */
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  BR_COLORS,
  BR_FONT,
  BR_SPACE,
  BrutalBadge,
  BrutalButton,
  BrutalCard,
  BrutalChip,
  BrutalEmptyState,
  BrutalInput,
  BrutalProgress,
  BrutalTabBar,
  type BrutalTabItem,
  BrutalToast,
  PALETTE,
} from '../components/brutal';

export default function BrutalShowcase() {
  const [search, setSearch] = useState('');
  const [amount, setAmount] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [tone, setTone] = useState<
    'accent' | 'highlight' | 'positive' | 'premium' | 'cool' | 'warm'
  >('accent');
  const [activeTab, setActiveTab] = useState('home');
  const tabs: BrutalTabItem[] = [
    { key: 'home',   label: 'HOME',   icon: 'home-outline',   iconActive: 'home' },
    { key: 'split',  label: 'SPLIT',  icon: 'people-outline', iconActive: 'people', badge: 2 },
    { key: 'coach',  label: 'COACH',  icon: 'sparkles-outline', iconActive: 'sparkles' },
    { key: 'budget', label: 'BUDGET', icon: 'pie-chart-outline', iconActive: 'pie-chart' },
    { key: 'me',     label: 'ME',     icon: 'person-outline', iconActive: 'person' },
  ];

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <BrutalToast
        message={toast}
        tone={tone}
        onDismiss={() => setToast(null)}
      />
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* HEADER */}
        <View style={s.header}>
          <Text style={s.eyebrow}>R103 · PHASE 1</Text>
          <Text style={s.headline}>BRUTAL{'\n'}LIBRARY</Text>
          <Text style={s.lede}>
            7 primitives · 1 token system · Foundation for every screen
            from here on.
          </Text>
        </View>

        {/* CARDS SECTION */}
        <Section title="CARDS">
          <View style={s.row2}>
            <BrutalCard variant="base" style={s.col}>
              <Text style={s.cardTitle}>BASE</Text>
              <Text style={s.cardBody}>2px frame · sm shadow</Text>
            </BrutalCard>
            <BrutalCard variant="hero" style={s.col}>
              <Text style={s.cardTitle}>HERO</Text>
              <Text style={s.cardBody}>3px frame · lg shadow</Text>
            </BrutalCard>
          </View>
          <View style={s.row2}>
            <BrutalCard variant="warm" style={s.col}>
              <Text style={s.cardTitle}>WARM</Text>
              <Text style={s.cardBody}>parchment surface</Text>
            </BrutalCard>
            <BrutalCard variant="lavender" style={s.col}>
              <Text style={s.cardTitle}>LAVENDER</Text>
              <Text style={s.cardBody}>premium tier feel</Text>
            </BrutalCard>
          </View>
          <View style={s.row2}>
            <BrutalCard variant="accent" style={s.col} tilt={-1}>
              <Text style={s.cardTitle}>ACCENT</Text>
              <Text style={s.cardBody}>mascot orange · PRIMARY</Text>
            </BrutalCard>
            <BrutalCard variant="highlight" style={s.col} tilt={1}>
              <Text style={s.cardTitle}>HIGHLIGHT</Text>
              <Text style={s.cardBody}>yellow · secondary</Text>
            </BrutalCard>
          </View>
          <View style={s.row2}>
            <BrutalCard variant="lime" style={s.col}>
              <Text style={s.cardTitle}>POSITIVE</Text>
              <Text style={s.cardBody}>lime — celebrate</Text>
            </BrutalCard>
          </View>
          <View style={s.row2}>
            <BrutalCard variant="purple" style={s.col}>
              <Text style={s.cardTitle}>PREMIUM</Text>
              <Text style={s.cardBody}>electric purple</Text>
            </BrutalCard>
            <BrutalCard variant="cyan" style={s.col}>
              <Text style={s.cardTitle}>COOL</Text>
              <Text style={s.cardBody}>cyan info</Text>
            </BrutalCard>
          </View>
          <View style={s.row2}>
            <BrutalCard variant="peach" style={s.col}>
              <Text style={s.cardTitle}>WARM</Text>
              <Text style={s.cardBody}>peach soft callout</Text>
            </BrutalCard>
            <BrutalCard variant="ghost" style={s.col}>
              <Text style={s.cardTitle}>GHOST</Text>
              <Text style={s.cardBody}>dashed empty state</Text>
            </BrutalCard>
          </View>
          <BrutalCard variant="hero" pressable onPress={() => setToast('🎯 Pressed the hero card')}>
            <Text style={s.cardTitle}>PRESSABLE HERO</Text>
            <Text style={s.cardBody}>Tap me — translateY-2 into shadow.</Text>
          </BrutalCard>
        </Section>

        {/* BUTTONS */}
        <Section title="BUTTONS">
          <View style={s.row2}>
            <BrutalButton label="Accent" tone="accent" style={s.col} />
            <BrutalButton label="Positive" tone="positive" style={s.col} />
          </View>
          <View style={s.row2}>
            <BrutalButton label="Premium" tone="premium" style={s.col} icon="sparkles" />
            <BrutalButton label="Cool" tone="cool" style={s.col} icon="information-circle" />
          </View>
          <View style={s.row2}>
            <BrutalButton label="Ink" tone="ink" style={s.col} icon="flash" />
            <BrutalButton label="Paper" tone="paper" style={s.col} />
          </View>
          <View style={s.row2}>
            <BrutalButton label="Danger" tone="danger" style={s.col} icon="trash" />
            <BrutalButton label="Success" tone="success" style={s.col} icon="checkmark" />
          </View>
          <BrutalButton
            label="Settle Up Now"
            tone="accent"
            size="xl"
            fullWidth
            trailingIcon="arrow-forward"
            onPress={() => setToast('🎉 XL button works')}
          />
          <BrutalButton label="Loading…" tone="accent" loading fullWidth />
          <BrutalButton label="Disabled" tone="accent" disabled fullWidth />
        </Section>

        {/* CHIPS */}
        <Section title="CHIPS">
          <View style={s.chipRow}>
            <BrutalChip label="All" tone="paper" selected />
            <BrutalChip label="Food" tone="paper" />
            <BrutalChip label="Travel" tone="paper" />
            <BrutalChip label="Bills" tone="paper" />
          </View>
          <View style={s.chipRow}>
            <BrutalChip label="Why this number?" tone="accent" onPress={() => setToast('Chip tapped')} />
            <BrutalChip label="Show examples" tone="positive" onPress={() => setToast('Chip tapped')} />
            <BrutalChip label="Skip" tone="paper" onPress={() => setToast('Chip tapped')} />
          </View>
        </Section>

        {/* INPUTS */}
        <Section title="INPUTS">
          <BrutalInput
            label="Search"
            variant="search"
            placeholder="Search expenses…"
            value={search}
            onChangeText={setSearch}
          />
          <BrutalInput
            label="Amount"
            variant="amount"
            placeholder="0"
            value={amount}
            onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ''))}
            keyboardType="numeric"
            helper="Tap-pay limit per row"
          />
          <BrutalInput
            label="Group name"
            placeholder="e.g. Goa Trip"
            error="This name already exists in your groups."
          />
        </Section>

        {/* PROGRESS */}
        <Section title="PROGRESS">
          <BrutalProgress
            label="FOOD"
            trailingLabel="₹3,200 / ₹5,000"
            value={0.64}
            tone="positive"
            style={{ marginBottom: 16 }}
          />
          <BrutalProgress
            label="ENTERTAINMENT"
            trailingLabel="₹4,800 / ₹4,000"
            value={1.2}
            tone="danger"
            style={{ marginBottom: 16 }}
          />
          <BrutalProgress
            label="STREAK"
            trailingLabel="4/7 days"
            value={4 / 7}
            tone="accent"
          />
        </Section>

        {/* BADGES */}
        <Section title="BADGES (sticker overlap)">
          <View style={s.row2}>
            <BrutalCard variant="base" style={[s.col, { paddingTop: 26 }]}>
              <BrutalBadge label="NEW" tone="accent" style={s.cornerBadge} />
              <Text style={s.cardTitle}>Card with badge</Text>
              <Text style={s.cardBody}>Sticker tilt = -4°</Text>
            </BrutalCard>
            <BrutalCard variant="base" style={[s.col, { paddingTop: 26 }]}>
              <BrutalBadge label="PRO" tone="premium" style={s.cornerBadge} />
              <Text style={s.cardTitle}>Premium card</Text>
              <Text style={s.cardBody}>Tap to upgrade</Text>
            </BrutalCard>
          </View>
        </Section>

        {/* TOAST TRIGGERS */}
        <Section title="TOAST">
          <View style={s.chipRow}>
            <BrutalChip
              label="🎯 Cap set"
              tone="accent"
              onPress={() => { setTone('accent'); setToast('🎯 Cap set — baseline started'); }}
            />
            <BrutalChip
              label="✅ Logged"
              tone="positive"
              onPress={() => { setTone('positive'); setToast('✅ Logged — one step toward your baseline'); }}
            />
            <BrutalChip
              label="🏆 Goal"
              tone="premium"
              onPress={() => { setTone('premium'); setToast('🏆 Goal created — let\u2019s make it happen'); }}
            />
          </View>
        </Section>

        {/* PALETTE SWATCHES */}
        <Section title="PALETTE">
          <View style={s.swatchRow}>
            {(
              [
                ['Yellow', PALETTE.yellow],
                ['Lime', PALETTE.lime],
                ['Purple', PALETTE.purple],
                ['Cyan', PALETTE.cyan],
                ['Peach', PALETTE.peach],
                ['Ink', PALETTE.ink],
                ['Cream', PALETTE.cream],
                ['Lavender', PALETTE.lavender],
              ] as const
            ).map(([name, hex]) => (
              <View key={name} style={s.swatch}>
                <View style={[s.swatchChip, { backgroundColor: hex }]} />
                <Text style={s.swatchName}>{name}</Text>
                <Text style={s.swatchHex}>{hex}</Text>
              </View>
            ))}
          </View>
        </Section>

        {/* TAB BAR — Phase 2 ship */}
        <Section title="EMPTY STATES">
          <BrutalEmptyState
            emoji="🌱"
            title="No expenses yet"
            body="Log your first one and Mintu will start spotting patterns automatically."
            hint="Tap the + below to begin."
            ctaLabel="LOG FIRST EXPENSE"
            onCta={() => setToast('🎯 Empty-state CTA fired')}
          />
          <BrutalEmptyState
            variant="warm"
            emoji="🤝"
            title="No groups yet"
            body="Split bills with friends — settled in seconds, no math required."
            ctaLabel="CREATE GROUP"
            onCta={() => setToast('Group CTA fired')}
            secondaryLabel="Skip for now"
            onSecondary={() => setToast('Skipped')}
          />
        </Section>

        {/* TAB BAR — Phase 2 ship */}
        <Section title="TAB BAR · floating dock">
          <Text style={s.lede}>
            Tap a tab to see the spring-pill slide. Mascot orange = active.
          </Text>
          <BrutalTabBar
            items={tabs}
            activeKey={activeTab}
            onSelect={setActiveTab}
          />
        </Section>

        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: React.PropsWithChildren<{ title: string }>) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={{ gap: BR_SPACE['3'] }}>{children}</View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BR_COLORS.bg },
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },
  header: {
    paddingTop: 12,
    paddingBottom: 24,
    borderBottomWidth: 2,
    borderBottomColor: BR_COLORS.ink,
    marginBottom: 24,
  },
  eyebrow: {
    ...BR_FONT.stamp,
    color: BR_COLORS.textMuted,
    marginBottom: 6,
  },
  headline: {
    ...BR_FONT.display,
    color: BR_COLORS.ink,
    marginBottom: 8,
  },
  lede: {
    fontSize: 13,
    fontWeight: '600',
    color: BR_COLORS.textMuted,
    lineHeight: 18,
  },
  section: { marginBottom: 28 },
  sectionTitle: {
    ...BR_FONT.stamp,
    color: BR_COLORS.ink,
    marginBottom: 12,
  },
  row2: { flexDirection: 'row', gap: 12 },
  col: { flex: 1 },
  cardTitle: { ...BR_FONT.h3, color: BR_COLORS.ink },
  cardBody: { fontSize: 12, fontWeight: '600', color: BR_COLORS.textMuted, marginTop: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cornerBadge: { position: 'absolute', top: -8, right: 12, zIndex: 5 },
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  swatch: { width: '47%' },
  swatchChip: {
    height: 56,
    borderWidth: 2,
    borderColor: BR_COLORS.ink,
    borderRadius: 8,
  },
  swatchName: {
    ...BR_FONT.stampSm,
    color: BR_COLORS.ink,
    marginTop: 6,
  },
  swatchHex: { fontSize: 11, fontFamily: BR_FONT.mono.fontFamily, color: BR_COLORS.textMuted },
});
