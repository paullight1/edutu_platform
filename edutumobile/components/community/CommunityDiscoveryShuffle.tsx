import React, { useEffect, useMemo, useState } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ImageSourcePropType,
} from 'react-native';
import {
  ArrowRight,
  Check,
  ChevronRight,
  Flame,
  MessageCircle,
  Users,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import type {
  CommunityGroup,
  GroupWithMembership,
  MembershipStatus,
} from '@edutu/core/src/services/communities';
import type { MobileCampaign } from '../../lib/mobileControl';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { GroupAvatar } from './GroupAvatar';
import { useTheme } from '../context/ThemeContext';
import {
  formatCommunityCount,
  getCommunityGroupCoverUrl,
} from '../../lib/communityDiscovery';

interface CommunityDiscoveryShuffleProps {
  trendingRows: GroupWithMembership[];
  communityRows: GroupWithMembership[];
  heroCampaigns?: MobileCampaign[];
  onPress: (group: CommunityGroup) => void;
  onBrowse: () => void;
  onSeeAll: () => void;
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
  imageSource: ImageSourcePropType;
  campaign?: MobileCampaign;
}

const DEFAULT_HERO_IMAGE = require('../../assets/community/community-hero.jpg');

type Palette = {
  foreground: string;
  card: string;
  border: string;
  accent: string;
  textSecondary: string;
  muted: string;
  success: string;
  badge: string;
};

export function CommunityDiscoveryShuffle({
  trendingRows,
  communityRows,
  heroCampaigns = [],
  onPress,
  onBrowse,
  onSeeAll,
  onHeroPress,
  onHeroImpression,
  testID = 'community-discovery',
  legacyRowTestID,
}: CommunityDiscoveryShuffleProps) {
  const { t } = useTranslation('community');
  const { colors, isDark, reducedMotion } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const heroSlides = useMemo<HeroSlide[]>(
    () =>
      heroCampaigns.length
        ? heroCampaigns.map((campaign) => ({
            id: campaign.id,
            title: campaign.title,
            body:
              campaign.body?.trim() ||
              t('discovery.defaultHeroBody'),
            ctaLabel:
              campaign.creative?.ctaLabel ||
              t('discovery.defaultHeroCta'),
            imageSource:
              typeof campaign.creative?.imageUrl === 'string' &&
              /^https?:\/\//.test(campaign.creative.imageUrl)
                ? { uri: campaign.creative.imageUrl }
                : DEFAULT_HERO_IMAGE,
            campaign,
          }))
        : [
            {
              id: 'community-default-hero',
              title: t('discovery.defaultHeroTitle'),
              body: t('discovery.defaultHeroBody'),
              ctaLabel: t('discovery.defaultHeroCta'),
              imageSource: DEFAULT_HERO_IMAGE,
            },
          ],
    [heroCampaigns, t],
  );
  const [heroIndex, setHeroIndex] = useState(0);

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

  const activeHero = heroSlides[heroIndex % heroSlides.length] ?? heroSlides[0];
  const usesDefaultHeroImage = activeHero.imageSource === DEFAULT_HERO_IMAGE;
  const palette: Palette = {
    foreground: isDark ? colors.foreground : '#4A170D',
    card: isDark ? colors.card : '#FFFFFF',
    border: isDark ? colors.border : '#F2DCCB',
    accent: isDark ? colors.accent : '#F45B16',
    textSecondary: isDark ? colors.textSecondary : '#796F6B',
    muted: isDark ? colors.muted : '#FCEAD5',
    success: isDark ? '#6EE7B7' : '#147D55',
    badge: isDark ? '#261A16' : '#FFFFFF',
  };

  return (
    <View testID={testID} style={styles.section}>
      <AnimatedPressable
        testID={`${testID}-hero`}
        accessibilityRole="button"
        accessibilityLabel={`${activeHero.title}. ${activeHero.ctaLabel}`}
        accessibilityHint="Opens this community destination"
        onPress={() => {
          if (activeHero.campaign) onHeroPress?.(activeHero.campaign);
          else onBrowse();
        }}
        hapticFeedback="light"
        scaleTo={0.99}
        style={[
          styles.heroCard,
          { backgroundColor: palette.muted, borderColor: palette.border },
        ]}
      >
        <View pointerEvents="none" style={styles.heroCopy}>
          <Text style={[styles.heroEyebrow, { color: palette.accent }]}>EDUTU COMMUNITY</Text>
          <Text style={[styles.heroTitle, { color: palette.foreground }]} numberOfLines={3}>
            {activeHero.title}
          </Text>
          <Text style={[styles.heroBody, { color: palette.textSecondary }]} numberOfLines={2}>
            {activeHero.body}
          </Text>
        </View>
        <View pointerEvents="none" style={styles.heroBottomRow}>
          <View style={[styles.heroCta, { backgroundColor: palette.accent }]}>
            <Text style={styles.heroCtaLabel} numberOfLines={1}>
              {activeHero.ctaLabel}
            </Text>
            <ArrowRight size={17} color="#FFFFFF" strokeWidth={2.5} />
          </View>
          {windowWidth >= 360 ? (
            <View style={[styles.heroArtFrame, { backgroundColor: palette.card }]}>
              <Image
                source={activeHero.imageSource}
                style={[styles.heroArt, usesDefaultHeroImage && styles.defaultHeroArt]}
                resizeMode="cover"
                accessible={false}
              />
            </View>
          ) : null}
        </View>
      </AnimatedPressable>

      {heroSlides.length > 1 ? (
        <View
          style={styles.heroDots}
          accessibilityLabel={`${heroIndex + 1} of ${heroSlides.length}`}
        >
          {heroSlides.map((slide, index) => (
            <View
              key={slide.id}
              style={[
                styles.heroDot,
                index === heroIndex && styles.heroDotActive,
                { backgroundColor: index === heroIndex ? palette.accent : palette.border },
              ]}
            />
          ))}
        </View>
      ) : null}

      {trendingRows.length ? (
        <View style={styles.contentSection}>
          <SectionHeading
            title={t('discovery.trending')}
            icon={<Flame size={22} color={palette.accent} strokeWidth={2.2} />}
            onSeeAll={onSeeAll}
            seeAllLabel={t('discovery.seeAll')}
            palette={palette}
          />
          <ScrollView
            testID={`${testID}-trending-scroll`}
            horizontal
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            snapToInterval={264}
            snapToAlignment="start"
            contentContainerStyle={styles.trendingContent}
            style={styles.trendingRail}
          >
            {trendingRows.map((row, index) => (
              <TrendingCommunityCard
                key={row.group.id}
                row={row}
                index={index}
                onPress={onPress}
                testID={legacyRowTestID?.(row.group)}
                palette={palette}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {communityRows.length ? (
        <View style={styles.contentSection}>
          <SectionHeading
            title={t('discovery.moreCommunities')}
            onSeeAll={onSeeAll}
            seeAllLabel={t('discovery.seeAll')}
            palette={palette}
          />
          <View
            testID={`${testID}-more-list`}
            style={[
              styles.moreList,
              { backgroundColor: palette.card, borderColor: palette.border },
            ]}
          >
            {communityRows.map((row, index) => (
              <MoreCommunityRow
                key={row.group.id}
                row={row}
                isLast={index === communityRows.length - 1}
                onPress={onPress}
                testID={legacyRowTestID?.(row.group)}
                palette={palette}
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function SectionHeading({
  title,
  icon,
  onSeeAll,
  seeAllLabel,
  palette,
}: {
  title: string;
  icon?: React.ReactNode;
  onSeeAll: () => void;
  seeAllLabel: string;
  palette: Palette;
}) {
  return (
    <View style={styles.headingRow}>
      <View style={styles.headingCopy}>
        {icon}
        <Text style={[styles.heading, { color: palette.foreground }]}>{title}</Text>
      </View>
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel={`${seeAllLabel} ${title}`}
        onPress={onSeeAll}
        hapticFeedback="selection"
        scaleTo={0.94}
        hitSlop={8}
        style={styles.seeAllButton}
      >
        <Text style={[styles.seeAll, { color: palette.accent }]}>{seeAllLabel}</Text>
      </AnimatedPressable>
    </View>
  );
}

function communityStats(
  group: CommunityGroup,
  t: ReturnType<typeof useTranslation<'community'>>['t'],
): string {
  return t('discovery.stats', {
    members: formatCommunityCount(group.memberCount),
    posts: formatCommunityCount(group.messageCount),
  });
}

function membershipLabel(
  status: MembershipStatus | undefined,
  t: ReturnType<typeof useTranslation<'community'>>['t'],
): string | null {
  switch (status) {
    case 'active':
      return t('discovery.joined');
    case 'invited':
      return t('membership.invited');
    case 'pending':
      return t('membership.pending');
    case 'removed':
      return t('membership.removed');
    case 'banned':
      return t('membership.banned');
    default:
      return null;
  }
}

function TrendingCommunityCard({
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
  palette: Palette;
}) {
  const { t } = useTranslation('community');
  const { group, membership } = row;
  const stats = communityStats(group, t);
  const memberState = membershipLabel(membership?.status, t);
  const active = membership?.status === 'active';

  return (
    <AnimatedPressable
      testID={testID ?? `community-trending-card-${group.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${group.name}, ${stats}${memberState ? `, ${memberState}` : ''}`}
      onPress={() => onPress(group)}
      hapticFeedback="light"
      scaleTo={0.985}
      style={[
        styles.trendingCard,
        { backgroundColor: palette.card, borderColor: palette.border },
      ]}
    >
      <View style={[styles.trendingCover, { backgroundColor: palette.muted }]}>
        <GroupAvatar
          resourceUrl={group.coverImageResourceUrl}
          imageUrl={getCommunityGroupCoverUrl(group.slug)}
          emoji={group.coverEmoji}
          size={252}
          radius={0}
          style={styles.trendingImage}
        />
        {index === 0 ? (
          <View style={[styles.hotBadge, { backgroundColor: palette.accent }]}>
            <Flame size={13} color="#FFFFFF" fill="#FFFFFF" />
            <Text style={styles.hotBadgeLabel}>{t('discovery.hot').toUpperCase()}</Text>
          </View>
        ) : null}
        {memberState ? (
          <View style={[styles.memberBadge, { backgroundColor: palette.badge }]}>
            {active ? <Check size={13} color={palette.success} strokeWidth={2.8} /> : null}
            <Text style={[styles.memberBadgeLabel, { color: active ? palette.success : palette.accent }]}>
              {memberState}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.trendingCopy}>
        <Text style={[styles.trendingName, { color: palette.foreground }]} numberOfLines={2}>
          {group.name}
        </Text>
        <Text style={[styles.trendingDescription, { color: palette.textSecondary }]} numberOfLines={2}>
          {group.description || t('discovery.fallbackDescription')}
        </Text>
        <View style={styles.statsRow}>
          <Users size={14} color={palette.textSecondary} strokeWidth={2} />
          <Text style={[styles.statsText, { color: palette.textSecondary }]} numberOfLines={1}>
            {stats}
          </Text>
        </View>
      </View>
    </AnimatedPressable>
  );
}

function MoreCommunityRow({
  row,
  isLast,
  onPress,
  testID,
  palette,
}: {
  row: GroupWithMembership;
  isLast: boolean;
  onPress: (group: CommunityGroup) => void;
  testID?: string;
  palette: Palette;
}) {
  const { t } = useTranslation('community');
  const { group, membership } = row;
  const stats = communityStats(group, t);
  const memberState = membershipLabel(membership?.status, t);

  return (
    <AnimatedPressable
      testID={testID ?? `community-more-row-${group.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${group.name}, ${stats}${memberState ? `, ${memberState}` : ''}`}
      onPress={() => onPress(group)}
      hapticFeedback="selection"
      scaleTo={0.99}
      style={[
        styles.moreRow,
        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border },
      ]}
    >
      <GroupAvatar
        resourceUrl={group.coverImageResourceUrl}
        imageUrl={getCommunityGroupCoverUrl(group.slug)}
        emoji={group.coverEmoji}
        size={62}
        radius={18}
      />
      <View style={styles.moreCopy}>
        <View style={styles.moreTitleRow}>
          <Text style={[styles.moreName, { color: palette.foreground }]} numberOfLines={1}>
            {group.name}
          </Text>
          {memberState ? (
            <Text
              style={[
                styles.inlineMemberState,
                { color: membership?.status === 'active' ? palette.success : palette.accent },
              ]}
              numberOfLines={1}
            >
              {memberState}
            </Text>
          ) : null}
        </View>
        <Text style={[styles.moreDescription, { color: palette.textSecondary }]} numberOfLines={1}>
          {group.description || t('discovery.fallbackDescription')}
        </Text>
        <View style={styles.statsRow}>
          <MessageCircle size={13} color={palette.textSecondary} strokeWidth={2} />
          <Text style={[styles.moreStats, { color: palette.textSecondary }]} numberOfLines={1}>
            {stats}
          </Text>
        </View>
      </View>
      <ChevronRight size={19} color={palette.textSecondary} strokeWidth={2.2} />
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  section: { gap: 19 },
  heroCard: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 14,
  },
  heroCopy: { width: '100%' },
  heroEyebrow: { fontSize: 9, fontWeight: '700', letterSpacing: 1.55, marginBottom: 6 },
  heroTitle: { maxWidth: 295, fontSize: 21, lineHeight: 25, fontWeight: '700', letterSpacing: -0.4 },
  heroBody: { fontSize: 12, lineHeight: 16, marginTop: 6 },
  heroBottomRow: {
    minHeight: 48,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  heroCta: {
    flexShrink: 1,
    alignSelf: 'flex-start',
    minHeight: 36,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroCtaLabel: { flexShrink: 1, color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  heroArtFrame: {
    width: '40%',
    minWidth: 112,
    maxWidth: 132,
    aspectRatio: 2,
    flexShrink: 0,
    borderRadius: 14,
    overflow: 'hidden',
  },
  heroArt: { width: '100%', height: '100%' },
  defaultHeroArt: {
    position: 'absolute',
    width: '128%',
    height: '128%',
    left: '-25%',
    top: '-6%',
  },
  heroDots: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: -14 },
  heroDot: { width: 6, height: 6, borderRadius: 3 },
  heroDotActive: { width: 18 },
  contentSection: { gap: 11 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headingCopy: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '700', letterSpacing: -0.3 },
  seeAllButton: { minHeight: 36, justifyContent: 'center', paddingLeft: 12 },
  seeAll: { fontSize: 13, fontWeight: '700' },
  trendingRail: { marginHorizontal: -18 },
  trendingContent: { paddingHorizontal: 18, paddingBottom: 3, gap: 12 },
  trendingCard: { width: 252, borderWidth: 1, borderRadius: 19, overflow: 'hidden' },
  trendingCover: { height: 146, overflow: 'hidden' },
  trendingImage: { position: 'absolute', top: -44, left: 0 },
  hotBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    minHeight: 29,
    borderRadius: 15,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  hotBadgeLabel: { color: '#FFFFFF', fontSize: 10, fontWeight: '800', letterSpacing: 0.45 },
  memberBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    minHeight: 29,
    maxWidth: 132,
    borderRadius: 15,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  memberBadgeLabel: { fontSize: 10, fontWeight: '700' },
  trendingCopy: { minHeight: 122, paddingHorizontal: 13, paddingTop: 12, paddingBottom: 13 },
  trendingName: { fontSize: 17, lineHeight: 21, fontWeight: '700', letterSpacing: -0.15 },
  trendingDescription: { marginTop: 5, fontSize: 12, lineHeight: 17 },
  statsRow: { marginTop: 'auto', paddingTop: 9, flexDirection: 'row', alignItems: 'center', gap: 5 },
  statsText: { flex: 1, fontSize: 11, lineHeight: 15, fontWeight: '600' },
  moreList: { borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
  moreRow: { minHeight: 88, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 11 },
  moreCopy: { flex: 1, minWidth: 0 },
  moreTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  moreName: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 18, fontWeight: '700' },
  inlineMemberState: { maxWidth: 88, fontSize: 10, lineHeight: 14, fontWeight: '700' },
  moreDescription: { marginTop: 2, fontSize: 11, lineHeight: 15 },
  moreStats: { flex: 1, fontSize: 10, lineHeight: 14, fontWeight: '600' },
});
