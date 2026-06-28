import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Star } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { AnimatedPressable } from './AnimatedPressable';

interface ReviewCardProps {
    name: string;
    role: string;
    avatarUrl?: string;
    rating: number;
    reviewText: string;
    country?: string;
    onPress?: () => void;
}

export default function ReviewCard({ name, role, avatarUrl, rating, reviewText, country, onPress }: ReviewCardProps) {
    const { colors } = useTheme();

    const initials = name
        .split(' ')
        .slice(0, 2)
        .map(w => w[0]?.toUpperCase() ?? '')
        .join('');

    const stars = Array.from({ length: 5 }, (_, i) => i < rating);

    return (
        <AnimatedPressable
            style={styles.container}
            onPress={onPress}
            hapticFeedback="light"
            scaleTo={0.98}
        >
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.header}>
                    <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
                        {avatarUrl ? (
                            <Image
                                source={{ uri: avatarUrl }}
                                style={styles.avatarImage}
                                resizeMode="cover"
                            />
                        ) : (
                            <Text style={styles.initials}>{initials}</Text>
                        )}
                    </View>
                    <View style={styles.headerText}>
                        <Text style={[styles.name, { color: colors.foreground }]}>{name}</Text>
                        <Text style={[styles.role, { color: colors.accent }]}>{role}</Text>
                    </View>
                    {country && (
                        <Text style={[styles.country, { color: colors.textSecondary }]}>{country}</Text>
                    )}
                </View>
                <View style={styles.stars}>
                    {stars.map((filled, i) => (
                        <Star
                            key={i}
                            size={16}
                            fill={filled ? '#FBBF24' : 'transparent'}
                            color={filled ? '#FBBF24' : colors.textSecondary}
                        />
                    ))}
                </View>
                <Text style={[styles.reviewText, { color: colors.textSecondary }]}>{reviewText}</Text>
            </View>
        </AnimatedPressable>
    );
}

const styles = StyleSheet.create({
    container: {
        width: '100%',
    },
    card: {
        borderRadius: 18,
        borderWidth: 1,
        padding: 16,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
        overflow: 'hidden',
    },
    avatarImage: {
        width: '100%',
        height: '100%',
    },
    initials: {
        color: '#FFFFFF',
        fontWeight: '700',
        fontSize: 16,
    },
    headerText: {
        flex: 1,
    },
    name: {
        fontWeight: '700',
        fontSize: 15,
    },
    role: {
        fontSize: 13,
        marginTop: 2,
    },
    country: {
        fontSize: 13,
    },
    stars: {
        flexDirection: 'row',
        gap: 2,
        marginBottom: 10,
    },
    reviewText: {
        fontSize: 14,
        lineHeight: 22,
    },
});
