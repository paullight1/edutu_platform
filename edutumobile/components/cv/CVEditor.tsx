import React from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    ScrollView,
    Switch,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { Check, Download, Sparkles, Target, ChevronRight, Plus, Trash2, Flag } from 'lucide-react-native';
import { CVHeader, UserCV } from '@edutu/core/src/types/cv';
import { useTheme } from '../../components/context/ThemeContext';
import { useReportAIContent } from '../../lib/reportAiContent';

type CVData = NonNullable<UserCV['data_json']>;

const EMPTY_CV_DATA: CVData = {
    header: {
        full_name: '',
        email: '',
    },
    summary: '',
    experience: [],
    education: [],
    skills: [],
    projects: [],
    achievements: [],
};

function normalizeHeader(header?: CVData['header']): CVHeader {
    const safeHeader: CVHeader = header ?? EMPTY_CV_DATA.header!;
    return {
        ...safeHeader,
        full_name: safeHeader.full_name || '',
        email: safeHeader.email || '',
    };
}

interface Props {
    currentCV: Partial<UserCV>;
    setCurrentCV: React.Dispatch<React.SetStateAction<Partial<UserCV>>>;
    isPro: boolean;
    isSaving: boolean;
    isExporting?: boolean;
    isImprovingSummary?: boolean;
    onSave: () => void;
    onExport: () => void;
    onAITailor: () => void;
    onImproveSummary?: () => void;
    onUpgradeFeature: (feature: string) => void;
}

