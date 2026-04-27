/**
 * Premium Reports — deep personalized analytics.
 *
 * Premium-only screen. Fetches /api/premium/deep-report, renders:
 *   • Exec summary (GPT-4o)
 *   • Totals + derived metrics card
 *   • Monthly income/expense line-ish bar chart (gifted-charts)
 *   • Top categories (pie + formatted table)
 *   • Top merchants (formatted table)
 *   • Predicted year-end projection
 *
 * Actions:
 *   - Download PDF (expo-print writePDF + expo-sharing)
 *   - Share text summary (shareSmart)
 */
import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  TouchableOpacity, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { PieChart, BarChart } from 'react-native-gifted-charts';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import api from '../utils/api';
import { COLORS } from '../utils/theme';
import { makeStyles } from '../utils/makeStyles';
import { useAuthStore } from '../store/authStore';
import Toast from 'react-native-toast-message';
import { shareSmart } from '../utils/share';

type Cat = { name: string; amount: number; pct: number };
type Merch = { name: string; amount: number; pct: number };
type Month = { month: string; income: number; expense: number; net: number };

interface Report {
  range: { months: number; from: string; to: string };
  totals: { income: number; expense: number; savings: number; savings_rate: number; transaction_count: number };
  averages: { monthly_income: number; monthly_expense: number; mom_expense_growth_pct: number };
  predicted: { year_expense: number; year_savings: number };
  monthly_series: Month[];
  top_categories: Cat[];
  top_merchants: Merch[];
  exec_summary: string;
  generated_at: string;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const CHART_COLORS = [COLORS.accent.brand, COLORS.state.successAlt, '#3B82F6', '#8B5CF6', COLORS.accent.secondary, COLORS.state.danger, '#14B8A6', '#EC4899', '#6366F1', '#84CC16'];

export default function PremiumReportsScreen() {
  const s = useStyles();
  const { user } = useAuthStore();
  const [months, setMonths] = useState<number>(6);
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  const load = async (m: number) => {
    setLoading(true); setErr(null);
    try {
      const res = await api.get(`/premium/deep-report?months=${m}`);
      setData(res.data);
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'Could not load report';
      setErr(msg);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(months); /* eslint-disable-next-line */ }, [months]);

  const pieData = useMemo(() => {
    if (!data) return [];
    return data.top_categories.slice(0, 6).map((c, i) => ({
      value: c.amount,
      color: CHART_COLORS[i % CHART_COLORS.length],
      text: '',
    }));
  }, [data]);

  const barData = useMemo(() => {
    if (!data) return [];
    const arr: any[] = [];
    data.monthly_series.forEach((m) => {
      arr.push({ value: m.income, label: m.month.slice(-2), frontColor: COLORS.state.successAlt, spacing: 2, labelWidth: 30 });
      arr.push({ value: m.expense, frontColor: COLORS.accent.brand });
    });
    return arr;
  }, [data]);

  const buildPdfHtml = (r: Report): string => {
    const name = user?.name || 'MintU User';
    const rows = (list: any[]) =>
      list.map((row, i) => `<tr>
        <td>${i + 1}</td>
        <td>${String(row.name).replace(/</g, '&lt;')}</td>
        <td style="text-align:right">${inr(row.amount)}</td>
        <td style="text-align:right">${row.pct.toFixed(1)}%</td>
      </tr>`).join('');
    const monthRows = r.monthly_series.map(m => `
      <tr>
        <td>${m.month}</td>
        <td style="text-align:right">${inr(m.income)}</td>
        <td style="text-align:right">${inr(m.expense)}</td>
        <td style="text-align:right;color:${m.net >= 0 ? COLORS.state.success : COLORS.state.danger}">${inr(m.net)}</td>
      </tr>`).join('');

    return `<!doctype html><html><head><meta charset="utf-8" />
      <style>
        * { font-family: -apple-system, Helvetica, Arial, sans-serif; }
        body { margin: 32px; color: #111; }
        h1 { color: #F56E1E; margin: 0 0 4px; font-size: 24px; }
        .sub { color: #6B7280; font-size: 12px; margin-bottom: 18px; }
        .kpis { display:flex; gap:12px; margin: 16px 0 24px; }
        .kpi { flex:1; padding: 12px 14px; border-radius: 10px; background: #FFF6ED; border:1px solid #F2D0B0; }
        .kpi .l { font-size: 10px; color: #9A5B1C; text-transform: uppercase; font-weight: 700; }
        .kpi .v { font-size: 20px; font-weight: 800; color: #7C2D12; margin-top: 3px; }
        h2 { font-size: 15px; color: #111; border-bottom: 2px solid #FFE4CC; padding-bottom: 6px; margin-top: 28px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
        th, td { padding: 8px 10px; border-bottom: 1px solid #F3F4F6; text-align: left; }
        th { background: #FFF6ED; color: #7C2D12; font-weight: 700; font-size: 11px; text-transform: uppercase; }
        .summary { background:#F0FDF4; border-left:4px solid #10B981; padding:12px; font-size:12px; border-radius:6px; white-space: pre-wrap; }
        .foot { text-align:center; color:#9CA3AF; font-size:10px; margin-top: 30px; }
      </style></head><body>
      <h1>MintU — Premium Deep Report</h1>
      <div class="sub">${name} &middot; Last ${r.range.months} months &middot; Generated ${new Date(r.generated_at).toLocaleString('en-IN')}</div>

      ${r.exec_summary ? `<div class="summary">${r.exec_summary}</div>` : ''}

      <div class="kpis">
        <div class="kpi"><div class="l">Income</div><div class="v">${inr(r.totals.income)}</div></div>
        <div class="kpi"><div class="l">Expense</div><div class="v">${inr(r.totals.expense)}</div></div>
        <div class="kpi"><div class="l">Savings</div><div class="v">${inr(r.totals.savings)}</div></div>
        <div class="kpi"><div class="l">Save rate</div><div class="v">${r.totals.savings_rate}%</div></div>
      </div>

      <h2>Monthly trend</h2>
      <table><thead><tr><th>Month</th><th style="text-align:right">Income</th><th style="text-align:right">Expense</th><th style="text-align:right">Net</th></tr></thead>
      <tbody>${monthRows}</tbody></table>

      <h2>Top categories</h2>
      <table><thead><tr><th>#</th><th>Category</th><th style="text-align:right">Amount</th><th style="text-align:right">Share</th></tr></thead>
      <tbody>${rows(r.top_categories)}</tbody></table>

      <h2>Top merchants</h2>
      <table><thead><tr><th>#</th><th>Merchant</th><th style="text-align:right">Amount</th><th style="text-align:right">Share</th></tr></thead>
      <tbody>${rows(r.top_merchants)}</tbody></table>

      <h2>Yearly projection</h2>
      <p style="font-size:12px; color:#374151">At the current pace, your estimated yearly spend is <b>${inr(r.predicted.year_expense)}</b> and projected savings are <b>${inr(r.predicted.year_savings)}</b>.</p>

      <div class="foot">Generated by MintU Premium &middot; https://mintu.app</div>
    </body></html>`;
  };

  const onDownloadPdf = async () => {
    if (!data) return;
    try {
      setSharing(true);
      const html = buildPdfHtml(data);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'MintU Premium Report' });
      } else {
        Alert.alert('Saved', `Report saved to: ${uri}`);
      }
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'PDF failed', text2: e?.message || 'Try again' });
    } finally { setSharing(false); }
  };

  const onShareSummary = async () => {
    if (!data) return;
    const tops = data.top_categories.slice(0, 3).map(c => `${c.name} ${c.pct}%`).join(', ');
    await shareSmart({
      title: 'My MintU Premium Report',
      message: `📊 My MintU ${data.range.months}-month report\n\nIncome: ${inr(data.totals.income)}\nExpense: ${inr(data.totals.expense)}\nSavings: ${inr(data.totals.savings)} (${data.totals.savings_rate}%)\nTop categories: ${tops}\n\nTry MintU: https://mintu.app`,
    });
  };

  return (
    <SafeAreaView style={s.bg} edges={['top']}>
      <View style={s.topbar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#111" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.topTitle}>Deep Reports</Text>
          <Text style={s.topSub}>Premium · {months} months</Text>
        </View>
        <TouchableOpacity onPress={onShareSummary} style={s.iconBtn}>
          <Ionicons name="share-social-outline" size={20} color={COLORS.accent.brand} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onDownloadPdf} disabled={!data || sharing} style={[s.iconBtn, { backgroundColor: COLORS.accent.brand }]}>
          {sharing ? <ActivityIndicator color="#fff" /> : <Ionicons name="download-outline" size={20} color="#fff" />}
        </TouchableOpacity>
      </View>

      {/* Range selector */}
      <View style={s.chipsRow}>
        {[3, 6, 12].map(m => (
          <TouchableOpacity key={m} style={[s.chip, m === months && s.chipOn]} onPress={() => setMonths(m)}>
            <Text style={[s.chipTxt, m === months && s.chipTxtOn]}>{m}M</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {loading && (
          <View style={{ paddingVertical: 80, alignItems: 'center' }}>
            <ActivityIndicator color={COLORS.accent.primary} />
            <Text style={{ color: COLORS.text.muted, marginTop: 12 }}>Crunching your numbers…</Text>
          </View>
        )}

        {!!err && !loading && (
          <View style={s.errBox}>
            <Ionicons name="lock-closed" size={32} color={COLORS.accent.brand} />
            <Text style={s.errTitle}>{err}</Text>
            <TouchableOpacity style={s.ctaBtn} onPress={() => router.replace('/premium' as any)}>
              <LinearGradient colors={[COLORS.accent.brand, COLORS.accent.brandDark]} style={s.ctaGrad}>
                <Text style={s.ctaText}>Start saving today</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        {!!data && !loading && (
          <>
            {/* Exec summary */}
            {!!data.exec_summary && (
              <View style={s.summaryCard}>
                <View style={s.sumHeader}>
                  <Ionicons name="sparkles" size={16} color="#fff" />
                  <Text style={s.sumTitle}>AI executive summary</Text>
                </View>
                <Text style={s.sumBody}>{data.exec_summary}</Text>
              </View>
            )}

            {/* KPI grid */}
            <View style={s.kpiGrid}>
              {kpi('Income', inr(data.totals.income), COLORS.state.successAlt)}
              {kpi('Expense', inr(data.totals.expense), COLORS.accent.brand)}
              {kpi('Savings', inr(data.totals.savings), data.totals.savings >= 0 ? COLORS.state.success : COLORS.state.danger)}
              {kpi('Save rate', `${data.totals.savings_rate}%`, '#3B82F6')}
            </View>

            {/* Monthly bar chart */}
            <View style={s.card}>
              <Text style={s.cardTitle}>Monthly income vs expense</Text>
              <View style={{ height: 230, marginTop: 8 }}>
                <BarChart
                  data={barData}
                  barWidth={12}
                  spacing={14}
                  noOfSections={4}
                  yAxisThickness={0}
                  xAxisThickness={0}
                  xAxisLabelTextStyle={{ color: COLORS.text.muted, fontSize: 10 }}
                  yAxisTextStyle={{ color: COLORS.text.muted, fontSize: 10 }}
                  hideRules
                />
              </View>
              <View style={s.legendRow}>
                <View style={[s.legendDot, { backgroundColor: COLORS.state.successAlt }]} /><Text style={s.legendTxt}>Income</Text>
                <View style={[s.legendDot, { backgroundColor: COLORS.accent.brand, marginLeft: 16 }]} /><Text style={s.legendTxt}>Expense</Text>
              </View>
            </View>

            {/* Category pie + table */}
            <View style={s.card}>
              <Text style={s.cardTitle}>Top spend categories</Text>
              <View style={{ alignItems: 'center', marginTop: 12 }}>
                <PieChart
                  data={pieData as any}
                  donut
                  innerRadius={50}
                  radius={90}
                  centerLabelComponent={() => (
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ fontSize: 11, color: COLORS.text.muted }}>Total</Text>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: '#111' }}>{inr(data.totals.expense)}</Text>
                    </View>
                  )}
                />
              </View>
              <View style={{ marginTop: 16 }}>
                <TableHeader cols={['Category', 'Amount', 'Share']} />
                {data.top_categories.slice(0, 8).map((c, i) => (
                  <View key={c.name} style={s.tr}>
                    <View style={[s.pctDot, { backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }]} />
                    <Text style={[s.td, { flex: 2 }]} numberOfLines={1}>{c.name}</Text>
                    <Text style={[s.td, s.tdRight]}>{inr(c.amount)}</Text>
                    <Text style={[s.td, s.tdRight, { color: COLORS.text.muted }]}>{c.pct.toFixed(1)}%</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Top merchants */}
            <View style={s.card}>
              <Text style={s.cardTitle}>Top merchants</Text>
              <TableHeader cols={['Merchant', 'Amount', 'Share']} />
              {data.top_merchants.slice(0, 10).map((m) => (
                <View key={m.name} style={s.tr}>
                  <Text style={[s.td, { flex: 2 }]} numberOfLines={1}>{m.name}</Text>
                  <Text style={[s.td, s.tdRight]}>{inr(m.amount)}</Text>
                  <Text style={[s.td, s.tdRight, { color: COLORS.text.muted }]}>{m.pct.toFixed(1)}%</Text>
                </View>
              ))}
            </View>

            {/* Projections */}
            <View style={s.card}>
              <Text style={s.cardTitle}>Year-end projection</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <View style={[s.projectionBox, { backgroundColor: '#FFF4E8', borderColor: '#F56E1E40' }]}>
                  <Text style={s.projLbl}>Expected spend</Text>
                  <Text style={[s.projVal, { color: COLORS.accent.brandDark }]}>{inr(data.predicted.year_expense)}</Text>
                </View>
                <View style={[s.projectionBox, { backgroundColor: '#F0FDF4', borderColor: '#10B98140' }]}>
                  <Text style={s.projLbl}>Expected savings</Text>
                  <Text style={[s.projVal, { color: COLORS.state.success }]}>{inr(data.predicted.year_savings)}</Text>
                </View>
              </View>
              <View style={s.momBox}>
                <Ionicons
                  name={data.averages.mom_expense_growth_pct >= 0 ? 'trending-up' : 'trending-down'}
                  size={16}
                  color={data.averages.mom_expense_growth_pct >= 0 ? COLORS.state.danger : COLORS.state.success}
                />
                <Text style={s.momTxt}>
                  Month-over-month expense change: <Text style={{ fontWeight: '800', color: data.averages.mom_expense_growth_pct >= 0 ? COLORS.state.danger : COLORS.state.success }}>{data.averages.mom_expense_growth_pct.toFixed(1)}%</Text>
                </Text>
              </View>
            </View>

            {/* Share / Download CTA row */}
            <View style={s.ctaRow}>
              <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#F5F5F4' }]} onPress={onShareSummary}>
                <Ionicons name="share-social" size={18} color="#111" />
                <Text style={s.actionTxt}>Share summary</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.actionBtn, { backgroundColor: COLORS.accent.brand }]} onPress={onDownloadPdf} disabled={sharing}>
                {sharing
                  ? <ActivityIndicator color="#fff" />
                  : <Ionicons name="download" size={18} color="#fff" />}
                <Text style={[s.actionTxt, { color: '#fff' }]}>Download PDF</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function kpi(label: string, value: string, color: string) {
  const s = useStyles(); // TODO: runtime fix needed (Round 49) — was missing, caused undefined-styles crash
  return (
    <View style={[s.kpi, { borderColor: color + '40' }]}>
      <View style={[s.kpiBar, { backgroundColor: color }]} />
      <Text style={s.kpiLbl}>{label}</Text>
      <Text style={[s.kpiVal, { color }]}>{value}</Text>
    </View>
  );
}

function TableHeader({ cols }: { cols: string[] }) {
  const s = useStyles();
  return (
    <View style={s.thRow}>
      <View style={{ width: 14 }} />
      <Text style={[s.th, { flex: 2 }]}>{cols[0]}</Text>
      <Text style={[s.th, s.tdRight]}>{cols[1]}</Text>
      <Text style={[s.th, s.tdRight]}>{cols[2]}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  bg: { flex: 1, backgroundColor: '#FAFAF9' },
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: c.bg.elevated, borderBottomWidth: 1, borderBottomColor: c.gray[100] },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.gray[100], alignItems: 'center', justifyContent: 'center' },
  iconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontSize: 17, fontWeight: '800', color: c.text.primary },
  topSub: { fontSize: 11, color: '#9A5B1C', fontWeight: '600', marginTop: 1 },

  chipsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: c.bg.elevated, borderBottomWidth: 1, borderBottomColor: c.gray[100] },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: c.gray[100] },
  chipOn: { backgroundColor: c.accent.brand },
  chipTxt: { fontSize: 12, fontWeight: '700', color: c.text.muted },
  chipTxtOn: { color: c.bg.elevated },

  summaryCard: { backgroundColor: c.text.primary, borderRadius: 16, padding: 14, marginBottom: 14 },
  sumHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  sumTitle: { color: '#FBBF24', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  sumBody: { color: c.gray[50], fontSize: 13, lineHeight: 19 },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  kpi: { width: '48%', padding: 10, borderRadius: 12, backgroundColor: c.bg.elevated, borderWidth: 1, position: 'relative', overflow: 'hidden' },
  kpiBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  kpiLbl: { fontSize: 11, color: c.text.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3, marginLeft: 4 },
  kpiVal: { fontSize: 18, fontWeight: '800', marginTop: 2, marginLeft: 4 },

  card: { backgroundColor: c.bg.elevated, borderRadius: 16, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: c.gray[100] },
  cardTitle: { fontSize: 13, fontWeight: '800', color: c.text.primary, letterSpacing: 0.2 },

  legendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendTxt: { marginLeft: 6, fontSize: 11, color: c.text.muted, fontWeight: '600' },

  thRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: c.gray[100], marginTop: 10 },
  th: { fontSize: 10, fontWeight: '800', color: c.text.muted, letterSpacing: 0.5, textTransform: 'uppercase' },
  tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.gray[50] },
  td: { fontSize: 13, color: c.text.primary, flex: 1 },
  tdRight: { textAlign: 'right' },
  pctDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },

  projectionBox: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1 },
  projLbl: { fontSize: 11, color: c.text.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  projVal: { fontSize: 18, fontWeight: '800', marginTop: 4 },
  momBox: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingVertical: 10, marginTop: 6, borderTopWidth: 1, borderTopColor: c.gray[100] },
  momTxt: { fontSize: 12, color: '#374151' },

  ctaRow: { flexDirection: 'row', gap: 10, marginTop: 6, marginBottom: 20 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14 },
  actionTxt: { fontWeight: '800', fontSize: 14, color: c.text.primary },

  errBox: { alignItems: 'center', paddingVertical: 50, paddingHorizontal: 20 },
  errTitle: { fontSize: 14, fontWeight: '700', color: c.text.primary, marginTop: 12, textAlign: 'center' },
  ctaBtn: { marginTop: 16, borderRadius: 999, overflow: 'hidden' },
  ctaGrad: { paddingHorizontal: 24, paddingVertical: 12 },
  ctaText: { color: c.bg.elevated, fontWeight: '800', fontSize: 14 },
}));
