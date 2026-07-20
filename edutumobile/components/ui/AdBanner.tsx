import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight, Target, TrendingUp, Award, FileText, Bell, X } from 'lucide-react-native';
import Animated, {
    FadeInDown,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
    runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import i18n from '../../lib/i18n';

const { width } = Dimensions.get('window');
const SWIPE_THRESHOLD = 80;
const AUTO_DISMISS_DELAY = 10000;

export interface BannerConfig {
    id: string;
    title: string;
    subtitle: string;
    gradient: [string, string];
    icon: React.ComponentType<{ size: number; color: string }>;
    actionLabel: string;
    route: string;
}

// Preset copy lives in the i18n catalog; getters resolve lazily so the strings
// follow the active language at render time.
export const BANNER_PRESETS: Record<string, BannerConfig> = {
    completeProfile: {
        id: 'complete-profile',
        get title() { return i18n.t('common:adBanner.completeProfile.title'); },
        get subtitle() { return i18n.t('common:adBanner.completeProfile.subtitle'); },
        gradient: ['#F97316', '#EA580C'],
        icon: Target,
        get actionLabel() { return i18n.t('common:adBanner.completeProfile.actionLabel'); },
        route: '/onboarding',
    },
    exploreOpportunities: {
        id: 'explore-opportunities',
        get title() { return i18n.t('common:adBanner.exploreOpportunities.title'); },
        get subtitle() { return i18n.t('common:adBanner.exploreOpportunities.subtitle'); },
        gradient: ['#10B981', '#059669'],
        icon: Target,
        get actionLabel() { return i18n.t('common:adBanner.exploreOpportunities.actionLabel'); },
        route: '/opportunities',
    },
    buildCV: {
        id: 'build-cv',
        get title() { return i18n.t('common:adBanner.buildCV.title'); },
        get subtitle() { return i18n.t('common:adBanner.buildCV.subtitle'); },
        gradient: ['#0EA5E9', '#3B82F6'],
        icon: FileText,
        get actionLabel() { return i18n.t('common:adBanner.buildCV.actionLabel'); },
        route: '/cv',
    },
    trackGoals: {
        id: 'track-goals',
        get title() { return i18n.t('common:adBanner.trackGoals.title'); },
        get subtitle() { return i18n.t('common:adBanner.trackGoals.subtitle'); },
        gradient: ['#F59E0B', '#EF4444'],
        icon: TrendingUp,
        get actionLabel() { return i18n.t('common:adBanner.trackGoals.actionLabel'); },
        route: '/goals',
    },
    upgradePro: {
        id: 'upgrade-pro',
        get title() { return i18n.t('common:adBanner.upgradePro.title'); },
        get subtitle() { return i18n.t('common:adBanner.upgradePro.subtitle'); },
        gradient: ['#EC4899', '#F43F5E'],
        icon: Award,
        get actionLabel() { return i18n.t('common:adBanner.upgradePro.actionLabel'); },
        route: '/profile',
    },
    notifications: {
        id: 'enable-notifications',
        get title() { return i18n.t('common:adBanner.notifications.title'); },
        get subtitle() { return i18n.t('common:adBanner.notifications.subtitle'); },
        gradient: ['#6366F1', '#3b82f6'],
        icon: Bell,
        get actionLabel() { return i18n.t('common:adBanner.notifications.actionLabel'); },
        route: '/notifications',
    },
};

interface AdBannerProps {
    config: BannerConfig;
    onPress?: () => void;
    onClose?: () => void;
    showClose?: boolean;
    autoDismiss?: boolean;
    swipeToDismiss?: boolean;
    index?: number;
}

export function AdBanner({
    config,
    onPress,
    onClose,
    showClose = false,
    autoDismiss = false,
    swipeToDismiss = false,
    index = 0,
}: AdBannerProps) {
    const IconComponent = config.icon;
    const translateX = useSharedValue(0);
    const opacity = useSharedValue(1);
    const [isDismissed, setIsDismissed] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleClose = () => {
        if (swipeToDismiss) {
            opacity.value = withTiming(0, { duration: 250 }, () => {
                runOnJS(setIsDismissed)(true);
            });
        } else {
            setIsDismissed(true);
        }
        if (onClose) {
            onClose();
        }
    };

    // Keep the latest close handler in a ref so the auto-dismiss timer effect
    // only depends on `autoDismiss` and never re-arms when the parent passes a
    // new onClose identity.
    const handleCloseRef = useRef(handleClose);
    useEffect(() => {
        handleCloseRef.current = handleClose;
    });

    useEffect(() => {
        if (autoDismiss) {
            timerRef.current = setTimeout(() => {
                handleCloseRef.current();
            }, AUTO_DISMISS_DELAY);
        }

        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
        };
    }, [autoDismiss]);

    const panGesture = Gesture.Pan()
        .onUpdate((event) => {
            if (swipeToDismiss) {
                translateX.value = event.translationX;
            }
        })
        .onEnd((event) => {
            if (swipeToDismiss && Math.abs(event.translationX) > SWIPE_THRESHOLD) {
                translateX.value = withSpring(event.translationX > 0 ? width : -width, { damping: 20 });
                // eslint-disable-next-line react-hooks/immutability -- Reanimated SharedValue write; the library's documented imperative API
                opacity.value = withTiming(0, { duration: 200 });
                if (onClose) {
                    setTimeout(onClose, 250);
                }
            } else {
                translateX.value = withSpring(0, { damping: 25 });
            }
        });

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }],
        opacity: opacity.value,
    }));

    if (isDismissed) return null;

    const bannerContent = (
        <TouchableOpacity
            activeOpacity={0.9}
            onPress={onPress}
            style={styles.bannerContainer}
        >
            <LinearGradient
                colors={config.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.bannerGradient}
            >
                {showClose && onClose && !autoDismiss && (
                    <TouchableOpacity
                        onPress={(e) => {
                            e.stopPropagation();
                            handleClose();
                        }}
                        style={styles.closeButton}
                    >
                        <X size={16} color="rgba(255,255,255,0.7)" />
                    </TouchableOpacity>
                )}
                <View style={styles.bannerContent}>
                    <View style={styles.bannerIconContainer}>
                        <IconComponent size={24} color="#FFFFFF" />
                    </View>
                    <View style={styles.bannerTextContainer}>
                        <Text style={styles.bannerTitle}>{config.title}</Text>
                        <Text style={styles.bannerSubtitle} numberOfLines={2}>
                            {config.subtitle}
                        </Text>
                    </View>
                    <TouchableOpacity
                        style={styles.actionButton}
                        onPress={(e) => {
                            e.stopPropagation();
                            onPress?.();
                        }}
                    >
                        <ChevronRight size={20} color="#FFFFFF" />
                    </TouchableOpacity>
                </View>
            </LinearGradient>
        </TouchableOpacity>
    );

    if (swipeToDismiss) {
        return (
            <Animated.View
                entering={FadeInDown.delay(index * 100)}
                style={[styles.swipeWrapper, animatedStyle]}
            >
                <GestureDetector gesture={panGesture}>
                    {bannerContent}
                </GestureDetector>
            </Animated.View>
        );
    }

    return (
        <Animated.View entering={FadeInDown.delay(index * 100)}>
            {bannerContent}
        </Animated.View>
    );
}

