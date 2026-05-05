/**
 * AI Coach tab — Round 89 Strike 2 refine.
 *
 * ONE render pipeline. ONE format. ONE brain. No modals.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * STATE MACHINE (enforced in this file — no branching anywhere else):
 *
 *   loading         → <AICoachSkeleton />
 *   !hasUserData    → <AICoachStateView /> no_data scene
 *   hasUserData     → <AICoachChat />  (inline tab body — NOT a modal)
 *
 * Previously this tab rendered a state view + opened AICoachChat as a
 * Modal on AskBar tap. That gave us TWO surfaces — an insight stream
 * and a chat — each with subtly different formatting. User feedback
 * was correct: "two AI Coach screens, dual format". Fixed.
 *
 * Home's AskBar still opens the chat as a modal overlay (appropriate
 * there — chat is secondary on Home). But the Coach TAB is now
 * unambiguously a chat surface after first data is logged.
 * ═══════════════════════════════════════════════════════════════════════
 */
import React, { useEffect } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import AICoachChat from '../../components/AICoachChat';
import GlowPill from '../../components/ui/GlowPill';
import AICoachStateView from '../../components/ai-coach/AICoachStateView';
import { BR_COLORS, BR_TYPE, BR_SPACE, BR_BORDER } from '../../utils/brutalist';
import { useIsOnline } from '../../hooks/useIsOnline';
import { useFinContext } from '../../store/financialContext';
import { useAIPrompt } from '../../store/aiPromptStore';

// Round 90 — Surface 1B proactive deep-link map.
// `/ai-coach?prompt=<key>` is opened from a push notification; the
// key is mapped to a fully-formed user prompt and parked in
// useAIPrompt for AICoachChat to pick up on mount.
const PROMPT_MAP: Record<string, string> = {
  plan_salary_month:
    "My salary just landed. Plan how I should split it across savings, "
    + "essentials, and discretionary for this month.",
  overspend_recovery:
    "I'm overspending on at least one category — what's the fastest way "
    + "to recover before month end?",
  weekly_review:
    "Give me a 1-paragraph review of my week — biggest leak, what worked, "
    + "and one thing to fix next week.",
};

function AICoachTab() {
  const isOnline = useIsOnline();
  // Single SSoT read — drives the state machine below.
  const txnCount = useFinContext((s: any) => Number(s?.transactions?.count ?? 0));
  const ctxLoading = useFinContext((s: any) => !!s?.loading);

  // Round 90 Surface 1B — proactive deep-link handler.
  // `/ai-coach?prompt=<key>` is opened from a push notification.
  // We translate the key to a fully-formed prompt and stash it in
  // useAIPrompt; AICoachChat already consumes that on mount.
  const params = useLocalSearchParams<{ prompt?: string }>();
  useEffect(() => {
    const key = (params?.prompt || '') as string;
    if (!key) return;
    const text = PROMPT_MAP[key];
    if (text) {
      useAIPrompt.getState().set(text, key, 'proactive');
    }
  }, [params?.prompt]);

  // ── STATE 1 — SSoT still hydrating: show minimal skeleton. No chat,
  // no state-view; showing either while data is unknown causes flicker.
  if (ctxLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Header isOnline={isOnline} />
        <View style={styles.skeletonWrap}>
          <View style={styles.skelLine} />
          <View style={[styles.skelLine, { width: '60%' }]} />
          <View style={[styles.skelLine, { width: '80%' }]} />
        </View>
      </SafeAreaView>
    );
  }

  // ── STATE 2 — NO DATA: clean empty scene. No chat affordance — if a
  // user has zero transactions, chat has nothing to ground responses in
  // and would either refuse or hallucinate. Better to deflect to action.
  if (txnCount === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Header isOnline={isOnline} />
        <View style={styles.scrollStub}>
          <AICoachStateView onAsk={() => { /* no-op in empty state — CTA is "Add first expense" */ }} />
        </View>
      </SafeAreaView>
    );
  }

  // ── STATE 3 — HAS DATA: the tab body IS the chat. Not a modal, not
  // a wrapper, not a drawer — the primary surface. One render path.
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Header isOnline={isOnline} />
      <View style={{ flex: 1 }}>
        <AICoachChat />
      </View>
    </SafeAreaView>
  );
}

function Header({ isOnline }: { isOnline: boolean }) {
  return (
    <>
      <View style={styles.header}>
        <Text style={styles.kicker}>AI COACH</Text>
        <GlowPill label={isOnline ? 'LIVE' : 'OFFLINE'} tone={isOnline ? 'danger' : 'neutral'} pulse={isOnline} />
      </View>
      {!isOnline && (
        <View style={styles.offlineBar} testID="ai-coach-offline">
          <Ionicons name="cloud-offline" size={16} color={BR_COLORS.ink} />
          <Text style={styles.offlineTxt}>Offline — replies use cached data.</Text>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BR_COLORS.paper },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: BR_SPACE.lg,
    paddingVertical: BR_SPACE.md,
  },
  kicker: { ...BR_TYPE.label, color: BR_COLORS.ink },
  offlineBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: BR_SPACE.sm,
    marginHorizontal: BR_SPACE.lg,
    marginBottom: BR_SPACE.sm,
    paddingHorizontal: BR_SPACE.md,
    paddingVertical: BR_SPACE.sm,
    backgroundColor: BR_COLORS.paperAlt,
    borderWidth: BR_BORDER.hair,
    borderColor: BR_COLORS.ink,
  },
  offlineTxt: { ...BR_TYPE.labelSm, color: BR_COLORS.ink },
  scrollStub: { flex: 1, paddingHorizontal: BR_SPACE.lg },
  skeletonWrap: {
    padding: BR_SPACE.lg,
    gap: BR_SPACE.md,
  },
  skelLine: {
    height: 14,
    width: '100%',
    backgroundColor: BR_COLORS.paperAlt,
    borderWidth: 1,
    borderColor: BR_COLORS.line,
  },
});

import { withTabBoundary as _wrapTab_AICoachTab } from '../../components/withTabBoundary';
export default _wrapTab_AICoachTab(AICoachTab, 'AI Coach');
