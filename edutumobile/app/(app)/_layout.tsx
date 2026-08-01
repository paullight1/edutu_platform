import React, { useState, useRef, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform, Animated, useAnimatedValue, Dimensions } from "react-native";
import { Stack, Redirect, useRouter, usePathname, useGlobalSearchParams } from "expo-router";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
    Home,
    Compass,
    ShoppingBag,
    Bell,
    UserCircle,
    BadgeCheck,
    Crown,
    Plus,
    Pencil,
    Target,
    Route,
    Menu,
} from "lucide-react-native";
import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { BottomScrimView } from "../../components/ui/BottomScrim";
import ReAnimated, {
    type SharedValue,
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    withSequence,
    Easing,
    interpolate,
    Extrapolation,
} from "react-native-reanimated";
import { haptics } from "../../lib/haptics";
import { useNavCompact, setNavCompact } from "../../lib/navScrollStore";
import { AiSparkGlyph } from "../../components/ui/AiSparkGlyph";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../../components/context/ThemeContext";
import { ToastProvider, useToast } from "../../components/context/ToastContext";
import { UpgradeSheetProvider } from "../../components/context/UpgradeSheetContext";
import { useCreditRewards } from "@edutu/core/src/hooks/useCreditRewards";
import {
    redeemReferral,
    isTerminalRedeemStatus,
    PENDING_REFERRAL_KEY,
} from "@edutu/core/src/services/referrals";
import { EdutuLogo } from "../../components/branding/EdutuLogo";
import { FeatureMenu } from "../../components/ui/FeatureMenu";
import { WelcomeHintSystem } from "../../components/ui/WelcomeHintSystem";
import { LoginOfferModal } from "../../components/ui/LoginOfferModal";
import { WelcomeModal } from "../../components/ui/WelcomeModal";
import { ModuleLockOverlay } from "../../components/mobile-control/ModuleLockOverlay";
import { VoiceModeOverlay } from "../../components/chat/VoiceModeOverlay";
import { openVoiceMode } from "../../lib/voiceModeStore";
import { useNavFabState } from "../../lib/navFabStore";
import { useNavStyleSettings, isBarStyle, type NavBarStyle } from "../../lib/navStyleStore";
import { setStatusBarStyle } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import { notificationService, registerForPushNotificationsAsync } from "../../lib/notifications";
import { ACTION_ASK, ACTION_SAVE } from "../../lib/notificationCategories";
import { saveOpportunity } from "@edutu/core/src/services/bookmarks";
import { updateProfile } from "@edutu/core/src/services/profile";
import { supabase } from "../../lib/supabase";
import { useNotifications } from "@edutu/core/src/hooks/useNotifications";
import { useProStatus } from "@edutu/core/src/hooks/useProStatus";
import { useTranslation } from "react-i18next";
import { useGuestMode, isGuestAllowedPath } from "../../lib/guestModeStore";
import { useAuthWall } from "../../components/context/AuthWallContext";

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Expanded width of the nav pill: screen minus the navRow insets (14 + 14),
// the detached circle (66) and the row gap (10). The pill's width is animated
// between this and 0 when it compresses into the circle.
const NAV_PILL_WIDTH = SCREEN_WIDTH - 14 * 2 - 66 - 10;
// Height of the pill and the detached circle; also sizes the scrim behind them.
const NAV_PILL_HEIGHT = 66;
// Icons-only height while scroll-compacted (Instagram-style shrink).
const NAV_PILL_COMPACT_HEIGHT = 48;
// …and its width. Compacting only the height left the four icons stranded at
// their expanded spacing, so the bar looked like it had merely lost its labels
// rather than contracted. 52pt per tab keeps every touch target comfortably
// above the 44pt minimum while pulling the icons visibly together; navRow is
// right-anchored, so the pill contracts toward the circle instead of drifting.
const NAV_PILL_COMPACT_WIDTH = Math.min(NAV_PILL_WIDTH, 4 * 52 + 12);

// Content height of the full-width bar styles, above the safe-area padding.
const NAV_BAR_HEIGHT = 58;

// Real Apple Liquid Glass (iOS 26+); elsewhere we use a blur fallback.
const HAS_LIQUID_GLASS = (() => {
    try {
        return isLiquidGlassAvailable();
    } catch {
        return false;
    }
})();

// Safe-area padding under the full-width bar. Android's gesture inset can be
// 0, so keep a floor there; iOS's home-indicator inset is already generous.
function getBarBottomPad(bottomInset: number): number {
    return Platform.OS === "ios" ? bottomInset : Math.max(bottomInset, 6);
}

// Where the create speed-dial should start fanning out, i.e. just above
// whatever the current style uses as the Plus button.
function getCreateDialBottom(style: NavBarStyle, bottomInset: number): number {
    if (style === "glass") return Math.max(bottomInset, 10) + 76;
    const barTop = getBarBottomPad(bottomInset) + NAV_BAR_HEIGHT;
    switch (style) {
        case "fab":
            return barTop + 14 + 60 + 10;   // clears the floating button
        case "center":
            return barTop + 46;             // clears the raised button
        default:
            return barTop + 10;             // 'tabs': the button is in the bar
    }
}

// ─── Badge Component ─────────────────────────────────────────────────────────
function Badge({ count, isDark }: { count?: number | "!"; isDark: boolean }) {
    const { t } = useTranslation('home');
    if (count === undefined || count === null) return null;
    const label = typeof count === "number" ? (count > 99 ? t('tabs.badgeOverflow') : String(count)) : count;
    return (
        <View style={[styles.badge, { borderColor: isDark ? "#1E293B" : "#FFFFFF" }]}>
            <Text style={styles.badgeText}>{label}</Text>
        </View>
    );
}

// ─── Tab Item ─────────────────────────────────────────────────────────────────
// Standard iOS UITabBar / Telegram item: icon over a small label, tinted with
// the accent when active and neutral gray otherwise.
function TabItem({
    icon: Icon,
    label,
    color,
    isActive,
    highlight,
    badge,
    onPress,
    isDark,
    compact,
}: {
    icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
    label: string;
    color: string;
    isActive: boolean;
    highlight?: string;
    badge?: number | "!";
    onPress: () => void;
    isDark: boolean;
    /** 0→1 pill-compaction progress (Instagram-style shrink); labels fade+collapse. */
    compact?: SharedValue<number>;
}) {
    // Label melts away as the pill compacts: fades first, then gives up its
    // height so the icon re-centers in the shorter pill.
    const labelStyle = useAnimatedStyle(() => {
        const p = compact?.value ?? 0;
        return {
            opacity: interpolate(p, [0, 0.6], [1, 0], Extrapolation.CLAMP),
            height: interpolate(p, [0, 1], [14, 0], Extrapolation.CLAMP),
            marginTop: interpolate(p, [0, 1], [4, 0], Extrapolation.CLAMP),
        };
    });

    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.6}
            style={styles.tabItem}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={label}
        >
            {isActive && (
                <View
                    pointerEvents="none"
                    style={[styles.tabActiveBubble, { backgroundColor: highlight }]}
                />
            )}
            <View style={styles.tabIconWrap}>
                <Icon size={24} color={color} strokeWidth={isActive ? 2.4 : 1.9} />
                <Badge count={badge} isDark={isDark} />
            </View>
            <ReAnimated.View style={labelStyle}>
                <Text
                    style={[styles.tabLabel, { color, fontWeight: isActive ? "700" : "600" }]}
                    numberOfLines={1}
                >
                    {label}
                </Text>
            </ReAnimated.View>
        </TouchableOpacity>
    );
}

