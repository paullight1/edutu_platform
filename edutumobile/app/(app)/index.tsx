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
    X,
    Plus,
    Minus,
    Maximize2,
} from "lucide-react-native";
import { useTheme } from "../../components/context/ThemeContext";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
    FadeInDown,
    FadeInUp,
    LinearTransition,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    useReducedMotion,
    withRepeat,
    withSpring,
    withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
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
    type DiscoveryTileSize,
    type HomeCategoryTile,
} from "../../lib/discoveryCategories";
import { DISCOVERY_TILE_GLYPHS, DISCOVERY_TILE_GRADIENTS } from "../../lib/discoveryTileGlyphs";
import { useHomeCategories } from "../../lib/homeCategoriesStore";
import { useTranslation } from "react-i18next";

const { width } = Dimensions.get('window');
const CARD_GAP = 12;
const CARD_WIDTH = (width - 40 - CARD_GAP) / 2;
// Wide enough to fit a full content card, narrow enough that the next card
// peeks in — a visual cue that the row scrolls sideways.
const RAIL_CARD_WIDTH = Math.min(Math.round(width * 0.74), 300);

// ─── Home discovery tiles (widget-style sizes) ──────────────────────────────
const HOME_GRID_WIDTH = width - 40;
const ICON_TILE_WIDTH = (HOME_GRID_WIDTH - 3 * CARD_GAP) / 4;
// Editor grid sits inside 20px backdrop padding + 20px sheet padding per side.
const EDITOR_GRID_WIDTH = width - 80;
const EDITOR_GAP = 10;
const EDITOR_TILE_WIDTH: Record<DiscoveryTileSize, number> = {
    icon: (EDITOR_GRID_WIDTH - 3 * EDITOR_GAP) / 4,
    card: (EDITOR_GRID_WIDTH - EDITOR_GAP) / 2,
    long: EDITOR_GRID_WIDTH,
};
const EDITOR_FACE_HEIGHT: Record<DiscoveryTileSize, number> = {
    icon: (EDITOR_GRID_WIDTH - 3 * EDITOR_GAP) / 4,
    card: 64,
    long: 56,
};
const NEXT_TILE_SIZE: Record<DiscoveryTileSize, DiscoveryTileSize> = {
    icon: 'card',
    card: 'long',
    long: 'icon',
};

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

// Size-aware tile face: icon = gradient square with a glyph, card = the
// classic half-width card, long = full-width banner with glyph + chevron.
function DiscoveryTileFace({ item, size, title }: { item: DiscoveryCategory; size: DiscoveryTileSize; title: string }) {
    const Glyph = DISCOVERY_TILE_GLYPHS[item.id];

    if (size === 'icon') {
        return (
            <LinearGradient
                colors={DISCOVERY_TILE_GRADIENTS[item.id]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.iconTileSquare}
            >
                <Glyph size={26} color="#FFFFFF" strokeWidth={1.7} />
            </LinearGradient>
        );
    }

    if (size === 'long') {
        const row = (
            <View style={styles.longTileRow}>
                <View style={styles.longTileGlyph}>
                    <Glyph size={18} color="#FFFFFF" strokeWidth={1.9} />
                </View>
                <Text style={styles.longTileTitle} numberOfLines={1}>{title}</Text>
                <ChevronRight size={18} color="rgba(255,255,255,0.85)" />
            </View>
        );
        if (item.image) {
            return (
                <ImageBackground
                    source={item.image}
                    style={styles.longTileBg}
                    imageStyle={styles.discoveryImageRadius}
                    resizeMode="cover"
                >
                    <View style={styles.discoveryTint} />
                    {row}
                </ImageBackground>
            );
        }
        return (
            <LinearGradient
                colors={item.colors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.longTileBg}
            >
                {row}
            </LinearGradient>
        );
    }

    return <DiscoveryCardFace item={item} title={title} />;
}

type HomeTileEntry = { tile: HomeCategoryTile; category: DiscoveryCategory };

