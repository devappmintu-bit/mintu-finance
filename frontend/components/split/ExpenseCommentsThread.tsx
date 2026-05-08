/**
 * ExpenseCommentsThread — R107.
 *
 * Inline expandable comment thread that lives DIRECTLY beneath an
 * expense row in the Split detail screen. Implements the
 * "contextual embedded communication" pillar of the 15-point Split
 * rebuild — group members can ask "why is this 1.5×?" or "I wasn't
 * there for the dessert" without leaving the receipt context.
 *
 * Design contract:
 *   • Pure brutalist primitives (BrutalCard cream + ink border)
 *   • Each comment = name stamp + 2-line monospaced text + relative
 *     time. Mine renders right-aligned on lime; theirs left-aligned
 *     on cream.
 *   • Composer is a single-line BrutalInput + send IconButton.
 *   • Failures surface via showBrutalToast — no silent swallow.
 *   • Lazy loaded — fires GET only when expanded the first time.
 *   • Pure leaf — no global state coupling, all data via props/api.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Pressable,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import api from '../../utils/api';
import {
  BR_COLORS,
  BR_BORDER,
  BR_RADIUS,
  BR_SHADOW,
  BR_SPACE,
  BR_FONT,
  PALETTE,
} from '../brutal';
import { showBrutalToast } from '../../store/brutalToastStore';

type Comment = {
  id: string;
  expense_id: string;
  user_id: string;
  user_name: string;
  text: string;
  created_at: string | null;
  is_mine: boolean;
};

type Props = {
  expenseId: string;
  /** Initial seed count (e.g. from list endpoint) so the chip badge
   *  reads correctly before the GET resolves. Optional. */
  seedCount?: number;
  /** Render mode — 'inline' renders the thread under a row directly,
   *  'compact' just renders the chip. Default 'inline'. */
  mode?: 'inline' | 'compact';
  /** Called whenever count changes so the parent can refresh badges. */
  onCountChange?: (count: number) => void;
};

