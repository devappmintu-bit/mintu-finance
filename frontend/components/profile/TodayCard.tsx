/**
 * TodayCard — calm "Today" section with 2-3 tasks + single CTA.
 *
 * Design: minimal, monoline icons, no bright per-item backgrounds.
 * Uses current MintU palette (orange primary only for CTA).
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { makeStyles } from '../../utils/makeStyles';

export type TodayTask = {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  hint?: string;
  done?: boolean;
};

interface Props {
  tasks?: TodayTask[];
  onComplete: (taskId: string) => void;
  onCompleteAll: () => void;
}

const DEFAULT_TASKS: TodayTask[] = [
  { id: 'log-expense', icon: 'add-circle-outline', title: "Add today's expense", hint: 'Keeps streak alive' },
  { id: 'save-today', icon: 'wallet-outline', title: 'Save ₹100 today', hint: '+2 score' },
  { id: 'streak', icon: 'flame-outline', title: 'Maintain your streak' },
];

export default function TodayCard({ tasks = DEFAULT_TASKS, onComplete, onCompleteAll }: Props) {
  const s = useStyles();
  const remaining = tasks.filter(t => !t.done).length;

  const haptic = () => { if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {}); };

  return (
    <View style={s.card}>
      <View style={s.head}>
        <Text style={s.title}>Today</Text>
        <Text style={s.count}>{remaining}/{tasks.length}</Text>
      </View>

      <View>
        {tasks.map((task, idx) => (
          <TouchableOpacity
            key={task.id}
            style={[s.task, idx > 0 && s.taskDivider]}
            onPress={() => { haptic(); onComplete(task.id); }}
            activeOpacity={0.7}
          >
            <View style={[s.icon, task.done && s.iconDone]}>
              {task.done ? (
                <Ionicons name="checkmark" size={16} color="#fff" />
              ) : (
                <Ionicons name={task.icon} size={18} color={styles.iconColor} />
              )}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[s.taskTitle, task.done && s.taskDone]} numberOfLines={1}>{task.title}</Text>
              {task.hint ? <Text style={s.taskHint} numberOfLines={1}>{task.hint}</Text> : null}
            </View>
            <Ionicons name="chevron-forward" size={14} color={'#C4C4C4'} />
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={s.cta} onPress={() => { haptic(); onCompleteAll(); }} activeOpacity={0.88}>
        <Text style={s.ctaText}>Complete now</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = { iconColor: '#6B7280' };

const useStyles = makeStyles((c) => ({
  card: {
    backgroundColor: c.bg.secondary,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: c.border.subtle,
    marginBottom: 14,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  title: { fontSize: 15, fontWeight: '700', color: c.text.primary, letterSpacing: -0.2 },
  count: { fontSize: 12, fontWeight: '600', color: c.text.muted },

  task: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  taskDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border.subtle },
  icon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg.primary },
  iconDone: { backgroundColor: c.accent.primary },
  taskTitle: { fontSize: 13.5, fontWeight: '600', color: c.text.primary },
  taskDone: { textDecorationLine: 'line-through', color: c.text.muted },
  taskHint: { fontSize: 11, fontWeight: '500', color: c.text.muted, marginTop: 2 },

  cta: {
    backgroundColor: c.accent.primary,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  ctaText: { fontSize: 14, fontWeight: '700', color: '#fff', letterSpacing: -0.1 },
}));
