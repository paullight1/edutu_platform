import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { FileText, Trash2 } from 'lucide-react-native';
import { UserCV } from '@edutu/core/src/types/cv';
import { useTheme } from '../../components/context/ThemeContext';

interface Props {
    item: UserCV;
    onEdit: (cv: UserCV) => void;
    onDelete: (cvId: string) => void;
}

export function CVListItem({ item, onEdit, onDelete }: Props) {
    const { colors, isDark } = useTheme();
    const muted = isDark ? '#94A3B8' : '#64748B';

    return (
        <TouchableOpacity
            style={[
                styles.cvListItem,
                { backgroundColor: colors.card, borderColor: colors.border }
            ]}
            onPress={() => onEdit(item)}
        >
            <View style={[styles.cvListIcon, { backgroundColor: colors.primary + '15' }]}>
                <FileText size={24} color={colors.primary} />
            </View>
            <View style={styles.cvListContent}>
                <Text style={[styles.cvListName, { color: colors.foreground }]}>
                    {item.name}
                </Text>
                <Text style={[styles.cvListDate, { color: muted }]}>
                    Updated {new Date(item.updated_at).toLocaleDateString()}
                </Text>
            </View>
            {item.is_primary && (
                <View style={[styles.primaryBadge, { backgroundColor: colors.primary + '20' }]}>
                    <Text style={[styles.primaryBadgeText, { color: colors.primary }]}>Primary</Text>
                </View>
            )}
            <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => onDelete(item.id)}
            >
                <Trash2 size={18} color="#EF4444" />
            </TouchableOpacity>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    cvListItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 12,
        marginRight: 12,
        width: 200,
        borderWidth: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
        elevation: 3,
    },
    cvListIcon: {
        width: 40,
        height: 40,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    cvListContent: {
        flex: 1,
        marginLeft: 12,
    },
    cvListName: {
        fontSize: 14,
        fontWeight: '600',
    },
    cvListDate: {
        fontSize: 12,
        marginTop: 2,
    },
    primaryBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    primaryBadgeText: {
        fontSize: 10,
        fontWeight: '600',
    },
    deleteBtn: {
        padding: 8,
    },
});
