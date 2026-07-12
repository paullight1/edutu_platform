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
    Mail,
    MapPin,
    Briefcase,
    GraduationCap,
    Edit3,
    Sparkles,
    Crown,
    Users,
    Wrench,
    Megaphone,
    Zap,
    Target,
    CheckCircle2,
    Calendar,
    Tag,
    BadgeCheck,
} from 'lucide-react-native';
import { useUser, useAuth } from '@clerk/clerk-expo';
import { useFocusEffect, useRouter } from 'expo-router';
import { ScreenHeader } from "../../../components/ui/ScreenHeader";
import { useTheme } from "../../../components/context/ThemeContext";
import { supabase } from "../../../lib/supabase";
import { toSafeUUID } from "@edutu/core/src/utils/auth";
import { fetchProfile, type BackendProfile } from '@edutu/core/src/services/profile';
import { setProfileFabHidden } from '../../../lib/navFabStore';
import { useOpportunities } from '@edutu/core/src/hooks/useOpportunities';
import { useProStatus } from '@edutu/core/src/hooks/useProStatus';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import i18n from '../../../lib/i18n';

function PremiumButton({ isPro }: { isPro: boolean }) {
    const router = useRouter();
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
            onPress={() => router.push('/paywall')}
            activeOpacity={0.7}
        >
            <Crown size={16} color="#F59E0B" />
            <Text style={[styles.premiumButtonText, { color: '#F59E0B' }]}>{t('view.premium')}</Text>
        </TouchableOpacity>
    );
}

function getUserLookupIds(userId: string): string[] {
    return Array.from(new Set([userId, toSafeUUID(userId)]));
}

