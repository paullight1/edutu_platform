import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight } from 'lucide-react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../components/context/ThemeContext';
import { OpportunityOrbit } from '../components/onboarding/OpportunityOrbit';
import { CoachComposer, DeadlineTimeline, MatchStack } from '../components/onboarding/SlideVisuals';
import {
  getOnboardingPalette,
  getSlideTheme,
  onboardingLayout,
  onboardingType,
  type OnboardingPalette,
  type SlideTheme,
} from '../components/onboarding/onboardingTokens';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const AnimatedFlatList = Animated.createAnimatedComponent(FlatList<Slide>);
const AUTO_ADVANCE_DELAY_MS = 2000;

type SlideId = 'discover' | 'match' | 'coach' | 'deadlines';

interface Slide {
  id: SlideId;
  titleKey: string;
  bodyKey: string;
  titleFallback: string;
  bodyFallback: string;
}

const SLIDES: Slide[] = [
  {
    id: 'discover',
    // Headline reuses the existing welcome.* key so it stays translated; the
    // body has its own, longer key — the original one-liner left this slide's
    // text block visibly shorter than the other three.
    titleKey: 'welcome.title',
    bodyKey: 'slides.discover.body',
    titleFallback: 'Find real opportunities',
    bodyFallback:
      'Scholarships, jobs, internships and schools from across the world — gathered in one place and kept up to date.',
  },
  {
    id: 'match',
    titleKey: 'slides.match.title',
    bodyKey: 'slides.match.body',
    titleFallback: 'Matched to you,\nnot to everyone',
    bodyFallback: 'Every opportunity is scored against your profile, so you know where you actually stand.',
  },
  {
    id: 'coach',
    titleKey: 'slides.coach.title',
    bodyKey: 'slides.coach.body',
    titleFallback: 'An AI coach that\nwrites with you',
    bodyFallback: 'Draft essays, sharpen your CV, and get feedback before you hit submit.',
  },
  {
    id: 'deadlines',
    titleKey: 'slides.deadlines.title',
    bodyKey: 'slides.deadlines.body',
    titleFallback: 'Never miss\na deadline',
    bodyFallback: 'Reminders that reach you before applications close — not after.',
  },
];

function SlideVisual({
  id,
  palette,
  isDark,
  theme,
}: {
  id: SlideId;
  palette: OnboardingPalette;
  isDark: boolean;
  theme: SlideTheme;
}) {
  switch (id) {
    case 'discover':
      return <OpportunityOrbit palette={palette} isDark={isDark} />;
    case 'match':
      return <MatchStack palette={palette} isDark={isDark} theme={theme} />;
    case 'coach':
      return <CoachComposer palette={palette} isDark={isDark} theme={theme} />;
    case 'deadlines':
      return <DeadlineTimeline palette={palette} isDark={isDark} theme={theme} />;
  }
}

/**
 * One slide's backdrop. All four stack on top of each other and crossfade from
 * the scroll offset, so the page changes colour continuously as you drag rather
 * than snapping when the index finally flips.
 */
function BackdropLayer({
  index,
  scrollX,
  colors,
}: {
  index: number;
  scrollX: SharedValue<number>;
  colors: [string, string, string];
}) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollX.value,
      [(index - 1) * SCREEN_WIDTH, index * SCREEN_WIDTH, (index + 1) * SCREEN_WIDTH],
      [0, 1, 0],
      'clamp'
    ),
  }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]}>
      <LinearGradient colors={colors} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

