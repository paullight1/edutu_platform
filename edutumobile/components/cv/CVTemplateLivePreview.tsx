import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CVData, CVEducation, CVExperience, CVHeader } from '@edutu/core/src/types/cv';

// Fixed "paper" palette — a CV page is always light, regardless of app theme
// (same convention as CVPreview).
const INK = '#111827';
const SUB = '#4B5563';
const META = '#6B7280';

// Accent per template category — kept in one place so the gallery cards and
// the preview modal always agree.
const CATEGORY_ACCENTS: Record<string, string> = {
    academic: '#2563EB',
    professional: '#0F766E',
    creative: '#7C3AED',
    general: '#6366F1',
};

export function getTemplateAccent(category?: string | null): string {
    const key = (category || 'general').toLowerCase();
    return CATEGORY_ACCENTS[key] || CATEGORY_ACCENTS.general;
}

/**
 * Compact, render-ready view of a real CV's data_json. Only ever contains
 * content the user actually wrote — empty/missing sections are dropped, and
 * an effectively-empty CV derives to null so callers can fall back to the
 * labeled sample.
 */
export interface CvPreviewModel {
    name: string;
    headline: string | null;
    summary: string | null;
    skills: string[];
    experience: CVExperience[];
    education: CVEducation[];
    /** i18n keys under preview.sections.* for every non-empty section, in order. */
    sectionKeys: string[];
}

export function deriveCvPreviewModel(data?: CVData | null): CvPreviewModel | null {
    if (!data) return null;
    const header: Partial<CVHeader> = data.header || {};
    const experience = (data.experience || []).filter((i) => i && (i.role || i.company));
    const education = (data.education || []).filter((i) => i && (i.institution || i.degree));
    const projects = (data.projects || []).filter((i) => i && i.name);
    const achievements = (data.achievements || []).filter((i) => i && i.title);
    const skills = (data.skills || []).map((s) => (s || '').trim()).filter(Boolean);
    const summary = (data.summary || '').trim() || null;
    const name = (header.full_name || '').trim();

    const hasContent = Boolean(
        name || summary || skills.length || experience.length ||
        education.length || projects.length || achievements.length,
    );
    if (!hasContent) return null;

    const firstRole = experience[0];
    const firstEdu = education[0];
    const headline = firstRole
        ? [firstRole.role, firstRole.company].filter(Boolean).join(' · ')
        : firstEdu
            ? [firstEdu.degree, firstEdu.institution].filter(Boolean).join(' · ')
            : null;

    const sectionKeys: string[] = [];
    if (summary) sectionKeys.push('summary');
    if (skills.length) sectionKeys.push('skills');
    if (experience.length) sectionKeys.push('experience');
    if (education.length) sectionKeys.push('education');
    if (projects.length) sectionKeys.push('projects');
    if (achievements.length) sectionKeys.push('achievements');

    return { name, headline, summary, skills, experience, education, sectionKeys };
}

/** Same date formatting as the full CVPreview/editor. */
function dateRange(t: (key: string) => string, start?: string, end?: string, current?: boolean) {
    const from = (start || '').trim();
    const to = current ? t('preview.present') : (end || '').trim();
    return [from, to].filter(Boolean).join(' – ');
}

/**
 * Miniature "paper" for the gallery cards: the user's real name plus their
 * first real section titles in the template's accent style. Replaces the old
 * anonymous gray skeleton bars whenever the user has CV content.
 */
export function TemplateCardThumb({ model, accent }: { model: CvPreviewModel; accent: string }) {
    const { t } = useTranslation('cv');
    const titles = model.sectionKeys.slice(0, 2);
    return (
        <View style={thumb.paper}>
            <Text style={[thumb.name, { color: accent }]} numberOfLines={1}>
                {model.name || model.headline || t('preview.yourName')}
            </Text>
            {!!model.headline && !!model.name && (
                <Text style={thumb.headline} numberOfLines={1}>
                    {model.headline}
                </Text>
            )}
            {titles.map((key) => (
                <View key={key} style={thumb.sectionBlock}>
                    <Text style={[thumb.sectionTitle, { color: accent }]} numberOfLines={1}>
                        {t(`preview.sections.${key}`)}
                    </Text>
                    <View style={[thumb.sectionRule, { backgroundColor: accent }]} />
                    <View style={thumb.bodyLine} />
                </View>
            ))}
        </View>
    );
}

/**
 * Modal-size render of the user's real CV styled by the template's accent —
 * so choosing a template is a decision about their own document, not a
 * fictional persona's. Missing sections render nothing.
 */