function DiscoveryTileGrid({ router, entries, textPrimary }: { router: any; entries: HomeTileEntry[]; textPrimary: string }) {
    const { t } = useTranslation('home');
    return (
        <View style={styles.discoveryGrid}>
            {entries.map(({ tile, category }, index) => {
                const title = t(category.homeTitleKey, { defaultValue: category.fallbackTitle });
                const onPress = () => router.push({ pathname: '/opportunities', params: { category: category.id } });
                if (tile.size === 'icon') {
                    return (
                        <AnimatedPressable
                            key={category.id}
                            onPress={onPress}
                            style={styles.iconTileWrap}
                            entering={FadeInDown.delay(index * 60).duration(360).springify()}
                            hapticFeedback="medium"
                            scaleTo={0.94}
                        >
                            <View style={styles.iconTileBox}>
                                <DiscoveryTileFace item={category} size="icon" title={title} />
                            </View>
                            <Text style={[styles.iconTileLabel, { color: textPrimary }]} numberOfLines={1}>{title}</Text>
                        </AnimatedPressable>
                    );
                }
                return (
                    <AnimatedPressable
                        key={category.id}
                        onPress={onPress}
                        style={tile.size === 'long' ? styles.longTileCard : styles.discoveryCard}
                        entering={FadeInDown.delay(index * 60).duration(360).springify()}
                        hapticFeedback="medium"
                        scaleTo={0.96}
                    >
                        <DiscoveryTileFace item={category} size={tile.size} title={title} />
                    </AnimatedPressable>
                );
            })}
        </View>
    );
}

// ─── Widget-style homepage editor ───────────────────────────────────────────
type EditorTileLayout = { x: number; y: number; width: number; height: number };