function formatProfileDeadline(deadline?: string | null): string {
    if (!deadline) return i18n.t('profile:view.deadline.none');

    const dueDate = new Date(deadline);
    if (Number.isNaN(dueDate.getTime())) return i18n.t('profile:view.deadline.none');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dueDay = new Date(dueDate);
    dueDay.setHours(0, 0, 0, 0);

    const diffDays = Math.ceil((dueDay.getTime() - today.getTime()) / 86400000);
    if (diffDays <= 0) return i18n.t('profile:view.deadline.today');
    if (diffDays === 1) return i18n.t('profile:view.deadline.tomorrow');
    if (diffDays <= 7) return i18n.t('profile:view.deadline.days', { count: diffDays });

    return dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function ProfileStatCard({
    title,
    value,
    icon: Icon,
    colors,
    onPress,
}: {
    title: string;
    value: string | number;
    icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
    colors: [string, string];
    onPress?: () => void;
}) {
    return (
        <TouchableOpacity activeOpacity={0.82} onPress={onPress} style={styles.statCard}>
            <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.statGradient}>
                <View style={styles.statGhostIcon}>
                    <Icon size={42} color="rgba(255,255,255,0.16)" strokeWidth={1.5} />
                </View>
                <Text style={styles.statTitle} numberOfLines={1}>{title}</Text>
                <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{value}</Text>
            </LinearGradient>
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

    const textSecondary = isDark ? '#94A3B8' : '#64748B';
    // Set when the user skipped onboarding — we surface a resume card so they
    // can finish personalizing without being trapped in the onboarding flow.
    const profilePending = Boolean(user?.unsafeMetadata?.profilePending);
    const { isPro } = useProStatus(supabase, user?.id || null);
    const [isAdmin, setIsAdmin] = useState(false);
    // Canonical saved profile (backend row) — the header must reflect what the
    // user actually saved on the edit screen, not stale onboarding metadata.
    const [savedProfile, setSavedProfile] = useState<BackendProfile | null>(null);
    const [profileStats, setProfileStats] = useState({
        activeGoals: 0,
        completedGoals: 0,
        appliedOpps: 0,
        nextDeadline: formatProfileDeadline(null),
    });

    const { data: matchedOpportunities } = useOpportunities({
        supabase,
        userId: user?.id,
        getAuthToken: getToken,
    });

    // Refetch on every focus so returning from the edit screen shows the
    // values that were just saved (the screen stays mounted behind the stack).
    useFocusEffect(
        useCallback(() => {
            let cancelled = false;
            const loadSavedProfile = async () => {
                if (!user) return;
                const data = await fetchProfile(getToken);
                if (data && !cancelled) setSavedProfile(data);
            };
            loadSavedProfile();
            return () => {
                cancelled = true;
            };
        }, [user?.id, getToken])
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
                    .select('role')
                    .eq('user_id', toSafeUUID(user.id))
                    .single();
                setIsAdmin(data?.role === 'admin');
            } catch (e) {
                console.error('Failed to check role:', e);
            }
        };
        checkRole();
    }, [user]);

    useEffect(() => {
        const fetchProfileStats = async () => {
            if (!user) return;

            try {
                const lookupIds = getUserLookupIds(user.id);
                const { data: goalRows } = await supabase
                    .from('goals')
                    .select('id, title, status, progress, deadline')
                    .in('user_id', lookupIds);

                const goals = goalRows || [];
                const activeGoals = goals.filter((goal: any) =>
                    goal.status === 'active' && Number(goal.progress || 0) < 100
                );
                const completedGoals = goals.filter((goal: any) =>
                    goal.status === 'completed' || Number(goal.progress || 0) >= 100
                );

                const { count: appliedCount } = await supabase
                    .from('opportunity_applications')
                    .select('*', { count: 'exact', head: true })
                    .in('user_id', lookupIds);

                const { data: bookmarks } = await supabase
                    .from('bookmarks')
                    .select('opportunity_id')
                    .in('user_id', lookupIds);

                const uniqueBookmarkIds = Array.from(new Set(bookmarks?.map((bookmark: any) => bookmark.opportunity_id) || []));
                let nextDeadline = formatProfileDeadline(null);

                if (uniqueBookmarkIds.length > 0) {
                    const { data: opps } = await supabase
                        .from('opportunities')
                        .select('title, deadline, close_date')
                        .in('id', uniqueBookmarkIds)
                        .limit(100);

                    const nextSavedDeadline = (opps || [])
                        .map((opp: any) => ({ ...opp, due: opp.deadline || opp.close_date }))
                        .filter((opp: any) => opp.due && new Date(opp.due).getTime() >= Date.now())
                        .sort((a: any, b: any) => new Date(a.due).getTime() - new Date(b.due).getTime())[0];

                    nextDeadline = formatProfileDeadline(nextSavedDeadline?.due);
                }

                setProfileStats({
                    activeGoals: activeGoals.length,
                    completedGoals: completedGoals.length,
                    appliedOpps: appliedCount || 0,
                    nextDeadline,
                });
            } catch (error) {
                console.error('Failed to fetch profile stats:', error);
            }
        };

        fetchProfileStats();
    }, [user]);

    const menuGroups = [
        {
            title: t('view.menu.tools'),
            items: [
                { id: 'creator', title: t('view.menu.creatorStudio'), desc: t('view.menu.creatorStudioDesc'), icon: LayoutGrid, route: '/creator-dashboard', color: '#6366F1', bg: 'rgba(99,102,241,0.15)' },
                { id: 'cv', title: t('view.menu.cvBuilder'), desc: t('view.menu.cvBuilderDesc'), icon: FileText, route: '/cv', color: '#10B981', bg: 'rgba(16,185,129,0.15)' },
                { id: 'chat', title: t('view.menu.aiCoach'), desc: t('view.menu.aiCoachDesc'), icon: MessageCircle, route: '/chat', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
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
                {/* Clean Profile Card */}
                <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={styles.profileHeader}>
                        {/* Avatar */}
                        <View style={styles.avatarSection}>
                            {user?.imageUrl ? (
                                <Image
                                    source={{ uri: user.imageUrl }}
                                    style={styles.avatar}
                                />
                            ) : (
                                <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primary }]}>
                                    <User size={40} color="#fff" />
                                </View>
                            )}
                            <TouchableOpacity
                                style={[styles.editAvatarBtn, { backgroundColor: colors.primary }]}
                                onPress={() => router.push('/profile/edit')}
                            >
                                <Edit3 size={14} color="#fff" />
                            </TouchableOpacity>
                        </View>

                        {/* User Info */}
                        <View style={styles.userInfo}>
                            <View style={styles.userNameRow}>
                                <Text style={[styles.userName, { color: colors.foreground }]}>
                                    {user?.fullName || t('view.userFallback')}
                                </Text>
                                {isPro && (
                                    <BadgeCheck
                                        size={20}
                                        color="#FFFFFF"
                                        fill="#3B82F6"
                                        accessibilityLabel={t('view.verified')}
                                    />
                                )}
                            </View>
                            <Text style={[styles.userEmail, { color: textSecondary }]}>
                                {user?.primaryEmailAddress?.emailAddress || ''}
                            </Text>
                        </View>
                    </View>

                    {/* Quick Info Row */}
                    <View style={[styles.infoRow, { borderTopColor: colors.border }]}>
                        <View style={styles.infoItem}>
                            <MapPin size={16} color={textSecondary} />
                            <Text style={[styles.infoText, { color: textSecondary }]}>
                                {savedProfile?.country || (user?.unsafeMetadata?.country as string) || t('view.notSet')}
                            </Text>
                        </View>
                        <View style={styles.infoDivider} />
                        <View style={styles.infoItem}>
                            <GraduationCap size={16} color={textSecondary} />
                            <Text style={[styles.infoText, { color: textSecondary }]}>
                                {savedProfile?.major || savedProfile?.school || (user?.unsafeMetadata?.education as string) || t('view.studentFallback')}
                            </Text>
                        </View>
                    </View>

                    {/* Edit Profile Button */}
                    <TouchableOpacity
                        style={[styles.editProfileBtn, { backgroundColor: colors.primary }]}
                        onPress={() => router.push('/profile/edit')}
                    >
                        <Edit3 size={16} color="#fff" />
                        <Text style={styles.editProfileText}>{t('view.editProfile')}</Text>
                    </TouchableOpacity>
                </View>

                {profilePending && (
                    <Animated.View entering={FadeInDown.duration(360)}>
                        <TouchableOpacity
                            style={[styles.completeProfileCard, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '33' }]}
                            onPress={() => router.push('/onboarding')}
                            activeOpacity={0.85}
                        >
                            <View style={[styles.completeProfileIcon, { backgroundColor: colors.primary }]}>
                                <Sparkles size={22} color="#fff" />
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

                <View style={styles.statsSection}>
                    <View style={styles.statsGrid}>
                        <ProfileStatCard
                            title={t('view.stats.activeGoals')}
                            value={String(profileStats.activeGoals)}
                            icon={Target}
                            colors={['#3B4FE4', '#6366F1']}
                            onPress={() => router.push('/goals')}
                        />
                        <ProfileStatCard
                            title={t('view.stats.matches')}
                            value={String(matchedOpportunities.length)}
                            icon={Sparkles}
                            colors={['#2563eb', '#3b82f6']}
                            onPress={() => router.push('/opportunities')}
                        />
                        <ProfileStatCard
                            title={t('view.stats.applied')}
                            value={String(profileStats.appliedOpps)}
                            icon={CheckCircle2}
                            colors={['#059669', '#10B981']}
                            onPress={() => router.push('/applied')}
                        />
                        <ProfileStatCard
                            title={t('view.stats.deadline')}
                            value={profileStats.nextDeadline}
                            icon={Calendar}
                            colors={['#D97706', '#F59E0B']}
                            onPress={() => router.push('/deadlines')}
                        />
                    </View>
                </View>

                {/* Upgrade to Premium */}
                {!isPro && (
                    <Animated.View entering={FadeInDown.duration(360)}>
                        <TouchableOpacity
                            onPress={() => router.push('/paywall')}
                            activeOpacity={0.88}
                            style={styles.upgradeCardWrap}
                        >
                            <LinearGradient
                                colors={['#4338CA', '#6366F1', '#8B5CF6']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.upgradeCard}
                            >
                                <View style={styles.upgradeGhostIcon}>
                                    <Crown size={92} color="rgba(255,255,255,0.12)" strokeWidth={1.2} />
                                </View>
                                <View style={styles.upgradeHeader}>
                                    <View style={styles.upgradeIconWrap}>
                                        <Zap size={18} color="#FDE047" fill="#FDE047" />
                                    </View>
                                    <Text style={styles.upgradeTitle}>{t('view.upgrade.title')}</Text>
                                </View>
                                <Text style={styles.upgradeDesc}>{t('view.upgrade.desc')}</Text>
                                <View style={styles.upgradePerks}>
                                    {[t('view.upgrade.perk1'), t('view.upgrade.perk2'), t('view.upgrade.perk3')].map((perk) => (
                                        <View key={perk} style={styles.upgradePerkRow}>
                                            <BadgeCheck size={14} color="#4338CA" fill="#FFFFFF" />
                                            <Text style={styles.upgradePerkText}>{perk}</Text>
                                        </View>
                                    ))}
                                </View>
                                <View style={styles.upgradeCta}>
                                    <Crown size={16} color="#4338CA" />
                                    <Text style={styles.upgradeCtaText}>{t('view.upgrade.cta')}</Text>
                                </View>
                            </LinearGradient>
                        </TouchableOpacity>
                    </Animated.View>
                )}

                {/* Become a Creator Banner */}
                <TouchableOpacity
                    style={[styles.creatorBanner, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '30' }]}
                    onPress={() => router.push('/creator-apply')}
                    activeOpacity={0.8}
                >
                    <View style={[styles.creatorIcon, { backgroundColor: colors.primary }]}>
                        <Crown size={24} color="#fff" />
                    </View>
                    <View style={styles.creatorContent}>
                        <Text style={[styles.creatorTitle, { color: colors.foreground }]}>
                            {t('view.becomeCreator')}
                        </Text>
                        <Text style={[styles.creatorDesc, { color: textSecondary }]}>
                            {t('view.becomeCreatorDesc')}
                        </Text>
                    </View>
                    <ChevronRight size={20} color={colors.primary} />
                </TouchableOpacity>

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
                    onPress={() => signOut()}
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
    profileCard: {
        borderRadius: 20,
        padding: 20,
        marginBottom: 24,
        borderWidth: 1,
    },
    profileHeader: {
        alignItems: 'center',
    },
    avatarSection: {
        position: 'relative',
        marginBottom: 16,
    },
    avatar: {
        width: 100,
        height: 100,
        borderRadius: 50,
    },
    avatarPlaceholder: {
        width: 100,
        height: 100,
        borderRadius: 50,
        alignItems: 'center',
        justifyContent: 'center',
    },
    editAvatarBtn: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: '#fff',
    },
    userInfo: {
        alignItems: 'center',
    },
    userNameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 4,
    },
    userName: {
        fontSize: 22,
        fontWeight: '600',
    },
    userEmail: {
        fontSize: 14,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 20,
        paddingTop: 16,
        borderTopWidth: 1,
    },
    infoItem: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        justifyContent: 'center',
    },
    infoText: {
        fontSize: 13,
        marginLeft: 6,
    },
    infoDivider: {
        width: 1,
        height: 20,
        backgroundColor: 'rgba(0,0,0,0.1)',
    },
    editProfileBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 20,
        paddingVertical: 12,
        borderRadius: 12,
        gap: 8,
    },
    editProfileText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '600',
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
    statsSection: {
        marginBottom: 24,
    },
    statsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    statCard: {
        width: '48%',
        height: 96,
        borderRadius: 20,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 3,
    },
    statGradient: {
        flex: 1,
        justifyContent: 'center',
        padding: 14,
        gap: 8,
    },
    statGhostIcon: {
        position: 'absolute',
        right: -10,
        bottom: -10,
        transform: [{ rotate: '-8deg' }],
    },
    statTitle: {
        color: 'rgba(255,255,255,0.82)',
        fontSize: 9,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.4,
    },
    statValue: {
        color: '#FFFFFF',
        fontSize: 25,
        fontWeight: '900',
    },
    upgradeCardWrap: {
        marginBottom: 24,
        borderRadius: 20,
        shadowColor: '#6366F1',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.28,
        shadowRadius: 12,
        elevation: 6,
    },
    upgradeCard: {
        borderRadius: 20,
        padding: 18,
        overflow: 'hidden',
    },
    upgradeGhostIcon: {
        position: 'absolute',
        right: -16,
        top: -14,
        transform: [{ rotate: '12deg' }],
    },
    upgradeHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 6,
    },
    upgradeIconWrap: {
        width: 30,
        height: 30,
        borderRadius: 9,
        backgroundColor: 'rgba(255,255,255,0.18)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    upgradeTitle: {
        color: '#FFFFFF',
        fontSize: 17,
        fontWeight: '800',
        flex: 1,
    },
    upgradeDesc: {
        color: 'rgba(255,255,255,0.85)',
        fontSize: 13,
        lineHeight: 18,
        marginBottom: 12,
    },
    upgradePerks: {
        gap: 6,
        marginBottom: 14,
    },
    upgradePerkRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    upgradePerkText: {
        color: 'rgba(255,255,255,0.95)',
        fontSize: 12.5,
        fontWeight: '600',
    },
    upgradeCta: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        paddingVertical: 11,
    },
    upgradeCtaText: {
        color: '#4338CA',
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
