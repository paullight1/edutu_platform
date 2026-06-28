import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { EdutuLogo } from '../branding/EdutuLogo';

interface AuthShellProps {
  title: string;
  subtitle: string;
  icon?: unknown;
  children: React.ReactNode;
  footer?: React.ReactNode;
  align?: 'center' | 'top';
}

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  align = 'center',
}: AuthShellProps) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const gradientColors: [string, string, string] = isDark
    ? [colors.background, '#111827', colors.background]
    : [colors.background, '#EEF2FF', colors.background];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient colors={gradientColors} style={StyleSheet.absoluteFill} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: insets.top + 24,
              paddingBottom: Math.max(insets.bottom, 24) + 12,
              justifyContent: align === 'center' ? 'center' : 'flex-start',
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.shell}>
            <View style={styles.hero}>
              <EdutuLogo size={64} glow />
              <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
            </View>

            <View style={styles.content}>{children}</View>
            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 28,
  },
  shell: {
    width: '100%',
    maxWidth: 430,
    alignSelf: 'center',
  },
  hero: {
    alignItems: 'center',
    marginBottom: 30,
  },
  title: {
    fontSize: 31,
    lineHeight: 37,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0,
  },
  subtitle: {
    marginTop: 12,
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  content: {
    gap: 20,
  },
  footer: {
    marginTop: 20,
    alignItems: 'center',
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
  },
  orbPrimary: {
    width: 220,
    height: 220,
    top: -40,
    right: -60,
  },
  orbAccent: {
    width: 180,
    height: 180,
    bottom: 80,
    left: -50,
  },
});
