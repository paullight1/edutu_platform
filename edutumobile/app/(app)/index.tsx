import { View, Text, ScrollView, StyleSheet, Dimensions, Image, ImageBackground, RefreshControl, TouchableOpacity, FlatList, Modal, Pressable, NativeSyntheticEvent, NativeScrollEvent } from "react-native";
import React, { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import {
    Sparkles,
    ChevronRight,
    Target,
    FileText,
    Store,
    BookmarkPlus,
    Share2,
    MapPin,
    Pencil,
    Check,
    X,
} from "lucide-react-native";
import { useTheme } from "../../components/context/ThemeContext";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { supabase } from "../../lib/supabase";
import { useOpportunities } from "@edutu/core/src/hooks/useOpportunities";
import { Opportunity } from "@edutu/core/src/types/opportunity";
import { toSafeUUID } from "@edutu/core/src/utils/auth";
import { recordOpportunitySignal } from "@edutu/core/src/services/opportunitySignals";
import { shareOpportunity } from "../../lib/shareOpportunity";
import { getDeadlineBadge, urgencyColor } from "@edutu/core/src/utils/deadline";
import { AnimatedPressable } from "../../components/ui/AnimatedPressable";
import { ShimmerCard } from "../../components/ui/Shimmer";
import { syncAndUpdateOpportunityWidgetSnapshot } from "../../lib/opportunityWidgetSync";
import {
    DISCOVERY_CATEGORY_CATALOG,
    getDiscoveryCategory,
    type DiscoveryCategory,
    type DiscoveryCategoryId,
} from "../../lib/discoveryCategories";
import { useHomeCategories } from "../../lib/homeCategoriesStore";
import { useTranslation } from "react-i18next";

const { width } = Dimensions.get('window');
const CARD_GAP = 12;
const CARD_WIDTH = (width - 40 - CARD_GAP) / 2;
// Wide enough to fit a full content card, narrow enough that the next card
// peeks in — a visual cue that the row scrolls sideways.
const RAIL_CARD_WIDTH = Math.min(Math.round(width * 0.74), 300);

// ─── Quick Actions Grid Component ─────────────────────────────────────────────
// `title` holds an i18n key (home namespace); translated at render time.
const QUICK_ACTIONS = [
    { id: '2', title: 'home.quickActions.roadmaps', icon: Store, route: '/roadmaps', gradient: ['#F59E0B', '#EF4444'] as [string, string] },
    { id: '3', title: 'home.quickActions.goals', icon: Target, route: '/goals', gradient: ['#10B981', '#059669'] as [string, string] },
    { id: '4', title: 'home.quickActions.cvBuilder', icon: FileText, route: '/cv', gradient: ['#3B82F6', '#6366F1'] as [string, string] },
    { id: '5', title: 'home.quickActions.saved', icon: BookmarkPlus, route: '/saved', gradient: ['#EC4899', '#F43F5E'] as [string, string] },
];

function getUserLookupIds(userId: string): string[] {
    return Array.from(new Set([userId, toSafeUUID(userId)]));
}

function DiscoveryCardFace({ item, title }: { item: DiscoveryCategory; title: string }) {
    if (item.image) {
        return (
            <ImageBackground
                source={item.image}
                style={styles.discoveryImageBg}
                imageStyle={styles.discoveryImageRadius}
                resizeMode="cover"
            >
                <View style={styles.discoveryTint} />
                <Text style={styles.discoveryTitle} numberOfLines={1}>{title}</Text>
            </ImageBackground>
        );
    }
    return (
        <LinearGradient
            colors={item.colors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.discoveryImageBg}
        >
            <Text style={styles.discoveryTitle} numberOfLines={1}>{title}</Text>
        </LinearGradient>
    );
}

function DiscoveryCategoryGrid({ router, categories }: { router: any; categories: DiscoveryCategory[] }) {
    const { t } = useTranslation('home');
    return (
        <View style={styles.discoveryGrid}>
            {categories.map((item, index) => (
                <AnimatedPressable
                    key={item.id}
                    onPress={() => router.push({ pathname: '/opportunities', params: { category: item.id } })}
                    style={styles.discoveryCard}
                    entering={FadeInDown.delay(index * 70).duration(360).springify()}
                    hapticFeedback="medium"
                    scaleTo={0.96}
                >
                    <DiscoveryCardFace item={item} title={t(item.homeTitleKey, { defaultValue: item.fallbackTitle })} />
                </AnimatedPressable>
            ))}
        </View>
    );
}

// Full-catalog picker: tap cards to toggle which ones show on the homepage.
function HomeCategoriesEditor({
    visible,
    selected,
    onClose,
    onSave,
    isDark,
    textPrimary,
    textSecondary,
}: {
    visible: boolean;
    selected: DiscoveryCategoryId[];
    onClose: () => void;
    onSave: (slugs: DiscoveryCategoryId[]) => void;
    isDark: boolean;
    textPrimary: string;
    textSecondary: string;
}) {
    const { t } = useTranslation('home');
    const [draft, setDraft] = useState<DiscoveryCategoryId[]>(selected);

    useEffect(() => {
        if (visible) setDraft(selected);
    }, [visible, selected]);

    const toggle = (id: DiscoveryCategoryId) => {
        setDraft((prev) => {
            if (prev.includes(id)) {
                // Keep at least one card on the homepage.
                if (prev.length === 1) return prev;
                return prev.filter((slug) => slug !== id);
            }
            return [...prev, id];
        });
    };

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <Pressable style={styles.editorBackdrop} onPress={onClose}>
                <Pressable
                    style={[styles.editorSheet, { backgroundColor: isDark ? '#0F172A' : '#FFFFFF' }]}
                    onPress={() => { }}
                >
                    <View style={styles.editorHeader}>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.editorTitle, { color: textPrimary }]}>
                                {t('home.discoveryEditor.title', { defaultValue: 'Customize categories' })}
                            </Text>
                            <Text style={[styles.editorSubtitle, { color: textSecondary }]}>
                                {t('home.discoveryEditor.subtitle', { defaultValue: 'Choose which cards show on your homepage.' })}
                            </Text>
                        </View>
                        <TouchableOpacity onPress={onClose} hitSlop={8} style={styles.editorCloseBtn}>
                            <X size={20} color={textSecondary} />
                        </TouchableOpacity>
                    </View>
                    <View style={styles.discoveryGrid}>
                        {DISCOVERY_CATEGORY_CATALOG.map((item) => {
                            const active = draft.includes(item.id);
                            return (
                                <AnimatedPressable
                                    key={item.id}
                                    onPress={() => toggle(item.id)}
                                    style={[styles.discoveryCard, styles.editorCardSize, !active && styles.editorCardInactive]}
                                    hapticFeedback="light"
                                    scaleTo={0.96}
                                >
                                    <DiscoveryCardFace item={item} title={t(item.homeTitleKey, { defaultValue: item.fallbackTitle })} />
                                    {active && (
                                        <View style={styles.editorCheck}>
                                            <Check size={12} color="#FFFFFF" strokeWidth={3} />
                                        </View>
                                    )}
                                </AnimatedPressable>
                            );
                        })}
                    </View>
                    <TouchableOpacity
                        style={styles.editorSaveBtn}
                        onPress={() => {
                            onSave(draft);
                            onClose();
                        }}
                        activeOpacity={0.85}
                    >
                        <Text style={styles.editorSaveText}>
                            {t('home.discoveryEditor.save', { defaultValue: 'Save' })}
                        </Text>
                    </TouchableOpacity>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

