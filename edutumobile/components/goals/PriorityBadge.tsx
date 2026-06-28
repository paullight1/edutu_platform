import React from 'react';
import { View, Text } from 'react-native';
import { PRIORITY_CONFIG } from './constants';

interface PriorityBadgeProps {
    priority: 'low' | 'medium' | 'high' | undefined;
    size?: 'sm' | 'md';
}

export function PriorityBadge({ priority, size = 'sm' }: PriorityBadgeProps) {
    const config = PRIORITY_CONFIG[priority || 'medium'];

    return (
        <View
            className={`px-2 py-1 rounded-full ${size === 'md' ? 'px-3 py-1.5' : ''}`}
            style={{ backgroundColor: config.bg }}
        >
            <Text style={{ color: config.color }} className={`text-xs font-bold ${size === 'md' ? '' : ''}`}>
                {config.label}
            </Text>
        </View>
    );
}
