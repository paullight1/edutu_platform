import React, { useState, useRef, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform, Animated, Dimensions } from "react-native";
import { Stack, Redirect, useRouter, useSegments, usePathname, useGlobalSearchParams } from "expo-router";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
    Home,
    Compass,
    ShoppingBag,
    Sparkles,
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
import ReAnimated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    interpolate,
    Extrapolation,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useTheme } from "../../components/context/ThemeContext";
import { ToastProvider, useToast } from "../../components/context/ToastContext";
import { UpgradeSheetProvider } from "../../components/context/UpgradeSheetContext";
import { useCreditRewards } from "@edutu/core/src/hooks/useCreditRewards";
import { EdutuLogo } from "../../components/branding/EdutuLogo";
import { FeatureMenu } from "../../components/ui/FeatureMenu";
import { WelcomeHintSystem } from "../../components/ui/WelcomeHintSystem";
import { LoginOfferModal } from "../../components/ui/LoginOfferModal";
import { ModuleLockOverlay } from "../../components/mobile-control/ModuleLockOverlay";
import { VoiceModeOverlay } from "../../components/chat/VoiceModeOverlay";
import { openVoiceMode } from "../../lib/voiceModeStore";
import { useNavFabState } from "../../lib/navFabStore";
import * as Notifications from "expo-notifications";
import { notificationService, registerForPushNotificationsAsync } from "../../lib/notifications";
import { updateProfile } from "@edutu/core/src/services/profile";
import { supabase } from "../../lib/supabase";
import { useNotifications } from "@edutu/core/src/hooks/useNotifications";
import { useProStatus } from "@edutu/core/src/hooks/useProStatus";
import { useTranslation } from "react-i18next";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Expanded width of the nav pill: screen minus the navRow insets (14 + 14),
// the detached circle (66) and the row gap (10). The pill's width is animated
// between this and 0 when it compresses into the circle.
const NAV_PILL_WIDTH = SCREEN_WIDTH - 14 * 2 - 66 - 10;

// Real Apple Liquid Glass (iOS 26+); elsewhere we use a blur fallback.
const HAS_LIQUID_GLASS = (() => {
    try {
        return isLiquidGlassAvailable();
    } catch {
        return false;
    }
})();

function getBottomNavOffset(bottomInset: number): number {
    if (Platform.OS === 'ios') {
        return Math.max(bottomInset - 8, 10);
    }

    return bottomInset > 0 ? Math.max(bottomInset, 8) : 8;
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
}: {
    icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
    label: string;
    color: string;
    isActive: boolean;
    highlight?: string;
    badge?: number | "!";
    onPress: () => void;
    isDark: boolean;
}) {
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
            <Text
                style={[styles.tabLabel, { color, fontWeight: isActive ? "700" : "600" }]}
                numberOfLines={1}
            >
                {label}
            </Text>
        </TouchableOpacity>
    );
}

// ─── Voice Listening Ripple Component ───────────────────────────────────────────
const LISTENING_COLORS = [
    '#FF0080',
    '#7C4DFF',
    '#00B0FF',
];

