/**
 * Split · Add Member v2 — Smart Contacts Picker.
 *
 * Redesign goals (v2):
 *   1. Smart search (name/phone) with live filter + debounce
 *   2. Horizontal selected-chips rail with "Quick add" animation
 *   3. Sections:
 *        ⭐ Suggested (frequent split partners + recent group mates)
 *        👥 Friends on MintU
 *        💸 Manual add (phone number)
 *        🔗 Invite via link / WhatsApp / QR (expandable)
 *   4. Contact row: avatar, name, phone + "On MintU" badge OR "Invite" CTA
 *   5. Sticky footer: "N selected · Add to group"
 *   6. Edge cases: duplicates merged, already-in-group disabled, no-data empty state
 *   7. FlatList/SectionList perf: windowSize, removeClippedSubviews, memoized rows
 *
 * Preserves existing backend contracts:
 *   - fetchGroupSummary, addGroupMember (no API changes)
 *   - Suggestions derived client-side from fetchSplitGroups + fetchSplitBalances
 */
import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform,
  ActivityIndicator, Share, Linking, SectionList, Animated, Pressable, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import Toast from 'react-native-toast-message';
import {
  fetchGroupSummary, addGroupMember, fetchSplitGroups, fetchSplitBalances,
} from '../../services/split';
import { lookupUsersByPhones } from '../../services/users';
import { usePhoneContacts } from '../../hooks/usePhoneContacts';
import { makeStyles } from '../../utils/makeStyles';
import { COLORS, SPACING } from '../../utils/theme';
import FullScreenLoader from '../../components/FullScreenLoader';
import { showError, showInfo, showSuccess } from '../../utils/toast';

// ───────────────────────────── Types ─────────────────────────────

type Contact = {
  phone: string;
  name: string;
  user_id?: string;
  /** Already part of the current group — row is rendered disabled. */
  alreadyInGroup?: boolean;
  /** True when backed by a real MintU user (has user_id). */
  onMintU: boolean;
  /** Higher = more relevant. Used for Suggested ordering. */
  score?: number;
};

type Section = { title: string; icon: string; data: Contact[] };

// ───────────────────────────── Helpers ─────────────────────────────

const SEARCH_DEBOUNCE_MS = 150;

const normalizePhone = (p?: string) => (p || '').replace(/\D/g, '').slice(-10);

/** Display-friendly initials. Handles:
 *   - real names ("Rahul Kumar" → "RK")
 *   - phone-only contacts ("+91 8787949794" → "87")  (last 2 digits)
 *   - empty / unknown ("?")
 * Avoids the ancient bug where "+91 8787..." produced "+8" initials.
 */
