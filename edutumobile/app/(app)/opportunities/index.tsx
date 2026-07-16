import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
  Dimensions,
  Animated, useAnimatedValue,
  Easing,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth, useUser } from '@clerk/clerk-expo';
import {
  Award,
  ArrowLeft,
  ChevronRight,
  Compass,
  BookmarkPlus,
  LayoutGrid,
  CheckCircle2,
  Search,
  Sparkles,
  MapPin,
  Clock,
  TrendingUp,
  X,
  Globe,
  Users,
  DollarSign,
  Menu,
  RefreshCw,
  Settings,
  Inbox,
  Share2,
  ArrowDownWideNarrow,
  Bell,
  AlertCircle,
} from 'lucide-react-native';
import { ScreenHeader } from '../../../components/ui/ScreenHeader';
import { AnimatedPressable } from '../../../components/ui/AnimatedPressable';
import { useTheme } from '../../../components/context/ThemeContext';
import { supabase } from '../../../lib/supabase';
import { useOpportunities } from '@edutu/core/src/hooks/useOpportunities';
import { Opportunity } from '@edutu/core/src/types/opportunity';
import { recordOpportunitySignal } from '@edutu/core/src/services/opportunitySignals';
import { markImpression } from '../../../lib/impressions';
import { createSavedSearch } from '@edutu/core/src/services/savedSearches';
import { getDeadlineBadge, urgencyColor } from '@edutu/core/src/utils/deadline';
import { LinearGradient } from 'expo-linear-gradient';
import { syncAndUpdateOpportunityWidgetSnapshot } from '../../../lib/opportunityWidgetSync';
import { AdBanner, BANNER_PRESETS } from '../../../components/ui/AdBanner';
import { DISCOVERY_CATEGORY_CATALOG, normalizeDiscoveryCategoryId, type DiscoveryCategoryId } from '../../../lib/discoveryCategories';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DISCOVERY_TILE_GLYPHS, DISCOVERY_TILE_GRADIENTS } from '../../../lib/discoveryTileGlyphs';
import { shareOpportunity } from '../../../lib/shareOpportunity';

type SortMode = 'recommended' | 'deadline' | 'newest';

// Labels are i18n keys in the 'opps' namespace, translated at render time.
const SORT_OPTIONS: Array<{ id: SortMode; label: string }> = [
  { id: 'recommended', label: 'list.sort.recommended' },
  { id: 'deadline', label: 'list.sort.deadline' },
  { id: 'newest', label: 'list.sort.newest' },
];

const { width } = Dimensions.get('window');
const FOR_YOU_THRESHOLD = 35;
const CARD_WIDTH = (width - 60) / 2;
// 4 tiles per row: screen minus list padding (20×2) and 3 inter-tile gaps.
const DISCOVERY_TILE_WIDTH = (width - 40 - 3 * 8) / 4;

// Cards come from the shared catalog (mirrors Supabase opportunity_categories
// and the backend canonical categories). `label` is an i18n key in 'opps'.
const DISCOVERY_CARDS = DISCOVERY_CATEGORY_CATALOG.map((category) => ({
  id: category.id,
  label: category.oppsLabelKey,
  fallbackTitle: category.fallbackTitle,
  icon: category.icon,
  colors: category.colors,
  accent: category.accent,
  image: category.image,
}));

// Distinct glyph + solid gradient per category, shared with the home tiles.
const DISCOVERY_TILE_ICONS = DISCOVERY_TILE_GLYPHS;

// `title`/`desc` hold i18n keys in the 'opps' namespace, translated at render time.
const OTHER_FEATURES = [
  {
    id: 'discussion',
    title: 'list.features.discussion.title',
    desc: 'list.features.discussion.desc',
    icon: Users,
    route: 'https://whatsapp.com/channel/0029VbCHBEVJJhzPcbBboP3y',
    external: true,
    gradient: ['#0EA5E9', '#2563EB'] as const,
  },
  {
    id: 'saved',
    title: 'list.features.saved.title',
    desc: 'list.features.saved.desc',
    icon: BookmarkPlus,
    route: '/saved',
    gradient: ['#EC4899', '#DB2777'] as const,
  },
  {
    id: 'applied',
    title: 'list.features.applied.title',
    desc: 'list.features.applied.desc',
    icon: CheckCircle2,
    route: '/applied',
    gradient: ['#14B8A6', '#0F766E'] as const,
  },
  {
    id: 'deadlines',
    title: 'list.features.deadlines.title',
    desc: 'list.features.deadlines.desc',
    icon: Clock,
    route: '/deadlines',
    gradient: ['#F97316', '#DC2626'] as const,
  },
  {
    id: 'studio',
    title: 'list.features.studio.title',
    desc: 'list.features.studio.desc',
    icon: LayoutGrid,
    route: '/creator-dashboard',
    gradient: ['#111827', '#374151'] as const,
  },
  {
    id: 'submissions',
    title: 'list.features.submissions.title',
    desc: 'list.features.submissions.desc',
    icon: Inbox,
    route: '/opportunities/submissions',
    gradient: ['#6366F1', '#4338CA'] as const,
  },
] satisfies Array<{
  id: string;
  title: string;
  desc: string;
  icon: React.ComponentType<any>;
  route: string;
  external?: boolean;
  gradient: readonly [string, string];
}>;

type PersonalizationProfile = {
  country?: string;
  countryCode?: string;
  interests?: string[];
  ambitions?: string[];
  pursuit?: string;
  schoolName?: string;
  gradeLevel?: string;
  isGraduate?: string;
};

function getAccent(opportunity: Opportunity): string {
  const category = opportunity.category?.toLowerCase() || '';
  if (category.includes('scholar')) return '#3b82f6';
  if (category.includes('intern')) return '#3B82F6';
  if (category.includes('job')) return '#10B981';
  if (category.includes('fellow')) return '#F59E0B';
  return '#6366F1';
}

function getDeadlineText(deadline?: string | null): { text: string; color: string; days: number | null } {
  const badge = getDeadlineBadge(deadline);
  return { text: badge.shortLabel, color: urgencyColor(badge.level), days: badge.daysLeft };
}

function getCategoryIcon(category: string) {
  const cat = category?.toLowerCase() || '';
  if (cat.includes('scholar')) return Award;
  if (cat.includes('job')) return Globe;
  if (cat.includes('intern')) return Users;
  if (cat.includes('fellow')) return Sparkles;
  return Compass;
}

// Render helper (not a component): getCategoryIcon returns a stable component
// from a lookup table, but assigning it to a local inside a component render
// reads as a component definition to the compiler (static-components).
function renderCategoryIcon(category: string, size: number, color: string) {
  const CategoryIcon = getCategoryIcon(category);
  return <CategoryIcon size={size} color={color} />;
}

