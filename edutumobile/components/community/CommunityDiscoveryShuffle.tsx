import React, { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowRight,
  ChevronRight,
  Compass,
  RefreshCw,
  Users,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import type {
  CommunityGroup,
  GroupWithMembership,
} from '@edutu/core/src/services/communities';
import type { MobileCampaign } from '../../lib/mobileControl';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { GroupAvatar } from './GroupAvatar';
import { useTheme } from '../context/ThemeContext';
import { getCommunityGroupCoverUrl, sortDiscoveryRows } from '../../lib/communityDiscovery';

interface CommunityDiscoveryShuffleProps {
  rows: GroupWithMembership[];
  heroCampaigns?: MobileCampaign[];
  onPress: (group: CommunityGroup) => void;
  onHeroPress?: (campaign: MobileCampaign) => void;
  onHeroImpression?: (campaign: MobileCampaign) => void;
  testID?: string;
  legacyRowTestID?: (group: CommunityGroup) => string;
}

interface HeroSlide {
  id: string;
  title: string;
  body: string;
  ctaLabel: string;
  imageUrl?: string;
  campaign?: MobileCampaign;
}

const DEFAULT_HERO: HeroSlide = {
  id: 'community-default-hero',
  title: 'Discover communities that move you forward.',
  body: 'Find opportunities, get support and connect with like-minded peers.',
  ctaLabel: 'Explore now',
};

export function CommunityDiscoveryShuffle({
  rows,
  heroCampaigns = [],
  onPress,
  onHeroPress,
  onHeroImpression,
  testID = 'community-discovery',
  legacyRowTestID,
}: CommunityDiscoveryShuffleProps) {
  const { t } = useTranslation('community');
  const { colors, isDark, reducedMotion } = useTheme();
  const ranked = useMemo(() => sortDiscoveryRows(rows), [rows]);
  const heroSlides = useMemo<HeroSlide[]>(
    () => [
      ...heroCampaigns.map((campaign) => ({
        id: campaign.id,
        title: campaign.title,
        body: campaign.body?.trim() || 'Find support, funding and new opportunities with Edutu.',
        ctaLabel: campaign.creative?.ctaLabel || 'Explore now',
        imageUrl:
          typeof campaign.creative?.imageUrl === 'string' &&
          /^https?:\/\//.test(campaign.creative.imageUrl)
            ? campaign.creative.imageUrl
            : undefined,
        campaign,
      })),
      ...(heroCampaigns.length ? [] : [DEFAULT_HERO]),
    ],
    [heroCampaigns],
  );
  const [heroIndex, setHeroIndex] = useState(0);
  const [featuredIndex, setFeaturedIndex] = useState(0);

  useEffect(() => {
    if (heroSlides.length < 2 || reducedMotion) return undefined;
    const timer = setInterval(() => {
      setHeroIndex((current) => (current + 1) % heroSlides.length);
    }, 8000);
    return () => clearInterval(timer);
  }, [heroSlides.length, reducedMotion]);

  useEffect(() => {
    const campaign = heroSlides[heroIndex % heroSlides.length]?.campaign;
    if (campaign) onHeroImpression?.(campaign);
  }, [heroIndex, heroSlides, onHeroImpression]);

  if (!ranked.length) {
    return (
      <View testID={testID} style={styles.emptyWrap}>
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No communities found</Text>
        <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>Try a different search or focus.</Text>
      </View>
    );
  }

  const activeHero = heroSlides[heroIndex % heroSlides.length] ?? DEFAULT_HERO;
  const featuredCandidates = ranked.slice(0, 3);
  const activeFeaturedIndex = featuredCandidates.length
    ? featuredIndex % featuredCandidates.length
    : 0;
  const featuredGroup = featuredCandidates[activeFeaturedIndex] ?? ranked[0];
  const otherGroups = ranked.filter((row) => row.group.id !== featuredGroup.group.id);
  const palette = {
    foreground: isDark ? colors.foreground : '#4A170D',
    card: isDark ? colors.card : '#FFFFFF',
    border: isDark ? colors.border : '#F7D9C3',
    accent: isDark ? colors.accent : '#F45B16',
    textSecondary: isDark ? colors.textSecondary : '#796F6B',
    muted: isDark ? colors.muted : '#FCEAD5',
  };

  return (
    <View testID={testID} style={styles.section}>
      <AnimatedPressable
        testID={`${testID}-hero`}
        accessibilityRole="button"
        accessibilityLabel={`${activeHero.title}. ${activeHero.ctaLabel}`}
        onPress={() => activeHero.campaign && onHeroPress?.(activeHero.campaign)}
        hapticFeedback="light"
        scaleTo={0.99}
        style={[styles.heroCard, { backgroundColor: palette.card, borderColor: palette.border }]}
      >
        <View style={styles.heroCopy}>
          <Text style={[styles.heroEyebrow, { color: palette.accent }]}>EDUTU COMMUNITY</Text>
          <Text style={[styles.heroTitle, { color: palette.foreground }]} numberOfLines={3}>
            {activeHero.title}
          </Text>
          <Text style={[styles.heroBody, { color: palette.textSecondary }]} numberOfLines={3}>
            {activeHero.body}
          </Text>
          <View style={[styles.heroCta, { backgroundColor: palette.accent }]}>
            <Text style={styles.heroCtaLabel}>{activeHero.ctaLabel}</Text>
            <ArrowRight size={17} color="#FFFFFF" strokeWidth={2.4} />
          </View>
        </View>
        <View style={styles.heroVisual}>
          {activeHero.imageUrl ? (
            <Image source={{ uri: activeHero.imageUrl }} style={styles.heroImage} resizeMode="cover" />
          ) : (
            <LinearGradient
              colors={isDark ? ['#57301F', '#A15D2D'] : ['#FCEAD5', '#F9B66C']}
              style={StyleSheet.absoluteFillObject}
            >
              <View style={[styles.heroSun, { backgroundColor: isDark ? '#E49B53' : '#FFD492' }]} />
              <View style={[styles.heroHill, { backgroundColor: isDark ? '#4F3B2A' : '#BE7A42' }]} />
              <Compass
                size={38}
                color={isDark ? '#FFE6C7' : '#7C351D'}
                strokeWidth={1.5}
                style={styles.heroCompass}
              />
            </LinearGradient>
          )}
        </View>
      </AnimatedPressable>

      {heroSlides.length > 1 && (
        <View style={styles.heroDots} accessibilityLabel={`${heroIndex + 1} of ${heroSlides.length}`}>
          {heroSlides.map((slide, index) => (
            <View
              key={slide.id}
              style={[
                styles.heroDot,
                { backgroundColor: index === heroIndex ? palette.accent : palette.border },
              ]}
            />
          ))}
        </View>
      )}

      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text style={[styles.heading, { color: palette.foreground }]}>Featured</Text>
          <Text style={[styles.featuredLabel, { color: palette.accent }]}>
            {t('discovery.featured')}
          </Text>
        </View>
        {featuredCandidates.length > 1 ? (
          <AnimatedPressable
            testID={`${testID}-shuffle`}
            accessibilityRole="button"
            accessibilityLabel={t('discovery.shuffleA11y')}
            onPress={() => setFeaturedIndex((current) => (current + 1) % featuredCandidates.length)}
            hapticFeedback="selection"
            scaleTo={0.9}
            style={[styles.shuffleButton, { backgroundColor: palette.muted }]}
          >
            <RefreshCw size={17} color={palette.accent} />
          </AnimatedPressable>
        ) : null}
      </View>

      <AnimatedPressable
        testID={legacyRowTestID?.(featuredGroup.group) ?? `${testID}-featured`}
        accessibilityRole="button"
        accessibilityLabel={featuredGroup.group.name}
        onPress={() => onPress(featuredGroup.group)}
        hapticFeedback="light"
        scaleTo={0.985}
        style={[styles.featuredCard, { backgroundColor: palette.card, borderColor: palette.border }]}
      >
        <GroupAvatar
          resourceUrl={featuredGroup.group.coverImageResourceUrl}
          imageUrl={getCommunityGroupCoverUrl(featuredGroup.group.slug)}
          emoji={featuredGroup.group.coverEmoji}
          size={126}
          radius={20}
          style={styles.featuredImage}
        />
        <View style={styles.featuredCopy}>
          <Text style={[styles.featuredName, { color: palette.foreground }]} numberOfLines={1}>
            {featuredGroup.group.name}
          </Text>
          <Text style={[styles.featuredDescription, { color: palette.textSecondary }]} numberOfLines={2}>
            {featuredGroup.group.description || t('discovery.fallbackDescription')}
          </Text>
          <View style={styles.featuredMeta}>
            <Users size={16} color={palette.accent} />
            <Text style={[styles.featuredMetaText, { color: palette.textSecondary }]}>
              {t('discovery.memberCount', {
                count: featuredGroup.group.memberCount,
                formatted: String(featuredGroup.group.memberCount),
              })}
            </Text>
          </View>
        </View>
        <View style={[styles.featuredArrow, { backgroundColor: palette.accent }]}>
          <ArrowRight size={20} color="#FFFFFF" strokeWidth={2.5} />
        </View>
      </AnimatedPressable>

      <View style={styles.sectionHeadingRow}>
        <Text style={[styles.sectionHeading, { color: palette.foreground }]}>Browse by focus</Text>
        <Text style={[styles.seeAll, { color: palette.accent }]}>See all</Text>
      </View>

      <View testID={`${testID}-grid`} style={styles.grid}>
        {otherGroups.map((row, index) => (
          <CompactCommunityCard
            key={row.group.id}
            row={row}
            index={index}
            onPress={onPress}
            testID={legacyRowTestID?.(row.group)}
            palette={palette}
          />
        ))}
      </View>
    </View>
  );
}

function CompactCommunityCard({
  row,
  index,
  onPress,
  testID,
  palette,
}: {
  row: GroupWithMembership;
  index: number;
  onPress: (group: CommunityGroup) => void;
  testID?: string;
  palette: {
    foreground: string;
    card: string;
    border: string;
    accent: string;
    textSecondary: string;
  };
}) {
  const { group } = row;
  return (
    <AnimatedPressable
      testID={testID ?? `community-discovery-card-${group.id}`}
      accessibilityRole="button"
      accessibilityLabel={group.name}
      onPress={() => onPress(group)}
      hapticFeedback="selection"
      scaleTo={0.98}
      style={[styles.focusCard, { backgroundColor: palette.card, borderColor: palette.border }]}
    >
      <GroupAvatar
        resourceUrl={group.coverImageResourceUrl}
        imageUrl={getCommunityGroupCoverUrl(group.slug)}
        emoji={group.coverEmoji}
        size={102}
        radius={18}
        style={styles.focusImage}
      />
      <View style={styles.focusCardFooter}>
        <View style={styles.focusCardCopy}>
          <Text style={[styles.focusName, { color: palette.foreground }]} numberOfLines={2}>
            {group.name}
          </Text>
          <Text style={[styles.focusDescription, { color: palette.textSecondary }]} numberOfLines={2}>
            {group.description || 'Find support and useful opportunities.'}
          </Text>
        </View>
        <ChevronRight size={18} color={palette.accent} strokeWidth={2.3} />
      </View>
      {index === 0 ? <View style={[styles.focusAccent, { backgroundColor: palette.accent }]} /> : null}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  heroCard: {
    minHeight: 190,
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  heroCopy: { flex: 1.07, padding: 18, zIndex: 2 },
  heroEyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.2, marginBottom: 7 },
  heroTitle: { fontSize: 22, lineHeight: 26, fontWeight: '900', letterSpacing: -0.6 },
  heroBody: { fontSize: 13, lineHeight: 18, marginTop: 8, maxWidth: 210 },
  heroCta: {
    alignSelf: 'flex-start',
    borderRadius: 16,
    paddingHorizontal: 13,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
  },
  heroCtaLabel: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  heroVisual: { flex: 0.93, minWidth: 116, overflow: 'hidden' },
  heroImage: { ...StyleSheet.absoluteFillObject, width: undefined, height: undefined },
  heroSun: { position: 'absolute', width: 86, height: 86, borderRadius: 43, top: 22, right: 26 },
  heroHill: { position: 'absolute', width: 220, height: 120, borderRadius: 120, bottom: -52, right: -52, transform: [{ rotate: '-18deg' }] },
  heroCompass: { position: 'absolute', right: 24, bottom: 24 },
  heroDots: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: -3 },
  heroDot: { width: 5, height: 5, borderRadius: 3 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  headingCopy: { gap: 2 },
  heading: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  featuredLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase' },
  shuffleButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  featuredCard: { minHeight: 142, borderWidth: 1, borderRadius: 20, padding: 9, flexDirection: 'row', alignItems: 'center', gap: 12 },
  featuredImage: { flexShrink: 0 },
  featuredCopy: { flex: 1, minWidth: 0, gap: 5 },
  featuredName: { fontSize: 19, fontWeight: '900', letterSpacing: -0.25 },
  featuredDescription: { fontSize: 13, lineHeight: 18 },
  featuredMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  featuredMetaText: { fontSize: 12, fontWeight: '700' },
  featuredArrow: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  sectionHeadingRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 9 },
  sectionHeading: { fontSize: 20, fontWeight: '900', letterSpacing: -0.4 },
  seeAll: { fontSize: 13, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  focusCard: { width: '48.5%', borderRadius: 18, borderWidth: 1, overflow: 'hidden', padding: 8, flexDirection: 'column', minHeight: 172 },
  focusImage: { alignSelf: 'center', marginBottom: 8 },
  focusCardFooter: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 5 },
  focusCardCopy: { flex: 1, minWidth: 0, gap: 3 },
  focusName: { fontSize: 14, lineHeight: 17, fontWeight: '900' },
  focusDescription: { fontSize: 11, lineHeight: 14 },
  focusAccent: { position: 'absolute', left: 0, top: 0, width: 4, height: '100%' },
  emptyWrap: { paddingVertical: 44, alignItems: 'center', gap: 6 },
  emptyTitle: { fontSize: 18, fontWeight: '800' },
  emptyBody: { fontSize: 13 },
});
