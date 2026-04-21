/**
 * PaymentMethodsV2 — single source of truth for UPI / Card / Netbanking / Wallet.
 *
 * Used app-wide: Split settlements, Premium purchases, one-tap checkouts.
 *
 * Features:
 *   • List saved methods with default-flag + last-used timestamp
 *   • Add new method (bottom sheet modal): UPI / card (last4+brand) / netbanking / wallet
 *   • Set-default tap → immediately syncs to backend
 *   • Swipe-to-delete (Alert-confirm) → removes from backend
 *   • Collapsed by default; tap header to expand
 *
 * Backend: /api/user/payment-methods (GET/POST/PUT/DELETE)
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, TextInput,
  ActivityIndicator, Alert, Platform, KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import api from '../../utils/api';
import useFocusRefresh from '../../hooks/useFocusRefresh';
import { shadowStyle } from '../../utils/theme';
import { useAppColors } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';

type Method = {
  id: string;
  type: 'upi' | 'card' | 'netbanking' | 'wallet';
  label?: string;
  upi_id?: string;
  card_last4?: string;
  card_brand?: string;
  bank_name?: string;
  wallet_name?: string;
  is_default?: boolean;
  virtual?: boolean;
  created_at?: string;
};

const TYPE_META: Record<Method['type'], { icon: string; color: string; label: string }> = {
  upi:        { icon: 'flash',     color: '#F56E1E', label: 'UPI' },
  card:       { icon: 'card',      color: '#0F766E', label: 'Card' },
  netbanking: { icon: 'business',  color: '#4338CA', label: 'Netbanking' },
  wallet:     { icon: 'wallet',    color: '#EA580C', label: 'Wallet' },
};

const BANKS = ['HDFC', 'SBI', 'ICICI', 'Axis', 'Kotak', 'PNB', 'BOB', 'Canara', 'Yes', 'IDFC'];
const WALLETS = ['Paytm', 'Mobikwik', 'AmazonPay', 'PhonePe', 'FreeCharge'];
const CARD_BRANDS = ['Visa', 'Mastercard', 'RuPay', 'Amex'];

export default function PaymentMethodsV2() {
  const s = useSStyles();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [methods, setMethods] = useState<Method[]>([]);
  const [addVisible, setAddVisible] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/user/payment-methods');
      setMethods(r.data?.methods || []);
    } catch { /* noop */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useFocusRefresh(load);

  const defaultMethod = useMemo(() => methods.find(m => m.is_default), [methods]);

  const setDefault = async (id: string) => {
    try {
      await api.put(`/user/payment-methods/${id}/default`);
      Toast.show({ type: 'success', text1: 'Default updated' });
      load();
    } catch { Toast.show({ type: 'error', text1: 'Couldn\'t update default' }); }
  };

  const remove = (m: Method) => {
    const go = async () => {
      try { await api.delete(`/user/payment-methods/${m.id}`); Toast.show({ type: 'success', text1: 'Removed' }); load(); }
      catch { Toast.show({ type: 'error', text1: 'Couldn\'t remove' }); }
    };
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (typeof window !== 'undefined' && window.confirm(`Remove ${m.label}?`)) go();
      return;
    }
    Alert.alert('Remove payment method?', `${m.label} will be removed from this account.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: go },
    ]);
  };

  const summary = methods.length === 0
    ? 'Add UPI, card or netbanking for one-tap pay'
    : `${methods.length} method${methods.length > 1 ? 's' : ''}${defaultMethod ? ` · default ${defaultMethod.label}` : ''}`;

  return (
    <View style={s.card}>
      <TouchableOpacity style={s.header} onPress={() => setExpanded(!expanded)} activeOpacity={0.75} testID="payment-methods-header">
        <View style={s.iconBox}><Ionicons name="card" size={20} color={COLORS.accent.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Payment Methods</Text>
          <Text style={s.sub} numberOfLines={1}>{summary}</Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.text.muted} />
      </TouchableOpacity>

      {expanded && (
        <View style={s.body}>
          {loading ? (
            <ActivityIndicator color={COLORS.accent.primary} />
          ) : methods.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="card-outline" size={36} color={COLORS.text.muted} />
              <Text style={s.emptyT}>No payment methods yet</Text>
              <Text style={s.emptyS}>Add one to pay friends from Split, unlock Premium, or redeem coins instantly.</Text>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {methods.map((m) => {
                const meta = TYPE_META[m.type] || TYPE_META.upi;
                return (
                  <View key={m.id} style={[s.row, m.is_default && s.rowDefault]}>
                    <View style={[s.rowIcon, { backgroundColor: meta.color + '1E' }]}>
                      <Ionicons name={meta.icon as any} size={18} color={meta.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.rowLabel} numberOfLines={1}>{m.label || meta.label}</Text>
                      <Text style={s.rowSub} numberOfLines={1}>{describe(m)}</Text>
                    </View>
                    {m.is_default ? (
                      <View style={s.defaultPill}>
                        <Ionicons name="checkmark-circle" size={11} color="#fff" />
                        <Text style={s.defaultPillT}>Default</Text>
                      </View>
                    ) : (
                      <TouchableOpacity style={s.setDefaultBtn} onPress={() => setDefault(m.id)} testID={`pm-default-${m.id}`}>
                        <Text style={s.setDefaultT}>Set default</Text>
                      </TouchableOpacity>
                    )}
                    {!m.virtual && (
                      <TouchableOpacity onPress={() => remove(m)} style={s.delBtn} testID={`pm-delete-${m.id}`}>
                        <Ionicons name="trash-outline" size={15} color={COLORS.state.danger} />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          <TouchableOpacity style={s.addBtn} onPress={() => setAddVisible(true)} activeOpacity={0.85} testID="pm-add-btn">
            <Ionicons name="add-circle" size={18} color="#fff" />
            <Text style={s.addBtnT}>Add payment method</Text>
          </TouchableOpacity>
        </View>
      )}

      <AddMethodModal
        visible={addVisible}
        onClose={() => setAddVisible(false)}
        onSaved={() => { setAddVisible(false); load(); }}
      />
    </View>
  );
}

function describe(m: Method): string {
  if (m.type === 'upi')        return m.upi_id ? maskUpi(m.upi_id) : 'UPI';
  if (m.type === 'card')       return `${(m.card_brand || 'Card')} ···· ${m.card_last4 || ''}`;
  if (m.type === 'netbanking') return `${m.bank_name || 'Bank'} Netbanking`;
  if (m.type === 'wallet')     return m.wallet_name || 'Wallet';
  return '';
}

function maskUpi(upi: string): string {
  const [name, bank] = upi.split('@');
  if (!name || !bank) return upi;
  if (name.length <= 3) return upi;
  return `${name.slice(0, 2)}***${name.slice(-1)}@${bank}`;
}

// ══════════════════════════════════════════════════════════════════
// Add-method modal
// ══════════════════════════════════════════════════════════════════
function AddMethodModal({ visible, onClose, onSaved }: { visible: boolean; onClose: () => void; onSaved: () => void }) {
  const m = useMStyles();
  const [type, setType] = useState<Method['type']>('upi');
  const [upiId, setUpiId] = useState('');
  const [cardLast4, setCardLast4] = useState('');
  const [cardBrand, setCardBrand] = useState('Visa');
  const [bankName, setBankName] = useState('HDFC');
  const [walletName, setWalletName] = useState('Paytm');
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setType('upi'); setUpiId(''); setCardLast4(''); setCardBrand('Visa');
    setBankName('HDFC'); setWalletName('Paytm'); setIsDefault(false);
  };

  const save = async () => {
    const body: any = { type, is_default: isDefault };
    if (type === 'upi') {
      if (!upiId.includes('@')) { Toast.show({ type: 'error', text1: 'Enter valid UPI (name@bank)' }); return; }
      body.upi_id = upiId.trim();
    } else if (type === 'card') {
      if (!/^\d{4}$/.test(cardLast4)) { Toast.show({ type: 'error', text1: 'Enter last 4 digits' }); return; }
      body.card_last4 = cardLast4;
      body.card_brand = cardBrand.toLowerCase();
    } else if (type === 'netbanking') {
      body.bank_name = bankName;
    } else {
      body.wallet_name = walletName;
    }
    setSaving(true);
    try {
      await api.post('/user/payment-methods', body);
      Toast.show({ type: 'success', text1: 'Payment method added' });
      reset();
      onSaved();
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.response?.data?.detail || 'Couldn\'t save' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={m.backdrop}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
          <View style={m.sheet}>
            <View style={m.grip} />
            <Text style={m.title}>Add payment method</Text>

            {/* Type chips */}
            <View style={m.typeRow}>
              {(['upi','card','netbanking','wallet'] as Method['type'][]).map((t) => {
                const meta = TYPE_META[t];
                const on = t === type;
                return (
                  <TouchableOpacity key={t} style={[m.typeChip, on && m.typeChipOn]} onPress={() => setType(t)} activeOpacity={0.85} testID={`pm-type-${t}`}>
                    <Ionicons name={meta.icon as any} size={15} color={on ? '#fff' : meta.color} />
                    <Text style={[m.typeChipT, on && m.typeChipTOn]}>{meta.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Type-specific fields */}
            {type === 'upi' && (
              <View style={m.field}>
                <Text style={m.label}>UPI ID</Text>
                <TextInput
                  value={upiId}
                  onChangeText={setUpiId}
                  placeholder="yourname@oksbi"
                  placeholderTextColor={COLORS.text.muted}
                  autoCapitalize="none"
                  style={m.input}
                  testID="pm-upi-input"
                />
              </View>
            )}
            {type === 'card' && (
              <View style={m.rowWrap}>
                <View style={[m.field, { flex: 1 }]}>
                  <Text style={m.label}>Last 4 digits</Text>
                  <TextInput
                    value={cardLast4}
                    onChangeText={(v) => setCardLast4(v.replace(/\D/g, '').slice(0, 4))}
                    placeholder="1234"
                    placeholderTextColor={COLORS.text.muted}
                    keyboardType="numeric"
                    style={m.input}
                    maxLength={4}
                    testID="pm-card-last4"
                  />
                </View>
                <View style={[m.field, { width: 130 }]}>
                  <Text style={m.label}>Brand</Text>
                  <View style={m.chipRow}>
                    {CARD_BRANDS.map(b => (
                      <TouchableOpacity key={b} style={[m.miniChip, cardBrand === b && m.miniChipOn]} onPress={() => setCardBrand(b)}>
                        <Text style={[m.miniChipT, cardBrand === b && m.miniChipTOn]}>{b}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            )}
            {type === 'netbanking' && (
              <View style={m.field}>
                <Text style={m.label}>Bank</Text>
                <View style={m.chipRow}>
                  {BANKS.map(b => (
                    <TouchableOpacity key={b} style={[m.miniChip, bankName === b && m.miniChipOn]} onPress={() => setBankName(b)}>
                      <Text style={[m.miniChipT, bankName === b && m.miniChipTOn]}>{b}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
            {type === 'wallet' && (
              <View style={m.field}>
                <Text style={m.label}>Wallet</Text>
                <View style={m.chipRow}>
                  {WALLETS.map(w => (
                    <TouchableOpacity key={w} style={[m.miniChip, walletName === w && m.miniChipOn]} onPress={() => setWalletName(w)}>
                      <Text style={[m.miniChipT, walletName === w && m.miniChipTOn]}>{w}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            <TouchableOpacity style={m.defaultRow} onPress={() => setIsDefault(!isDefault)} activeOpacity={0.8}>
              <View style={[m.cbox, isDefault && m.cboxOn]}>
                {isDefault && <Ionicons name="checkmark" size={13} color="#fff" />}
              </View>
              <Text style={m.defaultT}>Set as default payment method</Text>
            </TouchableOpacity>

            <View style={m.actions}>
              <TouchableOpacity style={[m.btn, m.btnGhost]} onPress={onClose} activeOpacity={0.85}>
                <Text style={[m.btnT, { color: COLORS.text.secondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[m.btn, m.btnPrimary]} onPress={save} disabled={saving} activeOpacity={0.85} testID="pm-save-btn">
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={[m.btnT, { color: '#fff' }]}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const useSStyles = makeStyles((c) => ({
  card: { backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 20, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(238,221,204,0.6)', ...shadowStyle('#2E1F1A', 2, 10, 0.04, 2) },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  iconBox: { width: 40, height: 40, borderRadius: 12, backgroundColor: c.accent.primary + '15', justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '800', color: c.text.primary },
  sub: { fontSize: 12, color: c.text.muted, marginTop: 2 },
  body: { marginTop: 14, gap: 10 },
  empty: { alignItems: 'center', paddingVertical: 16 },
  emptyT: { fontSize: 13, fontWeight: '800', color: c.text.primary, marginTop: 8 },
  emptyS: { fontSize: 11.5, color: c.text.secondary, textAlign: 'center', marginTop: 4, lineHeight: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, backgroundColor: c.bg.primary, borderWidth: 1, borderColor: c.border.subtle },
  rowDefault: { borderColor: c.accent.primary + '60', backgroundColor: '#FFF7ED' },
  rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 13.5, fontWeight: '800', color: c.text.primary },
  rowSub: { fontSize: 11, color: c.text.muted, marginTop: 2 },
  defaultPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: c.accent.primary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  defaultPillT: { fontSize: 10, fontWeight: '900', color: '#fff' },
  setDefaultBtn: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: c.accent.primary + '15' },
  setDefaultT: { fontSize: 10.5, fontWeight: '800', color: c.accent.primary },
  delBtn: { padding: 6 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: c.accent.primary, paddingVertical: 12, borderRadius: 12, marginTop: 6 },
  addBtnT: { color: '#fff', fontWeight: '800', fontSize: 13, letterSpacing: 0.2 },
}));

const useMStyles = makeStyles((c) => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: c.bg.secondary, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 28 },
  grip: { width: 40, height: 4, borderRadius: 2, backgroundColor: c.border.subtle, alignSelf: 'center', marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '900', color: c.text.primary, marginBottom: 12 },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  typeChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 10, backgroundColor: c.bg.primary, borderWidth: 1, borderColor: c.border.subtle },
  typeChipOn: { backgroundColor: c.accent.primary, borderColor: c.accent.primary },
  typeChipT: { fontSize: 12, fontWeight: '800', color: c.text.primary },
  typeChipTOn: { color: '#fff' },
  rowWrap: { flexDirection: 'row', gap: 10 },
  field: { marginBottom: 12 },
  label: { fontSize: 11, fontWeight: '800', color: c.text.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 },
  input: { backgroundColor: c.bg.primary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, color: c.text.primary, borderWidth: 1, borderColor: c.border.subtle },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  miniChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: c.bg.primary, borderWidth: 1, borderColor: c.border.subtle },
  miniChipOn: { backgroundColor: c.accent.primary, borderColor: c.accent.primary },
  miniChipT: { fontSize: 11, fontWeight: '800', color: c.text.secondary },
  miniChipTOn: { color: '#fff' },
  defaultRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  cbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: c.border.subtle, alignItems: 'center', justifyContent: 'center' },
  cboxOn: { backgroundColor: c.accent.primary, borderColor: c.accent.primary },
  defaultT: { fontSize: 12.5, color: c.text.primary, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  btnGhost: { backgroundColor: c.bg.primary, borderWidth: 1, borderColor: c.border.subtle },
  btnPrimary: { backgroundColor: c.accent.primary },
  btnT: { fontSize: 14, fontWeight: '800' },
}));