export function TemplateResumePreview({
    model,
    accent,
    isDark,
}: {
    model: CvPreviewModel;
    accent: string;
    isDark: boolean;
}) {
    const { t } = useTranslation('cv');
    const experience = model.experience.slice(0, 2);
    const education = model.education.slice(0, 1);
    const skills = model.skills.slice(0, 6);

    return (
        <View
            style={[
                paper.container,
                {
                    backgroundColor: '#FFFFFF',
                    borderColor: isDark ? 'rgba(255,255,255,0.10)' : '#E2E8F0',
                },
            ]}
        >
            <ScrollView
                contentContainerStyle={paper.scrollContent}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
            >
                <Text style={paper.name} numberOfLines={1}>
                    {model.name || t('preview.yourName')}
                </Text>
                {!!model.headline && (
                    <Text style={[paper.headline, { color: accent }]} numberOfLines={1}>
                        {model.headline}
                    </Text>
                )}

                {!!model.summary && (
                    <PaperSection title={t('preview.sections.summary')} accent={accent}>
                        <Text style={paper.body} numberOfLines={3}>
                            {model.summary}
                        </Text>
                    </PaperSection>
                )}

                {skills.length > 0 && (
                    <PaperSection title={t('preview.sections.skills')} accent={accent}>
                        <View style={paper.skillWrap}>
                            {skills.map((skill, i) => (
                                <View key={`${skill}-${i}`} style={[paper.skillChip, { borderColor: `${accent}55` }]}>
                                    <Text style={[paper.skillText, { color: accent }]} numberOfLines={1}>
                                        {skill}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    </PaperSection>
                )}

                {experience.length > 0 && (
                    <PaperSection title={t('preview.sections.experience')} accent={accent}>
                        {experience.map((item) => (
                            <View key={item.id} style={paper.block}>
                                <View style={paper.rowBetween}>
                                    <Text style={paper.itemTitle} numberOfLines={1}>
                                        {item.role || item.company}
                                    </Text>
                                    <Text style={paper.date} numberOfLines={1}>
                                        {dateRange(t, item.start_date, item.end_date, item.current)}
                                    </Text>
                                </View>
                                {!!(item.company || item.location) && (
                                    <Text style={paper.sub} numberOfLines={1}>
                                        {[item.company, item.location].filter(Boolean).join(' · ')}
                                    </Text>
                                )}
                                {!!item.description && (
                                    <Text style={paper.body} numberOfLines={2}>
                                        {item.description}
                                    </Text>
                                )}
                            </View>
                        ))}
                    </PaperSection>
                )}

                {education.length > 0 && (
                    <PaperSection title={t('preview.sections.education')} accent={accent}>
                        {education.map((item) => (
                            <View key={item.id} style={paper.block}>
                                <View style={paper.rowBetween}>
                                    <Text style={paper.itemTitle} numberOfLines={1}>
                                        {[item.degree, item.field].filter(Boolean).join(', ') || item.institution}
                                    </Text>
                                    <Text style={paper.date} numberOfLines={1}>
                                        {dateRange(t, item.start_date, item.end_date)}
                                    </Text>
                                </View>
                                {!!item.institution && (
                                    <Text style={paper.sub} numberOfLines={1}>
                                        {item.institution}
                                    </Text>
                                )}
                            </View>
                        ))}
                    </PaperSection>
                )}
            </ScrollView>
        </View>
    );
}

function PaperSection({
    title,
    accent,
    children,
}: {
    title: string;
    accent: string;
    children: React.ReactNode;
}) {
    return (
        <View style={paper.section}>
            <Text style={[paper.sectionTitle, { color: accent }]}>{title}</Text>
            <View style={[paper.sectionRule, { backgroundColor: accent }]} />
            {children}
        </View>
    );
}

const thumb = StyleSheet.create({
    paper: {
        width: 86,
        height: 94,
        alignSelf: 'flex-end',
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.94)',
        padding: 9,
        overflow: 'hidden',
    },
    name: {
        fontSize: 8,
        fontWeight: '900',
        letterSpacing: 0.1,
    },
    headline: {
        fontSize: 6.5,
        fontWeight: '600',
        color: SUB,
        marginTop: 1,
    },
    sectionBlock: {
        marginTop: 6,
    },
    sectionTitle: {
        fontSize: 5.5,
        fontWeight: '800',
        textTransform: 'uppercase',
        letterSpacing: 0.6,
    },
    sectionRule: {
        height: 1,
        opacity: 0.65,
        marginTop: 1.5,
        marginBottom: 2.5,
    },
    bodyLine: {
        height: 4,
        width: '82%',
        borderRadius: 3,
        backgroundColor: '#E2E8F0',
    },
});

const paper = StyleSheet.create({
    container: {
        borderWidth: 1,
        borderRadius: 18,
        marginBottom: 18,
        maxHeight: 330,
        overflow: 'hidden',
    },
    scrollContent: {
        padding: 16,
    },
    name: {
        fontSize: 18,
        fontWeight: '900',
        color: INK,
    },
    headline: {
        fontSize: 12,
        fontWeight: '800',
        marginTop: 3,
    },
    section: {
        marginTop: 14,
    },
    sectionTitle: {
        fontSize: 10.5,
        fontWeight: '800',
        letterSpacing: 1.2,
        textTransform: 'uppercase',
    },
    sectionRule: {
        height: 1.5,
        opacity: 0.55,
        marginTop: 3,
        marginBottom: 8,
    },
    body: {
        fontSize: 12.5,
        lineHeight: 18,
        color: SUB,
        paddingBottom: 2,
    },
    block: {
        marginBottom: 10,
    },
    rowBetween: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 10,
    },
    itemTitle: {
        flex: 1,
        fontSize: 13,
        fontWeight: '700',
        color: INK,
    },
    date: {
        fontSize: 11,
        color: META,
        marginTop: 1,
        maxWidth: 110,
    },
    sub: {
        fontSize: 11.5,
        color: SUB,
        marginTop: 1,
    },
    skillWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        paddingBottom: 2,
    },
    skillChip: {
        paddingHorizontal: 9,
        paddingVertical: 3,
        borderRadius: 999,
        borderWidth: 1,
        maxWidth: 140,
    },
    skillText: {
        fontSize: 10.5,
        fontWeight: '600',
    },
});
