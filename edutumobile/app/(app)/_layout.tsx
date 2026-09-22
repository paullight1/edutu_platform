import React, { useState, useRef, useEffect, useMemo } from "react";
import { View, Text, TouchableOpacity, Pressable, StyleSheet, Platform, Animated, useAnimatedValue, Dimensions, useWindowDimensions, Image, PanResponder } from "react-native";
import { Stack, Redirect, useRouter, usePathname, useGlobalSearchParams } from "expo-router";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
    Home,
    Compass,
    Bell,
    BadgeCheck,
    Plus,
    Pencil,
    Target,
    Route,
    Menu,
    ClipboardList,
} from "lucide-react-native";
import { NativeGlassSurface } from "../../components/ui/NativeGlassSurface";
import { BottomScrimView } from "../../components/ui/BottomScrim";
import ReAnimated, {
    type SharedValue,
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withSequence,
    Easing,
} from "react-native-reanimated";
import { haptics } from "../../lib/haptics";
import { setNavCompact } from "../../lib/navScrollStore";
import { AiSparkGlyph } from "../../components/ui/AiSparkGlyph";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../../components/context/ThemeContext";
import { ToastProvider, useToast } from "../../components/context/ToastContext";
import { FeedbackProvider } from "../../components/state";
import { UpgradeSheetProvider } from "../../components/context/UpgradeSheetContext";
import { useCreditRewards } from "@edutu/core/src/hooks/useCreditRewards";
import {
    redeemReferral,
    isTerminalRedeemStatus,
    PENDING_REFERRAL_KEY,
} from "@edutu/core/src/services/referrals";
import { FeatureMenu, FEATURE_MENU_ANIM_MS, FEATURE_MENU_WIDTH } from "../../components/ui/FeatureMenu";
import { WelcomeHintSystem } from "../../components/ui/WelcomeHintSystem";
import { LoginOfferModal } from "../../components/ui/LoginOfferModal";
import { WelcomeModal } from "../../components/ui/WelcomeModal";
import { ModuleLockOverlay } from "../../components/mobile-control/ModuleLockOverlay";
import { VoiceModeOverlay } from "../../components/chat/VoiceModeOverlay";
import { openVoiceMode } from "../../lib/voiceModeStore";
import { useNavStyleSettings, isBarStyle, type NavBarStyle } from "../../lib/navStyleStore";
import { setStatusBarStyle } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import { registerForPushNotificationsAsync } from "../../lib/notifications";
import { reportNotificationOpened } from "../../lib/notificationTelemetry";
import { ACTION_ASK, ACTION_SAVE } from "../../lib/notificationCategories";
import { saveOpportunity } from "@edutu/core/src/services/bookmarks";
import { fetchOpportunityDeadlines } from "@edutu/core/src/services/deadlines";
import { fetchSupabaseProfile, getCachedProfileName, isPlaceholderProfileName } from "@edutu/core/src/services/profile";
import { toSafeUUID } from "@edutu/core/src/utils/auth";
import { syncDeviceTimezone } from "../../lib/timezoneSync";
import { supabase } from "../../lib/supabase";
import { useNotifications } from "@edutu/core/src/hooks/useNotifications";
import { useProStatus } from "@edutu/core/src/hooks/useProStatus";
import { useTranslation } from "react-i18next";
import { useGuestMode, isGuestAllowedPath } from "../../lib/guestModeStore";
import { useAuthWall } from "../../components/context/AuthWallContext";
import { getCommunityCallRouteFromNotification } from "../../features/community-calls/notifications";

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const HEADER_GREETING_ROTATION_MS = 15 * 60 * 1000;

function stableGreetingOffset(value: string) {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
        hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
    }
    return Math.abs(hash);
}

