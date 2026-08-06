import { useEffect } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { BellRing, CalendarClock, PenLine, Sparkles, Trophy } from 'lucide-react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { cardShadow, type OnboardingPalette, type SlideTheme } from './onboardingTokens';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const STAGE = Math.min(SCREEN_WIDTH, 430);

interface VisualProps {
  palette: OnboardingPalette;
  isDark: boolean;
  theme: SlideTheme;
}

/* ------------------------------------------------------------------ */
/* Slide 2 — a shortlist that scrolls itself, emphasis moving card to  */
/* card so the fit score reads as being computed per opportunity.      */
/* ------------------------------------------------------------------ */

const MATCHES = [
  { title: 'Chevening Scholarship', meta: 'UK · Master’s · Fully funded', score: 92 },
  { title: 'Mastercard Foundation Scholars', meta: 'Full tuition · Closes in 21 days', score: 88 },
  { title: 'DAAD EPOS Scholarship', meta: 'Germany · Closes in 40 days', score: 81 },
  { title: 'Google Africa Internship', meta: 'Remote · Paid · 12 weeks', score: 76 },
];

const CARD_HEIGHT = 92;
const CARD_GAP = 12;
const SLOT = CARD_HEIGHT + CARD_GAP;

function MatchCard({
  item,
  index,
  progress,
  palette,
  theme,
}: {
  item: (typeof MATCHES)[number];
  index: number;
  progress: SharedValue<number>;
  palette: OnboardingPalette;
  theme: SlideTheme;
}) {
  // Distance from the focus slot, wrapped so the list reads as an endless reel
  // rather than snapping back to the top when it runs out of cards.
  const distance = useDerivedValue(() => {
    const raw = index - progress.value;
    const wrapped = ((raw + MATCHES.length / 2) % MATCHES.length + MATCHES.length) % MATCHES.length
      - MATCHES.length / 2;
    return wrapped;
  });

  const cardStyle = useAnimatedStyle(() => {
    const d = Math.abs(distance.value);
    return {
      transform: [{ translateY: distance.value * SLOT }, { scale: interpolate(d, [0, 1], [1, 0.9], 'clamp') }],
      opacity: interpolate(d, [0, 1, 1.35], [1, 0.4, 0], 'clamp'),
      zIndex: d < 0.5 ? 2 : 1,
    };
  });

  const focusStyle = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(distance.value), [0, 0.6], [1, 0], 'clamp'),
  }));

  // The bar is fixed at the card's own score. It used to fill and empty with
  // focus, which read as the score being recalculated on every pass rather than
  // being a property of the opportunity.
  const barWidth = `${item.score}%` as const;

  return (
    <Animated.View
      style={[
        styles.matchCard,
        cardShadow,
        {
          backgroundColor: palette.glass,
          borderColor: palette.glassBorder,
          shadowColor: palette.shadow,
        },
        cardStyle,
      ]}
    >
      <View style={styles.rowBetween}>
        <Animated.View style={[styles.pill, { backgroundColor: theme.accentSoft }, focusStyle]}>
          <Sparkles color={theme.accent} size={11} strokeWidth={2.5} />
          <Text style={[styles.pillText, { color: theme.accent }]}>STRONG FIT</Text>
        </Animated.View>
        <Text style={[styles.score, { color: theme.accent }]}>{item.score}%</Text>
      </View>

      <Text style={[styles.cardTitle, { color: palette.text }]} numberOfLines={1}>
        {item.title}
      </Text>
      <Text style={[styles.cardMeta, { color: palette.textMuted }]} numberOfLines={1}>
        {item.meta}
      </Text>

      <View style={[styles.track, { backgroundColor: palette.softBg }]}>
        <View style={[styles.trackFill, { backgroundColor: theme.accent, width: barWidth }]} />
      </View>
    </Animated.View>
  );
}

