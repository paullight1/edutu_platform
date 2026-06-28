import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { LucideIcon } from 'lucide-react-native';

interface StatCardProps {
    stat: {
        label: string;
        value: number;
        icon: LucideIcon;
        color: string;
        gradient: string[];
    };
    onPress?: () => void;
}

const StyledGradient = LinearGradient as any;

export function StatCard({ stat, onPress }: StatCardProps) {
    const Icon = stat.icon;
    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.8}
            style={styles.container}
        >
            <StyledGradient
                colors={stat.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.gradient}
            >
                <View style={styles.headerRow}>
                    <Icon size={20} color="white" />
                    <Text style={styles.value}>{stat.value}</Text>
                </View>
                <Text style={styles.label}>{stat.label}</Text>
            </StyledGradient>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        marginHorizontal: 4,
    },
    gradient: {
        borderRadius: 16,
        padding: 16,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    value: {
        color: 'white',
        fontSize: 24,
        fontWeight: 'bold',
    },
    label: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 12,
        fontWeight: '500',
    },
});
