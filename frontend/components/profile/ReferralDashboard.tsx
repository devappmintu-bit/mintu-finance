import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, shadowStyle } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';

interface Props {
  referral: any;
  expanded: boolean;
  onToggle: () => void;
  onCopyCode: () => void;
  onShareWhatsApp: () => void;
  onShareGeneric: () => void;
  onShareScoreCard: () => void;
}

export default function ReferralDashboard({
  referral, expanded, onToggle,
  onCopyCode, onShareWhatsApp, onShareGeneric, onShareScoreCard,
}: Props) {
  const s = useStyles();
  if (!referral) return null;

  const tiers = referral.reward_tiers || [];
  const unlockedTiers = tiers.filter((t: any) => t.unlocked).length;
  const count = referral.referral_count || 0;

  const milestone = referral.next_milestone?.friends_needed > 0 ? (() => {
    const target = (referral.next_milestone?.target ?? (count + referral.next_milestone.friends_needed)) || 1;
    const prevTarget = tiers.filter((t: any) => t.unlocked).slice(-1)[0]?.target || 0;
    const pct = Math.min(100, Math.round(((count - prevTarget) / Math.max(target - prevTarget, 1)) * 100));
    return { target, pct };
  })() : null;

  return (
    <View style={s.card}>
      <TouchableOpacity onPress={onToggle} activeOpacity={0.7} style={s.header}>
        <View style={s.iconBox}><Ionicons name="gift" size={22} color="#F59E0B" /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Invite & Earn Pro</Text>
          <Text style={s.sub}>Share MintU, get free Pro days</Text>
        </View>
        <View style={s.countPill}>
          <Text style={s.countNum}>{count}</Text>
          <Text style={s.countLabel}>Invited</Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.text.muted} style={{ marginLeft: 6 }} />
      </TouchableOpacity>

      {expanded && (
        <>
          <View style={s.stats}>
            <View style={s.statBox}>
              <Text style={s.statNum}>{count}</Text>
              <Text style={s.statLbl}>Friends</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statBox}>
              <Text style={[s.statNum, { color: '#10B981' }]}>{referral.total_pro_days_earned || 0}</Text>
              <Text style={s.statLbl}>Pro Days Earned</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statBox}>
              <Text style={[s.statNum, { color: '#E65100' }]}>{unlockedTiers}/{tiers.length}</Text>
              <Text style={s.statLbl}>Tiers</Text>
            </View>
          </View>

          {milestone && (
            <View style={s.milestoneWrap}>
              <View style={s.milestone}>
                <Ionicons name="flag" size={14} color="#F59E0B" />
                <Text style={s.milestoneText}>
                  Invite{' '}<Text style={{ fontWeight: '800', color: COLORS.accent.primary }}>{referral.next_milestone.friends_needed}</Text>{' '}more to unlock{' '}<Text style={{ fontWeight: '800' }}>{referral.next_milestone.reward}</Text>
                </Text>
              </View>
              <View style={s.progressTrack}>
                <View style={[s.progressFill, { width: `${milestone.pct}%` }]} />
              </View>
              <View style={s.progressLabels}>
                <Text style={s.progressLbl}>{count}</Text>
                <Text style={s.progressLbl}>{milestone.target}</Text>
              </View>
            </View>
          )}

          <View style={s.codeBox}>
            <View style={{ flex: 1 }}>
              <Text style={s.codeLbl}>YOUR REFERRAL CODE</Text>
              <Text style={s.code}>{referral.referral_code}</Text>
            </View>
            <TouchableOpacity style={s.copyBtn} onPress={onCopyCode}>
              <Ionicons name="copy-outline" size={16} color={COLORS.accent.primary} />
              <Text style={s.copyText}>Copy</Text>
            </TouchableOpacity>
          </View>

          <View style={s.shareRow}>
            <TouchableOpacity style={[s.shareBtn, { backgroundColor: '#25D366' }]} onPress={onShareWhatsApp}>
              <Ionicons name="logo-whatsapp" size={18} color="#fff" />
              <Text style={s.shareText}>WhatsApp</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.shareBtn, { backgroundColor: COLORS.accent.primary }]} onPress={onShareGeneric}>
              <Ionicons name="share-social" size={18} color="#fff" />
              <Text style={s.shareText}>Share</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.shareBtn, { backgroundColor: '#6A1B9A' }]} onPress={onShareScoreCard}>
              <Ionicons name="ribbon" size={18} color="#fff" />
              <Text style={s.shareText}>Score Card</Text>
            </TouchableOpacity>
          </View>

          <Text style={s.tiersTitle}>REWARD MILESTONES</Text>
          {tiers.map((tier: any, i: number) => {
            const iconName = tier.icon === 'crown' ? 'ribbon' : tier.icon;
            return (
              <View key={i} style={[s.tierRow, tier.unlocked && s.tierRowUnlocked]}>
                <View style={[s.tierIcon, { backgroundColor: tier.unlocked ? '#10B98115' : COLORS.bg.secondary }]}>
                  <Ionicons name={iconName as any} size={16} color={tier.unlocked ? '#10B981' : COLORS.text.muted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.tierFriends, tier.unlocked && { color: '#10B981' }]}>
                    {tier.friends} friend{tier.friends > 1 ? 's' : ''}
                  </Text>
                  <Text style={s.tierReward}>{tier.reward}</Text>
                </View>
                {tier.unlocked ? (
                  <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                ) : (
                  <Ionicons name="lock-closed" size={14} color={COLORS.text.muted} />
                )}
              </View>
            );
          })}

          {(referral.recent_referrals || []).length > 0 && (
            <>
              <Text style={s.tiersTitle}>RECENT REFERRALS</Text>
              {referral.recent_referrals.map((r: any, i: number) => (
                <View key={i} style={s.recentRow}>
                  <View style={s.recentAvatar}>
                    <Text style={s.recentInitial}>{(r.name || 'F').charAt(0).toUpperCase()}</Text>
                  </View>
                  <Text style={s.recentName}>{r.name}</Text>
                  <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                </View>
              ))}
            </>
          )}
        </>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  card: { backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: 20, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)', ...shadowStyle('#F59E0B', 2, 10, 0.06, 3) },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#FEF3C7', justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '800', color: c.text.primary },
  sub: { fontSize: 12, color: c.text.muted, marginTop: 2 },
  countPill: { alignItems: 'center', backgroundColor: '#FEF3C7', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, minWidth: 56 },
  countNum: { fontSize: 18, fontWeight: '800', color: '#92400E' },
  countLabel: { fontSize: 9, fontWeight: '700', color: '#92400E', letterSpacing: 0.5 },
  stats: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFBEB', borderRadius: 14, paddingVertical: 12, marginTop: 14 },
  statBox: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 20, fontWeight: '800', color: '#F59E0B' },
  statLbl: { fontSize: 10, fontWeight: '600', color: c.text.muted, marginTop: 2 },
  statDivider: { width: 1, height: 28, backgroundColor: '#FDE68A' },
  milestoneWrap: { marginTop: 10 },
  milestone: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FEF3C7', borderRadius: 10, padding: 10 },
  milestoneText: { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 17 },
  progressTrack: { height: 6, backgroundColor: '#F59E0B20', borderRadius: 999, overflow: 'hidden', marginTop: 8 },
  progressFill: { height: '100%', backgroundColor: '#F59E0B', borderRadius: 999 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  progressLbl: { fontSize: 10, fontWeight: '700', color: c.text.muted },
  codeBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.bg.primary, borderWidth: 1, borderColor: c.accent.primary + '30', borderStyle: 'dashed', borderRadius: 14, padding: 14, marginTop: 12 },
  codeLbl: { fontSize: 9, fontWeight: '800', letterSpacing: 1, color: c.text.muted },
  code: { fontSize: 20, fontWeight: '800', color: c.accent.primary, letterSpacing: 1.5, marginTop: 2 },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.accent.primary + '12', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999 },
  copyText: { fontSize: 13, fontWeight: '700', color: c.accent.primary },
  shareRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  shareBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 999 },
  shareText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  tiersTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: c.text.muted, marginTop: 18, marginBottom: 8 },
  tierRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 4, borderTopWidth: 1, borderTopColor: c.border.subtle },
  tierRowUnlocked: { backgroundColor: '#F0FDF4', borderRadius: 10, paddingHorizontal: 10, borderTopColor: 'transparent' },
  tierIcon: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  tierFriends: { fontSize: 13, fontWeight: '700', color: c.text.primary },
  tierReward: { fontSize: 11, color: c.text.muted, marginTop: 1 },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  recentAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: c.accent.primary + '15', justifyContent: 'center', alignItems: 'center' },
  recentInitial: { fontSize: 13, fontWeight: '800', color: c.accent.primary },
  recentName: { flex: 1, fontSize: 13, fontWeight: '600', color: c.text.primary },
}));
