import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    Image,
    NativeSyntheticEvent,
    NativeScrollEvent,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    Settings,
    LogOut,
    ChevronRight,
    FileText,
    Bell,
    LayoutGrid,
    Shield,
    HelpCircle,
    MessageCircle,
    User,
    Target,
    Crown,
    Users,
    Wrench,
    Megaphone,
    Zap,
    Tag,
    BadgeCheck,
    Gift,
    Store,
    BookmarkPlus,
} from 'lucide-react-native';
import { useUser, useAuth } from '@clerk/clerk-expo';
import { useFocusEffect, useRouter } from 'expo-router';
import { ScreenHeader } from "../../../components/ui/ScreenHeader";
import { useTheme } from "../../../components/context/ThemeContext";
import { supabase } from "../../../lib/supabase";
import { toSafeUUID } from "@edutu/core/src/utils/auth";
import { fetchProfile, fetchSupabaseProfile, getCachedProfileName, isPlaceholderProfileName, type BackendProfile } from '@edutu/core/src/services/profile';
import { setProfileFabHidden } from '../../../lib/navFabStore';
import { clearWidgetSuiteData } from '../../../lib/widgetSuiteSync';
import { usePromptProUpgrade } from '../../../lib/upsell';
import { useProStatus } from '@edutu/core/src/hooks/useProStatus';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { AnimatedPressable } from '../../../components/ui/AnimatedPressable';
import { MoreFeatureHub } from '../../../components/more/MoreFeatureHub';

const MORE_QUICK_ACTIONS = [
    { id: 'roadmaps', title: 'home.quickActions.roadmaps', icon: Store, route: '/roadmaps', gradient: ['#F59E0B', '#EF4444'] as [string, string] },
    { id: 'goals', title: 'home.quickActions.goals', icon: Target, route: '/goals', gradient: ['#10B981', '#059669'] as [string, string] },
    { id: 'cv', title: 'home.quickActions.cvBuilder', icon: FileText, route: '/cv', gradient: ['#3B82F6', '#6366F1'] as [string, string] },
    { id: 'saved', title: 'home.quickActions.saved', icon: BookmarkPlus, route: '/saved', gradient: ['#EC4899', '#F43F5E'] as [string, string] },
];