// ─── Edutu AI Button ──────────────────────────────────────────────────────────
function HeaderLogoTitle({
    color,
    isDark,
}: {
    color: string;
    isDark: boolean;
}) {
    const finalTitle = 'Edutu';

    return (
        // Lighter in light mode: dark-on-white reads much heavier than
        // white-on-dark at the same weight, so 900 looked over-bold on light.
        <Text style={[styles.brandText, { color, fontWeight: isDark ? '900' : '700' }]} numberOfLines={1}>
            {finalTitle}
        </Text>
    );
}

// ─── Shared App Header ────────────────────────────────────────────────────────
function AppHeader({ isDark, colors, unreadNotifications, guestMode, onGuestBlock }: { isDark: boolean, colors: any, unreadNotifications: number, guestMode?: boolean, onGuestBlock?: () => void }) {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const accentColor = colors.accent || "#6366F1";
    const { t } = useTranslation('home');
    const { user } = useUser();
    const { isPro, isLoading: proLoading } = useProStatus(supabase, user?.id || null);
    const [menuOpen, setMenuOpen] = useState(false);

    // For guests every header destination (menu, notifications, upgrade) lives
    // behind the wall — raise it instead of navigating.
    const guardGuest = (proceed: () => void) => () => {
        if (guestMode) {
            onGuestBlock?.();
            return;
        }
        proceed();
    };

    return (
        <View style={[
            styles.headerOuter,
            {
                backgroundColor: colors.background,
                paddingTop: insets.top,
                elevation: 10,
            }
        ]}>
            <View style={styles.headerInner}>
                <View style={styles.brandContainer}>
                    <TouchableOpacity
                        onPress={guardGuest(() => setMenuOpen(true))}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={t('header.menu', { defaultValue: 'Open menu' })}
                        style={[styles.menuBtn, { backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)" }]}
                    >
                        <Menu size={20} color={accentColor} strokeWidth={2} />
                    </TouchableOpacity>
                    <EdutuLogo size={36} frameless />
                    <HeaderLogoTitle
                        color={isDark ? "#FFFFFF" : "#0F172A"}
                        isDark={isDark}
                    />
                    {!proLoading && (isPro ? (
                        <BadgeCheck
                            size={18}
                            color="#FFFFFF"
                            fill="#3B82F6"
                            accessibilityLabel={t('header.verified')}
                        />
                    ) : (
                        <TouchableOpacity
                            onPress={guardGuest(() => router.push('/paywall'))}
                            activeOpacity={0.75}
                            accessibilityRole="button"
                            accessibilityLabel={t('header.upgrade')}
                            style={[styles.upgradePill, { backgroundColor: isDark ? "rgba(245,158,11,0.16)" : "rgba(245,158,11,0.12)" }]}
                        >
                            <Crown size={13} color="#F59E0B" />
                            <Text style={styles.upgradePillText}>{t('header.upgrade')}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                <TouchableOpacity
                    onPress={guardGuest(() => router.push('/notifications'))}
                    activeOpacity={0.7}
                    style={[styles.bellBtn, { backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)" }]}
                >
                    <Bell size={20} color={accentColor} strokeWidth={2} />
                    {unreadNotifications > 0 && <View style={[styles.bellBadge, { borderColor: colors.background }]} />}
                </TouchableOpacity>
            </View>

            <FeatureMenu
                visible={menuOpen}
                onClose={() => setMenuOpen(false)}
                isDark={isDark}
                colors={colors}
            />
        </View>
    );
}

// ─── Contextual Morphing Nav Circle ──────────────────────────────────────────
// The detached circle next to the tab pill. Instead of always being the AI
// button, it morphs per tab: AI (home), tinted AI (Discover), a Plus that
// creates goals/roadmaps (Plan), and an Edit-profile pencil (Me). On context
// change it shrinks/rotates out, then springs back in sliding toward the
// right-hand corner with the new icon.
export type NavCircleKind = "ai" | "ai-discover" | "create" | "edit";

interface NavCircleAction {
    kind: NavCircleKind;
    target: string;
}

export function isAiKind(kind: NavCircleKind): boolean {
    return kind === "ai" || kind === "ai-discover";
}

// Shared by the detached circle and the in-bar action item ('tabs' style), so
// the two can't drift apart. Plain function, not a component — it hooks into
// nothing, callers pass everything in.
function navActionIcon(
    kind: NavCircleKind,
    color: string,
    size: number,
    // Solid/filled buttons want a filled spark; on bare glass it stays an
    // outline so it sits at the same visual weight as the Lucide tab icons.
    filled = false,
) {
    switch (kind) {
        case "create":
            return <Plus size={size + 2} color={color} strokeWidth={2.8} />;
        case "edit":
            return <Pencil size={size - 2} color={color} strokeWidth={2.4} />;
        default:
            // A line illustration, not the colourful orb: at nav size the orb's
            // gradients read as a coloured blob next to the monochrome tab
            // icons. The spark inherits the bar's colour instead — see
            // AiSparkGlyph's docblock. The orb still owns voice mode itself.
            // 1.25× so the spark carries the 66px circle without crowding it,
            // and still fits the 34px in-bar icon slot.
            return <AiSparkGlyph size={Math.round(size * 1.25)} color={color} filled={filled} />;
    }
}

/** Full, spoken-length label — accessibility and the circle. */
function navActionLabelKey(kind: NavCircleKind): string {
    switch (kind) {
        case "create":
            return "tabs.createNew";
        case "edit":
            return "tabs.editProfile";
        default:
            return "tabs.openEdutuAi";
    }
}

/** Terse label that fits under an icon in the bar. */
function navActionShortLabelKey(kind: NavCircleKind): string {
    switch (kind) {
        case "create":
            return "tabs.createShort";
        case "edit":
            return "tabs.editShort";
        default:
            return "tabs.aiShort";
    }
}

function MorphingNavCircle({
    action,
    hidden,
    accent,
    solidColor,
    glassBackground,
    onPress,
    dialOpen = false,
    size = 66,
    filled = false,
    reducedMotion = false,
}: {
    action: NavCircleAction;
    hidden: boolean;
    accent: string;
    solidColor: string;
    isDark: boolean;
    glassBackground: (rounded: number) => React.ReactNode;
    onPress: (action: NavCircleAction) => void;
    dialOpen?: boolean;
    /** Diameter. The raised centre button is smaller than the detached one. */
    size?: number;
    /** Bar styles fill the button with the accent instead of glass. */
    filled?: boolean;
    reducedMotion?: boolean;
}) {
    const { t } = useTranslation('home');
    const [shown, setShown] = useState<NavCircleAction>(action);
    const latestAction = useRef(action);
    // Render-time ref writes are unsafe under concurrent rendering; sync
    // post-commit — the only reader is an animation completion callback.
    useEffect(() => {
        latestAction.current = action;
    });

    const morph = useAnimatedValue(1);   // 0 = collapsed mid-swap
    const slide = useAnimatedValue(0);   // slide-in from the pill side
    const reveal = useAnimatedValue(hidden ? 0 : 1); // scroll hide/show

    // Plus → X rotation while the create speed-dial (owned by the layout) is open.
    const dial = useAnimatedValue(0);
    useEffect(() => {
        Animated.spring(dial, { toValue: dialOpen ? 1 : 0, friction: 7, tension: 120, useNativeDriver: true }).start();
    }, [dialOpen, dial]);

    useEffect(() => {
        if (action.kind === shown.kind) return;
        // Small lead-in so the pill's tabs are mid-absorption before the icon
        // swaps — the new glyph lands right as the bar finishes compressing.
        Animated.sequence([
            Animated.delay(90),
            Animated.timing(morph, {
                toValue: 0,
                duration: 120,
                useNativeDriver: true,
            }),
        ]).start(({ finished }) => {
            if (!finished) return;
            setShown(latestAction.current);
            slide.setValue(-14);
            haptics.light();
            Animated.parallel([
                Animated.spring(morph, { toValue: 1, friction: 6, tension: 140, useNativeDriver: true }),
                Animated.spring(slide, { toValue: 0, friction: 7, tension: 90, useNativeDriver: true }),
            ]).start();
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [action.kind, shown.kind]);

    useEffect(() => {
        if (hidden) {
            // Tuck away quickly and quietly while the user scrolls…
            Animated.timing(reveal, {
                toValue: 0,
                duration: 180,
                useNativeDriver: true,
            }).start();
        } else {
            // …and bounce back with a touch of life when they return.
            Animated.spring(reveal, {
                toValue: 1,
                friction: 7,
                tension: 120,
                useNativeDriver: true,
            }).start();
        }
    }, [hidden, reveal]);

    // Render the live action while kinds match so target/theme updates apply
    // without re-triggering the morph.
    const active = shown.kind === action.kind ? action : shown;
    const isAI = isAiKind(active.kind);

    // ── Press feel + hold-charge (Reanimated, layered on top of the legacy
    // Animated morph/slide/reveal above — this only ever adds a scale on the
    // button's own wrapper, so it composes rather than fights). A tap dips
    // the circle down like any other press; on AI kinds the same gesture
    // then keeps gathering into a slight swell for the 280ms hold so the
    // user can see the long-press registering, and a decisive extra swell
    // marks the hand-off into voice mode. Released early or dragged out —
    // TouchableOpacity fires onPressOut for both — it eases straight back to
    // rest. Skipped entirely under reducedMotion: no charge, no swell, the
    // action just fires.
    const press = useSharedValue(1);
    const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
    // Set by handleTriggerVoice, cleared by handlePressOut: the finger is
    // almost always still down when the 280ms long-press fires, so it lifts
    // ~80ms later — right in the middle of the "become the orb" swell below.
    // Without this guard, that lift's onPressOut immediately overwrites
    // `press` with its own reset animation, truncating the swell to a
    // fraction of its arc. When the flag is set, onPressOut just clears it
    // and leaves the swell alone to finish on its own.
    const triggeredRef = useRef(false);

    const handlePressIn = () => {
        if (reducedMotion) return;
        if (isAI) {
            // eslint-disable-next-line react-hooks/immutability -- Reanimated SharedValue write; the library's documented imperative API
            press.value = withSequence(
                withTiming(0.96, { duration: 90, easing: Easing.out(Easing.quad) }),
                withTiming(1.07, { duration: 190, easing: Easing.out(Easing.cubic) }),
            );
        } else {
            press.value = withTiming(0.96, { duration: 90, easing: Easing.out(Easing.quad) });
        }
    };
    const handlePressOut = () => {
        if (triggeredRef.current) {
            triggeredRef.current = false;
            return;
        }
        if (reducedMotion) return;
        // eslint-disable-next-line react-hooks/immutability -- Reanimated SharedValue write; the library's documented imperative API
        press.value = withTiming(1, { duration: 150, easing: Easing.out(Easing.cubic) });
    };
    const handleTriggerVoice = () => {
        triggeredRef.current = true;
        haptics.medium();
        if (!reducedMotion) {
            // The circle becomes the orb — a decisive swell, then settle.
            // eslint-disable-next-line react-hooks/immutability -- Reanimated SharedValue write; the library's documented imperative API
            press.value = withSequence(
                withTiming(1.18, { duration: 160, easing: Easing.out(Easing.cubic) }),
                withTiming(1, { duration: 180, easing: Easing.out(Easing.cubic) }),
            );
        }
        openVoiceMode('voice');
    };

    // A bar-style button is a conventional filled FAB — accent through, white
    // glyph. The glass pill's button only tints for create/edit and leaves the
    // AI sparkle sitting on bare glass.
    const overlayColor = filled
        ? solidColor
        : active.kind === "create" || active.kind === "edit"
            ? `${solidColor}F0`
            : active.kind === "ai-discover"
                ? `${solidColor}2E`
                : null;

    const icon = navActionIcon(active.kind, filled || !isAI ? "#FFFFFF" : accent, 24, filled);
    const label = t(navActionLabelKey(active.kind));

    const scale = morph.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });
    const rotate = morph.interpolate({ inputRange: [0, 1], outputRange: ["-60deg", "0deg"] });
    const plusRotate = dial.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "45deg"] });

    return (
        <Animated.View
            pointerEvents={hidden ? "none" : "auto"}
            style={{
                opacity: Animated.multiply(morph, reveal),
                transform: [
                    { translateX: slide },
                    { scale: Animated.multiply(scale, reveal) },
                    { rotate },
                ],
            }}
        >
            <ReAnimated.View style={pressStyle}>
                <TouchableOpacity
                    onPress={() => {
                        haptics.light();
                        onPress(latestAction.current);
                    }}
                    onPressIn={handlePressIn}
                    onPressOut={handlePressOut}
                    onLongPress={isAI ? handleTriggerVoice : undefined}
                    delayLongPress={280}
                    activeOpacity={0.85}
                    style={[styles.navCircle, { width: size, height: size, borderRadius: size / 2 }]}
                    accessibilityRole="button"
                    accessibilityLabel={label}
                    accessibilityHint={isAI ? t('tabs.holdForVoice') : undefined}
                >
                    {/* A filled button is opaque accent through, so the blur would
                        render only to be covered — skip the cost entirely. */}
                    {!filled && glassBackground(999)}
                    {overlayColor && (
                        <View
                            pointerEvents="none"
                            style={[StyleSheet.absoluteFill, { backgroundColor: overlayColor, borderRadius: 999 }]}
                        />
                    )}
                    {active.kind === "create" ? (
                        <Animated.View style={{ transform: [{ rotate: plusRotate }] }}>{icon}</Animated.View>
                    ) : (
                        icon
                    )}
                </TouchableOpacity>
            </ReAnimated.View>
        </Animated.View>
    );
}

// ─── In-Bar Action Item ───────────────────────────────────────────────────────
// The 'tabs' style has nothing floating, so the contextual action rides inside
// the bar as an ordinary item. Same icon, same long-press-for-voice, tinted
// with the accent so it still reads as the primary action.
function BarActionItem({
    action,
    accent,
    onPress,
    reducedMotion = false,
}: {
    action: NavCircleAction;
    accent: string;
    onPress: (action: NavCircleAction) => void;
    reducedMotion?: boolean;
}) {
    const { t } = useTranslation('home');
    const isAI = isAiKind(action.kind);
    const label = t(navActionShortLabelKey(action.kind));

    // Same press-feel/hold-charge contract as MorphingNavCircle — see its
    // comment for the full rationale. Kept in lockstep so the 'tabs' style
    // doesn't feel like a different button.
    const press = useSharedValue(1);
    const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
    // Set by handleTriggerVoice, cleared by handlePressOut — see
    // MorphingNavCircle's `triggeredRef` comment; identical fix, kept in
    // lockstep so both buttons finish the "become the orb" swell the same way.
    const triggeredRef = useRef(false);

    const handlePressIn = () => {
        if (reducedMotion) return;
        if (isAI) {
            // eslint-disable-next-line react-hooks/immutability -- Reanimated SharedValue write; the library's documented imperative API
            press.value = withSequence(
                withTiming(0.96, { duration: 90, easing: Easing.out(Easing.quad) }),
                withTiming(1.07, { duration: 190, easing: Easing.out(Easing.cubic) }),
            );
        } else {
            press.value = withTiming(0.96, { duration: 90, easing: Easing.out(Easing.quad) });
        }
    };
    const handlePressOut = () => {
        if (triggeredRef.current) {
            triggeredRef.current = false;
            return;
        }
        if (reducedMotion) return;
        // eslint-disable-next-line react-hooks/immutability -- Reanimated SharedValue write; the library's documented imperative API
        press.value = withTiming(1, { duration: 150, easing: Easing.out(Easing.cubic) });
    };
    const handleTriggerVoice = () => {
        triggeredRef.current = true;
        haptics.medium();
        if (!reducedMotion) {
            // eslint-disable-next-line react-hooks/immutability -- Reanimated SharedValue write; the library's documented imperative API
            press.value = withSequence(
                withTiming(1.18, { duration: 160, easing: Easing.out(Easing.cubic) }),
                withTiming(1, { duration: 180, easing: Easing.out(Easing.cubic) }),
            );
        }
        openVoiceMode('voice');
    };

    return (
        <ReAnimated.View style={[{ flex: 1 }, pressStyle]}>
            <TouchableOpacity
                onPress={() => {
                    haptics.light();
                    onPress(action);
                }}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                onLongPress={isAI ? handleTriggerVoice : undefined}
                delayLongPress={280}
                activeOpacity={0.6}
                style={styles.tabItem}
                accessibilityRole="button"
                accessibilityLabel={t(navActionLabelKey(action.kind))}
                accessibilityHint={isAI ? t('tabs.holdForVoice') : undefined}
            >
                <View style={styles.tabIconWrap}>
                    {navActionIcon(action.kind, accent, 24)}
                </View>
                <Text style={[styles.tabLabel, { color: accent, fontWeight: "700" }]} numberOfLines={1}>
                    {label}
                </Text>
            </TouchableOpacity>
        </ReAnimated.View>
    );
}

// ─── Create Speed-Dial ────────────────────────────────────────────────────────
// "What do you want to create?" — fans out Goal / Roadmap options above the
// Plan tab's Plus circle. Rendered at the layout root (not inside the nav row)
// so Android still delivers touches, with a full-screen backdrop to dismiss.
function CreateSpeedDial({
    open,
    bottom,
    solidColor,
    onSelect,
    onClose,
}: {
    open: boolean;
    bottom: number;
    solidColor: string;
    onSelect: (target: string) => void;
    onClose: () => void;
}) {
    const { t } = useTranslation('home');
    const dial = useAnimatedValue(0);
    const [rendered, setRendered] = useState(open);

    // Adjust-during-render: mount the dial the same render `open` flips true
    // (the un-mount waits for the collapse animation in the effect below).
    const [prevOpen, setPrevOpen] = useState(open);
    if (prevOpen !== open) {
        setPrevOpen(open);
        if (open) setRendered(true);
    }

    useEffect(() => {
        if (open) {
            haptics.light();
            Animated.spring(dial, { toValue: 1, friction: 7, tension: 120, useNativeDriver: true }).start();
        } else {
            Animated.timing(dial, { toValue: 0, duration: 150, useNativeDriver: true }).start(({ finished }) => {
                if (finished) setRendered(false);
            });
        }
    }, [open, dial]);

    if (!rendered) return null;

    const options = [
        { key: "goal", label: t('tabs.createGoal', 'Goal'), Icon: Target, target: "/goals/add" },
        { key: "roadmap", label: t('tabs.createRoadmap', 'Roadmap'), Icon: Route, target: "/creator-dashboard" },
    ];

    return (
        <View style={StyleSheet.absoluteFill} pointerEvents={open ? "auto" : "none"}>
            <TouchableOpacity
                activeOpacity={1}
                onPress={onClose}
                style={StyleSheet.absoluteFill}
                accessibilityLabel={t('tabs.closeCreateMenu', 'Close create menu')}
            />
            <View pointerEvents="box-none" style={[styles.dialWrap, { bottom }]}>
                <Animated.Text
                    style={[
                        styles.dialPrompt,
                        { opacity: dial, transform: [{ translateY: dial.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] },
                    ]}
                >
                    {t('tabs.createPrompt', 'What do you want to create?')}
                </Animated.Text>
                {options.map((option, i) => {
                    // Stagger: later options animate over the tail of the same value.
                    const progress = dial.interpolate({ inputRange: [i * 0.15, 1], outputRange: [0, 1], extrapolate: "clamp" });
                    return (
                        <Animated.View
                            key={option.key}
                            style={{
                                opacity: progress,
                                transform: [
                                    { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [14 * (options.length - i), 0] }) },
                                    { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
                                ],
                            }}
                        >
                            <TouchableOpacity
                                onPress={() => {
                                    haptics.light();
                                    onSelect(option.target);
                                }}
                                activeOpacity={0.85}
                                style={[styles.dialOption, { backgroundColor: `${solidColor}F0` }]}
                                accessibilityRole="button"
                                accessibilityLabel={option.label}
                            >
                                <option.Icon size={18} color="#FFFFFF" strokeWidth={2.4} />
                                <Text style={styles.dialOptionText}>{option.label}</Text>
                            </TouchableOpacity>
                        </Animated.View>
                    );
                })}
            </View>
        </View>
    );
}

// ─── Bottom Navigation Bar ────────────────────────────────────────────────────
// Exported as a seam so the four nav styles can be rendered under test without
// standing up the whole authenticated layout.
export function BottomNav({
    tabs,
    activeRoute,
    onTabPress,
    circleAction,
    circleHidden,
    onCirclePress,
    createDialOpen,
    isDark,
    colors,
    reducedMotion = false,
}: {
    tabs: Array<{
        key: string;
        route: string;
        label: string;
        icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
        badge?: number | "!";
    }>;
    activeRoute: string;
    onTabPress: (key: string, route: string) => void;
    circleAction: NavCircleAction;
    circleHidden: boolean;
    onCirclePress: (action: NavCircleAction) => void;
    createDialOpen: boolean;
    isDark: boolean;
    colors: any;
    reducedMotion?: boolean;
}) {
    const insets = useSafeAreaInsets();
    const { style: navBarStyle } = useNavStyleSettings();
    const isBar = isBarStyle(navBarStyle);
    // Brighter accent + higher-contrast inactive so labels stay legible on the
    // translucent glass over dark content.
    const accent = isDark ? "#A5B4FC" : (colors.accent || "#4F46E5");
    const inactive = isDark ? "#C7CCD4" : "#5B6472";
    const glassTint = isDark
        ? (Platform.OS === "android" ? "rgba(22,24,34,0.94)" : "rgba(20,22,32,0.72)")
        // Light: a faintly cool frost (not pure white) so the bar reads as a
        // surface over white content instead of vanishing into it.
        : (Platform.OS === "android" ? "rgba(255,255,255,0.96)" : "rgba(246,248,252,0.82)");
    // A defined edge is what separates floating glass from bright content in
    // light mode (Liquid Glass leans on the rim, not opacity). Stronger in light.
    const borderCol = isDark ? "rgba(255,255,255,0.14)" : "rgba(15,23,42,0.14)";
    // Specular top highlight — the edge-lit sheen that reads as "glass".
    const specularCol = isDark ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.9)";
    const activeBubble = isDark ? "rgba(129,140,248,0.30)" : "rgba(79,70,229,0.14)";

    // Shared glass background for the pill and the detached circle.
    const glassBackground = (rounded: number) =>
        HAS_LIQUID_GLASS ? (
            <GlassView
                style={StyleSheet.absoluteFill}
                glassEffectStyle="regular"
                isInteractive
                colorScheme={isDark ? "dark" : "light"}
            />
        ) : (
            <>
                <BlurView
                    intensity={isDark ? 40 : 72}
                    tint={isDark ? "systemChromeMaterialDark" : "systemChromeMaterialLight"}
                    experimentalBlurMethod={Platform.OS === "android" ? "dimezisBlurView" : undefined}
                    style={StyleSheet.absoluteFill}
                />
                <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: glassTint }]} />
                {/* Defined outer edge — the main separator from bright content. */}
                <View
                    pointerEvents="none"
                    style={[
                        StyleSheet.absoluteFillObject,
                        { borderRadius: rounded, borderCurve: "continuous", borderWidth: 1, borderColor: borderCol },
                    ]}
                />
                {/* Specular top rim — the edge-lit sheen that sells it as glass. */}
                <View
                    pointerEvents="none"
                    style={[
                        StyleSheet.absoluteFillObject,
                        { borderRadius: rounded, borderCurve: "continuous", borderTopWidth: 1.5, borderColor: specularCol },
                    ]}
                />
            </>
        );

    // ── Collapse choreography (iOS Safari-style minimize) ────────────────────
    // Home shows the full tab pill. On Discover / Plan / Me the pill
    // compresses toward the right-hand corner: its width springs to zero while
    // the tabs — anchored to the pill's shrinking left edge — slide right and
    // are swallowed one by one by the circle, which swells as it "catches"
    // them and lands on the contextual icon. The bar styles are static: no
    // collapse, every tab always visible.
    const isCollapsed = !isBar && circleAction.kind !== "ai";
    const collapse = useSharedValue(isCollapsed ? 1 : 0);

    useEffect(() => {
        collapse.value = withSpring(isCollapsed ? 1 : 0, {
            damping: 26,
            stiffness: 230,
            mass: 1,
        });
    }, [isCollapsed, collapse]);

    // Instagram-style scroll compaction: scrolling down shrinks the pill to a
    // slim icons-only bar (labels fade+collapse in TabItem); scrolling up or
    // reaching the top restores it. Driven by whichever screen feeds
    // navScrollStore; rides its own spring so it can overlap the collapse one.
    const navCompact = useNavCompact();
    const compactV = useSharedValue(0);
    useEffect(() => {
        compactV.value = withSpring(navCompact ? 1 : 0, {
            damping: 20,
            stiffness: 210,
            mass: 0.9,
        });
    }, [navCompact, compactV]);

    const pillStyle = useAnimatedStyle(() => {
        // The compacted width is the pill's new "expanded" size, which the
        // collapse spring then takes to 0 on a tab change. Composed rather than
        // interpolated separately so the two springs can overlap without one
        // snapping the width back mid-flight.
        const openWidth = interpolate(
            compactV.value,
            [0, 1],
            [NAV_PILL_WIDTH, NAV_PILL_COMPACT_WIDTH],
            Extrapolation.CLAMP,
        );
        return {
            width: interpolate(collapse.value, [0, 1], [openWidth, 0], Extrapolation.CLAMP),
            opacity: interpolate(collapse.value, [0.55, 0.92], [1, 0], Extrapolation.CLAMP),
            height: interpolate(compactV.value, [0, 1], [NAV_PILL_HEIGHT, NAV_PILL_COMPACT_HEIGHT], Extrapolation.CLAMP),
            borderRadius: interpolate(compactV.value, [0, 1], [NAV_PILL_HEIGHT / 2, NAV_PILL_COMPACT_HEIGHT / 2], Extrapolation.CLAMP),
        };
    });

    // The scrim exists to keep content from colliding with the tabs, so it
    // scales back with them: once the pill has collapsed to just the circle
    // there is far less chrome to separate, and a full-strength wash reads as
    // a bug. Rides the same spring so it never pops.
    const scrimStyle = useAnimatedStyle(() => ({
        opacity: interpolate(collapse.value, [0, 1], [1, 0.42], Extrapolation.CLAMP),
    }));

    const scrimHeight = Math.max(insets.bottom, 10) + NAV_PILL_HEIGHT + 20;

    // Tabs fade ahead of the clip so nothing gets sliced mid-glyph. The row
    // carries the same compacted width as the pill — without it the row keeps
    // its expanded width inside an `overflow: hidden` pill and the outer tabs
    // are clipped away instead of moving closer. tabItem is flex:1, so the
    // icons redistribute across the narrower row on their own.
    const pillContentStyle = useAnimatedStyle(() => ({
        opacity: interpolate(collapse.value, [0, 0.6], [1, 0], Extrapolation.CLAMP),
        width: interpolate(
            compactV.value,
            [0, 1],
            [NAV_PILL_WIDTH, NAV_PILL_COMPACT_WIDTH],
            Extrapolation.CLAMP,
        ),
    }));

    const circleSwellStyle = useAnimatedStyle(() => ({
        transform: [
            {
                scale:
                    interpolate(collapse.value, [0, 0.7, 1], [1, 1.08, 1], Extrapolation.CLAMP) *
                    // Shrink alongside the compact pill so the pair reads as one bar.
                    interpolate(compactV.value, [0, 1], [1, 0.86], Extrapolation.CLAMP),
            },
        ],
    }));

    // ── Conventional full-width bar ('fab' / 'tabs' / 'center') ──────────────
    // Flush to the bottom edge, square corners, hairline on top. The three
    // variants differ only in where the contextual action sits.
    if (isBar) {
        const barPad = getBarBottomPad(insets.bottom);
        const circle = (
            <MorphingNavCircle
                action={circleAction}
                // Scroll-hiding only makes sense for something floating over the
                // content. The raised centre button is part of the bar — hiding
                // it would leave a hole between the tabs.
                hidden={navBarStyle === "fab" && circleHidden}
                accent={accent}
                solidColor={colors.accent || "#6366F1"}
                isDark={isDark}
                glassBackground={glassBackground}
                onPress={onCirclePress}
                dialOpen={createDialOpen}
                size={navBarStyle === "center" ? 58 : 60}
                filled
                reducedMotion={reducedMotion}
            />
        );

        const tabItems = tabs.map((tab) => (
            <TabItem
                key={tab.key}
                icon={tab.icon}
                label={tab.label}
                color={activeRoute === tab.key ? accent : inactive}
                isActive={activeRoute === tab.key}
                highlight={activeBubble}
                badge={tab.badge}
                onPress={() => onTabPress(tab.key, tab.route)}
                isDark={isDark}
            />
        ));

        return (
            <>
                {navBarStyle === "fab" && (
                    <View
                        pointerEvents="box-none"
                        style={[styles.barFabWrap, { bottom: barPad + NAV_BAR_HEIGHT + 14 }]}
                    >
                        {circle}
                    </View>
                )}
                <View
                    testID="nav-bar-surface"
                    style={[
                        styles.solidBar,
                        {
                            paddingBottom: barPad,
                            backgroundColor: colors.card || (isDark ? "#0F172A" : "#FFFFFF"),
                            borderTopColor: colors.border || borderCol,
                        },
                    ]}
                >
                    {navBarStyle === "center" && (
                        <View pointerEvents="box-none" style={styles.barCenterWrap}>
                            {circle}
                        </View>
                    )}
                    <View style={styles.solidBarRow}>
                        {navBarStyle === "center" ? (
                            <>
                                {tabItems.slice(0, 2)}
                                {/* Well the raised button sits in. */}
                                <View pointerEvents="none" style={styles.barCenterGap} />
                                {tabItems.slice(2)}
                            </>
                        ) : (
                            tabItems
                        )}
                        {navBarStyle === "tabs" && (
                            <BarActionItem
                                action={circleAction}
                                accent={accent}
                                onPress={onCirclePress}
                                reducedMotion={reducedMotion}
                            />
                        )}
                    </View>
                </View>
            </>
        );
    }

    return (
        <>
            {/* The pill floats over live content, so without this the list runs
                sharp and legible straight off the bottom edge and competes with
                the tabs. Fades the page out behind and below the pill.
                Stops are rgba(bg) — NOT 'transparent', which interpolates
                through black on iOS and leaves a grey haze. */}
            <ReAnimated.View
                pointerEvents="none"
                style={[styles.navScrim, { height: scrimHeight }, scrimStyle]}
            >
                <BottomScrimView
                    height={scrimHeight}
                    base={colors.background}
                    isDark={isDark}
                />
            </ReAnimated.View>
            <View
                testID="nav-pill-surface"
                style={[styles.navRow, { bottom: Math.max(insets.bottom, 10) }]}
                pointerEvents="box-none"
            >
            {/* Main floating glass pill with the tabs; compresses into the circle */}
            <ReAnimated.View
                style={[styles.navPill, pillStyle]}
                pointerEvents={isCollapsed ? "none" : "auto"}
            >
                {glassBackground(32)}
                <ReAnimated.View
                    style={[styles.navPillRow, { width: NAV_PILL_WIDTH }, pillContentStyle]}
                >
                    {tabs.map((tab) => {
                        const isActive = activeRoute === tab.key;
                        return (
                            <TabItem
                                key={tab.key}
                                icon={tab.icon}
                                label={tab.label}
                                color={isActive ? accent : inactive}
                                isActive={isActive}
                                highlight={activeBubble}
                                badge={tab.badge}
                                onPress={() => onTabPress(tab.key, tab.route)}
                                isDark={isDark}
                                compact={compactV}
                            />
                        );
                    })}
                </ReAnimated.View>
            </ReAnimated.View>

            {/* Detached glass circle — a contextual action that morphs per tab.
                Home: Edutu AI (tap = chat, hold = voice). Discover: tinted AI.
                Plan: create goal/roadmap. Me: edit profile (hides on scroll). */}
            <ReAnimated.View style={circleSwellStyle}>
                <MorphingNavCircle
                    action={circleAction}
                    hidden={circleHidden}
                    accent={accent}
                    solidColor={colors.accent || "#6366F1"}
                    isDark={isDark}
                    glassBackground={glassBackground}
                    onPress={onCirclePress}
                    dialOpen={createDialOpen}
                    reducedMotion={reducedMotion}
                />
            </ReAnimated.View>
            </View>
        </>
    );
}

// ─── Daily Login Credit Claim ───────────────────────────────────────────────
// Runs inside <ToastProvider> so it can surface the reward toast. Fires once
// per mount (ref-guarded) when the user is signed in.
function DailyLoginRewards() {
    const { isSignedIn, userId } = useAuth();
    const { show } = useToast();
    const { t } = useTranslation('home');
    const claimedForUserRef = React.useRef<string | null>(null);

    const { claimDaily } = useCreditRewards(supabase, userId ?? null, {
        onEarned: (amount, label) => {
            show({
                emoji: "🔥",
                variant: "success",
                message: t('rewards.creditsEarned', { count: amount, label }),
            });
        },
    });

    useEffect(() => {
        if (!isSignedIn || !userId || claimedForUserRef.current === userId) {
            return;
        }
        claimedForUserRef.current = userId;
        void claimDaily();
    }, [isSignedIn, userId, claimDaily]);

    return null;
}

// ─── Referral Redemption ────────────────────────────────────────────────────
// Redeems a referral code captured before the account existed (deep link or
// the signup field, stashed in AsyncStorage). Runs once per signed-in user;
// clears the stash on any terminal response so it never retries a bad code.
// The reward itself settles server-side when the user completes their profile.
function ReferralRedemption() {
    const { isSignedIn, userId } = useAuth();
    const { show } = useToast();
    const { t } = useTranslation('home');
    const redeemedForUserRef = React.useRef<string | null>(null);

    useEffect(() => {
        if (!isSignedIn || !userId || redeemedForUserRef.current === userId) {
            return;
        }
        redeemedForUserRef.current = userId;
        void (async () => {
            try {
                const code = await AsyncStorage.getItem(PENDING_REFERRAL_KEY);
                if (!code) return;
                const status = await redeemReferral(supabase, code);
                if (isTerminalRedeemStatus(status)) {
                    await AsyncStorage.removeItem(PENDING_REFERRAL_KEY);
                }
                if (status === 'pending') {
                    show({
                        emoji: '🎁',
                        variant: 'success',
                        message: t('referral.redeemed', {
                            defaultValue:
                                "Referral applied! Finish your profile and you'll both earn credits.",
                        }),
                    });
                }
            } catch (err) {
                console.warn('Referral redemption failed:', err);
            }
        })();
    }, [isSignedIn, userId, show, t]);

    return null;
}

// ─── Root Layout ──────────────────────────────────────────────────────────────
export default function AppLayout() {
    const { t } = useTranslation('home');
    const { isSignedIn, isLoaded, getToken, userId } = useAuth();
    const { user } = useUser();
    const { isDark, colors, reducedMotion } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const pathname = usePathname();
    const params = useGlobalSearchParams<{ category?: string }>();
    const { unreadCount } = useNotifications(supabase, user?.id ?? null, getToken);
    const registeredPushUserRef = React.useRef<string | null>(null);

    // Guest ("browse without login") gating. A guest has no Clerk session, so
    // isSignedIn is false; the local flag is what lets them into the app at all.
    const { isGuest, hydrated: guestHydrated } = useGuestMode();
    const authWall = useAuthWall();
    const isGuestBrowsing = !isSignedIn && isGuest;
    const guestBlocked =
        isGuestBrowsing && guestHydrated && !isGuestAllowedPath(pathname);

    // Any stray navigation to a locked route (deep link, in-content link) raises
    // the wall; the render path below then bounces them back home.
    useEffect(() => {
        if (guestBlocked) authWall?.promptAuth('browse');
    }, [guestBlocked, authWall]);

    // Re-assert the status bar indicator color on every in-app navigation. iOS
    // drives it globally/imperatively (VC-based appearance is off) and can revert
    // it to the Info.plist default mid-transition, which left the clock/battery
    // dark on our dark chrome. Runs after paint, so it wins over that revert. See
    // the fuller rationale in app/_layout.tsx.
    useEffect(() => {
        setStatusBarStyle(isDark ? "light" : "dark");
    }, [isDark, pathname]);

    useEffect(() => {
        if (!isSignedIn || !userId || registeredPushUserRef.current === userId) {
            return;
        }

        registeredPushUserRef.current = userId;
        void (async () => {
            await notificationService.requestPermissions();
            // Pass the token *getter*, not a pre-fetched token: registration does
            // slow work (permission prompt + Expo push-token fetch) and Clerk
            // session tokens expire in ~60s, so the token must be minted fresh
            // right before the sync POST — otherwise it 401s as expired.
            await registerForPushNotificationsAsync(userId, getToken);
            // Sync the device timezone so proactive alerts honor quiet hours
            // in the user's local time (fire-and-forget, once per launch).
            try {
                const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
                if (timezone) await updateProfile(getToken, { timezone });
            } catch {
                // Non-fatal — alerts fall back to UTC quiet hours.
            }
        })();
    }, [getToken, isSignedIn, userId]);

    // Route the user when they tap a notification (foreground, background,
    // or cold start via the last-response check).
    useEffect(() => {
        if (!isSignedIn) return;

        const handledIds = new Set<string>();
        const handleResponse = (response: Notifications.NotificationResponse | null) => {
            if (!response) return;
            const id = response.notification.request.identifier;
            if (handledIds.has(id)) return;
            handledIds.add(id);

            const data = response.notification.request.content.data as Record<string, unknown> | undefined;
            if (!data) return;

            // Action buttons. Android handles these headlessly in
            // notificationActionTask; this path is iOS (and the foreground case
            // on both), where the actions are configured to open the app because
            // iOS can't run our JS for a background action tap.
            const opportunityId = typeof data.opportunityId === "string" ? data.opportunityId : null;
            if (response.actionIdentifier === ACTION_ASK) {
                const question = response.userText?.trim();
                if (question) {
                    // voiceMsg (not prefill) because the user already typed the
                    // question and submitted it — that's an explicit send, so it
                    // clears the bar prefill exists to protect.
                    router.push(`/chat?voiceMsg=${encodeURIComponent(question)}` as never);
                } else {
                    router.push("/chat" as never);
                }
                return;
            }
            if (response.actionIdentifier === ACTION_SAVE && opportunityId) {
                // Actually save. Routing with a param would be a no-op — the
                // detail screen reads no action param.
                if (userId) {
                    void saveOpportunity(supabase, userId, opportunityId, getToken);
                }
                router.push(`/opportunities/${opportunityId}` as never);
                return;
            }

            if (typeof data.url === "string" && data.url.startsWith("/")) {
                router.push(data.url as never);
                return;
            }
            if (typeof data.goalId === "string") {
                router.push(`/goals/${data.goalId}` as never);
                return;
            }
            if (typeof data.opportunityId === "string") {
                router.push(`/opportunities/${data.opportunityId}` as never);
                return;
            }
            router.push("/notifications" as never);
        };

        const subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
        void Notifications.getLastNotificationResponseAsync().then(handleResponse);

        return () => subscription.remove();
    }, [isSignedIn, router, userId, getToken]);

    const getActiveRoute = (): string => {
        const path = pathname.toLowerCase();
        const normalizedPath = path.replace(/\/+$/, '') || '/';

        if (
            normalizedPath.includes("chat") ||
            normalizedPath.includes("onboarding") ||
            normalizedPath.includes("/cv") ||
            normalizedPath.includes("paywall") ||
            normalizedPath.includes("creator-") ||
            normalizedPath.includes("mentor-") ||
            normalizedPath.includes("wallet") ||
            normalizedPath.includes("privacy") ||
            normalizedPath.includes("help") ||
            normalizedPath.includes("notifications") ||
            normalizedPath.includes("roadmap-templates") ||
            normalizedPath.includes("/profile/") ||
            normalizedPath.includes("/opportunities/") ||
            normalizedPath.includes("copilot") ||
            normalizedPath.includes("saved-searches") ||
            (normalizedPath.startsWith("/goals/") && normalizedPath !== "/goals/all-roadmaps" && normalizedPath !== "/goals/my-list")
        ) {
            return "subpage";
        }

        if (normalizedPath === "/opportunities" || normalizedPath === "/my-opportunities") return "opportunities";
        if (normalizedPath === "/roadmaps" || normalizedPath === "/goals" || normalizedPath === "/goals/all-roadmaps" || normalizedPath === "/goals/my-list") return "roadmaps";
        if (normalizedPath === "/deadlines" || normalizedPath === "/applied" || normalizedPath === "/saved") return "subpage";
        if (normalizedPath === "/profile") return "menu";

        return "home";
    };


    const activeRoute = getActiveRoute();
    const hideSharedHeader = activeRoute === "subpage" ||
        pathname.includes("chat") ||
        pathname.includes("onboarding") ||
        pathname.includes("referral") ||
        pathname.includes("/cv") ||
        activeRoute === "opportunities" ||
        activeRoute === "roadmaps" ||
        activeRoute === "menu";

    // Contextual action for the detached nav circle. On the Plan tab the
    // target depends on where the user is: /goals* creates a personal goal,
    // /roadmaps opens Creator Studio to build a roadmap.
    const { profileFabHidden } = useNavFabState();
    const { style: navBarStyle } = useNavStyleSettings();
    const normalizedPathname = pathname.toLowerCase().replace(/\/+$/, '') || '/';
    const circleAction: NavCircleAction =
        activeRoute === "roadmaps"
            ? {
                kind: "create",
                target: normalizedPathname.startsWith("/goals") ? "/goals/add" : "/creator-dashboard",
            }
            : activeRoute === "menu"
                ? { kind: "edit", target: "/profile/edit" }
                : activeRoute === "opportunities"
                    ? { kind: "ai-discover", target: "/chat" }
                    : { kind: "ai", target: "/chat" };
    const circleHidden = circleAction.kind === "edit" && profileFabHidden;

    // Create speed-dial (Plan tab Plus). Closes on any navigation —
    // adjust-during-render reset keyed on pathname.
    const [createDialOpen, setCreateDialOpen] = useState(false);
    const [prevDialPathname, setPrevDialPathname] = useState(pathname);
    if (prevDialPathname !== pathname) {
        setPrevDialPathname(pathname);
        setCreateDialOpen(false);
    }

    const categoryParam = Array.isArray(params.category) ? params.category[0] : params.category;
    const hasOpportunityCategory = activeRoute === "opportunities" && typeof categoryParam === "string" && categoryParam.length > 0;
    const topLevelRoutes = ["home", "opportunities", "roadmaps", "menu"];
    const showBottomNav = topLevelRoutes.includes(activeRoute) &&
        !hasOpportunityCategory &&
        !pathname.includes("chat") &&
        !pathname.includes("/cv") &&
        !pathname.includes("referral") &&
        !pathname.includes("paywall");

    if (!isLoaded || !guestHydrated) return null;

    // Truly unauthenticated (and not a deliberate guest) → sign in.
    if (!isSignedIn && !isGuest) {
        return <Redirect href="/(auth)/sign-in" />;
    }

    // New signed-in users finish onboarding before entering the app.
    if (isSignedIn && user && !user.unsafeMetadata?.onboardingComplete) {
        return <Redirect href="/onboarding" />;
    }

    // Guests may only view home + a single opportunity's detail. Everything else
    // bounces back home (the effect above already raised the auth wall).
    if (guestBlocked) {
        return <Redirect href="/(app)" />;
    }

    const tabs = [
        { key: "home", route: "/", label: t('tabs.home'), icon: Home, badge: undefined },
        { key: "opportunities", route: "/opportunities", label: t('tabs.discover'), icon: Compass, badge: undefined },
        { key: "roadmaps", route: "/roadmaps", label: t('tabs.plan'), icon: ShoppingBag, badge: undefined },
        { key: "menu", route: "/profile", label: t('tabs.me'), icon: UserCircle, badge: undefined },
    ];

    return (
        <ToastProvider>
        <UpgradeSheetProvider>
        <View style={styles.appContainer}>
            <DailyLoginRewards />
            <ReferralRedemption />
            {!hideSharedHeader && (
                <AppHeader
                    isDark={isDark}
                    colors={colors}
                    unreadNotifications={unreadCount}
                    guestMode={isGuestBrowsing}
                    onGuestBlock={() => authWall?.promptAuth('browse')}
                />
            )}

            <View style={{ flex: 1, backgroundColor: colors.background }}>
                <Stack
                    screenOptions={{
                        headerShown: false,
                        animation: "slide_from_right",
                        gestureEnabled: true,
                        gestureDirection: "horizontal",
                        ...(Platform.OS === 'android' && {
                            animationDuration: 250,
                        }),
                    }}
                >
                    <Stack.Screen name="index" />
                    <Stack.Screen name="opportunities/index" />
                    <Stack.Screen name="roadmaps" />
                    <Stack.Screen name="roadmap-templates/index" />
                    <Stack.Screen name="roadmap-templates/[id]" />
                    <Stack.Screen name="profile/index" />
                    <Stack.Screen name="notifications" />
                    <Stack.Screen name="chat" />
                    <Stack.Screen name="help" />
                    <Stack.Screen name="privacy" />
                    <Stack.Screen name="wallet" />
                    <Stack.Screen name="opportunities/[id]" />
                    <Stack.Screen name="profile/edit" />
                    <Stack.Screen name="profile/settings" />
                    <Stack.Screen name="creator-dashboard" />
                    <Stack.Screen name="creator-apply" />
                    <Stack.Screen name="mentor-apply" />
                    <Stack.Screen name="applied" />
                    <Stack.Screen name="deadlines" />
                    <Stack.Screen name="saved/index" />
                    <Stack.Screen name="goals" />
                    <Stack.Screen name="paywall" />
                    <Stack.Screen name="copilot/[id]" />
                    <Stack.Screen name="saved-searches" />
                </Stack>
            </View>

            {showBottomNav && (
                <>
                    <CreateSpeedDial
                        open={createDialOpen}
                        bottom={getCreateDialBottom(navBarStyle, insets.bottom)}
                        solidColor={colors.accent || "#6366F1"}
                        onClose={() => setCreateDialOpen(false)}
                        onSelect={(target) => {
                            setCreateDialOpen(false);
                            router.push(target as never);
                        }}
                    />
                    <BottomNav
                        tabs={tabs}
                        activeRoute={activeRoute}
                        onTabPress={(key, route) => {
                            // Home stays open for guests; every other tab is walled.
                            if (isGuestBrowsing && key !== "home") {
                                authWall?.promptAuth('browse');
                                return;
                            }
                            // A fresh tab starts with the full pill (labels back).
                            setNavCompact(false);
                            router.push(route as never);
                        }}
                        circleAction={circleAction}
                        circleHidden={circleHidden}
                        onCirclePress={(action) => {
                            if (isGuestBrowsing) {
                                authWall?.promptAuth('ai');
                                return;
                            }
                            if (action.kind === "create") {
                                setCreateDialOpen((open) => !open);
                                return;
                            }
                            router.push(action.target as never);
                        }}
                        createDialOpen={createDialOpen}
                        isDark={isDark}
                        colors={colors}
                        reducedMotion={reducedMotion}
                    />
                </>
            )}

            <WelcomeHintSystem
                userId={user?.id}
                enabled={activeRoute === "home" && !pathname.includes("onboarding")}
                isDark={isDark}
            />

            {/* Admin module locks (pro/disabled) — covers whatever route is
                active, including deep links, without per-screen wiring. */}
            <ModuleLockOverlay />

            {/* First-run greeting — once ever per audience (new / returning /
                guest). Holds the coach-marks and promo until it's dismissed. */}
            <WelcomeModal />

            {/* Login-time promo interstitial — once per day for free users.
                Skipped for guests: they have no account to upgrade yet. */}
            {!isGuestBrowsing && <LoginOfferModal />}

            {/* AI voice mode — mounted once at the root so the bottom-nav hold
                gesture and the chat composer toggles share one overlay. */}
            <VoiceModeOverlay />
        </View>
        </UpgradeSheetProvider>
        </ToastProvider>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    appContainer: {
        flex: 1,
    },
    // Sits under navRow (zIndex 998 vs 999) and spans the full width, ignoring
    // navRow's 14pt insets — the fade has to reach the screen edges.
    navScrim: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 998,
    },
    navRow: {
        position: "absolute",
        left: 14,
        right: 14,
        flexDirection: "row",
        alignItems: "center",
        // Right-anchored so the circle stays pinned in the corner while the
        // pill's width collapses into it.
        justifyContent: "flex-end",
        gap: 10,
        zIndex: 999,
    },
    // ── Full-width bar styles ('fab' / 'tabs' / 'center') ────────────────────
    solidBar: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        borderTopWidth: StyleSheet.hairlineWidth,
        zIndex: 999,
        // Lifts the bar off content that scrolls under it, without the glass
        // pill's heavy floating shadow.
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 8,
    },
    solidBarRow: {
        height: NAV_BAR_HEIGHT,
        flexDirection: "row",
        alignItems: "center",
    },
    barFabWrap: {
        position: "absolute",
        right: 16,
        zIndex: 1000,
    },
    barCenterWrap: {
        position: "absolute",
        top: -22,
        left: 0,
        right: 0,
        alignItems: "center",
        zIndex: 1000,
    },
    barCenterGap: {
        width: 76,
    },
    navPill: {
        // Width is animated (NAV_PILL_WIDTH ↔ 0) by the collapse spring.
        height: 66,
        borderRadius: 33,
        borderCurve: "continuous",
        overflow: "hidden",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.18,
        shadowRadius: 20,
        elevation: 12,
    },
    navPillRow: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 6,
    },
    dialWrap: {
        position: "absolute",
        right: 18,
        alignItems: "flex-end",
        gap: 10,
    },
    dialPrompt: {
        color: "#FFFFFF",
        fontSize: 12,
        fontWeight: "700",
        backgroundColor: "rgba(2,6,23,0.78)",
        overflow: "hidden",
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 999,
        marginBottom: 2,
    },
    dialOption: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 999,
        borderCurve: "continuous",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.2,
        shadowRadius: 14,
        elevation: 10,
    },
    dialOptionText: {
        color: "#FFFFFF",
        fontSize: 13,
        fontWeight: "700",
    },
    navCircle: {
        width: 66,
        height: 66,
        borderRadius: 33,
        borderCurve: "continuous",
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.18,
        shadowRadius: 20,
        elevation: 12,
    },
    tabItem: {
        flex: 1,
        alignSelf: "stretch",
        alignItems: "center",
        justifyContent: "center",
    },
    tabActiveBubble: {
        position: "absolute",
        top: 4,
        left: 6,
        right: 6,
        bottom: 4,
        borderRadius: 22,
        borderCurve: "continuous",
    },
    tabIconWrap: {
        position: "relative",
        // Fixed size so every glyph (AI spark, Plus, Pencil) occupies the
        // same footprint in the row, which is only 56px tall and shares it
        // with a label: 34 + 4 (gap) + 14 (label) = 52px.
        width: 34,
        height: 34,
        alignItems: "center",
        justifyContent: "center",
    },
    tabLabel: {
        fontSize: 11,
        lineHeight: 14,
        letterSpacing: 0.1,
        includeFontPadding: false,
        textAlign: "center",
    },
    badge: {
        position: "absolute",
        top: -4,
        right: -6,
        minWidth: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: "#EF4444",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 3,
        borderWidth: 1.5,
    },
    badgeText: {
        color: "#FFFFFF",
        fontSize: 8,
        fontWeight: "800",
        lineHeight: 10,
    },

    // ── Header Styles ───────────────────────────────────────────
    headerOuter: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
    },
    headerInner: {
        height: 60,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
    },
    brandContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        flex: 1,
        paddingRight: 12,
    },
    homeTitleStack: {
        alignItems: 'flex-start',
        justifyContent: 'center',
    },
    brandText: {
        fontSize: 21,
        fontWeight: '900',
        letterSpacing: 0,
        flexShrink: 1,
    },
    upgradePill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 9,
        paddingVertical: 5,
        borderRadius: 999,
    },
    upgradePillText: {
        color: '#F59E0B',
        fontSize: 12,
        fontWeight: '800',
    },
    homeGreetingText: {
        color: '#94A3B8',
        fontSize: 12,
        fontWeight: '600',
        marginTop: 1,
    },
    menuBtn: {
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
    },
    bellBtn: {
        width: 42,
        height: 42,
        borderRadius: 21,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    bellBadge: {
        position: 'absolute',
        top: 10,
        right: 11,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#EF4444',
        borderWidth: 1.5,
        borderColor: '#020617',
    },
});