function relativeTime(iso?: string | null): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Math.max(0, Date.now() - t);
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export default function ExpenseCommentsThread({
  expenseId,
  seedCount = 0,
  mode = 'inline',
  onCountChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<Comment[]>([]);
  const [count, setCount] = useState<number>(seedCount);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<TextInput>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const r = await api.get(`/split/expenses/${expenseId}/comments`);
      const list: Comment[] = Array.isArray(r?.data?.comments) ? r.data.comments : [];
      setItems(list);
      setCount(list.length);
      onCountChange?.(list.length);
      setLoaded(true);
    } catch (e: any) {
      showBrutalToast(e?.response?.data?.detail || 'Could not load comments', 'danger');
    } finally {
      setBusy(false);
    }
  }, [expenseId, onCountChange]);

  useEffect(() => {
    if (open && !loaded) {
      load();
    }
  }, [open, loaded, load]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || busy) return;
    // Optimistic — render immediately so the UI feels alive.
    const optimistic: Comment = {
      id: `tmp-${Date.now()}`,
      expense_id: expenseId,
      user_id: 'me',
      user_name: 'You',
      text,
      created_at: new Date().toISOString(),
      is_mine: true,
    };
    setItems((prev) => [...prev, optimistic]);
    setDraft('');
    const newCount = count + 1;
    setCount(newCount);
    onCountChange?.(newCount);
    try {
      const r = await api.post(`/split/expenses/${expenseId}/comments`, { text });
      // Replace optimistic with real
      setItems((prev) =>
        prev.map((c) => (c.id === optimistic.id ? { ...optimistic, ...r.data, id: r.data.id || c.id } : c)),
      );
    } catch (e: any) {
      // Rollback
      setItems((prev) => prev.filter((c) => c.id !== optimistic.id));
      const next = Math.max(0, count);
      setCount(next);
      onCountChange?.(next);
      showBrutalToast(e?.response?.data?.detail || 'Send failed', 'danger');
    }
  }, [busy, count, draft, expenseId, onCountChange]);

  const remove = useCallback(
    async (id: string) => {
      const prev = items;
      setItems((p) => p.filter((c) => c.id !== id));
      const next = Math.max(0, count - 1);
      setCount(next);
      onCountChange?.(next);
      try {
        await api.delete(`/split/expenses/${expenseId}/comments/${id}`);
      } catch (_e) {
        setItems(prev);
        setCount(count);
        onCountChange?.(count);
        showBrutalToast('Delete failed', 'danger');
      }
    },
    [count, expenseId, items, onCountChange],
  );

  // ─── Compact chip surface (used inline next to expense row) ───
  const Chip = (
    <Pressable
      onPress={() => setOpen((v) => !v)}
      hitSlop={6}
      style={({ pressed }) => [
        styles.chip,
        count > 0 && styles.chipActive,
        pressed && { opacity: 0.7 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${count} comments`}
    >
      <Ionicons
        name={count > 0 ? 'chatbubble' : 'chatbubble-outline'}
        size={12}
        color={count > 0 ? '#fff' : BR_COLORS.ink}
      />
      <Text style={[styles.chipText, count > 0 && { color: '#fff' }]}>
        {count > 0 ? count : 'Discuss'}
      </Text>
    </Pressable>
  );

  if (mode === 'compact') return Chip;

  return (
    <View style={styles.wrap}>
      {Chip}
      {open && (
        <View style={styles.thread}>
          {busy && items.length === 0 && (
            <View style={styles.center}>
              <ActivityIndicator size="small" color={BR_COLORS.ink} />
            </View>
          )}
          {!busy && items.length === 0 && (
            <Text style={styles.empty}>
              No comments yet. Drop a note for the group.
            </Text>
          )}
          {items.map((c) => (
            <View
              key={c.id}
              style={[styles.bubbleRow, c.is_mine && styles.bubbleRowMine]}
            >
              <View
                style={[
                  styles.bubble,
                  c.is_mine ? styles.bubbleMine : styles.bubbleOther,
                ]}
              >
                <View style={styles.bubbleHead}>
                  <Text style={styles.bubbleAuthor}>
                    {c.is_mine ? 'YOU' : (c.user_name || 'MEMBER').toUpperCase()}
                  </Text>
                  <Text style={styles.bubbleTime}>{relativeTime(c.created_at)}</Text>
                </View>
                <Text style={styles.bubbleText} selectable>
                  {c.text}
                </Text>
                {c.is_mine && c.id && !c.id.startsWith('tmp-') && (
                  <Pressable
                    onPress={() => remove(c.id)}
                    style={styles.deleteBtn}
                    hitSlop={6}
                    accessibilityLabel="Delete comment"
                  >
                    <Ionicons name="close" size={11} color={BR_COLORS.ink} />
                  </Pressable>
                )}
              </View>
            </View>
          ))}
          <View style={styles.composer}>
            <TextInput
              ref={inputRef}
              testID="expense-comment-input"
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="Drop a note…"
              placeholderTextColor={BR_COLORS.textFaint}
              maxLength={600}
              onSubmitEditing={send}
              returnKeyType="send"
              blurOnSubmit
            />
            <TouchableOpacity
              testID="expense-comment-send"
              onPress={send}
              activeOpacity={0.85}
              style={[styles.sendBtn, !draft.trim() && styles.sendBtnOff]}
              disabled={!draft.trim()}
            >
              <Ionicons name="arrow-up" size={16} color={BR_COLORS.ink} />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: BR_SPACE['2'] },

  /* Chip */
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: BR_BORDER.fine,
    borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.card,
  },
  chipActive: {
    backgroundColor: BR_COLORS.ink,
  },
  chipText: {
    ...BR_FONT.stamp,
    color: BR_COLORS.ink,
    fontSize: 9,
  },

  /* Thread */
  thread: {
    marginTop: BR_SPACE['2'],
    padding: BR_SPACE['3'],
    borderWidth: BR_BORDER.base,
    borderColor: BR_COLORS.ink,
    borderRadius: BR_RADIUS.sm,
    backgroundColor: BR_COLORS.bgWarm,
    ...(BR_SHADOW.xs as any),
  },
  center: { paddingVertical: BR_SPACE['4'], alignItems: 'center' },
  empty: {
    ...BR_FONT.caption,
    color: BR_COLORS.textMuted,
    fontSize: 11,
    paddingVertical: BR_SPACE['2'],
  },

  /* Bubble */
  bubbleRow: {
    flexDirection: 'row',
    marginBottom: BR_SPACE['2'],
  },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '85%',
    padding: BR_SPACE['2'],
    paddingHorizontal: BR_SPACE['3'],
    borderWidth: BR_BORDER.fine,
    borderColor: BR_COLORS.ink,
  },
  bubbleOther: { backgroundColor: BR_COLORS.card },
  bubbleMine: { backgroundColor: PALETTE.lime, paddingRight: BR_SPACE['5'] },
  bubbleHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 2,
  },
  bubbleAuthor: {
    ...BR_FONT.stamp,
    fontSize: 9,
    color: BR_COLORS.ink,
  },
  bubbleTime: {
    ...BR_FONT.caption,
    fontSize: 9,
    color: BR_COLORS.textMuted,
  },
  bubbleText: {
    ...BR_FONT.body,
    color: BR_COLORS.text,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace' }),
  },
  deleteBtn: {
    position: 'absolute',
    top: 2,
    right: 2,
    padding: 2,
  },

  /* Composer */
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: BR_SPACE['2'],
    backgroundColor: BR_COLORS.card,
    borderWidth: BR_BORDER.fine,
    borderColor: BR_COLORS.ink,
    paddingLeft: BR_SPACE['2'],
  },
  input: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    fontSize: 13,
    color: BR_COLORS.text,
  },
  sendBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PALETTE.brand,
    borderLeftWidth: BR_BORDER.fine,
    borderColor: BR_COLORS.ink,
  },
  sendBtnOff: {
    backgroundColor: BR_COLORS.bgWarm,
    opacity: 0.6,
  },
});
