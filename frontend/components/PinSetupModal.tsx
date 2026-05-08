// One-time 4-digit PIN setup shown right after a fresh registration.
// Two-step flow: enter → confirm. PIN is hashed and stored in SecureStore.
// Biometric hardware is auto-enabled via lockManager (user can opt out).
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, SPACING, RADIUS } from '../utils/theme';
import { makeStyles } from '../utils/makeStyles';
import { setPin, biometricAvailable, supportedBiometricLabel, enableBiometricByDefault } from '../utils/lockManager';
import MintULogo from './MintULogo';



// R113 FIX — useStyles hoisted above first render-time call
// to avoid Metro/SDK52 TDZ error (`Cannot access X before init.`).
const useStyles = makeStyles((c) => ({
  // Round 51e — tightened vertical layout. Previously space-between
  // distributed dead space between dots and numpad on tall phones,
  // making the input feel disconnected. Switch to flex-start anchoring
  // so the dots sit ~24px above the numpad regardless of phone height.
  container: { flex: 1, backgroundColor: c.bg.primary, alignItems: 'center', paddingVertical: SPACING.xl },
  top: { alignItems: 'center', marginTop: SPACING.xl, paddingHorizontal: SPACING.lg },
  title: { fontSize: 22, fontWeight: '800', color: c.text.primary, marginTop: SPACING.md, textAlign: 'center' },
  sub: { fontSize: 14, color: c.text.muted, marginTop: 8, textAlign: 'center' },
  // Reduced top/bottom margins from `SPACING.lg` (24) to a tight 16/24
  // so the dots sit ~40px above the numpad as required.
  dotsRow: { flexDirection: 'row', gap: 18, marginTop: 24, marginBottom: 24 },
  dot: { width: 16, height: 16, borderRadius: 0, borderWidth: 2, borderColor: c.accent.primary + '55' },
  dotFilled: { backgroundColor: c.accent.primary, borderColor: c.accent.primary },
  dotErr: { borderColor: c.state.danger, backgroundColor: '#FEE2E2' },
  errorText: { color: c.state.danger, fontSize: 13, marginTop: 4, marginBottom: 4 },
  keypad: { width: '100%', maxWidth: 320, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginBottom: SPACING.lg },
  key: { width: '33.33%', aspectRatio: 1.6, alignItems: 'center', justifyContent: 'center' },
  keyText: { fontSize: 26, fontWeight: '600', color: c.text.primary },
  skipText: { fontSize: 13, color: c.text.muted, fontWeight: '600' },
  checkCircle: {
    width: 84, height: 84, borderRadius: 0, backgroundColor: c.state.success,
    alignItems: 'center', justifyContent: 'center',
    // Round 51e — moved checkmark up toward the title to reduce dead
    // space on the "You're all set" stage. Was `SPACING.xl` (32).
    marginTop: SPACING.lg,
  },
}));

interface Props {
  visible: boolean;
  onDone: () => void;
  onSkip?: () => void;
}

export default function PinSetupModal({ visible, onDone, onSkip }: Props) {
  const s = useStyles();
  const [stage, setStage] = useState<'enter' | 'confirm'>('enter');
  const [pin, setPinVal] = useState('');
  const [firstPin, setFirstPin] = useState('');
  const [error, setError] = useState('');
  const [bioLabel, setBioLabel] = useState<'Face ID' | 'Fingerprint' | 'Biometric'>('Biometric');
  const [showDone, setShowDone] = useState(false);

  React.useEffect(() => { (async () => {
    if (await biometricAvailable()) setBioLabel(await supportedBiometricLabel());
  })(); }, []);

  const reset = () => { setStage('enter'); setPinVal(''); setFirstPin(''); setError(''); setShowDone(false); };

  const press = async (d: string) => {
    if (pin.length >= 4) return;
    try { Haptics.selectionAsync(); } catch {}
    const next = pin + d;
    setPinVal(next);
    setError('');
    if (next.length === 4) {
      if (stage === 'enter') {
        setFirstPin(next);
        setStage('confirm');
        setPinVal('');
      } else {
        if (firstPin === next) {
          try {
            await setPin(next);
            // Auto-enable biometric fast-path (user-preference flag defaults to ON).
            // No-op on web / devices without enrolled biometrics.
            await enableBiometricByDefault();
            setShowDone(true);
            setTimeout(() => { reset(); onDone(); }, 1200);
          } catch (e) {
            setError('Could not save PIN');
          }
        } else {
          try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
          setError('PINs do not match — try again');
          setTimeout(() => { reset(); }, 800);
        }
      }
    }
  };

  const back = () => { if (pin.length > 0) setPinVal(pin.slice(0, -1)); };

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={s.container}>
        <View style={s.top}>
          <MintULogo size={76} />
          <Text style={s.title}>{showDone ? 'You\'re all set!' : stage === 'enter' ? 'Create a 4-digit PIN' : 'Confirm your PIN'}</Text>
          <Text style={s.sub}>
            {showDone
              ? 'Use this PIN or your ' + bioLabel + ' to unlock MintU.'
              : stage === 'enter'
                ? 'This keeps your financial data private on this device.'
                : 'Enter the same 4 digits again.'}
          </Text>
        </View>

        {!showDone && (
          <>
            <View style={s.dotsRow}>
              {[0,1,2,3].map(i => (
                <View key={i} style={[s.dot, pin.length > i && s.dotFilled, !!error && s.dotErr]} />
              ))}
            </View>
            {!!error && <Text style={s.errorText}>{error}</Text>}

            <View style={s.keypad}>
              {['1','2','3','4','5','6','7','8','9'].map(d => (
                <TouchableOpacity key={d} style={s.key} onPress={() => press(d)} activeOpacity={0.6}>
                  <Text style={s.keyText}>{d}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={s.key} onPress={onSkip} activeOpacity={0.6}>
                <Text style={s.skipText}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.key} onPress={() => press('0')} activeOpacity={0.6}>
                <Text style={s.keyText}>0</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.key} onPress={back} activeOpacity={0.6}>
                <Ionicons name="backspace-outline" size={22} color={COLORS.text.primary} />
              </TouchableOpacity>
            </View>
          </>
        )}

        {showDone && (
          <View style={{ alignItems: 'center' }}>
            <View style={s.checkCircle}><Ionicons name="checkmark" size={42} color="#fff" /></View>
          </View>
        )}
      </View>
    </Modal>
  );
}

