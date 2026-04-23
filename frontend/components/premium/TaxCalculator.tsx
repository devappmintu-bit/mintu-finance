// Tax calculator — Old vs New regime with 80C/80D/HRA.
import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Toast from 'react-native-toast-message';
import api from '../../utils/api';
import { COLORS } from '../../utils/theme';
import { useActivePlan, FEATURES, canAccess } from '../../utils/premium';
import { usePremiumStyles, fmtINR } from './styles';
import { LockedState } from './Shared';

export default function TaxCalculator() {
  const styles = usePremiumStyles();
  const [plan] = useActivePlan();
  const locked = !canAccess(FEATURES.TAX_CALCULATOR, plan);
  const [income, setIncome] = useState('1200000');
  const [c80c, setC80c] = useState('');
  const [c80d, setC80d] = useState('');
  const [hra, setHra] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const calculate = async () => {
    setLoading(true);
    try {
      const res = await api.post('/premium/tax-calculator', {
        annual_income: Number(income) || 0,
        section_80c: Number(c80c) || 0,
        section_80d: Number(c80d) || 0,
        hra_exempt: Number(hra) || 0,
      });
      setResult(res.data);
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Could not calculate', text2: e?.response?.data?.detail || 'Try again' });
    } finally { setLoading(false); }
  };

  if (locked) return <LockedState feature="Tax Calculator" desc="Estimate savings under Old vs New regime, with 80C/80D/HRA tools." minPlan="monthly" />;

  return (
    <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🧾 Tax Estimator · FY 2025-26</Text>
        <Text style={styles.cardSub}>New Budget 2025 slabs. Compare Old vs New regime.</Text>
        <Text style={styles.label}>Annual Income (₹)</Text>
        <TextInput style={styles.input} value={income} onChangeText={setIncome} keyboardType="numeric" placeholder="e.g., 1200000" placeholderTextColor={COLORS.text.muted} />
        <Text style={styles.label}>80C Investments (ELSS/PPF/LIC) · Old regime only</Text>
        <TextInput style={styles.input} value={c80c} onChangeText={setC80c} keyboardType="numeric" placeholder="Max ₹1,50,000" placeholderTextColor={COLORS.text.muted} />
        <Text style={styles.label}>80D Health Insurance · Old regime only</Text>
        <TextInput style={styles.input} value={c80d} onChangeText={setC80d} keyboardType="numeric" placeholder="Max ₹75,000" placeholderTextColor={COLORS.text.muted} />
        <Text style={styles.label}>HRA Exemption · Old regime only</Text>
        <TextInput style={styles.input} value={hra} onChangeText={setHra} keyboardType="numeric" placeholder="Monthly × 12" placeholderTextColor={COLORS.text.muted} />
        <TouchableOpacity style={styles.primaryBtn} onPress={calculate} disabled={loading} activeOpacity={0.85}>
          <LinearGradient colors={[COLORS.accent.primaryLight, COLORS.accent.primary]} style={styles.primaryBtnGrad}>
            {loading ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="calculator" size={18} color="#fff" />
                <Text style={styles.primaryBtnText}>Calculate Tax</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {result && (
        <>
          <View style={[styles.card, styles.recCard]}>
            <View style={styles.recHeader}>
              <Text style={styles.recHeaderLabel}>RECOMMENDED · {result.recommendation?.regime?.toUpperCase() || ''}</Text>
              <View style={styles.recBadge}><Text style={styles.recBadgeText}>SAVE {fmtINR(result.recommendation?.savings || 0)}</Text></View>
            </View>
            <Text style={styles.recHeadline}>{result.recommendation?.reason}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Old vs New regime</Text>
            <View style={styles.compareGrid}>
              <View style={[styles.compareCol, result.recommendation?.regime === 'new' && styles.compareColWin]}>
                <Text style={styles.compareHead}>NEW</Text>
                <Text style={styles.compareBig}>{fmtINR(result.new_regime?.total_tax || 0)}</Text>
                <Text style={styles.compareSub}>total tax</Text>
                <Text style={styles.compareDetail}>Take-home: {fmtINR(result.new_regime?.take_home || 0)}</Text>
              </View>
              <View style={[styles.compareCol, result.recommendation?.regime === 'old' && styles.compareColWin]}>
                <Text style={styles.compareHead}>OLD</Text>
                <Text style={styles.compareBig}>{fmtINR(result.old_regime?.total_tax || 0)}</Text>
                <Text style={styles.compareSub}>total tax</Text>
                <Text style={styles.compareDetail}>Take-home: {fmtINR(result.old_regime?.take_home || 0)}</Text>
              </View>
            </View>
          </View>
          {result.optimization_suggestions?.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>💡 How to save more</Text>
              {result.optimization_suggestions.map((s: any, i: number) => (
                <View key={i} style={styles.sugRow}>
                  <View style={styles.sugIcon}><Ionicons name="bulb" size={14} color={COLORS.accent.primary} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sugTitle}>{s.title || s.section}</Text>
                    <Text style={styles.sugDetail}>{s.detail || s.description}</Text>
                  </View>
                  {s.potential_savings ? <Text style={styles.sugSave}>+{fmtINR(s.potential_savings)}</Text> : null}
                </View>
              ))}
            </View>
          )}
          <Text style={styles.disclaimer}>{result.disclaimer || 'Estimates only. Consult a CA for actual filing.'}</Text>
        </>
      )}
    </ScrollView>
  );
}