function Dots({ count, active, palette }: { count: number; active: number; palette: OnboardingPalette }) {
  return (
    <View style={styles.dots}>
      {Array.from({ length: count }).map((_, index) => {
        const isActive = index === active;
        return (
          <View
            key={index}
            style={[
              styles.dot,
              {
                width: isActive ? 20 : 6,
                backgroundColor: isActive ? palette.text : palette.textMuted,
                opacity: isActive ? 1 : 0.35,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

export default function OnboardingWelcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const { t } = useTranslation('auth');
  const listRef = useRef<FlatList<Slide>>(null);
  const [index, setIndex] = useState(0);
  const scrollX = useSharedValue(0);

  const palette = getOnboardingPalette(isDark);
  const isLast = index === SLIDES.length - 1;

  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollX.value = event.contentOffset.x;
  });

  const goToGetStarted = useCallback(() => {
    router.push('/get-started');
  }, [router]);

  useEffect(() => {
    // Give each slide's visual animation time to play before moving on. The
    // effect resets whenever the user advances or swipes manually.
    if (isLast) return;

    const timer = setTimeout(() => {
      const next = index + 1;
      listRef.current?.scrollToOffset({ offset: next * SCREEN_WIDTH, animated: true });
      setIndex(next);
    }, AUTO_ADVANCE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [index, isLast]);

  const handleContinue = useCallback(() => {
    if (isLast) {
      goToGetStarted();
      return;
    }
    const next = index + 1;
    listRef.current?.scrollToOffset({ offset: next * SCREEN_WIDTH, animated: true });
    setIndex(next);
  }, [goToGetStarted, index, isLast]);

  const handleMomentumEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setIndex(next);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#07080D' : '#FFFFFF' }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {SLIDES.map((slide, i) => (
        <BackdropLayer
          key={slide.id}
          index={i}
          scrollX={scrollX}
          colors={getSlideTheme(slide.id, isDark).backdrop}
        />
      ))}

      <View style={[styles.skipRow, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={goToGetStarted}
          hitSlop={12}
          accessibilityRole="button"
          style={({ pressed }) => [styles.skipButton, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[styles.skipText, { color: palette.textMuted }]}>
            {t('slides.skip', { defaultValue: 'Skip' })}
          </Text>
          <ChevronRight color={palette.textMuted} size={16} strokeWidth={2.5} />
        </Pressable>
      </View>

      <AnimatedFlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(slide) => slide.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        onMomentumScrollEnd={handleMomentumEnd}
        // Every slide is a fixed screen width, so we can skip measurement and
        // keep scrollToOffset exact on both platforms.
        getItemLayout={(_, i) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * i, index: i })}
        renderItem={({ item }) => (
          <View style={styles.slide}>
            <SlideVisual
              id={item.id}
              palette={palette}
              isDark={isDark}
              theme={getSlideTheme(item.id, isDark)}
            />

            <Animated.View entering={FadeInDown.delay(120).duration(420)} style={styles.copy}>
              <Text style={[styles.title, { color: palette.text }]}>
                {t(item.titleKey, { defaultValue: item.titleFallback })}
              </Text>
              <Text style={[styles.body, { color: palette.textMuted }]}>
                {t(item.bodyKey, { defaultValue: item.bodyFallback })}
              </Text>
            </Animated.View>
          </View>
        )}
      />

      <Animated.View
        entering={FadeIn.delay(200)}
        style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}
      >
        <Dots count={SLIDES.length} active={index} palette={palette} />

        <Pressable
          onPress={handleContinue}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.cta,
            {
              backgroundColor: palette.ctaBg,
              shadowColor: palette.shadow,
              opacity: pressed ? 0.88 : 1,
              transform: [{ scale: pressed ? 0.985 : 1 }],
            },
          ]}
        >
          <Text style={[styles.ctaText, { color: palette.ctaText }]}>
            {isLast
              ? t('welcome.getStarted', { defaultValue: 'Get Started' })
              : t('slides.continue', { defaultValue: 'Continue' })}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  skipRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: onboardingLayout.gutter,
    paddingBottom: 4,
  },
  skipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  skipText: {
    ...onboardingType.skip,
  },
  slide: {
    width: SCREEN_WIDTH,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: onboardingLayout.gutter,
  },
  copy: {
    marginTop: 8,
    alignItems: 'flex-start',
    alignSelf: 'stretch',
  },
  title: {
    ...onboardingType.display,
  },
  body: {
    marginTop: 12,
    maxWidth: 330,
    ...onboardingType.body,
  },
  footer: {
    paddingHorizontal: onboardingLayout.gutter,
    paddingTop: 8,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 22,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  cta: {
    height: onboardingLayout.ctaHeight,
    borderRadius: onboardingLayout.ctaRadius,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 22,
    elevation: 8,
  },
  ctaText: {
    ...onboardingType.cta,
  },
});
