/**
 * TransactionFilterSheet — modern bottom-sheet filter for the Transactions tab.
 *
 * Sections (matches the Kiwi-style reference design):
 *   1. Month — horizontal chips (All / This month / Last 3 months / Last 6 months / This year)
 *   2. Source — multi-select chips (UPI / Credit Card / Debit Card / Cash / Wallet)
 *   3. Transaction Type — chips (All / Sent / Received)
 *   4. Status — chips (All / Success / Pending / Failed)
 *
 * Footer: "Clear All" (ghost) + "Apply Filter" (saffron gradient).
 */
import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { makeStyles } from '../../utils/makeStyles';
import { COLORS, GLASS } from '../../utils/theme';



// R113 FIX — useStyles hoisted above first render-time call
// to avoid Metro/SDK52 TDZ error (`Cannot access X before init.`).
const useStyles = makeStyles((c) => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#fff', borderTopLeftRadius: 0, borderTopRightRadius: 0, paddingBottom: 16, maxHeight: '88%' },
  grabber: { alignSelf: 'center', width: 44, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', marginTop: 10, marginBottom: 4 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  title: { flex: 1, fontSize: 18, fontWeight: '800', color: '#111' },
  closeBtn: { width: 32, height: 32, borderRadius: 0, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 12, fontWeight: '800', color: COLORS.text.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 0, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' },
  chipOn: { backgroundColor: '#FFF0E0', borderColor: COLORS.accent.brand },
  chipTxt: { fontSize: 13, color: COLORS.text.muted, fontWeight: '600' },
  chipTxtOn: { color: '#7C2D12', fontWeight: '800' },
  segRow: { flexDirection: 'row', gap: 8, backgroundColor: '#F3F4F6', padding: 4, borderRadius: 0 },
  segBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 0 },
  segBtnOn: { backgroundColor: COLORS.accent.brand },
  segTxt: { fontSize: 13, fontWeight: '700', color: COLORS.text.muted },
  segTxtOn: { color: '#fff' },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 0, borderWidth: 1, backgroundColor: '#fff' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusTxt: { fontSize: 13, color: '#374151', fontWeight: '600' },
  footer: { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  clearBtn: { paddingHorizontal: 22, paddingVertical: 14, borderRadius: 0, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  clearTxt: { fontSize: 14, fontWeight: '700', color: '#374151' },
  applyBtn: { paddingVertical: 14, borderRadius: 0, alignItems: 'center', justifyContent: 'center' },
  applyTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
}));

export interface TxnFilter {
  range: 'all' | 'this_month' | 'last_3m' | 'last_6m' | 'this_year';
  sources: string[]; // empty = all
  type: 'all' | 'debit' | 'credit';
  status: 'all' | 'success' | 'pending' | 'failed';
}

export const DEFAULT_FILTER: TxnFilter = {
  range: 'all', sources: [], type: 'all', status: 'all',
};

const RANGE_OPTS: { id: TxnFilter['range']; label: string }[] = [
  { id: 'all', label: 'All time' },
  { id: 'this_month', label: 'This month' },
  { id: 'last_3m', label: 'Last 3 months' },
  { id: 'last_6m', label: 'Last 6 months' },
  { id: 'this_year', label: 'This year' },
];

const SOURCE_OPTS = [
  { id: 'upi', label: 'UPI', icon: 'card-outline' },
  { id: 'credit_card', label: 'Credit Card', icon: 'card' },
  { id: 'debit_card', label: 'Debit Card', icon: 'card-outline' },
  { id: 'cash', label: 'Cash', icon: 'cash' },
  { id: 'wallet', label: 'Wallet', icon: 'wallet' },
  { id: 'bank', label: 'Bank Transfer', icon: 'business' },
  { id: 'gmail', label: 'Gmail auto-import', icon: 'mail' },
];

const TYPE_OPTS: { id: TxnFilter['type']; label: string; icon: string }[] = [
  { id: 'all', label: 'All', icon: 'swap-horizontal' },
  { id: 'debit', label: 'Sent', icon: 'arrow-up' },
  { id: 'credit', label: 'Received', icon: 'arrow-down' },
];

const STATUS_OPTS: { id: TxnFilter['status']; label: string; color: string }[] = [
  { id: 'all', label: 'All', color: COLORS.text.muted },
  { id: 'success', label: 'Success', color: COLORS.state.successAlt },
  { id: 'pending', label: 'Pending', color: COLORS.accent.secondary },
  { id: 'failed', label: 'Failed', color: COLORS.state.danger },
];

type Props = {
  visible: boolean;
  value: TxnFilter;
  onClose: () => void;
  onApply: (f: TxnFilter) => void;
};

export default function TransactionFilterSheet({ visible, value, onClose, onApply }: Props) {
  const s = useStyles();
  const [draft, setDraft] = React.useState<TxnFilter>(value);
  React.useEffect(() => { if (visible) setDraft(value); }, [visible, value]);

  const toggleSource = (id: string) => {
    setDraft(d => d.sources.includes(id)
      ? { ...d, sources: d.sources.filter(s => s !== id) }
      : { ...d, sources: [...d.sources, id] });
  };

  const clearAll = () => setDraft(DEFAULT_FILTER);
  const apply = () => { onApply(draft); onClose(); };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={s.sheet}>
        <View style={s.grabber} />
        <View style={s.header}>
          <Text style={s.title}>Filter transactions</Text>
          <TouchableOpacity onPress={onClose} style={s.closeBtn} testID="filter-close">
            <Ionicons name="close" size={22} color="#111" />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
          {/* By Month */}
          <Section title="By period">
            <View style={s.wrapRow}>
              {RANGE_OPTS.map(o => (
                <Chip key={o.id} label={o.label} active={draft.range === o.id} onPress={() => setDraft({ ...draft, range: o.id })} />
              ))}
            </View>
          </Section>

          {/* Source */}
          <Section title="Source">
            <View style={s.wrapRow}>
              {SOURCE_OPTS.map(o => (
                <Chip
                  key={o.id}
                  icon={o.icon as any}
                  label={o.label}
                  active={draft.sources.includes(o.id)}
                  onPress={() => toggleSource(o.id)}
                />
              ))}
            </View>
          </Section>

          {/* Type */}
          <Section title="Transaction type">
            <View style={s.segRow}>
              {TYPE_OPTS.map(o => (
                <TouchableOpacity
                  key={o.id}
                  style={[s.segBtn, draft.type === o.id && s.segBtnOn]}
                  onPress={() => setDraft({ ...draft, type: o.id })}
                  activeOpacity={0.85}
                >
                  <Ionicons name={o.icon as any} size={16} color={draft.type === o.id ? '#fff' : COLORS.text.muted} />
                  <Text style={[s.segTxt, draft.type === o.id && s.segTxtOn]}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Section>

          {/* Status */}
          <Section title="Status">
            <View style={s.wrapRow}>
              {STATUS_OPTS.map(o => (
                <TouchableOpacity
                  key={o.id}
                  style={[s.statusChip, { borderColor: o.color + '40' }, draft.status === o.id && { backgroundColor: o.color + '18', borderColor: o.color }]}
                  onPress={() => setDraft({ ...draft, status: o.id })}
                  activeOpacity={0.85}
                >
                  <View style={[s.statusDot, { backgroundColor: o.color }]} />
                  <Text style={[s.statusTxt, draft.status === o.id && { color: o.color, fontWeight: '800' }]}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Section>
        </ScrollView>

        {/* Footer */}
        <View style={s.footer}>
          <TouchableOpacity style={s.clearBtn} onPress={clearAll} testID="filter-clear">
            <Text style={s.clearTxt}>Clear all</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.85} onPress={apply} testID="filter-apply" style={{ flex: 1 }}>
            <View style={[s.applyBtn, { backgroundColor: '#0A0A0A' }]}>
              <Text style={s.applyTxt}>Apply filter</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const s = useStyles();
  return (
    <View style={{ paddingHorizontal: 16, marginTop: 18 }}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Chip({ label, active, onPress, icon }: { label: string; active?: boolean; onPress: () => void; icon?: any }) {
  const s = useStyles();
  return (
    <TouchableOpacity style={[s.chip, active && s.chipOn]} onPress={onPress} activeOpacity={0.8}>
      {icon && <Ionicons name={icon} size={14} color={active ? '#7C2D12' : COLORS.text.muted} />}
      <Text style={[s.chipTxt, active && s.chipTxtOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── helper exported for the parent screen ────────────────────────────
export function applyFilterToList<T extends { date: string | Date; type?: string; source?: string; status?: string; payment_method?: string }>(
  list: T[], f: TxnFilter
): T[] {
  if (!list || list.length === 0) return list;
  const now = new Date();
  const inRange = (d: Date): boolean => {
    if (f.range === 'all') return true;
    if (f.range === 'this_month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    if (f.range === 'this_year') return d.getFullYear() === now.getFullYear();
    const months = f.range === 'last_3m' ? 3 : f.range === 'last_6m' ? 6 : 1;
    const cutoff = new Date(now.getFullYear(), now.getMonth() - months, now.getDate());
    return d >= cutoff;
  };
  return list.filter(t => {
    const d = typeof t.date === 'string' ? new Date(t.date) : t.date;
    if (!inRange(d)) return false;
    if (f.type !== 'all' && t.type !== f.type) return false;
    if (f.sources.length > 0) {
      // Accept either `source` or `payment_method`; skip the check when the
      // transaction has no source tag (legacy/unlabelled) so the user still
      // sees them instead of an empty screen.
      const src = String(t.source || t.payment_method || '').toLowerCase();
      if (src && !f.sources.includes(src)) return false;
    }
    if (f.status !== 'all') {
      // Default-assume 'success' for legacy txns that don't carry a status.
      const st = String(t.status || 'success').toLowerCase();
      if (st !== f.status) return false;
    }
    return true;
  });
}

export function filterActiveCount(f: TxnFilter): number {
  let n = 0;
  if (f.range !== 'all') n++;
  if (f.type !== 'all') n++;
  if (f.status !== 'all') n++;
  n += f.sources.length;
  return n;
}

