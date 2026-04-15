import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../store/authStore';
import api from '../utils/api';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING } from '../utils/theme';

export default function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { setUser, setToken } = useAuthStore();

  const handleAuth = async () => {
    if (!phone || !password || (!isLogin && !name)) {
      Alert.alert('Oops!', 'Please fill all fields');
      return;
    }
    setLoading(true);
    try {
      const endpoint = isLogin ? '/auth/login' : '/auth/register';
      const data = isLogin ? { phone, password } : { phone, name, password };
      const response = await api.post(endpoint, data);
      await setToken(response.data.token);
      setUser(response.data.user);
      router.replace('/(tabs)');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.logoIcon}>
              <Text style={styles.logoSymbol}>₹</Text>
            </View>
            <Text style={styles.logoText}>MintU</Text>
            <Text style={styles.welcomeText}>
              {isLogin ? 'Welcome back!' : 'Create your account'}
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {!isLogin && (
              <View style={styles.inputWrapper}>
                <Ionicons name="person-outline" size={20} color={COLORS.text.muted} style={styles.inputIcon} />
                <TextInput
                  testID="auth-name-input"
                  style={styles.input}
                  placeholder="Full name"
                  placeholderTextColor={COLORS.text.muted}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                />
              </View>
            )}

            <View style={styles.inputWrapper}>
              <Ionicons name="call-outline" size={20} color={COLORS.text.muted} style={styles.inputIcon} />
              <TextInput
                testID="auth-phone-input"
                style={styles.input}
                placeholder="Phone number"
                placeholderTextColor={COLORS.text.muted}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                maxLength={10}
              />
            </View>

            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color={COLORS.text.muted} style={styles.inputIcon} />
              <TextInput
                testID="auth-password-input"
                style={[styles.input, { flex: 1 }]}
                placeholder="Password"
                placeholderTextColor={COLORS.text.muted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={COLORS.text.muted} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              testID="auth-submit-btn"
              style={[styles.submitButton, loading && styles.submitDisabled]}
              onPress={handleAuth}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.bg.primary} />
              ) : (
                <Text style={styles.submitText}>{isLogin ? 'Sign In' : 'Create Account'}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity testID="auth-switch-btn" style={styles.switchButton} onPress={() => setIsLogin(!isLogin)}>
              <Text style={styles.switchText}>
                {isLogin ? "Don't have an account? " : 'Already have an account? '}
                <Text style={styles.switchHighlight}>{isLogin ? 'Sign Up' : 'Sign In'}</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg.primary },
  keyboardView: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: SPACING.xxl },
  header: { alignItems: 'center', marginBottom: 48 },
  logoIcon: {
    width: 68, height: 68, borderRadius: 22, backgroundColor: COLORS.accent.primary,
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
    shadowColor: COLORS.accent.primary, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3, shadowRadius: 16, elevation: 8,
  },
  logoSymbol: { fontSize: 32, fontWeight: '800', color: COLORS.bg.primary },
  logoText: { fontSize: 32, fontWeight: '800', color: COLORS.text.primary, marginBottom: 8 },
  welcomeText: { fontSize: 16, color: COLORS.text.secondary },
  form: { gap: 16 },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bg.secondary,
    borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.border.subtle,
    paddingHorizontal: SPACING.lg,
  },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, paddingVertical: 18, fontSize: 16, color: COLORS.text.primary },
  eyeButton: { padding: 8 },
  submitButton: {
    backgroundColor: COLORS.accent.primary, borderRadius: RADIUS.full, paddingVertical: 18,
    alignItems: 'center', marginTop: 8,
    shadowColor: COLORS.accent.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 8,
  },
  submitDisabled: { opacity: 0.6 },
  submitText: { fontSize: 17, fontWeight: '700', color: COLORS.bg.primary },
  switchButton: { alignItems: 'center', marginTop: 16 },
  switchText: { fontSize: 14, color: COLORS.text.secondary },
  switchHighlight: { color: COLORS.accent.primary, fontWeight: '600' },
});
