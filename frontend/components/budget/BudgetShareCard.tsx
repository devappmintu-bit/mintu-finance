/**
 * BudgetShareCard — renders a branded PNG summary the user can share.
 *
 * Usage:
 *   const ref = useRef<View>(null);
 *   <BudgetShareCard ref={ref} name="Shivam" summary={{...}} />;
 *   captureAndShare(ref);
 *
 * We deliberately render this OFF-screen (in a 1×1 wrapping container with
 * overflow:hidden) so the view exists in layout (required by view-shot) but
 * isn't visible to the user. The parent calls `captureRef(ref).then(uri => Sharing.shareAsync(uri))`.
 */
import React, { forwardRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { makeStyles } from '../../utils/makeStyles';
import { COLORS } from '../../utils/theme';



// R113 FIX — useStyles hoisted above first render-time call
// to avoid Metro/SDK52 TDZ error (`Cannot access X before init.`).
const useStyles = makeStyles((c) => ({
  card: { width: 360, borderRadius: 0, overflow: 'hidden', backgroundColor: 'transparent' },
  bg: { padding: 22 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { color: c.bg.elevated, fontSize: 14, fontWeight: '900', letterSpacing: 2, textTransform: 'uppercase' },
  month: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '700' },
  hero: { color: c.bg.elevated, fontSize: 24, fontWeight: '800', marginTop: 18, letterSpacing: -0.4 },

  amtRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 },
  amtLbl: { color: 'rgba(255,255,255,0.85)', fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  amtVal: { color: c.bg.elevated, fontSize: 22, fontWeight: '800', marginTop: 3 },

  track: { height: 10, borderRadius: 0, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden', marginTop: 16 },
  fill: { height: '100%', borderRadius: 0 },
  pct: { color: 'rgba(255,255,255,0.9)', fontSize: 11.5, fontWeight: '700', marginTop: 6 },

  kpis: { flexDirection: 'row', gap: 10, marginTop: 18 },
  kpi: { flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 0, padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  kpiLbl: { color: 'rgba(255,255,255,0.85)', fontSize: 10.5, fontWeight: '700' },
  kpiVal: { color: c.bg.elevated, fontSize: 18, fontWeight: '800', marginTop: 4 },
  kpiSub: { color: 'rgba(255,255,255,0.85)', fontSize: 10, marginTop: 2, fontWeight: '700' },

  tag: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '700', marginTop: 20, textAlign: 'center', letterSpacing: 0.5 },
}));

type Summary = {
  name?: string;
  total_budgeted?: number;
  total_spent?: number;
  top_over_category?: string;
  top_over_amount?: number;
  potential_savings?: number;
  month_label?: string;
};

type BudgetShareCardProps = { summary: Summary };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const BudgetShareCard = forwardRef(function BudgetShareCard({ summary }: BudgetShareCardProps, ref: any) {
  const stl = useStyles();
  const s = summary || {};
  const spent = Number(s.total_spent || 0);
  const budget = Number(s.total_budgeted || 0);
  const saved = Math.max(0, budget - spent);
  const pct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
  return (
    <View ref={ref} collapsable={false} style={stl.card}>
      <View style={[stl.bg, { backgroundColor: '#0A0A0A' }]}>
        <View style={stl.headRow}>
          <Text style={stl.brand}>MintU</Text>
          <Text style={stl.month}>{s.month_label || 'This month'}</Text>
        </View>
        <Text style={stl.hero}>{s.name ? `${s.name}'s money` : 'This month'}</Text>

        <View style={stl.amtRow}>
          <View>
            <Text style={stl.amtLbl}>Spent</Text>
            <Text style={stl.amtVal}>₹{Math.round(spent).toLocaleString('en-IN')}</Text>
          </View>
          <View>
            <Text style={stl.amtLbl}>Budget</Text>
            <Text style={stl.amtVal}>₹{Math.round(budget).toLocaleString('en-IN')}</Text>
          </View>
        </View>

        {/* Progress bar */}
        <View style={stl.track}>
          <View
            style={[stl.fill, { width: `${pct}%`, backgroundColor: '#FFFFFF' }]}
          />
        </View>
        <Text style={stl.pct}>{pct}% of budget used</Text>

        {/* Callout cards */}
        <View style={stl.kpis}>
          <View style={stl.kpi}>
            <Text style={stl.kpiLbl}>Saved 💰</Text>
            <Text style={stl.kpiVal}>₹{Math.round(saved).toLocaleString('en-IN')}</Text>
          </View>
          {s.top_over_category && (
            <View style={stl.kpi}>
              <Text style={stl.kpiLbl}>Top overspend</Text>
              <Text style={[stl.kpiVal, { fontSize: 15 }]} numberOfLines={1}>{s.top_over_category}</Text>
              <Text style={stl.kpiSub}>₹{Math.round(s.top_over_amount || 0).toLocaleString('en-IN')} over</Text>
            </View>
          )}
        </View>

        <Text style={stl.tag}>Track smarter on MintU — mintu.app</Text>
      </View>
    </View>
  );
});

export default BudgetShareCard;

