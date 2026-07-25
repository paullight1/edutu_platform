import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AlertTriangle, Check } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '../context/ThemeContext';
import { AiOrbBadge } from '../ui/AiOrbBadge';

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
};

/**
 * The AI/fit block — one of exactly two surfaces DESIGN.md allows a Committed
 * colour moment. A saturated accent field with light-on-dark type makes it
 * read as Edutu's judgement rather than more scraped copy, and separates it
 * from the neutral reference sections below.
 */
export function FitPanel({
  heading,
  blurb,
  eyebrow,
  reasons,
  risks,
  reasonsTitle,
  risksTitle,
}: FitPanelProps) {
  const { colors, reducedMotion } = useTheme();

  return (
    <View style={styles.wrap}>
      <LinearGradient
        colors={[colors.accent, '#4331C9']}
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
              <View style={styles.tick}>
                <Check size={11} color="#FFFFFF" strokeWidth={3} />
              </View>
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
              <View style={[styles.tick, styles.tickWarn]}>
                <AlertTriangle size={11} color="#78350F" strokeWidth={2.5} />
              </View>
              <Text style={styles.lineText}>{risk}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
  heading: { color: '#FFFFFF', fontSize: 24, fontWeight: '800', marginTop: 4 },
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
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  tick: {
    width: 18,
    height: 18,
    borderRadius: 999,
    marginTop: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.24)',
  },
  tickWarn: { backgroundColor: '#FCD34D' },
  lineText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
});
