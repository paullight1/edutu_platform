import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Download } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { UserCV, CVData, CVHeader } from '@edutu/core/src/types/cv';
import { useTheme } from '../../components/context/ThemeContext';

interface Props {
    currentCV: Partial<UserCV>;
    onBack: () => void;
    onExport?: () => void;
    isExporting?: boolean;
}

// Fixed "paper" palette — a CV page is always light, regardless of app theme.
const INK = '#111827';
const SUB = '#4B5563';
const META = '#6B7280';
const LINE = '#E5E7EB';

export function CVPreview({ currentCV, onBack, onExport, isExporting }: Props) {
    const { t } = useTranslation('cv');
    const { colors } = useTheme();

    const data: CVData = currentCV.data_json || {};
    const header: Partial<CVHeader> = data.header || {};
    const dateRange = (start?: string, end?: string, current?: boolean) => {
        const from = (start || '').trim();
        const to = current ? t('preview.present') : (end || '').trim();
        return [from, to].filter(Boolean).join(' – ');
    };

    const contact = [header.email, header.phone, header.location, header.linkedin, header.portfolio || header.website]
        .filter(Boolean)
        .join('   •   ');

    const experience = (data.experience || []).filter((i: any) => i.role || i.company);
    const education = (data.education || []).filter((i: any) => i.institution || i.degree);
    const projects = (data.projects || []).filter((i: any) => i.name);
    const achievements = (data.achievements || []).filter((i: any) => i.title);
    const skills = data.skills || [];

    const hasContent = Boolean(
        data.summary ||
        skills.length ||
        experience.length ||
        education.length ||
        projects.length ||
        achievements.length,
    );

    return (
        <View style={styles.previewContainer}>
            <View style={styles.previewHeader}>
                <TouchableOpacity onPress={onBack} hitSlop={8}>
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

            <ScrollView style={styles.previewContent} contentContainerStyle={styles.previewContentInner} showsVerticalScrollIndicator={false}>
                <View style={styles.previewCard}>
                    <Text style={styles.previewName}>
                        {header.full_name || t('preview.yourName')}
                    </Text>
                    {!!contact && <Text style={styles.previewContact}>{contact}</Text>}

                    {data.summary ? (
                        <Section title={t('preview.sections.summary')}>
                            <Text style={styles.previewText}>{data.summary}</Text>
                        </Section>
                    ) : null}

                    {skills.length > 0 ? (
                        <Section title={t('preview.sections.skills')}>
                            <View style={styles.skillWrap}>
                                {skills.map((skill: string, i: number) => (
                                    <View key={`${skill}-${i}`} style={styles.skillChip}>
                                        <Text style={styles.skillChipText}>{skill}</Text>
                                    </View>
                                ))}
                            </View>
                        </Section>
                    ) : null}

                    {experience.length > 0 ? (
                        <Section title={t('preview.sections.experience')}>
                            {experience.map((item: any) => (
                                <View key={item.id} style={styles.previewBlock}>
                                    <View style={styles.rowBetween}>
                                        <Text style={styles.previewItemTitle}>{item.role || item.company}</Text>
                                        <Text style={styles.previewDate}>{dateRange(item.start_date, item.end_date, item.current)}</Text>
                                    </View>
                                    {!!(item.company || item.location) && (
                                        <Text style={styles.previewSub}>
                                            {[item.company, item.location].filter(Boolean).join(' · ')}
                                        </Text>
                                    )}
                                    {!!item.description && <Text style={styles.previewText}>{item.description}</Text>}
                                    <Bullets items={item.highlights} />
                                </View>
                            ))}
                        </Section>
                    ) : null}

                    {education.length > 0 ? (
                        <Section title={t('preview.sections.education')}>
                            {education.map((item: any) => (
                                <View key={item.id} style={styles.previewBlock}>
                                    <View style={styles.rowBetween}>
                                        <Text style={styles.previewItemTitle}>
                                            {[item.degree, item.field].filter(Boolean).join(', ') || item.institution}
                                        </Text>
                                        <Text style={styles.previewDate}>{dateRange(item.start_date, item.end_date)}</Text>
                                    </View>
                                    {!!item.institution && (
                                        <Text style={styles.previewSub}>
                                            {item.institution}{item.gpa ? ` · GPA ${item.gpa}` : ''}
                                        </Text>
                                    )}
                                    <Bullets items={item.highlights} />
                                </View>
                            ))}
                        </Section>
                    ) : null}

                    {projects.length > 0 ? (
                        <Section title={t('preview.sections.projects')}>
                            {projects.map((item: any) => (
                                <View key={item.id} style={styles.previewBlock}>
                                    <Text style={styles.previewItemTitle}>{item.name}</Text>
                                    {!!item.description && <Text style={styles.previewText}>{item.description}</Text>}
                                    {!!(item.technologies || []).length && (
                                        <Text style={styles.previewSub}>{item.technologies.join(', ')}</Text>
                                    )}
                                </View>
                            ))}
                        </Section>
                    ) : null}

                    {achievements.length > 0 ? (
                        <Section title={t('preview.sections.achievements')}>
                            {achievements.map((item: any) => (
                                <View key={item.id} style={styles.previewBlock}>
                                    <View style={styles.rowBetween}>
                                        <Text style={styles.previewItemTitle}>{item.title}</Text>
                                        {!!item.date && <Text style={styles.previewDate}>{item.date}</Text>}
                                    </View>
                                    {!!item.issuer && <Text style={styles.previewSub}>{item.issuer}</Text>}
                                    {!!item.description && <Text style={styles.previewText}>{item.description}</Text>}
                                </View>
                            ))}
                        </Section>
                    ) : null}

                    {!hasContent && (
                        <Text style={styles.emptyPreview}>{t('preview.empty')}</Text>
                    )}
                </View>
            </ScrollView>
        </View>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <View style={styles.section}>
            <Text style={styles.previewSectionTitle}>{title}</Text>
            <View style={styles.sectionRule} />
            {children}
        </View>
    );
}

