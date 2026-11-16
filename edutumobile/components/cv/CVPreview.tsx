import React, { useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    ActivityIndicator,
    Platform,
    TouchableOpacity,
    type TextStyle,
} from 'react-native';
import { Download, ShieldCheck } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import type {
    CVData,
    CVHeader,
    CVSectionType,
    CVTemplateDesign,
    UserCV,
} from '@edutu/core/src/types/cv';
import {
    getDensityMetrics,
    resolveTemplateDesignById,
} from '@edutu/core/src/services/templateDesigns';
import { useTheme } from '../../components/context/ThemeContext';

interface Props {
    currentCV: Partial<UserCV>;
    onBack: () => void;
    onExport?: () => void;
    isExporting?: boolean;
    /** Resolved template design. Defaults to the one on the CV's template_id. */
    design?: CVTemplateDesign | null;
}

/** Print-safe families that actually exist on both platforms. */
function fontFamily(family: 'sans' | 'serif'): TextStyle {
    if (family !== 'serif') return {};
    return { fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }) };
}

/**
 * On-screen preview of the CV, rendered from the same `CVTemplateDesign` the
 * PDF exporter uses.
 *
 * Previously the preview drew one fixed black-and-white layout while the
 * gallery card advertised a colour and the PDF ignored both — three different
 * answers to "what will this look like". They now share one spec, so the
 * preview is a promise the export keeps.
 */
