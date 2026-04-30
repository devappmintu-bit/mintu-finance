/**
 * ContactPickerSheet — GPay-style "Add people to group" + "Name your group" flow.
 *
 * Step 1: Pick people
 *   - Horizontal strip of selected contacts at top (tap to remove)
 *   - Manual phone-number chip input (always works, incl. web)
 *   - Contacts list from device (native only; requires permission)
 *   - Search box
 * Step 2: Name your group
 *   - Avatar stack preview of selected people
 *   - Group name input
 *   - Emoji picker (12 options) to override auto-derived icon
 *   - Create button
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, ScrollView, Alert, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Contacts from 'expo-contacts';
import { FlashList } from '@shopify/flash-list';
import Toast from 'react-native-toast-message';
import PressableGlass from '../PressableGlass';
import { haptic } from '../../utils/haptics';
import { COLORS, SHADOW, useAppColors, GLASS } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';
import { C, MEMBER_COLORS, getGA } from './theme';
import api from '../../utils/api';

type Contact = { id: string; name: string; phone: string; onMintu?: boolean };

const EMOJI_CHOICES = ['🏠', '✈️', '🏖️', '🍕', '🎉', '💼', '🍺', '👨‍👩‍👧', '🎬', '💰', '🏋️', '✨'];

type Props = {
  visible: boolean;
  onClose: () => void;
  onCreate: (name: string, phones: string[], emoji?: string) => void;
  /** Phase 1.2 — when present, the step-2 name input shows an inline
   * warning when the typed name collides with an existing group. */
  existingNames?: string[];
};

