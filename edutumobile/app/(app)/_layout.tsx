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
} from "lucide-react-native";
import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { useTheme } from "../../components/context/ThemeContext";
import { ToastProvider, useToast } from "../../components/context/ToastContext";
import { useCreditRewards } from "@edutu/core/src/hooks/useCreditRewards";
import { EdutuLogo } from "../../components/branding/EdutuLogo";
import { WelcomeHintSystem } from "../../components/ui/WelcomeHintSystem";
import * as Notifications from "expo-notifications";
import { notificationService, registerForPushNotificationsAsync } from "../../lib/notifications";
import { supabase } from "../../lib/supabase";
import { useNotifications } from "@edutu/core/src/hooks/useNotifications";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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
    if (count === undefined || count === null) return null;
    const label = typeof count === "number" ? (count > 99 ? "99+" : String(count)) : count;
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
                    <EdutuLogo size={36} frameless />
                    <HeaderLogoTitle
                        color={isDark ? "#FFFFFF" : "#0F172A"}
                    />
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
        </View>
    );
}

// ─── Bottom Navigation Bar ────────────────────────────────────────────────────
function BottomNav({
    tabs,
    activeRoute,
    onTabPress,
    onAIPress,
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
    onAIPress: () => void;
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

    return (
        <View
            style={[styles.navRow, { bottom: Math.max(insets.bottom, 10) }]}
            pointerEvents="box-none"
        >
            {/* Main floating glass pill with the tabs */}
            <View style={styles.navPill}>
                {glassBackground(32)}
                <View style={styles.navPillRow}>
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
                </View>
            </View>

            {/* Detached glass circle — the Edutu AI accessory */}
            <TouchableOpacity
                onPress={onAIPress}
                activeOpacity={0.85}
                style={styles.navCircle}
                accessibilityRole="button"
                accessibilityLabel="Open Edutu AI"
            >
                {glassBackground(999)}
                <Sparkles size={24} color={accent} strokeWidth={2.2} />
            </TouchableOpacity>
        </View>
    );
}

// ─── Daily Login Credit Claim ───────────────────────────────────────────────
// Runs inside <ToastProvider> so it can surface the reward toast. Fires once
// per mount (ref-guarded) when the user is signed in.
function DailyLoginRewards() {
    const { isSignedIn, userId } = useAuth();
    const { show } = useToast();
    const claimedForUserRef = React.useRef<string | null>(null);

    const { claimDaily } = useCreditRewards(supabase, userId ?? null, {
        onEarned: (amount, label) => {
            show({
                emoji: "🔥",
                variant: "success",
                message: `+${amount} credit${amount > 1 ? "s" : ""} · ${label}`,
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
            const token = await getToken();
            await notificationService.requestPermissions();
            await registerForPushNotificationsAsync(userId, token);
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
        { key: "home", route: "/", label: "Home", icon: Home, badge: undefined },
        { key: "opportunities", route: "/opportunities", label: "Discover", icon: Compass, badge: undefined },
        { key: "roadmaps", route: "/roadmaps", label: "Plan", icon: ShoppingBag, badge: undefined },
        { key: "menu", route: "/profile", label: "Me", icon: UserCircle, badge: undefined },
    ];

    return (
        <ToastProvider>
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
                    <Stack.Screen name="roadmap-templates" />
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
                </Stack>
            </View>

            {showBottomNav && (
                <BottomNav
                    tabs={tabs}
                    activeRoute={activeRoute}
                    onTabPress={(key, route) => router.push(route as never)}
                    onAIPress={() => router.push('/chat' as never)}
                    isDark={isDark}
                    colors={colors}
                />
            )}

            <WelcomeHintSystem
                userId={user?.id}
                enabled={activeRoute === "home" && !pathname.includes("onboarding")}
                isDark={isDark}
            />
        </View>
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
        gap: 10,
        zIndex: 999,
    },
    navPill: {
        flex: 1,
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
    homeGreetingText: {
        color: '#94A3B8',
        fontSize: 12,
        fontWeight: '600',
        marginTop: 1,
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
