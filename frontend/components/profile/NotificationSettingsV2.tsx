/**
 * NotificationSettingsV2 — Round 91 Surface 3B.
 *
 * UI for the new /api/notifications/preferences contract.
 *
 * Sections:
 *   • Master switch
 *   • 8 per-type toggles (DAILY_BRIEF · SALARY · OVERSPEND · GOAL · WEEKLY ·
 *     MONTH-END · DORMANCY · SPLIT)
 *   • Daily-brief time picker (HH:MM)
 *   • Quiet hours (start / end HH:MM)
 *   • "Send test" button → POST /notifications/test
 *
 * Brutalist visual: flat 2px borders, no shadows, orange accent only on
 * the test-send pill.
 */
import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, Pressable, Switch, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';

import api from '../../utils/api';
import { BR_COLORS, BR_SPACE, BR_BORDER, BR_TYPE } from '../../utils/brutalist';

interface Prefs {
  master:                boolean;
  daily_brief:           boolean;
  salary_detected:       boolean;
  overspend_alert:       boolean;
  goal_milestone:        boolean;
  weekly_wrap:           boolean;
  month_end_report:      boolean;
  dormancy_nudge:        boolean;
  split_reminder:        boolean;
}

interface QuietHours { start: string; end: string }

const TYPE_ROWS: Array<{ key: keyof Prefs; label: string; sub: string }> = [
  { key: 'daily_brief',       label: 'Daily brief',          sub: '7:30 AM · yesterday\'s spend' },
  { key: 'salary_detected',   label: 'Salary detected',      sub: 'When ≥ ₹10k credit hits' },
  { key: 'overspend_alert',   label: 'Overspend alert',      sub: '20% over a category cap' },
  { key: 'goal_milestone',    label: 'Goal milestones',      sub: '25 / 50 / 75 / 100%' },
  { key: 'weekly_wrap',       label: 'Weekly wrap',          sub: 'Sunday 7 PM' },
  { key: 'month_end_report',  label: 'Monthly report',       sub: '1st of every month, 9 AM' },
  { key: 'dormancy_nudge',    label: 'Comeback nudge',       sub: 'After 7 days away' },
  { key: 'split_reminder',    label: 'Split reminders',      sub: '48h after unsettled' },
];


