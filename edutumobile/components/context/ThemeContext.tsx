import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme, StatusBar } from 'react-native';

export type ThemePackage = 'default' | 'ocean' | 'sunset' | 'forest' | 'royal';
export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeColors {
  background: string;
  foreground: string;
  card: string;
  border: string;
  accent: string;
  primary: string;
  accentLight: string;
  muted: string;
  mutedForeground: string;
  textSecondary: string;
  success: string;
  warning: string;
  error: string;
}

const THEMES: Record<ThemePackage, { dark: ThemeColors; light: ThemeColors }> = {
  default: {
    dark: { background: '#020617', foreground: '#F8FAFC', card: '#0F172A', border: '#1E293B', accent: '#6366F1', primary: '#6366F1', accentLight: '#818CF8', muted: '#334155', mutedForeground: '#94A3B8', textSecondary: '#94A3B8', success: '#10B981', warning: '#F59E0B', error: '#EF4444' },
    light: { background: '#FFFFFF', foreground: '#0F172A', card: '#F8FAFC', border: '#E2E8F0', accent: '#4F46E5', primary: '#4F46E5', accentLight: '#6366F1', muted: '#F1F5F9', mutedForeground: '#64748B', textSecondary: '#64748B', success: '#059669', warning: '#D97706', error: '#DC2626' },
  },
  ocean: {
    dark: { background: '#0F172A', foreground: '#F0F9FF', card: '#1E293B', border: '#334155', accent: '#0EA5E9', primary: '#0EA5E9', accentLight: '#38BDF8', muted: '#334155', mutedForeground: '#94A3B8', textSecondary: '#94A3B8', success: '#10B981', warning: '#F59E0B', error: '#EF4444' },
    light: { background: '#F0F9FF', foreground: '#0C4A6E', card: '#FFFFFF', border: '#BAE6FD', accent: '#0284C7', primary: '#0284C7', accentLight: '#0EA5E9', muted: '#E0F2FE', mutedForeground: '#64748B', textSecondary: '#64748B', success: '#059669', warning: '#D97706', error: '#DC2626' },
  },
  sunset: {
    dark: { background: '#1C1917', foreground: '#FFF7ED', card: '#292524', border: '#44403C', accent: '#F97316', primary: '#F97316', accentLight: '#FB923C', muted: '#44403C', mutedForeground: '#A8A29E', textSecondary: '#A8A29E', success: '#10B981', warning: '#EAB308', error: '#EF4444' },
    light: { background: '#FFF7ED', foreground: '#431407', card: '#FFFFFF', border: '#FED7AA', accent: '#EA580C', primary: '#EA580C', accentLight: '#F97316', muted: '#FFEDD5', mutedForeground: '#78716C', textSecondary: '#78716C', success: '#059669', warning: '#CA8A04', error: '#DC2626' },
  },
  forest: {
    dark: { background: '#022C22', foreground: '#ECFDF5', card: '#064E3B', border: '#065F46', accent: '#10B981', primary: '#10B981', accentLight: '#34D399', muted: '#065F46', mutedForeground: '#6EE7B7', textSecondary: '#6EE7B7', success: '#34D399', warning: '#FBBF24', error: '#F87171' },
    light: { background: '#ECFDF5', foreground: '#022C22', card: '#FFFFFF', border: '#A7F3D0', accent: '#059669', primary: '#059669', accentLight: '#10B981', muted: '#D1FAE5', mutedForeground: '#64748B', textSecondary: '#64748B', success: '#059669', warning: '#D97706', error: '#DC2626' },
  },
  royal: {
    dark: { background: '#0f172a', foreground: '#F5F3FF', card: '#3B0764', border: '#1e3a5f', accent: '#3b82f6', primary: '#3b82f6', accentLight: '#60a5fa', muted: '#1e3a5f', mutedForeground: '#C4B5FD', textSecondary: '#C4B5FD', success: '#10B981', warning: '#F59E0B', error: '#F87171' },
    light: { background: '#F5F3FF', foreground: '#0f172a', card: '#FFFFFF', border: '#bfdbfe', accent: '#2563eb', primary: '#2563eb', accentLight: '#3b82f6', muted: '#EDE9FE', mutedForeground: '#6B7280', textSecondary: '#6B7280', success: '#059669', warning: '#D97706', error: '#DC2626' },
  },
};