function VoiceListeningRipple({ isActive }: { isActive: boolean }) {
    const rings = useRef(
        Array.from({ length: 3 }).map(() => ({
            scale: new Animated.Value(0.5),
            opacity: new Animated.Value(0),
        }))
    ).current;

    const backdropOpacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (isActive) {
            Animated.timing(backdropOpacity, {
                toValue: 0.85,
                duration: 400,
                useNativeDriver: true,
            }).start();

            const animations = rings.map((ring, i) =>
                Animated.loop(
                    Animated.sequence([
                        Animated.delay(i * 600),
                        Animated.parallel([
                            Animated.timing(ring.scale, {
                                toValue: 50,
                                duration: 3500,
                                useNativeDriver: true,
                            }),
                            Animated.sequence([
                                Animated.timing(ring.opacity, {
                                    toValue: 0.6,
                                    duration: 600,
                                    useNativeDriver: true,
                                }),
                                Animated.timing(ring.opacity, {
                                    toValue: 0,
                                    duration: 2900,
                                    useNativeDriver: true,
                                }),
                            ]),
                        ]),
                        Animated.timing(ring.scale, { toValue: 0.5, duration: 0, useNativeDriver: true })
                    ])
                )
            );
            animations.forEach(a => a.start());
            return () => {
                animations.forEach(a => a.stop());
                rings.forEach(ring => {
                    ring.scale.setValue(0.5);
                    ring.opacity.setValue(0);
                });
            };
        } else {
            Animated.timing(backdropOpacity, {
                toValue: 0,
                duration: 500,
                useNativeDriver: true,
            }).start();
        }
    }, [isActive]);

    return (
        <View style={styles.rippleContainer} pointerEvents="none">
            <Animated.View
                style={{
                    position: 'absolute',
                    width: SCREEN_WIDTH * 4,
                    height: SCREEN_HEIGHT * 4,
                    left: -SCREEN_WIDTH * 2,
                    top: -SCREEN_HEIGHT * 2,
                    backgroundColor: '#000000',
                    opacity: backdropOpacity,
                    borderRadius: SCREEN_HEIGHT * 2,
                }}
            />
            {rings.map((ring, i) => (
                <Animated.View
                    key={i}
                    style={[
                        styles.rippleRing,
                        {
                            borderColor: LISTENING_COLORS[i % LISTENING_COLORS.length],
                            borderWidth: 4,
                            transform: [{ scale: ring.scale }],
                            opacity: ring.opacity,
                        },
                    ]}
                />
            ))}
        </View>
    );
}

// ─── Edutu AI Button ──────────────────────────────────────────────────────────
function HeaderLogoTitle({
    color,
}: {
    color: string;
}) {
    const finalTitle = 'Edutu';

    return (
        <Text style={[styles.brandText, { color }]} numberOfLines={1}>
            {finalTitle}
        </Text>
    );
}