function createLocalId(prefix: string) {
    return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function CVEditor({
    currentCV,
    setCurrentCV,
    isPro,
    isSaving,
    isExporting,
    isImprovingSummary,
    onSave,
    onExport,
    onAITailor,
    onImproveSummary,
    onUpgradeFeature,
}: Props) {
    const { t } = useTranslation('cv');
    const { colors, isDark } = useTheme();
    const muted = isDark ? '#94A3B8' : '#64748B';
    const reportAIContent = useReportAIContent('cv');

    const updateHeader = (key: string, value: string) => {
        setCurrentCV((prev: Partial<UserCV>) => ({
            ...prev,
            data_json: {
                ...EMPTY_CV_DATA,
                ...prev.data_json,
                header: {
                    ...normalizeHeader(prev.data_json?.header),
                    [key]: value,
                },
            },
        }));
    };

    const updateArrayItem = (
        section: 'experience' | 'education' | 'projects' | 'achievements',
        id: string,
        field: string,
        value: any,
    ) => {
        setCurrentCV((prev: Partial<UserCV>) => ({
            ...prev,
            data_json: {
                ...EMPTY_CV_DATA,
                ...prev.data_json,
                [section]: (((prev.data_json as any)?.[section]) || []).map((item: any) =>
                    item.id === id ? { ...item, [field]: value } : item,
                ),
            },
        }));
    };

    const addItem = (section: 'experience' | 'education' | 'projects' | 'achievements') => {
        const newItem =
            section === 'experience'
                ? {
                    id: createLocalId('exp'),
                    company: '',
                    role: '',
                    start_date: '',
                    end_date: '',
                    current: false,
                    location: '',
                    description: '',
                    highlights: [],
                }
                : section === 'education'
                    ? {
                        id: createLocalId('edu'),
                        institution: '',
                        degree: '',
                        field: '',
                        start_date: '',
                        end_date: '',
                        gpa: undefined,
                        highlights: [],
                    }
                    : section === 'projects'
                        ? {
                            id: createLocalId('proj'),
                            name: '',
                            description: '',
                            url: '',
                            technologies: [],
                            start_date: '',
                            end_date: '',
                        }
                        : {
                            id: createLocalId('ach'),
                            title: '',
                            description: '',
                            date: '',
                            issuer: '',
                        };

        setCurrentCV((prev: Partial<UserCV>) => ({
            ...prev,
            data_json: {
                ...EMPTY_CV_DATA,
                ...prev.data_json,
                [section]: [...(((prev.data_json as any)?.[section]) || []), newItem as never],
            },
        }));
    };

    const removeItem = (section: 'experience' | 'education' | 'projects' | 'achievements', id: string) => {
        setCurrentCV((prev: Partial<UserCV>) => ({
            ...prev,
            data_json: {
                ...EMPTY_CV_DATA,
                ...prev.data_json,
                [section]: (((prev.data_json as any)?.[section]) || []).filter((item: any) => item.id !== id),
            },
        }));
    };

    const skillsValue = currentCV.data_json?.skills?.join(', ') || '';

    return (
        <ScrollView style={styles.editorContainer} showsVerticalScrollIndicator={false}>
            <Animated.View entering={FadeInDown.delay(100)}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('editor.sections.personalInfo')}</Text>
                <View style={[styles.inputCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    {[
                        ['full_name', 'editor.personal.fullName.label', 'editor.personal.fullName.placeholder'],
                        ['email', 'editor.personal.email.label', 'editor.personal.email.placeholder'],
                        ['phone', 'editor.personal.phone.label', 'editor.personal.phone.placeholder'],
                        ['location', 'editor.personal.location.label', 'editor.personal.location.placeholder'],
                        ['linkedin', 'editor.personal.linkedin.label', 'editor.personal.linkedin.placeholder'],
                        ['portfolio', 'editor.personal.portfolio.label', 'editor.personal.portfolio.placeholder'],
                    ].map(([key, label, placeholder]) => (
                        <View style={styles.inputRow} key={key}>
                            <Text style={[styles.inputLabel, { color: muted }]}>{t(label)}</Text>
                            <TextInput
                                style={[styles.input, { backgroundColor: colors.background, color: colors.foreground }]}
                                placeholder={t(placeholder)}
                                placeholderTextColor={muted}
                                value={(currentCV.data_json?.header as any)?.[key] || ''}
                                onChangeText={(text) => updateHeader(key, text)}
                            />
                        </View>
                    ))}
                </View>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(180)}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('editor.sections.summary')}</Text>
                <View style={[styles.inputCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <TextInput
                        style={[styles.textArea, { backgroundColor: colors.background, color: colors.foreground }]}
                        placeholder={t('editor.summaryPlaceholder')}
                        placeholderTextColor={muted}
                        multiline
                        numberOfLines={5}
                        value={currentCV.data_json?.summary || ''}
                        onChangeText={(text) =>
                            setCurrentCV((prev: Partial<UserCV>) => ({
                                ...prev,
                                data_json: { ...prev.data_json, summary: text },
                            }))
                        }
                    />
                    <TouchableOpacity
                        style={[styles.aiGenerateBtn, { backgroundColor: colors.primary, opacity: isImprovingSummary ? 0.7 : 1 }]}
                        onPress={
                            isPro
                                ? (onImproveSummary ?? onAITailor)
                                : () => onUpgradeFeature(t('editor.aiSummaryFeature'))
                        }
                        disabled={isImprovingSummary}
                    >
                        {isImprovingSummary ? (
                            <ActivityIndicator color="#FFFFFF" size="small" />
                        ) : (
                            <Sparkles size={16} color="#FFFFFF" />
                        )}
                        <Text style={styles.aiGenerateText}>
                            {isImprovingSummary ? t('editor.improving') : isPro ? t('editor.improveWithAi') : t('editor.unlockAiAssist')}
                        </Text>
                    </TouchableOpacity>
                    {!!currentCV.data_json?.summary && (
                        <TouchableOpacity
                            style={styles.reportAiBtn}
                            onPress={() =>
                                reportAIContent(currentCV.data_json?.summary || '', { cvId: currentCV.id })
                            }
                        >
                            <Flag size={12} color={muted} />
                            <Text style={[styles.reportAiText, { color: muted }]}>
                                {t('common:aiReport.button')}
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(260)}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('editor.sections.skills')}</Text>
                <View style={[styles.inputCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <TextInput
                        style={[styles.input, { backgroundColor: colors.background, color: colors.foreground }]}
                        placeholder={t('editor.skillsPlaceholder')}
                        placeholderTextColor={muted}
                        value={skillsValue}
                        onChangeText={(text) =>
                            setCurrentCV((prev: Partial<UserCV>) => ({
                                ...prev,
                                data_json: {
                                    ...prev.data_json,
                                    skills: text.split(',').map((item) => item.trim()).filter(Boolean),
                                },
                            }))
                        }
                    />
                    {(currentCV.data_json?.skills || []).length > 0 && (
                        <View style={styles.skillTags}>
                            {currentCV.data_json?.skills?.map((skill: string, index: number) => (
                                <View key={`${skill}-${index}`} style={[styles.skillTag, { backgroundColor: colors.primary + '20' }]}>
                                    <Text style={[styles.skillTagText, { color: colors.primary }]}>{skill}</Text>
                                </View>
                            ))}
                        </View>
                    )}
                </View>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(320)}>
                <SectionHeader
                    title={t('editor.sections.experience')}
                    color={colors.foreground}
                    count={(currentCV.data_json?.experience || []).length}
                    onAdd={() => addItem('experience')}
                />
                {(currentCV.data_json?.experience || []).length === 0 && (
                    <EmptyHint label={t('editor.empty.experience')} />
                )}
                {(currentCV.data_json?.experience || []).map((item: any) => (
                    <View key={item.id} style={[styles.inputCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <ItemHeader title={item.role || t('editor.newExperience')} onDelete={() => removeItem('experience', item.id)} />
                        <Field label={t('editor.fields.role.label')} value={item.role} placeholder={t('editor.fields.role.placeholder')} muted={muted} colors={colors}
                            onChangeText={(text) => updateArrayItem('experience', item.id, 'role', text)} />
                        <Field label={t('editor.fields.company.label')} value={item.company} placeholder={t('editor.fields.company.placeholder')} muted={muted} colors={colors}
                            onChangeText={(text) => updateArrayItem('experience', item.id, 'company', text)} />
                        <Field label={t('editor.fields.location.label')} value={item.location || ''} placeholder={t('editor.fields.location.placeholder')} muted={muted} colors={colors}
                            onChangeText={(text) => updateArrayItem('experience', item.id, 'location', text)} />
                        <Field label={t('editor.fields.startDate.label')} value={item.start_date} placeholder={t('editor.fields.startDate.placeholder')} muted={muted} colors={colors}
                            onChangeText={(text) => updateArrayItem('experience', item.id, 'start_date', text)} />
                        {!item.current && (
                            <Field label={t('editor.fields.endDate.label')} value={item.end_date || ''} placeholder={t('editor.fields.endDate.placeholder')} muted={muted} colors={colors}
                                onChangeText={(text) => updateArrayItem('experience', item.id, 'end_date', text)} />
                        )}
                        <View style={styles.switchRow}>
                            <Text style={[styles.inputLabel, { color: muted, marginBottom: 0 }]}>{t('editor.fields.currentlyWorkHere')}</Text>
                            <Switch
                                value={Boolean(item.current)}
                                onValueChange={(value) => updateArrayItem('experience', item.id, 'current', value)}
                                trackColor={{ true: colors.primary }}
                            />
                        </View>
                        <Field label={t('editor.fields.description.label')} value={item.description} placeholder={t('editor.fields.description.placeholder')} muted={muted} colors={colors}
                            multiline onChangeText={(text) => updateArrayItem('experience', item.id, 'description', text)} />
                        <Field label={t('editor.fields.highlights.label')} value={(item.highlights || []).join('\n')} placeholder={t('editor.fields.highlights.placeholder')} muted={muted} colors={colors}
                            multiline onChangeText={(text) => updateArrayItem('experience', item.id, 'highlights', text.split('\n'))} />
                    </View>
                ))}
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(380)}>
                <SectionHeader
                    title={t('editor.sections.education')}
                    color={colors.foreground}
                    count={(currentCV.data_json?.education || []).length}
                    onAdd={() => addItem('education')}
                />
                {(currentCV.data_json?.education || []).length === 0 && (
                    <EmptyHint label={t('editor.empty.education')} />
                )}
                {(currentCV.data_json?.education || []).map((item: any) => (
                    <View key={item.id} style={[styles.inputCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <ItemHeader title={item.degree || t('editor.newEducation')} onDelete={() => removeItem('education', item.id)} />
                        <Field label={t('editor.fields.institution.label')} value={item.institution} placeholder={t('editor.fields.institution.placeholder')} muted={muted} colors={colors}
                            onChangeText={(text) => updateArrayItem('education', item.id, 'institution', text)} />
                        <Field label={t('editor.fields.degree.label')} value={item.degree} placeholder={t('editor.fields.degree.placeholder')} muted={muted} colors={colors}
                            onChangeText={(text) => updateArrayItem('education', item.id, 'degree', text)} />
                        <Field label={t('editor.fields.fieldOfStudy.label')} value={item.field || ''} placeholder={t('editor.fields.fieldOfStudy.placeholder')} muted={muted} colors={colors}
                            onChangeText={(text) => updateArrayItem('education', item.id, 'field', text)} />
                        <Field label={t('editor.fields.startDate.label')} value={item.start_date || ''} placeholder={t('editor.fields.eduStartDate.placeholder')} muted={muted} colors={colors}
                            onChangeText={(text) => updateArrayItem('education', item.id, 'start_date', text)} />
                        <Field label={t('editor.fields.endDate.label')} value={item.end_date || ''} placeholder={t('editor.fields.eduEndDate.placeholder')} muted={muted} colors={colors}
                            onChangeText={(text) => updateArrayItem('education', item.id, 'end_date', text)} />
                    </View>
                ))}
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(440)}>
                <SectionHeader
                    title={t('editor.sections.projects')}
                    color={colors.foreground}
                    count={(currentCV.data_json?.projects || []).length}
                    onAdd={() => addItem('projects')}
                />
                {(currentCV.data_json?.projects || []).length === 0 && (
                    <EmptyHint label={t('editor.empty.projects')} />
                )}
                {(currentCV.data_json?.projects || []).map((item: any) => (
                    <View key={item.id} style={[styles.inputCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <ItemHeader title={item.name || t('editor.newProject')} onDelete={() => removeItem('projects', item.id)} />
                        <Field label={t('editor.fields.projectName.label')} value={item.name} placeholder={t('editor.fields.projectName.placeholder')} muted={muted} colors={colors}
                            onChangeText={(text) => updateArrayItem('projects', item.id, 'name', text)} />
                        <Field label={t('editor.fields.description.label')} value={item.description} placeholder={t('editor.fields.projectDescription.placeholder')} muted={muted} colors={colors}
                            multiline onChangeText={(text) => updateArrayItem('projects', item.id, 'description', text)} />
                        <Field label={t('editor.fields.technologies.label')} value={(item.technologies || []).join(', ')} placeholder={t('editor.fields.technologies.placeholder')} muted={muted} colors={colors}
                            onChangeText={(text) => updateArrayItem('projects', item.id, 'technologies', text.split(',').map((value) => value.trim()).filter(Boolean))} />
                    </View>
                ))}
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(500)}>
                <SectionHeader
                    title={t('editor.sections.achievements')}
                    color={colors.foreground}
                    count={(currentCV.data_json?.achievements || []).length}
                    onAdd={() => addItem('achievements')}
                />
                {(currentCV.data_json?.achievements || []).length === 0 && (
                    <EmptyHint label={t('editor.empty.achievements')} />
                )}
                {(currentCV.data_json?.achievements || []).map((item: any) => (
                    <View key={item.id} style={[styles.inputCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <ItemHeader title={item.title || t('editor.newAchievement')} onDelete={() => removeItem('achievements', item.id)} />
                        <Field label={t('editor.fields.achievementTitle.label')} value={item.title} placeholder={t('editor.fields.achievementTitle.placeholder')} muted={muted} colors={colors}
                            onChangeText={(text) => updateArrayItem('achievements', item.id, 'title', text)} />
                        <Field label={t('editor.fields.issuer.label')} value={item.issuer || ''} placeholder={t('editor.fields.issuer.placeholder')} muted={muted} colors={colors}
                            onChangeText={(text) => updateArrayItem('achievements', item.id, 'issuer', text)} />
                        <Field label={t('editor.fields.description.label')} value={item.description} placeholder={t('editor.fields.achievementDescription.placeholder')} muted={muted} colors={colors}
                            multiline onChangeText={(text) => updateArrayItem('achievements', item.id, 'description', text)} />
                    </View>
                ))}
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(560)}>
                <TouchableOpacity
                    style={[styles.tailorBtn, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: colors.border }]}
                    onPress={isPro ? onAITailor : () => onUpgradeFeature(t('editor.tailor.title'))}
                >
                    <Target size={20} color={isPro ? colors.primary : '#F59E0B'} />
                    <View style={styles.tailorContent}>
                        <Text style={[styles.tailorTitle, { color: colors.foreground }]}>{t('editor.tailor.title')}</Text>
                        <Text style={[styles.tailorSubtitle, { color: muted }]}>
                            {t('editor.tailor.subtitle')}
                        </Text>
                    </View>
                    <ChevronRight size={20} color={muted} />
                </TouchableOpacity>
            </Animated.View>

            <Animated.View entering={FadeInUp.delay(620)} style={styles.actionButtons}>
                <TouchableOpacity
                    style={[styles.saveBtn, { backgroundColor: colors.primary }]}
                    onPress={onSave}
                    disabled={isSaving}
                >
                    {isSaving ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                        <>
                            <Check size={20} color="#FFFFFF" />
                            <Text style={styles.saveBtnText}>{t('editor.save')}</Text>
                        </>
                    )}
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.exportBtn, { borderColor: colors.border, opacity: isExporting ? 0.7 : 1 }]}
                    onPress={onExport}
                    disabled={isExporting}
                >
                    {isExporting ? (
                        <ActivityIndicator color={colors.primary} size="small" />
                    ) : (
                        <Download size={20} color={colors.primary} />
                    )}
                    <Text style={[styles.exportBtnText, { color: colors.primary }]}>
                        {isExporting ? t('editor.preparing') : t('editor.downloadPdf')}
                    </Text>
                </TouchableOpacity>
            </Animated.View>
        </ScrollView>
    );
}

function SectionHeader({
    title,
    color,
    count,
    onAdd,
}: {
    title: string;
    color: string;
    count?: number;
    onAdd: () => void;
}) {
    const { t } = useTranslation('cv');
    return (
        <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionTitleWrap}>
                <Text style={[styles.sectionTitle, { color, marginTop: 20 }]}>{title}</Text>
                {typeof count === 'number' && count > 0 && (
                    <View style={styles.countBadge}>
                        <Text style={styles.countBadgeText}>{count}</Text>
                    </View>
                )}
            </View>
            <TouchableOpacity style={styles.addBtn} onPress={onAdd} hitSlop={8}>
                <Plus size={16} color="#6366F1" />
                <Text style={styles.addBtnText}>{t('editor.add')}</Text>
            </TouchableOpacity>
        </View>
    );
}

function ItemHeader({ title, onDelete }: { title: string; onDelete: () => void }) {
    const { colors } = useTheme();
    return (
        <View style={styles.itemHeader}>
            <Text style={[styles.itemHeaderText, { color: colors.foreground }]} numberOfLines={1}>
                {title}
            </Text>
            <TouchableOpacity onPress={onDelete} hitSlop={8}>
                <Trash2 size={16} color="#EF4444" />
            </TouchableOpacity>
        </View>
    );
}

function EmptyHint({ label }: { label: string }) {
    const { isDark } = useTheme();
    return (
        <View
            style={[
                styles.emptyHint,
                { borderColor: isDark ? 'rgba(148,163,184,0.28)' : 'rgba(148,163,184,0.5)' },
            ]}
        >
            <Text style={[styles.emptyHintText, { color: isDark ? '#64748B' : '#94A3B8' }]}>
                {label}
            </Text>
        </View>
    );
}

function Field({
    label,
    value,
    placeholder,
    muted,
    colors,
    onChangeText,
    multiline,
}: {
    label: string;
    value: string;
    placeholder: string;
    muted: string;
    colors: any;
    onChangeText: (text: string) => void;
    multiline?: boolean;
}) {
    return (
        <View style={styles.inputRow}>
            <Text style={[styles.inputLabel, { color: muted }]}>{label}</Text>
            <TextInput
                style={[
                    multiline ? styles.textArea : styles.input,
                    { backgroundColor: colors.background, color: colors.foreground },
                ]}
                placeholder={placeholder}
                placeholderTextColor={muted}
                value={value}
                multiline={multiline}
                numberOfLines={multiline ? 4 : 1}
                onChangeText={onChangeText}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    editorContainer: {
        flex: 1,
        paddingHorizontal: 16,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        marginTop: 20,
        marginBottom: 12,
    },
    sectionHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    sectionTitleWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    countBadge: {
        minWidth: 20,
        height: 20,
        paddingHorizontal: 6,
        borderRadius: 10,
        marginTop: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(99,102,241,0.16)',
    },
    countBadgeText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#6366F1',
    },
    emptyHint: {
        borderWidth: 1,
        borderStyle: 'dashed',
        borderRadius: 12,
        paddingVertical: 18,
        paddingHorizontal: 16,
        marginBottom: 12,
        alignItems: 'center',
    },
    emptyHintText: {
        fontSize: 13,
        fontWeight: '500',
        textAlign: 'center',
    },
    addBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    addBtnText: {
        color: '#6366F1',
        fontWeight: '600',
    },
    inputCard: {
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
    },
    inputRow: {
        marginBottom: 12,
    },
    switchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    inputLabel: {
        fontSize: 12,
        fontWeight: '500',
        marginBottom: 6,
    },
    input: {
        borderRadius: 8,
        padding: 12,
        fontSize: 14,
    },
    textArea: {
        borderRadius: 8,
        padding: 12,
        fontSize: 14,
        minHeight: 96,
        textAlignVertical: 'top',
    },
    aiGenerateBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 14,
        borderRadius: 8,
        marginTop: 8,
        gap: 8,
    },
    reportAiBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        marginTop: 8,
        paddingVertical: 4,
    },
    reportAiText: {
        fontSize: 12,
        fontWeight: '600',
    },
    aiGenerateText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '600',
    },
    skillTags: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginTop: 8,
    },
    skillTag: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 11,
        paddingVertical: 5,
        borderRadius: 999,
        marginRight: 6,
        marginBottom: 6,
        borderWidth: 1,
        borderColor: 'rgba(99,102,241,0.28)',
    },
    skillTagText: {
        fontSize: 12,
        fontWeight: '600',
    },
    itemHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    itemHeaderText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#334155',
    },
    tailorBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 12,
        marginBottom: 16,
        borderWidth: 1,
    },
    tailorContent: {
        flex: 1,
        marginLeft: 12,
    },
    tailorTitle: {
        fontSize: 14,
        fontWeight: '600',
    },
    tailorSubtitle: {
        fontSize: 12,
        marginTop: 2,
    },
    actionButtons: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 8,
        marginBottom: 40,
    },
    saveBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        borderRadius: 12,
        gap: 8,
    },
    saveBtnText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
    },
    exportBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        gap: 6,
    },
    exportBtnText: {
        fontSize: 16,
        fontWeight: '600',
    },
});