function MoreQuickActions({ onNavigate }: { onNavigate: (route: string) => void }) {
    const { t } = useTranslation('home');
    return (
        <View style={styles.quickActionsSection} testID="more-quick-actions">
            <Text style={styles.quickActionsHeading}>{t('home.quickActionsTitle')}</Text>
            <View style={styles.quickActionsGrid}>
                {MORE_QUICK_ACTIONS.map((item, index) => (
                    <AnimatedPressable
                        key={item.id}
                        onPress={() => onNavigate(item.route)}
                        style={styles.quickActionCard}
                        entering={FadeInUp.delay(80 + index * 70).duration(380).springify()}
                        hapticFeedback="medium"
                        scaleTo={0.92}
                        accessibilityLabel={t(item.title)}
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
        </View>
    );
}

function PremiumButton({ isPro }: { isPro: boolean }) {
    // Shared upsell (lib/upsell). This chip IS the pitch, so it opens the
    // paywall directly rather than stacking a second upgrade prompt on top.
    const promptProUpgrade = usePromptProUpgrade();
    const { isDark } = useTheme();
    const { t } = useTranslation('profile');

    if (isPro) {
        return (
            <View style={[styles.premiumButton, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)' }]}>
                <BadgeCheck size={16} color="#FFFFFF" fill="#3B82F6" />
                <Text style={[styles.premiumButtonText, { color: '#3B82F6' }]}>{t('view.verified')}</Text>
            </View>
        );
    }

    return (
        <TouchableOpacity
            style={[styles.premiumButton, { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : 'rgba(245, 158, 11, 0.1)' }]}
            onPress={() => promptProUpgrade({ direct: true })}
            activeOpacity={0.7}
        >
            <Crown size={16} color="#F59E0B" />
            <Text style={[styles.premiumButtonText, { color: '#F59E0B' }]}>{t('view.premium')}</Text>
        </TouchableOpacity>
    );
}

export default function ProfileScreen() {
    const { isDark, colors } = useTheme();
    const { user } = useUser();
    const { signOut, getToken } = useAuth();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { t } = useTranslation('profile');
    // Shared upsell (lib/upsell) — this row is already the pitch, so `direct`.
    const promptProUpgrade = usePromptProUpgrade();

    const textSecondary = isDark ? '#94A3B8' : '#64748B';
    // Set when the user skipped onboarding — we surface a resume card so they
    // can finish personalizing without being trapped in the onboarding flow.
    const profilePending = Boolean(user?.unsafeMetadata?.profilePending);
    const { isPro } = useProStatus(supabase, user?.id || null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [isApprovedMentor, setIsApprovedMentor] = useState(false);
    // Canonical saved profile (backend row) — the header must reflect what the
    // user actually saved on the edit screen, not stale onboarding metadata.
    const [savedProfile, setSavedProfile] = useState<BackendProfile | null>(null);
    const cachedProfileName = user?.id ? getCachedProfileName(user.id) : null;
    const displayProfileName = savedProfile?.fullName?.trim() || cachedProfileName ||
        (!isPlaceholderProfileName(user?.fullName) ? user?.fullName : null) || t('view.userFallback');
    const handleSignOut = async () => {
        await clearWidgetSuiteData().catch(() => undefined);
        await signOut();
    };

    // Refetch on every focus so returning from the edit screen shows the
    // values that were just saved (the screen stays mounted behind the stack).
    const userId = user?.id;
    useFocusEffect(
        useCallback(() => {
            let cancelled = false;
            const loadSavedProfile = async () => {
                if (!userId) return;
                const data =
                    await fetchSupabaseProfile(supabase, [userId, toSafeUUID(userId)]) ??
                    await fetchProfile(getToken);
                if (data && !cancelled) setSavedProfile(data);
            };
            loadSavedProfile();
            return () => {
                cancelled = true;
            };
        }, [userId, getToken])
    );

    // The contextual nav circle shows Edit only while the profile header is in
    // view; once the card scrolls away the circle tucks itself out of the way.
    const fabHiddenRef = React.useRef(false);
    useFocusEffect(
        useCallback(() => {
            fabHiddenRef.current = false;
            setProfileFabHidden(false);
            return () => setProfileFabHidden(false);
        }, [])
    );
    const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
        // Hysteresis so the circle doesn't flicker around the threshold.
        const y = event.nativeEvent.contentOffset.y;
        const hidden = fabHiddenRef.current ? y > 200 : y > 280;
        if (hidden !== fabHiddenRef.current) {
            fabHiddenRef.current = hidden;
            setProfileFabHidden(hidden);
        }
    }, []);

    useEffect(() => {
        const checkRole = async () => {
            if (!user) return;
            try {
                const { data } = await supabase
                    .from('profiles')
                    .select('role, creator_status, mentor_status')
                    .eq('user_id', toSafeUUID(user.id))
                    .single();
                setIsAdmin(data?.role === 'admin');
                setIsApprovedMentor(
                    data?.creator_status === 'approved' || data?.mentor_status === 'approved',
                );
            } catch (e) {
                console.error('Failed to check role:', e);
            }
        };
        checkRole();
    }, [user]);

    const menuGroups = [
        {
            title: t('view.menu.tools'),
            items: [
                { id: 'creator', title: t('view.menu.mentorStudio', { defaultValue: 'Mentor Studio' }), desc: t('view.menu.mentorStudioDesc', { defaultValue: 'Publish roadmaps & resources, track your impact' }), icon: LayoutGrid, route: '/creator-dashboard', color: '#6366F1', bg: 'rgba(99,102,241,0.15)' },
                { id: 'referrals', title: t('view.menu.inviteFriends', { defaultValue: 'Invite friends' }), desc: t('view.menu.inviteFriendsDesc', { defaultValue: 'Earn 10 credits per friend' }), icon: Gift, route: '/referrals', color: '#F59E0B', bg: 'rgba(245,158,11,0.15)' },
            ]
        },
        {
            title: t('view.menu.preferences'),
            items: [
                { id: 'notifications', title: t('view.menu.notifications'), desc: t('view.menu.notificationsDesc'), icon: Bell, route: '/notifications', color: '#F59E0B', bg: 'rgba(245,158,11,0.15)' },
                { id: 'settings', title: t('view.menu.settings'), desc: t('view.menu.settingsDesc'), icon: Settings, route: '/profile/settings', color: '#64748B', bg: 'rgba(100,116,139,0.15)' },
            ]
        },
        {
            title: t('view.menu.support'),
            items: [
                { id: 'help', title: t('view.menu.helpSupport'), desc: t('view.menu.helpSupportDesc'), icon: HelpCircle, route: '/help', color: '#06B6D4', bg: 'rgba(6,182,212,0.15)' },
                { id: 'security', title: t('view.menu.privacy'), desc: t('view.menu.privacyDesc'), icon: Shield, route: '/privacy', color: '#EC4899', bg: 'rgba(236,72,153,0.15)' },
            ]
        }
    ];

    const adminMenuItems = [
        { id: 'creator-apps', title: t('view.admin.creatorApplications'), desc: t('view.admin.creatorApplicationsDesc'), icon: Users, route: '/admin/creator-applications', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
        { id: 'create-roadmap', title: t('view.admin.createRoadmap'), desc: t('view.admin.createRoadmapDesc'), icon: Megaphone, route: '/admin/roadmap/create', color: '#06B6D4', bg: 'rgba(6,182,212,0.15)' },
        { id: 'testimonials', title: t('view.admin.testimonials'), desc: t('view.admin.testimonialsDesc'), icon: MessageCircle, route: '/admin/testimonials', color: '#F59E0B', bg: 'rgba(245,158,11,0.15)' },
        { id: 'premium-features', title: t('view.admin.premiumFeatures'), desc: t('view.admin.premiumFeaturesDesc'), icon: Crown, route: '/admin/premium-features', color: '#10B981', bg: 'rgba(16,185,129,0.15)' },
        { id: 'pricing', title: t('view.admin.pricing'), desc: t('view.admin.pricingDesc'), icon: Tag, route: '/admin/pricing', color: '#8B5CF6', bg: 'rgba(139,92,246,0.15)' },
        { id: 'app-control', title: t('view.admin.appControl'), desc: t('view.admin.appControlDesc'), icon: Shield, route: '/admin/app-control', color: '#EF4444', bg: 'rgba(239,68,68,0.15)' },
    ];

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
            <ScreenHeader title={t('view.title')} showBack right={<PremiumButton isPro={isPro} />} />
            <ScrollView
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
                onScroll={handleScroll}
                scrollEventThrottle={32}
            >
                {/* One-line profile card — the full profile (identity, stats,
                    applied opportunities) lives on /profile/view. */}
                <TouchableOpacity
                    style={[styles.profileLineCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={() => router.push('/profile/view')}
                    activeOpacity={0.7}
                >
                    {user?.imageUrl ? (
                        <Image source={{ uri: user.imageUrl }} style={styles.lineAvatar} />
                    ) : (
                        <View style={[styles.lineAvatarPlaceholder, { backgroundColor: colors.primary }]}>
                            <User size={22} color="#fff" />
                        </View>
                    )}
                    <View style={styles.lineInfo}>
                        <View style={styles.userNameRow}>
                            <Text style={[styles.lineName, { color: colors.foreground }]} numberOfLines={1}>
                                {displayProfileName}
                            </Text>
                            {isPro && (
                                <BadgeCheck
                                    size={16}
                                    color="#FFFFFF"
                                    fill="#3B82F6"
                                    accessibilityLabel={t('view.verified')}
                                />
                            )}
                        </View>
                        <Text style={[styles.lineSub, { color: textSecondary }]} numberOfLines={1}>
                            {savedProfile?.country || (user?.unsafeMetadata?.country as string) || user?.primaryEmailAddress?.emailAddress || ''}
                            {(savedProfile?.major || savedProfile?.school) ? ` · ${savedProfile?.major || savedProfile?.school}` : ''}
                        </Text>
                    </View>
                    <ChevronRight size={18} color={textSecondary} />
                </TouchableOpacity>

                {profilePending && (
                    <Animated.View entering={FadeInDown.duration(360)}>
                        <TouchableOpacity
                            style={[styles.completeProfileCard, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '33' }]}
                            onPress={() => router.push('/onboarding')}
                            activeOpacity={0.85}
                        >
                            <View style={[styles.completeProfileIcon, { backgroundColor: colors.primary }]}>
                                <Target size={22} color="#fff" />
                            </View>
                            <View style={styles.completeProfileContent}>
                                <Text style={[styles.completeProfileTitle, { color: colors.foreground }]}>
                                    {t('view.completeProfile.title')}
                                </Text>
                                <Text style={[styles.completeProfileDesc, { color: textSecondary }]}>
                                    {t('view.completeProfile.desc')}
                                </Text>
                            </View>
                            <View style={[styles.completeProfilePill, { backgroundColor: colors.primary }]}>
                                <Text style={styles.completeProfilePillText}>{t('view.completeProfile.cta')}</Text>
                            </View>
                        </TouchableOpacity>
                    </Animated.View>
                )}

                <MoreQuickActions onNavigate={(route) => router.push(route as never)} />
                <MoreFeatureHub />

                {/* Upgrade to Premium — single line; the paywall does the selling. */}
                {!isPro && (
                    <Animated.View entering={FadeInDown.duration(360)}>
                        <TouchableOpacity
                            onPress={() => promptProUpgrade({ direct: true })}
                            activeOpacity={0.88}
                            style={styles.upgradeLineWrap}
                        >
                            <LinearGradient
                                colors={['#4338CA', '#6366F1', '#8B5CF6']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.upgradeLine}
                            >
                                <View style={styles.upgradeIconWrap}>
                                    <Zap size={16} color="#FDE047" fill="#FDE047" />
                                </View>
                                <Text style={styles.upgradeLineText} numberOfLines={1}>
                                    {t('view.upgrade.title')}
                                </Text>
                                <ChevronRight size={16} color="rgba(255,255,255,0.9)" />
                            </LinearGradient>
                        </TouchableOpacity>
                    </Animated.View>
                )}

                {/* Become a Mentor Banner — hidden once approved */}
                {!isApprovedMentor && (
                <TouchableOpacity
                    style={[styles.creatorBanner, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '30' }]}
                    onPress={() => router.push('/mentor-apply')}
                    activeOpacity={0.8}
                >
                    <View style={[styles.creatorIcon, { backgroundColor: colors.primary }]}>
                        <Crown size={24} color="#fff" />
                    </View>
                    <View style={styles.creatorContent}>
                        <Text style={[styles.creatorTitle, { color: colors.foreground }]}>
                            {t('view.becomeMentor', { defaultValue: 'Become a Mentor' })}
                        </Text>
                        <Text style={[styles.creatorDesc, { color: textSecondary }]}>
                            {t('view.becomeMentorDesc', { defaultValue: 'Share your roadmaps and earn from your expertise' })}
                        </Text>
                    </View>
                    <ChevronRight size={20} color={colors.primary} />
                </TouchableOpacity>
                )}

                {/* Menu Groups */}
                {menuGroups.map((group, groupIdx) => (
                    <View key={groupIdx} style={styles.menuGroup}>
                        <Text style={[styles.groupTitle, { color: textSecondary }]}>
                            {group.title}
                        </Text>

                        <View style={[styles.menuCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
                            {group.items.map((item, idx) => (
                                <TouchableOpacity
                                    key={idx}
                                    onPress={() => router.push(item.route as any)}
                                    activeOpacity={0.6}
                                    style={[
                                        styles.menuItem,
                                        idx < group.items.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }
                                    ]}
                                >
                                    <View style={[styles.menuIcon, { backgroundColor: item.bg }]}>
                                        <item.icon size={18} color={item.color} />
                                    </View>
                                    <View style={styles.menuText}>
                                        <Text style={[styles.menuTitle, { color: colors.foreground }]}>{item.title}</Text>
                                        <Text style={[styles.menuDesc, { color: textSecondary }]}>{item.desc}</Text>
                                    </View>
                                    <ChevronRight size={16} color={textSecondary} />
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                ))}

                {/* Admin Section */}
                {isAdmin && (
                    <Animated.View entering={FadeInDown.duration(300)} style={styles.menuGroup}>
                        <View style={styles.adminHeader}>
                            <Wrench size={14} color="#3b82f6" />
                            <Text style={[styles.groupTitle, { color: '#3b82f6' }]}>
                                {t('view.admin.title')}
                            </Text>
                        </View>

                        <View style={[styles.menuCard, { borderColor: 'rgba(59,130,246,0.2)', backgroundColor: colors.card }]}>
                            {adminMenuItems.map((item, idx) => (
                                <TouchableOpacity
                                    key={idx}
                                    onPress={() => router.push(item.route as any)}
                                    activeOpacity={0.6}
                                    style={[
                                        styles.menuItem,
                                        idx < adminMenuItems.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }
                                    ]}
                                >
                                    <View style={[styles.menuIcon, { backgroundColor: item.bg }]}>
                                        <item.icon size={18} color={item.color} />
                                    </View>
                                    <View style={styles.menuText}>
                                        <Text style={[styles.menuTitle, { color: colors.foreground }]}>{item.title}</Text>
                                        <Text style={[styles.menuDesc, { color: textSecondary }]}>{item.desc}</Text>
                                    </View>
                                    <ChevronRight size={16} color={textSecondary} />
                                </TouchableOpacity>
                            ))}
                        </View>
                    </Animated.View>
                )}

                {/* Logout Button */}
                <TouchableOpacity
                    onPress={() => { void handleSignOut(); }}
                    activeOpacity={0.7}
                    style={[styles.logoutBtn, {
                        backgroundColor: 'rgba(239,68,68,0.1)',
                        borderColor: 'rgba(239,68,68,0.2)'
                    }]}
                >
                    <LogOut size={18} color="#ef4444" />
                    <Text style={styles.logoutText}>{t('view.logOut')}</Text>
                </TouchableOpacity>

                {/* Footer */}
                <View style={styles.footer}>
                    <Image
                        source={require('../../../assets/logo1.png')}
                        style={styles.footerLogo}
                        resizeMode="contain"
                    />
                    <Text style={[styles.footerText, { color: textSecondary }]}>{t('view.appVersion', { version: '1.2' })}</Text>
                    <Text style={[styles.footerSubtext, { color: textSecondary }]}>{t('view.footerTagline')}</Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingTop: 16,
        paddingHorizontal: 20,
    },
    profileLineCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderRadius: 16,
        borderWidth: 1,
        paddingHorizontal: 14,
        paddingVertical: 12,
        marginBottom: 16,
    },
    lineAvatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
    },
    lineAvatarPlaceholder: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
    },
    lineInfo: {
        flex: 1,
    },
    lineName: {
        fontSize: 16,
        fontWeight: '700',
        flexShrink: 1,
    },
    lineSub: {
        fontSize: 12,
        marginTop: 2,
    },
    userNameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    quickActionsSection: {
        marginBottom: 24,
    },
    quickActionsHeading: {
        color: '#64748B',
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 14,
    },
    quickActionsGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 12,
    },
    quickActionCard: {
        width: '22%',
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
        color: '#64748B',
        fontSize: 12,
        fontWeight: '600',
        textAlign: 'center',
    },
    completeProfileCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 18,
        borderWidth: 1,
        marginBottom: 24,
        gap: 14,
    },
    completeProfileIcon: {
        width: 44,
        height: 44,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    completeProfileContent: {
        flex: 1,
    },
    completeProfileTitle: {
        fontSize: 15,
        fontWeight: '700',
        marginBottom: 2,
    },
    completeProfileDesc: {
        fontSize: 12,
        lineHeight: 17,
    },
    completeProfilePill: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 10,
    },
    completeProfilePillText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '700',
    },
    upgradeLineWrap: {
        marginBottom: 16,
        borderRadius: 14,
        shadowColor: '#6366F1',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.22,
        shadowRadius: 8,
        elevation: 4,
    },
    upgradeLine: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 12,
    },
    upgradeIconWrap: {
        width: 26,
        height: 26,
        borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.18)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    upgradeLineText: {
        flex: 1,
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '800',
    },
    creatorBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        marginBottom: 24,
    },
    creatorIcon: {
        width: 48,
        height: 48,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    creatorContent: {
        flex: 1,
        marginLeft: 14,
        marginRight: 8,
    },
    creatorTitle: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 2,
    },
    creatorDesc: {
        fontSize: 13,
        lineHeight: 18,
    },
    menuGroup: {
        marginBottom: 24,
    },
    groupTitle: {
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 12,
    },
    adminHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
    },
    menuCard: {
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
    },
    menuIcon: {
        width: 40,
        height: 40,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
    },
    menuText: {
        flex: 1,
    },
    menuTitle: {
        fontSize: 15,
        fontWeight: '600',
        marginBottom: 2,
    },
    menuDesc: {
        fontSize: 12,
    },
    logoutBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        marginTop: 8,
    },
    logoutText: {
        color: '#ef4444',
        fontWeight: '600',
        fontSize: 15,
        marginLeft: 10,
    },
    footer: {
        alignItems: 'center',
        marginTop: 32,
    },
    footerLogo: {
        width: 60,
        height: 60,
        marginBottom: 12,
        opacity: 0.6,
    },
    footerText: {
        fontSize: 12,
        fontWeight: '600',
    },
    footerSubtext: {
        fontSize: 11,
        marginTop: 4,
    },
    premiumButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12,
    },
    premiumButtonText: {
        fontSize: 12,
        fontWeight: '700',
    },
});