interface ThemeContextValue {
  theme: ThemePackage;
  packageId: ThemePackage;
  mode: ThemeMode;
  isDark: boolean;
  colors: ThemeColors;
  setTheme: (t: ThemePackage) => void;
  setPackage: (t: ThemePackage) => void;
  setMode: (m: ThemeMode) => void;
  availableThemes: ThemePackage[];
  fontSize: 'small' | 'medium' | 'large';
  setFontSize: (s: 'small' | 'medium' | 'large') => void;
  reducedMotion: boolean;
  setReducedMotion: (v: boolean) => void;
  highContrast: boolean;
  setHighContrast: (v: boolean) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const KEYS = {
  THEME: 'edutu_theme_package',
  MODE: 'edutu_theme_mode',
  FONT_SIZE: 'edutu_font_size',
  REDUCED_MOTION: 'edutu_reduced_motion',
  HIGH_CONTRAST: 'edutu_high_contrast',
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [theme, setThemeState] = useState<ThemePackage>('default');
  const [mode, setModeState] = useState<ThemeMode>('dark');
  const [fontSize, setFontSizeState] = useState<'small' | 'medium' | 'large'>('medium');
  const [reducedMotion, setReducedMotionState] = useState(false);
  const [highContrast, setHighContrastState] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(KEYS.THEME), AsyncStorage.getItem(KEYS.MODE),
      AsyncStorage.getItem(KEYS.FONT_SIZE), AsyncStorage.getItem(KEYS.REDUCED_MOTION),
      AsyncStorage.getItem(KEYS.HIGH_CONTRAST),
    ]).then(([t, m, fs, rm, hc]) => {
      if (t) setThemeState(t as ThemePackage);
      if (m) setModeState(m as ThemeMode);
      if (fs) setFontSizeState(fs as 'small' | 'medium' | 'large');
      if (rm) setReducedMotionState(rm === 'true');
      if (hc) setHighContrastState(hc === 'true');
      setLoaded(true);
    });
  }, []);

  const isDark = mode === 'system' ? systemColorScheme === 'dark' : mode === 'dark';
  const colors = THEMES[theme][isDark ? 'dark' : 'light'];

  const setTheme = useCallback((t: ThemePackage) => { setThemeState(t); AsyncStorage.setItem(KEYS.THEME, t); }, []);
  const setMode = useCallback((m: ThemeMode) => { setModeState(m); AsyncStorage.setItem(KEYS.MODE, m); }, []);
  const setFontSize = useCallback((s: 'small' | 'medium' | 'large') => { setFontSizeState(s); AsyncStorage.setItem(KEYS.FONT_SIZE, s); }, []);
  const setReducedMotion = useCallback((v: boolean) => { setReducedMotionState(v); AsyncStorage.setItem(KEYS.REDUCED_MOTION, String(v)); }, []);
  const setHighContrast = useCallback((v: boolean) => { setHighContrastState(v); AsyncStorage.setItem(KEYS.HIGH_CONTRAST, String(v)); }, []);

  if (!loaded) return null;

  return (
    <ThemeContext.Provider value={{
      theme,
      packageId: theme,
      mode,
      isDark,
      colors,
      setTheme,
      setPackage: setTheme,
      setMode,
      availableThemes: Object.keys(THEMES) as ThemePackage[],
      fontSize, setFontSize, reducedMotion, setReducedMotion,
      highContrast, setHighContrast,
    }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