export function CVPreview({ currentCV, onBack, onExport, isExporting, design }: Props) {
    const { t } = useTranslation('cv');
    const { colors } = useTheme();

    const spec = useMemo(
        () => design || resolveTemplateDesignById(currentCV.template_id),
        [design, currentCV.template_id],
    );
    const metrics = getDensityMetrics(spec.density);

    const data: CVData = currentCV.data_json || {};
    const header: Partial<CVHeader> = data.header || {};

    const dateRange = (start?: string, end?: string, current?: boolean) => {
        const from = (start || '').trim();
        const to = current ? t('preview.present') : (end || '').trim();
        return [from, to].filter(Boolean).join(' – ');
    };

    const contactParts = [
        header.email,
        header.phone,
        header.location,
        header.linkedin,
        header.portfolio || header.website,
    ].filter(Boolean) as string[];

    const experience = (data.experience || []).filter((i) => i.role || i.company);
    const education = (data.education || []).filter((i) => i.institution || i.degree);
    const projects = (data.projects || []).filter((i) => i.name);
    const achievements = (data.achievements || []).filter((i) => i.title);
    const research = (data.research || []).filter((i) => i.title || i.institution);
    const publications = (data.publications || []).filter((i) => i.title);
    const references = (data.references || []).filter((i) => i.name);
    const skills = (data.skills || []).filter(Boolean);

    const hasContent = Boolean(
        data.summary || skills.length || experience.length || education.length ||
        projects.length || achievements.length || research.length || publications.length,
    );

    const bodyStyle: TextStyle = {
        ...fontFamily(spec.bodyFont),
        color: spec.muted,
        fontSize: metrics.baseFontSize + 1,
        lineHeight: (metrics.baseFontSize + 1) * metrics.lineHeight,
    };
    const titleStyle: TextStyle = {
        ...fontFamily(spec.bodyFont),
        color: spec.ink,
    };

    const section = (type: CVSectionType, titleKey: string, body: React.ReactNode, present: boolean) =>
        present ? (
            <PaperSection key={type} title={t(titleKey)} design={spec} metrics={metrics}>
                {body}
            </PaperSection>
        ) : null;

    const sections: Partial<Record<CVSectionType, React.ReactNode>> = {
        summary: section('summary', 'preview.sections.summary',
            <Text style={bodyStyle}>{data.summary}</Text>, Boolean(data.summary)),

        skills: section('skills', 'preview.sections.skills',
            spec.skillStyle === 'chips' ? (
                <View style={styles.skillWrap}>
                    {skills.map((skill, i) => (
                        <View
                            key={`${skill}-${i}`}
                            style={[styles.skillChip, { borderColor: spec.accent, backgroundColor: `${spec.accent}14` }]}
                        >
                            <Text style={[styles.skillChipText, { color: spec.accent }]}>{skill}</Text>
                        </View>
                    ))}
                </View>
            ) : spec.skillStyle === 'bulleted' ? (
                <Bullets items={skills} design={spec} style={bodyStyle} />
            ) : (
                <Text style={bodyStyle}>{skills.join('  ·  ')}</Text>
            ),
            skills.length > 0),

        experience: section('experience', 'preview.sections.experience',
            experience.map((item) => (
                <View key={item.id} style={[styles.block, { marginBottom: metrics.itemGap + 2 }]}>
                    <View style={styles.rowBetween}>
                        <Text style={[styles.itemTitle, titleStyle]}>{item.role || item.company}</Text>
                        <Text style={[styles.date, { color: spec.muted }]}>
                            {dateRange(item.start_date, item.end_date, item.current)}
                        </Text>
                    </View>
                    {!!(item.company || item.location) && (
                        <Text style={[styles.sub, { color: spec.muted }]}>
                            {[item.company, item.location].filter(Boolean).join(' · ')}
                        </Text>
                    )}
                    {!!item.description && <Text style={bodyStyle}>{item.description}</Text>}
                    <Bullets items={item.highlights} design={spec} style={bodyStyle} />
                </View>
            )), experience.length > 0),

        education: section('education', 'preview.sections.education',
            education.map((item) => (
                <View key={item.id} style={[styles.block, { marginBottom: metrics.itemGap + 2 }]}>
                    <View style={styles.rowBetween}>
                        <Text style={[styles.itemTitle, titleStyle]}>
                            {[item.degree, item.field].filter(Boolean).join(', ') || item.institution}
                        </Text>
                        <Text style={[styles.date, { color: spec.muted }]}>
                            {dateRange(item.start_date, item.end_date)}
                        </Text>
                    </View>
                    {!!item.institution && (
                        <Text style={[styles.sub, { color: spec.muted }]}>
                            {item.institution}{item.gpa ? ` · GPA ${item.gpa}` : ''}
                        </Text>
                    )}
                    <Bullets items={item.highlights} design={spec} style={bodyStyle} />
                </View>
            )), education.length > 0),

        projects: section('projects', 'preview.sections.projects',
            projects.map((item) => (
                <View key={item.id} style={[styles.block, { marginBottom: metrics.itemGap + 2 }]}>
                    <Text style={[styles.itemTitle, titleStyle]}>{item.name}</Text>
                    {!!item.description && <Text style={bodyStyle}>{item.description}</Text>}
                    {!!(item.technologies || []).length && (
                        <Text style={[styles.sub, { color: spec.muted }]}>{item.technologies!.join(', ')}</Text>
                    )}
                </View>
            )), projects.length > 0),

        achievements: section('achievements', 'preview.sections.achievements',
            achievements.map((item) => (
                <View key={item.id} style={[styles.block, { marginBottom: metrics.itemGap + 2 }]}>
                    <View style={styles.rowBetween}>
                        <Text style={[styles.itemTitle, titleStyle]}>{item.title}</Text>
                        {!!item.date && <Text style={[styles.date, { color: spec.muted }]}>{item.date}</Text>}
                    </View>
                    {!!item.issuer && <Text style={[styles.sub, { color: spec.muted }]}>{item.issuer}</Text>}
                    {!!item.description && <Text style={bodyStyle}>{item.description}</Text>}
                </View>
            )), achievements.length > 0),

        research: section('research', 'preview.sections.research',
            research.map((item) => (
                <View key={item.id} style={[styles.block, { marginBottom: metrics.itemGap + 2 }]}>
                    <View style={styles.rowBetween}>
                        <Text style={[styles.itemTitle, titleStyle]}>{item.title}</Text>
                        <Text style={[styles.date, { color: spec.muted }]}>
                            {dateRange(item.start_date, item.end_date)}
                        </Text>
                    </View>
                    <Text style={[styles.sub, { color: spec.muted }]}>
                        {[item.role, item.institution].filter(Boolean).join(' · ')}
                    </Text>
                    {!!item.description && <Text style={bodyStyle}>{item.description}</Text>}
                </View>
            )), research.length > 0),

        publications: section('publications', 'preview.sections.publications',
            publications.map((item) => (
                <View key={item.id} style={[styles.block, { marginBottom: metrics.itemGap + 2 }]}>
                    <Text style={[styles.itemTitle, titleStyle]}>{item.title}</Text>
                    <Text style={[styles.sub, { color: spec.muted }]}>
                        {[item.journal, (item.coauthors || []).join(', '), item.date].filter(Boolean).join(' · ')}
                    </Text>
                </View>
            )), publications.length > 0),

        references: section('references', 'preview.sections.references',
            references.map((item) => (
                <View key={item.id} style={[styles.block, { marginBottom: metrics.itemGap + 2 }]}>
                    <Text style={[styles.itemTitle, titleStyle]}>{item.name}</Text>
                    <Text style={[styles.sub, { color: spec.muted }]}>
                        {[item.title, item.organization].filter(Boolean).join(', ')}
                    </Text>
                </View>
            )), references.length > 0),
    };

    const isBand = spec.headerStyle === 'band';
    const nameStyle: TextStyle = {
        ...fontFamily(spec.displayFont),
        fontSize: metrics.nameSize,
        fontWeight: '800',
        color: isBand ? '#FFFFFF' : spec.ink,
    };
    const contactStyle: TextStyle = {
        ...fontFamily(spec.bodyFont),
        fontSize: metrics.baseFontSize - 0.5,
        lineHeight: (metrics.baseFontSize - 0.5) * 1.5,
        color: isBand ? 'rgba(255,255,255,0.9)' : spec.muted,
    };

    return (
        <View style={styles.container}>
            <View style={styles.topBar}>
                <TouchableOpacity onPress={onBack} hitSlop={8} accessibilityRole="button">
                    <Text style={[styles.backText, { color: colors.primary }]}>{t('preview.backToEdit')}</Text>
                </TouchableOpacity>

                <View style={styles.topBarRight}>
                    {spec.atsPlain && (
                        <View style={[styles.atsBadge, { borderColor: '#10B98155', backgroundColor: '#10B98118' }]}>
                            <ShieldCheck size={12} color="#10B981" />
                            <Text style={styles.atsBadgeText}>{t('templates.atsSafe')}</Text>
                        </View>
                    )}
                    {onExport ? (
                        <TouchableOpacity
                            style={[styles.exportBtn, { backgroundColor: colors.primary, opacity: isExporting ? 0.7 : 1 }]}
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
                            <Text style={styles.exportText}>
                                {isExporting ? t('preview.preparing') : t('preview.pdf')}
                            </Text>
                        </TouchableOpacity>
                    ) : null}
                </View>
            </View>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollInner}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.paper}>
                    {/* Header, in the template's own treatment */}
                    <View
                        style={[
                            isBand && { backgroundColor: spec.accent, margin: -28, marginBottom: 20, padding: 28 },
                            spec.headerStyle === 'centered' && {
                                alignItems: 'center',
                                borderBottomWidth: 1,
                                borderBottomColor: spec.accent,
                                paddingBottom: 12,
                            },
                            spec.headerStyle === 'split' && {
                                flexDirection: 'row',
                                justifyContent: 'space-between',
                                alignItems: 'flex-end',
                                gap: 16,
                                borderBottomWidth: 2,
                                borderBottomColor: spec.accent,
                                paddingBottom: 12,
                            },
                        ]}
                    >
                        <Text style={nameStyle}>{header.full_name || t('preview.yourName')}</Text>
                        {!!contactParts.length && (
                            spec.headerStyle === 'split' ? (
                                <View style={styles.contactColumn}>
                                    {contactParts.map((part, i) => (
                                        <Text key={i} style={[contactStyle, styles.contactRight]}>{part}</Text>
                                    ))}
                                </View>
                            ) : (
                                <Text
                                    style={[
                                        contactStyle,
                                        styles.contactInline,
                                        spec.headerStyle === 'centered' && styles.contactCentered,
                                    ]}
                                >
                                    {contactParts.join('   •   ')}
                                </Text>
                            )
                        )}
                    </View>

                    {spec.sections
                        .filter((type) => type !== 'header')
                        .map((type) => sections[type])
                        .filter(Boolean)}

                    {!hasContent && (
                        <Text style={[styles.empty, { color: spec.muted }]}>{t('preview.empty')}</Text>
                    )}
                </View>
            </ScrollView>
        </View>
    );
}

