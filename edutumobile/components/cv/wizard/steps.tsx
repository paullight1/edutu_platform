import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
    Briefcase,
    Flag,
    FolderOpen,
    GraduationCap,
    RotateCcw,
    Trophy,
    Wand2,
} from 'lucide-react-native';
import type { UserCV } from '@edutu/core/src/types/cv';
import { AnimatedPressable } from '../../ui/AnimatedPressable';
import {
    StepBasicsIllustration,
    StepEducationIllustration,
    StepExperienceIllustration,
    StepExtrasIllustration,
    StepSummaryIllustration,
} from '../../state/illustrations';
import {
    EmptyStepHint,
    FormCard,
    FormField,
    ItemHeader,
    ListHeader,
    SPACE,
    StepIntro,
    SwitchRow,
    useFieldColors,
} from './formKit';
import { MonthYearField } from './MonthYearField';
import { SkillChipsInput } from './SkillChipsInput';
import {
    addItem,
    updateArrayItem,
    updateDataField,
    updateHeaderField,
    type CVDraftSetter,
    type RepeatableSection,
} from './cvDraft';

export interface StepProps {
    currentCV: Partial<UserCV>;
    setCurrentCV: CVDraftSetter;
    /** Confirm-then-delete, owned by the wizard so every removal is undoable. */
    onRequestDelete: (section: RepeatableSection, id: string, title: string) => void;
    /** Field-level errors, keyed by field name. Non-blocking except full_name. */
    errors: Record<string, string>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Field-level validation. Only `full_name` blocks progress. */
export function validateBasics(cv: Partial<UserCV>, t: (key: string) => string) {
    const header = cv.data_json?.header;
    const errors: Record<string, string> = {};
    if (!(header?.full_name || '').trim()) errors.full_name = t('wizard.errors.nameRequired');
    const email = (header?.email || '').trim();
    if (email && !EMAIL_RE.test(email)) errors.email = t('wizard.errors.emailInvalid');
    return errors;
}

// ── Step 1: Basics ───────────────────────────────────────────────────────────

export function BasicsStep({ currentCV, setCurrentCV, errors }: StepProps) {
    const { t } = useTranslation('cv');
    const header = currentCV.data_json?.header as Record<string, string> | undefined;

    const set = (key: string) => (value: string) =>
        updateHeaderField(setCurrentCV, key as never, value);

    return (
        <View>
            <StepIntro
                title={t('wizard.steps.basics.title')}
                description={t('wizard.steps.basics.description')}
                illustration={StepBasicsIllustration}
            />
            <FormCard>
                <FormField
                    label={t('editor.personal.fullName.label')}
                    placeholder={t('editor.personal.fullName.placeholder')}
                    value={header?.full_name || ''}
                    onChangeText={set('full_name')}
                    error={errors.full_name}
                    required
                    autoCapitalize="words"
                    textContentType="name"
                />
                <FormField
                    label={t('editor.personal.email.label')}
                    placeholder={t('editor.personal.email.placeholder')}
                    value={header?.email || ''}
                    onChangeText={set('email')}
                    error={errors.email}
                    required
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="emailAddress"
                />
                <FormField
                    label={t('editor.personal.phone.label')}
                    placeholder={t('editor.personal.phonePlaceholder')}
                    value={header?.phone || ''}
                    onChangeText={set('phone')}
                    keyboardType="phone-pad"
                    textContentType="telephoneNumber"
                />
                <FormField
                    label={t('editor.personal.location.label')}
                    placeholder={t('editor.personal.locationPlaceholder')}
                    value={header?.location || ''}
                    onChangeText={set('location')}
                    hint={t('wizard.steps.basics.locationHint')}
                />
                <FormField
                    label={t('editor.personal.linkedin.label')}
                    placeholder={t('editor.personal.linkedinPlaceholder')}
                    value={header?.linkedin || ''}
                    onChangeText={set('linkedin')}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                />
                <FormField
                    label={t('editor.personal.portfolio.label')}
                    placeholder={t('editor.personal.portfolioPlaceholder')}
                    value={header?.portfolio || ''}
                    onChangeText={set('portfolio')}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    containerStyle={styles.lastField}
                />
            </FormCard>
        </View>
    );
}

// ── Step 2: Summary & Skills ─────────────────────────────────────────────────

interface SummaryStepProps extends StepProps {
    isPro: boolean;
    isImprovingSummary?: boolean;
    onImproveSummary?: () => void;
    onUpgradeFeature: (feature: string) => void;
    canUndoSummary?: boolean;
    onUndoSummary?: () => void;
    onReportSummary?: () => void;
}

export function SummaryStep({
    currentCV,
    setCurrentCV,
    isPro,
    isImprovingSummary,
    onImproveSummary,
    onUpgradeFeature,
    canUndoSummary,
    onUndoSummary,
    onReportSummary,
}: SummaryStepProps) {
    const { t } = useTranslation('cv');
    const { colors, muted } = useFieldColors();
    const summary = currentCV.data_json?.summary || '';
    const skills = currentCV.data_json?.skills || [];

    return (
        <View>
            <StepIntro
                title={t('wizard.steps.summary.title')}
                description={t('wizard.steps.summary.description')}
                illustration={StepSummaryIllustration}
            />

            <FormCard>
                <FormField
                    label={t('editor.sections.summary')}
                    hint={t('wizard.steps.summary.hint')}
                    placeholder={t('editor.summaryPlaceholder')}
                    value={summary}
                    onChangeText={(text) => updateDataField(setCurrentCV, 'summary', text)}
                    multiline
                    containerStyle={styles.lastField}
                />

                <AnimatedPressable
                    style={[styles.aiBtn, { backgroundColor: colors.primary, opacity: isImprovingSummary ? 0.7 : 1 }]}
                    scaleTo={0.97}
                    disabled={isImprovingSummary}
                    onPress={
                        isPro
                            ? onImproveSummary
                            : () => onUpgradeFeature(t('editor.aiSummaryFeature'))
                    }
                    accessibilityRole="button"
                >
                    <View style={styles.aiBtnInner}>
                        {isImprovingSummary ? (
                            <ActivityIndicator color="#FFFFFF" size="small" />
                        ) : (
                            <Wand2 size={17} color="#FFFFFF" />
                        )}
                        <Text style={styles.aiBtnText}>
                            {isImprovingSummary
                                ? t('editor.improving')
                                : isPro
                                    ? t('editor.improveWithAi')
                                    : t('editor.unlockAiAssist')}
                        </Text>
                    </View>
                </AnimatedPressable>

                {canUndoSummary && onUndoSummary && (
                    <AnimatedPressable style={styles.quietBtn} scaleTo={0.97} onPress={onUndoSummary}>
                        <View style={styles.quietBtnInner}>
                            <RotateCcw size={14} color={muted} />
                            <Text style={[styles.quietBtnText, { color: muted }]}>
                                {t('editor.undoRewrite')}
                            </Text>
                        </View>
                    </AnimatedPressable>
                )}

                {!!summary && onReportSummary && (
                    <AnimatedPressable style={styles.quietBtn} scaleTo={0.97} onPress={onReportSummary}>
                        <View style={styles.quietBtnInner}>
                            <Flag size={12} color={muted} />
                            <Text style={[styles.quietBtnText, { color: muted }]}>
                                {t('common:aiReport.button')}
                            </Text>
                        </View>
                    </AnimatedPressable>
                )}
            </FormCard>

            <FormCard>
                <SkillChipsInput
                    skills={skills}
                    onChange={(next) => updateDataField(setCurrentCV, 'skills', next)}
                    label={t('editor.sections.skills')}
                    hint={t('wizard.steps.summary.skillsHint')}
                    placeholder={t('wizard.skills.placeholder')}
                />
            </FormCard>
        </View>
    );
}

// ── Step 3: Experience ───────────────────────────────────────────────────────

export function ExperienceStep({ currentCV, setCurrentCV, onRequestDelete }: StepProps) {
    const { t } = useTranslation('cv');
    const items = currentCV.data_json?.experience || [];

    return (
        <View>
            <StepIntro
                title={t('wizard.steps.experience.title')}
                description={t('wizard.steps.experience.description')}
                illustration={StepExperienceIllustration}
            />

            <ListHeader
                title={t('editor.sections.experience')}
                count={items.length}
                addLabel={t('editor.add')}
                onAdd={() => addItem(setCurrentCV, 'experience')}
            />

            {items.length === 0 ? (
                <EmptyStepHint
                    label={t('editor.empty.experience')}
                    icon={Briefcase}
                    onAdd={() => addItem(setCurrentCV, 'experience')}
                />
            ) : (
                items.map((item) => (
                    <FormCard key={item.id}>
                        <ItemHeader
                            title={item.role || t('editor.newExperience')}
                            onDelete={() =>
                                onRequestDelete('experience', item.id, item.role || t('editor.newExperience'))
                            }
                        />
                        <FormField
                            label={t('editor.fields.role.label')}
                            placeholder={t('editor.fields.role.placeholder')}
                            value={item.role}
                            onChangeText={(text) => updateArrayItem(setCurrentCV, 'experience', item.id, 'role', text)}
                        />
                        <FormField
                            label={t('editor.fields.company.label')}
                            placeholder={t('editor.fields.company.placeholder')}
                            value={item.company}
                            onChangeText={(text) => updateArrayItem(setCurrentCV, 'experience', item.id, 'company', text)}
                        />
                        <FormField
                            label={t('editor.fields.location.label')}
                            placeholder={t('editor.fields.location.placeholder')}
                            value={item.location || ''}
                            onChangeText={(text) => updateArrayItem(setCurrentCV, 'experience', item.id, 'location', text)}
                        />
                        <View style={styles.dateRow}>
                            <MonthYearField
                                label={t('editor.fields.startDate.label')}
                                value={item.start_date}
                                onChange={(value) => updateArrayItem(setCurrentCV, 'experience', item.id, 'start_date', value)}
                            />
                            <MonthYearField
                                label={t('editor.fields.endDate.label')}
                                value={item.end_date}
                                onChange={(value) => updateArrayItem(setCurrentCV, 'experience', item.id, 'end_date', value)}
                                disabled={Boolean(item.current)}
                                disabledText={t('preview.present')}
                            />
                        </View>
                        <SwitchRow
                            label={t('editor.fields.currentlyWorkHere')}
                            value={Boolean(item.current)}
                            onValueChange={(value) => updateArrayItem(setCurrentCV, 'experience', item.id, 'current', value)}
                        />
                        <FormField
                            label={t('editor.fields.description.label')}
                            placeholder={t('editor.fields.description.placeholder')}
                            value={item.description}
                            onChangeText={(text) => updateArrayItem(setCurrentCV, 'experience', item.id, 'description', text)}
                            multiline
                        />
                        <FormField
                            label={t('editor.fields.highlights.label')}
                            hint={t('wizard.steps.experience.highlightsHint')}
                            placeholder={t('editor.fields.highlights.placeholder')}
                            value={(item.highlights || []).join('\n')}
                            onChangeText={(text) =>
                                updateArrayItem(setCurrentCV, 'experience', item.id, 'highlights', text.split('\n'))
                            }
                            multiline
                            containerStyle={styles.lastField}
                        />
                    </FormCard>
                ))
            )}
        </View>
    );
}

// ── Step 4: Education ────────────────────────────────────────────────────────

export function EducationStep({ currentCV, setCurrentCV, onRequestDelete }: StepProps) {
    const { t } = useTranslation('cv');
    const items = currentCV.data_json?.education || [];

    return (
        <View>
            <StepIntro
                title={t('wizard.steps.education.title')}
                description={t('wizard.steps.education.description')}
                illustration={StepEducationIllustration}
            />

            <ListHeader
                title={t('editor.sections.education')}
                count={items.length}
                addLabel={t('editor.add')}
                onAdd={() => addItem(setCurrentCV, 'education')}
            />

            {items.length === 0 ? (
                <EmptyStepHint
                    label={t('editor.empty.education')}
                    icon={GraduationCap}
                    onAdd={() => addItem(setCurrentCV, 'education')}
                />
            ) : (
                items.map((item) => (
                    <FormCard key={item.id}>
                        <ItemHeader
                            title={item.degree || t('editor.newEducation')}
                            onDelete={() =>
                                onRequestDelete('education', item.id, item.degree || t('editor.newEducation'))
                            }
                        />
                        <FormField
                            label={t('editor.fields.institution.label')}
                            placeholder={t('editor.fields.institution.placeholder')}
                            value={item.institution}
                            onChangeText={(text) => updateArrayItem(setCurrentCV, 'education', item.id, 'institution', text)}
                        />
                        <FormField
                            label={t('editor.fields.degree.label')}
                            placeholder={t('editor.fields.degree.placeholder')}
                            value={item.degree}
                            onChangeText={(text) => updateArrayItem(setCurrentCV, 'education', item.id, 'degree', text)}
                        />
                        <FormField
                            label={t('editor.fields.fieldOfStudy.label')}
                            placeholder={t('editor.fields.fieldOfStudy.placeholder')}
                            value={item.field || ''}
                            onChangeText={(text) => updateArrayItem(setCurrentCV, 'education', item.id, 'field', text)}
                        />
                        <View style={styles.dateRow}>
                            <MonthYearField
                                label={t('editor.fields.startDate.label')}
                                value={item.start_date}
                                onChange={(value) => updateArrayItem(setCurrentCV, 'education', item.id, 'start_date', value)}
                            />
                            <MonthYearField
                                label={t('editor.fields.endDate.label')}
                                value={item.end_date}
                                onChange={(value) => updateArrayItem(setCurrentCV, 'education', item.id, 'end_date', value)}
                            />
                        </View>
                    </FormCard>
                ))
            )}
        </View>
    );
}

// ── Step 5: Projects & Achievements ──────────────────────────────────────────

export function ExtrasStep({ currentCV, setCurrentCV, onRequestDelete }: StepProps) {
    const { t } = useTranslation('cv');
    const projects = currentCV.data_json?.projects || [];
    const achievements = currentCV.data_json?.achievements || [];

    return (
        <View>
            <StepIntro
                title={t('wizard.steps.extras.title')}
                description={t('wizard.steps.extras.description')}
                illustration={StepExtrasIllustration}
            />

            <ListHeader
                title={t('editor.sections.projects')}
                count={projects.length}
                addLabel={t('editor.add')}
                onAdd={() => addItem(setCurrentCV, 'projects')}
            />
            {projects.length === 0 ? (
                <EmptyStepHint
                    label={t('editor.empty.projects')}
                    icon={FolderOpen}
                    onAdd={() => addItem(setCurrentCV, 'projects')}
                />
            ) : (
                projects.map((item) => (
                    <FormCard key={item.id}>
                        <ItemHeader
                            title={item.name || t('editor.newProject')}
                            onDelete={() =>
                                onRequestDelete('projects', item.id, item.name || t('editor.newProject'))
                            }
                        />
                        <FormField
                            label={t('editor.fields.projectName.label')}
                            placeholder={t('editor.fields.projectName.placeholder')}
                            value={item.name}
                            onChangeText={(text) => updateArrayItem(setCurrentCV, 'projects', item.id, 'name', text)}
                        />
                        <FormField
                            label={t('editor.fields.description.label')}
                            placeholder={t('editor.fields.projectDescription.placeholder')}
                            value={item.description}
                            onChangeText={(text) => updateArrayItem(setCurrentCV, 'projects', item.id, 'description', text)}
                            multiline
                        />
                        <FormField
                            label={t('editor.fields.technologies.label')}
                            placeholder={t('editor.fields.technologies.placeholder')}
                            value={(item.technologies || []).join(', ')}
                            onChangeText={(text) =>
                                updateArrayItem(
                                    setCurrentCV, 'projects', item.id, 'technologies',
                                    text.split(',').map((value) => value.trim()).filter(Boolean),
                                )
                            }
                            containerStyle={styles.lastField}
                        />
                    </FormCard>
                ))
            )}

            <View style={styles.sectionSpacer} />

            <ListHeader
                title={t('editor.sections.achievements')}
                count={achievements.length}
                addLabel={t('editor.add')}
                onAdd={() => addItem(setCurrentCV, 'achievements')}
            />
            {achievements.length === 0 ? (
                <EmptyStepHint
                    label={t('editor.empty.achievements')}
                    icon={Trophy}
                    onAdd={() => addItem(setCurrentCV, 'achievements')}
                />
            ) : (
                achievements.map((item) => (
                    <FormCard key={item.id}>
                        <ItemHeader
                            title={item.title || t('editor.newAchievement')}
                            onDelete={() =>
                                onRequestDelete('achievements', item.id, item.title || t('editor.newAchievement'))
                            }
                        />
                        <FormField
                            label={t('editor.fields.achievementTitle.label')}
                            placeholder={t('editor.fields.achievementTitle.placeholder')}
                            value={item.title}
                            onChangeText={(text) => updateArrayItem(setCurrentCV, 'achievements', item.id, 'title', text)}
                        />
                        <FormField
                            label={t('editor.fields.issuer.label')}
                            placeholder={t('editor.fields.issuer.placeholder')}
                            value={item.issuer || ''}
                            onChangeText={(text) => updateArrayItem(setCurrentCV, 'achievements', item.id, 'issuer', text)}
                        />
                        <FormField
                            label={t('editor.fields.description.label')}
                            placeholder={t('editor.fields.achievementDescription.placeholder')}
                            value={item.description}
                            onChangeText={(text) => updateArrayItem(setCurrentCV, 'achievements', item.id, 'description', text)}
                            multiline
                            containerStyle={styles.lastField}
                        />
                    </FormCard>
                ))
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    lastField: {
        marginBottom: 0,
    },
    dateRow: {
        flexDirection: 'row',
        gap: 12,
    },
    sectionSpacer: {
        height: SPACE.section - SPACE.group,
    },
    aiBtn: {
        borderRadius: 14,
        marginTop: 16,
    },
    aiBtnInner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: 50,
    },
    aiBtnText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '700',
    },
    quietBtn: {
        marginTop: 10,
    },
    quietBtnInner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 6,
    },
    quietBtnText: {
        fontSize: 13,
        fontWeight: '600',
    },
});
