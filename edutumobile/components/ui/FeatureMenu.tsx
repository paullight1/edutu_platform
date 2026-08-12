import React, { useEffect, useMemo, useState } from 'react';
import {
    PanResponder,
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
    X,
    Bookmark,
    CheckCircle2,
    Clock,
    Wallet,
    SearchCheck,
    Newspaper,
    HelpCircle,
} from 'lucide-react-native';
import { EdutuLogo } from '../branding/EdutuLogo';
import { shouldCloseFeatureMenuOnSwipe } from './featureMenuGesture';

type FeatureItem = {
    key: string;
    label: string;
    description: string;
    route: string;
    Icon: typeof Bookmark;
    tint: string;
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
// The foreground page moves by this amount, revealing the fixed menu beneath.
export const FEATURE_MENU_WIDTH = Math.min(Math.round(SCREEN_WIDTH * 0.84), 420);
export const FEATURE_MENU_ANIM_MS = 260;

/**
 * Fixed left-side underlay menu. The app page animates right above it,
 * revealing the background layer without floating the menu over content.
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

    const swipeResponder = useMemo(() => {
        const shouldSetSwipeResponder = (_event: unknown, gesture: { dx: number; dy: number }) => (
            visible
            && gesture.dx < -14
            && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.25
        );

        return PanResponder.create({
            // Capture horizontal gestures before the inner ScrollView can claim
            // them, while leaving vertical scrolling untouched.
            onMoveShouldSetPanResponderCapture: shouldSetSwipeResponder,
            onMoveShouldSetPanResponder: shouldSetSwipeResponder,
            onPanResponderRelease: (_event, gesture) => {
                if (shouldCloseFeatureMenuOnSwipe(gesture)) {
                    onClose();
                }
            },
        });
    }, [onClose, visible]);

    // Keep the underlay mounted while the foreground page completes its return
    // animation, otherwise the menu would blink away before the page covers it.
    const [rendered, setRendered] = useState(visible);

    // Mount the drawer as soon as `visible` flips true — adjust-during-render
    // (React's documented alternative to a state-setting effect). Unmounting
    // stays async: it happens when the exit animation finishes.
    const [prevVisible, setPrevVisible] = useState(visible);
    if (prevVisible !== visible) {
        setPrevVisible(visible);
        if (visible) setRendered(true);
    }

    useEffect(() => {
        if (visible) return;
        const timeout = setTimeout(() => setRendered(false), FEATURE_MENU_ANIM_MS);
        return () => clearTimeout(timeout);
    }, [visible]);

    const items: FeatureItem[] = [
        { key: 'saved', label: t('menu.saved', { defaultValue: 'Saved' }), description: t('menu.savedDesc', { defaultValue: 'Your bookmarked opportunities' }), route: '/saved', Icon: Bookmark, tint: '#F59E0B' },
        { key: 'applied', label: t('menu.applied', { defaultValue: 'Applications' }), description: t('menu.appliedDesc', { defaultValue: 'Track what you applied to' }), route: '/applied', Icon: CheckCircle2, tint: '#10B981' },
        { key: 'deadlines', label: t('menu.deadlines', { defaultValue: 'Deadlines' }), description: t('menu.deadlinesDesc', { defaultValue: 'Never miss a closing date' }), route: '/deadlines', Icon: Clock, tint: '#EF4444' },
        { key: 'savedSearches', label: t('menu.savedSearches', { defaultValue: 'Alerts' }), description: t('menu.savedSearchesDesc', { defaultValue: 'Saved searches & new-match alerts' }), route: '/saved-searches', Icon: SearchCheck, tint: '#F97316' },
        { key: 'news', label: t('menu.news', { defaultValue: 'News' }), description: t('menu.newsDesc', { defaultValue: 'Trending opportunity news' }), route: '/notifications', Icon: Newspaper, tint: '#3B82F6' },
        { key: 'wallet', label: t('menu.wallet', { defaultValue: 'Wallet' }), description: t('menu.walletDesc', { defaultValue: 'Credits and billing' }), route: '/wallet', Icon: Wallet, tint: '#22C55E' },
        { key: 'help', label: t('menu.help', { defaultValue: 'Help & support' }), description: t('menu.helpDesc', { defaultValue: 'FAQs and contact' }), route: '/help', Icon: HelpCircle, tint: '#64748B' },
    ];

    const openFeature = (route: string) => {
        onClose();
        // Let the page cover the underlay before navigating.
        setTimeout(() => router.push(route as never), FEATURE_MENU_ANIM_MS);
    };

    if (!rendered) return null;

    return (
        <View
            testID="feature-menu-underlay"
            {...swipeResponder.panHandlers}
            accessibilityViewIsModal={visible}
            importantForAccessibility={visible ? 'yes' : 'no-hide-descendants'}
            pointerEvents={visible ? 'auto' : 'none'}
            style={[
                styles.drawer,
                {
                    width: FEATURE_MENU_WIDTH,
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
    );
}

const styles = StyleSheet.create({
    drawer: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        borderRightWidth: 1,
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
