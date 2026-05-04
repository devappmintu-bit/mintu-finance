/**
 * useProfileData.ts — Round 68 R4 decomposition
 *
 * Encapsulates all data fetching + avatar mutations for the Profile
 * screen. Previously these ~80 lines lived directly in
 * /app/(tabs)/profile.tsx along with biometric/PIN/UI state, making
 * the orchestrator hard to navigate.
 *
 * Owns:
 *   • Parallel fan-out fetch of 9 profile endpoints
 *   • useFocusEffect-driven reload (no duplicate mount-fetch)
 *   • derived `realStats` memo (savings rate, top category, etc.)
 *   • avatar upload/delete handlers (with rollback on failure)
 *   • `initialLoading` + `refreshing` lifecycle flags
 *
 * Returns a single bundle so the orchestrator file becomes pure
 * presentation-and-side-effects glue (PIN/biometric/sheets stay
 * inline because they're UI-coupled).
 */
import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import api from '../utils/api';
import { useAuthStore } from '../store/authStore';
import { useFinContext } from '../store/financialContext';
import { fetchAnalyticsSummary } from '../services/transactions';
import { fetchGamificationStatus } from '../services/rewards';
import { fetchAvatar, uploadAvatar, deleteAvatar } from '../services/user';
import { showSuccess, showInfo } from '../utils/toast';
import Toast from 'react-native-toast-message';
import type { Mission } from '../components/profile/MissionsEngine';

export type ProfileDataBundle = {
  // Raw data surfaces
  stats: any;
  gamiStatus: any;
  rewardsSummary: any;
  identity: any;
  breakdown: any;
  weekly: any;
  missionsData: { missions: Mission[]; seconds_to_refresh: number; total_xp: number; total_coins: number } | null;
  gmailStatus: any;

  // Derived
  realStats: {
    monthlySpend: number;
    topCategory: { name: string; amount: number } | null;
    savingsRate: number;
    transactionCount: number;
    balance: number;
  } | null;
  todayMissions: Mission[];

  // Lifecycle
  initialLoading: boolean;
  refreshing: boolean;
  setRefreshing: (v: boolean) => void;
  loadData: () => Promise<void>;

  // Avatar handlers (with optimistic rollback)
  handleAvatarPicked: (base64DataUri: string) => Promise<void>;
  handleAvatarRemoved: () => Promise<void>;
};

export function useProfileData(): ProfileDataBundle {
  const { avatar, setAvatar } = useAuthStore();

  const [refreshing, setRefreshing] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Raw fetched payloads
  const [stats, setStats] = useState<any>(null);
  const [gamiStatus, setGamiStatus] = useState<any>(null);
  const [rewardsSummary, setRewardsSummary] = useState<any>(null);
  const [identity, setIdentity] = useState<any>(null);
  const [breakdown, setBreakdown] = useState<any>(null);
  const [weekly, setWeekly] = useState<any>(null);
  const [missionsData, setMissionsData] = useState<{ missions: Mission[]; seconds_to_refresh: number; total_xp: number; total_coins: number } | null>(null);
  const [gmailStatus, setGmailStatus] = useState<any>(null);

  const loadData = useCallback(async () => {
    try {
      // Phase 3: analytics & gamification flow through the services
      // layer; the remaining 7 endpoints are profile-scoped fetches
      // with no service wrapping. Single Promise.all so a slow
      // endpoint doesn't block the others.
      const [
        avatarRes,
        statsData,
        gamiData,
        rewardsRes,
        identityRes,
        breakdownRes,
        weeklyRes,
        missionsRes,
        gmailRes,
      ] = await Promise.all([
        fetchAvatar().then((data) => ({ data })).catch(() => ({ data: {} })),
        fetchAnalyticsSummary().catch(() => null),
        fetchGamificationStatus().catch(() => null),
        api.get('/rewards/summary').catch(() => ({ data: null })),
        api.get('/profile/identity').catch(() => ({ data: null })),
        api.get('/profile/score-breakdown').catch(() => ({ data: null })),
        api.get('/profile/weekly-comparison').catch(() => ({ data: null })),
        api.get('/profile/missions').catch(() => ({ data: null })),
        api.get('/gmail/status').catch(() => ({ data: null })),
      ]);
      if ((avatarRes.data as any)?.avatar) setAvatar((avatarRes.data as any).avatar);
      if (statsData) setStats(statsData);
      if (gamiData) setGamiStatus(gamiData);
      if (rewardsRes.data) setRewardsSummary(rewardsRes.data);
      if (identityRes.data) setIdentity(identityRes.data);
      if (breakdownRes.data) setBreakdown(breakdownRes.data);
      if (weeklyRes.data) setWeekly(weeklyRes.data);
      if (missionsRes.data) setMissionsData(missionsRes.data);
      if (gmailRes.data) setGmailStatus(gmailRes.data);

      // Round 82 — SSoT hydration. Push profile + stats into
      // useFinContext so downstream AI-Coach / News / Brain
      // consumers see fresh numbers without re-fetching.
      try {
        useFinContext.getState().hydrateFromProfile({
          identity: identityRes.data,
          stats:    statsData,
        });
      } catch { /* noop */ }
    } catch { /* noop */ }
    finally {
      setRefreshing(false);
      setInitialLoading(false);
    }
  }, [setAvatar]);

  // Phase 2 fix (H-1): useFocusEffect already covers initial mount —
  // the focus event fires the first time a tab becomes active. A
  // separate useEffect previously caused 9 endpoints × 2 = 18 redundant
  // API requests on first profile open.
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  // Derived stats — only recompute when raw stats changes.
  const realStats = useMemo(() => {
    if (!stats) return null;
    const income = Number(stats.total_income || 0);
    const expense = Number(stats.total_expense || 0);
    const savingsRate = income > 0 ? Math.max(0, Math.round(((income - expense) / income) * 100)) : 0;
    const cb = stats.category_breakdown || {};
    const topCat = Object.entries(cb).sort((a: any, b: any) => b[1] - a[1])[0];
    return {
      monthlySpend: expense,
      topCategory: topCat ? { name: topCat[0], amount: Number(topCat[1]) } : null,
      savingsRate,
      transactionCount: Number(stats.transaction_count || 0),
      balance: Number(stats.balance || 0),
    };
  }, [stats]);

  const todayMissions = missionsData?.missions || [];

  // Avatar upload — optimistic with rollback on failure so we never
  // leave the local state ahead of the server.
  const handleAvatarPicked = useCallback(async (base64DataUri: string) => {
    const prevAvatar = avatar;
    await setAvatar(base64DataUri);
    try {
      await uploadAvatar(base64DataUri);
      showSuccess('Profile photo updated');
    } catch {
      await setAvatar(prevAvatar);
      Toast.show({
        type: 'error',
        text1: "Couldn't save photo",
        text2: 'Try again in a moment.',
      });
    }
  }, [avatar, setAvatar]);

  const handleAvatarRemoved = useCallback(async () => {
    await setAvatar('');
    try {
      await deleteAvatar();
      showSuccess('Profile photo removed');
    } catch {
      showInfo('Removed locally');
    }
  }, [setAvatar]);

  return {
    stats, gamiStatus, rewardsSummary, identity, breakdown, weekly,
    missionsData, gmailStatus,
    realStats, todayMissions,
    initialLoading, refreshing, setRefreshing, loadData,
    handleAvatarPicked, handleAvatarRemoved,
  };
}
