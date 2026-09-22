import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';

/** Only navigation chrome uses this material. Content remains opaque. */
export function NativeGlassSurface({ radius, isDark, surface, border, highContrast = false }: {
  radius: number; isDark: boolean; surface: string; border: string; highContrast?: boolean;
}) {
  let available = false;
  try { available = Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable(); } catch { /* Native modules may be absent in previews. */ }
  const [reducedTransparency, setReducedTransparency] = useState(true);
  useEffect(() => {
    let active = true;
    if (!available) return;
    void AccessibilityInfo.isReduceTransparencyEnabled().then(value => { if (active) setReducedTransparency(value); }).catch(() => { /* Retain the readable solid fallback. */ });
    const subscription = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReducedTransparency);
    return () => { active = false; subscription.remove(); };
  }, [available]);
  const shape = { borderRadius: radius, borderCurve: 'continuous' as const };
  if (available && !reducedTransparency && !highContrast) return <GlassView pointerEvents="none"
    glassEffectStyle="regular" colorScheme={isDark ? 'dark' : 'light'} style={[StyleSheet.absoluteFill, shape]} />;
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, shape, { backgroundColor: surface, borderColor: border, borderWidth: 1 }]} />;
}
