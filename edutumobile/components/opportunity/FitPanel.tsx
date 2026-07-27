import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '../context/ThemeContext';
import { withAlpha } from '../ui/BottomScrim';
import { AiOrbBadge } from '../ui/AiOrbBadge';
import {
  Alert02Icon,
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  HugeiconsIcon,
} from '../ui/icons';
import { accentGradientDeep } from '../../lib/themeGradient';

type FitPanelProps = {
  /** Tier headline, e.g. "Strong fit" — never a percentage. */
  heading: string;
  /** One sentence of what the tier means for this user. */
  blurb: string;
  eyebrow: string;
  reasons: string[];
  risks: string[];
  reasonsTitle: string;
  risksTitle: string;
  /**
   * False when Edutu has no ranking for this user yet. Drives the whole
   * variant switch below — an unranked read is not a verdict and must not be
   * dressed as one.
   */
  ranked: boolean;
  /** The way out of the unranked state. Omit to render it as a plain note. */
  onCompleteProfile?: () => void;
  completeProfileLabel?: string;
};

/**
 * The AI/fit block — one of exactly two surfaces DESIGN.md allows a Committed
 * colour moment.
 *
 * That allowance is spent only when there is a verdict to show. A ranked fit
 * gets the full field: a ramp of the *theme* accent (see `themeGradient`, which
 * replaced the hardcoded accent→#4331C9 that read as stock AI chrome in the
 * default theme and as a palette clash in the other eight) with light-on-dark
 * type, so it reads as Edutu's judgement rather than more scraped copy.
 *
 * "Not ranked yet" is the opposite of a verdict — it is the absence of one —
 * so it collapses to a single quiet row on the page's own surface. Shouting a
 * non-answer in a full-bleed gradient card was the loudest thing on the screen
 * while saying the least, and it pushed the actual content below the fold.
 */
export function FitPanel({
  heading,
  blurb,
  eyebrow,
  reasons,
  risks,
  reasonsTitle,
  risksTitle,
  ranked,
  onCompleteProfile,
  completeProfileLabel,
}: FitPanelProps) {
  const { colors, isDark, reducedMotion } = useTheme();

  if (!ranked) {
    const body = (
      <>
        <AiOrbBadge size={22} />
        <View style={styles.quietText}>
          <Text style={[styles.quietEyebrow, { color: colors.mutedForeground }]}>
            {eyebrow}
          </Text>
          <Text style={[styles.quietHeading, { color: colors.foreground }]}>
            {heading}
          </Text>
          <Text
            style={[styles.quietBlurb, { color: colors.mutedForeground }]}
            numberOfLines={2}
          >
            {blurb}
          </Text>
        </View>
        {onCompleteProfile ? (
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            size={18}
            color={colors.accent}
            strokeWidth={2}
          />
        ) : null}
      </>
    );

    const quietStyle = [
      styles.quiet,
      {
        borderColor: colors.border,
        backgroundColor: isDark
          ? withAlpha(colors.foreground, 0.03)
          : withAlpha(colors.accent, 0.04),
      },
    ];

    // Only a Pressable when there is somewhere to go — a button that does
    // nothing is worse than a note, and screen readers announce it as one.
    return onCompleteProfile ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={completeProfileLabel ?? `${heading}. ${blurb}`}
        accessibilityHint={completeProfileLabel}
        onPress={onCompleteProfile}
        style={({ pressed }) => [...quietStyle, { opacity: pressed ? 0.7 : 1 }]}
      >
        {body}
      </Pressable>
    ) : (
      <View style={quietStyle}>{body}</View>
    );
  }

  return (
    <View style={styles.wrap}>
      <LinearGradient
        colors={accentGradientDeep(colors.accent)}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.header}>
        <AiOrbBadge size={20} />
        <Text style={styles.eyebrow}>{eyebrow}</Text>
      </View>
      <Text style={styles.heading}>{heading}</Text>
      <Text style={styles.blurb}>{blurb}</Text>

      {reasons.length > 0 ? (
        <View style={styles.group}>
          <Text style={styles.groupTitle}>{reasonsTitle}</Text>
          {reasons.map((reason, index) => (
            <Animated.View
              key={`${reason}-${index}`}
              entering={
                reducedMotion ? undefined : FadeInDown.delay(index * 60).duration(320).springify()
              }
              style={styles.line}
            >
              <HugeiconsIcon
                icon={CheckmarkCircle02Icon}
                size={17}
                color="#FFFFFF"
                strokeWidth={2}
              />
              <Text style={styles.lineText}>{reason}</Text>
            </Animated.View>
          ))}
        </View>
      ) : null}

      {risks.length > 0 ? (
        <View style={styles.group}>
          <Text style={styles.groupTitle}>{risksTitle}</Text>
          {risks.map((risk, index) => (
            <View key={`${risk}-${index}`} style={styles.line}>
              <HugeiconsIcon
                icon={Alert02Icon}
                size={17}
                color="#FCD34D"
                strokeWidth={2}
              />
              <Text style={styles.lineText}>{risk}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Ranked: the committed field ────────────────────────────────────────
  wrap: {
    borderRadius: 20,
    borderCurve: 'continuous',
    overflow: 'hidden',
    padding: 18,
    gap: 6,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyebrow: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  // 22, not 24: the tier is two or three words, and at 24 it collided with the
  // page title above it for "biggest text on screen".
  heading: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', marginTop: 4, letterSpacing: -0.3 },
  blurb: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 14,
    lineHeight: 20,
  },
  group: { marginTop: 12, gap: 8 },
  groupTitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  // Hugeicons draw their own circle, so the rows lost the filled chip that
  // used to sit behind a bare tick — one less shape per line.
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  lineText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },

  // ── Unranked: a note, not a verdict ────────────────────────────────────
  quiet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
  },
  quietText: { flex: 1, gap: 1 },
  quietEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  quietHeading: { fontSize: 15, fontWeight: '700', letterSpacing: -0.1 },
  quietBlurb: { fontSize: 12.5, lineHeight: 17 },
});
