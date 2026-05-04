/**
 * TrustedDevicesSheet — Round 89 Priority 2 · Final redesign.
 *
 * Control-Center entry point for Profile > Security. Sourced from:
 *   GET    /api/auth/sessions       → { sessions[], devices[] }
 *   DELETE /api/auth/sessions/{id}  → single-session revoke (per-device)
 *   POST   /api/auth/logout-all     → kick everyone except current device
 *
 * UX rules (from final spec):
 *   • Current device is labeled `[ THIS DEVICE ]` and is NOT revocable.
 *   • Other devices get a `Revoke` button with confirmation + optimistic UI.
 *   • Tight Brutalist visuals — flat 2px ink dividers, no cards, no shadows.
 *
 * Current-device detection:
 *   Client device_id is sourced from utils/deviceId (SecureStore-backed).
 *   Every active session with that device_id is considered "this device".
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { listSessions, revokeSession, logoutAll } from '../../services/user';
import { getDeviceId } from '../../utils/deviceId';
import { BR_COLORS, BR_TYPE, BR_SPACE, BR_BORDER } from '../../utils/brutalist';

interface DeviceRow {
  user_id: string;
  device_id: string;
  device_name?: string;
  os?: string;
  is_trusted?: boolean;
  created_at: string;
  last_used_at: string;
}

interface SessionRow {
  id: string;
  device_id: string;
  created_at: string;
  last_used_at: string;
  expires_at: string;
  user_agent?: string;
  ip?: string;
}

function relTime(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    const diff = Date.now() - then;
    if (diff < 60_000)      return 'now';
    if (diff < 3600_000)    return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000)  return `${Math.floor(diff / 3600_000)}h ago`;
    if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
    return new Date(iso).toLocaleDateString();
  } catch { return ''; }
}

function osLabel(os?: string): string {
  const k = (os || '').toLowerCase();
  if (k === 'ios')     return 'iPhone · iOS';
  if (k === 'android') return 'Android';
  if (k === 'web')     return 'Web browser';
  return (os || 'Device');
}

function osIcon(os?: string): keyof typeof Ionicons.glyphMap {
  const k = (os || '').toLowerCase();
  if (k === 'ios')     return 'phone-portrait';
  if (k === 'android') return 'logo-android';
  if (k === 'web')     return 'globe-outline';
  return 'hardware-chip-outline';
}

// Combined device+session row shape the UI renders.
interface DeviceCard {
  device: DeviceRow;
  sessions: SessionRow[];
  isCurrent: boolean;
}

export default function TrustedDevicesSheet() {
  const [loading, setLoading]       = useState(true);
  const [err, setErr]               = useState<string | null>(null);
  const [cards, setCards]           = useState<DeviceCard[]>([]);
  const [currentDeviceId, setCur]   = useState<string | null>(null);
  const [busyId, setBusyId]         = useState<string | null>(null);   // sessionId being revoked
  const [busyAll, setBusyAll]       = useState(false);

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setErr(null);
      const [data, deviceId] = await Promise.all([
        listSessions(),
        getDeviceId(),
      ]);
      setCur(deviceId);

      const devices: DeviceRow[] = Array.isArray(data.devices) ? data.devices : [];
      const sessions: SessionRow[] = Array.isArray(data.sessions) ? data.sessions : [];

      // Group sessions under their owning device. Orphan sessions
      // (no matching device doc) render under a synthesised placeholder.
      const byDevice = new Map<string, DeviceCard>();
      devices.forEach(d => byDevice.set(d.device_id, {
        device: d,
        sessions: [],
        isCurrent: d.device_id === deviceId,
      }));
      sessions.forEach(s => {
        let card = byDevice.get(s.device_id);
        if (!card) {
          // Synthesise a minimal device record from the session.
          card = {
            device: {
              user_id: '',
              device_id: s.device_id,
              device_name: undefined,
              os: 'unknown',
              is_trusted: false,
              created_at: s.created_at,
              last_used_at: s.last_used_at,
            },
            sessions: [],
            isCurrent: s.device_id === deviceId,
          };
          byDevice.set(s.device_id, card);
        }
        card.sessions.push(s);
      });

      // Sort: current device first, then by most recent last_used.
      const list = Array.from(byDevice.values()).sort((a, b) => {
        if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
        const la = new Date(a.device.last_used_at || 0).getTime();
        const lb = new Date(b.device.last_used_at || 0).getTime();
        return lb - la;
      });
      setCards(list);
    } catch (e: any) {
      setErr(e?.message || 'Could not load trusted devices.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRevokeDevice = useCallback((card: DeviceCard) => {
    if (card.isCurrent) return;
    const name = card.device.device_name || osLabel(card.device.os);
    Alert.alert(
      `Revoke ${name}?`,
      'That device will be signed out immediately. It\'ll need an OTP to re-authenticate.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            // Optimistic: remove the card locally immediately.
            const prev = cards;
            setCards(prev.filter(c => c.device.device_id !== card.device.device_id));
            // Revoke EVERY active session on that device.
            const ids = card.sessions.map(s => s.id);
            setBusyId(card.device.device_id);
            try {
              for (const id of ids) {
                await revokeSession(id);
              }
            } catch (e: any) {
              // Rollback on failure.
              setCards(prev);
              Alert.alert('Failed', e?.message || 'Could not revoke device.');
            } finally {
              setBusyId(null);
              // Refetch to reconcile truth.
              load(true);
            }
          },
        },
      ],
    );
  }, [cards, load]);

  const onRevokeAll = useCallback(() => {
    const others = cards.filter(c => !c.isCurrent);
    if (others.length === 0) return;
    Alert.alert(
      'Revoke all other devices?',
      `${others.length} device${others.length > 1 ? 's' : ''} will be signed out. They'll need an OTP to re-authenticate.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke all',
          style: 'destructive',
          onPress: async () => {
            setBusyAll(true);
            try {
              await logoutAll();
              await load(true);
            } catch (e: any) {
              Alert.alert('Failed', e?.message || 'Could not revoke sessions.');
            } finally {
              setBusyAll(false);
            }
          },
        },
      ],
    );
  }, [cards, load]);

  if (loading) {
    return (
      <View style={[styles.bg, styles.center]}>
        <ActivityIndicator size="large" color={BR_COLORS.ink} />
        <Text style={[BR_TYPE.labelSm, { marginTop: BR_SPACE.md, color: BR_COLORS.muted }]}>
          LOADING DEVICES…
        </Text>
      </View>
    );
  }

  const totalOthers = cards.filter(c => !c.isCurrent).length;

  return (
    <ScrollView
      style={styles.bg}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.caption}>
        Devices signed into your MintU account. Revoke any that aren&rsquo;t yours.
      </Text>

      {err && (
        <View style={styles.errBox}>
          <Ionicons name="warning" size={16} color={BR_COLORS.negative} />
          <Text style={[BR_TYPE.body, { color: BR_COLORS.negative, flex: 1 }]}>{err}</Text>
          <Pressable onPress={() => load()}>
            <Text style={styles.retry}>RETRY</Text>
          </Pressable>
        </View>
      )}

      {!err && cards.length === 0 && (
        <Text style={[BR_TYPE.body, { color: BR_COLORS.muted, paddingVertical: BR_SPACE.md }]}>
          No trusted devices yet.
        </Text>
      )}

      {cards.map((card, i) => (
        <DeviceBlock
          key={card.device.device_id}
          card={card}
          first={i === 0}
          busy={busyId === card.device.device_id}
          onRevoke={() => onRevokeDevice(card)}
        />
      ))}

      {totalOthers > 0 && (
        <Pressable
          onPress={onRevokeAll}
          disabled={busyAll}
          style={({ pressed }) => [
            styles.revokeAllBtn,
            busyAll && styles.btnDisabled,
            pressed && { opacity: 0.85 },
          ]}
        >
          {busyAll ? (
            <ActivityIndicator size="small" color={BR_COLORS.negative} />
          ) : (
            <Text style={styles.revokeAllTxt}>REVOKE ALL OTHER DEVICES</Text>
          )}
        </Pressable>
      )}

      <Text style={styles.footnote}>
        Revoking signs the device out immediately. The user will need an OTP
        to re-authenticate.
      </Text>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

// ─── Device block (one row per device) ──────────────────────────────
function DeviceBlock({
  card, first, busy, onRevoke,
}: {
  card: DeviceCard;
  first: boolean;
  busy: boolean;
  onRevoke: () => void;
}) {
  const d = card.device;
  const name = d.device_name || osLabel(d.os);
  const activeSessions = card.sessions.length;
  return (
    <View style={[styles.block, first && styles.blockFirst]}>
      <View style={styles.blockHeader}>
        <View style={styles.iconBox}>
          <Ionicons name={osIcon(d.os)} size={18} color={BR_COLORS.ink} />
        </View>
        <View style={{ flex: 1, paddingHorizontal: BR_SPACE.md }}>
          <Text style={styles.deviceName} numberOfLines={1}>{name}</Text>
          <Text style={styles.deviceMeta} numberOfLines={1}>
            {osLabel(d.os)}
          </Text>
          <Text style={styles.deviceMeta} numberOfLines={1}>
            Last active {relTime(d.last_used_at)}
            {activeSessions > 1 ? ` · ${activeSessions} sessions` : ''}
          </Text>
        </View>
        {card.isCurrent ? (
          <View style={styles.thisPill}>
            <Text style={styles.thisPillTxt}>THIS DEVICE</Text>
          </View>
        ) : (
          <Pressable
            onPress={onRevoke}
            disabled={busy}
            style={({ pressed }) => [
              styles.revokeBtn,
              busy && styles.btnDisabled,
              pressed && { backgroundColor: BR_COLORS.negative, opacity: 0.9 },
            ]}
          >
            {busy ? (
              <ActivityIndicator size="small" color={BR_COLORS.negative} />
            ) : (
              <Text style={styles.revokeTxt}>REVOKE</Text>
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: BR_COLORS.paper },
  scroll: {
    paddingHorizontal: BR_SPACE.lg,
    paddingTop: BR_SPACE.md,
    paddingBottom: 40,
  },
  center: { alignItems: 'center', justifyContent: 'center' },

  caption: {
    ...BR_TYPE.meta,
    color: BR_COLORS.muted,
    marginBottom: BR_SPACE.lg,
    lineHeight: 16,
  },

  block: {
    paddingVertical: BR_SPACE.md,
    borderTopWidth: BR_BORDER.bold,
    borderColor: BR_COLORS.ink,
  },
  blockFirst: {
    borderTopWidth: BR_BORDER.bold,
  },
  blockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBox: {
    width: 40, height: 40,
    borderWidth: BR_BORDER.hair, borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.paperAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  deviceName: {
    ...BR_TYPE.bodyBold,
    color: BR_COLORS.ink,
    fontSize: 15,
  },
  deviceMeta: {
    ...BR_TYPE.meta,
    color: BR_COLORS.muted,
    marginTop: 2,
  },

  thisPill: {
    paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: BR_BORDER.hair,
    borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.ink,
  },
  thisPillTxt: {
    fontSize: 9, fontWeight: '800', letterSpacing: 1.4,
    color: '#fff',
  },

  revokeBtn: {
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: BR_BORDER.bold,
    borderColor: BR_COLORS.negative,
    backgroundColor: BR_COLORS.paper,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  revokeTxt: {
    fontSize: 10, fontWeight: '800', letterSpacing: 1.5,
    color: BR_COLORS.negative,
  },
  btnDisabled: { opacity: 0.45 },

  revokeAllBtn: {
    marginTop: BR_SPACE.xl,
    paddingVertical: 14,
    borderTopWidth: BR_BORDER.bold,
    borderBottomWidth: BR_BORDER.bold,
    borderColor: BR_COLORS.negative,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: BR_COLORS.paper,
  },
  revokeAllTxt: {
    fontSize: 12, fontWeight: '900', letterSpacing: 2,
    color: BR_COLORS.negative,
  },

  footnote: {
    ...BR_TYPE.meta,
    color: BR_COLORS.muted,
    marginTop: BR_SPACE.md,
    lineHeight: 16,
  },

  errBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: BR_SPACE.md,
    borderWidth: BR_BORDER.hair, borderColor: BR_COLORS.negative,
    backgroundColor: BR_COLORS.paperAlt,
    marginVertical: BR_SPACE.sm,
  },
  retry: { ...BR_TYPE.labelSm, color: BR_COLORS.accent },
});