function Bullets({ items }: { items?: string[] }) {
    const clean = (items || []).map((h) => (h || '').trim()).filter(Boolean);
    if (!clean.length) return null;
    return (
        <View style={styles.bulletList}>
            {clean.map((h, i) => (
                <View key={i} style={styles.bulletRow}>
                    <Text style={styles.bulletDot}>•</Text>
                    <Text style={[styles.previewText, styles.bulletText]}>{h}</Text>
                </View>
            ))}
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
    previewContentInner: {
        paddingBottom: 48,
    },
    previewCard: {
        backgroundColor: '#FFFFFF',
        padding: 28,
        borderRadius: 16,
        // Soft "sheet of paper" elevation against the dark app background.
        shadowColor: '#000000',
        shadowOpacity: 0.18,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 12 },
        elevation: 6,
    },
    previewName: {
        fontSize: 26,
        fontWeight: '800',
        letterSpacing: 0.2,
        color: INK,
        marginBottom: 6,
    },
    previewContact: {
        fontSize: 12,
        color: META,
        lineHeight: 18,
    },
    section: {
        marginTop: 20,
    },
    previewSectionTitle: {
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 1.4,
        textTransform: 'uppercase',
        color: INK,
        marginBottom: 6,
    },
    sectionRule: {
        height: 1.5,
        backgroundColor: INK,
        marginBottom: 12,
        opacity: 0.85,
    },
    previewText: {
        fontSize: 13.5,
        color: SUB,
        lineHeight: 20,
    },
    previewBlock: {
        marginBottom: 14,
    },
    rowBetween: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 12,
    },
    previewItemTitle: {
        flex: 1,
        fontSize: 14.5,
        fontWeight: '700',
        color: INK,
    },
    previewDate: {
        fontSize: 12,
        color: META,
        marginTop: 1,
    },
    previewSub: {
        fontSize: 12.5,
        color: SUB,
        marginTop: 2,
        marginBottom: 2,
    },
    bulletList: {
        marginTop: 5,
        gap: 3,
    },
    bulletRow: {
        flexDirection: 'row',
        gap: 8,
        paddingRight: 4,
    },
    bulletDot: {
        color: META,
        fontSize: 13.5,
        lineHeight: 20,
    },
    bulletText: {
        flex: 1,
    },
    skillWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    skillChip: {
        paddingHorizontal: 11,
        paddingVertical: 4,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: '#D1D5DB',
    },
    skillChipText: {
        fontSize: 12,
        color: '#374151',
        fontWeight: '500',
    },
    emptyPreview: {
        fontSize: 13.5,
        color: META,
        textAlign: 'center',
        lineHeight: 20,
        paddingVertical: 28,
    },
});
