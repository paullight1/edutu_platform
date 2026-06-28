import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    Image
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
} from 'lucide-react-native';
import { useUser, useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { ScreenHeader } from "../../../components/ui/ScreenHeader";
import { useTheme } from "../../../components/context/ThemeContext";
import { supabase } from "../../../lib/supabase";
import { toSafeUUID } from "@edutu/core/src/utils/auth";
import { useOpportunities } from '@edutu/core/src/hooks/useOpportunities';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';

function PremiumButton() {
    const router = useRouter();
    const { isDark, colors } = useTheme();

    return (
        <TouchableOpacity
            style={[styles.premiumButton, { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : 'rgba(245, 158, 11, 0.1)' }]}
            onPress={() => router.push('/paywall')}
            activeOpacity={0.7}
        >
            <Crown size={16} color="#F59E0B" />
            <Text style={[styles.premiumButtonText, { color: '#F59E0B' }]}>Premium</Text>
        </TouchableOpacity>
    );
}

function getUserLookupIds(userId: string): string[] {
    return Array.from(new Set([userId, toSafeUUID(userId)]));
}

function formatProfileDeadline(deadline?: string | null): string {
    if (!deadline) return 'None';

    const dueDate = new Date(deadline);
    if (Number.isNaN(dueDate.getTime())) return 'None';

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dueDay = new Date(dueDate);
    dueDay.setHours(0, 0, 0, 0);

    const diffDays = Math.ceil((dueDay.getTime() - today.getTime()) / 86400000);
    if (diffDays <= 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays <= 7) return `${diffDays} days`;

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

    const textSecondary = isDark ? '#94A3B8' : '#64748B';
    const [isAdmin, setIsAdmin] = useState(false);
    const [profileStats, setProfileStats] = useState({
        activeGoals: 0,
        completedGoals: 0,
        appliedOpps: 0,
        nextDeadline: 'None',
    });

    const { data: matchedOpportunities } = useOpportunities({
        supabase,
        userId: user?.id,
        getAuthToken: getToken,
    });

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
                let nextDeadline = 'None';

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
            title: 'Tools',
            items: [
                { id: 'creator', title: 'Creator Studio', desc: 'Build & manage your shop', icon: LayoutGrid, route: '/creator-dashboard', color: '#6366F1', bg: 'rgba(99,102,241,0.15)' },
                { id: 'cv', title: 'CV Builder', desc: 'Professional profile builder', icon: FileText, route: '/cv', color: '#10B981', bg: 'rgba(16,185,129,0.15)' },
                { id: 'chat', title: 'AI Coach', desc: 'Get personalized guidance', icon: MessageCircle, route: '/chat', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
            ]
        },
        {
            title: 'Preferences',
            items: [
                { id: 'notifications', title: 'Notifications', desc: 'Stay updated on progress', icon: Bell, route: '/notifications', color: '#F59E0B', bg: 'rgba(245,158,11,0.15)' },
                { id: 'settings', title: 'Settings', desc: 'Theme & app preferences', icon: Settings, route: '/profile/settings', color: '#64748B', bg: 'rgba(100,116,139,0.15)' },
            ]
        },
        {
            title: 'Support',
            items: [
                { id: 'help', title: 'Help & Support', desc: 'FAQ & direct assistance', icon: HelpCircle, route: '/help', color: '#06B6D4', bg: 'rgba(6,182,212,0.15)' },
                { id: 'security', title: 'Privacy', desc: 'Data & visibility control', icon: Shield, route: '/privacy', color: '#EC4899', bg: 'rgba(236,72,153,0.15)' },
            ]
        }
    ];

    const adminMenuItems = [
        { id: 'creator-apps', title: 'Creator Applications', desc: 'Review and approve creators', icon: Users, route: '/admin/creator-applications', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
        { id: 'create-roadmap', title: 'Create Roadmap', desc: 'Add new learning paths', icon: Megaphone, route: '/admin/roadmap/create', color: '#06B6D4', bg: 'rgba(6,182,212,0.15)' },
        { id: 'testimonials', title: 'Testimonials', desc: 'Manage reviews and videos', icon: MessageCircle, route: '/admin/testimonials', color: '#F59E0B', bg: 'rgba(245,158,11,0.15)' },
        { id: 'premium-features', title: 'Premium Features', desc: 'OTA feature flags control', icon: Crown, route: '/admin/premium-features', color: '#10B981', bg: 'rgba(16,185,129,0.15)' },
    ];

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
            <ScreenHeader title="Profile" showBack right={<PremiumButton />} />
            <ScrollView
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
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
                            <Text style={[styles.userName, { color: colors.foreground }]}>
                                {user?.fullName || 'User'}
                            </Text>
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
                                {user?.unsafeMetadata?.country as string || 'Not set'}
                            </Text>
                        </View>
                        <View style={styles.infoDivider} />
                        <View style={styles.infoItem}>
                            <GraduationCap size={16} color={textSecondary} />
                            <Text style={[styles.infoText, { color: textSecondary }]}>
                                {user?.unsafeMetadata?.education as string || 'Student'}
                            </Text>
                        </View>
                    </View>

                    {/* Edit Profile Button */}
                    <TouchableOpacity
                        style={[styles.editProfileBtn, { backgroundColor: colors.primary }]}
                        onPress={() => router.push('/profile/edit')}
                    >
                        <Edit3 size={16} color="#fff" />
                        <Text style={styles.editProfileText}>Edit Profile</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.statsSection}>
                    <View style={styles.statsGrid}>
                        <ProfileStatCard
                            title="Active goals"
                            value={String(profileStats.activeGoals)}
                            icon={Target}
                            colors={['#3B4FE4', '#6366F1']}
                            onPress={() => router.push('/goals')}
                        />
                        <ProfileStatCard
                            title="Matches"
                            value={String(matchedOpportunities.length)}
                            icon={Sparkles}
                            colors={['#2563eb', '#3b82f6']}
                            onPress={() => router.push('/opportunities')}
                        />
                        <ProfileStatCard
                            title="Applied"
                            value={String(profileStats.appliedOpps)}
                            icon={CheckCircle2}
                            colors={['#059669', '#10B981']}
                            onPress={() => router.push('/applied')}
                        />
                        <ProfileStatCard
                            title="Deadline"
                            value={profileStats.nextDeadline}
                            icon={Calendar}
                            colors={['#D97706', '#F59E0B']}
                            onPress={() => router.push('/deadlines')}
                        />
                    </View>
                </View>

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
                            Become a Creator
                        </Text>
                        <Text style={[styles.creatorDesc, { color: textSecondary }]}>
                            Share your scholarship journey and help others succeed
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
                                Admin
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
                    <Text style={styles.logoutText}>Log Out</Text>
                </TouchableOpacity>

                {/* Footer */}
                <View style={styles.footer}>
                    <Image
                        source={require('../../../assets/logo1.png')}
                        style={styles.footerLogo}
                        resizeMode="contain"
                    />
                    <Text style={[styles.footerText, { color: textSecondary }]}>Edutu v1.2</Text>
                    <Text style={[styles.footerSubtext, { color: textSecondary }]}>Empowering African Youth</Text>
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
    userName: {
        fontSize: 22,
        fontWeight: '600',
        marginBottom: 4,
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
