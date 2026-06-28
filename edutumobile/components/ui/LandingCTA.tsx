import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { UserPlus, Map, ArrowRight } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { AnimatedPressable } from './AnimatedPressable';

interface LandingCTAProps {
    title?: string;
    subtitle?: string;
}

export default function LandingCTA({
    title = 'Ready to Get Started?',
    subtitle = 'Join as a mentor or explore personalized roadmaps',
}: LandingCTAProps) {
    const { isSignedIn } = useAuth();
    const { user } = useUser();
    const router = useRouter();
    const { colors, isDark } = useTheme();

    const handleMentorApply = () => {
        if (isSignedIn) {
            router.push('/(app)/mentor-apply');
        } else {
            router.push('/(auth)/sign-up');
        }
    };

    const handleSeeRoadmaps = () => {
        if (!isSignedIn) {
            router.push('/(auth)/sign-in');
        } else if (!user?.unsafeMetadata?.onboardingComplete) {
            router.push('/onboarding');
        } else {
            router.push('/(app)/roadmaps');
        }
    };

    return (
        <View style={styles.container}>
            <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text>

            <View style={styles.buttonsContainer}>
                <AnimatedPressable
                    hapticFeedback="medium"
                    onPress={handleMentorApply}
                    style={styles.primaryButtonWrapper}
                >
                    <LinearGradient
                        colors={[colors.accent, colors.primary || colors.accent]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[styles.primaryButton, { borderRadius: 18 }]}
                    >
                        <UserPlus size={20} color="#ffffff" />
                        <Text style={styles.primaryButtonText}>Apply as Mentor</Text>
                        <ArrowRight size={20} color="#ffffff" />
                    </LinearGradient>
                </AnimatedPressable>

                <AnimatedPressable
                    hapticFeedback="medium"
                    onPress={handleSeeRoadmaps}
                    style={styles.secondaryButtonWrapper}
                >
                    <View style={[styles.secondaryButton, { borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 18 }]}>
                        <Map size={20} color={colors.accent} />
                        <Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>See Roadmaps</Text>
                        <ArrowRight size={20} color={colors.accent} />
                    </View>
                </AnimatedPressable>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        paddingHorizontal: 24,
        gap: 24,
    },
    title: {
        fontSize: 24,
        fontWeight: '800',
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 15,
        textAlign: 'center',
        lineHeight: 22,
    },
    buttonsContainer: {
        width: '100%',
        gap: 12,
    },
    primaryButtonWrapper: {
        width: '100%',
        height: 58,
    },
    primaryButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 58,
        gap: 10,
    },
    primaryButtonText: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '700',
    },
    secondaryButtonWrapper: {
        width: '100%',
        height: 58,
    },
    secondaryButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 58,
        borderWidth: 1.5,
        gap: 10,
    },
    secondaryButtonText: {
        fontSize: 16,
        fontWeight: '600',
    },
});