export function MatchStack({ palette, theme }: VisualProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    // Slide, settle, then move on — rather than one continuous drift, which
    // never let a card actually rest in focus long enough to be read.
    progress.value = 0;
    const steps = [];
    for (let i = 1; i <= MATCHES.length; i += 1) {
      steps.push(withTiming(i, { duration: 750, easing: Easing.inOut(Easing.cubic) }));
      // Same target again: holds the card in focus without moving it.
      steps.push(withTiming(i, { duration: 2300, easing: Easing.linear }));
    }
    progress.value = withRepeat(withSequence(...steps), -1, false);
  }, [progress]);

  return (
    <View style={styles.stage}>
      <View style={styles.reel}>
        {MATCHES.map((item, index) => (
          <MatchCard
            key={item.title}
            item={item}
            index={index}
            progress={progress}
            palette={palette}
            theme={theme}
          />
        ))}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Slide 3 — the coach listens, then writes. One loop, two acts.       */
/* ------------------------------------------------------------------ */

const BAR_COUNT = 7;

function VoiceBar({ index, cycle, accent }: { index: number; cycle: SharedValue<number>; accent: string }) {
  const style = useAnimatedStyle(() => {
    // Listening runs over the first half of the cycle; bars settle flat after.
    const listening = interpolate(cycle.value, [0, 0.06, 0.44, 0.5], [0, 1, 1, 0], 'clamp');
    const wave = Math.sin(cycle.value * Math.PI * 22 + index * 0.9) * 0.5 + 0.5;
    return {
      height: 10 + wave * 52 * listening,
      opacity: 0.35 + listening * 0.65,
    };
  });

  return <Animated.View style={[styles.voiceBar, { backgroundColor: accent }, style]} />;
}

function WriteLine({
  index,
  cycle,
  width,
  color,
}: {
  index: number;
  cycle: SharedValue<number>;
  width: number;
  color: string;
}) {
  const style = useAnimatedStyle(() => {
    // Lines type on in sequence across the writing half of the cycle.
    const start = 0.52 + index * 0.09;
    const grown = interpolate(cycle.value, [start, start + 0.1], [0, 1], 'clamp');
    // Everything clears at the very end so the next loop starts from blank.
    const clear = interpolate(cycle.value, [0.96, 1], [1, 0], 'clamp');
    return { width: `${grown * width * clear}%`, opacity: clear };
  });

  return <Animated.View style={[styles.writeLine, { backgroundColor: color }, style]} />;
}

export function CoachComposer({ palette, isDark, theme }: VisualProps) {
  const cycle = useSharedValue(0);
  // softBg is too faint to read as text on top of the glass card — the drafted
  // lines need their own, stronger value.
  const lineColor = isDark ? 'rgba(247,248,250,0.22)' : 'rgba(12,14,20,0.16)';

  useEffect(() => {
    // See the note in DeadlineTimeline: withRepeat resumes from the current
    // value, so this must start from a known zero.
    cycle.value = 0;
    cycle.value = withRepeat(withTiming(1, { duration: 7000, easing: Easing.linear }), -1, false);
  }, [cycle]);

  const listenBadgeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(cycle.value, [0, 0.03, 0.44, 0.5], [0, 1, 1, 0], 'clamp'),
    transform: [{ scale: interpolate(cycle.value, [0, 0.05], [0.92, 1], 'clamp') }],
  }));

  const writeBadgeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(cycle.value, [0.48, 0.54, 0.97, 1], [0, 1, 1, 0], 'clamp'),
    transform: [{ scale: interpolate(cycle.value, [0.48, 0.54], [0.92, 1], 'clamp') }],
  }));

  // The two acts share one slot, so the card never grows or jumps between them.
  // Ramps are kept tight at the loop seam: with a slower fade the card sat
  // visibly empty for a beat between the draft clearing and listening starting.
  const listenLayerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(cycle.value, [0, 0.03, 0.42, 0.5], [0, 1, 1, 0], 'clamp'),
  }));

  const writeLayerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(cycle.value, [0.46, 0.54, 0.97, 1], [0, 1, 1, 0], 'clamp'),
  }));

  return (
    <View style={styles.stage}>
      <View style={styles.badgeRow}>
        <Animated.View
          style={[styles.badge, { backgroundColor: theme.accentSoft, borderColor: `${theme.accent}44` }, listenBadgeStyle]}
        >
          <Text style={[styles.badgeText, { color: theme.accent }]}>Listening…</Text>
        </Animated.View>
        <Animated.View
          style={[
            styles.badge,
            styles.badgeOverlay,
            { backgroundColor: theme.accentSoft, borderColor: `${theme.accent}44` },
            writeBadgeStyle,
          ]}
        >
          <PenLine color={theme.accent} size={12} strokeWidth={2.4} />
          <Text style={[styles.badgeText, { color: theme.accent }]}>Writing your draft</Text>
        </Animated.View>
      </View>

      {/* One card, two acts. The waveform and the draft occupy the same slot
          and crossfade, rather than sitting stacked above one another. */}
      <View
        style={[
          styles.docCard,
          cardShadow,
          { backgroundColor: palette.glass, borderColor: palette.glassBorder, shadowColor: palette.shadow },
        ]}
      >
        <Animated.View style={[styles.docLayer, styles.voiceLayer, listenLayerStyle]}>
          {Array.from({ length: BAR_COUNT }).map((_, index) => (
            <VoiceBar key={index} index={index} cycle={cycle} accent={theme.accent} />
          ))}
        </Animated.View>

        <Animated.View style={[styles.docLayer, writeLayerStyle]}>
          <Text style={[styles.docTitle, { color: palette.text }]}>Personal statement</Text>
          <WriteLine index={0} cycle={cycle} width={96} color={lineColor} />
          <WriteLine index={1} cycle={cycle} width={88} color={lineColor} />
          <WriteLine index={2} cycle={cycle} width={93} color={lineColor} />
          {/* Last line lands in the accent — it reads as the sentence being
              written right now rather than one already placed. */}
          <WriteLine index={3} cycle={cycle} width={62} color={theme.accent} />
        </Animated.View>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Slide 4 — notifications arriving on a loop.                         */
/* ------------------------------------------------------------------ */

const ALERTS = [
  { icon: BellRing, title: 'Closes in 2 days', body: 'Chevening · 1 essay left' },
  { icon: CalendarClock, title: 'Interview Friday, 10:00', body: 'Mastercard Foundation' },
  { icon: Trophy, title: 'You’re shortlisted', body: 'DAAD EPOS Scholarship' },
];

function AlertToast({
  item,
  index,
  cycle,
  palette,
  theme,
}: {
  item: (typeof ALERTS)[number];
  index: number;
  cycle: SharedValue<number>;
  palette: OnboardingPalette;
  theme: SlideTheme;
}) {
  const Icon = item.icon;

  const style = useAnimatedStyle(() => {
    // Each toast drops in, the full stack holds, then it clears and restarts.
    // The clear is deliberately short — with the old six-tenths-of-a-second
    // fade the slide sat visibly empty between loops.
    const start = index * 0.22;
    const appear = interpolate(cycle.value, [start, start + 0.1], [0, 1], 'clamp');
    const clear = interpolate(cycle.value, [0.9, 0.97], [1, 0], 'clamp');
    return {
      opacity: appear * clear,
      transform: [
        { translateY: interpolate(appear, [0, 1], [-26, 0]) },
        { scale: interpolate(appear, [0, 1], [0.92, 1]) },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.toast,
        cardShadow,
        { backgroundColor: palette.glass, borderColor: palette.glassBorder, shadowColor: palette.shadow },
        style,
      ]}
    >
      <View style={[styles.toastIcon, { backgroundColor: theme.accentSoft }]}>
        <Icon color={theme.accent} size={17} strokeWidth={2.3} />
      </View>
      <View style={styles.toastCopy}>
        <Text style={[styles.toastTitle, { color: palette.text }]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={[styles.cardMeta, { color: palette.textMuted }]} numberOfLines={1}>
          {item.body}
        </Text>
      </View>
    </Animated.View>
  );
}

export function DeadlineTimeline({ palette, theme }: VisualProps) {
  const cycle = useSharedValue(0);

  useEffect(() => {
    // Reset first: withRepeat animates from whatever the value currently is, so
    // a remount that left this at 1 would loop 1→1 forever and the stack would
    // sit permanently cleared.
    cycle.value = 0;
    cycle.value = withRepeat(withTiming(1, { duration: 7600, easing: Easing.linear }), -1, false);
  }, [cycle]);

  return (
    <View style={styles.stage}>
      <View style={styles.toastStack}>
        {ALERTS.map((item, index) => (
          <AlertToast
            key={item.title}
            item={item}
            index={index}
            cycle={cycle}
            palette={palette}
            theme={theme}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    height: STAGE * 0.94,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardMeta: {
    marginTop: 3,
    fontSize: 12.5,
    fontWeight: '500',
  },

  /* match reel */
  reel: {
    width: STAGE * 0.82,
    height: SLOT * 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchCard: {
    position: 'absolute',
    width: '100%',
    height: CARD_HEIGHT,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 15,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  pillText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  score: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  cardTitle: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  track: {
    height: 5,
    borderRadius: 3,
    marginTop: 9,
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    borderRadius: 3,
  },

  /* coach */
  voiceBar: {
    width: 5,
    borderRadius: 3,
  },
  badgeRow: {
    height: 34,
    marginTop: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeOverlay: {
    position: 'absolute',
  },
  badgeText: {
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  docCard: {
    width: STAGE * 0.78,
    // Fixed height: both acts render into this one slot, so the card must not
    // resize as they crossfade.
    height: 168,
    marginTop: 16,
    borderRadius: 22,
    borderWidth: 1,
    // No padding here: the layers below inset themselves, and having both
    // padded stacked the two insets and pushed the draft down the card.
  },
  docLayer: {
    position: 'absolute',
    top: 18,
    left: 18,
    right: 18,
    bottom: 18,
  },
  voiceLayer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  docTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginBottom: 13,
  },
  writeLine: {
    height: 8,
    borderRadius: 4,
    marginBottom: 9,
  },

  /* deadlines */
  toastStack: {
    width: STAGE * 0.82,
    gap: 10,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  toastIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastCopy: {
    flex: 1,
  },
  toastTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
});
