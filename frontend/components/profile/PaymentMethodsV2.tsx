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
import { shadowStyle, COLORS, GLASS } from '../../utils/theme';
import { useAppColors } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';
import { showError, showSuccess as toastSuccess } from '../../utils/toast';

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
  health?: {
    status: 'healthy' | 'stale' | 'unused' | 'error';
    tone: 'success' | 'warning' | 'danger' | 'neutral';
    label: string;
    last_used_at?: string | null;
    last_sync_at?: string | null;
    action?: 'verify' | 'retry' | null;
    action_label?: string | null;
  };
};

// Color map for status tone — uses canonical theme state palette
const TONE_COLOR: Record<NonNullable<Method['health']>['tone'], { fg: string; bg: string; border: string }> = {
  success: { fg: COLORS.state.successAlt, bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.35)' },
  warning: { fg: '#D97706', bg: 'rgba(245,158,11,0.14)', border: 'rgba(245,158,11,0.4)' },
  danger:  { fg: COLORS.state.danger, bg: 'rgba(220,38,38,0.12)', border: 'rgba(220,38,38,0.4)' },
  neutral: { fg: COLORS.text.muted, bg: 'rgba(107,114,128,0.12)', border: 'rgba(107,114,128,0.35)' },
};

const TYPE_META: Record<Method['type'], { icon: string; color: string; label: string }> = {
  upi:        { icon: 'flash',     color: COLORS.accent.brand, label: 'UPI' },
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
      toastSuccess('Default updated');
      load();
    } catch { Toast.show({ type: 'error', text1: 'Couldn\'t update default' }); }
  };

  const [verifying, setVerifying] = useState<string | null>(null);
  const verifyMethod = async (m: Method) => {
    if (verifying) return;
    setVerifying(m.id);
    try {
      await api.post(`/user/payment-methods/${m.id}/verify`);
      Toast.show({ type: 'success', text1: '✓ Verified', text2: `${m.label || 'Method'} is healthy` });
      await load();
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Could not verify', text2: e?.response?.data?.detail || 'Try again' });
    } finally {
      setVerifying(null);
    }
  };

  const remove = (m: Method) => {
    const go = async () => {
      try { await api.delete(`/user/payment-methods/${m.id}`); toastSuccess('Removed'); load(); }
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
            /* CRED-style smart empty (v9 master §Payments) — brutalist dashed
               call-to-action tile with concrete unlock copy, followed by an
               inline trust strip. */
            <View>
              <View style={{
                borderWidth: 2, borderStyle: 'dashed', borderColor: '#0A0A0A',
                padding: 20, alignItems: 'flex-start', backgroundColor: '#FFFBEE',
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{
                    width: 36, height: 36,
                    borderWidth: 2, borderColor: '#0A0A0A',
                    backgroundColor: '#F56E1E',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Ionicons name="flash" size={18} color="#fff" />
                  </View>
                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '900', color: '#0A0A0A' }}>
                      No payment method yet
                    </Text>
                    <Text style={{ fontSize: 12, color: '#1F1F1F', marginTop: 2 }}>
                      Add UPI to unlock instant payments, Split balances & Pro checkout.
                    </Text>
                  </View>
                </View>
              </View>
              {/* Inline trust strip — light, not loud */}
              <Text style={{
                marginTop: 10, fontSize: 10, fontWeight: '600',
                letterSpacing: 0.8, color: '#6B6B6B', textAlign: 'center',
              }}>
                ✓ RBI-aligned · ✓ 256-bit encrypted · ✓ Data in India
              </Text>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {methods.map((m) => {
                const meta = TYPE_META[m.type] || TYPE_META.upi;
                const health = m.health;
                const tone = health ? TONE_COLOR[health.tone] : null;
                const isVerifying = verifying === m.id;
                return (
                  <View key={m.id} style={[s.row, m.is_default && s.rowDefault]}>
                    <View style={s.rowMain}>
                      <View style={[s.rowIcon, { backgroundColor: meta.color + '1E' }]}>
                        <Ionicons name={meta.icon as any} size={18} color={meta.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.rowLabel} numberOfLines={1}>{m.label || meta.label}</Text>
                        <Text style={s.rowSub} numberOfLines={1}>{describe(m)}</Text>
                      </View>
                      {m.is_default ? (
                        <View style={s.defaultPill}>
                          <Ionicons name="checkmark-circle" size={11} color="#FFFFFF" />
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

                    {/* Smart Status row — Round 26 */}
                    {health && tone && (
                      <View style={s.healthRow}>
                        <View style={[s.healthChip, { backgroundColor: tone.bg, borderColor: tone.border }]}>
                          <View style={[s.healthDot, { backgroundColor: tone.fg }]} />
                          <Text style={[s.healthLabel, { color: tone.fg }]} numberOfLines={1}>{health.label}</Text>
                        </View>
                        {health.action && health.action_label && (
                          <TouchableOpacity
                            style={[s.healthCta, health.action === 'retry' && s.healthCtaDanger]}
                            onPress={() => verifyMethod(m)}
                            disabled={isVerifying}
                            activeOpacity={0.8}
                            testID={`pm-verify-${m.id}`}
                          >
                            {isVerifying ? (
                              <ActivityIndicator size="small" color={health.action === 'retry' ? '#FFFFFF' : COLORS.accent.primary} />
                            ) : (
                              <>
                                <Ionicons
                                  name={health.action === 'retry' ? 'alert-circle' : 'shield-checkmark'}
                                  size={12}
                                  color={health.action === 'retry' ? '#FFFFFF' : COLORS.accent.primary}
                                />
                                <Text style={[s.healthCtaT, health.action === 'retry' && { color: '#FFFFFF' }]}>
                                  {health.action_label}
                                </Text>
                              </>
                            )}
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          <TouchableOpacity style={s.addBtn} onPress={() => setAddVisible(true)} activeOpacity={0.85} testID="pm-add-btn">
            <Ionicons name="add-circle" size={18} color="#FFFFFF" />
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
  const c = useAppColors();
  const [type, setType] = useState<Method['type']>('upi');
  const [upiId, setUpiId] = useState('');
  const [cardLast4, setCardLast4] = useState('');
  const [cardBrand, setCardBrand] = useState('Visa');
  const [bankName, setBankName] = useState('HDFC');
  const [walletName, setWalletName] = useState('Paytm');
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Live UPI validation: returns status for inline feedback
  const upiStatus = React.useMemo(() => {
    if (!upiId) return 'idle' as const;
    const v = upiId.trim();
    // Accept name@bank pattern (e.g., user@okhdfcbank, user@ybl, user@paytm)
    if (!/^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/.test(v)) return 'invalid' as const;
    return 'valid' as const;
  }, [upiId]);

  const reset = () => {
    setType('upi'); setUpiId(''); setCardLast4(''); setCardBrand('Visa');
    setBankName('HDFC'); setWalletName('Paytm'); setIsDefault(false);
    setShowSuccess(false);
  };

  const save = async () => {
    const body: any = { type, is_default: isDefault };
    if (type === 'upi') {
      if (upiStatus !== 'valid') { showError('Enter valid UPI (name@bank)'); return; }
      body.upi_id = upiId.trim();
    } else if (type === 'card') {
      if (!/^\d{4}$/.test(cardLast4)) { showError('Enter last 4 digits'); return; }
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
      // Phase 2 — Show inline success animation, then close
      setShowSuccess(true);
      setTimeout(() => {
        toastSuccess('Payment method added · Secured');
        reset();
        onSaved();
      }, 900);
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.response?.data?.detail || 'Couldn\'t save' });
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
            <Text style={m.subtitle}>Saved securely on MintU · used only with your consent</Text>

            {/* Phase 2 — RBI / encryption trust badges */}
            <View style={m.trustRow}>
              <View style={m.trustBadge}>
                <Ionicons name="shield-checkmark" size={12} color={c.state.success} />
                <Text style={m.trustTxt}>RBI-aligned</Text>
              </View>
              <View style={m.trustBadge}>
                <Ionicons name="lock-closed" size={12} color={c.state.success} />
                <Text style={m.trustTxt}>256-bit encrypted</Text>
              </View>
              <View style={m.trustBadge}>
                <Ionicons name="eye-off" size={12} color={c.state.success} />
                <Text style={m.trustTxt}>Never shared</Text>
              </View>
            </View>

            {/* Type chips */}
            <View style={m.typeRow}>
              {(['upi','card','netbanking','wallet'] as Method['type'][]).map((t) => {
                const meta = TYPE_META[t];
                const on = t === type;
                return (
                  <TouchableOpacity key={t} style={[m.typeChip, on && m.typeChipOn]} onPress={() => setType(t)} activeOpacity={0.85} testID={`pm-type-${t}`}>
                    <Ionicons name={meta.icon as any} size={15} color={on ? '#FFFFFF' : meta.color} />
                    <Text style={[m.typeChipT, on && m.typeChipTOn]}>{meta.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Type-specific fields */}
            {type === 'upi' && (
              <View style={m.field}>
                <Text style={m.label}>UPI ID</Text>
                <View style={[m.inputWrap, upiStatus === 'valid' && m.inputWrapValid, upiStatus === 'invalid' && m.inputWrapInvalid]}>
                  <TextInput
                    value={upiId}
                    onChangeText={setUpiId}
                    placeholder="yourname@oksbi"
                    placeholderTextColor={COLORS.text.muted}
                    autoCapitalize="none"
                    style={m.inputInline}
                    testID="pm-upi-input"
                  />
                  {upiStatus === 'valid' && <Ionicons name="checkmark-circle" size={18} color={c.state.success} />}
                  {upiStatus === 'invalid' && <Ionicons name="alert-circle" size={18} color={c.accent.warning} />}
                </View>
                <Text style={[m.helperTxt, upiStatus === 'invalid' && { color: c.state.warning }]}>
                  {upiStatus === 'valid' ? '✓ Valid UPI format' : upiStatus === 'invalid' ? 'Format: name@bank (e.g., rahul@okhdfcbank)' : 'Example: yourname@oksbi, yourname@ybl, yourname@paytm'}
                </Text>
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
                {isDefault && <Ionicons name="checkmark" size={13} color="#FFFFFF" />}
              </View>
              <Text style={m.defaultT}>Set as default payment method</Text>
            </TouchableOpacity>

            <View style={m.actions}>
              <TouchableOpacity style={[m.btn, m.btnGhost]} onPress={onClose} activeOpacity={0.85} disabled={showSuccess}>
                <Text style={[m.btnT, { color: COLORS.text.secondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[m.btn, showSuccess ? m.btnSuccess : m.btnPrimary]} onPress={save} disabled={saving || showSuccess} activeOpacity={0.85} testID="pm-save-btn">
                {showSuccess ? (
                  <>
                    <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                    <Text style={[m.btnT, { color: '#FFFFFF' }]}>Saved securely</Text>
                  </>
                ) : saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={[m.btnT, { color: '#FFFFFF' }]}>Save securely</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const useSStyles = makeStyles((c) => ({
  card: { backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 0, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(238,221,204,0.6)', ...shadowStyle('#2E1F1A', 2, 10, 0.04, 2) },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  iconBox: { width: 40, height: 40, borderRadius: 0, backgroundColor: c.accent.primary + '15', justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '800', color: c.text.primary },
  sub: { fontSize: 12, color: c.text.muted, marginTop: 2 },
  body: { marginTop: 14, gap: 10 },
  empty: { alignItems: 'center', paddingVertical: 16 },
  emptyT: { fontSize: 13, fontWeight: '800', color: c.text.primary, marginTop: 8 },
  emptyS: { fontSize: 11.5, color: c.text.secondary, textAlign: 'center', marginTop: 4, lineHeight: 16 },
  row: { flexDirection: 'column', gap: 8, padding: 12, borderRadius: 0, backgroundColor: c.bg.primary, borderWidth: 1, borderColor: c.border.subtle },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowDefault: { borderColor: c.accent.primary + '60', backgroundColor: c.accent.brandSoft },
  rowIcon: { width: 34, height: 34, borderRadius: 0, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 13.5, fontWeight: '800', color: c.text.primary },
  rowSub: { fontSize: 11, color: c.text.muted, marginTop: 2 },
  defaultPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: c.accent.primary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 0 },
  defaultPillT: { fontSize: 10, fontWeight: '900', color: c.bg.elevated },
  setDefaultBtn: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 0, backgroundColor: c.accent.primary + '15' },
  setDefaultT: { fontSize: 10.5, fontWeight: '800', color: c.accent.primary },
  delBtn: { padding: 6 },
  // Smart Status row (Round 26)
  healthRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  healthChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 0, borderWidth: 1, flexShrink: 1, maxWidth: '100%' },
  healthDot: { width: 6, height: 6, borderRadius: 3 },
  healthLabel: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.1, flexShrink: 1 },
  healthCta: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 0, backgroundColor: c.accent.primary + '15', borderWidth: 1, borderColor: c.accent.primary + '50', minHeight: 26 },
  healthCtaDanger: { backgroundColor: c.state.danger, borderColor: c.state.danger },
  healthCtaT: { fontSize: 10.5, fontWeight: '800', color: c.accent.primary, letterSpacing: 0.1 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: c.accent.primary, paddingVertical: 12, borderRadius: 0, marginTop: 6 },
  addBtnT: { color: c.bg.elevated, fontWeight: '800', fontSize: 13, letterSpacing: 0.2 },
}));

const useMStyles = makeStyles((c) => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: GLASS.solidBg, borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTopWidth: StyleSheet.hairlineWidth, borderColor: GLASS.borderLight, padding: 20, paddingBottom: 28 },
  grip: { width: 40, height: 4, borderRadius: 2, backgroundColor: c.border.subtle, alignSelf: 'center', marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '900', color: c.text.primary, marginBottom: 4 },
  subtitle: { fontSize: 12, color: c.text.secondary, marginBottom: 10, fontWeight: '600' },
  // Phase 2 — Trust badges
  trustRow: { flexDirection: 'row', gap: 6, marginBottom: 14 },
  trustBadge: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 0, backgroundColor: c.state.successBg, borderWidth: 1, borderColor: c.state.successBorder },
  trustTxt: { fontSize: 9.5, fontWeight: '800', color: c.state.success, letterSpacing: 0.1 },
  // Inline UPI validation
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.bg.primary, borderRadius: 0, paddingHorizontal: 12, borderWidth: 1, borderColor: c.border.subtle },
  inputWrapValid: { borderColor: c.state.success, borderWidth: 1.5 },
  inputWrapInvalid: { borderColor: c.accent.warning, borderWidth: 1.5 },
  inputInline: { flex: 1, paddingVertical: 11, fontSize: 14, color: c.text.primary },
  helperTxt: { fontSize: 11, color: c.text.muted, marginTop: 5, fontWeight: '600' },
  // Success state on save button
  btnSuccess: { backgroundColor: c.state.success, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  typeChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 0, backgroundColor: c.bg.primary, borderWidth: 1, borderColor: c.border.subtle },
  typeChipOn: { backgroundColor: c.accent.primary, borderColor: c.accent.primary },
  typeChipT: { fontSize: 12, fontWeight: '800', color: c.text.primary },
  typeChipTOn: { color: '#FFFFFF' },
  rowWrap: { flexDirection: 'row', gap: 10 },
  field: { marginBottom: 12 },
  label: { fontSize: 11, fontWeight: '800', color: c.text.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 },
  input: { backgroundColor: c.bg.primary, borderRadius: 0, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, color: c.text.primary, borderWidth: 1, borderColor: c.border.subtle },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  miniChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 0, backgroundColor: c.bg.primary, borderWidth: 1, borderColor: c.border.subtle },
  miniChipOn: { backgroundColor: c.accent.primary, borderColor: c.accent.primary },
  miniChipT: { fontSize: 11, fontWeight: '800', color: c.text.secondary },
  miniChipTOn: { color: '#FFFFFF' },
  defaultRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  cbox: { width: 20, height: 20, borderRadius: 0, borderWidth: 1.5, borderColor: c.border.subtle, alignItems: 'center', justifyContent: 'center' },
  cboxOn: { backgroundColor: c.accent.primary, borderColor: c.accent.primary },
  defaultT: { fontSize: 12.5, color: c.text.primary, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 0, alignItems: 'center' },
  btnGhost: { backgroundColor: c.bg.primary, borderWidth: 1, borderColor: c.border.subtle },
  btnPrimary: { backgroundColor: c.accent.primary },
  btnT: { fontSize: 14, fontWeight: '800' },
}));
