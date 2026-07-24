import { View, Text, ScrollView, StyleSheet, Dimensions, Image, ImageBackground, RefreshControl, TouchableOpacity, FlatList, Modal, Pressable, NativeSyntheticEvent, NativeScrollEvent } from "react-native";
import React, { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import {
    Star,
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
} from "lucide-react-native";
import { useTheme } from "../../components/context/ThemeContext";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
    FadeIn,
    FadeInDown,
    FadeInUp,
    FadeOut,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from "react-native-reanimated";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import { haptics } from "../../lib/haptics";
import { createNavScrollHandler } from "../../lib/navScrollStore";
import { supabase } from "../../lib/supabase";
import { useOpportunities } from "@edutu/core/src/hooks/useOpportunities";
import { useProfileCompleteness } from "@edutu/core/src/hooks/useProfileCompleteness";
import { Opportunity, type MatchReasonKind } from "@edutu/core/src/types/opportunity";
import { toSafeUUID } from "@edutu/core/src/utils/auth";
import { recordOpportunitySignal, type DismissReason } from "@edutu/core/src/services/opportunitySignals";
import { dismissOpportunity } from "@edutu/core/src/services/dismissedOpportunities";
import { shareOpportunity } from "../../lib/shareOpportunity";
import { useGuestMode } from "../../lib/guestModeStore";
import { useAuthWall } from "../../components/context/AuthWallContext";
import { DismissReasonSheet } from "../../components/opportunity/DismissReasonSheet";
import { ImpressionView } from "../../components/opportunity/ImpressionView";
import { runImpressionChecks } from "../../lib/impressions";
import { getDeadlineBadge, urgencyColor } from "@edutu/core/src/utils/deadline";
import { getMatchTier, MATCH_TIER_KEY } from "@edutu/core/src/utils/matchTier";
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
import Ionicons from "@expo/vector-icons/Ionicons";
import { DISCOVERY_TILE_GLYPHS, DISCOVERY_TILE_GRADIENTS } from "../../lib/discoveryTileGlyphs";
import { useHomeCategories } from "../../lib/homeCategoriesStore";
import { HomeBlocks } from "../../components/home/HomeBlocks";
import { useTranslation } from "react-i18next";

const navScroll = createNavScrollHandler();
const { width } = Dimensions.get('window');
const CARD_GAP = 12;
const CARD_WIDTH = (width - 40 - CARD_GAP) / 2;
// Wide enough to fit a full content card, narrow enough that the next card
// peeks in — a visual cue that the row scrolls sideways.
const RAIL_CARD_WIDTH = Math.min(Math.round(width * 0.74), 300);

// ─── Home discovery tiles (widget-style sizes) ──────────────────────────────
const HOME_GRID_WIDTH = width - 40;
const ICON_TILE_WIDTH = (HOME_GRID_WIDTH - 3 * CARD_GAP) / 4;
// Editor is a full-width bottom sheet with 20px padding per side.
const EDITOR_GRID_WIDTH = width - 40;
const EDITOR_GAP = 10;
const EDITOR_TILE_WIDTH: Record<DiscoveryTileSize, number> = {
    icon: (EDITOR_GRID_WIDTH - 3 * EDITOR_GAP) / 4,
    card: (EDITOR_GRID_WIDTH - EDITOR_GAP) / 2,
    long: EDITOR_GRID_WIDTH,
};
// Icon faces are a fixed compact square (centered in their quarter-width
// slot) so the smallest size actually renders smallest — deriving it from the
// slot width made icon tiles taller than card tiles.
const ICON_SQUARE = 60;
const EDITOR_FACE_HEIGHT: Record<DiscoveryTileSize, number> = {
    icon: ICON_SQUARE,
    card: 62, // matches the homepage discoveryCard height
    long: 56,
};
// Ordered narrow→wide; the edge-drag resize handle snaps between these.
const EDITOR_TILE_SIZE_STEPS: Array<{ size: DiscoveryTileSize; width: number }> = [
    { size: 'icon', width: EDITOR_TILE_WIDTH.icon },
    { size: 'card', width: EDITOR_TILE_WIDTH.card },
    { size: 'long', width: EDITOR_TILE_WIDTH.long },
];
// How far past the narrowest/widest step the finger can stretch a tile —
// gives the drag an elastic end-stop instead of a hard wall.
const RESIZE_OVERDRAG = 14;

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
    const glyph = DISCOVERY_TILE_GLYPHS[item.id];

    if (size === 'icon') {
        return (
            <LinearGradient
                colors={DISCOVERY_TILE_GRADIENTS[item.id]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.iconTileSquare}
            >
                <Ionicons name={glyph} size={24} color="#FFFFFF" />
            </LinearGradient>
        );
    }

    if (size === 'long') {
        const row = (
            <View style={styles.longTileRow}>
                <View style={styles.longTileGlyph}>
                    <Ionicons name={glyph} size={18} color="#FFFFFF" />
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
                            key={`${category.id}-${tile.size}`}
                            onPress={onPress}
                            style={styles.iconTileWrap}
                            entering={FadeInDown.delay(index * 60).duration(360).springify()}
                            hapticFeedback="medium"
                            scaleTo={0.94}
                        >
                            <View style={styles.iconTileBox}>
                                <DiscoveryTileFace item={category} size="icon" title={title} />
                            </View>
                            <Text style={[styles.iconTileLabel, { color: textPrimary }]} numberOfLines={2}>{title}</Text>
                        </AnimatedPressable>
                    );
                }
                return (
                    // Key includes the size so a size change REMOUNTS instead of
                    // updating in place. Both branches render an AnimatedPressable,
                    // so with a bare category.id React reuses the view and
                    // Reanimated applies the new width without clearing the old
                    // style's backgroundColor/borderRadius — leaving a dark plate
                    // behind icon tiles. Tiles start at the 'card' default and flip
                    // to 'icon' when the saved layout loads, so this hit every
                    // default category on every cold start.
                    <AnimatedPressable
                        key={`${category.id}-${tile.size}`}
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
type TileRect = { x: number; y: number; w: number; h: number };

const EDITOR_ICON_LABEL_HEIGHT = 21;
// Snappy but soft — shared by every tile movement so the whole board feels
// like one physical system.
const TILE_SPRING = { damping: 22, stiffness: 260, mass: 0.7 };

/**
 * Derives every tile's rect from the draft order (same wrap rules as the
 * homepage grid). Tiles are absolutely positioned from these rects and
 * spring toward them, so resize/reorder/remove all glide — no layout jumps.
 */
function computeEditorLayout(tiles: HomeCategoryTile[]): { rects: Map<DiscoveryCategoryId, TileRect>; height: number } {
    const rects = new Map<DiscoveryCategoryId, TileRect>();
    let x = 0;
    let y = 0;
    let rowHeight = 0;
    for (const tile of tiles) {
        const w = EDITOR_TILE_WIDTH[tile.size];
        const h = EDITOR_FACE_HEIGHT[tile.size] + (tile.size === 'icon' ? EDITOR_ICON_LABEL_HEIGHT : 0);
        if (x > 0 && x + w > EDITOR_GRID_WIDTH + 0.5) {
            x = 0;
            y += rowHeight + EDITOR_GAP;
            rowHeight = 0;
        }
        rects.set(tile.id, { x, y, w, h });
        x += w + EDITOR_GAP;
        rowHeight = Math.max(rowHeight, h);
    }
    return { rects, height: y + rowHeight };
}

// One tile on the editor board. Springs toward its computed rect; long-press
// picks it up (it then follows the finger while the others reflow live).
// The − badge removes it; dragging the right-edge handle left/right resizes
// it iOS-widget style, live-snapping between icon → card → long.
function EditorTile({
    tile,
    category,
    title,
    labelColor,
    rect,
    held,
    gestureEnabled,
    canRemove,
    onDragStart,
    onDragMove,
    onDragEnd,
    onResizeStart,
    onResize,
    onResizeEnd,
    onRemove,
}: {
    tile: HomeCategoryTile;
    category: DiscoveryCategory;
    title: string;
    labelColor: string;
    rect: TileRect;
    held: boolean;
    gestureEnabled: boolean;
    canRemove: boolean;
    onDragStart: (id: DiscoveryCategoryId) => void;
    onDragMove: (id: DiscoveryCategoryId, dx: number, dy: number) => void;
    onDragEnd: (id: DiscoveryCategoryId) => void;
    onResizeStart: (id: DiscoveryCategoryId) => void;
    onResize: (id: DiscoveryCategoryId, size: DiscoveryTileSize) => void;
    onResizeEnd: (id: DiscoveryCategoryId) => void;
    onRemove: (id: DiscoveryCategoryId) => void;
}) {
    const { t } = useTranslation('home');
    const px = useSharedValue(rect.x);
    const py = useSharedValue(rect.y);
    const pw = useSharedValue(rect.w);
    const faceH = useSharedValue(EDITOR_FACE_HEIGHT[tile.size]);
    const startX = useSharedValue(0);
    const startY = useSharedValue(0);
    const scale = useSharedValue(1);
    // Width the finger owns during an edge drag; committedW tracks the width
    // of the size the drag has snapped to so far.
    const resizeActive = useSharedValue(false);
    const resizeStartW = useSharedValue(0);
    const committedW = useSharedValue(rect.w);

    // Spring toward the derived rect — except position while the finger owns
    // it (live reorders keep moving the rect underneath a held tile), and
    // width while the edge handle owns it.
    useEffect(() => {
        committedW.value = rect.w;
        faceH.value = withSpring(EDITOR_FACE_HEIGHT[tile.size], TILE_SPRING);
        if (!resizeActive.value) {
            pw.value = withSpring(rect.w, TILE_SPRING);
        }
        if (!held) {
            px.value = withSpring(rect.x, TILE_SPRING);
            py.value = withSpring(rect.y, TILE_SPRING);
        }
    }, [rect.x, rect.y, rect.w, tile.size, held, px, py, pw, faceH, committedW, resizeActive]);

    /* eslint-disable react-hooks/immutability -- Reanimated SharedValue writes inside gesture worklets (the library's documented imperative API) */
    const pan = Gesture.Pan()
        .enabled(gestureEnabled)
        .activateAfterLongPress(200)
        .onStart(() => {
            startX.value = px.value;
            startY.value = py.value;
            scale.value = withSpring(1.05, TILE_SPRING);
            runOnJS(onDragStart)(tile.id);
        })
        .onUpdate((event) => {
            px.value = startX.value + event.translationX;
            py.value = startY.value + event.translationY;
            runOnJS(onDragMove)(tile.id, event.translationX, event.translationY);
        })
        .onFinalize(() => {
            scale.value = withSpring(1, TILE_SPRING);
            runOnJS(onDragEnd)(tile.id);
        });

    // Edge-drag resize (iOS widget style): the width follows the finger and
    // the committed size live-snaps to the nearest step, so the board reflows
    // while you drag. Horizontal-only so vertical swipes still scroll. The
    // gesture's hitSlop confines it to a strip along the tile's right edge —
    // it shares one detector with the reorder pan (see Gesture.Exclusive
    // below); a nested detector loses the arbitration race and never fires.
    const resizePan = Gesture.Pan()
        .enabled(gestureEnabled)
        .hitSlop({ width: 36, right: 10 })
        .activeOffsetX([-6, 6])
        .failOffsetY([-16, 16])
        .onStart(() => {
            resizeActive.value = true;
            resizeStartW.value = pw.value;
            runOnJS(onResizeStart)(tile.id);
        })
        .onUpdate((event) => {
            const minW = EDITOR_TILE_SIZE_STEPS[0].width - RESIZE_OVERDRAG;
            const maxW = EDITOR_TILE_SIZE_STEPS[EDITOR_TILE_SIZE_STEPS.length - 1].width + RESIZE_OVERDRAG;
            const nextW = Math.min(maxW, Math.max(minW, resizeStartW.value + event.translationX));
            pw.value = nextW;
            let nearest = EDITOR_TILE_SIZE_STEPS[0];
            for (const step of EDITOR_TILE_SIZE_STEPS) {
                if (Math.abs(step.width - nextW) < Math.abs(nearest.width - nextW)) nearest = step;
            }
            if (nearest.width !== committedW.value) {
                committedW.value = nearest.width;
                runOnJS(onResize)(tile.id, nearest.size);
            }
        })
        .onFinalize(() => {
            resizeActive.value = false;
            pw.value = withSpring(committedW.value, TILE_SPRING);
            runOnJS(onResizeEnd)(tile.id);
        });
    /* eslint-enable react-hooks/immutability */

    // Resize wins on the edge strip; the reorder pan only activates once the
    // resize gesture is out of the running (touch outside the strip, or
    // vertical movement failing it).
    const tileGesture = Gesture.Exclusive(resizePan, pan);

    const tileStyle = useAnimatedStyle(() => ({
        position: 'absolute' as const,
        left: 0,
        top: 0,
        width: pw.value,
        transform: [{ translateX: px.value }, { translateY: py.value }, { scale: scale.value }],
        zIndex: held || resizeActive.value ? 100 : 0,
        elevation: held ? 10 : 0,
        shadowOpacity: held ? 0.35 : 0,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
    }));

    const faceStyle = useAnimatedStyle(() => ({ height: faceH.value }));

    return (
        <GestureDetector gesture={tileGesture}>
            <Animated.View style={tileStyle} exiting={FadeOut.duration(140)}>
                <Animated.View style={[styles.editorFace, faceStyle]}>
                    {/* Crossfade the face when the size changes so content never snaps. */}
                    <Animated.View
                        key={tile.size}
                        entering={FadeIn.duration(180)}
                        style={[styles.editorFaceClip, tile.size === 'icon' && styles.editorFaceClipIcon]}
                    >
                        <DiscoveryTileFace item={category} size={tile.size} title={title} />
                    </Animated.View>
                    {canRemove && (
                        <TouchableOpacity
                            onPress={() => onRemove(tile.id)}
                            hitSlop={10}
                            disabled={!gestureEnabled && !held}
                            style={[
                                styles.editorBadge,
                                styles.editorRemoveBadge,
                                // Ride the corner of the centered icon square, not the slot.
                                tile.size === 'icon' && { right: (rect.w - ICON_SQUARE) / 2 + 2 },
                            ]}
                            accessibilityLabel={t('home.discoveryEditor.remove', { defaultValue: 'Remove {{title}}', title })}
                        >
                            <Minus size={11} color="#FFFFFF" strokeWidth={3} />
                        </TouchableOpacity>
                    )}
                    {/* Purely visual — the resize gesture lives on the tile
                        root, confined to this edge strip via its hitSlop. */}
                    <View style={styles.editorResizeZone} pointerEvents="none">
                        <View style={styles.editorResizeHandle} />
                    </View>
                </Animated.View>
                {tile.size === 'icon' && (
                    <Animated.Text
                        entering={FadeIn.duration(180)}
                        style={[styles.editorIconLabel, { color: labelColor }]}
                        numberOfLines={1}
                    >
                        {title}
                    </Animated.Text>
                )}
            </Animated.View>
        </GestureDetector>
    );
}

// Widget-style editor: tiles render at their real size; long-press drag to
// rearrange, edge-drag resizes, − removes, and the chips below add more.
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
    const insets = useSafeAreaInsets();
    const [draft, setDraft] = useState<HomeCategoryTile[]>(tiles);
    const [draggingId, setDraggingId] = useState<DiscoveryCategoryId | null>(null);
    const [resizingId, setResizingId] = useState<DiscoveryCategoryId | null>(null);

    // Every tile position derives from the draft order — single source of truth.
    const layout = useMemo(() => computeEditorLayout(draft), [draft]);
    const layoutRef = useRef(layout);
    const draftRef = useRef(draft);
    // Render-time ref writes are unsafe under concurrent rendering; sync
    // post-commit — all readers are gesture callbacks, so this is equivalent.
    useEffect(() => {
        layoutRef.current = layout;
        draftRef.current = draft;
    });
    // Rect of the held tile at pickup — finger math stays anchored to it even
    // as live reorders move the tile's slot underneath.
    const anchorRef = useRef<TileRect | null>(null);
    const lastReorderAtRef = useRef(0);

    const canvasHeight = useSharedValue(layout.height);
    useEffect(() => {
        canvasHeight.value = withSpring(layout.height, TILE_SPRING);
    }, [layout.height, canvasHeight]);
    const canvasStyle = useAnimatedStyle(() => ({ height: canvasHeight.value }));

    // Adjust-during-render (React's documented reset-on-prop-change pattern):
    // re-seed the draft whenever the editor opens or the saved tiles change.
    const [prevSeed, setPrevSeed] = useState({ visible, tiles });
    if (prevSeed.visible !== visible || prevSeed.tiles !== tiles) {
        setPrevSeed({ visible, tiles });
        if (visible) setDraft(tiles);
    }

    const handleDragStart = useCallback((id: DiscoveryCategoryId) => {
        anchorRef.current = layoutRef.current.rects.get(id) ?? null;
        setDraggingId(id);
        void haptics.medium();
    }, []);

    // Live reorder: whenever the held tile's centre enters another tile's
    // slot, move it there immediately — the rest of the board glides aside.
    const handleDragMove = useCallback((id: DiscoveryCategoryId, dx: number, dy: number) => {
        const anchor = anchorRef.current;
        if (!anchor) return;
        const now = Date.now();
        if (now - lastReorderAtRef.current < 80) return;
        const centerX = anchor.x + anchor.w / 2 + dx;
        const centerY = anchor.y + anchor.h / 2 + dy;
        const current = draftRef.current;
        const rects = layoutRef.current.rects;
        const fromIndex = current.findIndex((entry) => entry.id === id);
        if (fromIndex < 0) return;
        let target = fromIndex;
        for (let i = 0; i < current.length; i += 1) {
            if (current[i].id === id) continue;
            const slot = rects.get(current[i].id);
            if (!slot) continue;
            if (
                centerX >= slot.x && centerX <= slot.x + slot.w &&
                centerY >= slot.y && centerY <= slot.y + slot.h
            ) {
                target = i;
                break;
            }
        }
        if (target === fromIndex) return;
        lastReorderAtRef.current = now;
        void haptics.selection();
        setDraft((prev) => {
            const from = prev.findIndex((entry) => entry.id === id);
            if (from < 0) return prev;
            const next = [...prev];
            const [moved] = next.splice(from, 1);
            next.splice(target, 0, moved);
            return next;
        });
    }, []);

    const handleDragEnd = useCallback((id: DiscoveryCategoryId) => {
        anchorRef.current = null;
        setDraggingId((current) => (current === id ? null : current));
    }, []);

    const handleResizeStart = useCallback((id: DiscoveryCategoryId) => {
        setResizingId(id);
        void haptics.light();
    }, []);

    // Fired each time the edge drag snaps to a new size step.
    const handleResize = useCallback((id: DiscoveryCategoryId, size: DiscoveryTileSize) => {
        void haptics.selection();
        setDraft((prev) => prev.map((entry) => (
            entry.id === id ? { ...entry, size } : entry
        )));
    }, []);

    const handleResizeEnd = useCallback((id: DiscoveryCategoryId) => {
        setResizingId((current) => (current === id ? null : current));
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
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <GestureHandlerRootView style={{ flex: 1 }}>
                <Pressable style={styles.editorBackdrop} onPress={onClose}>
                    <Pressable
                        style={[
                            styles.editorSheet,
                            { backgroundColor: isDark ? '#0F172A' : '#FFFFFF', paddingBottom: Math.max(insets.bottom, 12) + 8 },
                        ]}
                        onPress={() => { }}
                    >
                        <View style={[styles.editorGrabber, { backgroundColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(15,23,42,0.14)' }]} />
                        <View style={styles.editorHeader}>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.editorTitle, { color: textPrimary }]}>
                                    {t('home.discoveryEditor.title', { defaultValue: 'Customize categories' })}
                                </Text>
                                <Text style={[styles.editorSubtitle, { color: textSecondary }]}>
                                    {t('home.discoveryEditor.subtitle', { defaultValue: 'Hold and drag to arrange. Drag a tile’s edge to resize, − to remove.' })}
                                </Text>
                            </View>
                            <TouchableOpacity onPress={onClose} hitSlop={8} style={styles.editorCloseBtn}>
                                <X size={20} color={textSecondary} />
                            </TouchableOpacity>
                        </View>
                        <ScrollView
                            style={styles.editorScroll}
                            scrollEnabled={draggingId === null && resizingId === null}
                            showsVerticalScrollIndicator={false}
                        >
                            <Animated.View style={[styles.editorCanvas, canvasStyle]}>
                                {draft.map((entry) => {
                                    const category = getDiscoveryCategory(entry.id);
                                    const rect = layout.rects.get(entry.id);
                                    if (!category || !rect) return null;
                                    const activeId = draggingId ?? resizingId;
                                    return (
                                        <EditorTile
                                            key={entry.id}
                                            tile={entry}
                                            category={category}
                                            title={t(category.homeTitleKey, { defaultValue: category.fallbackTitle })}
                                            labelColor={textPrimary}
                                            rect={rect}
                                            held={draggingId === entry.id}
                                            gestureEnabled={activeId === null || activeId === entry.id}
                                            canRemove={draft.length > 1}
                                            onDragStart={handleDragStart}
                                            onDragMove={handleDragMove}
                                            onDragEnd={handleDragEnd}
                                            onResizeStart={handleResizeStart}
                                            onResize={handleResize}
                                            onResizeEnd={handleResizeEnd}
                                            onRemove={handleRemove}
                                        />
                                    );
                                })}
                            </Animated.View>
                            {available.length > 0 && (
                                <>
                                    <Text style={[styles.editorMoreTitle, { color: textSecondary }]}>
                                        {t('home.discoveryEditor.more', { defaultValue: 'More categories' })}
                                    </Text>
                                    <View style={styles.editorAddGrid}>
                                        {available.map((category) => (
                                            <AnimatedPressable
                                                key={category.id}
                                                onPress={() => handleAdd(category.id)}
                                                style={styles.editorAddCard}
                                                hapticFeedback="light"
                                                scaleTo={0.96}
                                                accessibilityLabel={t('home.discoveryEditor.add', {
                                                    defaultValue: 'Add {{title}}',
                                                    title: t(category.homeTitleKey, { defaultValue: category.fallbackTitle }),
                                                })}
                                            >
                                                <View style={styles.editorAddCardFace}>
                                                    <DiscoveryTileFace
                                                        item={category}
                                                        size="card"
                                                        title={t(category.homeTitleKey, { defaultValue: category.fallbackTitle })}
                                                    />
                                                </View>
                                                <View style={[styles.editorBadge, styles.editorAddBadge]}>
                                                    <Plus size={11} color="#FFFFFF" strokeWidth={3} />
                                                </View>
                                            </AnimatedPressable>
                                        ))}
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
function OpportunityCard({ item, isDark, textPrimary, textSecondary, accent = '#6366F1', onPress, onBookmark, onShare, onNotInterested, bookmarked = false, horizontal = false, index = 0 }: {
    item: Opportunity;
    isDark: boolean;
    textPrimary: string;
    textSecondary: string;
    accent?: string;
    onPress?: () => void;
    onBookmark?: () => void;
    onShare?: () => void;
    /** Long-press: opens the typed "not interested" flow. */
    onNotInterested?: () => void;
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
            onLongPress={onNotInterested}
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
                            <Target size={9} color={accent} strokeWidth={2.6} />
                            <Text style={[styles.oppMatchBadgeText, { color: accent }]}>{t('opportunityCard.' + MATCH_TIER_KEY[getMatchTier(matchPct)])}</Text>
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
                        <Target size={8} color="#C7D2FE" strokeWidth={2.6} />
                        <Text style={styles.posterMatchText} maxFontSizeMultiplier={1.2}>{t('opportunityCard.' + MATCH_TIER_KEY[getMatchTier(matchPct)])}</Text>
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
            {/* Layout MUST live on this inner row: AnimatedPressable puts the
                card `style` on its outer wrapper but nests children in flex:1
                column views, so flexDirection on the card style is ignored. */}
            <View style={styles.featuredEmptyRow}>
                <View style={[styles.featuredEmptyIllus, { backgroundColor: isDark ? 'rgba(99,102,241,0.16)' : 'rgba(99,102,241,0.12)' }]}>
                    <Star size={22} color="#6366F1" strokeWidth={2.2} fill="#6366F1" />
                </View>
                <View style={styles.featuredEmptyBody}>
                    <Text
                        style={[styles.featuredEmptyTitle, { color: isDark ? '#E2E8F0' : '#1E293B' }]}
                        numberOfLines={1}
                        maxFontSizeMultiplier={1.3}
                    >
                        {t('featured.emptyTitle', { defaultValue: 'Featured picks coming soon' })}
                    </Text>
                    <Text
                        style={[styles.featuredEmptyHint, { color: isDark ? '#94A3B8' : '#64748B' }]}
                        numberOfLines={1}
                        maxFontSizeMultiplier={1.3}
                    >
                        {t('featured.emptyHint', { defaultValue: 'Explore all opportunities' })}
                    </Text>
                </View>
                {/* Chevron affordance only — the whole card is the tap target, so a
                    labelled "Explore" button would be a redundant second action. */}
                <View style={[styles.featuredEmptyChevron, { backgroundColor: isDark ? 'rgba(99,102,241,0.18)' : 'rgba(99,102,241,0.10)' }]}>
                    <ChevronRight size={18} color={isDark ? '#A5B4FC' : '#4F46E5'} />
                </View>
            </View>
        </AnimatedPressable>
    );
}

function FeaturedCarousel({ data, isDark, bookmarkedIds, onOpen, onBookmark, onShare, getAuthToken }: {
    data: Opportunity[];
    isDark: boolean;
    bookmarkedIds: string[];
    onOpen: (item: Opportunity) => void;
    onBookmark: (id: string) => void;
    onShare: (item: Opportunity) => void;
    getAuthToken?: () => Promise<string | null | undefined>;
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
            // New page = new cards on screen — let their impression checks run.
            setTimeout(() => runImpressionChecks(true), 450);
        }, FEATURED_AUTO_ADVANCE_MS);
        return () => clearInterval(timer);
    }, [paused, pageCount]);

    const handleMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const page = Math.max(0, Math.min(pageCount - 1, Math.round(e.nativeEvent.contentOffset.x / FEATURED_PAGE_SNAP)));
        pageRef.current = page;
        setActivePage(page);
        setPaused(false);
        runImpressionChecks(true);
    };

    // Single featured item: promote it to a full-width cinematic spotlight
    // instead of leaving a half-empty two-column row.
    if (data.length === 1) {
        const item = data[0];
        return (
            <ImpressionView
                opportunityId={item.id}
                surface="home_featured"
                position={0}
                getAuthToken={getAuthToken}
            >
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
            </ImpressionView>
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
                    <ImpressionView
                        opportunityId={item.id}
                        surface="home_featured"
                        position={index}
                        getAuthToken={getAuthToken}
                    >
                        <FeaturedPosterCard
                            item={item}
                            isDark={isDark}
                            index={index}
                            bookmarked={bookmarkedIds.includes(item.id)}
                            onPress={() => onOpen(item)}
                            onBookmark={() => onBookmark(item.id)}
                            onShare={() => onShare(item)}
                        />
                    </ImpressionView>
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

// Reason kinds that only establish *eligibility* (you're allowed to apply)
// rather than genuine fit. A best shot should be winnable for a substantive
// reason, not merely because your country/region is on the list.
const ELIGIBILITY_ONLY_REASON_KINDS = new Set<MatchReasonKind>([
    'location',
    'remote',
]);

// A best shot must have at least one substantive (non-eligibility) reason.
// We can only judge this from reason *kinds* (labels are translated across 9
// languages, so string-matching them is unreliable); when no kind data is
// present we can't classify, so we don't over-filter and keep the item.
function hasSubstantiveMatch(o: Opportunity): boolean {
    const details = o.matchReasonDetails;
    if (!details || details.length === 0) return true;
    return details.some((d) => !ELIGIBILITY_ONLY_REASON_KINDS.has(d.kind));
}

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
    const { t } = useTranslation('home');
    const matchPct = Math.round(item.match ?? 0);
    const topReason = item.matchReasons?.[0];

    // With artwork the card becomes a dark "poster" in BOTH themes: art up top,
    // a strong bottom scrim, white text pinned to the bottom. Guarantees
    // legibility over any photo and reads more premium than tinting the image.
    const hasImage = !!item.image;
    // The generated share card already renders the title into the artwork, so
    // overlaying our own title on top of it would show the title twice. Drop
    // the overlay title in that case (a11y label below keeps it announced).
    const artHasTitle = hasImage && !!item.imageIsShareCard;
    const titleColor = hasImage ? '#FFFFFF' : textPrimary;
    const reasonColor = hasImage ? 'rgba(255,255,255,0.82)' : textSecondary;
    const deadlineTextColor = hasImage
        ? (deadlineBadge.level === 'none' ? 'rgba(255,255,255,0.92)' : urgencyColor(deadlineBadge.level))
        : deadlineColor;

    return (
        <AnimatedPressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={`${item.title}, ${matchPct}% match`}
            style={[
                styles.bestShotCard,
                hasImage
                    // Netflix-style poster: no border/frame, art bleeds edge to
                    // edge (padding lives on the inner content, not the card).
                    ? { backgroundColor: '#0D0D16', borderWidth: 0, minHeight: 152 }
                    : {
                        backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF',
                        borderColor: isDark ? 'rgba(99,102,241,0.35)' : 'rgba(99,102,241,0.25)',
                    },
            ]}
            entering={FadeInDown.delay(index * 80).duration(360).springify()}
            hapticFeedback="medium"
            scaleTo={0.97}
        >
            {/* Artwork fills the card (bled past the border, no white frame); a
                bottom-weighted scrim darkens where the text sits. */}
            {hasImage ? (
                <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                    {/* `hasImage` guards this branch, but it's a plain boolean so
                        TS can't narrow item.image — coerce null away for the type. */}
                    <Image source={{ uri: item.image ?? undefined }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                    <LinearGradient
                        colors={['rgba(9,9,14,0.10)', 'rgba(9,9,14,0.58)', 'rgba(9,9,14,0.95)']}
                        locations={[0, 0.5, 1]}
                        style={StyleSheet.absoluteFill}
                    />
                </View>
            ) : null}
            <View style={[styles.bestShotContent, hasImage && styles.bestShotContentPoster]}>
                <View style={styles.bestShotTopRow}>
                    <View style={styles.bestShotMatchBadge}>
                        <Target size={10} color="#FFFFFF" strokeWidth={2.6} />
                        <Text style={styles.bestShotMatchText}>{t('opportunityCard.' + MATCH_TIER_KEY[getMatchTier(matchPct)])}</Text>
                    </View>
                    <View style={[styles.deadlineRow, hasImage && styles.bestShotDeadlineChip]}>
                        <View style={[styles.deadlineDot, { backgroundColor: deadlineTextColor }]} />
                        <Text style={[styles.bestShotDeadline, { color: deadlineTextColor }]}>
                            {deadlineBadge.shortLabel}
                        </Text>
                    </View>
                </View>
                <View>
                    {artHasTitle ? null : (
                        <Text style={[styles.bestShotTitle, { color: titleColor }]} numberOfLines={2}>{item.title}</Text>
                    )}
                    {topReason ? (
                        <Text style={[styles.bestShotReason, { color: reasonColor }]} numberOfLines={2}>
                            {topReason}
                        </Text>
                    ) : null}
                </View>
            </View>
            {/* No "Start here" link — the whole card is the tap target. */}
        </AnimatedPressable>
    );
}

// Empty state for Best Shots: a dashed "reserved slot" that previews the real
// BestShotCard (ghost match badge + ghost title lines) so the section shows
// what's coming instead of a generic notice. The ghost rows breathe slowly —
// "still forming" — unless the OS asks for reduced motion.
//
// Two variants, because an empty slot means two different things:
//   • 'incomplete' — profile isn't filled in, so we can't score matches yet.
//     Ask the user to complete their profile.
//   • 'searching'  — profile is complete but nothing has cleared the match bar
//     yet. Don't tell them to "complete their profile" (they already did);
//     point them at the recommendations below while we keep looking.
function BestShotEmptySlot({ isDark, textSecondary, variant, onCompleteProfile, onBrowse }: {
    isDark: boolean;
    textSecondary: string;
    variant: 'incomplete' | 'searching';
    onCompleteProfile: () => void;
    onBrowse: () => void;
}) {
    const isSearching = variant === 'searching';
    const emptyTitle = isSearching
        ? "Finding your best match"
        : "Complete your profile";
    const emptyDesc = isSearching
        ? "Nothing's cleared the bar yet — see recommendations below."
        : "Unlock the matches you can actually win.";
    const onPress = isSearching ? onBrowse : onCompleteProfile;
    const a11yLabel = isSearching
        ? "Browse opportunities while we find your best shot"
        : "Complete your profile to unlock your best shots";

    return (
        <AnimatedPressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={a11yLabel}
            testID="best-shots-empty-slot"
            style={[styles.bestShotEmptyCard, {
                backgroundColor: isDark ? 'rgba(99,102,241,0.06)' : '#F7F7FF',
                borderColor: isDark ? 'rgba(99,102,241,0.32)' : 'rgba(99,102,241,0.28)',
            }]}
            entering={FadeInDown.duration(360).springify()}
            hapticFeedback="light"
            scaleTo={0.98}
        >
            <View style={styles.bestShotEmptyRow}>
                <View style={styles.bestShotEmptyText}>
                    <Text
                        style={[styles.bestShotEmptyTitle, { color: isDark ? '#F1F5F9' : '#1E293B' }]}
                        numberOfLines={1}
                        maxFontSizeMultiplier={1.3}
                    >
                        {emptyTitle}
                    </Text>
                    <Text
                        style={[styles.bestShotEmptyDesc, { color: textSecondary }]}
                        numberOfLines={2}
                        maxFontSizeMultiplier={1.3}
                    >
                        {emptyDesc}
                    </Text>
                </View>

                <ChevronRight size={22} color={isDark ? '#818CF8' : '#6366F1'} strokeWidth={2.4} />
            </View>
        </AnimatedPressable>
    );
}

function BestShotsSection({ bestShots, loading, profileComplete, isDark, textPrimary, textSecondary, onOpen, onCompleteProfile, onBrowse, getAuthToken }: {
    bestShots: Opportunity[];
    loading: boolean;
    profileComplete: boolean;
    isDark: boolean;
    textPrimary: string;
    textSecondary: string;
    onOpen: (item: Opportunity) => void;
    onCompleteProfile: () => void;
    onBrowse: () => void;
    getAuthToken?: () => Promise<string | null | undefined>;
}) {
    // While the feed is still loading, don't flash the empty state — wait for
    // real data before rendering anything.
    if (loading && bestShots.length === 0) return null;

    return (
        <Animated.View entering={FadeInDown.duration(400).delay(80)} style={styles.sectionSpacing}>
            <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleGroup}>
                    <View style={[styles.sectionIcon, { backgroundColor: isDark ? 'rgba(99,102,241,0.15)' : '#F0F0FF' }]}>
                        <Target size={16} color="#6366F1" strokeWidth={2.4} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.sectionTitle, { color: textPrimary }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                            Your best shots
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
                        <ImpressionView
                            key={item.id}
                            opportunityId={item.id}
                            surface="home_best_shots"
                            position={idx}
                            getAuthToken={getAuthToken}
                        >
                            <BestShotCard
                                item={item}
                                isDark={isDark}
                                textPrimary={textPrimary}
                                textSecondary={textSecondary}
                                index={idx}
                                onPress={() => onOpen(item)}
                            />
                        </ImpressionView>
                    ))}
                </ScrollView>
            ) : (
                <BestShotEmptySlot
                    isDark={isDark}
                    textSecondary={textSecondary}
                    variant={profileComplete ? 'searching' : 'incomplete'}
                    onCompleteProfile={onCompleteProfile}
                    onBrowse={onBrowse}
                />
            )}
        </Animated.View>
    );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
    const { t } = useTranslation('home');
    const { isDark, colors } = useTheme();
    const { user } = useUser();
    const { getToken, isSignedIn } = useAuth();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    // Guests can open and share opportunities, but saving needs an account.
    const { isGuest } = useGuestMode();
    const authWall = useAuthWall();
    const isGuestBrowsing = !isSignedIn && isGuest;

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
    const { data: opportunities, loading: opportunitiesLoading, refresh, noteDismissed } = useOpportunities({
        supabase,
        userId: user?.id,
        getAuthToken: getToken,
        onSyncSnapshot: syncOpportunityWidget,
    });

    // Profile completeness drives the Best Shots empty state: an empty slot with
    // an incomplete profile means "we can't score you yet"; with a complete
    // profile it means "we just haven't found a strong match yet" — two very
    // different messages.
    const { completeness: profileCompleteness } = useProfileCompleteness(supabase, user?.id ?? null);

    // "Not interested" target — long-press on a card opens the typed-reason
    // sheet; the chosen reason routes differently in the ranking engine.
    const [dismissTarget, setDismissTarget] = useState<Opportunity | null>(null);

    const dismissUserId = user?.id;
    const handleDismissReason = useCallback((reason: DismissReason) => {
        const target = dismissTarget;
        setDismissTarget(null);
        if (!target || !dismissUserId) return;
        void dismissOpportunity(dismissUserId, target.id, getToken, 'home_card', reason);
        noteDismissed(target.id);
    }, [dismissTarget, dismissUserId, getToken, noteDismissed]);

    // Your Best Shots — the winnable few (match >= 60). Computed here rather
    // than inside BestShotsSection so the Recommended grid below can exclude
    // these exact ids and the same card never shows up twice on the home screen.
    const bestShots = useMemo(
        () => opportunities
            .filter(
                (o) =>
                    Math.round(o.match ?? 0) >= BEST_SHOT_MIN_MATCH &&
                    hasSubstantiveMatch(o),
            )
            .sort((a, b) => (b.match ?? 0) - (a.match ?? 0))
            .slice(0, 3),
        [opportunities],
    );
    const bestShotIds = useMemo(() => new Set(bestShots.map((o) => o.id)), [bestShots]);

    // Featured: swipeable auto-scrolling rail, max 10
    const featuredOpportunities = useMemo(() => {
        return opportunities.filter(o => o.featured).slice(0, 10);
    }, [opportunities]);

    // Other Recommended: the ranked feed minus anything already surfaced as a
    // Best Shot, so the two sections never duplicate cards. Max 10.
    const otherOpportunities = useMemo(() => {
        return opportunities.filter((o) => !bestShotIds.has(o.id)).slice(0, 10);
    }, [opportunities, bestShotIds]);

    const toggleBookmark = async (opportunityId: string) => {
        if (isGuestBrowsing) {
            authWall?.promptAuth('save');
            return;
        }
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
                // Pumps the ImpressionView visibility checks (throttled inside)
                // so cards scrolled into view log their impressions.
                onScroll={(event) => {
                    navScroll(event);
                    runImpressionChecks();
                }}
                scrollEventThrottle={16}
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

                {/* Admin-composed home blocks (announcements, promos, curated
                    rails, custom features). Renders nothing when no layout is
                    published, so the built-in sections below are unaffected. */}
                <HomeBlocks opportunities={opportunities ?? []} />

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
                    {/* category_view signals fire in the explore screen's
                        params-effect — the single choke point for tile taps,
                        in-screen chooser picks, and deep links alike. */}
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
                                <Star size={16} color={colors.accent} fill={colors.accent} />
                            </View>
                            <Text style={[styles.sectionTitle, { color: textPrimary }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                                {t('home.featuredOpportunities', { defaultValue: 'Featured Opportunities' })}
                            </Text>
                            {/* "View more" only when the section is actually populated
                                (2+). In the empty state the card carries its own
                                arrow, so a header arrow would be a redundant second one. */}
                            {featuredOpportunities.length >= 2 && (
                                <AnimatedPressable
                                    onPress={() => router.push('/opportunities/featured')}
                                    style={styles.viewMorePill}
                                    hapticFeedback="light"
                                    scaleTo={0.9}
                                    accessibilityLabel={t('home.viewMore', { defaultValue: 'View More' })}
                                >
                                    <View style={styles.viewMorePillInner}>
                                        <ChevronRight size={18} color="#6366F1" />
                                    </View>
                                </AnimatedPressable>
                            )}
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
                                getAuthToken={getToken}
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
                    bestShots={bestShots}
                    loading={opportunitiesLoading}
                    profileComplete={profileCompleteness.isComplete}
                    isDark={isDark}
                    textPrimary={textPrimary}
                    textSecondary={textSecondary}
                    onOpen={(item) => {
                        recordOpportunityOpen(item.id);
                        router.push(`/opportunities/${item.id}`);
                    }}
                    onCompleteProfile={() => router.push('/profile')}
                    onBrowse={() => router.push('/opportunities')}
                    getAuthToken={getToken}
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
                                <View style={styles.viewMorePillInner}>
                                    <ChevronRight size={18} color="#6366F1" />
                                </View>
                            </AnimatedPressable>
                        </View>
                        <View style={styles.oppGridContainer}>
                            {otherOpportunities.slice(0, 8).map((item, idx) => (
                                <ImpressionView
                                    key={item.id}
                                    opportunityId={item.id}
                                    surface="home_recommended"
                                    position={idx}
                                    getAuthToken={getToken}
                                    style={styles.oppGridItem}
                                >
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
                                        onNotInterested={() => setDismissTarget(item)}
                                        bookmarked={bookmarkedIds.includes(item.id)}
                                    />
                                </ImpressionView>
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

            <DismissReasonSheet
                visible={dismissTarget !== null}
                isDark={isDark}
                onSelect={handleDismissReason}
                onClose={() => setDismissTarget(null)}
            />
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
        height: 62,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: '#0F172A',
    },
    // Icon-size tile: gradient glyph square with the label underneath.
    iconTileWrap: {
        width: ICON_TILE_WIDTH,
    },
    iconTileBox: {
        width: '100%',
        height: ICON_SQUARE,
        alignItems: 'center',
    },
    iconTileSquare: {
        width: ICON_SQUARE,
        height: ICON_SQUARE,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'center',
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
        fontSize: 14,
        lineHeight: 18,
        fontWeight: '800',
        letterSpacing: 0.2,
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
        justifyContent: 'flex-end',
    },
    editorSheet: {
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        paddingHorizontal: 20,
        paddingTop: 10,
        maxHeight: '88%',
    },
    editorGrabber: {
        alignSelf: 'center',
        width: 40,
        height: 4,
        borderRadius: 2,
        marginBottom: 12,
    },
    editorScroll: {
        flexGrow: 0,
    },
    // Absolute-positioned tile board; height is animated to fit the rows.
    editorCanvas: {
        position: 'relative',
        marginTop: 4,
        marginBottom: 18,
    },
    editorFace: {
        width: '100%',
        borderRadius: 16,
    },
    editorFaceClip: {
        flex: 1,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: '#0F172A',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.14)',
    },
    // Icon faces are a small centered square — no slot-wide chrome behind them.
    editorFaceClipIcon: {
        backgroundColor: 'transparent',
        borderWidth: 0,
        justifyContent: 'center',
    },
    editorBadge: {
        position: 'absolute',
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.45)',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2,
    },
    editorRemoveBadge: {
        top: 5,
        right: 5,
        backgroundColor: 'rgba(239,68,68,0.95)',
    },
    // Right-edge resize grip (iOS widget style): generous invisible grab zone
    // with a small visible pill riding the tile's edge.
    editorResizeZone: {
        position: 'absolute',
        right: -8,
        top: 0,
        bottom: 0,
        width: 24,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 3,
    },
    editorResizeHandle: {
        width: 5,
        height: 26,
        borderRadius: 3,
        backgroundColor: 'rgba(255,255,255,0.92)',
        borderWidth: 1,
        borderColor: 'rgba(2,6,23,0.35)',
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 3,
        shadowOffset: { width: 0, height: 1 },
        elevation: 3,
    },
    editorAddBadge: {
        top: 5,
        right: 5,
        backgroundColor: 'rgba(2,6,23,0.6)',
    },
    editorIconLabel: {
        marginTop: 5,
        fontSize: 10,
        lineHeight: 16,
        fontWeight: '600',
        textAlign: 'center',
    },
    editorMoreTitle: {
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.6,
        marginBottom: 10,
    },
    editorAddGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: EDITOR_GAP,
        marginBottom: 8,
    },
    editorAddCard: {
        width: EDITOR_TILE_WIDTH.card,
        height: 56,
        borderRadius: 16,
    },
    editorAddCardFace: {
        flex: 1,
        borderRadius: 16,
        overflow: 'hidden',
        opacity: 0.55,
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
        borderWidth: 1,
        borderRadius: 16,
        padding: 14,
    },
    featuredEmptyRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    featuredEmptyIllus: {
        width: 46,
        height: 46,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    featuredEmptyBody: {
        flex: 1,
        gap: 2,
    },
    featuredEmptyChevron: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
    },
    featuredEmptyTitle: {
        fontSize: 14.5,
        fontWeight: '700',
        lineHeight: 19,
    },
    featuredEmptyHint: {
        fontSize: 12,
        fontWeight: '500',
        lineHeight: 16,
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
        marginLeft: 'auto',
        flexShrink: 0,
        height: 34,
        width: 34,
        borderRadius: 999,
        backgroundColor: 'rgba(99,102,241,0.12)',
    },
    // Centering has to happen inside AnimatedPressable's nested Pressable, not
    // on the pill — styles passed to the pill land on an outer wrapper and the
    // chevron ends up pinned to the top of the circle. Safe to drop the pill's
    // own alignItems here because its 34x34 is explicit, so the wrapper's
    // flex:1 still resolves against a real height.
    viewMorePillInner: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    viewMoreText: {
        color: '#6366F1',
        fontSize: 12,
        fontWeight: '700',
        lineHeight: 15,
        flexShrink: 0,
        includeFontPadding: false,
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
    bestShotRail: {
        paddingRight: 20,
        gap: CARD_GAP,
    },
    bestShotCard: {
        width: BEST_SHOT_CARD_WIDTH,
        borderRadius: 16,
        borderWidth: 1.5,
        overflow: 'hidden',
    },
    // Padding lives here (not on the card) so the artwork can bleed to the
    // card's rounded edge with no frame — Netflix-style poster.
    bestShotContent: {
        flex: 1,
        padding: 14,
    },
    // Poster layout: badges at top, text pushed to the bottom over the scrim.
    bestShotContentPoster: {
        justifyContent: 'space-between',
    },
    // Legibility chip behind the deadline when it sits over artwork.
    bestShotDeadlineChip: {
        backgroundColor: 'rgba(0,0,0,0.38)',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
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
    bestShotEmptyCard: {
        // Keep row/center here even though the visible row is the inner View:
        // AnimatedPressable's wrapper is flex:1, and in a column parent that
        // resolves flexBasis 0 against an auto height and collapses the card.
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 18,
        paddingVertical: 16,
        paddingHorizontal: 16,
    },
    // The row lives on an inner View, not on the card: AnimatedPressable puts
    // its own Animated.View + Pressable between the style you pass and the
    // children, so a flexDirection set on the card never reaches them and the
    // chevron drops below the text.
    bestShotEmptyRow: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    bestShotEmptyText: {
        flex: 1,
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
});
