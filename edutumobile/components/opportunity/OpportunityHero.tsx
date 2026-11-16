import React, { useState } from 'react';
import { Dimensions, Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Building2, Lock, Star } from 'lucide-react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { useTheme } from '../context/ThemeContext';

const HERO_HEIGHT = Math.round(Dimensions.get('window').width * 0.62);

type OpportunityHeroProps = {
  image?: string | null;
  /** Tint used for the fallback field and the category chip. */
  accent: string;
  category?: string;
  featured?: boolean;
  closed?: boolean;
  closedLabel: string;
  featuredLabel: string;
  /** Scroll offset of the parent list, for a subtle parallax. Optional. */
  scrollY?: SharedValue<number>;
};

/**
 * Full-bleed opening image. It earns its height by carrying the category and
 * status chips, so the content below opens straight onto the decision block
 * instead of another row of badges.
 *
 * Scraped artwork is mostly portrait flyers whose text lives at the top, so
 * the image is letterboxed (`contain`) over a tinted field rather than
 * cropped — losing the top of a poster is worse than showing bars.
 */
export function OpportunityHero({
  image,
  accent,
  category,
  featured,
  closed,
  closedLabel,
  featuredLabel,
  scrollY,
}: OpportunityHeroProps) {
  const { isDark, reducedMotion } = useTheme();
  const [failed, setFailed] = useState(false);
  const hasImage = Boolean(image) && !failed;

  const parallax = useAnimatedStyle(() => {
    if (!scrollY || reducedMotion) return {};
    return {
      transform: [
        {
          translateY: interpolate(
            scrollY.value,
            [0, HERO_HEIGHT],
            [0, HERO_HEIGHT * 0.18],
            Extrapolation.CLAMP,
          ),
        },
        {
          scale: interpolate(scrollY.value, [-120, 0], [1.16, 1], Extrapolation.CLAMP),
        },
      ],
    };
  });

  return (
    <View style={[styles.wrap, { backgroundColor: isDark ? '#0B1220' : '#F1F5F9' }]}>
      <Animated.View style={[StyleSheet.absoluteFill, parallax]}>
        {hasImage ? (
          <>
            {/* Blurred-tint bed so letterboxed posters sit on colour, not grey. */}
            <LinearGradient
              colors={[`${accent}33`, `${accent}0D`]}
              style={StyleSheet.absoluteFill}
            />
            <Image
              source={{ uri: image as string }}
              style={styles.image}
              resizeMode="contain"
              onError={() => setFailed(true)}
              accessibilityIgnoresInvertColors
            />
          </>
        ) : (
          <LinearGradient colors={[accent, `${accent}88`]} style={StyleSheet.absoluteFill}>
            <View style={styles.fallback}>
              <Building2 size={56} color="rgba(255,255,255,0.65)" />
            </View>
          </LinearGradient>
        )}
      </Animated.View>

      {/* Bottom scrim: lets the content below start on a soft edge. */}
      <LinearGradient
        colors={['transparent', isDark ? '#020617' : '#FFFFFF']}
        style={styles.scrim}
        pointerEvents="none"
      />

      <View style={styles.chips} pointerEvents="none">
        {category ? (
          <View style={[styles.chip, { backgroundColor: accent }]}>
            <Text style={styles.chipText} numberOfLines={1}>
              {category.toUpperCase()}
            </Text>
          </View>
        ) : null}
        {featured ? (
          <View style={[styles.chip, styles.chipDark]}>
            <Star size={11} color="#FBBF24" fill="#FBBF24" />
            <Text style={styles.chipText}>{featuredLabel}</Text>
          </View>
        ) : null}
        {closed ? (
          <View style={[styles.chip, { backgroundColor: '#475569' }]}>
            <Lock size={11} color="#FFFFFF" />
            <Text style={styles.chipText}>{closedLabel}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: HERO_HEIGHT,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  image: { width: '100%', height: '100%' },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 72,
  },
  chips: {
    position: 'absolute',
    top: 12,
    left: 16,
    right: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderCurve: 'continuous',
  },
  chipDark: { backgroundColor: 'rgba(15,23,42,0.78)' },
  chipText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
});
