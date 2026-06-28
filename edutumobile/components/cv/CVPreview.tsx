import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { UserCV } from '@edutu/core/src/types/cv';
import { useTheme } from '../../components/context/ThemeContext';

interface Props {
    currentCV: Partial<UserCV>;
    onBack: () => void;
}

export function CVPreview({ currentCV, onBack }: Props) {
    const { colors } = useTheme();

    return (
        <View style={styles.previewContainer}>
            <View style={styles.previewHeader}>
                <TouchableOpacity onPress={onBack}>
                    <Text style={[styles.previewBackText, { color: colors.primary }]}>Back to Edit</Text>
                </TouchableOpacity>
            </View>
            <ScrollView style={styles.previewContent}>
                <View style={[styles.previewCard, { backgroundColor: '#FFFFFF' }]}>
                    <Text style={styles.previewName}>
                        {currentCV.data_json?.header?.full_name || 'Your Name'}
                    </Text>
                    <Text style={styles.previewContact}>
                        {[currentCV.data_json?.header?.email, currentCV.data_json?.header?.phone]
                            .filter(Boolean)
                            .join(' • ')}
                    </Text>
                    {!!currentCV.data_json?.header?.location && (
                        <Text style={styles.previewContact}>{currentCV.data_json?.header?.location}</Text>
                    )}

                    {currentCV.data_json?.summary ? (
                        <>
                            <Text style={styles.previewSectionTitle}>Summary</Text>
                            <Text style={styles.previewText}>{currentCV.data_json.summary}</Text>
                        </>
                    ) : null}

                    {(currentCV.data_json?.skills || []).length > 0 ? (
                        <>
                            <Text style={styles.previewSectionTitle}>Skills</Text>
                            <Text style={styles.previewText}>
                                {currentCV.data_json?.skills?.join(', ')}
                            </Text>
                        </>
                    ) : null}

                    {(currentCV.data_json?.experience || []).length > 0 ? (
                        <>
                            <Text style={styles.previewSectionTitle}>Experience</Text>
                            {currentCV.data_json?.experience?.map((item: any) => (
                                <View key={item.id} style={styles.previewBlock}>
                                    <Text style={styles.previewItemTitle}>{item.role} - {item.company}</Text>
                                    <Text style={styles.previewMeta}>
                                        {item.start_date || 'Start'} {item.end_date ? `- ${item.end_date}` : item.current ? '- Present' : ''}
                                    </Text>
                                    <Text style={styles.previewText}>{item.description}</Text>
                                </View>
                            ))}
                        </>
                    ) : null}

                    {(currentCV.data_json?.education || []).length > 0 ? (
                        <>
                            <Text style={styles.previewSectionTitle}>Education</Text>
                            {currentCV.data_json?.education?.map((item: any) => (
                                <View key={item.id} style={styles.previewBlock}>
                                    <Text style={styles.previewItemTitle}>
                                        {item.degree}{item.field ? `, ${item.field}` : ''}
                                    </Text>
                                    <Text style={styles.previewMeta}>{item.institution}</Text>
                                </View>
                            ))}
                        </>
                    ) : null}

                    {(currentCV.data_json?.projects || []).length > 0 ? (
                        <>
                            <Text style={styles.previewSectionTitle}>Projects</Text>
                            {currentCV.data_json?.projects?.map((item: any) => (
                                <View key={item.id} style={styles.previewBlock}>
                                    <Text style={styles.previewItemTitle}>{item.name}</Text>
                                    <Text style={styles.previewText}>{item.description}</Text>
                                </View>
                            ))}
                        </>
                    ) : null}

                    {(currentCV.data_json?.achievements || []).length > 0 ? (
                        <>
                            <Text style={styles.previewSectionTitle}>Achievements</Text>
                            {currentCV.data_json?.achievements?.map((item: any) => (
                                <View key={item.id} style={styles.previewBlock}>
                                    <Text style={styles.previewItemTitle}>{item.title}</Text>
                                    <Text style={styles.previewText}>{item.description}</Text>
                                </View>
                            ))}
                        </>
                    ) : null}
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    previewContainer: {
        flex: 1,
    },
    previewHeader: {
        padding: 16,
    },
    previewBackText: {
        fontSize: 14,
        fontWeight: '600',
    },
    previewContent: {
        flex: 1,
        paddingHorizontal: 16,
    },
    previewCard: {
        padding: 24,
        borderRadius: 12,
    },
    previewName: {
        fontSize: 24,
        fontWeight: '700',
        color: '#1E293B',
        marginBottom: 8,
    },
    previewContact: {
        fontSize: 14,
        color: '#64748B',
        marginBottom: 6,
    },
    previewSectionTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1E293B',
        marginTop: 16,
        marginBottom: 8,
    },
    previewText: {
        fontSize: 14,
        color: '#475569',
        lineHeight: 20,
    },
    previewBlock: {
        marginBottom: 12,
    },
    previewItemTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#1E293B',
        marginBottom: 4,
    },
    previewMeta: {
        fontSize: 12,
        color: '#64748B',
        marginBottom: 4,
    },
});