// Content height of the full-width bar styles, above the safe-area padding.
const NAV_BAR_HEIGHT = 58;

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
    // Zero is a normal state, not a notification. Keep this guard central so
    // a future tab cannot accidentally render a distracting "0" badge.
    if (count === undefined || count === null || (typeof count === "number" && count <= 0)) return null;
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
    badge,
    onPress,
    isDark,
}: {
    icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
    label: string;
    color: string;
    isActive: boolean;
    badge?: number | "!";
    onPress: () => void;
    isDark: boolean;
    /** 0→1 pill-compaction progress (Instagram-style shrink); labels fade+collapse. */
    compact?: SharedValue<number>;
}) {
    const { fontScale } = useWindowDimensions();
    const labelStyle = { marginTop: 4 };

    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.6}
            style={[styles.tabItem, { borderRadius: 999, backgroundColor: isActive ? `${color}18` : 'transparent' }]}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={label}
        >
            <View style={styles.tabContent}>
                <View style={styles.tabIconWrap}>
                    <Icon size={24} color={color} strokeWidth={isActive ? 2.4 : 1.9} />
                    <Badge count={badge} isDark={isDark} />
                </View>
                <ReAnimated.View style={labelStyle}>
                    <Text
                        style={[styles.tabLabel, { color, fontWeight: isActive ? "700" : "600" }]}
                        numberOfLines={fontScale > 1.3 ? 2 : 1}
                    >
                        {label}
                    </Text>
                </ReAnimated.View>
            </View>
        </TouchableOpacity>
    );
}