// ─── Shared App Header ────────────────────────────────────────────────────────
function AppHeader({ isDark, colors, unreadNotifications }: { isDark: boolean, colors: any, unreadNotifications: number }) {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const bottomOffset = getBottomNavOffset(insets.bottom);
    const accentColor = colors.accent || "#6366F1";
    const { t } = useTranslation('home');
    const { user } = useUser();
    const { isPro, isLoading: proLoading } = useProStatus(supabase, user?.id || null);
    const [menuOpen, setMenuOpen] = useState(false);

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
                        onPress={() => setMenuOpen(true)}
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
                            onPress={() => router.push('/paywall')}
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
                    onPress={() => router.push('/notifications')}
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

function MorphingNavCircle({
    action,
    hidden,
    accent,
    solidColor,
    isDark,
    glassBackground,
    onPress,
    dialOpen = false,
}: {
    action: NavCircleAction;
    hidden: boolean;
    accent: string;
    solidColor: string;
    isDark: boolean;
    glassBackground: (rounded: number) => React.ReactNode;
    onPress: (action: NavCircleAction) => void;
    dialOpen?: boolean;
}) {
    const { t } = useTranslation('home');
    const [shown, setShown] = useState<NavCircleAction>(action);
    const latestAction = useRef(action);
    latestAction.current = action;

    const morph = useRef(new Animated.Value(1)).current;   // 0 = collapsed mid-swap
    const slide = useRef(new Animated.Value(0)).current;   // slide-in from the pill side
    const reveal = useRef(new Animated.Value(hidden ? 0 : 1)).current; // scroll hide/show

    // Plus → X rotation while the create speed-dial (owned by the layout) is open.
    const dial = useRef(new Animated.Value(0)).current;
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
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
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
    const isAI = active.kind === "ai" || active.kind === "ai-discover";

    const overlayColor =
        active.kind === "create" || active.kind === "edit"
            ? `${solidColor}F0`
            : active.kind === "ai-discover"
                ? `${solidColor}2E`
                : null;

    const icon = (() => {
        switch (active.kind) {
            case "create":
                return <Plus size={26} color="#FFFFFF" strokeWidth={2.8} />;
            case "edit":
                return <Pencil size={22} color="#FFFFFF" strokeWidth={2.4} />;
            default:
                return <Sparkles size={24} color={accent} strokeWidth={2.2} />;
        }
    })();

    const label = (() => {
        switch (active.kind) {
            case "create":
                return t('tabs.createNew', 'Create goal or roadmap');
            case "edit":
                return t('tabs.editProfile', 'Edit profile');
            default:
                return t('tabs.openEdutuAi');
        }
    })();

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
            <TouchableOpacity
                onPress={() => onPress(latestAction.current)}
                onLongPress={isAI ? () => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                    openVoiceMode('voice');
                } : undefined}
                delayLongPress={280}
                activeOpacity={0.85}
                style={styles.navCircle}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityHint={isAI ? t('tabs.holdForVoice') : undefined}
            >
                {glassBackground(999)}
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
        </Animated.View>
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
    const dial = useRef(new Animated.Value(0)).current;
    const [rendered, setRendered] = useState(open);

    useEffect(() => {
        if (open) {
            setRendered(true);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
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
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
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
function BottomNav({
    tabs,
    activeRoute,
    onTabPress,
    circleAction,
    circleHidden,
    onCirclePress,
    createDialOpen,
    isDark,
    colors,
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
}) {
    const insets = useSafeAreaInsets();
    // Brighter accent + higher-contrast inactive so labels stay legible on the
    // translucent glass over dark content.
    const accent = isDark ? "#A5B4FC" : (colors.accent || "#4F46E5");
    const inactive = isDark ? "#C7CCD4" : "#5B6472";
    const glassTint = isDark
        ? (Platform.OS === "android" ? "rgba(22,24,34,0.94)" : "rgba(20,22,32,0.72)")
        : (Platform.OS === "android" ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.78)");
    const borderCol = isDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.06)";
    const activeBubble = isDark ? "rgba(129,140,248,0.30)" : "rgba(79,70,229,0.14)";

    // Shared glass background for both the pill and the detached circle.
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
                    intensity={isDark ? 40 : 60}
                    tint={isDark ? "systemChromeMaterialDark" : "systemChromeMaterialLight"}
                    experimentalBlurMethod={Platform.OS === "android" ? "dimezisBlurView" : undefined}
                    style={StyleSheet.absoluteFill}
                />
                <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: glassTint }]} />
                <View
                    pointerEvents="none"
                    style={[
                        StyleSheet.absoluteFillObject,
                        { borderRadius: rounded, borderCurve: "continuous", borderWidth: StyleSheet.hairlineWidth, borderColor: borderCol },
                    ]}
                />
            </>
        );

    // ── Collapse choreography (iOS Safari-style minimize) ────────────────────
    // Home shows the full tab pill. On Discover / Plan / Me the pill
    // compresses toward the right-hand corner: its width springs to zero while
    // the tabs — anchored to the pill's shrinking left edge — slide right and
    // are swallowed one by one by the circle, which swells as it "catches"
    // them and lands on the contextual icon.
    const isCollapsed = circleAction.kind !== "ai";
    const collapse = useSharedValue(isCollapsed ? 1 : 0);

    useEffect(() => {
        collapse.value = withSpring(isCollapsed ? 1 : 0, {
            damping: 26,
            stiffness: 230,
            mass: 1,
        });
    }, [isCollapsed, collapse]);

    const pillStyle = useAnimatedStyle(() => ({
        width: interpolate(collapse.value, [0, 1], [NAV_PILL_WIDTH, 0], Extrapolation.CLAMP),
        opacity: interpolate(collapse.value, [0.55, 0.92], [1, 0], Extrapolation.CLAMP),
    }));

    // Tabs fade ahead of the clip so nothing gets sliced mid-glyph.
    const pillContentStyle = useAnimatedStyle(() => ({
        opacity: interpolate(collapse.value, [0, 0.6], [1, 0], Extrapolation.CLAMP),
    }));

    const circleSwellStyle = useAnimatedStyle(() => ({
        transform: [
            { scale: interpolate(collapse.value, [0, 0.7, 1], [1, 1.08, 1], Extrapolation.CLAMP) },
        ],
    }));

    return (
        <View
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
                />
            </ReAnimated.View>
        </View>
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

// ─── Root Layout ──────────────────────────────────────────────────────────────
export default function AppLayout() {
    const { t } = useTranslation('home');
    const { isSignedIn, isLoaded, getToken, userId } = useAuth();
    const { user } = useUser();
    const { isDark, colors } = useTheme();
    const router = useRouter();
    const segments = useSegments();
    const insets = useSafeAreaInsets();
    const pathname = usePathname();
    const params = useGlobalSearchParams<{ category?: string }>();
    const { unreadCount } = useNotifications(supabase, user?.id ?? null, getToken);
    const registeredPushUserRef = React.useRef<string | null>(null);

    const currentRoute = (segments[segments.length - 1] || "index") as string;

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
    }, [isSignedIn, router]);

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
        pathname.includes("/cv") ||
        activeRoute === "opportunities" ||
        activeRoute === "roadmaps" ||
        activeRoute === "menu";

    // Contextual action for the detached nav circle. On the Plan tab the
    // target depends on where the user is: /goals* creates a personal goal,
    // /roadmaps opens Creator Studio to build a roadmap.
    const { profileFabHidden } = useNavFabState();
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

    // Create speed-dial (Plan tab Plus). Closes on any navigation.
    const [createDialOpen, setCreateDialOpen] = useState(false);
    useEffect(() => {
        setCreateDialOpen(false);
    }, [pathname]);

    const categoryParam = Array.isArray(params.category) ? params.category[0] : params.category;
    const hasOpportunityCategory = activeRoute === "opportunities" && typeof categoryParam === "string" && categoryParam.length > 0;
    const topLevelRoutes = ["home", "opportunities", "roadmaps", "menu"];
    const showBottomNav = topLevelRoutes.includes(activeRoute) &&
        !hasOpportunityCategory &&
        !pathname.includes("chat") &&
        !pathname.includes("/cv") &&
        !pathname.includes("paywall");

    if (!isLoaded) return null;

    if (!isSignedIn) {
        return <Redirect href="/(auth)/sign-in" />;
    }

    if (user && !user.unsafeMetadata?.onboardingComplete) {
        return <Redirect href="/onboarding" />;
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
            {!hideSharedHeader && (
                <AppHeader isDark={isDark} colors={colors} unreadNotifications={unreadCount} />
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
                        bottom={Math.max(insets.bottom, 10) + 76}
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
                        onTabPress={(key, route) => router.push(route as never)}
                        circleAction={circleAction}
                        circleHidden={circleHidden}
                        onCirclePress={(action) => {
                            if (action.kind === "create") {
                                setCreateDialOpen((open) => !open);
                                return;
                            }
                            router.push(action.target as never);
                        }}
                        createDialOpen={createDialOpen}
                        isDark={isDark}
                        colors={colors}
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

            {/* Login-time promo interstitial — once per day for free users. */}
            <LoginOfferModal />

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
        height: 56,
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
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

    // ─── Ripple Effect ──────────────────────────────────────────────
    rippleContainer: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: 1,
        height: 1,
        overflow: 'visible',
        zIndex: 0,
    },
    rippleRing: {
        position: 'absolute',
        width: 64,
        height: 64,
        borderRadius: 32,
        top: -32,
        left: -32,
        backgroundColor: 'rgba(255,255,255,0.05)',
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
