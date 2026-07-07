import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Download } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { UserCV } from '@edutu/core/src/types/cv';
import { useTheme } from '../../components/context/ThemeContext';

interface Props {
    currentCV: Partial<UserCV>;
    onBack: () => void;
    onExport?: () => void;
    isExporting?: boolean;
}

export function CVPreview({ currentCV, onBack, onExport, isExporting }: Props) {
    const { t } = useTranslation('cv');
    const { colors } = useTheme();

    return (
        <View style={styles.previewContainer}>
            <View style={styles.previewHeader}>
                <TouchableOpacity onPress={onBack}>
                    <Text style={[styles.previewBackText, { color: colors.primary }]}>{t('preview.backToEdit')}</Text>
                </TouchableOpacity>
                {onExport ? (
                    <TouchableOpacity
                        style={[styles.previewExportBtn, { backgroundColor: colors.primary, opacity: isExporting ? 0.7 : 1 }]}
                        onPress={onExport}
                        disabled={isExporting}
                        accessibilityRole="button"
                        accessibilityLabel={t('preview.downloadAccessibility')}
                    >
                        {isExporting ? (
                            <ActivityIndicator color="#FFFFFF" size="small" />
                        ) : (
                            <Download size={16} color="#FFFFFF" />
                        )}
                        <Text style={styles.previewExportText}>{isExporting ? t('preview.preparing') : t('preview.pdf')}</Text>
                    </TouchableOpacity>
                ) : null}
            </View>
            <ScrollView style={styles.previewContent}>
                <View style={[styles.previewCard, { backgroundColor: '#FFFFFF' }]}>
                    <Text style={styles.previewName}>
                        {currentCV.data_json?.header?.full_name || t('preview.yourName')}
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
                            <Text style={styles.previewSectionTitle}>{t('preview.sections.summary')}</Text>
                            <Text style={styles.previewText}>{currentCV.data_json.summary}</Text>
                        </>
                    ) : null}

                    {(currentCV.data_json?.skills || []).length > 0 ? (
                        <>
                            <Text style={styles.previewSectionTitle}>{t('preview.sections.skills')}</Text>
                            <Text style={styles.previewText}>
                                {currentCV.data_json?.skills?.join(', ')}
                            </Text>
                        </>
                    ) : null}

                    {(currentCV.data_json?.experience || []).length > 0 ? (
                        <>
                            <Text style={styles.previewSectionTitle}>{t('preview.sections.experience')}</Text>
                            {currentCV.data_json?.experience?.map((item: any) => (
                                <View key={item.id} style={styles.previewBlock}>
                                    <Text style={styles.previewItemTitle}>{item.role} - {item.company}</Text>
                                    <Text style={styles.previewMeta}>
                                        {item.start_date || t('preview.startFallback')} {item.end_date ? `- ${item.end_date}` : item.current ? t('preview.present') : ''}
                                    </Text>
                                    <Text style={styles.previewText}>{item.description}</Text>
                                </View>
                            ))}
                        </>
                    ) : null}

                    {(currentCV.data_json?.education || []).length > 0 ? (
                        <>
                            <Text style={styles.previewSectionTitle}>{t('preview.sections.education')}</Text>
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
                            <Text style={styles.previewSectionTitle}>{t('preview.sections.projects')}</Text>
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
                            <Text style={styles.previewSectionTitle}>{t('preview.sections.achievements')}</Text>
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
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    previewBackText: {
        fontSize: 14,
        fontWeight: '600',
    },
    previewExportBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
    },
    previewExportText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '700',
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
