import React from 'react';
import {
    View,
    Text,
    Modal,
    Pressable,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
    X,
    Compass,
    Bookmark,
    CheckCircle2,
    Clock,
    Target,
    Route,
    FileText,
    Sparkles,
    Wallet,
    SearchCheck,
    Newspaper,
    HelpCircle,
} from 'lucide-react-native';
import { EdutuLogo } from '../branding/EdutuLogo';

type FeatureItem = {
    key: string;
    label: string;
    description: string;
    route: string;
    Icon: typeof Compass;
    tint: string;
};

/**
 * Slide-down feature menu opened from the header hamburger. One tap per
 * feature — a plain navigation directory, deliberately simpler than the tab
 * bar so every corner of the app is reachable from one place.
 */
export function FeatureMenu({
    visible,
    onClose,
    isDark,
    colors,
}: {
    visible: boolean;
    onClose: () => void;
    isDark: boolean;
    colors: any;
}) {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { t } = useTranslation('home');

    const textPrimary = colors.foreground;
    const textSecondary = isDark ? '#94A3B8' : '#64748B';
    const cardBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)';

    const items: FeatureItem[] = [
        { key: 'opportunities', label: t('menu.opportunities', { defaultValue: 'Opportunities' }), description: t('menu.opportunitiesDesc', { defaultValue: 'Scholarships, internships & more' }), route: '/opportunities', Icon: Compass, tint: '#6366F1' },
        { key: 'saved', label: t('menu.saved', { defaultValue: 'Saved' }), description: t('menu.savedDesc', { defaultValue: 'Your bookmarked opportunities' }), route: '/saved', Icon: Bookmark, tint: '#F59E0B' },
        { key: 'applied', label: t('menu.applied', { defaultValue: 'Applications' }), description: t('menu.appliedDesc', { defaultValue: 'Track what you applied to' }), route: '/applied', Icon: CheckCircle2, tint: '#10B981' },
        { key: 'deadlines', label: t('menu.deadlines', { defaultValue: 'Deadlines' }), description: t('menu.deadlinesDesc', { defaultValue: 'Never miss a closing date' }), route: '/deadlines', Icon: Clock, tint: '#EF4444' },
        { key: 'goals', label: t('menu.goals', { defaultValue: 'Goals' }), description: t('menu.goalsDesc', { defaultValue: 'Set targets and follow through' }), route: '/goals', Icon: Target, tint: '#8B5CF6' },
        { key: 'roadmaps', label: t('menu.roadmaps', { defaultValue: 'Roadmaps' }), description: t('menu.roadmapsDesc', { defaultValue: 'Step-by-step plans to win' }), route: '/roadmaps', Icon: Route, tint: '#0EA5E9' },
        { key: 'cv', label: t('menu.cv', { defaultValue: 'CV Builder' }), description: t('menu.cvDesc', { defaultValue: 'Build and export your CV' }), route: '/cv', Icon: FileText, tint: '#14B8A6' },
        { key: 'chat', label: t('menu.chat', { defaultValue: 'Ask Edutu AI' }), description: t('menu.chatDesc', { defaultValue: 'Your AI opportunity coach' }), route: '/chat', Icon: Sparkles, tint: '#6366F1' },
        { key: 'savedSearches', label: t('menu.savedSearches', { defaultValue: 'Alerts' }), description: t('menu.savedSearchesDesc', { defaultValue: 'Saved searches & new-match alerts' }), route: '/saved-searches', Icon: SearchCheck, tint: '#F97316' },
        { key: 'news', label: t('menu.news', { defaultValue: 'News' }), description: t('menu.newsDesc', { defaultValue: 'Trending opportunity news' }), route: '/notifications', Icon: Newspaper, tint: '#3B82F6' },
        { key: 'wallet', label: t('menu.wallet', { defaultValue: 'Wallet' }), description: t('menu.walletDesc', { defaultValue: 'Credits and billing' }), route: '/wallet', Icon: Wallet, tint: '#22C55E' },
        { key: 'help', label: t('menu.help', { defaultValue: 'Help & support' }), description: t('menu.helpDesc', { defaultValue: 'FAQs and contact' }), route: '/help', Icon: HelpCircle, tint: '#64748B' },
    ];

    const openFeature = (route: string) => {
        onClose();
        // Let the modal dismiss before navigating so the transition is clean.
        setTimeout(() => router.push(route as never), 120);
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent
            onRequestClose={onClose}
        >
            <Pressable style={styles.backdrop} onPress={onClose} />
            <View
                style={[
                    styles.sheet,
                    {
                        backgroundColor: colors.background,
                        paddingTop: insets.top + 8,
                        borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                    },
                ]}
            >
                <View style={styles.sheetHeader}>
                    <View style={styles.sheetBrand}>
                        <EdutuLogo size={30} frameless />
                        <Text style={[styles.sheetTitle, { color: textPrimary }]}>
                            {t('menu.title', { defaultValue: 'Explore Edutu' })}
                        </Text>
                    </View>
                    <TouchableOpacity
                        onPress={onClose}
                        accessibilityRole="button"
                        accessibilityLabel={t('menu.close', { defaultValue: 'Close menu' })}
                        style={[styles.closeBtn, { backgroundColor: cardBg }]}
                    >
                        <X size={20} color={textSecondary} />
                    </TouchableOpacity>
                </View>

                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
                >
                    {items.map(({ key, label, description, route, Icon, tint }) => (
                        <TouchableOpacity
                            key={key}
                            onPress={() => openFeature(route)}
                            activeOpacity={0.7}
                            style={[styles.item, { backgroundColor: cardBg }]}
                        >
                            <View style={[styles.itemIcon, { backgroundColor: `${tint}1F` }]}>
                                <Icon size={19} color={tint} />
                            </View>
                            <View style={styles.itemBody}>
                                <Text style={[styles.itemLabel, { color: textPrimary }]}>{label}</Text>
                                <Text style={[styles.itemDesc, { color: textSecondary }]} numberOfLines={1}>
                                    {description}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(2,6,23,0.5)',
    },
    sheet: {
        flex: 1,
        marginTop: 0,
        borderBottomWidth: 1,
    },
    sheetHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingBottom: 12,
    },
    sheetBrand: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    sheetTitle: {
        fontSize: 18,
        fontWeight: '800',
    },
    closeBtn: {
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
    },
    list: {
        paddingHorizontal: 20,
        gap: 10,
    },
    item: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 14,
    },
    itemIcon: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    itemBody: {
        flex: 1,
    },
    itemLabel: {
        fontSize: 14,
        fontWeight: '700',
    },
    itemDesc: {
        fontSize: 12,
        marginTop: 2,
    },
});