function QuickActionsGrid({ router }: { router: any }) {
    const { t } = useTranslation('home');
    return (
        <View style={styles.quickActionsContainer}>
            {QUICK_ACTIONS.map((item, index) => (
                <AnimatedPressable
                    key={item.id}
                    onPress={() => router.push(item.route)}
                    style={styles.quickActionCard}
                    entering={FadeInUp.delay(100 + index * 80).duration(400).springify()}
                    hapticFeedback="medium"
                    scaleTo={0.92}
                >
                    <LinearGradient
                        colors={item.gradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.quickActionGradient}
                    >
                        <item.icon size={28} color="#FFFFFF" strokeWidth={1.5} />
                    </LinearGradient>
                    <Text style={styles.quickActionTitle}>{t(item.title)}</Text>
                </AnimatedPressable>
            ))}
        </View>
    );
}

// ─── Opportunity Card Component ─────────────────────────────────────────────
function OpportunityCard({ item, isDark, textPrimary, textSecondary, accent = '#6366F1', onPress, onBookmark, onShare, bookmarked = false, horizontal = false, index = 0 }: {
    item: Opportunity;
    isDark: boolean;
    textPrimary: string;
    textSecondary: string;
    accent?: string;
    onPress?: () => void;
    onBookmark?: () => void;
    onShare?: () => void;
    bookmarked?: boolean;
    horizontal?: boolean;
    index?: number;
}) {
    const { t } = useTranslation('home');
    // A dead image URL would otherwise render as a large blank block with the
    // category chip floating in it — fall back to the imageless layout instead.
    const [imageFailed, setImageFailed] = useState(false);
    const imageUri = imageFailed ? undefined : item.image ?? undefined;
    const hasImage = Boolean(imageUri);
    const deadlineBadge = useMemo(() => getDeadlineBadge(item.deadline), [item.deadline]);
    const deadlineText = deadlineBadge.shortLabel;
    const deadlineColor = deadlineBadge.level === 'none'
        ? (isDark ? '#94A3B8' : '#64748B')
        : urgencyColor(deadlineBadge.level);

    const topMatchReason = item.matchReasons?.[0];
    const matchPct = Math.round(item.match ?? 0);
    const showMatch = matchPct >= 40;
    const showMatchReason = Boolean(topMatchReason) && showMatch;

    // The org field often mirrors the title; only show the pill when it adds
    // something new, so the title isn't duplicated on the card.
    const orgLabel = (item.organization ?? "").trim();
    const titleLabel = (item.title ?? "").trim();
    const org = orgLabel.toLowerCase();
    const title = titleLabel.toLowerCase();
    const showOrg =
        orgLabel.length > 0 &&
        org !== title &&
        !title.startsWith(org) &&
        !org.startsWith(title);

    const category = (item.category ?? "").trim();
    const locationLabel = item.isRemote ? t('opportunityCard.remote') : (item.location ?? "").trim();
    // A match badge takes the top-left slot when we have a score; otherwise the
    // org pill fills it. The other value drops to a secondary line below the
    // title so no content is lost.
    const showOrgLine = showOrg && showMatch;

    return (
        <AnimatedPressable
            onPress={onPress}
            style={[styles.opportunityCard, horizontal && styles.oppRailCard, {
                backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "#FFFFFF",
            }]}
            entering={FadeInDown.delay(index * 60).duration(350).springify()}
        >
            {hasImage ? (
                <View>
                    <Image
                        source={{ uri: imageUri }}
                        style={[styles.oppCardImage, horizontal && styles.oppCardImageTall]}
                        resizeMode="cover"
                        onError={() => setImageFailed(true)}
                    />
                    {category ? (
                        <View style={styles.oppCategoryChip}>
                            <Text style={styles.oppCategoryChipText} numberOfLines={1}>{category}</Text>
                        </View>
                    ) : null}
                </View>
            ) : null}
            <View style={styles.oppCardContent}>
                <View style={styles.oppCardTop}>
                    {showMatch ? (
                        <View style={[styles.oppMatchBadge, { backgroundColor: isDark ? "rgba(99,102,241,0.18)" : "rgba(99,102,241,0.10)" }]}>
                            <Sparkles size={9} color={accent} />
                            <Text style={[styles.oppMatchBadgeText, { color: accent }]}>{t('opportunityCard.percentMatch', { percent: matchPct })}</Text>
                        </View>
                    ) : showOrg ? (
                        <View style={[styles.oppOrgBadge, { backgroundColor: isDark ? "rgba(99,102,241,0.15)" : "#F0F0FF" }]}>
                            <Text style={styles.oppOrgText} numberOfLines={1}>{orgLabel}</Text>
                        </View>
                    ) : (
                        <View style={{ flex: 1 }} />
                    )}
                    <View style={styles.oppCardActions}>
                        {onShare && (
                            <TouchableOpacity
                                onPress={(e) => {
                                    e.stopPropagation();
                                    onShare();
                                }}
                                hitSlop={6}
                                style={styles.bookmarkBtn}
                            >
                                <Share2 size={15} color={textSecondary} />
                            </TouchableOpacity>
                        )}
                        {onBookmark && (
                            <TouchableOpacity
                                onPress={(e) => {
                                    e.stopPropagation();
                                    onBookmark();
                                }}
                                hitSlop={6}
                                style={styles.bookmarkBtn}
                            >
                                <BookmarkPlus size={16} color={bookmarked ? '#6366F1' : textSecondary} fill={bookmarked ? '#6366F1' : 'transparent'} />
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
                <Text style={[styles.oppTitle, { color: textPrimary }]} numberOfLines={2}>{item.title}</Text>
                {showOrgLine ? (
                    <Text style={[styles.oppOrgLine, { color: textSecondary }]} numberOfLines={1}>{orgLabel}</Text>
                ) : null}
                {showMatchReason && (
                    <Text style={styles.oppMatchReason} numberOfLines={1}>{topMatchReason}</Text>
                )}
                {(locationLabel || (!hasImage && category)) ? (
                    <View style={styles.oppMetaRow}>
                        {locationLabel ? (
                            <View style={styles.oppLocationRow}>
                                <MapPin size={11} color={textSecondary} />
                                <Text style={[styles.oppLocationText, { color: textSecondary }]} numberOfLines={1}>{locationLabel}</Text>
                            </View>
                        ) : null}
                        {!hasImage && category ? (
                            <View style={[styles.oppCategoryPill, { backgroundColor: isDark ? "rgba(148,163,184,0.14)" : "#F1F5F9" }]}>
                                <Text style={[styles.oppCategoryPillText, { color: textSecondary }]} numberOfLines={1}>{category}</Text>
                            </View>
                        ) : null}
                    </View>
                ) : null}
                <View style={[styles.oppFooter, { borderTopColor: isDark ? "rgba(255,255,255,0.05)" : "#F1F5F9" }]}>
                    <View style={styles.deadlineRow}>
                        <View style={[styles.deadlineDot, { backgroundColor: deadlineColor }]} />
                        <Text style={[styles.oppDeadline, { color: deadlineColor }]}>
                            {deadlineText}
                        </Text>
                    </View>
                    <View style={styles.oppArrowBtn}>
                        <ChevronRight size={14} color="#FFFFFF" />
                    </View>
                </View>
            </View>
        </AnimatedPressable>
    );
}

// ─── Featured Netflix-style Carousel ─────────────────────────────────────────
// Two-column poster rail that pages two cards at a time and auto-advances
// like a streaming-app row.
const FEATURED_CARD_WIDTH = CARD_WIDTH;
const FEATURED_CARD_HEIGHT = 150;
const FEATURED_ITEM_SNAP = FEATURED_CARD_WIDTH + CARD_GAP;
const FEATURED_PAGE_SNAP = FEATURED_ITEM_SNAP * 2;
const FEATURED_AUTO_ADVANCE_MS = 4500;

function FeaturedPosterCard({ item, isDark, onPress, onBookmark, onShare, bookmarked = false, index = 0, hero = false }: {
    item: Opportunity;
    isDark: boolean;
    onPress?: () => void;
    onBookmark?: () => void;
    onShare?: () => void;
    bookmarked?: boolean;
    index?: number;
    /** Full-width cinematic spotlight, used when a single item is featured. */
    hero?: boolean;
}) {
    const { t } = useTranslation('home');
    const [imageFailed, setImageFailed] = useState(false);
    const imageUri = imageFailed ? undefined : item.image ?? undefined;
    const deadlineBadge = useMemo(() => getDeadlineBadge(item.deadline), [item.deadline]);
    const deadlineColor = deadlineBadge.level === 'none' ? '#CBD5E1' : urgencyColor(deadlineBadge.level);
    const matchPct = Math.round(item.match ?? 0);
    const category = (item.category ?? '').trim();
    const orgLabel = (item.organization ?? '').trim();
    const locationLabel = item.isRemote ? t('opportunityCard.remote') : (item.location ?? '').trim();
    const heroSub = [orgLabel, locationLabel].filter(Boolean).join(' · ');
    const overlay = (
        <>
            {/* Dark tint + scrim so white text stays readable over any poster */}
            <View style={styles.posterTint} />
            <LinearGradient
                colors={["rgba(2,6,23,0.2)", "transparent", "rgba(2,6,23,0.72)", "rgba(2,6,23,0.96)"]}
                locations={[0, 0.3, 0.66, 1]}
                style={StyleSheet.absoluteFill}
            />
            <View style={[styles.posterTopRow, hero && styles.posterTopRowHero]}>
                {category ? (
                    <View style={styles.posterCategoryChip}>
                        <Text style={styles.posterCategoryText} numberOfLines={1} maxFontSizeMultiplier={1.2}>{category.toUpperCase()}</Text>
                    </View>
                ) : <View />}
                <View style={styles.posterTopActions}>
                    {hero && onShare && (
                        <TouchableOpacity
                            onPress={(e) => { e.stopPropagation(); onShare(); }}
                            hitSlop={8}
                            style={styles.posterActionBtn}
                        >
                            <Share2 size={13} color="#FFFFFF" />
                        </TouchableOpacity>
                    )}
                    {onBookmark && (
                        <TouchableOpacity
                            onPress={(e) => { e.stopPropagation(); onBookmark(); }}
                            hitSlop={8}
                            style={styles.posterActionBtn}
                        >
                            <BookmarkPlus size={13} color={bookmarked ? '#A5B4FC' : '#FFFFFF'} fill={bookmarked ? '#A5B4FC' : 'transparent'} />
                        </TouchableOpacity>
                    )}
                </View>
            </View>
            <View style={[styles.posterBottom, hero && styles.posterBottomHero]}>
                {matchPct >= 40 && (
                    <View style={styles.posterMatchBadge}>
                        <Sparkles size={8} color="#C7D2FE" />
                        <Text style={styles.posterMatchText} maxFontSizeMultiplier={1.2}>{t('opportunityCard.percentMatch', { percent: matchPct })}</Text>
                    </View>
                )}
                <Text style={hero ? styles.posterTitleHero : styles.posterTitle} numberOfLines={2} maxFontSizeMultiplier={1.2}>{item.title}</Text>
                {hero && heroSub ? (
                    <Text style={styles.posterSubHero} numberOfLines={1} maxFontSizeMultiplier={1.2}>{heroSub}</Text>
                ) : null}
                <View style={styles.posterFooterRow}>
                    <View style={styles.deadlineRow}>
                        <View style={[styles.deadlineDot, { backgroundColor: deadlineColor }]} />
                        <Text style={[styles.posterDeadline, { color: deadlineColor }]} maxFontSizeMultiplier={1.2}>{deadlineBadge.shortLabel}</Text>
                    </View>
                    {!hero && onShare ? (
                        <TouchableOpacity
                            onPress={(e) => { e.stopPropagation(); onShare(); }}
                            hitSlop={8}
                            style={styles.posterActionBtn}
                        >
                            <Share2 size={13} color="#FFFFFF" />
                        </TouchableOpacity>
                    ) : null}
                </View>
            </View>
        </>
    );

    return (
        <AnimatedPressable
            onPress={onPress}
            style={[styles.posterCard, hero && styles.posterCardHero]}
            entering={FadeInDown.delay(index * 70).duration(360).springify()}
            hapticFeedback="light"
            scaleTo={0.97}
        >
            {imageUri ? (
                <ImageBackground
                    source={{ uri: imageUri }}
                    style={styles.posterFill}
                    imageStyle={hero ? styles.posterImageRadiusHero : styles.posterImageRadius}
                    resizeMode="cover"
                    onError={() => setImageFailed(true)}
                >
                    {overlay}
                </ImageBackground>
            ) : (
                <LinearGradient colors={isDark ? ["#1E1B4B", "#312E81", "#0F172A"] : ["#4338CA", "#6366F1", "#312E81"]} style={styles.posterFill}>
                    {overlay}
                </LinearGradient>
            )}
        </AnimatedPressable>
    );
}

// Shown when no opportunity is featured yet, so the section keeps its place
// instead of vanishing from the home screen.
function FeaturedEmptyState({ isDark, onPress }: { isDark: boolean; onPress?: () => void }) {
    const { t } = useTranslation('home');
    return (
        <AnimatedPressable
            onPress={onPress}
            style={[styles.featuredEmptyCard, {
                backgroundColor: isDark ? 'rgba(99,102,241,0.07)' : '#F5F5FF',
                borderColor: isDark ? 'rgba(99,102,241,0.35)' : 'rgba(99,102,241,0.3)',
            }]}
            entering={FadeInDown.duration(360).springify()}
            hapticFeedback="light"
            scaleTo={0.98}
        >
            <View style={[styles.posterFillerIcon, { backgroundColor: isDark ? 'rgba(99,102,241,0.18)' : 'rgba(99,102,241,0.12)' }]}>
                <Sparkles size={20} color="#6366F1" />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={[styles.featuredEmptyTitle, { color: isDark ? '#E2E8F0' : '#1E293B' }]} maxFontSizeMultiplier={1.3}>
                    {t('featured.emptyTitle', { defaultValue: 'Featured picks are on the way' })}
                </Text>
                <Text style={[styles.featuredEmptyDesc, { color: isDark ? '#94A3B8' : '#64748B' }]} numberOfLines={2} maxFontSizeMultiplier={1.3}>
                    {t('featured.emptyDescription', { defaultValue: 'Our team hand-picks standout opportunities. Until then, explore everything.' })}
                </Text>
            </View>
            <View style={[styles.featuredEmptyCta, { backgroundColor: isDark ? 'rgba(99,102,241,0.18)' : 'rgba(99,102,241,0.1)' }]}>
                <Text style={styles.featuredEmptyCtaText} maxFontSizeMultiplier={1.2}>
                    {t('featured.emptyCta', { defaultValue: 'Explore' })}
                </Text>
                <ChevronRight size={14} color={isDark ? '#A5B4FC' : '#4F46E5'} />
            </View>
        </AnimatedPressable>
    );
}

function FeaturedCarousel({ data, isDark, bookmarkedIds, onOpen, onBookmark, onShare }: {
    data: Opportunity[];
    isDark: boolean;
    bookmarkedIds: string[];
    onOpen: (item: Opportunity) => void;
    onBookmark: (id: string) => void;
    onShare: (item: Opportunity) => void;
}) {
    const listRef = useRef<FlatList<Opportunity>>(null);
    const pageRef = useRef(0);
    const [paused, setPaused] = useState(false);
    const [activePage, setActivePage] = useState(0);
    const pageCount = Math.ceil(data.length / 2);

    // Auto-advance a page (two cards) at a time; user swipes pause it and the
    // momentum-end handler re-syncs the page before resuming.
    useEffect(() => {
        if (paused || pageCount < 2) return;
        const timer = setInterval(() => {
            pageRef.current = (pageRef.current + 1) % pageCount;
            setActivePage(pageRef.current);
            listRef.current?.scrollToOffset({ offset: pageRef.current * FEATURED_PAGE_SNAP, animated: true });
        }, FEATURED_AUTO_ADVANCE_MS);
        return () => clearInterval(timer);
    }, [paused, pageCount]);

    const handleMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const page = Math.max(0, Math.min(pageCount - 1, Math.round(e.nativeEvent.contentOffset.x / FEATURED_PAGE_SNAP)));
        pageRef.current = page;
        setActivePage(page);
        setPaused(false);
    };

    // Single featured item: promote it to a full-width cinematic spotlight
    // instead of leaving a half-empty two-column row.
    if (data.length === 1) {
        const item = data[0];
        return (
            <FeaturedPosterCard
                item={item}
                isDark={isDark}
                index={0}
                hero
                bookmarked={bookmarkedIds.includes(item.id)}
                onPress={() => onOpen(item)}
                onBookmark={() => onBookmark(item.id)}
                onShare={() => onShare(item)}
            />
        );
    }

    return (
        <View>
            <FlatList
                ref={listRef}
                data={data}
                horizontal
                keyExtractor={(item) => item.id}
                showsHorizontalScrollIndicator={false}
                snapToInterval={FEATURED_PAGE_SNAP}
                snapToAlignment="start"
                decelerationRate="fast"
                contentContainerStyle={styles.posterRail}
                onScrollBeginDrag={() => setPaused(true)}
                onMomentumScrollEnd={handleMomentumEnd}
                getItemLayout={(_, index) => ({ length: FEATURED_ITEM_SNAP, offset: FEATURED_ITEM_SNAP * index, index })}
                renderItem={({ item, index }) => (
                    <FeaturedPosterCard
                        item={item}
                        isDark={isDark}
                        index={index}
                        bookmarked={bookmarkedIds.includes(item.id)}
                        onPress={() => onOpen(item)}
                        onBookmark={() => onBookmark(item.id)}
                        onShare={() => onShare(item)}
                    />
                )}
            />
            {pageCount > 1 && (
                <View style={styles.posterDotsRow}>
                    {Array.from({ length: pageCount }, (_, i) => (
                        <View
                            key={i}
                            style={[
                                styles.posterDot,
                                i === activePage
                                    ? styles.posterDotActive
                                    : { backgroundColor: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(15,23,42,0.18)' },
                            ]}
                        />
                    ))}
                </View>
            )}
        </View>
    );
}

// ─── Compact Recommended Row ─────────────────────────────────────────────────
// A slim horizontal card (thumbnail + content) used for the home "Recommended"
// preview so it stays small and multiple rows fit without a giant rail.
function RecommendedRow({ item, isDark, textPrimary, textSecondary, onPress, onBookmark, onShare, bookmarked = false, index = 0 }: {
    item: Opportunity;
    isDark: boolean;
    textPrimary: string;
    textSecondary: string;
    onPress?: () => void;
    onBookmark?: () => void;
    onShare?: () => void;
    bookmarked?: boolean;
    index?: number;
}) {
    const { t } = useTranslation('home');
    const deadlineBadge = useMemo(() => getDeadlineBadge(item.deadline), [item.deadline]);
    const deadlineColor = deadlineBadge.level === 'none'
        ? (isDark ? '#94A3B8' : '#64748B')
        : urgencyColor(deadlineBadge.level);
    const matchPct = Math.round(item.match ?? 0);
    const showMatch = matchPct >= 40;
    const category = (item.category ?? '').trim();
    const locationLabel = item.isRemote ? t('opportunityCard.remote') : (item.location ?? '').trim();

    return (
        <AnimatedPressable
            onPress={onPress}
            style={[styles.recRow, { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#FFFFFF' }]}
            entering={FadeInDown.delay(index * 60).duration(300).springify()}
            hapticFeedback="light"
            scaleTo={0.98}
        >
            {item.image ? (
                <Image source={{ uri: item.image }} style={styles.recThumb} resizeMode="cover" />
            ) : (
                <View style={[styles.recThumb, styles.recThumbFallback]}>
                    <Sparkles size={20} color="#6366F1" />
                </View>
            )}
            <View style={styles.recBody}>
                <View style={styles.recTopRow}>
                    {showMatch ? (
                        <View style={styles.recMatchBadge}>
                            <Sparkles size={9} color="#6366F1" />
                            <Text style={styles.recMatchText}>{t('opportunityCard.percentMatch', { percent: matchPct })}</Text>
                        </View>
                    ) : category ? (
                        <Text style={styles.recCategory} numberOfLines={1}>{category}</Text>
                    ) : (
                        <View style={{ flex: 1 }} />
                    )}
                    {onBookmark && (
                        <TouchableOpacity
                            onPress={(e) => { e.stopPropagation(); onBookmark(); }}
                            hitSlop={6}
                            style={styles.bookmarkBtn}
                        >
                            <BookmarkPlus size={15} color={bookmarked ? '#6366F1' : textSecondary} fill={bookmarked ? '#6366F1' : 'transparent'} />
                        </TouchableOpacity>
                    )}
                </View>
                <Text style={[styles.recTitle, { color: textPrimary }]} numberOfLines={2}>{item.title}</Text>
                <View style={styles.recMetaRow}>
                    {locationLabel ? (
                        <View style={styles.recMetaItem}>
                            <MapPin size={10} color={textSecondary} />
                            <Text style={[styles.recMetaText, { color: textSecondary }]} numberOfLines={1}>{locationLabel}</Text>
                        </View>
                    ) : null}
                    <View style={styles.recMetaItem}>
                        <View style={[styles.deadlineDot, { backgroundColor: deadlineColor }]} />
                        <Text style={[styles.recMetaText, { color: deadlineColor }]}>{deadlineBadge.shortLabel}</Text>
                    </View>
                </View>
            </View>
            <ChevronRight size={18} color={textSecondary} style={{ alignSelf: 'center' }} />
        </AnimatedPressable>
    );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
    const { t } = useTranslation('home');
    const { isDark, colors } = useTheme();
    const { user } = useUser();
    const { getToken } = useAuth();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const backgroundColor = colors.background;
    const textPrimary = colors.foreground;
    const textSecondary = isDark ? '#94A3B8' : '#64748B';

    const [bookmarkedIds, setBookmarkedIds] = useState<string[]>([]);
    const [categoryEditorVisible, setCategoryEditorVisible] = useState(false);
    const { selected: selectedHomeCategories, save: saveHomeCategories } = useHomeCategories(user?.id);
    const homeCategories = useMemo(
        () => selectedHomeCategories
            .map((slug) => getDiscoveryCategory(slug))
            .filter((item): item is DiscoveryCategory => Boolean(item)),
        [selectedHomeCategories],
    );

    useEffect(() => {
        const fetchBookmarks = async () => {
            if (!user) return;
            try {
                const lookupIds = getUserLookupIds(user.id);
                const { data: bookmarks } = await supabase
                    .from('bookmarks')
                    .select('opportunity_id')
                    .in('user_id', lookupIds);

                const uniqueBookmarkIds = Array.from(new Set(bookmarks?.map(b => b.opportunity_id) || []));
                setBookmarkedIds(uniqueBookmarkIds);
            } catch (err) {
                console.error("Bookmarks fetch failed", err);
            }
        };
        fetchBookmarks();
    }, [user]);

    const syncOpportunityWidget = useCallback(async (freshOpportunities: Opportunity[]) => {
        await syncAndUpdateOpportunityWidgetSnapshot({
            userId: user?.id,
            opportunities: freshOpportunities,
        });
    }, [user?.id]);

    // Fetch real opportunities from API (already filtered by backend/core logic)
    const { data: opportunities, loading: opportunitiesLoading, refresh } = useOpportunities({
        supabase,
        userId: user?.id,
        getAuthToken: getToken,
        onSyncSnapshot: syncOpportunityWidget,
    });

    // Featured: swipeable auto-scrolling rail, max 10
    const featuredOpportunities = useMemo(() => {
        return opportunities.filter(o => o.featured).slice(0, 10);
    }, [opportunities]);

    // Other Recommended: max 10
    const otherOpportunities = useMemo(() => {
        return opportunities.slice(0, 10);
    }, [opportunities]);

    const toggleBookmark = async (opportunityId: string) => {
        if (!user) return;
        try {
            const lookupIds = getUserLookupIds(user.id);
            const isBookmarked = bookmarkedIds.includes(opportunityId);

            if (isBookmarked) {
                await supabase
                    .from('bookmarks')
                    .delete()
                    .in('user_id', lookupIds)
                    .eq('opportunity_id', opportunityId);
                void recordOpportunitySignal({
                    opportunityId,
                    signalType: 'save',
                    signalValue: -1,
                    source: 'mobile_home',
                    context: 'home_card_unsave',
                }, getToken);
                setBookmarkedIds(prev => prev.filter(id => id !== opportunityId));
            } else {
                await supabase
                    .from('bookmarks')
                    .delete()
                    .in('user_id', lookupIds)
                    .eq('opportunity_id', opportunityId);

                await supabase
                    .from('bookmarks')
                    .insert({ user_id: user.id, opportunity_id: opportunityId });
                void recordOpportunitySignal({
                    opportunityId,
                    signalType: 'save',
                    signalValue: 3,
                    source: 'mobile_home',
                    context: 'home_card_save',
                }, getToken);
                setBookmarkedIds(prev => [...prev, opportunityId]);
            }
        } catch (error) {
            console.error('Error toggling bookmark:', error);
        }
    };

    const recordOpportunityOpen = useCallback((opportunityId: string) => {
        // A deliberate card tap is a 'click' (weight 5 in the ranking engine);
        // 'view' (weight 2) is reserved for the detail screen actually loading.
        void recordOpportunitySignal({
            opportunityId,
            signalType: 'click',
            signalValue: 1,
            source: 'mobile_home',
            context: 'home_card_open',
        }, getToken);
    }, [getToken]);

    const handleShareOpportunity = useCallback((opportunity: Opportunity) => {
        void recordOpportunitySignal({
            opportunityId: opportunity.id,
            signalType: 'share',
            signalValue: 2,
            source: 'mobile_home',
            context: 'home_card_share',
        }, getToken);
        void shareOpportunity(opportunity);
    }, [getToken]);

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor }} edges={['left', 'right']}>
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={opportunitiesLoading}
                        onRefresh={refresh}
                        tintColor="#6366F1"
                        colors={['#6366F1']}
                    />
                }
            >
                {/* Header Spacer - accounts for AppHeader height + safe area */}
                <View style={{ height: insets.top + 60 }} />

                <Animated.View entering={FadeInDown.duration(400).delay(50)}>
                    <View style={styles.sectionHeader}>
                        <Text style={[styles.sectionTitle, { color: textPrimary }]}>{t('home.exploreOpportunities')}</Text>
                        <TouchableOpacity
                            onPress={() => setCategoryEditorVisible(true)}
                            hitSlop={8}
                            style={[styles.editCategoriesBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)' }]}
                            accessibilityLabel={t('home.discoveryEditor.title', { defaultValue: 'Customize categories' })}
                        >
                            <Pencil size={14} color={textSecondary} />
                        </TouchableOpacity>
                    </View>
                    <DiscoveryCategoryGrid router={router} categories={homeCategories} />
                </Animated.View>

                <HomeCategoriesEditor
                    visible={categoryEditorVisible}
                    selected={selectedHomeCategories}
                    onClose={() => setCategoryEditorVisible(false)}
                    onSave={saveHomeCategories}
                    isDark={isDark}
                    textPrimary={textPrimary}
                    textSecondary={textSecondary}
                />

                {/* Featured Opportunities — Netflix-style auto-scrolling rail */}
                {(featuredOpportunities.length > 0 || !opportunitiesLoading) && (
                    <Animated.View entering={FadeInDown.duration(400).delay(50)} style={[styles.sectionSpacing, { marginBottom: 18 }]}>
                        <View style={styles.sectionHeader}>
                            <View style={[styles.sectionIcon, { backgroundColor: isDark ? 'rgba(99,102,241,0.15)' : '#F0F0FF' }]}>
                                <Sparkles size={16} color={colors.accent} />
                            </View>
                            <Text style={[styles.sectionTitle, { color: textPrimary }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                                {t('home.featuredOpportunities', { defaultValue: 'Featured Opportunities' })}
                            </Text>
                            <AnimatedPressable
                                onPress={() => router.push('/opportunities/featured')}
                                style={styles.viewMorePill}
                                hapticFeedback="light"
                                scaleTo={0.9}
                                accessibilityLabel={t('home.viewMore', { defaultValue: 'View More' })}
                            >
                                <ChevronRight size={18} color="#6366F1" />
                            </AnimatedPressable>
                        </View>
                        {featuredOpportunities.length > 0 ? (
                            <FeaturedCarousel
                                data={featuredOpportunities}
                                isDark={isDark}
                                bookmarkedIds={bookmarkedIds}
                                onOpen={(item) => {
                                    recordOpportunityOpen(item.id);
                                    router.push(`/opportunities/${item.id}`);
                                }}
                                onBookmark={toggleBookmark}
                                onShare={handleShareOpportunity}
                            />
                        ) : (
                            <FeaturedEmptyState isDark={isDark} onPress={() => router.push('/opportunities')} />
                        )}
                    </Animated.View>
                )}

                {/* Quick Actions Grid */}
                <Animated.View entering={FadeInDown.duration(400).delay(150)} style={{ marginTop: 4 }}>
                    <View style={styles.sectionHeader}>
                        <Text style={[styles.sectionTitle, { color: textPrimary }]}>{t('home.quickActionsTitle')}</Text>
                    </View>
                    <QuickActionsGrid router={router} />
                </Animated.View>

                {/* Recommended Opportunities — compact 3-row preview */}
                {otherOpportunities.length > 0 ? (
                    <Animated.View entering={FadeInDown.duration(400).delay(100)} style={styles.sectionSpacing}>
                        <View style={styles.sectionHeader}>
                            <View style={styles.sectionTitleGroup}>
                                <View style={[styles.sectionIcon, { backgroundColor: isDark ? 'rgba(99,102,241,0.15)' : '#F0F0FF' }]}>
                                    <Target size={16} color="#6366F1" />
                                </View>
                                <Text style={[styles.sectionTitle, { color: textPrimary }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                                    {t('home.recommendedOpportunities', { defaultValue: 'Recommended Opportunities' })}
                                </Text>
                            </View>
                            <AnimatedPressable
                                onPress={() => router.push('/opportunities')}
                                style={styles.viewMorePill}
                                hapticFeedback="light"
                                scaleTo={0.9}
                                accessibilityLabel={t('home.viewMore', { defaultValue: 'View More' })}
                            >
                                <ChevronRight size={18} color="#6366F1" />
                            </AnimatedPressable>
                        </View>
                        <View style={styles.oppGridContainer}>
                            {otherOpportunities.slice(0, 8).map((item, idx) => (
                                <View key={item.id} style={styles.oppGridItem}>
                                    <OpportunityCard
                                        item={item}
                                        isDark={isDark}
                                        textPrimary={textPrimary}
                                        textSecondary={textSecondary}
                                        index={idx}
                                        onPress={() => {
                                            recordOpportunityOpen(item.id);
                                            router.push(`/opportunities/${item.id}`);
                                        }}
                                        onBookmark={() => toggleBookmark(item.id)}
                                        onShare={() => handleShareOpportunity(item)}
                                        bookmarked={bookmarkedIds.includes(item.id)}
                                    />
                                </View>
                            ))}
                        </View>
                    </Animated.View>
                ) : opportunitiesLoading ? (
                    <View style={styles.sectionSpacing}>
                        <View style={styles.sectionHeader}>
                            <Text style={[styles.sectionTitle, { color: textPrimary }]}>{t('home.recommendedOpportunities')}</Text>
                        </View>
                        <ShimmerCard isDark={isDark} />
                        <ShimmerCard isDark={isDark} style={{ marginTop: 12 }} />
                    </View>
                ) : (
                    <View style={styles.sectionSpacing}>
                        <View style={styles.sectionHeader}>
                            <Text style={[styles.sectionTitle, { color: textPrimary }]}>{t('home.recommendedOpportunities')}</Text>
                        </View>
                    </View>
                )}

                {/* Empty State for No Recommendations */}
                {otherOpportunities.length === 0 && !opportunitiesLoading && (
                    <Animated.View entering={FadeInUp.duration(400).delay(200)} style={[styles.emptyStateCard, { backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "#FFFFFF" }]}>
                        <View style={styles.emptyStateIcon}>
                            <Target size={32} color="#6366F1" />
                        </View>
                        <Text style={[styles.emptyStateTitle, { color: textPrimary }]}>
                            {t('home.emptyTitle')}
                        </Text>
                        <Text style={[styles.emptyStateDesc, { color: textSecondary }]}>
                            {t('home.emptyDescription')}
                        </Text>
                        {/* TouchableOpacity, not AnimatedPressable: the latter's inner
                            flex:1 Pressable stretches unbounded inside this auto-height
                            card, painting the CTA over the rest of the screen. */}
                        <TouchableOpacity
                            style={styles.emptyStateBtn}
                            onPress={() => router.push('/opportunities')}
                            activeOpacity={0.85}
                            accessibilityRole="button"
                        >
                            <Text style={styles.emptyStateBtnText}>{t('home.emptyCta')}</Text>
                            <ChevronRight size={16} color="#FFFFFF" />
                        </TouchableOpacity>
                    </Animated.View>
                )}

                <View style={{ height: 100 }} />
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 20,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 12,
        fontSize: 16,
    },
    sectionLabel: {
        fontSize: 10,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    filterChip: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        marginRight: 8,
        borderWidth: 1,
    },
    filterChipText: {
        fontSize: 13,
        fontWeight: '600',
    },
    greetingBlock: {
        marginTop: 24,
        marginBottom: 32,
    },
    profileStatusBar: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 16,
        gap: 8,
    },
    profileStatusBarText: {
        flex: 1,
    },
    profileStatusText: {
        flex: 1,
        fontSize: 12,
        fontWeight: '600',
    },
    profileBannerWrapper: {
        marginBottom: 18,
    },
    statusBarCloseBtn: {
        padding: 4,
    },
    sectionSpacing: {
        marginTop: 22,
    },
    discoveryGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: CARD_GAP,
        marginBottom: 16,
    },
    discoveryCard: {
        width: CARD_WIDTH,
        height: 72,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: '#0F172A',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.14)',
    },
    discoveryImageBg: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 10,
    },
    discoveryImageRadius: {
        borderRadius: 16,
    },
    discoveryTint: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(2,6,23,0.30)',
    },
    discoveryTitle: {
        color: '#FFFFFF',
        fontSize: 16,
        lineHeight: 20,
        fontWeight: '800',
        letterSpacing: 0.3,
        textAlign: 'center',
        textShadowColor: 'rgba(0,0,0,0.7)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 5,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 10,
        width: '100%',
    },
    editCategoriesBtn: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    editorBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(2,6,23,0.6)',
        justifyContent: 'center',
        paddingHorizontal: 20,
    },
    editorSheet: {
        borderRadius: 24,
        padding: 20,
    },
    editorHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        marginBottom: 16,
    },
    editorTitle: {
        fontSize: 18,
        fontWeight: '800',
    },
    editorSubtitle: {
        fontSize: 13,
        marginTop: 3,
    },
    editorCloseBtn: {
        padding: 4,
    },
    editorCardInactive: {
        opacity: 0.42,
    },
    // Sheet sits inside 20px backdrop padding + 20px sheet padding per side.
    editorCardSize: {
        width: (width - 80 - CARD_GAP) / 2,
    },
    editorCheck: {
        position: 'absolute',
        top: 6,
        right: 6,
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: 'rgba(16,185,129,0.95)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    editorSaveBtn: {
        marginTop: 6,
        backgroundColor: '#6366F1',
        borderRadius: 14,
        paddingVertical: 13,
        alignItems: 'center',
    },
    editorSaveText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '700',
    },
    sectionTitleGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flex: 1,
        minWidth: 0,
    },
    sectionIcon: {
        width: 28,
        height: 28,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sectionTitle: {
        flex: 1,
        fontSize: 15,
        fontWeight: '600',
        minWidth: 0,
    },
    // ─── Banner Styles ─────────────────────────────────────────────────────
    bannerContainer: {
        height: 160,
    },
    bannerCard: {
        width: width - 40,
        height: 140,
        borderRadius: 20,
        overflow: 'hidden',
        marginRight: 12,
    },
    bannerGradient: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 24,
    },
    bannerContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    bannerIconContainer: {
        width: 56,
        height: 56,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
    },
    bannerTextContainer: {
        justifyContent: 'center',
    },
    bannerTitle: {
        color: '#FFFFFF',
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    bannerSubtitle: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 14,
        fontWeight: '500',
    },
    bannerArrow: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.15)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    bannerPagination: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 12,
        gap: 6,
    },
    paginationDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: 'rgba(99,102,241,0.3)',
    },
    paginationDotActive: {
        backgroundColor: '#6366F1',
        width: 20,
    },
    // ─── Quick Actions Grid Styles ──────────────────────────────────────────
    quickActionsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        gap: 12,
        marginTop: 8,
    },
    quickActionCard: {
        width: (width - 40 - 48) / 5,
        alignItems: 'center',
    },
    quickActionGradient: {
        width: 64,
        height: 64,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
    quickActionTitle: {
        fontSize: 12,
        fontWeight: '600',
        color: '#64748B',
        textAlign: 'center',
    },
    // ─── Opportunity Card Styles ───────────────────────────────────────────
    opportunityCard: {
        borderRadius: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: 'rgba(99,102,241,0.1)',
        overflow: 'hidden',
    },
    oppRailCard: {
        width: RAIL_CARD_WIDTH,
        marginBottom: 0,
    },
    oppCardImage: {
        width: '100%',
        height: 92,
    },
    oppCardImageTall: {
        height: 120,
    },
    oppCategoryChip: {
        position: 'absolute',
        top: 8,
        left: 8,
        maxWidth: '72%',
        paddingHorizontal: 9,
        paddingVertical: 3,
        borderRadius: 8,
        backgroundColor: 'rgba(15,23,42,0.72)',
    },
    oppCategoryChipText: {
        fontSize: 9,
        fontWeight: '700',
        color: '#FFFFFF',
        textTransform: 'uppercase',
        letterSpacing: 0.3,
    },
    oppMatchBadge: {
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: 7,
    },
    oppMatchBadgeText: {
        fontSize: 10,
        fontWeight: '700',
    },
    oppOrgLine: {
        fontSize: 10,
        fontWeight: '600',
        marginTop: -4,
        marginBottom: 6,
    },
    oppMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 8,
    },
    oppLocationRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        flexShrink: 1,
    },
    oppLocationText: {
        fontSize: 10,
        fontWeight: '600',
    },
    oppCategoryPill: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
    },
    oppCategoryPillText: {
        fontSize: 9,
        fontWeight: '600',
    },
    oppRail: {
        marginHorizontal: -20,
    },
    oppRailContainer: {
        paddingHorizontal: 20,
        paddingTop: 2,
        paddingBottom: 4,
        gap: CARD_GAP,
    },
    oppCardContent: {
        padding: 11,
    },
    oppCardTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 7,
    },
    oppCardActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
    },
    bookmarkBtn: {
        padding: 4,
    },
    oppOrgBadge: {
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 8,
        marginBottom: 7,
    },
    oppOrgText: {
        fontSize: 9,
        fontWeight: '600',
        color: '#6366F1',
    },
    oppTitle: {
        fontSize: 12,
        lineHeight: 16,
        fontWeight: '600',
        marginBottom: 8,
    },
    oppMatchReason: {
        fontSize: 10,
        lineHeight: 13,
        fontWeight: '600',
        color: '#10B981',
        marginTop: -4,
        marginBottom: 8,
    },
    oppFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 8,
        borderTopWidth: 1,
    },
    deadlineRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    deadlineDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    oppDeadline: {
        fontSize: 10,
        fontWeight: '500',
    },
    oppArrowBtn: {
        backgroundColor: '#6366F1',
        width: 26,
        height: 26,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
    },
    oppListContainer: {
        gap: 12,
    },
    oppGridContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        gap: 10,
    },
    oppGridItem: {
        width: CARD_WIDTH,
    },
    // ─── Featured poster rail ──────────────────────────────────────────────
    posterRail: {
        paddingRight: 20,
    },
    posterCard: {
        width: FEATURED_CARD_WIDTH,
        height: FEATURED_CARD_HEIGHT,
        borderRadius: 16,
        overflow: 'hidden',
        marginRight: CARD_GAP,
        backgroundColor: '#0F172A',
    },
    posterFill: {
        flex: 1,
        justifyContent: 'space-between',
    },
    posterImageRadius: {
        borderRadius: 16,
    },
    posterTint: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(2,6,23,0.35)',
    },
    posterTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 8,
    },
    posterCategoryChip: {
        backgroundColor: 'rgba(2,6,23,0.6)',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
        maxWidth: FEATURED_CARD_WIDTH * 0.68,
    },
    posterCategoryText: {
        color: '#E2E8F0',
        fontSize: 8,
        fontWeight: '800',
        letterSpacing: 0.6,
    },
    posterActionBtn: {
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: 'rgba(2,6,23,0.6)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    posterBottom: {
        padding: 8,
        paddingTop: 0,
    },
    posterMatchBadge: {
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        backgroundColor: 'rgba(99,102,241,0.5)',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
        marginBottom: 4,
    },
    posterMatchText: {
        color: '#E0E7FF',
        fontSize: 9,
        fontWeight: '700',
    },
    posterTitle: {
        color: '#FFFFFF',
        fontSize: 12,
        lineHeight: 16,
        fontWeight: '700',
        marginBottom: 6,
    },
    posterFooterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    posterDeadline: {
        fontSize: 10,
        fontWeight: '600',
    },
    // Hero spotlight variant (single featured item)
    posterCardHero: {
        width: '100%',
        height: 200,
        borderRadius: 20,
        marginRight: 0,
    },
    posterImageRadiusHero: {
        borderRadius: 20,
    },
    posterTopRowHero: {
        padding: 14,
    },
    posterTopActions: {
        flexDirection: 'row',
        gap: 6,
    },
    posterBottomHero: {
        padding: 14,
        paddingTop: 0,
    },
    posterTitleHero: {
        color: '#FFFFFF',
        fontSize: 17,
        lineHeight: 22,
        fontWeight: '800',
        marginBottom: 10,
    },
    posterSubHero: {
        color: '#CBD5E1',
        fontSize: 12,
        fontWeight: '500',
        marginTop: -7,
        marginBottom: 10,
    },
    posterFillerIcon: {
        width: 38,
        height: 38,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
    },
    featuredEmptyCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderWidth: 1,
        borderRadius: 16,
        padding: 14,
    },
    featuredEmptyTitle: {
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 3,
    },
    featuredEmptyDesc: {
        fontSize: 12,
        lineHeight: 16,
    },
    featuredEmptyCta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        paddingLeft: 12,
        paddingRight: 8,
        minHeight: 32,
        borderRadius: 999,
    },
    featuredEmptyCtaText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#818CF8',
    },
    posterDotsRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 5,
        marginTop: 10,
    },
    posterDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    posterDotActive: {
        backgroundColor: '#6366F1',
        width: 16,
    },
    viewMoreBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 'auto',
        flexShrink: 0,
        gap: 3,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: 'rgba(99,102,241,0.12)',
    },
    viewMorePill: {
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 'auto',
        flexShrink: 0,
        height: 34,
        width: 34,
        borderRadius: 999,
        backgroundColor: 'rgba(99,102,241,0.12)',
    },
    viewMoreText: {
        color: '#6366F1',
        fontSize: 12,
        fontWeight: '700',
        lineHeight: 15,
        flexShrink: 0,
        includeFontPadding: false,
    },
    // Compact recommended row
    recRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 10,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(99,102,241,0.1)',
        marginBottom: 10,
    },
    recThumb: {
        width: 72,
        height: 72,
        borderRadius: 10,
    },
    recThumbFallback: {
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(99,102,241,0.1)',
    },
    recBody: {
        flex: 1,
        gap: 4,
    },
    recTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    recMatchBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        backgroundColor: 'rgba(99,102,241,0.12)',
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 6,
    },
    recMatchText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#6366F1',
    },
    recCategory: {
        flex: 1,
        fontSize: 10,
        fontWeight: '700',
        color: '#6366F1',
        textTransform: 'uppercase',
        letterSpacing: 0.3,
    },
    recTitle: {
        fontSize: 14,
        fontWeight: '700',
        lineHeight: 19,
    },
    recMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
    },
    recMetaItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    recMetaText: {
        fontSize: 11,
        fontWeight: '600',
    },
    // Empty State Styles
    emptyStateCard: {
        borderRadius: 20,
        padding: 24,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(99,102,241,0.1)',
        marginTop: 16,
    },
    emptyStateIcon: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: 'rgba(99,102,241,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    emptyStateTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    emptyStateDesc: {
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 20,
    },
    emptyStateBtn: {
        backgroundColor: '#6366F1',
        paddingHorizontal: 22,
        minHeight: 44,
        borderRadius: 12,
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
    },
    emptyStateBtnText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: 'bold',
    },
    // Notification Styles
    notificationList: {
        gap: 12,
        marginTop: 16,
    },
    notificationCard: {
        borderRadius: 20,
        padding: 16,
        borderWidth: 1,
        borderColor: 'rgba(99,102,241,0.2)',
    },
    matchBadge: {
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#6366F1',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
        gap: 4,
        marginBottom: 8,
    },
    matchBadgeText: {
        color: '#FFFFFF',
        fontSize: 10,
        fontWeight: 'bold',
    },
    notificationTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    notificationDesc: {
        fontSize: 13,
        lineHeight: 18,
    },
});
