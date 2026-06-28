import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Clock } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import type { Goal } from '@edutu/core/src/hooks/useGoals';

interface UpcomingGoalCardProps {
    goal: Goal;
    days: number;
}

export function UpcomingGoalCard({ goal, days }: UpcomingGoalCardProps) {
    const router = useRouter();
    const isUrgent = days <= 1;

    return (
        <TouchableOpacity
            onPress={() => router.push(`/goals/${goal.id}`)}
            style={[styles.card, isUrgent ? styles.cardUrgent : styles.cardNormal]}
        >
            <View style={styles.headerRow}>
                <View style={[styles.iconDot, isUrgent ? styles.iconDotUrgent : styles.iconDotNormal]}>
                    <Clock size={12} color="white" />
                </View>
                <Text style={[styles.daysText, isUrgent ? styles.daysUrgent : styles.daysNormal]}>
                    {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days} days`}
                </Text>
            </View>
            <Text style={styles.title} numberOfLines={2}>
                {goal.title}
            </Text>
            {goal.opportunity_title && (
                <Text style={styles.subtitle} numberOfLines={1}>
                    {goal.opportunity_title}
                </Text>
            )}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    card: {
        borderRadius: 12,
        padding: 12,
        marginRight: 12,
        width: 180,
        borderWidth: 1,
    },
    cardNormal: {
        backgroundColor: 'rgba(30,41,59,0.5)',
        borderColor: '#334155',
    },
    cardUrgent: {
        backgroundColor: 'rgba(239,68,68,0.1)',
        borderColor: 'rgba(239,68,68,0.3)',
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    iconDot: {
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 8,
    },
    iconDotNormal: { backgroundColor: '#6366f1' },
    iconDotUrgent: { backgroundColor: '#ef4444' },
    daysText: {
        fontSize: 12,
        fontWeight: 'bold',
    },
    daysNormal: { color: '#818cf8' },
    daysUrgent: { color: '#f87171' },
    title: {
        color: 'white',
        fontWeight: '600',
        fontSize: 14,
        marginBottom: 4,
    },
    subtitle: {
        color: '#94A3B8',
        fontSize: 12,
    },
});