// ─── Edutu AI Button ──────────────────────────────────────────────────────────
// ─── Shared App Header ────────────────────────────────────────────────────────
function AppHeader({ isDark, colors, unreadNotifications, guestMode, onGuestBlock, onOpenMenu }: { isDark: boolean, colors: any, unreadNotifications: number, guestMode?: boolean, onGuestBlock?: () => void, onOpenMenu: () => void }) {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const accentColor = colors.accent || "#6366F1";
    const { t } = useTranslation('home');
    const { user } = useUser();
    const { getToken } = useAuth();
    const { isPro, isLoading: proLoading } = useProStatus(supabase, user?.id || null);
    const [deadlineSummary, setDeadlineSummary] = useState({ userId: '', count: 0 });
    const [profileIdentity, setProfileIdentity] = useState<{ userId: string; fullName: string | null } | null>(null);
    const [greetingPeriod, setGreetingPeriod] = useState(() => Math.floor(Date.now() / HEADER_GREETING_ROTATION_MS));

    const profileReady = Boolean(user?.id && profileIdentity?.userId === user.id);
    const metadataName = typeof user?.unsafeMetadata?.fullName === 'string'
        ? user.unsafeMetadata.fullName.trim()
        : '';
    const clerkName = user?.firstName?.trim() || user?.fullName?.trim().split(/\s+/)[0] || '';
    const cachedName = user?.id ? getCachedProfileName(user.id) || '' : '';
    const persistedName = profileReady
        ? profileIdentity?.fullName?.trim() || ''
        : cachedName || metadataName;
    const firstName = persistedName || (!isPlaceholderProfileName(clerkName) ? clerkName : '') || t('header.friend', { defaultValue: 'there' });
    const hour = new Date().getHours();
    const timeGreeting = hour < 12
        ? t('header.goodMorning', { defaultValue: 'Good morning' })
        : hour < 18
            ? t('header.goodAfternoon', { defaultValue: 'Good afternoon' })
            : t('header.goodEvening', { defaultValue: 'Good evening' });
    const greetingOptions = [
        { lead: timeGreeting, separator: ', ' },
        { lead: t('header.hello', { defaultValue: 'Hello' }), separator: ', ' },
        { lead: t('header.hi', { defaultValue: 'Hi' }), separator: ', ' },
        { lead: t('header.hey', { defaultValue: 'Hey' }), separator: ', ' },
        { lead: t('header.xup', { defaultValue: 'Xup' }), separator: ', ' },
        { lead: t('header.dear', { defaultValue: 'Dear' }), separator: ' ' },
        { lead: t('header.yo', { defaultValue: 'Yo' }), separator: ', ' },
        { lead: t('header.whatsGood', { defaultValue: "What's good" }), separator: ', ' },
        { lead: t('header.welcomeBack', { defaultValue: 'Welcome back' }), separator: ', ' },
        { lead: t('header.goodToSeeYou', { defaultValue: 'Good to see you' }), separator: ', ' },
    ];
    const greetingIndex = (stableGreetingOffset(user?.id || firstName) + greetingPeriod) % greetingOptions.length;
    const selectedGreeting = greetingOptions[greetingIndex];
    const greeting = `${selectedGreeting.lead}${selectedGreeting.separator}${firstName}`;
    const weeklyDeadlines = user?.id === deadlineSummary.userId
        ? deadlineSummary.count
        : 0;

    useEffect(() => {
        let cancelled = false;
        const currentUserId = user?.id;

        if (!currentUserId) return;

        void fetchSupabaseProfile(supabase, [currentUserId, toSafeUUID(currentUserId)])
            .then((profile) => {
                if (cancelled) return;
                setProfileIdentity({
                    userId: currentUserId,
                    fullName: profile?.fullName?.trim() || null,
                });
            })
            .catch(() => {
                if (!cancelled) setProfileIdentity({ userId: currentUserId, fullName: null });
            });

        return () => {
            cancelled = true;
        };
    }, [user?.id]);

    useEffect(() => {
        const updateGreetingPeriod = () => {
            setGreetingPeriod(Math.floor(Date.now() / HEADER_GREETING_ROTATION_MS));
        };
        const interval = setInterval(updateGreetingPeriod, 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        let cancelled = false;
        if (!user?.id || guestMode) return;
        void fetchOpportunityDeadlines(supabase, user.id, getToken)
            .then((rows) => {
                if (cancelled) return;
                const unique = new Set(
                    rows
                        .filter((row) => row.daysRemaining >= 0 && row.daysRemaining <= 7)
                        .map((row) => row.opportunityId),
                );
                setDeadlineSummary({ userId: user.id, count: unique.size });
            })
            .catch(() => {
                if (!cancelled) {
                    setDeadlineSummary({ userId: user.id, count: 0 });
                }
            });
        return () => {
            cancelled = true;
        };
    }, [getToken, guestMode, user?.id]);

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
                        onPress={guardGuest(onOpenMenu)}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={t('header.menu', { defaultValue: 'Open menu' })}
                        style={[styles.menuBtn, { backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)" }]}
                    >
                        <Menu size={20} color={accentColor} strokeWidth={2} />
                    </TouchableOpacity>
                    <View style={[styles.headerAvatarRing, { borderColor: `${accentColor}80` }]}>
                        {user?.imageUrl ? (
                            <Image source={{ uri: user.imageUrl }} style={styles.headerAvatar} />
                        ) : (
                            <Text style={styles.headerAvatarFallback}>{firstName.slice(0, 1).toUpperCase()}</Text>
                        )}
                    </View>
                    <View style={styles.homeTitleStack}>
                        <View style={styles.homeGreetingRow}>
                            <Text
                                testID="home-header-greeting"
                                style={[styles.homeGreetingTitle, { color: colors.foreground }]}
                                numberOfLines={1}
                            >
                                {greeting}
                            </Text>
                            {!proLoading && isPro ? (
                                <View
                                    testID="home-header-verified"
                                    accessibilityRole="image"
                                    accessibilityLabel={t('header.verified')}
                                >
                                    <BadgeCheck
                                        size={15}
                                        color="#FFFFFF"
                                        fill="#3B82F6"
                                    />
                                </View>
                            ) : null}
                        </View>
                        <View style={styles.homeDeadlineRow}>
                            <View style={[styles.homeDeadlineDot, { backgroundColor: accentColor }]} />
                            <Text style={[styles.homeGreetingText, { color: colors.textSecondary }]} numberOfLines={1}>
                                {weeklyDeadlines === 0
                                    ? t('header.noDeadlinesThisWeek', { defaultValue: 'No deadlines this week' })
                                    : t('header.deadlinesThisWeek', {
                                        count: weeklyDeadlines,
                                        defaultValue: `${weeklyDeadlines} deadline${weeklyDeadlines === 1 ? '' : 's'} this week`,
                                    })}
                            </Text>
                        </View>
                    </View>
                </View>

                <TouchableOpacity
                    onPress={guardGuest(() => router.push('/notifications'))}
                    activeOpacity={0.7}
                    style={[styles.bellBtn, { backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)" }]}
                >
                    <Bell size={20} color={accentColor} strokeWidth={2} />
                    {unreadNotifications > 0 && (
                        <View style={styles.bellCountWrap}>
                            <Badge count={unreadNotifications} isDark={isDark} />
                        </View>
                    )}
                </TouchableOpacity>
            </View>

        </View>
    );
}

// ─── Contextual Morphing Nav Circle ──────────────────────────────────────────
// The detached circle next to the tab pill. Instead of always being the AI
// button, it morphs per tab: AI (home), tinted AI (Explore), a Plus that
// creates goals/roadmaps (Plan), and an Edit-profile pencil (More). On context
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
    reducedMotion = false,
}: {
    open: boolean;
    bottom: number;
    solidColor: string;
    onSelect: (target: string) => void;
    onClose: () => void;
    reducedMotion?: boolean;
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
        // With motion reduced there is no collapse animation to wait for, so
        // the un-mount happens here rather than in an animation callback.
        else if (reducedMotion) setRendered(false);
    }

    useEffect(() => {
        if (open) {
            haptics.light();
            if (reducedMotion) {
                // Static end-state: reducedMotion is honored per component.
                dial.setValue(1);
                return;
            }
            Animated.spring(dial, { toValue: 1, friction: 7, tension: 120, useNativeDriver: true }).start();
        } else {
            if (reducedMotion) {
                dial.setValue(0);
                return;
            }
            Animated.timing(dial, { toValue: 0, duration: 150, useNativeDriver: true }).start(({ finished }) => {
                if (finished) setRendered(false);
            });
        }
    }, [open, dial, reducedMotion]);

    if (!rendered) return null;

    // Each option carries a second line: "Goal" and "Roadmap" alone never said
    // which one adds a personal deadline and which one opens Creator Studio.
    const options = [
        {
            key: "goal",
            label: t('tabs.createGoal', 'Goal'),
            hint: t('tabs.createGoalHint', 'One thing you want to finish, with a date'),
            Icon: Target,
            target: "/goals/add",
        },
        {
            key: "roadmap",
            label: t('tabs.createRoadmap', 'Roadmap'),
            hint: t('tabs.createRoadmapHint', 'A multi-step plan in Creator Studio'),
            Icon: Route,
            target: "/creator-dashboard",
        },
    ];

    return (
        <View style={StyleSheet.absoluteFill} pointerEvents={open ? "auto" : "none"}>
            <TouchableOpacity
                activeOpacity={1}
                onPress={onClose}
                style={[StyleSheet.absoluteFill, styles.dialScrim]}
                accessibilityRole="button"
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
                                style={[styles.dialOption, { backgroundColor: `${solidColor}F5` }]}
                                accessibilityRole="button"
                                accessibilityLabel={option.label}
                                accessibilityHint={option.hint}
                            >
                                <View style={styles.dialOptionIcon}>
                                    <option.Icon size={22} color="#FFFFFF" strokeWidth={2.4} />
                                </View>
                                <View style={styles.dialOptionCopy}>
                                    <Text style={styles.dialOptionText} numberOfLines={1}>{option.label}</Text>
                                    <Text style={styles.dialOptionHint} numberOfLines={2}>{option.hint}</Text>
                                </View>
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
    alwaysExpanded: _alwaysExpanded = false,
    highContrast = false,
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
    alwaysExpanded?: boolean;
    highContrast?: boolean;
}) {
    const insets = useSafeAreaInsets();
    const { style: navBarStyle } = useNavStyleSettings();
    const isBar = isBarStyle(navBarStyle);
    const { width, fontScale } = useWindowDimensions();
    const NAV_PILL_WIDTH = Math.max(0, width - 28 - 66 - 10);
    const accent = colors.accent;
    const inactive = colors.textSecondary || colors.foreground || (isDark ? '#FFFFFF' : '#111111');
    const borderCol = colors.border;
    const glassBackground = (rounded: number) => <NativeGlassSurface radius={rounded} isDark={isDark}
        surface={colors.card} border={colors.border} highContrast={highContrast} />;
    const isCollapsed = false;
    const pillHeight = Math.max(66, 42 + (fontScale > 1.3 ? 28 : 18) * fontScale);
    const pillStyle = { width: NAV_PILL_WIDTH, minHeight: pillHeight, borderRadius: 32 };
    const pillContentStyle = { width: NAV_PILL_WIDTH };
    const circleSwellStyle = {};
    const scrimStyle = {};
    const scrimHeight = Math.max(insets.bottom, 10) + 36;

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
                                badge={tab.badge}
                                onPress={() => onTabPress(tab.key, tab.route)}
                                isDark={isDark}
                            />
                        );
                    })}
                </ReAnimated.View>
            </ReAnimated.View>

            {/* Detached glass circle — a contextual action that morphs per tab.
                Home: Edutu AI (tap = chat, hold = voice). Explore: tinted AI.
                Plan: create goal/roadmap. More: edit profile (hides on scroll). */}
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
    const router = useRouter();
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
                durationMs: 3000,
                onPress: () => router.push('/wallet'),
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
export function featureMenuStateAfterLeftSwipe(menuWasOpen: boolean): boolean {
    return !menuWasOpen;
}