// One draggable/resizable tile in the editor's WYSIWYG grid. Long-press then
// drag to rearrange; the − badge removes it, the ⤢ badge cycles icon→card→long.
function EditorTile({
    tile,
    category,
    title,
    labelColor,
    canRemove,
    onLayoutTile,
    onDragStart,
    onDrop,
    onCycleSize,
    onRemove,
}: {
    tile: HomeCategoryTile;
    category: DiscoveryCategory;
    title: string;
    labelColor: string;
    canRemove: boolean;
    onLayoutTile: (id: DiscoveryCategoryId, layout: EditorTileLayout) => void;
    onDragStart: (id: DiscoveryCategoryId) => void;
    onDrop: (id: DiscoveryCategoryId, dx: number, dy: number) => void;
    onCycleSize: (id: DiscoveryCategoryId) => void;
    onRemove: (id: DiscoveryCategoryId) => void;
}) {
    const { t } = useTranslation('home');
    const tx = useSharedValue(0);
    const ty = useSharedValue(0);
    const scale = useSharedValue(1);
    const lift = useSharedValue(0);

    const pan = Gesture.Pan()
        .activateAfterLongPress(220)
        .onStart(() => {
            scale.value = withSpring(1.07, { damping: 14 });
            lift.value = 30;
            runOnJS(onDragStart)(tile.id);
        })
        .onUpdate((event) => {
            tx.value = event.translationX;
            ty.value = event.translationY;
        })
        .onEnd((event) => {
            runOnJS(onDrop)(tile.id, event.translationX, event.translationY);
        })
        .onFinalize(() => {
            scale.value = withSpring(1, { damping: 14 });
            lift.value = 0;
            tx.value = withSpring(0, { damping: 18, stiffness: 220 });
            ty.value = withSpring(0, { damping: 18, stiffness: 220 });
        });

    const dragStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
        zIndex: lift.value,
        elevation: lift.value,
    }));

    return (
        <GestureDetector gesture={pan}>
            <Animated.View
                layout={LinearTransition.springify().damping(20)}
                onLayout={(event) => onLayoutTile(tile.id, event.nativeEvent.layout)}
                style={[{ width: EDITOR_TILE_WIDTH[tile.size] }, dragStyle]}
            >
                <View style={[styles.editorFace, { height: EDITOR_FACE_HEIGHT[tile.size] }]}>
                    <View style={styles.editorFaceClip}>
                        <DiscoveryTileFace item={category} size={tile.size} title={title} />
                    </View>
                    {canRemove && (
                        <TouchableOpacity
                            onPress={() => onRemove(tile.id)}
                            hitSlop={8}
                            style={styles.editorRemoveBadge}
                            accessibilityLabel={t('home.discoveryEditor.remove', { defaultValue: 'Remove {{title}}', title })}
                        >
                            <Minus size={12} color="#FFFFFF" strokeWidth={3} />
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity
                        onPress={() => onCycleSize(tile.id)}
                        hitSlop={8}
                        style={styles.editorSizeBadge}
                        accessibilityLabel={t('home.discoveryEditor.resize', { defaultValue: 'Resize {{title}}', title })}
                    >
                        <Maximize2 size={11} color="#FFFFFF" strokeWidth={2.5} />
                    </TouchableOpacity>
                </View>
                {tile.size === 'icon' && (
                    <Text style={[styles.editorIconLabel, { color: labelColor }]} numberOfLines={1}>{title}</Text>
                )}
            </Animated.View>
        </GestureDetector>
    );
}

// Widget-style editor: tiles render at their real size; long-press drag to
// rearrange, ⤢ cycles the size, − removes, and the chips below add more.
function HomeCategoriesEditor({
    visible,
    tiles,
    onClose,
    onSave,
    isDark,
    textPrimary,
    textSecondary,
}: {
    visible: boolean;
    tiles: HomeCategoryTile[];
    onClose: () => void;
    onSave: (tiles: HomeCategoryTile[]) => void;
    isDark: boolean;
    textPrimary: string;
    textSecondary: string;
}) {
    const { t } = useTranslation('home');
    const [draft, setDraft] = useState<HomeCategoryTile[]>(tiles);
    const [draggingId, setDraggingId] = useState<DiscoveryCategoryId | null>(null);
    const layoutsRef = useRef(new Map<DiscoveryCategoryId, EditorTileLayout>());

    useEffect(() => {
        if (visible) {
            setDraft(tiles);
            layoutsRef.current.clear();
        }
    }, [visible, tiles]);

    const handleLayoutTile = useCallback((id: DiscoveryCategoryId, layout: EditorTileLayout) => {
        layoutsRef.current.set(id, layout);
    }, []);

    const handleDragStart = useCallback((id: DiscoveryCategoryId) => {
        setDraggingId(id);
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }, []);

    // Reorder on release: the dragged tile lands at whichever tile its centre
    // was dropped on; layout transitions animate everyone into place.
    const handleDrop = useCallback((id: DiscoveryCategoryId, dx: number, dy: number) => {
        setDraggingId(null);
        setDraft((prev) => {
            const fromIndex = prev.findIndex((entry) => entry.id === id);
            const own = layoutsRef.current.get(id);
            if (fromIndex < 0 || !own) return prev;
            const centerX = own.x + own.width / 2 + dx;
            const centerY = own.y + own.height / 2 + dy;
            let target = fromIndex;
            for (let i = 0; i < prev.length; i += 1) {
                if (prev[i].id === id) continue;
                const slot = layoutsRef.current.get(prev[i].id);
                if (!slot) continue;
                if (
                    centerX >= slot.x && centerX <= slot.x + slot.width &&
                    centerY >= slot.y && centerY <= slot.y + slot.height
                ) {
                    target = i;
                    break;
                }
            }
            if (target === fromIndex) {
                // Dropped past the last row → send to the end.
                const bottoms = Array.from(layoutsRef.current.values()).map((slot) => slot.y + slot.height);
                if (bottoms.length && centerY > Math.max(...bottoms)) target = prev.length - 1;
            }
            if (target === fromIndex) return prev;
            const next = [...prev];
            const [moved] = next.splice(fromIndex, 1);
            next.splice(target, 0, moved);
            return next;
        });
    }, []);

    const handleCycleSize = useCallback((id: DiscoveryCategoryId) => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setDraft((prev) => prev.map((entry) => (
            entry.id === id ? { ...entry, size: NEXT_TILE_SIZE[entry.size] } : entry
        )));
    }, []);

    const handleRemove = useCallback((id: DiscoveryCategoryId) => {
        // Keep at least one tile on the homepage.
        setDraft((prev) => (prev.length > 1 ? prev.filter((entry) => entry.id !== id) : prev));
    }, []);

    const handleAdd = useCallback((id: DiscoveryCategoryId) => {
        setDraft((prev) => (prev.some((entry) => entry.id === id) ? prev : [...prev, { id, size: 'card' as const }]));
    }, []);

    const available = DISCOVERY_CATEGORY_CATALOG.filter(
        (category) => !draft.some((entry) => entry.id === category.id),
    );

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <GestureHandlerRootView style={{ flex: 1 }}>
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
                                    {t('home.discoveryEditor.subtitle', { defaultValue: 'Hold and drag to arrange. Tap ⤢ to resize, − to remove.' })}
                                </Text>
                            </View>
                            <TouchableOpacity onPress={onClose} hitSlop={8} style={styles.editorCloseBtn}>
                                <X size={20} color={textSecondary} />
                            </TouchableOpacity>
                        </View>
                        <ScrollView
                            style={styles.editorScroll}
                            scrollEnabled={draggingId === null}
                            showsVerticalScrollIndicator={false}
                        >
                            <View style={styles.editorGrid}>
                                {draft.map((entry) => {
                                    const category = getDiscoveryCategory(entry.id);
                                    if (!category) return null;
                                    return (
                                        <EditorTile
                                            key={entry.id}
                                            tile={entry}
                                            category={category}
                                            title={t(category.homeTitleKey, { defaultValue: category.fallbackTitle })}
                                            labelColor={textPrimary}
                                            canRemove={draft.length > 1}
                                            onLayoutTile={handleLayoutTile}
                                            onDragStart={handleDragStart}
                                            onDrop={handleDrop}
                                            onCycleSize={handleCycleSize}
                                            onRemove={handleRemove}
                                        />
                                    );
                                })}
                            </View>
                            {available.length > 0 && (
                                <>
                                    <Text style={[styles.editorMoreTitle, { color: textSecondary }]}>
                                        {t('home.discoveryEditor.more', { defaultValue: 'More categories' })}
                                    </Text>
                                    <View style={styles.editorAddRow}>
                                        {available.map((category) => {
                                            const Glyph = DISCOVERY_TILE_GLYPHS[category.id];
                                            return (
                                                <AnimatedPressable
                                                    key={category.id}
                                                    onPress={() => handleAdd(category.id)}
                                                    style={[styles.editorAddChip, { borderColor: `${category.accent}55`, backgroundColor: `${category.accent}1F` }]}
                                                    hapticFeedback="light"
                                                    scaleTo={0.94}
                                                >
                                                    <Glyph size={14} color={category.accent} strokeWidth={2} />
                                                    <Text style={[styles.editorAddChipText, { color: textPrimary }]} numberOfLines={1}>
                                                        {t(category.homeTitleKey, { defaultValue: category.fallbackTitle })}
                                                    </Text>
                                                    <Plus size={13} color={category.accent} strokeWidth={2.5} />
                                                </AnimatedPressable>
                                            );
                                        })}
                                    </View>
                                </>
                            )}
                        </ScrollView>
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
            </GestureHandlerRootView>
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

// ─── Your Best Shots ─────────────────────────────────────────────────────────
// The product thesis as a UX object: not an infinite feed, but the max-3
// opportunities the user is genuinely competitive for (match >= 60).
const BEST_SHOT_MIN_MATCH = 60;
const BEST_SHOT_CARD_WIDTH = Math.min(Math.round(width * 0.72), 290);

function BestShotCard({ item, isDark, textPrimary, textSecondary, onPress, index = 0 }: {
    item: Opportunity;
    isDark: boolean;
    textPrimary: string;
    textSecondary: string;
    onPress?: () => void;
    index?: number;
}) {
    const deadlineBadge = useMemo(() => getDeadlineBadge(item.deadline), [item.deadline]);
    const deadlineColor = deadlineBadge.level === 'none'
        ? textSecondary
        : urgencyColor(deadlineBadge.level);
    const matchPct = Math.round(item.match ?? 0);
    const topReason = item.matchReasons?.[0];

    return (
        <AnimatedPressable
            onPress={onPress}
            style={[styles.bestShotCard, {
                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF',
                borderColor: isDark ? 'rgba(99,102,241,0.35)' : 'rgba(99,102,241,0.25)',
            }]}
            entering={FadeInDown.delay(index * 80).duration(360).springify()}
            hapticFeedback="medium"
            scaleTo={0.97}
        >
            <View style={styles.bestShotTopRow}>
                <View style={styles.bestShotMatchBadge}>
                    <Sparkles size={10} color="#FFFFFF" />
                    <Text style={styles.bestShotMatchText}>{matchPct}% match</Text>
                </View>
                <View style={styles.deadlineRow}>
                    <View style={[styles.deadlineDot, { backgroundColor: deadlineColor }]} />
                    <Text style={[styles.bestShotDeadline, { color: deadlineColor }]}>
                        {deadlineBadge.shortLabel}
                    </Text>
                </View>
            </View>
            <Text style={[styles.bestShotTitle, { color: textPrimary }]} numberOfLines={2}>{item.title}</Text>
            {topReason ? (
                <Text style={[styles.bestShotReason, { color: textSecondary }]} numberOfLines={2}>
                    {topReason}
                </Text>
            ) : null}
            <View style={styles.bestShotFooter}>
                <Text style={styles.bestShotCta}>Start here</Text>
                <ChevronRight size={14} color="#6366F1" />
            </View>
        </AnimatedPressable>
    );
}

// Empty state for Best Shots: a dashed "reserved slot" that previews the real
// BestShotCard (ghost match badge + ghost title lines) so the section shows
// what completing the profile unlocks instead of a generic notice. The ghost
// rows breathe slowly — "still forming" — unless the OS asks for reduced motion.
function BestShotEmptySlot({ isDark, textSecondary, onCompleteProfile }: {
    isDark: boolean;
    textSecondary: string;
    onCompleteProfile: () => void;
}) {
    const reduceMotion = useReducedMotion();
    const pulse = useSharedValue(0.9);

    useEffect(() => {
        if (reduceMotion) return;
        pulse.value = withRepeat(withTiming(0.45, { duration: 1400 }), -1, true);
    }, [pulse, reduceMotion]);

    const ghostStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

    const ghostInk = isDark ? 'rgba(148,163,184,0.22)' : 'rgba(30,41,59,0.10)';

    return (
        <AnimatedPressable
            onPress={onCompleteProfile}
            accessibilityRole="button"
            accessibilityLabel="Complete your profile to unlock your best shots"
            style={[styles.bestShotEmptyCard, {
                backgroundColor: isDark ? 'rgba(99,102,241,0.06)' : '#F7F7FF',
                borderColor: isDark ? 'rgba(99,102,241,0.32)' : 'rgba(99,102,241,0.35)',
            }]}
            entering={FadeInDown.duration(360).springify()}
            hapticFeedback="light"
            scaleTo={0.98}
        >
            <Animated.View style={ghostStyle}>
                <View style={styles.bestShotGhostRow}>
                    <View style={[styles.bestShotGhostBadge, { backgroundColor: isDark ? 'rgba(99,102,241,0.18)' : 'rgba(99,102,241,0.12)' }]}>
                        <Sparkles size={10} color={isDark ? '#A5B4FC' : '#4F46E5'} />
                        <Text style={[styles.bestShotGhostBadgeText, { color: isDark ? '#A5B4FC' : '#4F46E5' }]} maxFontSizeMultiplier={1.2}>
                            —% match
                        </Text>
                    </View>
                    <View style={styles.bestShotGhostMeta}>
                        <View style={[styles.bestShotGhostDot, { backgroundColor: ghostInk }]} />
                        <View style={[styles.bestShotGhostBar, { backgroundColor: ghostInk, width: 34 }]} />
                    </View>
                </View>
                <View style={[styles.bestShotGhostBar, { backgroundColor: ghostInk, width: '74%' }]} />
                <View style={[styles.bestShotGhostBar, { backgroundColor: ghostInk, width: '46%', marginTop: 7 }]} />
            </Animated.View>

            <View style={[styles.bestShotEmptyDivider, { backgroundColor: isDark ? 'rgba(148,163,184,0.16)' : 'rgba(30,41,59,0.08)' }]} />

            <Text style={[styles.bestShotEmptyTitle, { color: isDark ? '#F1F5F9' : '#1E293B' }]} maxFontSizeMultiplier={1.3}>
                Your strongest match lands here
            </Text>
            <Text style={[styles.bestShotEmptyDesc, { color: textSecondary }]} numberOfLines={2} maxFontSizeMultiplier={1.3}>
                Complete your profile and we'll surface the few you can actually win.
            </Text>

            <View style={[styles.bestShotEmptyBtn, { backgroundColor: isDark ? '#6366F1' : '#4F46E5' }]}>
                <Text style={styles.bestShotEmptyBtnText} maxFontSizeMultiplier={1.2}>Complete profile</Text>
                <ChevronRight size={15} color="#FFFFFF" strokeWidth={2.5} />
            </View>
        </AnimatedPressable>
    );
}

function BestShotsSection({ opportunities, loading, isDark, textPrimary, textSecondary, onOpen, onCompleteProfile }: {
    opportunities: Opportunity[];
    loading: boolean;
    isDark: boolean;
    textPrimary: string;
    textSecondary: string;
    onOpen: (item: Opportunity) => void;
    onCompleteProfile: () => void;
}) {
    const bestShots = useMemo(
        () => opportunities
            .filter((o) => Math.round(o.match ?? 0) >= BEST_SHOT_MIN_MATCH)
            .sort((a, b) => (b.match ?? 0) - (a.match ?? 0))
            .slice(0, 3),
        [opportunities],
    );

    // While the feed is still loading, don't flash the "complete your profile"
    // empty state — wait for real data before rendering anything.
    if (loading && bestShots.length === 0) return null;

    return (
        <Animated.View entering={FadeInDown.duration(400).delay(80)} style={styles.sectionSpacing}>
            <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleGroup}>
                    <View style={[styles.sectionIcon, { backgroundColor: isDark ? 'rgba(99,102,241,0.15)' : '#F0F0FF' }]}>
                        <Sparkles size={16} color="#6366F1" />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.sectionTitle, { color: textPrimary }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                            Your best shots
                        </Text>
                        <Text style={[styles.bestShotSubtitle, { color: textSecondary }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                            Fewer, winnable — these are yours.
                        </Text>
                    </View>
                </View>
            </View>
            {bestShots.length > 0 ? (
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.bestShotRail}
                    snapToInterval={BEST_SHOT_CARD_WIDTH + CARD_GAP}
                    decelerationRate="fast"
                >
                    {bestShots.map((item, idx) => (
                        <BestShotCard
                            key={item.id}
                            item={item}
                            isDark={isDark}
                            textPrimary={textPrimary}
                            textSecondary={textSecondary}
                            index={idx}
                            onPress={() => onOpen(item)}
                        />
                    ))}
                </ScrollView>
            ) : (
                <BestShotEmptySlot
                    isDark={isDark}
                    textSecondary={textSecondary}
                    onCompleteProfile={onCompleteProfile}
                />
            )}
        </Animated.View>
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
    const { tiles: homeTiles, save: saveHomeTiles } = useHomeCategories(user?.id);
    const homeTileEntries = useMemo(
        () => homeTiles
            .map((tile) => ({ tile, category: getDiscoveryCategory(tile.id) }))
            .filter((entry): entry is HomeTileEntry => Boolean(entry.category)),
        [homeTiles],
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
                    <DiscoveryTileGrid router={router} entries={homeTileEntries} textPrimary={textPrimary} />
                </Animated.View>

                <HomeCategoriesEditor
                    visible={categoryEditorVisible}
                    tiles={homeTiles}
                    onClose={() => setCategoryEditorVisible(false)}
                    onSave={saveHomeTiles}
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

                {/* Your Best Shots — the winnable few, above the general feed */}
                <BestShotsSection
                    opportunities={opportunities}
                    loading={opportunitiesLoading}
                    isDark={isDark}
                    textPrimary={textPrimary}
                    textSecondary={textSecondary}
                    onOpen={(item) => {
                        recordOpportunityOpen(item.id);
                        router.push(`/opportunities/${item.id}`);
                    }}
                    onCompleteProfile={() => router.push('/profile')}
                />

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
    // Icon-size tile: gradient glyph square with the label underneath.
    iconTileWrap: {
        width: ICON_TILE_WIDTH,
    },
    iconTileBox: {
        width: '100%',
        height: ICON_TILE_WIDTH,
    },
    iconTileSquare: {
        flex: 1,
        width: '100%',
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconTileLabel: {
        marginTop: 6,
        fontSize: 11,
        fontWeight: '600',
        textAlign: 'center',
    },
    // Long-size tile: full-width banner row.
    longTileCard: {
        width: '100%',
        height: 60,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: '#0F172A',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.14)',
    },
    longTileBg: {
        flex: 1,
        borderRadius: 16,
        overflow: 'hidden',
        justifyContent: 'center',
    },
    longTileRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 14,
    },
    longTileGlyph: {
        width: 34,
        height: 34,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.22)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    longTileTitle: {
        flex: 1,
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '800',
        letterSpacing: 0.3,
        textShadowColor: 'rgba(0,0,0,0.6)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 4,
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
        maxHeight: '86%',
    },
    editorScroll: {
        flexGrow: 0,
    },
    editorGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'flex-start',
        columnGap: EDITOR_GAP,
        rowGap: 14,
        paddingTop: 8,
        marginBottom: 14,
    },
    editorFace: {
        width: '100%',
        borderRadius: 16,
        // NOT hidden: the − / ⤢ badges hang over the tile edge.
        overflow: 'visible',
    },
    editorFaceClip: {
        flex: 1,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: '#0F172A',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.14)',
    },
    editorRemoveBadge: {
        position: 'absolute',
        top: -7,
        left: -7,
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: '#EF4444',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2,
    },
    editorSizeBadge: {
        position: 'absolute',
        bottom: -7,
        right: -7,
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: 'rgba(15,23,42,0.85)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.35)',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2,
    },
    editorIconLabel: {
        marginTop: 5,
        fontSize: 10,
        fontWeight: '600',
        textAlign: 'center',
    },
    editorMoreTitle: {
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.6,
        marginBottom: 8,
    },
    editorAddRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 8,
    },
    editorAddChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderRadius: 999,
        borderWidth: 1,
        paddingVertical: 7,
        paddingHorizontal: 12,
    },
    editorAddChipText: {
        fontSize: 13,
        fontWeight: '600',
        maxWidth: 140,
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
    bestShotSubtitle: {
        fontSize: 12,
        marginTop: 1,
    },
    bestShotRail: {
        paddingRight: 20,
        gap: CARD_GAP,
    },
    bestShotCard: {
        width: BEST_SHOT_CARD_WIDTH,
        borderRadius: 16,
        borderWidth: 1.5,
        padding: 14,
    },
    bestShotTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        marginBottom: 10,
    },
    bestShotMatchBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: '#6366F1',
        borderRadius: 999,
        paddingHorizontal: 9,
        paddingVertical: 4,
    },
    bestShotMatchText: {
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: '800',
    },
    bestShotDeadline: {
        fontSize: 11,
        fontWeight: '700',
    },
    bestShotTitle: {
        fontSize: 15,
        fontWeight: '800',
        lineHeight: 20,
    },
    bestShotReason: {
        fontSize: 12,
        lineHeight: 17,
        marginTop: 5,
    },
    bestShotFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        marginTop: 10,
    },
    bestShotCta: {
        color: '#6366F1',
        fontSize: 12,
        fontWeight: '800',
    },
    bestShotEmptyCard: {
        borderWidth: 1.5,
        borderStyle: 'dashed',
        borderRadius: 16,
        padding: 16,
    },
    bestShotGhostRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        marginBottom: 12,
    },
    bestShotGhostBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        borderRadius: 999,
        paddingHorizontal: 9,
        paddingVertical: 4,
    },
    bestShotGhostBadgeText: {
        fontSize: 11,
        fontWeight: '800',
    },
    bestShotGhostMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    bestShotGhostDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    bestShotGhostBar: {
        height: 9,
        borderRadius: 5,
    },
    bestShotEmptyDivider: {
        height: StyleSheet.hairlineWidth,
        marginVertical: 14,
    },
    bestShotEmptyTitle: {
        fontSize: 15,
        fontWeight: '800',
        lineHeight: 20,
    },
    bestShotEmptyDesc: {
        fontSize: 12.5,
        lineHeight: 18,
        marginTop: 4,
    },
    bestShotEmptyBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        height: 42,
        borderRadius: 12,
        marginTop: 14,
    },
    bestShotEmptyBtnText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '800',
    },
});