function shuffleOpportunities(items: Opportunity[], seed: number): Opportunity[] {
  if (!seed) return items;
  const copy = [...items];
  let state = seed * 9301 + 49297;
  for (let i = copy.length - 1; i > 0; i -= 1) {
    state = (state * 9301 + 49297) % 233280;
    const j = Math.floor((state / 233280) * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Soonest deadline first; expired after active; rolling/none always last.
function deadlineSortKey(opportunity: Opportunity): number {
  const days = getDeadlineBadge(opportunity.deadline).daysLeft;
  if (days === null) return Number.POSITIVE_INFINITY;
  if (days < 0) return Number.MAX_SAFE_INTEGER;
  return days;
}

function newestSortKey(opportunity: Partial<Opportunity> & Record<string, any>): number {
  const raw = opportunity.createdAt || opportunity.created_at || opportunity.lastUpdated || opportunity.last_updated;
  const time = raw ? new Date(raw).getTime() : NaN;
  return Number.isNaN(time) ? 0 : time;
}

function sortOpportunities(list: Opportunity[], mode: SortMode, seed: number): Opportunity[] {
  if (mode === 'deadline') {
    return [...list].sort((a, b) => deadlineSortKey(a) - deadlineSortKey(b));
  }
  if (mode === 'newest') {
    return [...list].sort((a, b) => newestSortKey(b) - newestSortKey(a));
  }
  // Recommended: match desc, but shuffle within same-score tiers so equal
  // matches don't always show in the same order (stable sort preserves shuffle).
  return shuffleOpportunities(list, seed).sort((a, b) => (b.match || 0) - (a.match || 0));
}

function getDiscoveryLabel(id: DiscoveryCategoryId): string {
  return DISCOVERY_CARDS.find((category) => category.id === id)?.label || id;
}

function getDiscoveryPageTitle(id: DiscoveryCategoryId): string {
  // Keep the page title identical to the card label on every surface
  // (home grid + discover cards). "grants" is the internal id for Programs.
  return getDiscoveryLabel(id);
}

function getDiscoveryCard(id: DiscoveryCategoryId | null) {
  return id ? DISCOVERY_CARDS.find((category) => category.id === id) ?? null : null;
}

function normalizeOpportunityText(opportunity: Partial<Opportunity> & Record<string, any>): string {
  return [
    opportunity.canonicalCategory,
    opportunity.canonical_category,
    opportunity.category,
    opportunity.title,
    opportunity.organization,
    opportunity.location,
    opportunity.description,
    opportunity.aiSummary,
    opportunity.ai_summary,
    opportunity.refined_summary,
    opportunity.fundingType,
    opportunity.tags,
    opportunity.aiTags,
    opportunity.ai_tags,
    opportunity.requirements,
    opportunity.benefits,
    opportunity.metadata,
  ]
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .filter(Boolean)
    .map((value) => String(value).toLowerCase())
    .join(' ');
}

function matchesDiscoveryCategory(opportunity: Partial<Opportunity> & Record<string, any>, category: DiscoveryCategoryId | null): boolean {
  if (!category) return true;
  const canonical = String(
    opportunity.canonicalCategory ||
    opportunity.canonical_category ||
    opportunity.metadata?.canonical_category ||
    '',
  )
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  if (canonical) {
    if (category === 'scholarships') return canonical === 'scholarships' || canonical === 'scholarship';
    if (category === 'internships') return canonical === 'internships' || canonical === 'internship' || canonical === 'careers';
    if (category === 'fellowships') return canonical === 'fellowships' || canonical === 'fellowship' || canonical === 'leadership';
    if (category === 'grants') return canonical === 'grants' || canonical === 'grant';
    if (category === 'graduate_programs') return canonical === 'graduate_programs' || canonical === 'graduate_program';
    if (category === 'bootcamps') return canonical === 'bootcamps' || canonical === 'bootcamp';
    if (category === 'events') return canonical === 'events' || canonical === 'event';
    // "Programs" — programmatic opportunities, excluding the buckets above.
    return (
      canonical === 'programs' || canonical === 'program' ||
      canonical === 'global_programs' || canonical === 'global_program'
    );
  }

  const text = normalizeOpportunityText(opportunity);
  const isScholarship = /\bscholar(ship|ships)?\b|\bbursar(y|ies)\b|\btuition\b|\bfinancial aid\b/.test(text);
  const isInternship = /\bintern(ship|ships)?\b|\btrainee\b|\bapprentice(ship)?\b/.test(text);
  const isFellowship = /\bfellow(ship|ships)?\b|\bfellow\b|\bresearch fellowship\b|\bresidency\b/.test(text);
  const isGrant = /\bgrant(s)?\b|\bseed funding\b|\bmicrogrant(s)?\b|\bproject funding\b|\bresearch grant(s)?\b|\binnovation fund\b/.test(text);
  const isGraduateProgram = /\bmaster'?s\b|\bmsc\b|\bmba\b|\bphd\b|\bdoctora(l|te)\b|\bpostgraduate\b|\bgraduate (program|programme|school|study|studies)\b/.test(text);
  const isBootcamp = /\bbootcamp(s)?\b|\baccelerator(s)?\b|\bincubator(s)?\b|\bcoding bootcamp\b/.test(text);
  const isEvent = /\bsummit(s)?\b|\bconference(s)?\b|\bforum(s)?\b|\bworkshop(s)?\b|\bwebinar(s)?\b|\bexpo(s)?\b|\bdelegate(s)?\b/.test(text);
  if (category === 'scholarships') {
    return isScholarship;
  }
  if (category === 'internships') {
    return isInternship;
  }
  if (category === 'fellowships') {
    // Fellowship-specific opportunities, minus the scholarship/internship buckets.
    return isFellowship && !isScholarship && !isInternship;
  }
  if (category === 'grants') {
    return isGrant && !isScholarship;
  }
  if (category === 'graduate_programs') {
    return isGraduateProgram && !isInternship;
  }
  if (category === 'bootcamps') {
    return isBootcamp;
  }
  if (category === 'events') {
    return isEvent && !isScholarship && !isFellowship;
  }
  // Programs = broad programmatic opportunities, minus the buckets that have
  // their own card.
  const isSpecificProgram =
    /\bone young world\b|\byouth ambassador(s)?\b|\bglobal ambassador(s)?\b|\bleadership program(s)?\b|\bexchange program(s)?\b|\bchallenge(s)?\b|\bcompetition(s)?\b|\bhackathon(s)?\b|\btraining program(s)?\b|\bmentorship program(s)?\b|\bglobal program(s)?\b|\bprogram(me|mes|s)?\b|\bfund(ing)?\b/.test(text);
  return isSpecificProgram && !isScholarship && !isInternship && !isFellowship && !isGrant && !isGraduateProgram && !isBootcamp && !isEvent;
}

function DiscoveryCard({
  item,
  active,
  onPress,
}: {
  item: typeof DISCOVERY_CARDS[number];
  active: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation('opps');
  const { colors } = useTheme();
  const title = t(item.label, { defaultValue: item.fallbackTitle });
  const glyph = DISCOVERY_TILE_ICONS[item.id];
  // No `entering` animation here: staggered entering on wrap-grid children
  // inside the FlatList header (which remounts via key={viewMode}) lands tiles
  // at wrong offsets, overlapping the sections below.
  return (
    <AnimatedPressable
      onPress={onPress}
      style={styles.discoveryCard}
      hapticFeedback="medium"
      scaleTo={0.92}
    >
      <View style={styles.discoveryCardInner}>
        <LinearGradient
          colors={DISCOVERY_TILE_GRADIENTS[item.id]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.discoveryIconTile, active && styles.discoveryCardActive]}
        >
          <Ionicons name={glyph} color="#FFFFFF" size={28} />
        </LinearGradient>
        <Text
          style={[styles.discoveryTitle, { color: active ? colors.foreground : colors.textSecondary }]}
          numberOfLines={2}
        >
          {title}
        </Text>
      </View>
    </AnimatedPressable>
  );
}

function FeatureCard({
  item,
  onPress,
  colors,
}: {
  item: typeof OTHER_FEATURES[number];
  onPress: () => void;
  colors: any;
}) {
  const { t } = useTranslation('opps');
  const Icon = item.icon;

  return (
    <Pressable onPress={onPress} style={[styles.featureCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <LinearGradient colors={item.gradient as [string, string]} style={styles.featureCardGradient}>
        <View style={styles.featureCardTop}>
          <View style={styles.featureCardIconWrap}>
            <Icon size={18} color="#FFFFFF" strokeWidth={2} />
          </View>
          <ChevronRight size={16} color="rgba(255,255,255,0.92)" />
        </View>
        <View style={styles.featureCardBody}>
          <Text style={styles.featureCardTitle} numberOfLines={1}>{t(item.title)}</Text>
          <Text style={styles.featureCardDesc} numberOfLines={2}>{t(item.desc)}</Text>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

// ─── Skeleton Card (first-load placeholder) ──────────────────────────────────
function SkeletonCard({ colors }: { colors: any }) {
  const pulse = useAnimatedValue(0.45);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View style={[styles.skeletonCard, { backgroundColor: colors.card, borderColor: colors.border, opacity: pulse }]}>
      <View style={[styles.skeletonImage, { backgroundColor: colors.border }]} />
      <View style={styles.skeletonBody}>
        <View style={[styles.skeletonLine, { backgroundColor: colors.border, width: '88%' }]} />
        <View style={[styles.skeletonLine, { backgroundColor: colors.border, width: '64%' }]} />
        <View style={[styles.skeletonLine, { backgroundColor: colors.border, width: '42%' }]} />
      </View>
    </Animated.View>
  );
}

// ─── Detail Card (Grid view for explore) ─────────────────────────────────────
function DetailCard({ item, onPress, onShare, colors, isDark }: { item: Opportunity; onPress: () => void; onShare: (item: Opportunity) => void; colors: any; isDark: boolean }) {
  const { t } = useTranslation('opps');
  const accent = getAccent(item);
  const deadline = getDeadlineText(item.deadline);

  return (
    <Pressable onPress={onPress} style={[styles.detailCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Image/Gradient Header */}
      <View style={styles.detailCardHeader}>
        {item.image ? (
          <Image source={{ uri: item.image }} style={styles.detailCardImage} resizeMode="cover" />
        ) : (
          <LinearGradient colors={[`${accent}25`, `${accent}08`]} style={styles.detailCardImageFallback}>
            {renderCategoryIcon(item.category, 28, accent)}
          </LinearGradient>
        )}
        {item.match >= FOR_YOU_THRESHOLD && (
          <View style={[styles.detailMatchBadge, { backgroundColor: `${accent}80` }]}>
            <Sparkles size={10} color="white" />
            <Text style={styles.detailMatchText}>{item.match}%</Text>
          </View>
        )}
        {deadline.days !== null && deadline.days <= 7 && deadline.days >= 0 && (
          <View style={[styles.detailUrgentBadge, { backgroundColor: 'rgba(239,68,68,0.85)' }]}>
            <Text style={styles.detailUrgentText}>{deadline.text}</Text>
          </View>
        )}
      </View>

      {/* Card Body */}
      <View style={styles.detailCardBody}>
        <View style={[styles.detailCategoryBadge, { backgroundColor: `${accent}12` }]}>
          <Text style={[styles.detailCategoryText, { color: accent }]} numberOfLines={1}>
            {item.category || t('shared.opportunity')}
          </Text>
        </View>

        <Text style={[styles.detailCardTitle, { color: colors.foreground }]} numberOfLines={2}>
          {item.title}
        </Text>

        <Text style={[styles.detailCardOrg, { color: colors.textSecondary }]} numberOfLines={1}>
          {item.organization}
        </Text>

        {item.matchReasons?.[0] && (item.match || 0) >= 40 && (
          <Text style={styles.detailMatchReason} numberOfLines={1}>
            {item.matchReasons[0]}
          </Text>
        )}

        {/* Meta Info */}
        <View style={styles.detailCardMeta}>
          <View style={styles.detailMetaItem}>
            <MapPin size={12} color={colors.textSecondary} />
            <Text style={[styles.detailMetaText, { color: colors.textSecondary }]} numberOfLines={1}>
              {item.isRemote ? t('shared.remote') : item.location?.split(',')[0] || t('shared.worldwide')}
            </Text>
          </View>
          <View style={[styles.detailMetaItem, { backgroundColor: `${deadline.color}10` }]}>
            <Clock size={12} color={deadline.color} />
            <Text style={[styles.detailMetaText, { color: deadline.color }]}>{deadline.text}</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.detailCardFooter}>
          {item.stipend && item.stipend > 0 ? (
            <View style={[styles.detailStipend, { backgroundColor: 'rgba(16,185,129,0.08)' }]}>
              <TrendingUp size={12} color="#10B981" />
              <Text style={[styles.detailStipendText, { color: '#10B981' }]}>
                {item.currency || '$'}{item.stipend >= 1000 ? `${(item.stipend / 1000).toFixed(0)}k` : item.stipend}
              </Text>
            </View>
          ) : (
            <View style={[styles.detailFree, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#f1f5f9' }]}>
              <Text style={[styles.detailFreeText, { color: colors.textSecondary }]}>{t('list.card.open')}</Text>
            </View>
          )}
          <View style={styles.detailFooterActions}>
            <Pressable
              onPress={(event) => {
                event.stopPropagation();
                onShare(item);
              }}
              hitSlop={8}
              style={[styles.detailShareBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9' }]}
            >
              <Share2 size={15} color={colors.textSecondary} />
            </Pressable>
            <View style={[styles.detailArrow, { backgroundColor: `${accent}12` }]}>
              <ChevronRight size={16} color={accent} />
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

// ─── Compact Card (For You grid) ─────────────────────────────────────────────
// Minimal poster: image + match %, title, one meta line. No footer, no org
// (it usually repeats the title), no per-card match-reason boilerplate.
function CompactCard({ item, onPress, colors }: { item: Opportunity; onPress: () => void; colors: any }) {
  const { t } = useTranslation('opps');
  const accent = getAccent(item);
  const deadline = getDeadlineText(item.deadline);
  const locationLabel = item.isRemote ? t('shared.remote') : item.location?.split(',')[0]?.trim();

  return (
    <Pressable onPress={onPress} style={[styles.compactCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.compactCardHeader}>
        {item.image ? (
          <Image source={{ uri: item.image }} style={styles.detailCardImage} resizeMode="cover" />
        ) : (
          <LinearGradient colors={[`${accent}25`, `${accent}08`]} style={styles.detailCardImageFallback}>
            {renderCategoryIcon(item.category, 22, accent)}
          </LinearGradient>
        )}
        {item.match >= FOR_YOU_THRESHOLD && (
          <View style={[styles.detailMatchBadge, { backgroundColor: `${accent}80` }]}>
            <Sparkles size={10} color="white" />
            <Text style={styles.detailMatchText}>{item.match}%</Text>
          </View>
        )}
        {item.category ? (
          <View style={styles.compactCategoryBadge}>
            <Text style={styles.compactCategoryText} numberOfLines={1}>{item.category}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.compactCardBody}>
        <Text style={[styles.compactCardTitle, { color: colors.foreground }]} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={styles.compactCardMeta}>
          {locationLabel ? (
            <View style={styles.compactMetaItem}>
              <MapPin size={11} color={colors.textSecondary} />
              <Text style={[styles.compactMetaText, { color: colors.textSecondary }]} numberOfLines={1}>
                {locationLabel}
              </Text>
            </View>
          ) : null}
          {deadline.days !== null && (
            <View style={styles.compactMetaItem}>
              <Clock size={11} color={deadline.color} />
              <Text style={[styles.compactMetaText, { color: deadline.color }]}>{deadline.text}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

// ─── List Row (for list view) ────────────────────────────────────────────────
function ListRow({ item, onPress, onShare, colors }: { item: Opportunity; onPress: () => void; onShare: (item: Opportunity) => void; colors: any }) {
  const { t } = useTranslation('opps');
  const accent = getAccent(item);
  const deadline = getDeadlineText(item.deadline);

  return (
    <Pressable onPress={onPress} style={[styles.listRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Thumbnail */}
      <View style={[styles.listThumbWrap, { backgroundColor: `${accent}12` }]}>
        {item.image ? (
          <Image source={{ uri: item.image }} style={styles.listThumb} resizeMode="cover" />
        ) : (
          renderCategoryIcon(item.category, 24, accent)
        )}
      </View>

      {/* Content */}
      <View style={styles.listContent}>
        <View style={[styles.listCategoryBadge, { backgroundColor: `${accent}12` }]}>
          <Text style={[styles.listCategoryText, { color: accent }]}>{item.category || t('shared.opportunity')}</Text>
        </View>
        <Text style={[styles.listTitle, { color: colors.foreground }]} numberOfLines={2}>{item.title}</Text>
        <Text style={[styles.listOrg, { color: colors.textSecondary }]} numberOfLines={1}>{item.organization}</Text>

        <View style={styles.listMeta}>
          <View style={styles.listMetaItem}>
            <MapPin size={10} color={colors.textSecondary} />
            <Text style={[styles.listMetaText, { color: colors.textSecondary }]}>{item.isRemote ? t('shared.remote') : item.location?.split(',')[0] || t('shared.worldwide')}</Text>
          </View>
          <View style={[styles.listDeadlineBadge, { backgroundColor: `${deadline.color}12` }]}>
            <Clock size={10} color={deadline.color} />
            <Text style={[styles.listDeadlineText, { color: deadline.color }]}>{deadline.text}</Text>
          </View>
          {item.stipend && item.stipend > 0 && (
            <View style={styles.listStipend}>
              <DollarSign size={10} color="#10B981" />
              <Text style={[styles.listStipendText, { color: '#10B981' }]}>
                {item.currency || '$'}{item.stipend >= 1000 ? `${(item.stipend / 1000).toFixed(0)}k` : item.stipend}
              </Text>
            </View>
          )}
        </View>
      </View>

      <Pressable
        onPress={(event) => {
          event.stopPropagation();
          onShare(item);
        }}
        hitSlop={8}
        style={styles.listShareBtn}
      >
        <Share2 size={16} color={colors.textSecondary} />
      </Pressable>
      <ChevronRight size={18} color={colors.textSecondary} />
    </Pressable>
  );
}

export default function OpportunitiesScreen() {
  const { t } = useTranslation('opps');
  const { user } = useUser();
  const { getToken } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ view?: string; category?: string; q?: string }>();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<Opportunity>>(null);
  const searchInputRef = useRef<TextInput>(null);
  const searchExpand = useAnimatedValue(0);
  const scrollY = useAnimatedValue(0);
  const { colors, isDark } = useTheme();
  // Deep link from saved-search alerts: /opportunities?q=... preloads the search.
  const initialSearchQuery = typeof params.q === 'string' && params.q.trim() ? params.q : '';
  // normalizeDiscoveryCategoryId also maps legacy slugs (singular forms,
  // training_conferences → events) onto catalog ids.
  const normalizedCategoryParam = normalizeDiscoveryCategoryId(
    typeof params.category === 'string' ? params.category : null,
  );
  const [searchTerm, setSearchTerm] = useState(initialSearchQuery);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortMode, setSortMode] = useState<SortMode>('recommended');
  const [showSearch, setShowSearch] = useState(Boolean(initialSearchQuery));
  const [showMenu, setShowMenu] = useState(false);
  const [selectedDiscoveryCategory, setSelectedDiscoveryCategory] = useState<DiscoveryCategoryId | null>(normalizedCategoryParam);
  const [shuffleSeed, setShuffleSeed] = useState(0);

  // Adjust-during-render (React's documented alternative to state-syncing
  // effects): sync search + category state when the route params change.
  const [prevQParam, setPrevQParam] = useState(params.q);
  if (prevQParam !== params.q) {
    setPrevQParam(params.q);
    if (typeof params.q === 'string' && params.q.trim()) {
      setSearchTerm(params.q);
      setShowSearch(true);
    }
  }
  const [prevCategoryParam, setPrevCategoryParam] = useState(normalizedCategoryParam);
  if (prevCategoryParam !== normalizedCategoryParam) {
    setPrevCategoryParam(normalizedCategoryParam);
    setSelectedDiscoveryCategory(normalizedCategoryParam);
  }

  // Debounce the search term (~250ms) so typing stays smooth.
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(searchTerm), 250);
    return () => clearTimeout(handle);
  }, [searchTerm]);

  // Impressions: an item counts as SEEN when ≥60% visible for ≥500ms. Both
  // callbacks live in refs because FlatList requires stable identities for
  // the viewability pair across renders (and key={viewMode} remounts).
  const impressionContextRef = useRef({ getToken, surface: 'explore_list' });
  // Lazy useState instead of useRef(...).current: identical stable identity
  // without reading a ref during render.
  const [viewabilityConfig] = useState(() => ({
    itemVisiblePercentThreshold: 60,
    minimumViewTime: 500,
  }));
  const [onViewableItemsChanged] = useState(() =>
    ({ viewableItems }: {
      viewableItems: Array<{ item: Opportunity; index: number | null; isViewable: boolean }>;
    }) => {
      const { getToken: getTokenNow, surface } = impressionContextRef.current;
      viewableItems.forEach(({ item, index, isViewable }) => {
        if (!isViewable || !item?.id) return;
        markImpression(item.id, surface, index ?? -1, getTokenNow);
      });
    },
  );

  // Settled search queries are browse intent the engine can learn from
  // (category affinity via query terms, later query understanding). Deduped
  // against the last sent query so backspacing doesn't re-fire.
  const lastSearchSignalRef = useRef('');
  useEffect(() => {
    const query = debouncedSearch.trim().toLowerCase();
    if (query.length < 3 || query === lastSearchSignalRef.current) return;
    lastSearchSignalRef.current = query;
    void recordOpportunitySignal({
      signalType: 'search',
      source: 'mobile_explore',
      context: 'explore_search',
      details: { query },
    }, getToken);
  }, [debouncedSearch, getToken]);

  useFocusEffect(
    useCallback(() => {
      DISCOVERY_CARDS.forEach((card) => {
        if (!card.image) return;
        const source = Image.resolveAssetSource(card.image);
        if (source?.uri) {
          void Image.prefetch(source.uri);
        }
      });
    }, []),
  );

  // Single choke point for category browse intent: home tiles, the in-screen
  // chooser, and deep links all land here. category_view feeds the ranking
  // engine's category affinity directly (no opportunityId — payload in details).
  useEffect(() => {
    if (normalizedCategoryParam) {
      void recordOpportunitySignal({
        signalType: 'category_view',
        source: 'mobile_explore',
        context: 'category_browse',
        details: { category: normalizedCategoryParam },
      }, getToken);
    }
  }, [normalizedCategoryParam, getToken]);

  useEffect(() => {
    Animated.timing(searchExpand, {
      toValue: showSearch ? 1 : 0,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    if (showSearch) {
      const focusTimer = setTimeout(() => searchInputRef.current?.focus(), 170);
      return () => clearTimeout(focusTimer);
    }
  }, [searchExpand, showSearch]);
  const personalizationProfile = useMemo<PersonalizationProfile | null>(() => {
    const metadata = (user?.unsafeMetadata || {}) as Record<string, unknown>;
    if (!metadata || Object.keys(metadata).length === 0) return null;
    return {
      country: typeof metadata.country === 'string' ? metadata.country : undefined,
      countryCode: typeof metadata.countryCode === 'string' ? metadata.countryCode : undefined,
      interests: Array.isArray(metadata.interests) ? (metadata.interests as string[]) : [],
      ambitions: Array.isArray(metadata.ambitions) ? (metadata.ambitions as string[]) : [],
      pursuit: typeof metadata.pursuit === 'string' ? metadata.pursuit : undefined,
      schoolName: typeof metadata.schoolName === 'string' ? metadata.schoolName : undefined,
      gradeLevel: typeof metadata.gradeLevel === 'string' ? metadata.gradeLevel : undefined,
      isGraduate: typeof metadata.isGraduate === 'string' ? metadata.isGraduate : undefined,
    };
  }, [user?.unsafeMetadata]);

  const hasPersonalizationDetails = useMemo(() => {
    if (!personalizationProfile) return false;
    return Boolean(
      personalizationProfile.country || personalizationProfile.pursuit ||
      personalizationProfile.schoolName || personalizationProfile.gradeLevel ||
      personalizationProfile.interests?.length || personalizationProfile.ambitions?.length,
    );
  }, [personalizationProfile]);

  const syncOpportunityWidget = useCallback(async (freshOpportunities: Opportunity[]) => {
    await syncAndUpdateOpportunityWidgetSnapshot({
      userId: user?.id,
      opportunities: freshOpportunities,
    });
  }, [user?.id]);

  const { data: opportunities, loading, error, refresh } = useOpportunities({
    supabase,
    userId: user?.id || undefined,
    getAuthToken: getToken,
    profileOverride: personalizationProfile,
    onSyncSnapshot: syncOpportunityWidget,
  });

  const showForYouOnly = params.view === 'foryou';
  const isCategoryPage = Boolean(selectedDiscoveryCategory);
  // Keep the impression callback's context current without breaking the
  // stable-identity requirement on the viewability pair. Render-time ref
  // writes are unsafe under concurrent rendering; the reader
  // (onViewableItemsChanged) fires post-commit, so an effect write is fine.
  useEffect(() => {
    impressionContextRef.current = {
      getToken,
      surface: showForYouOnly
        ? 'explore_for_you'
        : selectedDiscoveryCategory
          ? 'explore_category'
          : 'explore_list',
    };
  });
  const pageTitle = selectedDiscoveryCategory ? t(getDiscoveryPageTitle(selectedDiscoveryCategory)) : t('list.title');
  const selectedDiscoveryCard = getDiscoveryCard(selectedDiscoveryCategory);
  const pageSubtitle = selectedDiscoveryCategory
    ? t('list.browseOnly', { category: t(getDiscoveryPageTitle(selectedDiscoveryCategory)).toLowerCase() })
    : t('list.chooseCategory');
  const searchHeight = searchExpand.interpolate({ inputRange: [0, 1], outputRange: [0, 70] });
  const searchOpacity = searchExpand.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 0, 1] });
  const searchTranslate = searchExpand.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] });
  const categoryHeroOpacity = scrollY.interpolate({
    inputRange: [0, 96, 150],
    outputRange: [1, 0.42, 0],
    extrapolate: 'clamp',
  });
  const categoryHeaderOpacity = scrollY.interpolate({
    inputRange: [88, 145],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const categoryHeaderTranslate = scrollY.interpolate({
    inputRange: [88, 145],
    outputRange: [-18, 0],
    extrapolate: 'clamp',
  });

  // For You must always show opportunities once any have loaded. Prefer
  // profile-ranked matches (>= threshold), but fall back to the full list so a
  // transient re-ranking (match scores briefly dropping to 0 during server
  // hydration) never collapses the section back to an empty "building" state.
  const forYou = useMemo(() => {
    const ranked = opportunities.filter((item) => (item.match || 0) >= FOR_YOU_THRESHOLD);
    const base = ranked.length > 0 ? ranked : opportunities;
    return shuffleOpportunities(base, shuffleSeed).slice(0, 8);
  }, [opportunities, shuffleSeed]);

  const fullForYou = useMemo(() => {
    const ranked = opportunities
      .filter((item) => (item.match || 0) >= FOR_YOU_THRESHOLD)
      .sort((a, b) => (b.match || 0) - (a.match || 0));
    const base = ranked.length > 0 ? ranked : opportunities;
    return shuffleOpportunities(base, shuffleSeed);
  }, [opportunities, shuffleSeed]);

  const explore = useMemo(() => {
    const tokens = debouncedSearch.trim().toLowerCase().split(/\s+/).filter(Boolean);
    let filtered = showForYouOnly ? [...fullForYou] : [...opportunities];

    // Token-based match: every word must appear somewhere in the broad haystack
    // (title, org, category, location, tags, benefits, summary, requirements…).
    if (tokens.length) {
      filtered = filtered.filter((item) => {
        const haystack = normalizeOpportunityText(item);
        return tokens.every((token) => haystack.includes(token));
      });
    }

    filtered = filtered.filter((item) => matchesDiscoveryCategory(item, selectedDiscoveryCategory));

    return sortOpportunities(filtered, sortMode, shuffleSeed);
  }, [fullForYou, opportunities, debouncedSearch, selectedDiscoveryCategory, showForYouOnly, sortMode, shuffleSeed]);

  const shouldShowChooser = !showForYouOnly && !isCategoryPage;

  // Warm the image cache for the opportunities most likely to be seen next so
  // their remote banners appear instantly instead of popping in during scroll.
  useEffect(() => {
    const uris = new Set<string>();
    forYou.slice(0, 4).forEach((item) => item.image && uris.add(item.image));
    explore.slice(0, 16).forEach((item) => item.image && uris.add(item.image));
    uris.forEach((uri) => void Image.prefetch(uri).catch(() => undefined));
  }, [forYou, explore]);

  const openOpportunity = (opportunityId: string, context: string) => {
    // A deliberate card tap is a 'click' (weight 5 in the ranking engine);
    // 'view' (weight 2) is reserved for the detail screen actually loading.
    void recordOpportunitySignal({
      opportunityId,
      signalType: 'click',
      signalValue: 1,
      source: 'mobile_explore',
      context,
    }, getToken);
    router.push(`/opportunities/${opportunityId}`);
  };

  const handleShareOpportunity = useCallback((opportunity: Opportunity) => {
    void recordOpportunitySignal({
      opportunityId: opportunity.id,
      signalType: 'share',
      signalValue: 2,
      source: 'mobile_explore',
      context: 'explore_card_share',
    }, getToken);
    void shareOpportunity(opportunity);
  }, [getToken]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setShuffleSeed(Date.now());
    setRefreshing(false);
  };

  const handleMenuAction = useCallback(async (action: 'search' | 'settings' | 'refresh') => {
    setShowMenu(false);
    if (action === 'search') {
      setShowSearch((current) => !current);
      return;
    }
    if (action === 'settings') {
      router.push('/profile/settings');
      return;
    }
    setRefreshing(true);
    await refresh();
    setShuffleSeed(Date.now());
    setRefreshing(false);
  }, [refresh, router]);

  const handleDiscoveryPress = useCallback((categoryId: DiscoveryCategoryId) => {
    setShowMenu(false);
    router.push({ pathname: '/opportunities', params: { category: categoryId } });
  }, [router]);

  // Persist the current search/category as a server-side alert: the backend
  // matches every newly ingested opportunity against it and pushes new hits.
  const handleSaveSearch = useCallback(async () => {
    setShowMenu(false);
    const query = (debouncedSearch || searchTerm).trim();
    const category = selectedDiscoveryCategory || undefined;
    if (!query && !category) {
      Alert.alert(
        t('list.saveSearch.nothingToSaveTitle'),
        t('list.saveSearch.nothingToSaveMsg'),
      );
      return;
    }
    const name = [
      query ? `“${query}”` : null,
      category ? category.charAt(0).toUpperCase() + category.slice(1) : null,
    ]
      .filter(Boolean)
      .join(' · ');

    const created = await createSavedSearch(
      { name, query: query || undefined, category, notifyEnabled: true },
      getToken,
    );
    if (created) {
      Alert.alert(
        t('list.saveSearch.savedTitle'),
        t('list.saveSearch.savedMsg', { name }),
        [
          { text: t('list.saveSearch.manageAlerts'), onPress: () => router.push('/saved-searches' as never) },
          { text: t('common:actions.done'), style: 'cancel' },
        ],
      );
    } else {
      Alert.alert(t('list.saveSearch.failedTitle'), t('list.saveSearch.failedMsg'));
    }
  }, [debouncedSearch, searchTerm, selectedDiscoveryCategory, getToken, router, t]);

  const handleFeaturePress = useCallback((route: string) => {
    setShowMenu(false);
    if (route.startsWith('http')) {
      void Linking.openURL(route);
      return;
    }
    router.push(route as never);
  }, [router]);

  const handleBroadAdPress = useCallback(() => {
    router.push('/cv');
  }, [router]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      {isCategoryPage ? (
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.collapsedCategoryHeader,
            {
              backgroundColor: selectedDiscoveryCard?.colors[0] ?? colors.background,
              borderBottomColor: 'rgba(255,255,255,0.16)',
              opacity: categoryHeaderOpacity,
              transform: [{ translateY: categoryHeaderTranslate }],
            },
          ]}
        >
          <Pressable onPress={() => router.back()} style={styles.collapsedHeaderButton}>
            <ArrowLeft size={20} color="#FFFFFF" strokeWidth={2.5} />
          </Pressable>
          <Text style={styles.collapsedCategoryTitle} numberOfLines={1}>
            {pageTitle}
          </Text>
          <Pressable onPress={() => setShowMenu((current) => !current)} style={styles.collapsedHeaderButton}>
            <Menu size={20} color="#FFFFFF" />
          </Pressable>
        </Animated.View>
      ) : (
        <ScreenHeader
          title={showForYouOnly ? t('list.forYou') : pageTitle}
          showBack
          subtitle={showForYouOnly ? t('list.forYouSubtitle') : pageSubtitle}
          right={
            <Pressable onPress={() => setShowMenu((current) => !current)} style={[styles.headerMenuButton, { backgroundColor: colors.card }]}>
              <Menu size={20} color={colors.foreground} />
            </Pressable>
          }
        />
      )}

      {showMenu && (
        <View style={[styles.menuSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Pressable style={styles.menuItem} onPress={() => handleMenuAction('search')}>
            <Search size={16} color={colors.foreground} />
            <Text style={[styles.menuItemText, { color: colors.foreground }]}>{showSearch ? t('list.hideSearch') : t('common:actions.search')}</Text>
          </Pressable>
          <Pressable style={styles.menuItem} onPress={() => handleMenuAction('settings')}>
            <Settings size={16} color={colors.foreground} />
            <Text style={[styles.menuItemText, { color: colors.foreground }]}>{t('list.settings')}</Text>
          </Pressable>
          <Pressable style={styles.menuItem} onPress={() => handleMenuAction('refresh')}>
            <RefreshCw size={16} color={colors.foreground} />
            <Text style={[styles.menuItemText, { color: colors.foreground }]}>{t('list.refresh')}</Text>
          </Pressable>
          <Pressable style={styles.menuItem} onPress={() => void handleSaveSearch()}>
            <BookmarkPlus size={16} color={colors.accent} />
            <Text style={[styles.menuItemText, { color: colors.accent }]}>{t('list.saveSearch.menuSave')}</Text>
          </Pressable>
          <Pressable
            style={styles.menuItem}
            onPress={() => {
              setShowMenu(false);
              router.push('/saved-searches' as never);
            }}
          >
            <Bell size={16} color={colors.foreground} />
            <Text style={[styles.menuItemText, { color: colors.foreground }]}>{t('list.saveSearch.menuAlerts')}</Text>
          </Pressable>
        </View>
      )}

      <Animated.View style={[styles.headerSearchWrap, { height: searchHeight, opacity: searchOpacity, transform: [{ translateY: searchTranslate }] }]}>
        <View style={[styles.searchShell, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Search color={colors.textSecondary} size={18} />
          <TextInput
            ref={searchInputRef}
            value={searchTerm}
            onChangeText={setSearchTerm}
            placeholder={t('list.searchPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            style={[styles.searchInput, { color: colors.foreground }]}
            returnKeyType="search"
          />
          {searchTerm.trim().length > 1 && (
            <Pressable
              onPress={() => void handleSaveSearch()}
              style={styles.searchCloseButton}
              hitSlop={6}
            >
              <BookmarkPlus color={colors.accent} size={17} />
            </Pressable>
          )}
          <Pressable
            onPress={() => {
              setSearchTerm('');
              setShowSearch(false);
            }}
            style={styles.searchCloseButton}
          >
            <X color={colors.textSecondary} size={16} />
          </Pressable>
        </View>
      </Animated.View>

      <Animated.FlatList
        ref={listRef}
        data={shouldShowChooser ? [] : explore}
        keyExtractor={(item) => item.id}
        key={viewMode}
        numColumns={viewMode === 'grid' ? 2 : 1}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 36 }}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false },
        )}
        scrollEventThrottle={16}
        columnWrapperStyle={viewMode === 'grid' ? { gap: 12 } : undefined}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing || loading} onRefresh={handleRefresh} tintColor={colors.accent} colors={[colors.accent]} />
        }
        ListHeaderComponent={
          <View>
            {isCategoryPage && selectedDiscoveryCard ? (
              <View style={[styles.categoryHero, { backgroundColor: selectedDiscoveryCard.colors[0] }]}>
                <LinearGradient colors={selectedDiscoveryCard.colors as [string, string]} style={StyleSheet.absoluteFill} />
                <Animated.View style={[StyleSheet.absoluteFill, { opacity: categoryHeroOpacity }]}>
                  {selectedDiscoveryCard.image ? (
                    <Image
                      source={selectedDiscoveryCard.image}
                      style={styles.categoryHeroImage}
                      resizeMode="cover"
                      fadeDuration={0}
                    />
                  ) : null}
                  <LinearGradient colors={['rgba(2,6,23,0)', 'rgba(2,6,23,0.22)', colors.background]} style={StyleSheet.absoluteFill} />
                </Animated.View>
                <View style={styles.categoryHeroTopRow}>
                  <Pressable onPress={() => router.back()} style={styles.categoryHeroBack}>
                    <ArrowLeft size={22} color="#FFFFFF" strokeWidth={2.6} />
                  </Pressable>
                  <Pressable onPress={() => setShowMenu((current) => !current)} style={styles.categoryHeroBack}>
                    <Menu size={20} color="#FFFFFF" />
                  </Pressable>
                </View>
                <Animated.View style={[styles.categoryHeroCopy, { opacity: categoryHeroOpacity }]}>
                  <Text style={styles.categoryHeroEyebrow}>{t('list.explore')}</Text>
                  <Text style={styles.categoryHeroTitle}>{pageTitle}</Text>
                </Animated.View>
              </View>
            ) : null}

            {shouldShowChooser && (
              <>
                <View style={styles.broadIntro}>
                  <Text style={[styles.broadIntroTitle, { color: colors.foreground }]}>{t('list.whatLookingFor')}</Text>
                  <Text style={[styles.broadIntroBody, { color: colors.textSecondary }]}>
                    {t('list.pickCategory')}
                  </Text>
                </View>

                <View style={styles.discoveryGrid}>
                  {DISCOVERY_CARDS.map((card) => (
                    <DiscoveryCard
                      key={card.id}
                      item={card}
                      active={false}
                      onPress={() => handleDiscoveryPress(card.id)}
                    />
                  ))}
                </View>
              </>
            )}

            {/* For You Section */}
            {shouldShowChooser && (
              <>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionTitleRow}>
                    <View style={[styles.sectionBadge, { backgroundColor: `${colors.accent}18` }]}>
                      <Sparkles color={colors.accent} size={16} />
                    </View>
                    <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('list.forYou')}</Text>
                  </View>
                  <Pressable onPress={() => router.push({ pathname: '/opportunities', params: { view: 'foryou' } })}>
                    <Text style={[styles.viewMoreText, { color: colors.accent }]}>{t('common:actions.viewAll')}</Text>
                  </Pressable>
                </View>

                {!hasPersonalizationDetails ? (
                  // Profile incomplete → prompt the user to finish it so we can
                  // personalize. This is the ONLY case where For You has no cards.
                  <View style={[styles.completeProfileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={[styles.completeProfileIcon, { backgroundColor: `${colors.accent}18` }]}>
                      <Sparkles color={colors.accent} size={22} />
                    </View>
                    <Text style={[styles.completeProfileTitle, { color: colors.foreground }]}>
                      {t('list.completeProfile')}
                    </Text>
                    <Text style={[styles.completeProfileBody, { color: colors.textSecondary }]}>
                      {t('list.addProfileDetails')}
                    </Text>
                    <Pressable
                      onPress={() => router.push('/profile/edit')}
                      style={[styles.completeProfileBtn, { backgroundColor: colors.accent }]}
                    >
                      <Text style={styles.completeProfileBtnText}>{t('list.completeProfileCta')}</Text>
                      <ChevronRight size={16} color="#FFFFFF" />
                    </Pressable>
                  </View>
                ) : forYou.length > 0 ? (
                  <View style={styles.forYouGrid}>
                    {forYou.slice(0, 4).map((item) => (
                      <CompactCard
                        key={`for-you-${item.id}`}
                        item={item}
                        colors={colors}
                        onPress={() => openOpportunity(item.id, 'for_you_featured_open')}
                      />
                    ))}
                  </View>
                ) : (
                  // Profile complete but opportunities not loaded yet.
                  <View style={[styles.emptyRail, { backgroundColor: colors.card, borderColor: colors.border, width: '100%' }]}>
                    <Sparkles color={colors.accent} size={24} />
                    <Text style={[styles.emptyRailTitle, { color: colors.foreground }]}>
                      {t('list.buildingMatches')}
                    </Text>
                    <Text style={[styles.emptyRailBody, { color: colors.textSecondary }]}>
                      {t('list.rankingByProfile')}
                    </Text>
                  </View>
                )}

                <View style={styles.featureHubWrap}>
                  <View style={styles.sectionHeader}>
                    <View style={styles.sectionTitleRow}>
                      <View style={[styles.sectionBadge, { backgroundColor: `${colors.accent}18` }]}>
                        <LayoutGrid color={colors.accent} size={16} />
                      </View>
                      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('list.otherFeatures')}</Text>
                    </View>
                  </View>

                  <View style={styles.featureGrid}>
                    {OTHER_FEATURES.map((item) => (
                      <FeatureCard
                        key={item.id}
                        item={item}
                        colors={colors}
                        onPress={() => handleFeaturePress(item.route)}
                      />
                    ))}
                  </View>
                </View>

                <View style={styles.importedAdWrap}>
                  <AdBanner
                    config={BANNER_PRESETS.buildCV}
                    onPress={handleBroadAdPress}
                    showClose={false}
                  />
                </View>
              </>
            )}

            {/* Explore Header */}
            {(showForYouOnly || isCategoryPage) && (
              <>
                <View style={[styles.sectionHeader, styles.sectionHeaderLarge]}>
                  <View style={styles.sectionTitleRow}>
                    <View style={[styles.sectionBadge, { backgroundColor: `${colors.accent}18` }]}>
                      <Compass color={colors.accent} size={16} />
                    </View>
                    <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                      {showForYouOnly ? t('list.personalized') : pageTitle}
                    </Text>
                  </View>
                  <View style={[styles.viewModeWrapper, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Pressable
                      onPress={() => setViewMode('grid')}
                      style={[styles.viewModeBtn, viewMode === 'grid' && { backgroundColor: `${colors.accent}15`, borderRadius: 10 }]}
                    >
                      <Text style={[styles.viewModeText, { color: viewMode === 'grid' ? colors.accent : colors.textSecondary }]}>{t('list.viewMode.grid')}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setViewMode('list')}
                      style={[styles.viewModeBtn, viewMode === 'list' && { backgroundColor: `${colors.accent}15`, borderRadius: 10 }]}
                    >
                      <Text style={[styles.viewModeText, { color: viewMode === 'list' ? colors.accent : colors.textSecondary }]}>{t('list.viewMode.list')}</Text>
                    </Pressable>
                  </View>
                </View>

                <View style={styles.sortRow}>
                  <ArrowDownWideNarrow size={14} color={colors.textSecondary} />
                  {SORT_OPTIONS.map((option) => {
                    const active = sortMode === option.id;
                    return (
                      <Pressable
                        key={option.id}
                        onPress={() => setSortMode(option.id)}
                        style={[
                          styles.sortChip,
                          { borderColor: active ? colors.accent : colors.border, backgroundColor: active ? `${colors.accent}15` : colors.card },
                        ]}
                      >
                        <Text style={[styles.sortChipText, { color: active ? colors.accent : colors.textSecondary }]}>
                          {t(option.label)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}

            {error && !loading ? (
              <View
                accessibilityRole="alert"
                style={[styles.errorBox, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View style={[styles.errorIconWrap, { backgroundColor: `${colors.accent}18` }]}>
                  <AlertCircle size={26} color={colors.accent} />
                </View>
                <Text style={[styles.errorTitle, { color: colors.foreground }]}>{t('list.errorTitle')}</Text>
                <Text style={[styles.errorText, { color: colors.textSecondary }]}>{t('list.errorBody')}</Text>
                <Pressable
                  onPress={() => void handleRefresh()}
                  style={[styles.errorRetryBtn, { backgroundColor: colors.accent }]}
                  accessibilityRole="button"
                >
                  <RefreshCw size={15} color="#FFFFFF" />
                  <Text style={styles.errorRetryText}>{t('list.retry')}</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          viewMode === 'grid' ? (
            <DetailCard item={item} colors={colors} isDark={isDark} onShare={handleShareOpportunity} onPress={() => openOpportunity(item.id, showForYouOnly ? 'for_you_grid_open' : 'explore_grid_open')} />
          ) : (
            <ListRow item={item} colors={colors} onShare={handleShareOpportunity} onPress={() => openOpportunity(item.id, showForYouOnly ? 'for_you_list_open' : 'explore_list_open')} />
          )
        )}
        ItemSeparatorComponent={() => viewMode === 'list' ? <View style={{ height: 10 }} /> : null}
        ListEmptyComponent={
          shouldShowChooser ? null : loading ? (
            <View style={styles.skeletonGrid}>
              {Array.from({ length: 6 }).map((_, index) => (
                <SkeletonCard key={`skeleton-${index}`} colors={colors} />
              ))}
            </View>
          ) : error ? null : (
            <View style={styles.emptyState}>
              <View style={[styles.emptyStateIcon, { backgroundColor: `${colors.accent}18` }]}>
                <Inbox size={42} color={colors.accent} strokeWidth={1.8} />
              </View>
              <Text style={[styles.emptyStateTitle, { color: colors.foreground }]}>{t('list.emptyTitle')}</Text>
              <Text style={[styles.emptyStateBody, { color: colors.textSecondary }]}>
                {searchTerm ? t('list.emptyTrySearch') : t('list.emptyCheckBack')}
              </Text>
              <Pressable
                onPress={() => {
                  if (searchTerm) {
                    setSearchTerm('');
                  } else {
                    void handleRefresh();
                  }
                }}
                style={[styles.emptyStateBtn, { backgroundColor: colors.accent }]}
                accessibilityRole="button"
              >
                {searchTerm ? <X size={15} color="#FFFFFF" /> : <RefreshCw size={15} color="#FFFFFF" />}
                <Text style={styles.emptyStateBtnText}>
                  {searchTerm ? t('list.clearSearch') : t('list.refresh')}
                </Text>
              </Pressable>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerMenuButton: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  collapsedCategoryHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    minHeight: 118,
    paddingHorizontal: 20,
    paddingTop: 58,
    paddingBottom: 16,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  collapsedHeaderButton: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(2,6,23,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  collapsedCategoryTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  menuSheet: {
    position: 'absolute',
    top: 86,
    right: 16,
    zIndex: 20,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 6,
    minWidth: 150,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
  menuItemText: { fontSize: 13, fontWeight: '600' },
  headerSearchWrap: {
    overflow: 'hidden',
    paddingHorizontal: 20,
  },
  searchShell: { minHeight: 52, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 14 },
  searchCloseButton: { padding: 5, borderRadius: 10 },
  categoryHero: {
    height: 184,
    marginHorizontal: -20,
    marginBottom: 18,
    overflow: 'hidden',
  },
  categoryHeroImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  categoryHeroTopRow: {
    paddingHorizontal: 20,
    paddingTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 3,
  },
  categoryHeroBack: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(2,6,23,0.48)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  categoryHeroCopy: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 26,
    zIndex: 1,
  },
  categoryHeroEyebrow: {
    color: 'rgba(255,255,255,0.74)',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  categoryHeroTitle: {
    color: '#FFFFFF',
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '950',
    letterSpacing: -0.8,
  },
  broadIntro: {
    marginTop: 18,
    marginBottom: 12,
  },
  broadIntroTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '800',
  },
  broadIntroBody: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  discoveryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    // Keep each tile at its own height — without this the row can stretch its
    // children to fill the FlatList header, blowing the cards up full-screen.
    alignItems: 'flex-start',
    gap: 8,
    rowGap: 16,
    marginTop: 16,
    marginBottom: 20,
  },
  discoveryCard: {
    width: DISCOVERY_TILE_WIDTH,
    // Explicit height: AnimatedPressable fills its box with flex:1 wrappers,
    // so an auto-height tile collapses inside the wrap grid.
    height: 104,
  },
  discoveryCardInner: {
    flex: 1,
    alignItems: 'center',
  },
  discoveryCardActive: {
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  discoveryIconTile: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  discoveryTitle: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  viewModeWrapper: { flexDirection: 'row', borderRadius: 12, borderWidth: 1, padding: 3, gap: 4 },
  viewModeBtn: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 10 },
  viewModeText: { fontSize: 11, fontWeight: '700' },
  sortRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: -4, marginBottom: 14 },
  sortChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  sortChipText: { fontSize: 12, fontWeight: '700' },
  sectionHeader: { marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionHeaderLarge: { marginTop: 24 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  resultCount: { fontSize: 14, fontWeight: '500' },
  sectionBadge: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 18, fontWeight: '800' },
  viewMoreText: { fontSize: 13, fontWeight: '800' },
  forYouRail: { paddingBottom: 10, gap: 12, paddingRight: 4 },
  forYouGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  forYouGridCard: { width: CARD_WIDTH, height: 224, marginRight: 0 },
  importedAdWrap: {
    marginTop: 22,
    marginBottom: 26,
  },

  // Featured Card

  // Feature Hub
  featureHubWrap: {
    marginTop: 12,
    marginBottom: 4,
  },
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  featureCard: {
    width: (width - 50) / 2,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
  },
  featureCardGradient: {
    minHeight: 112,
    padding: 14,
    justifyContent: 'space-between',
  },
  featureCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  featureCardIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  featureCardBody: {
    gap: 4,
  },
  featureCardTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
  },
  featureCardDesc: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
  },

  // Detail Card (Grid)
  compactCard: { width: CARD_WIDTH, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  compactCardHeader: { height: 84, position: 'relative' },
  compactCategoryBadge: { position: 'absolute', bottom: 6, left: 6, maxWidth: '80%', backgroundColor: 'rgba(2,6,23,0.65)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 },
  compactCategoryText: { color: 'white', fontSize: 8.5, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  compactCardBody: { padding: 10, gap: 6 },
  compactCardTitle: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
  compactCardMeta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  compactMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 1 },
  compactMetaText: { fontSize: 10.5, fontWeight: '600' },
  detailCard: { width: CARD_WIDTH, borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 12 },
  detailCardHeader: { height: 110, position: 'relative' },
  detailCardImage: { width: '100%', height: '100%' },
  detailCardImageFallback: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  detailMatchBadge: { position: 'absolute', top: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8 },
  detailMatchText: { color: 'white', fontSize: 9, fontWeight: '800' },
  detailUrgentBadge: { position: 'absolute', top: 8, right: 8, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8 },
  detailUrgentText: { color: 'white', fontSize: 9, fontWeight: '800' },
  detailCardBody: { padding: 12 },
  detailCategoryBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, alignSelf: 'flex-start', marginBottom: 8 },
  detailCategoryText: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  detailCardTitle: { fontSize: 14, lineHeight: 20, fontWeight: '800', marginBottom: 4 },
  detailCardOrg: { fontSize: 11, marginBottom: 10 },
  detailMatchReason: { fontSize: 10, lineHeight: 13, fontWeight: '700', color: '#10B981', marginTop: -6, marginBottom: 10 },
  detailCardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  detailMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  detailMetaText: { fontSize: 10, fontWeight: '600' },
  detailCardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: 'rgba(128,128,128,0.1)', paddingTop: 10 },
  detailStipend: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  detailStipendText: { fontSize: 11, fontWeight: '700' },
  detailFree: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  detailFreeText: { fontSize: 11, fontWeight: '700' },
  detailFooterActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailShareBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  detailArrow: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },

  // List Row
  listRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 16, borderWidth: 1, marginBottom: 10, gap: 12 },
  listThumbWrap: { width: 56, height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  listThumb: { width: 56, height: 56, borderRadius: 14 },
  listContent: { flex: 1 },
  listCategoryBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start', marginBottom: 6 },
  listCategoryText: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  listTitle: { fontSize: 14, lineHeight: 20, fontWeight: '800', marginBottom: 2 },
  listOrg: { fontSize: 11, marginBottom: 8 },
  listMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  listMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  listMetaText: { fontSize: 10, fontWeight: '600' },
  listDeadlineBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  listDeadlineText: { fontSize: 10, fontWeight: '700' },
  listStipend: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  listStipendText: { fontSize: 10, fontWeight: '700', color: '#10B981' },
  listShareBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },

  // Empty States
  emptyRail: { width: 260, borderRadius: 18, borderWidth: 1, padding: 20, alignItems: 'center', gap: 8 },
  emptyRailTitle: { fontSize: 15, fontWeight: '800' },
  emptyRailBody: { fontSize: 13, lineHeight: 20, textAlign: 'center' },
  completeProfileCard: { width: '100%', borderRadius: 20, borderWidth: 1, padding: 22, alignItems: 'center', gap: 8 },
  completeProfileIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  completeProfileTitle: { fontSize: 16, fontWeight: '800', textAlign: 'center' },
  completeProfileBody: { fontSize: 13, lineHeight: 20, textAlign: 'center', maxWidth: 300 },
  completeProfileBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 999, marginTop: 8 },
  completeProfileBtnText: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
  errorBox: { borderRadius: 16, borderWidth: 1, padding: 20, alignItems: 'center', gap: 8 },
  errorIconWrap: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  errorTitle: { fontSize: 16, fontWeight: '800' },
  errorText: { fontSize: 13, lineHeight: 19, fontWeight: '500', textAlign: 'center', maxWidth: 280 },
  errorRetryBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, marginTop: 6 },
  errorRetryText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  skeletonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  skeletonCard: { width: CARD_WIDTH, borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  skeletonImage: { height: 96 },
  skeletonBody: { padding: 12, gap: 9 },
  skeletonLine: { height: 10, borderRadius: 5 },
  emptyState: { paddingVertical: 60, alignItems: 'center', gap: 12 },
  emptyStateIcon: { width: 92, height: 92, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyStateTitle: { fontSize: 17, fontWeight: '800' },
  emptyStateBody: { fontSize: 13, lineHeight: 20, textAlign: 'center', maxWidth: 280 },
  emptyStateBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, marginTop: 4 },
  emptyStateBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },

  // Profile Status Bar
  profileStatusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    gap: 8,
  },
  profileStatusText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
} as any);
