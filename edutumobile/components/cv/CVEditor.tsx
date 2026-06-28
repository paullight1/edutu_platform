import React from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    ScrollView,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Check, Download, Sparkles, Target, ChevronRight, Plus, Trash2 } from 'lucide-react-native';
import { CVHeader, UserCV } from '@edutu/core/src/types/cv';
import { useTheme } from '../../components/context/ThemeContext';

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
    onSave: () => void;
    onExport: () => void;
    onAITailor: () => void;
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
    onSave,
    onExport,
    onAITailor,
    onUpgradeFeature,
}: Props) {
    const { colors, isDark } = useTheme();
    const muted = isDark ? '#94A3B8' : '#64748B';

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
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Personal Information</Text>
                <View style={[styles.inputCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    {[
                        ['full_name', 'Full Name', 'John Doe'],
                        ['email', 'Email', 'john@example.com'],
                        ['phone', 'Phone', '+1 234 567 8900'],
                        ['location', 'Location', 'Lagos, Nigeria'],
                        ['linkedin', 'LinkedIn', 'linkedin.com/in/johndoe'],
                        ['portfolio', 'Portfolio', 'portfolio.site'],
                    ].map(([key, label, placeholder]) => (
                        <View style={styles.inputRow} key={key}>
                            <Text style={[styles.inputLabel, { color: muted }]}>{label}</Text>
                            <TextInput
                                style={[styles.input, { backgroundColor: colors.background, color: colors.foreground }]}
                                placeholder={placeholder}
                                placeholderTextColor={muted}
                                value={(currentCV.data_json?.header as any)?.[key] || ''}
                                onChangeText={(text) => updateHeader(key, text)}
                            />
                        </View>
                    ))}
                </View>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(180)}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Professional Summary</Text>
                <View style={[styles.inputCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <TextInput
                        style={[styles.textArea, { backgroundColor: colors.background, color: colors.foreground }]}
                        placeholder="Write a concise professional summary..."
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
                        style={[styles.aiGenerateBtn, { backgroundColor: colors.primary }]}
                        onPress={isPro ? onAITailor : () => onUpgradeFeature('AI Summary Generator')}
                    >
                        <Sparkles size={16} color="#FFFFFF" />
                        <Text style={styles.aiGenerateText}>{isPro ? 'Improve with AI' : 'Unlock AI Assist'}</Text>
                    </TouchableOpacity>
                </View>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(260)}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Skills</Text>
                <View style={[styles.inputCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <TextInput
                        style={[styles.input, { backgroundColor: colors.background, color: colors.foreground }]}
                        placeholder="JavaScript, Research, Excel, Public speaking..."
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
                    title="Experience"
                    color={colors.foreground}
                    onAdd={() => addItem('experience')}
                />
                {(currentCV.data_json?.experience || []).map((item: any) => (
                    <View key={item.id} style={[styles.inputCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <ItemHeader title={item.role || 'New experience'} onDelete={() => removeItem('experience', item.id)} />
                        <Field label="Role" value={item.role} placeholder="Software Intern" muted={muted} colors={colors}
                            onChangeText={(text) => updateArrayItem('experience', item.id, 'role', text)} />
                        <Field label="Company" value={item.company} placeholder="Company / Organization" muted={muted} colors={colors}
                            onChangeText={(text) => updateArrayItem('experience', item.id, 'company', text)} />
                        <Field label="Location" value={item.location || ''} placeholder="Remote / City" muted={muted} colors={colors}
                            onChangeText={(text) => updateArrayItem('experience', item.id, 'location', text)} />
                        <Field label="Start Date" value={item.start_date} placeholder="2024-01" muted={muted} colors={colors}
                            onChangeText={(text) => updateArrayItem('experience', item.id, 'start_date', text)} />
                        <Field label="End Date" value={item.end_date || ''} placeholder="2025-01" muted={muted} colors={colors}
                            onChangeText={(text) => updateArrayItem('experience', item.id, 'end_date', text)} />
                        <Field label="Description" value={item.description} placeholder="Describe what you did" muted={muted} colors={colors}
                            multiline onChangeText={(text) => updateArrayItem('experience', item.id, 'description', text)} />
                    </View>
                ))}
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(380)}>
                <SectionHeader
                    title="Education"
                    color={colors.foreground}
                    onAdd={() => addItem('education')}
                />
                {(currentCV.data_json?.education || []).map((item: any) => (
                    <View key={item.id} style={[styles.inputCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <ItemHeader title={item.degree || 'New education'} onDelete={() => removeItem('education', item.id)} />
                        <Field label="Institution" value={item.institution} placeholder="University / School" muted={muted} colors={colors}
                            onChangeText={(text) => updateArrayItem('education', item.id, 'institution', text)} />
                        <Field label="Degree" value={item.degree} placeholder="BSc / MSc / Diploma" muted={muted} colors={colors}
                            onChangeText={(text) => updateArrayItem('education', item.id, 'degree', text)} />
                        <Field label="Field" value={item.field || ''} placeholder="Computer Science" muted={muted} colors={colors}
                            onChangeText={(text) => updateArrayItem('education', item.id, 'field', text)} />
                    </View>
                ))}
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(440)}>
                <SectionHeader
                    title="Projects"
                    color={colors.foreground}
                    onAdd={() => addItem('projects')}
                />
                {(currentCV.data_json?.projects || []).map((item: any) => (
                    <View key={item.id} style={[styles.inputCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <ItemHeader title={item.name || 'New project'} onDelete={() => removeItem('projects', item.id)} />
                        <Field label="Project Name" value={item.name} placeholder="Scholarship Finder App" muted={muted} colors={colors}
                            onChangeText={(text) => updateArrayItem('projects', item.id, 'name', text)} />
                        <Field label="Description" value={item.description} placeholder="Describe the project impact" muted={muted} colors={colors}
                            multiline onChangeText={(text) => updateArrayItem('projects', item.id, 'description', text)} />
                        <Field label="Technologies" value={(item.technologies || []).join(', ')} placeholder="React, Node.js" muted={muted} colors={colors}
                            onChangeText={(text) => updateArrayItem('projects', item.id, 'technologies', text.split(',').map((value) => value.trim()).filter(Boolean))} />
                    </View>
                ))}
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(500)}>
                <SectionHeader
                    title="Achievements"
                    color={colors.foreground}
                    onAdd={() => addItem('achievements')}
                />
                {(currentCV.data_json?.achievements || []).map((item: any) => (
                    <View key={item.id} style={[styles.inputCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <ItemHeader title={item.title || 'New achievement'} onDelete={() => removeItem('achievements', item.id)} />
                        <Field label="Title" value={item.title} placeholder="Dean's List" muted={muted} colors={colors}
                            onChangeText={(text) => updateArrayItem('achievements', item.id, 'title', text)} />
                        <Field label="Issuer" value={item.issuer || ''} placeholder="University / Organization" muted={muted} colors={colors}
                            onChangeText={(text) => updateArrayItem('achievements', item.id, 'issuer', text)} />
                        <Field label="Description" value={item.description} placeholder="Why it matters" muted={muted} colors={colors}
                            multiline onChangeText={(text) => updateArrayItem('achievements', item.id, 'description', text)} />
                    </View>
                ))}
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(560)}>
                <TouchableOpacity
                    style={[styles.tailorBtn, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: colors.border }]}
                    onPress={isPro ? onAITailor : () => onUpgradeFeature('Tailor for Opportunity')}
                >
                    <Target size={20} color={isPro ? colors.primary : '#F59E0B'} />
                    <View style={styles.tailorContent}>
                        <Text style={[styles.tailorTitle, { color: colors.foreground }]}>Tailor for Opportunity</Text>
                        <Text style={[styles.tailorSubtitle, { color: muted }]}>
                            Match this CV against opportunities in your bank
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
                            <Text style={styles.saveBtnText}>Save CV</Text>
                        </>
                    )}
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.exportBtn, { borderColor: colors.border }]}
                    onPress={onExport}
                >
                    <Download size={20} color={colors.primary} />
                    <Text style={[styles.exportBtnText, { color: colors.primary }]}>Share CV</Text>
                </TouchableOpacity>
            </Animated.View>
        </ScrollView>
    );
}

function SectionHeader({ title, color, onAdd }: { title: string; color: string; onAdd: () => void }) {
    return (
        <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color, marginTop: 20 }]}>{title}</Text>
            <TouchableOpacity style={styles.addBtn} onPress={onAdd}>
                <Plus size={16} color="#6366F1" />
                <Text style={styles.addBtnText}>Add</Text>
            </TouchableOpacity>
        </View>
    );
}

function ItemHeader({ title, onDelete }: { title: string; onDelete: () => void }) {
    return (
        <View style={styles.itemHeader}>
            <Text style={styles.itemHeaderText}>{title}</Text>
            <TouchableOpacity onPress={onDelete}>
                <Trash2 size={16} color="#EF4444" />
            </TouchableOpacity>
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
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        marginRight: 6,
        marginBottom: 6,
    },
    skillTagText: {
        fontSize: 12,
        fontWeight: '500',
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