const getInitials = (name?: string) => {
  if (!name) return '?';
  // Strip anything that's not a letter. If what's left is empty, the input
  // was phone-only — fall back to last 2 digits of the phone.
  const letters = name.trim().split(/\s+/)
    .map(p => (p.match(/[A-Za-z\u00C0-\u024F]/) || [''])[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  if (letters) return letters;
  const digits = (name.match(/\d/g) || []).join('');
  return digits.slice(-2) || '?';
};

/** Short display label for a contact when only a phone is known. */
const displayLabel = (c: { name?: string; phone?: string }) => {
  const n = (c.name || '').trim();
  if (n && n !== c.phone) return n;
  const digits = normalizePhone(c.phone);
  return digits ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}` : (c.phone || 'Unknown');
};

/**
 * Build ranked suggestion pool from split groups + balances.
 *
 *   score = (# groups in common × 2)            + (abs(balance) > 0 ? 3 : 0)
 *         + recency_boost (recent activity = 1)
 *
 * Contacts already in the current group are flagged (not removed) so the
 * row can render a calm "Already added" disabled state.
 */
async function buildSuggestions(currentGroupMemberPhones: Set<string>): Promise<Contact[]> {
  const [groupsRes, balancesRes] = await Promise.allSettled([
    fetchSplitGroups(),
    fetchSplitBalances(),
  ]);

  const byPhone = new Map<string, Contact>();
  const addOrBoost = (phone: string, name: string, userId: string | undefined, scoreDelta: number) => {
    const p = normalizePhone(phone);
    if (!p) return;
    const prev = byPhone.get(p);
    if (prev) {
      prev.score = (prev.score || 0) + scoreDelta;
      if (userId && !prev.user_id) { prev.user_id = userId; prev.onMintU = true; }
      if (name && (!prev.name || prev.name === prev.phone)) prev.name = name;
    } else {
      byPhone.set(p, {
        phone: p,
        name: name || p,
        user_id: userId,
        onMintU: !!userId,
        alreadyInGroup: currentGroupMemberPhones.has(p),
        score: scoreDelta,
      });
    }
  };

  if (groupsRes.status === 'fulfilled') {
    for (const g of groupsRes.value) {
      for (const m of g.members || []) {
        addOrBoost(m.phone || '', m.name || '', m.user_id, 2);
      }
    }
  }
  if (balancesRes.status === 'fulfilled') {
    for (const b of balancesRes.value || []) {
      const bal = (b as any).balance ?? (b as any).net ?? 0;
      const score = Math.abs(Number(bal)) > 0 ? 3 : 1;
      addOrBoost((b as any).phone || '', (b as any).name || '', (b as any).user_id, score);
    }
  }

  return Array.from(byPhone.values()).sort((a, b) => (b.score || 0) - (a.score || 0));
}

// Simple debounce hook
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

// ───────────────────────────── Contact Row (memoized) ─────────────────────────────

const ContactRow = React.memo(function ContactRow({
  contact, selected, onToggle, onInvite,
}: {
  contact: Contact;
  selected: boolean;
  onToggle: (c: Contact) => void;
  onInvite: (c: Contact) => void;
}) {
  const s = useStyles();
  const disabled = !!contact.alreadyInGroup;

  const handlePress = () => {
    if (disabled) return;
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    onToggle(contact);
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        s.row,
        pressed && !disabled && s.rowPressed,
        selected && s.rowSelected,
        disabled && s.rowDisabled,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={`${contact.name}, ${disabled ? 'already in group' : (selected ? 'selected' : 'not selected')}`}
    >
      <View style={[s.avatar, selected && !disabled && s.avatarSelected]}>
        {selected && !disabled ? (
          <Ionicons name="checkmark" size={18} color="#fff" />
        ) : (
          <Text style={s.avatarInitials}>{getInitials(contact.name)}</Text>
        )}
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.name, disabled && s.textMuted]} numberOfLines={1}>
          {contact.name}
        </Text>
        <View style={s.subRow}>
          <Text style={[s.phone, disabled && s.textMuted]} numberOfLines={1}>
            +91 {contact.phone.replace(/^(\d{5})(\d+)/, '$1 $2')}
          </Text>
          {disabled ? (
            <Text style={s.alreadyBadge}>Already added</Text>
          ) : contact.onMintU ? (
            <View style={s.mintuBadge}>
              <Ionicons name="checkmark-circle" size={10} color={COLORS.accent.primary} />
              <Text style={s.mintuTxt}>On MintU</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* RHS: check (if selected), invite CTA (if not on MintU), or arrow */}
      {disabled ? (
        <Ionicons name="lock-closed" size={14} color={COLORS.text.muted} />
      ) : !contact.onMintU && !selected ? (
        <TouchableOpacity
          onPress={() => onInvite(contact)}
          style={s.inviteBtn}
          activeOpacity={0.75}
          hitSlop={6}
        >
          <Text style={s.inviteTxt}>Invite</Text>
        </TouchableOpacity>
      ) : null}
    </Pressable>
  );
}, (a, b) => a.selected === b.selected && a.contact.phone === b.contact.phone && a.contact.alreadyInGroup === b.contact.alreadyInGroup);

// ───────────────────────────── Screen ─────────────────────────────

export default function AddMemberScreen() {
  const s = useStyles();
  const params = useLocalSearchParams<{ group_id?: string }>();
  const [group, setGroup] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [pool, setPool] = useState<Contact[]>([]);
  const [poolError, setPoolError] = useState(false);
  const [search, setSearch] = useState('');
  const debSearch = useDebounced(search, SEARCH_DEBOUNCE_MS);
  const [selected, setSelected] = useState<Map<string, Contact>>(new Map());
  const [submitting, setSubmitting] = useState(false);
  const [inviteExpanded, setInviteExpanded] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const phoneContacts = usePhoneContacts();
  // Round 51n — server-side reverse-lookup of phone-book contacts so we
  // can render the "On MintU" badge correctly (vs the older heuristic
  // which only flagged contacts that had touched a split before).
  const [mintuMatches, setMintuMatches] = useState<Map<string, { user_id: string; name: string }>>(new Map());
  const chipsFade = useRef(new Animated.Value(0)).current;

  // Animate chip rail appearance
  useEffect(() => {
    Animated.timing(chipsFade, {
      toValue: selected.size > 0 ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [selected.size]);

  // Load group + suggestion pool
  useEffect(() => {
    (async () => {
      if (!params.group_id) {
        // Graceful recovery: deep-links without group_id land on a blank
        // screen because router.back() has nowhere to go on cold nav.
        Toast.show({
          type: 'error',
          text1: 'No group selected',
          text2: 'Open a group first, then add members.',
        });
        router.replace('/split');
        return;
      }
      try {
        const data = await fetchGroupSummary(String(params.group_id));
        setGroup(data);
        const memberPhones = new Set<string>(
          (data?.members || []).map((m: any) => normalizePhone(m.phone || '')).filter(Boolean)
        );
        try {
          const sugg = await buildSuggestions(memberPhones);
          setPool(sugg);
        } catch {
          setPoolError(true);
        }
      } catch {
        showError('Could not load group');
        router.back();
      } finally { setLoading(false); }
    })();
  }, [params.group_id]);

  // Round 51n — when the device contact list resolves, batch-lookup
  // their phones against the MintU user table so we render correct
  // "On MintU" badges. Runs in parallel with the suggestion-pool
  // build so it doesn't block first paint of the Suggested section.
  useEffect(() => {
    const phones = phoneContacts.contacts.map(c => c.phone).filter(Boolean);
    if (phones.length === 0) return;
    let alive = true;
    (async () => {
      try {
        const matches = await lookupUsersByPhones(phones);
        if (!alive) return;
        const m = new Map<string, { user_id: string; name: string }>();
        for (const it of matches) {
          // Server normalises too — be defensive in case a future
          // server change returns raw E.164.
          const norm = normalizePhone(it.phone);
          if (norm) m.set(norm, { user_id: it.user_id, name: it.name });
        }
        setMintuMatches(m);
      } catch {
        // Silent — UI gracefully falls back to "Invite" CTAs everywhere.
      }
    })();
    return () => { alive = false; };
  }, [phoneContacts.contacts]);


  // Invite link (stable per group) — lands on /join/[id] deeplink handler
  const inviteLink = useMemo(
    () => (group?.id ? `https://mintu.app/join/${group.id}` : 'https://mintu.app'),
    [group?.id]
  );

  // ─── Filter + section the pool ─────────────────────────────
  const sections: Section[] = useMemo(() => {
    const q = debSearch.trim().toLowerCase();
    const match = (c: Contact) => {
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || c.phone.includes(q);
    };

    // Build phone-contact entries (deduped against existing pool by phone)
    const poolByPhone = new Map(pool.map(c => [c.phone, c]));
    const memberPhones = new Set<string>(
      (group?.members || []).map((m: any) => normalizePhone(m.phone || '')).filter(Boolean)
    );
    const phoneBook: Contact[] = phoneContacts.contacts
      .filter(pc => !poolByPhone.has(pc.phone)) // not already in suggestion pool
      .map(pc => {
        const match = mintuMatches.get(pc.phone);
        return {
          phone: pc.phone,
          // Prefer the server-canonical name (matches the user's MintU
          // profile) when we have one — falls back to the device contact
          // name otherwise.
          name: match?.name || pc.name,
          user_id: match?.user_id,
          onMintU: !!match,
          alreadyInGroup: memberPhones.has(pc.phone),
        };
      });

    const filtered = pool.filter(match);
    const suggested = filtered.filter(c => (c.score || 0) >= 2).slice(0, 8);
    const suggestedPhones = new Set(suggested.map(c => c.phone));
    const friends = filtered.filter(c => c.onMintU && !suggestedPhones.has(c.phone));
    const others = filtered.filter(c => !c.onMintU && !suggestedPhones.has(c.phone));
    const phoneFiltered = phoneBook.filter(match);

    const result: Section[] = [];
    if (suggested.length)     result.push({ title: 'Suggested',         icon: 'star',            data: suggested });
    if (friends.length)       result.push({ title: 'Friends on MintU',  icon: 'people',          data: friends });
    if (phoneFiltered.length) result.push({ title: 'Phone contacts',    icon: 'phone-portrait',  data: phoneFiltered });
    if (others.length)        result.push({ title: 'Other contacts',    icon: 'person-outline',  data: others });
    return result;
  }, [pool, debSearch, phoneContacts.contacts, mintuMatches, group?.members]);

  // ─── Actions ─────────────────────────────
  const toggleContact = useCallback((c: Contact) => {
    setSelected(prev => {
      const next = new Map(prev);
      if (next.has(c.phone)) next.delete(c.phone);
      else next.set(c.phone, c);
      return next;
    });
  }, []);

  const inviteContactViaWhatsApp = useCallback((c: Contact) => {
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    const msg = `Hey ${c.name || ''}! Join my MintU group "${group?.name || ''}" to split expenses together: ${inviteLink}`;
    const url = `https://wa.me/91${c.phone}?text=${encodeURIComponent(msg)}`;
    Linking.openURL(url).catch(() => { try { Share.share({ message: msg }); } catch {} });
  }, [group?.name, inviteLink]);

  const addManualPhone = () => {
    const phone = normalizePhone(phoneInput);
    if (!/^\d{10}$/.test(phone)) {
      Toast.show({ type: 'warning', text1: 'Enter a valid 10-digit number' });
      return;
    }
    // De-dupe: if already in group
    const memberPhones = new Set<string>((group?.members || []).map((m: any) => normalizePhone(m.phone || '')));
    if (memberPhones.has(phone)) {
      showInfo('This number is already in the group');
      return;
    }
    const existing = pool.find(c => c.phone === phone);
    const contact: Contact = existing || { phone, name: `+91 ${phone}`, onMintU: false };
    setSelected(prev => {
      const next = new Map(prev);
      next.set(phone, contact);
      return next;
    });
    setPhoneInput('');
    Keyboard.dismiss();
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const submit = async () => {
    if (!group?.id || selected.size === 0 || submitting) return;
    setSubmitting(true);
    const addedNames: string[] = [];
    const invitedNames: string[] = [];
    const failedNames: string[] = [];

    for (const c of selected.values()) {
      try {
        // Round 30f — backend returns {added: [], invited: []}. Registered
        // phones land in `added`; unregistered go to `pending_invites` and
        // we should tell the user they'll auto-join on signup (not silent
        // success like before).
        const resp = await addGroupMember(group.id, c.phone);
        const body = resp || {};
        const wasAdded = Array.isArray(body.added) && body.added.length > 0;
        const wasInvited = Array.isArray(body.invited) && body.invited.length > 0;
        if (wasAdded) addedNames.push(c.name);
        else if (wasInvited) invitedNames.push(c.name);
        else {
          // Already in group or invalid phone → treat as added (no-op success).
          addedNames.push(c.name);
        }
      } catch {
        failedNames.push(c.name);
      }
    }

    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    if (failedNames.length) {
      Toast.show({
        type: 'warning',
        text1: `${addedNames.length + invitedNames.length} ok · ${failedNames.length} failed`,
        text2: failedNames.slice(0, 2).join(', '),
      });
    } else if (addedNames.length && invitedNames.length) {
      Toast.show({
        type: 'success',
        text1: `${addedNames.length} joined · ${invitedNames.length} invited`,
        text2: 'Invited friends will auto-join after they sign up',
      });
    } else if (invitedNames.length) {
      Toast.show({
        type: 'info',
        text1: `${invitedNames.length} invited to ${group.name}`,
        text2: 'They\'ll auto-join after signing up with this phone',
      });
    } else if (addedNames.length) {
      Toast.show({ type: 'success', text1: `${addedNames.length} added to ${group.name}` });
    }

    setSubmitting(false);
    if (addedNames.length || invitedNames.length) router.back();
  };

  const shareGroupWhatsApp = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const msg = `Hey! Join my MintU group "${group?.name || ''}" to split expenses together: ${inviteLink}`;
    const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    Linking.openURL(url).catch(() => { try { Share.share({ message: msg }); } catch {} });
  };

  const copyInviteLink = async () => {
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    try {
      await Clipboard.setStringAsync(inviteLink);
      showSuccess('Invite link copied');
    } catch { /* noop */ }
  };

  if (loading) return <FullScreenLoader tagline="Loading members…" />;

  const totalShown = sections.reduce((n, x) => n + x.data.length, 0);
  const noResults = !loading && pool.length > 0 && totalShown === 0;
  const noContacts = !loading && pool.length === 0 && !poolError;

  // ─── Render ─────────────────────────────
  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn} hitSlop={8} accessibilityLabel="Close">
          <Ionicons name="close" size={22} color={COLORS.text.primary} />
        </TouchableOpacity>
        <View style={{ alignItems: 'center', flex: 1 }}>
          <Text style={s.title}>Add members</Text>
          {group?.name ? (
            <Text style={s.groupName} numberOfLines={1}>to {group.name}</Text>
          ) : null}
        </View>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        {/* Search bar */}
        <View style={s.searchWrap}>
          <Ionicons name="search" size={16} color={COLORS.text.muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search name or phone"
            placeholderTextColor={COLORS.text.muted}
            style={s.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            accessibilityLabel="Search contacts"
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={8} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={16} color={COLORS.text.muted} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Selected chips rail — animated */}
        {selected.size > 0 ? (
          <Animated.View style={[s.chipsRailWrap, { opacity: chipsFade, transform: [{ translateY: chipsFade.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }] }]}>
            <Text style={s.overline}>SELECTED · {selected.size}</Text>
            <SectionList
              horizontal
              showsHorizontalScrollIndicator={false}
              sections={[{ title: '', data: Array.from(selected.values()) }]}
              keyExtractor={(item) => `chip-${item.phone}`}
              renderItem={({ item }) => (
                <View style={s.chip}>
                  <View style={s.chipAvatar}>
                    <Text style={s.chipInitials}>{getInitials(item.name)}</Text>
                  </View>
                  <Text style={s.chipTxt} numberOfLines={1}>{displayLabel(item)}</Text>
                  <TouchableOpacity onPress={() => toggleContact(item)} hitSlop={6} accessibilityLabel={`Remove ${item.name}`}>
                    <Ionicons name="close" size={14} color={COLORS.accent.primary} />
                  </TouchableOpacity>
                </View>
              )}
              renderSectionHeader={() => null}
              contentContainerStyle={s.chipsList}
              ItemSeparatorComponent={() => <View style={{ width: 8 }} />}
            />
          </Animated.View>
        ) : null}

        {/* Main list */}
        <SectionList
          sections={sections}
          keyExtractor={(item) => `c-${item.phone}`}
          renderItem={({ item }) => (
            <ContactRow
              contact={item}
              selected={selected.has(item.phone)}
              onToggle={toggleContact}
              onInvite={inviteContactViaWhatsApp}
            />
          )}
          renderSectionHeader={({ section }) => (
            <View style={s.sectionHdr}>
              <Ionicons name={section.icon as any} size={13} color={COLORS.accent.primary} />
              <Text style={s.sectionTitle}>{section.title}</Text>
              <View style={s.sectionCount}><Text style={s.sectionCountTxt}>{section.data.length}</Text></View>
            </View>
          )}
          stickySectionHeadersEnabled
          contentContainerStyle={s.listContent}
          ListHeaderComponent={
            <View>
              {/* Manual phone input — always available */}
              <View style={s.manualCard}>
                <Text style={s.overline}>ADD BY PHONE NUMBER</Text>
                <View style={s.phoneInputWrap}>
                  <Text style={s.dialCode}>+91</Text>
                  <TextInput
                    value={phoneInput}
                    onChangeText={(v) => setPhoneInput(v.replace(/\D/g, '').slice(0, 10))}
                    placeholder="98765 43210"
                    placeholderTextColor={COLORS.text.muted}
                    keyboardType="phone-pad"
                    style={s.phoneInput}
                    onSubmitEditing={addManualPhone}
                    testID="am-phone"
                  />
                  {phoneInput.length === 10 ? (
                    <TouchableOpacity onPress={addManualPhone} style={s.addChipBtn} activeOpacity={0.85} accessibilityLabel="Add number">
                      <Ionicons name="checkmark" size={16} color="#fff" />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>

              {/* Invite via link / WhatsApp / QR — collapsed by default */}
              <TouchableOpacity
                onPress={() => setInviteExpanded(v => !v)}
                style={s.inviteHdr}
                activeOpacity={0.75}
              >
                <Ionicons name="share-social-outline" size={15} color={COLORS.accent.primary} />
                <Text style={s.inviteHdrTxt}>Share group invite</Text>
                <Ionicons name={inviteExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.text.muted} />
              </TouchableOpacity>
              {inviteExpanded ? (
                <View style={s.inviteBody}>
                  <TouchableOpacity style={s.waBtn} onPress={shareGroupWhatsApp} activeOpacity={0.88}>
                    <View style={[s.waGrad, { backgroundColor: '#25D366' }]}>
                      <Ionicons name="logo-whatsapp" size={18} color="#fff" />
                      <Text style={s.waTxt}>Invite via WhatsApp</Text>
                      <Ionicons name="arrow-forward" size={15} color="#fff" />
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.altBtn} onPress={copyInviteLink} activeOpacity={0.85}>
                    <Ionicons name="link" size={16} color={COLORS.accent.primary} />
                    <Text style={s.altTxt}>Copy invite link</Text>
                    <Text style={s.altSub} numberOfLines={1}>{inviteLink.replace('https://', '')}</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {/* Phone-contacts permission-gate card (native only) */}
              {Platform.OS !== 'web' && phoneContacts.permission !== 'granted' ? (
                <TouchableOpacity
                  onPress={async () => {
                    if (phoneContacts.permission === 'denied') {
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
                    await phoneContacts.load();
                  }}
                  style={s.contactsPrompt}
                  activeOpacity={0.85}
                  testID="am-contacts-prompt"
                >
                  <View style={s.contactsIcon}>
                    <Ionicons name="phone-portrait-outline" size={18} color={COLORS.accent.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.contactsTitle}>
                      {phoneContacts.permission === 'denied' ? 'Enable contacts in Settings' : 'Browse your phone contacts'}
                    </Text>
                    <Text style={s.contactsSub} numberOfLines={1}>
                      {phoneContacts.loading
                        ? 'Loading contacts…'
                        : phoneContacts.permission === 'denied'
                          ? 'We couldn\'t access your contacts. Enable access to pick friends faster.'
                          : 'Pick friends without typing their number.'}
                    </Text>
                  </View>
                  {phoneContacts.loading ? (
                    <ActivityIndicator color={COLORS.accent.primary} />
                  ) : (
                    <Ionicons name="chevron-forward" size={16} color={COLORS.text.muted} />
                  )}
                </TouchableOpacity>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            (noResults || noContacts) ? (
              <View style={s.empty}>
                <View style={s.emptyIcon}>
                  <Ionicons name={noResults ? 'search' : 'people-outline'} size={28} color={COLORS.accent.primary} />
                </View>
                <Text style={s.emptyTitle}>
                  {noResults ? `No match for "${search}"` : 'No contacts yet'}
                </Text>
                <Text style={s.emptySub}>
                  {noResults
                    ? 'Try a different name or add by phone number above.'
                    : 'Invite friends to MintU, or add anyone by phone number.'}
                </Text>
                {!noResults ? (
                  <TouchableOpacity style={s.emptyCta} onPress={() => setInviteExpanded(true)} activeOpacity={0.85}>
                    <Ionicons name="share-social" size={14} color="#fff" />
                    <Text style={s.emptyCtaTxt}>Invite someone</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null
          }
          initialNumToRender={12}
          windowSize={7}
          removeClippedSubviews={Platform.OS !== 'web'}
          keyboardShouldPersistTaps="handled"
        />

        {/* Sticky CTA footer */}
        {selected.size > 0 ? (
          <View style={s.footer}>
            <View style={{ flex: 1 }}>
              <Text style={s.footerCount}>{selected.size} selected</Text>
              <Text style={s.footerSub}>
                {[...selected.values()].slice(0, 3).map(c => c.name.split(' ')[0]).join(', ')}
                {selected.size > 3 ? ` +${selected.size - 3} more` : ''}
              </Text>
            </View>
            <TouchableOpacity
              onPress={submit}
              disabled={submitting}
              activeOpacity={0.88}
              style={[s.footerCta, submitting && { opacity: 0.7 }]}
              testID="am-submit"
              accessibilityLabel={`Add ${selected.size} to group`}
            >
              <View style={[s.footerGrad, { backgroundColor: '#0A0A0A' }]}>
                {submitting ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Ionicons name="person-add" size={16} color="#fff" />
                    <Text style={s.footerCtaTxt}>Add to group</Text>
                  </>
                )}
              </View>
            </TouchableOpacity>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ───────────────────────────── Styles ─────────────────────────────

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.bg.primary },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: c.border.subtle,
  },
  iconBtn: { width: 36, height: 36, borderRadius: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg.secondary },
  title: { fontSize: 16, fontWeight: '900', color: c.text.primary, letterSpacing: -0.2 },
  groupName: { fontSize: 11, fontWeight: '700', color: c.text.muted, marginTop: 1 },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    margin: SPACING.md, marginBottom: 0,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: c.bg.secondary, borderRadius: 0,
    borderWidth: 1, borderColor: c.border.subtle,
  },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '600', color: c.text.primary, paddingVertical: 2 },

  chipsRailWrap: { paddingTop: 10, paddingBottom: 4 },
  overline: { fontSize: 10, fontWeight: '900', color: c.text.muted, letterSpacing: 1.2, marginLeft: SPACING.md, marginBottom: 6 },
  chipsList: { paddingHorizontal: SPACING.md, paddingBottom: 4 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingLeft: 4, paddingRight: 10, paddingVertical: 4,
    backgroundColor: c.accent.primary + '18', borderRadius: 999,
    borderWidth: 1, borderColor: c.accent.primary + '44',
  },
  chipAvatar: { width: 26, height: 26, borderRadius: 0, backgroundColor: c.accent.primary, alignItems: 'center', justifyContent: 'center' },
  chipInitials: { fontSize: 11, fontWeight: '900', color: c.bg.elevated },
  chipTxt: { maxWidth: 120, fontSize: 12, fontWeight: '800', color: c.accent.primary, letterSpacing: -0.2 },

  listContent: { paddingHorizontal: 0, paddingBottom: 120 },

  manualCard: { margin: SPACING.md, marginBottom: 8, padding: SPACING.md, backgroundColor: c.bg.secondary, borderRadius: 0, borderWidth: 1, borderColor: c.border.subtle },
  phoneInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.bg.primary, borderRadius: 0, paddingHorizontal: 12, borderWidth: 1, borderColor: c.border.subtle, marginTop: 6 },
  dialCode: { fontSize: 14, fontWeight: '900', color: c.text.primary },
  phoneInput: { flex: 1, paddingVertical: 10, fontSize: 14.5, fontWeight: '700', color: c.text.primary, letterSpacing: 0.5 },
  addChipBtn: { width: 28, height: 28, borderRadius: 0, backgroundColor: c.accent.primary, justifyContent: 'center', alignItems: 'center' },

  inviteHdr: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: SPACING.md, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: c.bg.secondary, borderRadius: 0, borderWidth: 1, borderColor: c.border.subtle },
  inviteHdrTxt: { flex: 1, fontSize: 13, fontWeight: '800', color: c.text.primary },
  inviteBody: { marginHorizontal: SPACING.md, marginTop: 8, gap: 8 },
  waBtn: { borderRadius: 0, overflow: 'hidden' },
  waGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  waTxt: { fontSize: 14, fontWeight: '900', color: c.bg.elevated },
  altBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 0, backgroundColor: c.bg.secondary, borderWidth: 1, borderColor: c.border.subtle },
  altTxt: { fontSize: 13, fontWeight: '800', color: c.text.primary },
  altSub: { flex: 1, fontSize: 11, fontWeight: '600', color: c.text.muted, textAlign: 'right' },

  // Phone contacts permission prompt
  contactsPrompt: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: SPACING.md, marginTop: 10,
    padding: 14, borderRadius: 0,
    backgroundColor: c.bg.secondary,
    borderWidth: 1, borderColor: c.accent.primary + '33',
  },
  contactsIcon: {
    width: 36, height: 36, borderRadius: 0,
    backgroundColor: c.accent.primary + '1A',
    alignItems: 'center', justifyContent: 'center',
  },
  contactsTitle: { fontSize: 13.5, fontWeight: '800', color: c.text.primary, letterSpacing: -0.2 },
  contactsSub: { fontSize: 11.5, fontWeight: '500', color: c.text.muted, marginTop: 2 },

  sectionHdr: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: SPACING.md, paddingTop: 18, paddingBottom: 6,
    backgroundColor: c.bg.primary,
  },
  sectionTitle: { fontSize: 11, fontWeight: '900', color: c.text.primary, letterSpacing: 0.8, textTransform: 'uppercase' },
  sectionCount: { backgroundColor: c.bg.secondary, paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999 },
  sectionCountTxt: { fontSize: 10, fontWeight: '800', color: c.text.muted },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: SPACING.md, paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: c.bg.secondary, borderRadius: 0,
    borderWidth: 1, borderColor: c.border.subtle,
    marginBottom: 6,
  },
  rowPressed: { opacity: 0.7, transform: [{ scale: 0.99 }] },
  rowSelected: { borderColor: c.accent.primary, backgroundColor: c.accent.primary + '10' },
  rowDisabled: { opacity: 0.55 },
  textMuted: { color: c.text.muted },

  avatar: {
    width: 40, height: 40, borderRadius: 0,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.bg.primary, borderWidth: 1, borderColor: c.border.subtle,
  },
  avatarSelected: { backgroundColor: c.accent.primary, borderColor: c.accent.primary },
  avatarInitials: { fontSize: 13, fontWeight: '900', color: c.text.primary, letterSpacing: -0.2 },

  name: { fontSize: 14, fontWeight: '700', color: c.text.primary, letterSpacing: -0.2 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  phone: { flexShrink: 1, fontSize: 11.5, fontWeight: '600', color: c.text.muted },
  mintuBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: c.accent.primary + '14' },
  mintuTxt: { fontSize: 9.5, fontWeight: '900', color: c.accent.primary, letterSpacing: 0.3 },
  alreadyBadge: { fontSize: 10, fontWeight: '800', color: c.text.muted, letterSpacing: 0.3 },

  inviteBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: c.accent.primary },
  inviteTxt: { fontSize: 11.5, fontWeight: '900', color: c.accent.primary, letterSpacing: 0.2 },

  empty: { padding: 32, alignItems: 'center' },
  emptyIcon: { width: 64, height: 64, borderRadius: 0, backgroundColor: c.accent.primary + '1A', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: c.text.primary, textAlign: 'center' },
  emptySub: { fontSize: 12.5, fontWeight: '600', color: c.text.muted, textAlign: 'center', marginTop: 4, maxWidth: 280, lineHeight: 17 },
  emptyCta: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.accent.primary, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, marginTop: 14 },
  emptyCtaTxt: { fontSize: 12.5, fontWeight: '900', color: c.bg.elevated },

  footer: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: SPACING.md, paddingVertical: 12,
    backgroundColor: c.bg.primary, borderTopWidth: 1, borderTopColor: c.border.subtle,
  },
  footerCount: { fontSize: 14, fontWeight: '900', color: c.text.primary, letterSpacing: -0.2 },
  footerSub: { fontSize: 11, fontWeight: '600', color: c.text.muted, marginTop: 1 },
  footerCta: { borderRadius: 0, overflow: 'hidden' },
  footerGrad: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 18 },
  footerCtaTxt: { fontSize: 13.5, fontWeight: '900', color: c.bg.elevated, letterSpacing: -0.2 },
}));
