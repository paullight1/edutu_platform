import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight, Sparkles, Target, TrendingUp, Award, FileText, Bell, X } from 'lucide-react-native';
import Animated, {
    FadeInDown,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
    runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useTheme } from '../../components/context/ThemeContext';

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

export const BANNER_PRESETS: Record<string, BannerConfig> = {
    completeProfile: {
        id: 'complete-profile',
        title: 'Get Personalized Opportunities',
        subtitle: 'Complete your profile to see matches tailored to your skills and interests',
        gradient: ['#F97316', '#EA580C'],
        icon: Sparkles,
        actionLabel: 'Complete Profile',
        route: '/onboarding',
    },
    exploreOpportunities: {
        id: 'explore-opportunities',
        title: 'Discover New Opportunities',
        subtitle: 'Browse scholarships, internships, and programs matched to your profile',
        gradient: ['#10B981', '#059669'],
        icon: Target,
        actionLabel: 'Explore Now',
        route: '/opportunities',
    },
    buildCV: {
        id: 'build-cv',
        title: 'Build Your Perfect CV',
        subtitle: 'Create a professional CV with AI-powered templates and smart suggestions',
        gradient: ['#0EA5E9', '#3B82F6'],
        icon: FileText,
        actionLabel: 'Start Building',
        route: '/cv',
    },
    trackGoals: {
        id: 'track-goals',
        title: 'Stay on Track with Goals',
        subtitle: 'Set milestones and never miss an application deadline again',
        gradient: ['#F59E0B', '#EF4444'],
        icon: TrendingUp,
        actionLabel: 'Set Goals',
        route: '/goals',
    },
    upgradePro: {
        id: 'upgrade-pro',
        title: 'Unlock Pro Features',
        subtitle: 'AI CV tailoring, premium templates, and unlimited saves',
        gradient: ['#EC4899', '#F43F5E'],
        icon: Award,
        actionLabel: 'Upgrade Now',
        route: '/profile',
    },
    notifications: {
        id: 'enable-notifications',
        title: 'Never Miss a Deadline',
        subtitle: 'Turn on notifications to get reminders for upcoming opportunities',
        gradient: ['#6366F1', '#3b82f6'],
        icon: Bell,
        actionLabel: 'Enable',
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
    const { isDark } = useTheme();
    const IconComponent = config.icon;
    const translateX = useSharedValue(0);
    const opacity = useSharedValue(1);
    const [isDismissed, setIsDismissed] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (autoDismiss) {
            timerRef.current = setTimeout(() => {
                handleClose();
            }, AUTO_DISMISS_DELAY);
        }

        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
        };
    }, [autoDismiss]);

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

    const panGesture = Gesture.Pan()
        .onUpdate((event) => {
            if (swipeToDismiss) {
                translateX.value = event.translationX;
            }
        })
        .onEnd((event) => {
            if (swipeToDismiss && Math.abs(event.translationX) > SWIPE_THRESHOLD) {
                translateX.value = withSpring(event.translationX > 0 ? width : -width, { damping: 20 });
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
