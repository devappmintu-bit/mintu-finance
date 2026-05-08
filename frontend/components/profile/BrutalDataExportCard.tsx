/**
 * BrutalDataExportCard — R109.
 *
 * Profile-section card exposing the new power-user data export
 * endpoints (R109). Built atop the unified `components/brutal/*`
 * primitive library — concrete, on-screen evidence of the brutal
 * convergence sprint.
 *
 * Surfaces:
 *   • One BrutalCard hero with the "DATA EXPORT" stamp
 *   • Three BrutalButton rows: transactions.csv / budgets.csv /
 *     all.json — each kicks a download via an authenticated fetch
 *     to /api/export/* and either saves the blob (web) or hands
 *     it to expo-sharing (native)
 *   • Brutal toast confirmations on success/failure
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import {
  BrutalCard,
  BrutalButton,
  BR_COLORS,
  BR_SPACE,
  BR_FONT,
} from '../brutal';
import { showBrutalToast } from '../../store/brutalToastStore';
import { useAuthStore } from '../../store/authStore';

type Kind = 'transactions' | 'budgets' | 'all';
const PATHS: Record<Kind, { url: string; ext: string; mime: string; label: string }> = {
  transactions: {
    url: '/api/export/transactions.csv',
    ext: 'csv',
    mime: 'text/csv',
    label: 'Transactions CSV',
  },
  budgets: {
    url: '/api/export/budgets.csv',
    ext: 'csv',
    mime: 'text/csv',
    label: 'Budgets CSV',
  },
  all: {
    url: '/api/export/all.json',
    ext: 'json',
    mime: 'application/json',
    label: 'Full bundle (.json)',
  },
};

export default function BrutalDataExportCard() {
  const [busy, setBusy] = useState<Kind | null>(null);

  const fire = async (kind: Kind) => {
    if (busy) return;
    setBusy(kind);
    const cfg = PATHS[kind];
    try {
      const accessToken = useAuthStore.getState().accessToken;
      const apiBase = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const resp = await fetch(`${apiBase}${cfg.url}`, {
        headers: {
          Authorization: accessToken ? `Bearer ${accessToken}` : '',
          Accept: cfg.mime,
        },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const filename = `mintu_${kind}_${new Date().toISOString().slice(0, 10)}.${cfg.ext}`;

      // Native blob → either trigger anchor download (web) or hand
      // off to expo-sharing/file-system (native). React-Native-Web
      // supports blob/anchor reliably — covers both Expo web preview
      // and any future PWA build.
      const blob = await resp.blob();
      if (Platform.OS === 'web') {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
      } else {
        // Native path — write blob to a tmp file then share. Lazy
        // imports keep the web bundle thin.
        try {
          const FS = await import('expo-file-system');
          const Sharing = await import('expo-sharing');
          const path = `${FS.documentDirectory}${filename}`;
          const text = await blob.text();
          await FS.writeAsStringAsync(path, text);
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(path, { mimeType: cfg.mime, dialogTitle: filename });
          } else {
            showBrutalToast(`Saved → ${path}`, 'positive');
          }
        } catch {
          showBrutalToast('Saved (sharing unavailable)', 'warning');
        }
      }
      showBrutalToast(`✓ ${cfg.label} ready`, 'positive');
    } catch (_e) {
      showBrutalToast(`Export failed · ${cfg.label}`, 'danger');
    } finally {
      setBusy(null);
    }
  };

  return (
    <BrutalCard variant="base" style={styles.wrap}>
      <View style={styles.head}>
        <View style={styles.stamp}>
          <Text style={styles.stampText}>POWER USER</Text>
        </View>
        <Text style={styles.title}>Data Export</Text>
      </View>
      <Text style={styles.sub}>
        Take your money data anywhere. CSV + JSON snapshots are streamed straight from your account — no third-party in the loop.
      </Text>

      <View style={styles.btnStack}>
        <BrutalButton
          label="Transactions"
          icon="document-text-outline"
          tone="ink"
          size="md"
          fullWidth
          loading={busy === 'transactions'}
          disabled={!!busy && busy !== 'transactions'}
          onPress={() => fire('transactions')}
          testID="export-transactions-btn"
        />
        <BrutalButton
          label="Budgets"
          icon="pie-chart-outline"
          tone="paper"
          size="md"
          fullWidth
          loading={busy === 'budgets'}
          disabled={!!busy && busy !== 'budgets'}
          onPress={() => fire('budgets')}
          testID="export-budgets-btn"
        />
        <BrutalButton
          label="Full bundle (.json)"
          icon="archive-outline"
          tone="paper"
          size="md"
          fullWidth
          loading={busy === 'all'}
          disabled={!!busy && busy !== 'all'}
          onPress={() => fire('all')}
          testID="export-all-btn"
        />
      </View>
    </BrutalCard>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginVertical: BR_SPACE['3'],
    padding: BR_SPACE['4'],
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: BR_SPACE['2'],
    marginBottom: BR_SPACE['2'],
  },
  stamp: {
    backgroundColor: BR_COLORS.ink,
    paddingHorizontal: BR_SPACE['2'],
    paddingVertical: 3,
  },
  stampText: {
    ...BR_FONT.stamp,
    color: '#fff',
    fontSize: 10,
  },
  title: {
    ...BR_FONT.h2,
    color: BR_COLORS.ink,
    fontSize: 22,
  },
  sub: {
    ...BR_FONT.body,
    color: BR_COLORS.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: BR_SPACE['4'],
  },
  btnStack: {
    gap: BR_SPACE['3'],
  },
});
