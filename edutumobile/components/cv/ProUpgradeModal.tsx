import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Alert, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { X, Crown, Check, Zap, Sparkles, Shield, Star } from 'lucide-react-native';
import { useTheme } from '../../components/context/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

interface Props {
    visible: boolean;
    onClose: () => void;
    feature: string;
    trialUsed: boolean;
    onTrialActivated: () => Promise<void>;
}

const { width } = Dimensions.get('window');

function PulsingCrown() {
    const scale = useSharedValue(1);
    const opacity = useSharedValue(0.6);

    React.useEffect(() => {
        scale.value = withRepeat(
            withSequence(
                withTiming(1.1, { duration: 1500 }),
                withTiming(1, { duration: 1500 })
            ),
            -1,
            true
        );
        opacity.value = withRepeat(
            withSequence(
                withTiming(1, { duration: 1500 }),
                withTiming(0.4, { duration: 1500 })
            ),
            -1,
            true
        );
    }, []);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
        opacity: opacity.value,
    }));

    return (
        <Animated.View style={animatedStyle}>
            <Crown size={56} color="#F59E0B" />
        </Animated.View>
    );
}

export function ProUpgradeModal({ visible, onClose, feature, trialUsed, onTrialActivated }: Props) {
    const { colors, isDark } = useTheme();
    const router = useRouter();
    const muted = isDark ? '#94A3B8' : '#64748B';

    const features = [
        { icon: Sparkles, label: 'Unlimited AI Roadmap Generation' },
        { icon: Check, label: 'Premium CV Templates' },
        { icon: Zap, label: 'AI-Powered CV Tailoring' },
        { icon: Star, label: 'Priority Creator Listing' },
        { icon: Shield, label: 'Advanced Opportunity Filters' },
        { icon: Check, label: 'PDF Export & Downloads' },
    ];

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent
            onRequestClose={onClose}
        >
            <View style={styles.modalOverlay}>
                <LinearGradient
                    colors={['#0F0520', '#1A0A2E', '#0D1117']}
                    style={StyleSheet.absoluteFill}
                />
                <View style={styles.modalContent}>
                    <TouchableOpacity
                        style={styles.modalClose}
                        onPress={onClose}
                    >
                        <X size={24} color={muted} />
                    </TouchableOpacity>

                    <View style={styles.crownContainer}>
                        <View style={styles.crownGlow} />
                        <PulsingCrown />
                    </View>

                    <Text style={styles.modalTitle}>
                        Unlock {feature}
                    </Text>

                    <Text style={styles.modalSubtitle}>
                        Get unlimited access to all premium features
                    </Text>

                    <View style={styles.priceTag}>
                        <Text style={styles.priceLabel}>From</Text>
                        <Text style={styles.priceValue}>$5.99</Text>
                        <Text style={styles.pricePeriod}>/mo</Text>
                    </View>

                    <View style={styles.proFeatures}>
                        {features.map((f, i) => (
                            <View key={i} style={styles.proFeatureItem}>
                                <View style={styles.featureCheckIcon}>
                                    <f.icon size={14} color="#10B981" />
                                </View>
                                <Text style={styles.proFeatureLabel}>
                                    {f.label}
                                </Text>
                            </View>
                        ))}
                    </View>

                    <TouchableOpacity
                        style={styles.upgradeBtn}
                        onPress={() => {
                            onClose();
                            router.push('/paywall');
                        }}
                    >
                        <LinearGradient
                            colors={['#2563eb', '#6366F1']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.upgradeBtnGradient}
                        >
                            <Zap size={20} color="#FFFFFF" />
                            <Text style={styles.upgradeBtnText}>Upgrade to Pro</Text>
                        </LinearGradient>
                    </TouchableOpacity>

                    {!trialUsed && (
                        <TouchableOpacity
                            style={styles.trialBtn}
                            onPress={async () => {
                                await onTrialActivated();
                                onClose();
                                Alert.alert('Trial Activated', 'You now have access to Pro features for 7 days!');
                            }}
                        >
                            <Text style={styles.trialBtnText}>
                                Try Free for 7 Days
                            </Text>
                        </TouchableOpacity>
                    )}

                    <View style={styles.trustBadges}>
                        <View style={styles.trustBadge}>
                            <Shield size={12} color={muted} />
                            <Text style={styles.trustBadgeText}>Secure</Text>
                        </View>
                        <View style={styles.trustBadge}>
                            <Check size={12} color={muted} />
                            <Text style={styles.trustBadgeText}>Cancel anytime</Text>
                        </View>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        width: '100%',
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        padding: 28,
        paddingTop: 36,
        alignItems: 'center',
        maxHeight: '90%',
    },
    modalClose: {
        position: 'absolute',
        top: 16,
        right: 16,
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    crownContainer: {
        alignItems: 'center',
        marginBottom: 20,
        position: 'relative',
    },
    crownGlow: {
        position: 'absolute',
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: 'rgba(245,158,11,0.15)',
        top: -20,
    },
    modalTitle: {
        fontSize: 26,
        fontWeight: '800',
        color: '#FFFFFF',
        marginBottom: 8,
        textAlign: 'center',
    },
    modalSubtitle: {
        fontSize: 15,
        color: '#94A3B8',
        textAlign: 'center',
        marginBottom: 20,
    },
    priceTag: {
        flexDirection: 'row',
        alignItems: 'baseline',
        marginBottom: 24,
    },
    priceLabel: {
        fontSize: 16,
        color: '#94A3B8',
    },
    priceValue: {
        fontSize: 42,
        fontWeight: '800',
        color: '#FFFFFF',
        marginHorizontal: 6,
    },
    pricePeriod: {
        fontSize: 16,
        color: '#94A3B8',
    },
    proFeatures: {
        width: '100%',
        marginBottom: 28,
    },
    proFeatureItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 14,
    },
    featureCheckIcon: {
        width: 28,
        height: 28,
        borderRadius: 8,
        backgroundColor: 'rgba(16,185,129,0.15)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    proFeatureLabel: {
        fontSize: 14,
        color: '#E2E8F0',
        fontWeight: '500',
    },
    upgradeBtn: {
        width: '100%',
        borderRadius: 16,
        overflow: 'hidden',
    },
    upgradeBtnGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 18,
        gap: 10,
    },
    upgradeBtnText: {
        color: '#FFFFFF',
        fontSize: 17,
        fontWeight: '700',
    },
    trialBtn: {
        marginTop: 16,
        paddingVertical: 8,
    },
    trialBtnText: {
        fontSize: 15,
        fontWeight: '700',
        color: '#818CF8',
    },
    trustBadges: {
        flexDirection: 'row',
        gap: 20,
        marginTop: 20,
    },
    trustBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    trustBadgeText: {
        fontSize: 12,
        color: '#94A3B8',
        fontWeight: '500',
    },
});