export default function AppLayout() {
    const { t } = useTranslation('home');
    const { isSignedIn, isLoaded, getToken, userId } = useAuth();
    const { user } = useUser();
    const { isDark, colors, reducedMotion, highContrast } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const pathname = usePathname();
    const params = useGlobalSearchParams<{ category?: string; planNav?: string }>();
    const isPlanNav = pathname === '/my-plan' ||
        (params.planNav === '1' && ['/applied', '/deadlines', '/roadmaps', '/goals'].includes(pathname));
    const { unreadCount } = useNotifications(supabase, user?.id ?? null, getToken);
    const registeredPushUserRef = React.useRef<string | null>(null);
    const [featureMenuOpen, setFeatureMenuOpen] = useState(false);
    const [featureMenuPath, setFeatureMenuPath] = useState(pathname);
    const featureMenuProgress = useAnimatedValue(0);
    const featureMenuSwipe = useMemo(() => PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) => (
            (featureMenuOpen || gesture.x0 >= SCREEN_WIDTH - 72)
            && gesture.dx < -14
            && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.25
        ),
        onPanResponderRelease: (_event, gesture) => {
            const deliberateLeftSwipe = gesture.dx <= -56
                || (gesture.dx <= -30 && gesture.vx <= -0.45);
            if (deliberateLeftSwipe) {
                haptics.light();
                // A left swipe closes an open left drawer and opens it only
                // when the gesture began from the opposite screen edge. Do
                // not toggle after the overlay has already handled a tap.
                setFeatureMenuOpen(featureMenuStateAfterLeftSwipe(featureMenuOpen));
            }
        },
    }), [featureMenuOpen]);

    if (featureMenuPath !== pathname) {
        setFeatureMenuPath(pathname);
        setFeatureMenuOpen(false);
    }

    useEffect(() => {
        Animated.timing(featureMenuProgress, {
            toValue: featureMenuOpen ? 1 : 0,
            duration: reducedMotion ? 0 : FEATURE_MENU_ANIM_MS,
            easing: featureMenuOpen
                ? Easing.out(Easing.cubic)
                : Easing.inOut(Easing.cubic),
            useNativeDriver: true,
        }).start();
    }, [featureMenuOpen, featureMenuProgress, reducedMotion]);

    const pageTranslateX = featureMenuProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, FEATURE_MENU_WIDTH],
    });

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
        if (!isSignedIn || !userId) {
            registeredPushUserRef.current = null;
            return;
        }
        if (registeredPushUserRef.current === userId) {
            return;
        }

        registeredPushUserRef.current = userId;
        void (async () => {
            // Launch registration is SILENT: `promptIfNeeded: false` means a
            // user who hasn't granted permission is left alone here. The ask
            // now happens in context (saving an opportunity with a deadline),
            // where there is an actual reason to say yes. Users who already
            // granted still get their token refreshed and re-synced on launch.
            //
            // Pass the token *getter*, not a pre-fetched token: registration does
            // slow work (Expo push-token fetch) and Clerk session tokens expire
            // in ~60s, so the token must be minted fresh right before the sync
            // POST — otherwise it 401s as expired.
            try {
                await registerForPushNotificationsAsync(userId, getToken, { promptIfNeeded: false });
            } catch {
                // getExpoPushTokenAsync throws on simulators and when FCM/APNs
                // is misconfigured. Swallow it here so it cannot take the
                // timezone sync below down with it.
            }
            // Sync the device timezone so proactive alerts honor quiet hours in
            // the user's local time. Idempotent: a no-op after the first launch.
            await syncDeviceTimezone(getToken);
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

            // Attribute the tap before any routing branch returns — every path
            // below this point exits, so anything placed later would only ever
            // record the fall-through case.
            reportNotificationOpened(data?.notificationId);
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

            const callRoute = getCommunityCallRouteFromNotification(data);
            if (callRoute) {
                router.replace("/my-plan" as never);
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
        if (normalizedPath === "/my-plan") return "my-plan";

        if (
            normalizedPath.startsWith("/my-plan/") ||
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
    const isCommunityRoute = pathname.includes("/discussions");
    const hideSharedHeader = isPlanNav || activeRoute === "my-plan" || isCommunityRoute || activeRoute === "subpage" ||
        pathname.includes("chat") ||
        pathname.includes("onboarding") ||
        pathname.includes("referral") ||
        pathname.includes("/cv") ||
        activeRoute === "opportunities" ||
        activeRoute === "roadmaps" ||
        activeRoute === "menu";

    // Global AI retains the same purpose across every workspace section.
    const { style: navBarStyle } = useNavStyleSettings();
    const circleAction: NavCircleAction = { kind: 'ai', target: '/chat' };
    const circleHidden = false;

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
    const showBottomNav = (isPlanNav || topLevelRoutes.includes(activeRoute)) &&
        !isCommunityRoute &&
        !hasOpportunityCategory &&
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

    if (isCommunityRoute) return <Redirect href="/my-plan" />;

    const tabs = [
        { key: "home", route: "/", label: t('tabs.home'), icon: Home, badge: undefined },
        { key: "my-plan", route: "/my-plan", label: t('tabs.myPlan', { defaultValue: 'My Plan' }), icon: ClipboardList, badge: undefined },
        { key: "opportunities", route: "/opportunities", label: t('tabs.explore'), icon: Compass, badge: undefined },
        { key: "menu", route: "/profile", label: t('tabs.more'), icon: Menu, badge: undefined },
    ];

    return (
        <ToastProvider>
        {/* Inside ToastProvider so notify.success/failure can reach the toast,
            and above the router so notify.confirm/milestone can be raised from
            any screen — including plain async handlers and catch blocks, which
            is where nearly all of this app's feedback originates. */}
        <FeedbackProvider>
        <UpgradeSheetProvider>
        <View style={[styles.appContainer, { backgroundColor: colors.background }]}>
            <DailyLoginRewards />
            <ReferralRedemption />
            <FeatureMenu
                visible={featureMenuOpen}
                onClose={() => setFeatureMenuOpen(false)}
                isDark={isDark}
                colors={colors}
            />
            <Animated.View
                testID="app-page-surface"
                {...featureMenuSwipe.panHandlers}
                style={[
                    styles.appPageSurface,
                    {
                        backgroundColor: colors.background,
                        transform: [{ translateX: pageTranslateX }],
                    },
                ]}
            >
            {!hideSharedHeader && (
                <AppHeader
                    isDark={isDark}
                    colors={colors}
                    unreadNotifications={unreadCount}
                    guestMode={isGuestBrowsing}
                    onGuestBlock={() => authWall?.promptAuth('browse')}
                    onOpenMenu={() => setFeatureMenuOpen(true)}
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
                        reducedMotion={reducedMotion}
                        onSelect={(target) => {
                            setCreateDialOpen(false);
                            router.push(target as never);
                        }}
                    />
                    <BottomNav
                        alwaysExpanded
                        highContrast={highContrast}
                        tabs={tabs}
                        activeRoute={isPlanNav ? 'my-plan' : activeRoute}
                        onTabPress={(key, route) => {
                            // Home stays open for guests; every other tab is walled.
                            if (isGuestBrowsing && key !== "home") {
                                authWall?.promptAuth('browse');
                                return;
                            }
                            // A fresh tab starts with the full pill (labels back).
                            setNavCompact(false);
                            if (key !== (isPlanNav ? 'my-plan' : activeRoute)) router.navigate(route as never);
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

            {featureMenuOpen ? (
                <Pressable
                    testID="feature-menu-page-dismiss"
                    accessibilityRole="button"
                    accessibilityLabel={t('menu.close', { defaultValue: 'Close menu' })}
                    onPress={() => setFeatureMenuOpen(false)}
                    pointerEvents="auto"
                    style={styles.featureMenuPageDismiss}
                />
            ) : null}
            </Animated.View>

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
        </FeedbackProvider>
        </ToastProvider>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    appContainer: {
        flex: 1,
    },
    appPageSurface: {
        flex: 1,
        zIndex: 1,
        shadowColor: '#020617',
        shadowOpacity: 0.28,
        shadowRadius: 24,
        shadowOffset: { width: 12, height: 0 },
        elevation: 18,
    },
    featureMenuPageDismiss: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 2000,
        backgroundColor: 'rgba(2,6,23,0.12)',
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
        // Native material stays mounted at full opacity during navigation.
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
    // A dim scrim, not an invisible catcher: the dial used to fan out over
    // live content with nothing signalling that the rest of the screen was
    // inert, so taps that dismissed it read as taps that did nothing.
    dialScrim: {
        backgroundColor: "rgba(2,6,23,0.45)",
    },
    dialWrap: {
        position: "absolute",
        left: 18,
        right: 18,
        alignItems: "stretch",
        gap: 12,
    },
    dialPrompt: {
        color: "#FFFFFF",
        fontSize: 14,
        fontWeight: "700",
        alignSelf: "flex-end",
        backgroundColor: "rgba(2,6,23,0.82)",
        overflow: "hidden",
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 999,
        marginBottom: 4,
    },
    // 64pt rows with a 16pt label and a supporting line. The old pills were
    // ~38pt tall with 13pt text — under the touch minimum, and the two of them
    // were indistinguishable at a glance.
    dialOption: {
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        minHeight: 64,
        paddingHorizontal: 18,
        paddingVertical: 12,
        borderRadius: 22,
        borderCurve: "continuous",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.2,
        shadowRadius: 14,
        elevation: 10,
    },
    dialOptionIcon: {
        width: 40,
        height: 40,
        borderRadius: 14,
        borderCurve: "continuous",
        backgroundColor: "rgba(255,255,255,0.18)",
        alignItems: "center",
        justifyContent: "center",
    },
    dialOptionCopy: {
        flex: 1,
    },
    dialOptionText: {
        color: "#FFFFFF",
        fontSize: 16,
        fontWeight: "700",
    },
    dialOptionHint: {
        color: "rgba(255,255,255,0.82)",
        fontSize: 12,
        lineHeight: 16,
        marginTop: 2,
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
    tabContent: {
        minWidth: 48,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 5,
        paddingVertical: 5,
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
        height: 76,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        gap: 8,
    },
    brandContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flex: 1,
        minWidth: 0,
    },
    homeTitleStack: {
        flex: 1,
        minWidth: 0,
        alignItems: 'flex-start',
        justifyContent: 'center',
    },
    homeGreetingRow: {
        maxWidth: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    homeGreetingTitle: {
        fontSize: 15.5,
        lineHeight: 20,
        fontWeight: '800',
        letterSpacing: -0.15,
        flexShrink: 1,
    },
    homeDeadlineRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 2,
    },
    homeDeadlineDot: {
        width: 7,
        height: 7,
        borderRadius: 4,
    },
    homeGreetingText: {
        fontSize: 11,
        lineHeight: 15,
        fontWeight: '600',
        flexShrink: 1,
    },
    headerAvatarRing: {
        width: 50,
        height: 50,
        borderRadius: 25,
        borderWidth: 2,
        padding: 2,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#334155',
    },
    headerAvatar: {
        width: '100%',
        height: '100%',
        borderRadius: 22,
    },
    headerAvatarFallback: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: '800',
    },
    menuBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    bellBtn: {
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    bellBadge: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#EF4444',
        borderWidth: 1.5,
        borderColor: '#020617',
    },
    bellCountWrap: {
        position: 'absolute',
        top: 1,
        right: 0,
    },
});