interface AdBannerCarouselProps {
    banners: BannerConfig[];
    onBannerPress: (config: BannerConfig) => void;
    onClose?: (id: string) => void;
    showClose?: boolean;
    autoDismiss?: boolean;
    swipeToDismiss?: boolean;
}

export function AdBannerCarousel({ banners, onBannerPress, onClose, showClose = false, autoDismiss = false, swipeToDismiss = false }: AdBannerCarouselProps) {
    if (banners.length === 0) return null;

    return (
        <View style={styles.carouselContainer}>
            {banners.map((banner, index) => (
                <AdBanner
                    key={banner.id}
                    config={banner}
                    index={index}
                    onPress={() => onBannerPress(banner)}
                    onClose={onClose ? () => onClose(banner.id) : undefined}
                    showClose={showClose}
                    autoDismiss={autoDismiss}
                    swipeToDismiss={swipeToDismiss}
                />
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    carouselContainer: {
        marginVertical: 8,
    },
    swipeWrapper: {
        width: width - 40,
    },
    bannerContainer: {
        width: width - 40,
        borderRadius: 14,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
        elevation: 4,
    },
    bannerGradient: {
        padding: 12,
    },
    closeButton: {
        position: 'absolute',
        top: 6,
        right: 6,
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: 'rgba(255,255,255,0.15)',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1,
    },
    bannerContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    bannerIconContainer: {
        width: 38,
        height: 38,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
        flexShrink: 0,
    },
    bannerTextContainer: {
        flex: 1,
    },
    bannerTitle: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '700',
        marginBottom: 3,
    },
    bannerSubtitle: {
        color: 'rgba(255,255,255,0.85)',
        fontSize: 11,
        lineHeight: 15,
    },
    actionButton: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        marginLeft: 10,
    },
});