export default function NotificationSettingsV2() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [qh, setQh] = useState<QuietHours>({ start: '22:00', end: '07:00' });
  const [briefTime, setBriefTime] = useState('07:30');
  const debounceRef = useRef<any>(null);

  // ─ load
  const load = useCallback(async () => {
    try {
      setLoading(true);
      const r = await api.get('/notifications/preferences');
      const p = r.data?.prefs || {};
      setPrefs({
        master:           p.master ?? true,
        daily_brief:      p.daily_brief ?? true,
        salary_detected:  p.salary_detected ?? true,
        overspend_alert:  p.overspend_alert ?? true,
        goal_milestone:   p.goal_milestone ?? true,
        weekly_wrap:      p.weekly_wrap ?? true,
        month_end_report: p.month_end_report ?? true,
        dormancy_nudge:   p.dormancy_nudge ?? true,
        split_reminder:   p.split_reminder ?? true,
      });
      setQh({
        start: r.data?.quiet_hours?.start ?? '22:00',
        end:   r.data?.quiet_hours?.end   ?? '07:00',
      });
      setBriefTime(r.data?.daily_brief_time || '07:30');
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Could not load preferences' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ─ optimistic save (debounced)
  const persist = useCallback((patch: Partial<Prefs> & {
    quiet_hours_start?: string; quiet_hours_end?: string; daily_brief_time?: string;
  }) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        setSaving(true);
        await api.patch('/notifications/preferences', patch);
      } catch (e: any) {
        Toast.show({ type: 'error', text1: 'Save failed', text2: e?.message || 'Try again' });
      } finally {
        setSaving(false);
      }
    }, 350);
  }, []);

  const togglePref = useCallback((k: keyof Prefs, v: boolean) => {
    setPrefs(p => p ? { ...p, [k]: v } : p);
    persist({ [k]: v } as Partial<Prefs>);
  }, [persist]);

  const onTest = useCallback(async (k: keyof Prefs) => {
    setTesting(k);
    try {
      await api.post('/notifications/test', { type: k });
      Toast.show({ type: 'success', text1: 'Test fired', text2: 'Check device tray.' });
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Test failed', text2: e?.message || 'Try again' });
    } finally {
      setTesting(null);
    }
  }, []);

  // ── time editors (text-prompt-based for simplicity; no picker dep) ──
  const editTime = useCallback((label: string, current: string, onConfirm: (next: string) => void) => {
    Alert.prompt(
      label,
      'HH:MM (24-hour)',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: (val?: string) => {
            const v = (val || '').trim();
            if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(v)) {
              Toast.show({ type: 'error', text1: 'Invalid time', text2: 'Use HH:MM (24h)' });
              return;
            }
            onConfirm(v);
          },
        },
      ],
      'plain-text',
      current,
    );
  }, []);

  if (loading || !prefs) {
    return (
      <View style={[styles.bg, styles.center]}>
        <ActivityIndicator size="large" color={BR_COLORS.ink} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.scroll}>
      {/* Master switch */}
      <View style={styles.headerCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.masterLabel}>NOTIFICATIONS</Text>
          <Text style={styles.masterSub} numberOfLines={2}>
            Master switch. Off = nothing fires (test sends still bypass).
          </Text>
        </View>
        <Switch
          testID="notif-master"
          value={!!prefs.master}
          onValueChange={(v) => togglePref('master', v)}
          trackColor={{ true: BR_COLORS.ink, false: BR_COLORS.line }}
          thumbColor="#fff"
        />
      </View>

      {/* 8 type toggles */}
      <SectionHeader title="Types" />
      <View style={styles.section}>
        {TYPE_ROWS.map((row, i) => {
          const enabled = !!prefs[row.key] && !!prefs.master;
          return (
            <View
              key={row.key}
              style={[styles.row, i !== TYPE_ROWS.length - 1 && styles.rowDivider]}
            >
              <View style={{ flex: 1, paddingRight: BR_SPACE.md }}>
                <Text style={[styles.rowLabel, !prefs.master && { color: BR_COLORS.quiet }]}>
                  {row.label}
                </Text>
                <Text style={styles.rowSub}>{row.sub}</Text>
              </View>
              <Pressable
                onPress={() => onTest(row.key)}
                disabled={!enabled || testing === row.key}
                style={({ pressed }) => [
                  styles.testPill,
                  (!enabled || testing === row.key) && { opacity: 0.4 },
                  pressed && enabled && { opacity: 0.85 },
                ]}
                testID={`notif-test-${row.key}`}
              >
                <Text style={styles.testTxt}>
                  {testing === row.key ? '…' : 'TEST'}
                </Text>
              </Pressable>
              <Switch
                testID={`notif-${row.key}`}
                value={!!prefs[row.key]}
                onValueChange={(v) => togglePref(row.key, v)}
                disabled={!prefs.master}
                trackColor={{ true: BR_COLORS.ink, false: BR_COLORS.line }}
                thumbColor="#fff"
              />
            </View>
          );
        })}
      </View>

      {/* Daily brief time */}
      <SectionHeader title="Schedule" />
      <View style={styles.section}>
        <Pressable
          style={[styles.row, styles.rowDivider]}
          onPress={() => editTime('Daily brief time', briefTime, (v) => {
            setBriefTime(v);
            persist({ daily_brief_time: v });
          })}
          testID="notif-brief-time"
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Daily brief at</Text>
            <Text style={styles.rowSub}>Local time. We use the device timezone.</Text>
          </View>
          <Text style={styles.timeTxt}>{briefTime}</Text>
          <Ionicons name="chevron-forward" size={14} color={BR_COLORS.ink} />
        </Pressable>

        <Pressable
          style={[styles.row, styles.rowDivider]}
          onPress={() => editTime('Quiet hours start', qh.start, (v) => {
            setQh(prev => ({ ...prev, start: v }));
            persist({ quiet_hours_start: v });
          })}
          testID="notif-qh-start"
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Quiet hours · start</Text>
            <Text style={styles.rowSub}>Time-based pushes are silenced.</Text>
          </View>
          <Text style={styles.timeTxt}>{qh.start}</Text>
          <Ionicons name="chevron-forward" size={14} color={BR_COLORS.ink} />
        </Pressable>

        <Pressable
          style={styles.row}
          onPress={() => editTime('Quiet hours end', qh.end, (v) => {
            setQh(prev => ({ ...prev, end: v }));
            persist({ quiet_hours_end: v });
          })}
          testID="notif-qh-end"
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Quiet hours · end</Text>
            <Text style={styles.rowSub}>Pushes resume after this.</Text>
          </View>
          <Text style={styles.timeTxt}>{qh.end}</Text>
          <Ionicons name="chevron-forward" size={14} color={BR_COLORS.ink} />
        </Pressable>
      </View>

      <Text style={styles.foot}>
        Event-based pushes (salary, overspend, goal milestones) ignore quiet
        hours. Settings save automatically.
      </Text>

      {saving && (
        <View style={styles.savingPill}>
          <ActivityIndicator size="small" color="#fff" />
          <Text style={styles.savingTxt}>SAVING</Text>
        </View>
      )}
    </ScrollView>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderTxt}>— {title.toUpperCase()}</Text>
      <View style={styles.sectionHeaderRule} />
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: BR_COLORS.paper },
  scroll: {
    paddingHorizontal: BR_SPACE.lg,
    paddingTop: BR_SPACE.md,
    paddingBottom: 60,
  },
  center: { alignItems: 'center', justifyContent: 'center' },

  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: BR_SPACE.md,
    paddingHorizontal: BR_SPACE.md,
    borderTopWidth: BR_BORDER.bold,
    borderBottomWidth: BR_BORDER.bold,
    borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.paper,
  },
  masterLabel: { fontSize: 14, fontWeight: '900', letterSpacing: 0.5, color: BR_COLORS.ink },
  masterSub: { ...BR_TYPE.meta, color: BR_COLORS.muted, marginTop: 2 },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: BR_SPACE.sm,
    marginTop: BR_SPACE.xl,
    marginBottom: BR_SPACE.md,
  },
  sectionHeaderTxt: {
    fontSize: 10, fontWeight: '800', letterSpacing: 2,
    color: BR_COLORS.muted,
  },
  sectionHeaderRule: {
    flex: 1,
    height: BR_BORDER.hair,
    backgroundColor: BR_COLORS.line,
  },

  section: {
    borderTopWidth: BR_BORDER.bold,
    borderBottomWidth: BR_BORDER.bold,
    borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.paper,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: BR_SPACE.sm,
    paddingVertical: 12,
    minHeight: 60,
  },
  rowDivider: {
    borderBottomWidth: BR_BORDER.hair,
    borderColor: BR_COLORS.line,
  },
  rowLabel: { ...BR_TYPE.body, color: BR_COLORS.ink, fontWeight: '700' },
  rowSub: { ...BR_TYPE.meta, color: BR_COLORS.muted, marginTop: 2 },

  testPill: {
    paddingHorizontal: 8, paddingVertical: 4,
    backgroundColor: BR_COLORS.accent,
    borderWidth: BR_BORDER.hair,
    borderColor: BR_COLORS.ink,
    marginRight: BR_SPACE.sm,
  },
  testTxt: { fontSize: 9, fontWeight: '900', letterSpacing: 1.4, color: '#fff' },

  timeTxt: {
    fontSize: 14, fontWeight: '700',
    color: BR_COLORS.ink,
    marginRight: 6,
  },

  foot: {
    ...BR_TYPE.meta,
    color: BR_COLORS.muted,
    marginTop: BR_SPACE.lg,
    lineHeight: 16,
  },

  savingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-end',
    marginTop: BR_SPACE.md,
    paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: BR_COLORS.ink,
  },
  savingTxt: {
    fontSize: 9, fontWeight: '900', letterSpacing: 1.4,
    color: '#fff',
  },
});
