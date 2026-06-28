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
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../../components/context/ThemeContext";
import { EdutuLogo } from "../../components/branding/EdutuLogo";
import { WelcomeHintSystem } from "../../components/ui/WelcomeHintSystem";
import { notificationService, registerForPushNotificationsAsync } from "../../lib/notifications";
import { supabase } from "../../lib/supabase";
import { useNotifications } from "@edutu/core/src/hooks/useNotifications";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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
function TabItem({
    icon: Icon,
    label,
    isActive,
    badge,
    onPress,
    theme,
    isDark,
}: {
    icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
    label: string;
    isActive: boolean;
    badge?: number | "!";
    onPress: () => void;
    theme: any;
    isDark: boolean;
}) {
    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.75}
            style={[
                styles.tabItem,
                isActive && { backgroundColor: theme.activePill }
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={label}
        >
            <View style={styles.iconContainer}>
                <Icon
                    size={21}
                    color={isActive ? theme.activeColor : theme.inactive}
                    strokeWidth={isActive ? 2.5 : 2}
                />
                <Badge count={badge} isDark={isDark} />
            </View>

            <Text
                style={[
                    styles.tabLabel,
                    { color: isActive ? theme.labelActive : theme.inactive },
                    isActive && { fontWeight: "700" }
                ]}
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

function EdutuAIButton({ onPress, isDark }: { onPress: () => void; isDark: boolean }) {
    return (
        <View style={styles.aiBtnWrapper}>
            <TouchableOpacity
                onPress={onPress}
                activeOpacity={0.9}
                style={styles.aiBtnContainer}
                accessibilityRole="button"
                accessibilityLabel="Open Edutu AI chat"
            >
                <BlurView
                    intensity={isDark ? 40 : 60}
                    tint={isDark ? "dark" : "light"}
                    style={[StyleSheet.absoluteFill, styles.aiBlurBackground]}
                />
                <View style={[
                    styles.aiGlassBorder,
                    { borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.4)' }
                ]} />
                <View style={styles.aiIconContainer}>
                    <Sparkles size={24} color={isDark ? "#FFFFFF" : "#3B82F6"} strokeWidth={2.5} />
                </View>
            </TouchableOpacity>
        </View>
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
}) {
    const insets = useSafeAreaInsets();
    const bottomOffset = getBottomNavOffset(insets.bottom);
    const THEME = {
        navBg: isDark ? "rgba(15, 23, 42, 0.65)" : "rgba(255, 255, 255, 0.80)",
        activePill: isDark ? "rgba(99, 102, 241, 0.20)" : "#F0F0F5",
        activeColor: isDark ? "#818CF8" : "#4F46E5",
        inactive: isDark ? "#94A3B8" : "#475569",
        border: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)",
        labelActive: isDark ? "#A5B4FC" : "#4F46E5",
        shadow: isDark ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.08)",
    };
    return (
        <View style={[
            styles.navContainer,
            {
                bottom: bottomOffset,
                zIndex: 2000,
                elevation: 20,
            }
        ]} pointerEvents="box-none">
            <View style={[styles.navPillWrapper, { shadowColor: THEME.shadow }]}>
                <BlurView
                    intensity={isDark ? 65 : 90}
                    tint={isDark ? "dark" : "light"}
                    style={StyleSheet.absoluteFill}
                />
                <LinearGradient
                    colors={
                        isDark
                            ? ['rgba(255,255,255,0.18)', 'rgba(255,255,255,0.03)', 'rgba(255,255,255,0.02)']
                            : ['rgba(255,255,255,0.92)', 'rgba(255,255,255,0.35)', 'rgba(255,255,255,0.12)']
                    }
                    start={{ x: 0.1, y: 0 }}
                    end={{ x: 0.9, y: 1 }}
                    style={styles.navGlassWash}
                    pointerEvents="none"
                />
                <View
                    pointerEvents="none"
                    style={[
                        styles.navSpecularLine,
                        { backgroundColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.9)' }
                    ]}
                />
                <View style={[styles.navPillOverlay, { backgroundColor: THEME.navBg, borderColor: THEME.border }]}>
                    {tabs.map((tab) => (
                        <TabItem
                            key={tab.key}
                            icon={tab.icon}
                            label={tab.label}
                            isActive={activeRoute === tab.key}
                            badge={tab.badge}
                            onPress={() => onTabPress(tab.key, tab.route)}
                            theme={THEME}
                            isDark={isDark}
                        />
                    ))}
                </View>
            </View>

            <EdutuAIButton onPress={onAIPress} isDark={isDark} />
        </View>
    );
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
        <View style={styles.appContainer}>
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
                <>
                    {isDark && (
                        <LinearGradient
                            colors={["transparent", "rgba(2, 6, 23, 0.6)", "rgba(2, 6, 23, 0.9)"]}
                            style={[styles.bottomFade, { height: 84 + Math.max(insets.bottom, 0) }]}
                            pointerEvents="none"
                        />
                    )}

                    <BottomNav
                        tabs={tabs}
                        activeRoute={activeRoute}
                        onTabPress={(key, route) => router.push(route as never)}
                        onAIPress={() => router.push('/chat' as never)}
                        isDark={isDark}
                    />
                </>
            )}

            <WelcomeHintSystem
                userId={user?.id}
                enabled={activeRoute === "home" && !pathname.includes("onboarding")}
                isDark={isDark}
            />
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    appContainer: {
        flex: 1,
    },
    navContainer: {
        position: "absolute",
        left: 14,
        right: 14,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        zIndex: 999,
    },
    navPillWrapper: {
        flex: 1,
        height: 68,
        borderRadius: 34,
        overflow: "hidden",
        shadowOffset: { width: 0, height: 14 },
        shadowOpacity: 1,
        shadowRadius: 24,
        elevation: 14,
    },
    navGlassWash: {
        ...StyleSheet.absoluteFillObject,
    },
    navSpecularLine: {
        position: 'absolute',
        top: 1,
        left: 18,
        right: 18,
        height: 1,
        borderRadius: 999,
    },
    navPillOverlay: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 8,
        borderWidth: 1,
        borderRadius: 34,
    },
    tabItem: {
        flex: 1,
        height: 52,
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 26,
        marginHorizontal: 3,
    },
    iconContainer: {
        position: "relative",
    },
    tabLabel: {
        fontSize: 10,
        marginTop: 2,
        letterSpacing: 0.1,
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

    // ─── AI Button Styles ───────────────────────────────────────────
    aiBtnWrapper: {
        position: "relative",
        alignItems: "center",
    },
    aiBtnContainer: {
        width: 68,
        height: 68,
        borderRadius: 34,
        alignItems: "center",
        justifyContent: "center",
        overflow: 'hidden',
    },
    aiBlurBackground: {
        borderRadius: 34,
    },
    aiHoldBackground: {
        borderRadius: 34,
    },
    aiGlassBorder: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        borderRadius: 34,
        borderWidth: 2,
    },
    aiIconContainer: {
        zIndex: 10,
    },
    aiPulseRing: {
        position: 'absolute',
        top: -4,
        left: -4,
        right: -4,
        bottom: -4,
        borderRadius: 36,
        borderWidth: 2,
        opacity: 0.6,
    },
    aiLabel: {
        fontSize: 10,
        fontWeight: "600",
        marginTop: 4,
        letterSpacing: 0.2,
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
    bottomFade: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 90,
    },
});