export default function ContactPickerSheet({ visible, onClose, onCreate, existingNames = [] }: Props) {
  const s = useStyles();
  const c = useAppColors();
  const [step, setStep] = useState<1 | 2>(1);
  const [search, setSearch] = useState('');
  // Phase 3.2 — debounced search to avoid filtering 1000+ contacts on
  // every keystroke. 300ms is the sweet spot between responsiveness
  // and avoiding redundant work mid-type.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selected, setSelected] = useState<Contact[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [manualPhone, setManualPhone] = useState('');
  const [contactsPermission, setContactsPermission] = useState<'granted' | 'denied' | 'unavailable' | 'loading'>('loading');
  const [permissionPersistentlyDenied, setPermissionPersistentlyDenied] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [chosenEmoji, setChosenEmoji] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      // Reset when closed
      setStep(1); setSearch(''); setDebouncedSearch(''); setSelected([]);
      setManualPhone(''); setGroupName(''); setChosenEmoji(null);
      return;
    }
    loadContacts();
  }, [visible]);

  // Phase 3.2 — Debounce the search input so filter() runs at most
  // every 300ms, not on every keystroke. Critical when the contact
  // list is 500+ entries.
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(handle);
  }, [search]);

  const loadContacts = async () => {
    if (Platform.OS === 'web') { setContactsPermission('unavailable'); return; }
    try {
      // Read the current permission FIRST so we can detect the
      // "permanently denied" state (user previously hit Don't Allow
      // and the OS now refuses to re-prompt). On both iOS and Android
      // this surfaces as canAskAgain === false.
      const current = await Contacts.getPermissionsAsync();
      let status = current.status;
      let canAskAgain = current.canAskAgain;
      if (status !== 'granted') {
        const requested = await Contacts.requestPermissionsAsync();
        status = requested.status;
        canAskAgain = requested.canAskAgain;
      }
      if (status !== 'granted') {
        setPermissionPersistentlyDenied(canAskAgain === false);
        setContactsPermission('denied');
        return;
      }
      // Phase 3.2 — Drop the 300-row cap. Users with 1000+ contacts
      // were previously seeing a truncated list. Modern devices
      // handle 5000 rows in <250ms via FlashList virtualisation.
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
      });
      const parsed: Contact[] = [];
      (data || []).forEach((c: any) => {
        if (c?.phoneNumbers?.length) {
          const ph = (c.phoneNumbers[0].number || '').replace(/\D/g, '').slice(-10);
          if (ph.length === 10) {
            parsed.push({ id: c.id, name: c.name || 'Unknown', phone: ph });
          }
        }
      });
      // De-duplicate by phone
      const seen = new Set<string>();
      const unique = parsed.filter((c) => { if (seen.has(c.phone)) return false; seen.add(c.phone); return true; });
      unique.sort((a, b) => a.name.localeCompare(b.name));
      setContacts(unique);
      setContactsPermission('granted');

      // Phase 3.3 — Detect which contacts are already on MintU.
      // Backend cap is 100 phones / call so we batch in chunks. Failures
      // are non-fatal — the UI just won't show the "On MintU" badge.
      try {
        const phones = unique.map((u) => u.phone);
        const matched = new Set<string>();
        for (let i = 0; i < phones.length; i += 100) {
          const slice = phones.slice(i, i + 100);
          // eslint-disable-next-line no-await-in-loop
          const res = await api.post('/users/lookup-batch', { phones: slice });
          for (const m of (res.data?.matches || [])) {
            if (m?.phone) matched.add(m.phone);
          }
        }
        if (matched.size > 0) {
          setContacts((prev) => prev.map((c) => matched.has(c.phone) ? { ...c, onMintu: true } : c));
        }
      } catch {
        // Silent — MintU badge is enhancement, not requirement.
      }
    } catch {
      setContactsPermission('unavailable');
    }
  };

  const toggleContact = (c: Contact) => {
    haptic.selection();
    setSelected((prev) => prev.some((s) => s.phone === c.phone) ? prev.filter((s) => s.phone !== c.phone) : [...prev, c]);
  };

  const addManual = () => {
    const digits = manualPhone.replace(/\D/g, '').slice(-10);
    if (digits.length !== 10) { Toast.show({ type: 'error', text1: 'Enter valid 10-digit phone' }); return; }
    if (selected.some((s) => s.phone === digits)) { Toast.show({ type: 'info', text1: 'Already added' }); return; }
    const c: Contact = { id: `manual_${digits}`, name: `+91 ${digits}`, phone: digits };
    setSelected((prev) => [...prev, c]);
    setManualPhone('');
    haptic.light();
  };

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q));
  }, [contacts, debouncedSearch]);

  const goNext = () => {
    if (selected.length === 0) { Toast.show({ type: 'error', text1: 'Pick at least 1 person' }); return; }
    haptic.medium();
    setStep(2);
  };

  const handleCreate = () => {
    if (!groupName.trim()) { Toast.show({ type: 'error', text1: 'Enter group name' }); return; }
    haptic.success();
    onCreate(groupName.trim(), selected.map((s) => s.phone), chosenEmoji || undefined);
  };

  const previewAvatar = chosenEmoji || getGA(groupName).emoji;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.bg}>
        <View style={[s.sheet, { maxHeight: '94%' }]}>
          {/* Header */}
          <View style={s.head}>
            {step === 2 && (
              <TouchableOpacity onPress={() => setStep(1)} hitSlop={12}>
                <Ionicons name="arrow-back" size={24} color={C.text1} />
              </TouchableOpacity>
            )}
            <Text style={s.headT}>{step === 1 ? 'Add people to group' : 'Name your group'}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color={C.text3} />
            </TouchableOpacity>
          </View>

          {step === 1 ? (
            <>
              {/* Selected strip */}
              {selected.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.selectedRow}>
                  {selected.map((c, i) => (
                    <TouchableOpacity key={c.id} onPress={() => toggleContact(c)} style={s.selectedCell}>
                      <View style={[s.selectedAv, { backgroundColor: MEMBER_COLORS[i % MEMBER_COLORS.length] + '20' }]}>
                        <Text style={[s.selectedAvT, { color: MEMBER_COLORS[i % MEMBER_COLORS.length] }]}>{c.name[0].toUpperCase()}</Text>
                        <View style={s.selectedBadge}><Ionicons name="close" size={10} color="#FFFFFF" /></View>
                      </View>
                      <Text numberOfLines={1} style={s.selectedName}>{c.name.split(' ')[0]}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              {/* Search */}
              <View style={s.searchBar}>
                <Ionicons name="search" size={18} color={C.text4} />
                <TextInput
                  style={s.searchInput}
                  placeholder="Search contacts or type phone..."
                  placeholderTextColor={C.text4}
                  value={search}
                  onChangeText={setSearch}
                />
              </View>

              {/* Manual phone add */}
              <View style={s.manualRow}>
                <TextInput
                  style={[s.input, { flex: 1 }]}
                  placeholder="Add by phone number"
                  placeholderTextColor={C.text4}
                  value={manualPhone}
                  onChangeText={setManualPhone}
                  keyboardType="phone-pad"
                  maxLength={10}
                  onSubmitEditing={addManual}
                />
                <PressableGlass onPress={addManual} feedback="light">
                  <LinearGradient colors={[C.accent, C.accentLight]} style={s.manualBtn}>
                    <Ionicons name="add" size={22} color={C.inv} />
                  </LinearGradient>
                </PressableGlass>
              </View>

              {/* Contacts list */}
              {contactsPermission === 'loading' ? (
                <Text style={s.hint}>Loading contacts…</Text>
              ) : contactsPermission === 'granted' ? (
                <FlashList
                  data={filtered}
                  keyExtractor={(c) => c.id}
                  renderItem={({ item, index }) => {
                    const isSel = selected.some((s) => s.phone === item.phone);
                    return (
                      <TouchableOpacity style={s.contactRow} onPress={() => toggleContact(item)} activeOpacity={0.7}>
                        <View style={[s.contactAv, { backgroundColor: MEMBER_COLORS[index % MEMBER_COLORS.length] + '18' }]}>
                          <Text style={[s.contactInit, { color: MEMBER_COLORS[index % MEMBER_COLORS.length] }]}>{item.name[0].toUpperCase()}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={s.contactName} numberOfLines={1}>{item.name}</Text>
                            {/* Phase 3.3 — On-MintU badge. Boosts invite
                                conversion by surfacing existing users
                                so the inviter knows the friction is low. */}
                            {item.onMintu && (
                              <View style={s.mintuBadge}>
                                <Ionicons name="checkmark" size={10} color="#10B981" />
                                <Text style={s.mintuBadgeT}>MintU</Text>
                              </View>
                            )}
                          </View>
                          <Text style={s.contactPhone} numberOfLines={1}>{item.phone}</Text>
                        </View>
                        <Ionicons name={isSel ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={isSel ? C.accent : C.text4} />
                      </TouchableOpacity>
                    );
                  }}
                  ListEmptyComponent={<Text style={s.hint}>No contacts found. Add by phone above.</Text>}
                />
              ) : (
                <View style={s.noContacts}>
                  <Ionicons
                    name={contactsPermission === 'unavailable' ? 'link-outline' : 'people-circle-outline'}
                    size={48}
                    color={C.text4}
                  />
                  {contactsPermission === 'unavailable' ? (
                    <>
                      <Text style={[s.hint, { fontSize: 14, fontWeight: '700', color: C.text1 }]}>
                        Contacts not available on web
                      </Text>
                      <Text style={s.hint}>
                        Add a friend by phone above ↑ or share an invite link after the group is created.
                      </Text>
                      <TouchableOpacity
                        style={{ marginTop: 12, backgroundColor: C.accent, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6 }}
                        onPress={() => setManualPhone((p) => p || '')}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="call" size={14} color="#FFFFFF" />
                        <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '800' }}>Enter phone number</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      <Text style={s.hint}>
                        {permissionPersistentlyDenied
                          ? "Contacts permission was denied. Enable it in Settings to pick from your list."
                          : "Allow contacts to pick from your list."}
                      </Text>
                      {contactsPermission === 'denied' && (
                        <TouchableOpacity
                          onPress={() => {
                            if (permissionPersistentlyDenied) {
                              // Phase 3.2 — Deep-link to OS settings page
                              // when the user previously hit "Don't allow"
                              // and the OS now blocks our prompt.
                              Linking.openSettings().catch(() => {
                                Alert.alert(
                                  'Open Settings',
                                  'Please enable Contacts permission for MintU in your device Settings.',
                                );
                              });
                            } else {
                              loadContacts();
                            }
                          }}
                        >
                          <Text style={s.grantT}>
                            {permissionPersistentlyDenied ? 'Open Settings' : 'Grant permission'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </>
                  )}
                </View>
              )}

              {/* Next button */}
              <PressableGlass onPress={goNext} feedback="medium" disabled={selected.length === 0}>
                <LinearGradient colors={[C.accent, C.accentLight]} style={[s.primaryBtn, selected.length === 0 && { opacity: 0.4 }]}>
                  <Text style={s.primaryBtnT}>{`Next (${selected.length} selected)`}</Text>
                  <Ionicons name="arrow-forward" size={18} color={C.inv} />
                </LinearGradient>
              </PressableGlass>
            </>
          ) : (
            <ScrollView>
              {/* Preview avatar */}
              <View style={s.preview}>
                <LinearGradient colors={[C.accent + '30', C.accentLight + '30']} style={s.previewAv}>
                  <Text style={{ fontSize: 40 }}>{previewAvatar}</Text>
                </LinearGradient>
                <View style={s.avatarStack}>
                  {selected.slice(0, 6).map((c, i) => {
                    // Extract the first letter; fall back to last digit of the
                    // phone for phone-only contacts (previously rendered "+").
                    const n = (c.name || '').trim();
                    const firstLetter = (n.match(/[A-Za-z\u00C0-\u024F]/) || [''])[0];
                    const lastDigit = ((n.match(/\d/g) || []).slice(-1)[0]) || '?';
                    const ch = (firstLetter || lastDigit).toUpperCase();
                    return (
                      <View key={c.id} style={[s.sAv, { backgroundColor: MEMBER_COLORS[i % MEMBER_COLORS.length] + '20', marginLeft: i === 0 ? 0 : -12, zIndex: 6 - i }]}>
                        <Text style={[s.sAvT, { color: MEMBER_COLORS[i % MEMBER_COLORS.length] }]}>{ch}</Text>
                      </View>
                    );
                  })}
                  {selected.length > 6 && (
                    <View style={[s.sAv, { backgroundColor: COLORS.bg.secondary, marginLeft: -12 }]}>
                      <Text style={[s.sAvT, { color: C.text3 }]}>+{selected.length - 6}</Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Name input */}
              <Text style={s.label}>Group name</Text>
              <TextInput
                style={s.bigInput}
                placeholder="e.g. Goa Trip, Flatmates"
                placeholderTextColor={C.text4}
                value={groupName}
                onChangeText={setGroupName}
                autoFocus
              />
              {/* Phase 1.2 — Inline duplicate-name warning. Non-blocking;
                  user can still proceed if they truly want the same name
                  (the group list disambiguates by date / short-id). */}
              {(() => {
                const trimmed = groupName.trim().toLowerCase();
                if (!trimmed) return null;
                const collides = existingNames.some(
                  (n) => (n || '').trim().toLowerCase() === trimmed,
                );
                if (!collides) return null;
                return (
                  <View style={s.dupWarn}>
                    <Ionicons name="alert-circle" size={16} color="#F59E0B" />
                    <Text style={s.dupWarnT} numberOfLines={2}>
                      You already have a group called &quot;{groupName.trim()}&quot;. Tip: add a date or location to tell them apart.
                    </Text>
                  </View>
                );
              })()}

              {/* Emoji picker */}
              <Text style={s.label}>Pick an icon</Text>
              <View style={s.emojiGrid}>
                {EMOJI_CHOICES.map((e) => (
                  <PressableGlass
                    key={e}
                    onPress={() => { haptic.selection(); setChosenEmoji(e); }}
                    feedback="none"
                    style={[s.emojiBtn, chosenEmoji === e && s.emojiBtnOn]}
                  >
                    <Text style={{ fontSize: 22 }}>{e}</Text>
                  </PressableGlass>
                ))}
              </View>

              <PressableGlass onPress={handleCreate} feedback="medium">
                <LinearGradient colors={[C.accent, C.accentLight]} style={s.primaryBtn}>
                  <Text style={s.primaryBtnT}>Create Group</Text>
                  <Ionicons name="checkmark" size={20} color={C.inv} />
                </LinearGradient>
              </PressableGlass>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  bg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: C.sheetBg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingTop: 16 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 },
  headT: { flex: 1, fontSize: 18, fontWeight: '700', color: C.text1, textAlign: 'center' },
  selectedRow: { gap: 12, paddingVertical: 8 },
  selectedCell: { alignItems: 'center', gap: 4, width: 58 },
  selectedAv: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  selectedAvT: { fontSize: 18, fontWeight: '700' },
  selectedBadge: { position: 'absolute', top: -2, right: -2, width: 18, height: 18, borderRadius: 9, backgroundColor: C.red, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: C.sheetBg },
  selectedName: { fontSize: 11, color: C.text2 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.bg.primary, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: C.border, marginBottom: 10 },
  searchInput: { flex: 1, fontSize: 15, color: C.text1 },
  manualRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  input: { backgroundColor: c.bg.primary, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.text1, borderWidth: 1, borderColor: C.border },
  manualBtn: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  contactRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  contactAv: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  contactInit: { fontSize: 15, fontWeight: '700' },
  contactName: { fontSize: 15, fontWeight: '600', color: C.text1 },
  contactPhone: { fontSize: 12, color: C.text3, marginTop: 2 },
  hint: { fontSize: 13, color: C.text3, textAlign: 'center', marginTop: 16 },
  grantT: { color: C.accent, fontWeight: '700', marginTop: 8, textAlign: 'center' },
  noContacts: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 20 },
  primaryBtn: { flexDirection: 'row', gap: 8, borderRadius: 16, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', marginTop: 10, ...SHADOW.md },
  primaryBtnT: { fontSize: 16, fontWeight: '700', color: C.inv },
  preview: { alignItems: 'center', marginVertical: 20 },
  previewAv: { width: 96, height: 96, borderRadius: 48, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  avatarStack: { flexDirection: 'row', marginTop: 4 },
  sAv: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: C.sheetBg },
  sAvT: { fontSize: 13, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '700', color: C.text3, marginBottom: 8, marginTop: 8, letterSpacing: 0.3 },
  bigInput: { backgroundColor: c.bg.primary, borderRadius: 16, padding: 18, fontSize: 18, fontWeight: '600', color: C.text1, borderWidth: 1, borderColor: C.border, marginBottom: 4 },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  emojiBtn: { width: 56, height: 56, borderRadius: 16, backgroundColor: c.bg.primary, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  emojiBtnOn: { backgroundColor: C.accentDim, borderColor: C.accent },
  // Phase 1.2 — duplicate-name warning chip (amber, non-blocking)
  dupWarn: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.35)',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
    marginBottom: 4,
  },
  dupWarnT: {
    flex: 1,
    fontSize: 12.5,
    color: '#FBBF24',
    lineHeight: 17,
    fontWeight: '600',
  },
  // Phase 3.3 — On-MintU badge for contacts already on the platform
  mintuBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  mintuBadgeT: {
    fontSize: 10,
    fontWeight: '800',
    color: '#10B981',
    letterSpacing: 0.3,
  },
}));
