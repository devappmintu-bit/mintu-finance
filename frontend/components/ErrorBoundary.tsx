/**
 * Round 40 — app-wide error boundary.
 *
 * React error boundaries MUST be class components (hooks can't participate in
 * error phase). We support two variants:
 *   • variant="full"  — wraps the entire app in _layout.tsx; fullscreen
 *                     fallback with Restart/Report buttons.
 *   • variant="tab"   — wraps each tab individually so one tab crash doesn't
 *                     blank the whole app; compact fallback with Retry.
 *
 * In __DEV__ builds we also expose the error message + component stack under
 * a collapsible section so the developer can diagnose without opening the
 * Metro terminal. Production builds never render raw error details.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { COLORS, SPACING } from '../utils/theme';
import MascotErrorState from './MascotErrorState';

type Variant = 'full' | 'tab';

interface Props {
  children: React.ReactNode;
  variant?: Variant;
  tabName?: string;     // Round 41 — labels the tab in the fallback message
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  info: React.ErrorInfo | null;
  showDetails: boolean;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null, info: null, showDetails: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.warn('[ErrorBoundary]', error?.message || error, info?.componentStack);
    this.setState({ info });
  }

  reset = () => {
    this.setState({ hasError: false, error: null, info: null, showDetails: false });
    this.props.onReset?.();
  };

  restartApp = async () => {
    // Try expo-updates if installed; otherwise gracefully fall back to a
    // local state reset so the user at least gets unblocked. `expo-updates`
    // isn't a hard dependency of this project (it's typically added when
    // OTA builds are configured), so we resolve it lazily.
    try {
      // @ts-ignore — optional peer
      const Updates = require('expo-updates');
      if (Updates?.reloadAsync) { await Updates.reloadAsync(); return; }
    } catch {}
    this.reset();
  };

  copyError = async () => {
    const payload = [
      `Error: ${this.state.error?.message || 'unknown'}`,
      this.state.error?.stack || '',
      this.state.info?.componentStack || '',
    ].join('\n\n');
    try { await Clipboard.setStringAsync(payload); } catch {}
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const variant: Variant = this.props.variant || 'full';
    if (variant === 'tab') {
      // Round 53n — replace the legacy "🚧 isn't working right now"
      // system-error UX with a mascot-led companion-tone recovery
      // moment. Auto-retries once silently after 1500ms; user can
      // also retry manually.
      return (
        <MascotErrorState tabName={this.props.tabName} onRetry={this.reset} />
      );
    }

    return (
      <ScrollView contentContainerStyle={s.fullFallback}>
        <Text style={s.emoji}>🚨</Text>
        <Text style={s.title}>Something went wrong</Text>
        <Text style={s.sub}>An unexpected error occurred. Please restart the app.</Text>

        <TouchableOpacity onPress={this.restartApp} style={s.btnPrimary} accessibilityRole="button" accessibilityLabel="Restart app" activeOpacity={0.85}>
          <Text style={s.btnPrimaryTxt}>Restart App</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={this.copyError} style={s.btnSecondary} accessibilityRole="button" accessibilityLabel="Copy error details" activeOpacity={0.85}>
          <Text style={s.btnSecondaryTxt}>Report Issue (copy details)</Text>
        </TouchableOpacity>

        {__DEV__ && (
          <View style={s.devBlock}>
            <TouchableOpacity onPress={() => this.setState((p) => ({ showDetails: !p.showDetails }))} activeOpacity={0.7}>
              <Text style={s.devToggle}>{this.state.showDetails ? 'Hide' : 'Show'} dev details</Text>
            </TouchableOpacity>
            {this.state.showDetails && (
              <ScrollView style={s.stackBox} horizontal={false} nestedScrollEnabled>
                <Text style={s.stackTitle}>{this.state.error?.message}</Text>
                <Text style={s.stackTxt}>{this.state.error?.stack}</Text>
                {!!this.state.info?.componentStack && (
                  <>
                    <Text style={s.stackTitle}>Component stack:</Text>
                    <Text style={s.stackTxt}>{this.state.info.componentStack}</Text>
                  </>
                )}
              </ScrollView>
            )}
          </View>
        )}
      </ScrollView>
    );
  }
}

const s = StyleSheet.create({
  fullFallback: {
    flexGrow: 1, alignItems: 'center', justifyContent: 'center',
    padding: SPACING.xl, backgroundColor: COLORS.bg.primary,
  },
  emoji: { fontSize: 56, marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '900', color: COLORS.text.primary, letterSpacing: -0.4, textAlign: 'center' },
  sub: { fontSize: 14, color: COLORS.text.muted, marginTop: 8, textAlign: 'center', lineHeight: 20, maxWidth: 320 },

  btnPrimary: {
    marginTop: 28, paddingHorizontal: 28, paddingVertical: 14,
    borderRadius: 999, backgroundColor: COLORS.accent.primary,
  },
  btnPrimaryTxt: { color: '#fff', fontWeight: '900', fontSize: 15, letterSpacing: 0.2 },
  btnSecondary: {
    marginTop: 10, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999,
    borderWidth: 1, borderColor: COLORS.border.subtle, backgroundColor: COLORS.bg.secondary,
  },
  btnSecondaryTxt: { color: COLORS.text.primary, fontWeight: '700', fontSize: 13 },

  devBlock: { marginTop: 24, width: '100%', maxWidth: 520 },
  devToggle: { textAlign: 'center', color: COLORS.text.muted, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  stackBox: { marginTop: 10, padding: 12, borderRadius: 10, backgroundColor: '#0F172A', maxHeight: 240 },
  stackTitle: { color: '#FCA5A5', fontWeight: '800', fontSize: 12, marginTop: 6 },
  stackTxt: { color: '#CBD5E1', fontSize: 11, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }) },

  // Tab variant — compact; sits inside the tab's own render area.
  tabFallback: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: SPACING.xl, backgroundColor: COLORS.bg.primary,
  },
  tabEmoji: { fontSize: 40, marginBottom: 10 },
  tabTitle: { fontSize: 16, fontWeight: '900', color: COLORS.text.primary, textAlign: 'center' },
  tabSub: { fontSize: 13, color: COLORS.text.muted, marginTop: 6, textAlign: 'center', lineHeight: 18 },
  tabRetry: {
    marginTop: 18, paddingHorizontal: 22, paddingVertical: 10, borderRadius: 999,
    backgroundColor: COLORS.accent.primary,
  },
  tabRetryTxt: { color: '#fff', fontWeight: '900', fontSize: 13, letterSpacing: 0.4 },
});