function PaperSection({
    title,
    design,
    metrics,
    children,
}: {
    title: string;
    design: CVTemplateDesign;
    metrics: ReturnType<typeof getDensityMetrics>;
    children: React.ReactNode;
}) {
    const upper = design.sectionCase === 'upper';
    const headingStyle: TextStyle = {
        ...fontFamily(design.bodyFont),
        fontSize: upper ? 12 : 14,
        fontWeight: '800',
        letterSpacing: upper ? 1.4 : 0.2,
        textTransform: upper ? 'uppercase' : 'none',
        color: design.sectionRule === 'none' ? design.ink : design.accent,
    };

    return (
        <View style={{ marginTop: metrics.sectionGap }}>
            {design.sectionRule === 'boxed' ? (
                <View style={[styles.boxedHeading, { backgroundColor: `${design.accent}1A` }]}>
                    <Text style={headingStyle}>{title}</Text>
                </View>
            ) : design.sectionRule === 'tick' ? (
                <View style={[styles.tickHeading, { borderLeftColor: design.accent }]}>
                    <Text style={headingStyle}>{title}</Text>
                </View>
            ) : (
                <Text style={headingStyle}>{title}</Text>
            )}

            {design.sectionRule === 'underline' && (
                <View style={[styles.rule, { backgroundColor: design.accent }]} />
            )}

            <View style={{ marginTop: design.sectionRule === 'underline' ? 0 : 8 }}>{children}</View>
        </View>
    );
}

function Bullets({
    items,
    design,
    style,
}: {
    items?: string[] | null;
    design: CVTemplateDesign;
    style: TextStyle;
}) {
    const clean = (items || []).map((h) => (h || '').trim()).filter(Boolean);
    if (!clean.length) return null;
    return (
        <View style={styles.bulletList}>
            {clean.map((line, i) => (
                <View key={i} style={styles.bulletRow}>
                    <Text style={[style, { color: design.accent }]}>•</Text>
                    <Text style={[style, styles.flex]}>{line}</Text>
                </View>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    flex: { flex: 1 },
    container: { flex: 1 },
    topBar: {
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
    },
    topBarRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    backText: { fontSize: 14, fontWeight: '600' },
    atsBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 9,
        paddingVertical: 5,
    },
    atsBadgeText: { fontSize: 11, fontWeight: '800', color: '#10B981' },
    exportBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
    },
    exportText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
    scroll: { flex: 1, paddingHorizontal: 16 },
    scrollInner: { paddingBottom: 48 },
    paper: {
        backgroundColor: '#FFFFFF',
        padding: 28,
        borderRadius: 16,
        overflow: 'hidden',
        shadowColor: '#000000',
        shadowOpacity: 0.18,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 12 },
        elevation: 6,
    },
    contactInline: { marginTop: 6 },
    contactCentered: { textAlign: 'center' },
    contactColumn: { alignItems: 'flex-end' },
    contactRight: { textAlign: 'right' },
    rule: { height: 1.5, marginTop: 4, marginBottom: 10, opacity: 0.85 },
    boxedHeading: {
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 5,
    },
    tickHeading: { borderLeftWidth: 3, paddingLeft: 9 },
    block: {},
    rowBetween: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 12,
    },
    itemTitle: { flex: 1, fontSize: 14.5, fontWeight: '700' },
    date: { fontSize: 12, marginTop: 1 },
    sub: { fontSize: 12.5, marginTop: 2, marginBottom: 2 },
    bulletList: { marginTop: 5, gap: 3 },
    bulletRow: { flexDirection: 'row', gap: 8, paddingRight: 4 },
    skillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    skillChip: {
        paddingHorizontal: 11,
        paddingVertical: 4,
        borderRadius: 999,
        borderWidth: 1,
    },
    skillChipText: { fontSize: 12, fontWeight: '600' },
    empty: {
        fontSize: 13.5,
        textAlign: 'center',
        lineHeight: 20,
        paddingVertical: 28,
    },
});
