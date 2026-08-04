import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@clerk/clerk-expo';
import { AlertTriangle, Lock } from 'lucide-react-native';
import {
  archiveGroup,
  fetchGroup,
  fetchGroupForm,
  isCommunityApiError,
  saveGroupForm,
  updateGroup,
  type CommunityGroup,
  type CommunityGroupMember,
  type GroupJoinPolicy,
  type GroupVisibility,
} from '@edutu/core/src/services/communities';
import { ScreenHeader } from '../../../../components/ui/ScreenHeader';
import { AnimatedPressable } from '../../../../components/ui/AnimatedPressable';
import { Skeleton } from '../../../../components/ui/Skeleton';
import { useTheme } from '../../../../components/context/ThemeContext';
import {
  ChoiceRow,
  LabeledField,
  QuestionBuilder,
  draftsAreValid,
  toDrafts,
  toGroupQuestions,
  type DraftQuestion,
} from '../../../../components/community/QuestionBuilder';
import { haptics } from '../../../../lib/haptics';

/**
 * Group settings — a SCREEN, not a modal (DESIGN.md §5.2). It carries the
 * group's identity, both entry axes, the screening form, and the one
 * irreversible action in the feature, which is more than a sheet should hold.
 *
 * Validation mirrors `UpdateGroupSchema` / `GroupFormSchema`. `opportunityId`
 * is absent from the update schema on purpose: a group's opportunity is fixed
 * at creation, so it is rendered locked here rather than as an editable field
 * whose edits would be silently dropped.
 */

const NAME_MIN = 3;
const NAME_MAX = 60;
const DESCRIPTION_MAX = 280;

export default function GroupSettingsScreen() {
  const router = useRouter();
  const { getToken } = useAuth();
  const { t } = useTranslation(['community', 'common']);
  const { colors } = useTheme();

  const params = useLocalSearchParams<{ id?: string }>();
  const groupId = typeof params.id === 'string' ? params.id : '';

  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<CommunityGroup | null>(null);
  const [membership, setMembership] = useState<CommunityGroupMember | null>(null);
  const [questions, setQuestions] = useState<DraftQuestion[]>([]);

  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<GroupVisibility>('public');
  const [joinPolicy, setJoinPolicy] = useState<GroupJoinPolicy>('open');

  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const detail = await fetchGroup(groupId, getToken);
        if (cancelled) return;
        setGroup(detail.group);
        setMembership(detail.membership);
        setName(detail.group.name);
        setDescription(detail.group.description ?? '');
        setVisibility(detail.group.visibility);
        setJoinPolicy(detail.group.joinPolicy);

        // The form is a second call and a softer failure: settings must still
        // open if only the questions could not be read.
        try {
          const form = await fetchGroupForm(groupId, getToken);
          if (!cancelled) setQuestions(toDrafts(form.questions));
        } catch {
          if (!cancelled) setQuestions([]);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(isCommunityApiError(caught) ? caught.message : t('common:errors.generic'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [groupId, getToken, t]);

  const archived = !!group?.archivedAt;
  const isOwner = membership?.role === 'owner';
  const readOnly = archived || saving || archiving;

  const trimmedName = name.trim();
  const nameValid = trimmedName.length >= NAME_MIN && trimmedName.length <= NAME_MAX;
  const nameError = useMemo(
    () => (nameTouched && !nameValid ? t('community:create.nameTooShort') : null),
    [nameTouched, nameValid, t],
  );

  // Screening questions only exist to gate a request queue, so they are only
  // sent when there is one — and an invalid question blocks the whole save
  // rather than being quietly dropped.
  const formApplies = joinPolicy === 'request';
  const questionsValid = !formApplies || draftsAreValid(questions);
  const canSave = nameValid && questionsValid && !readOnly && !!group;

  const handleSave = useCallback(async () => {
    setNameTouched(true);
    if (!canSave || !group) return;
    setSaving(true);
    setError(null);
    try {
      await updateGroup(
        group.id,
        {
          name: trimmedName,
          description: description.trim(),
          visibility,
          joinPolicy,
        },
        getToken,
      );
      if (formApplies) {
        await saveGroupForm(group.id, toGroupQuestions(questions), getToken);
      }
      haptics.success();
      router.back();
    } catch (caught) {
      setError(isCommunityApiError(caught) ? caught.message : t('common:errors.generic'));
      haptics.error();
      setSaving(false);
    }
  }, [
    canSave,
    group,
    trimmedName,
    description,
    visibility,
    joinPolicy,
    formApplies,
    questions,
    getToken,
    router,
    t,
  ]);

  const handleArchive = useCallback(async () => {
    if (!group || archiving) return;
    setArchiving(true);
    setError(null);
    try {
      await archiveGroup(group.id, getToken);
      haptics.warning();
      router.back();
    } catch (caught) {
      setError(isCommunityApiError(caught) ? caught.message : t('common:errors.generic'));
      haptics.error();
      setArchiving(false);
      setConfirmingArchive(false);
    }
  }, [group, archiving, getToken, router, t]);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader title={t('community:screens.settingsTitle')} showBack />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          testID="group-settings-scroll"
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {!!error && (
            <View
              testID="group-settings-error"
              style={[
                styles.noticeBox,
                { backgroundColor: `${colors.error}12`, borderColor: colors.error },
              ]}
            >
              <Text style={[styles.noticeText, { color: colors.error }]} numberOfLines={6}>
                {error}
              </Text>
            </View>
          )}

          {loading ? (
            <View testID="group-settings-loading" style={styles.skeletons}>
              {[0, 1, 2].map((key) => (
                <Skeleton key={key} height={64} borderRadius={14} />
              ))}
            </View>
          ) : !group ? null : (
            <>
              {archived && (
                <View
                  testID="group-settings-archived"
                  style={[
                    styles.noticeBox,
                    { backgroundColor: colors.muted, borderColor: colors.border },
                  ]}
                >
                  <Text style={[styles.noticeText, { color: colors.textSecondary }]} numberOfLines={4}>
                    {t('community:groupState.archivedReadOnly')}
                  </Text>
                </View>
              )}

              <LabeledField
                label={t('community:create.nameLabel')}
                error={nameError}
                errorTestID="group-settings-name-error"
              >
                <TextInput
                  testID="group-settings-name"
                  value={name}
                  onChangeText={(value) => {
                    setName(value);
                    setNameTouched(true);
                  }}
                  onBlur={() => setNameTouched(true)}
                  editable={!readOnly}
                  maxLength={NAME_MAX}
                  placeholder={t('community:create.namePlaceholder')}
                  placeholderTextColor={colors.textSecondary}
                  style={[
                    styles.input,
                    {
                      color: colors.foreground,
                      borderColor: nameError ? colors.error : colors.border,
                      backgroundColor: colors.card,
                    },
                  ]}
                />
              </LabeledField>

              <LabeledField label={t('community:create.descriptionLabel')}>
                <TextInput
                  testID="group-settings-description"
                  value={description}
                  onChangeText={setDescription}
                  editable={!readOnly}
                  maxLength={DESCRIPTION_MAX}
                  multiline
                  placeholder={t('community:create.descriptionPlaceholder')}
                  placeholderTextColor={colors.textSecondary}
                  style={[
                    styles.input,
                    styles.multiline,
                    {
                      color: colors.foreground,
                      borderColor: colors.border,
                      backgroundColor: colors.card,
                    },
                  ]}
                />
              </LabeledField>

              {!!group.opportunityId && (
                <LabeledField
                  label={t('community:create.opportunityLabel')}
                  helper={t('community:create.opportunityLockedNote')}
                >
                  <View
                    testID="group-settings-opportunity-locked"
                    accessibilityRole="text"
                    accessibilityState={{ disabled: true }}
                    accessibilityLabel={`${t('community:create.opportunityLabel')}: ${group.opportunityId}`}
                    style={[
                      styles.lockedRow,
                      { borderColor: colors.border, backgroundColor: colors.muted },
                    ]}
                  >
                    <Lock size={14} color={colors.textSecondary} strokeWidth={2.5} />
                    <Text
                      style={[styles.lockedText, { color: colors.foreground }]}
                      numberOfLines={2}
                    >
                      {group.opportunityId}
                    </Text>
                  </View>
                </LabeledField>
              )}

              <LabeledField label={t('community:create.visibilityLabel')}>
                <View style={styles.choices}>
                  <ChoiceRow
                    testID="group-settings-visibility-public"
                    title={t('community:visibility.public')}
                    description={t('community:visibility.publicDesc')}
                    selected={visibility === 'public'}
                    disabled={readOnly}
                    onPress={() => setVisibility('public')}
                  />
                  <ChoiceRow
                    testID="group-settings-visibility-private"
                    title={t('community:visibility.private')}
                    description={t('community:visibility.privateDesc')}
                    selected={visibility === 'private'}
                    disabled={readOnly}
                    onPress={() => setVisibility('private')}
                  />
                </View>
              </LabeledField>

              <LabeledField label={t('community:create.joinPolicyLabel')}>
                <View style={styles.choices}>
                  <ChoiceRow
                    testID="group-settings-join-open"
                    title={t('community:joinPolicy.open')}
                    description={t('community:joinPolicy.openDesc')}
                    selected={joinPolicy === 'open'}
                    disabled={readOnly}
                    onPress={() => setJoinPolicy('open')}
                  />
                  <ChoiceRow
                    testID="group-settings-join-request"
                    title={t('community:joinPolicy.request')}
                    description={t('community:joinPolicy.requestDesc')}
                    selected={joinPolicy === 'request'}
                    disabled={readOnly}
                    onPress={() => setJoinPolicy('request')}
                  />
                </View>
              </LabeledField>

              {formApplies && (
                <QuestionBuilder questions={questions} onChange={setQuestions} disabled={readOnly} />
              )}

              <AnimatedPressable
                testID="group-settings-save"
                accessibilityRole="button"
                accessibilityLabel={t('community:actions.saveChanges')}
                accessibilityState={{ disabled: !canSave, busy: saving }}
                hapticFeedback="medium"
                scaleTo={0.98}
                disabled={!canSave}
                onPress={handleSave}
                style={[
                  styles.submit,
                  { backgroundColor: colors.accent, opacity: canSave ? 1 : 0.5 },
                ]}
              >
                <View style={styles.submitInner}>
                  {saving && (
                    <ActivityIndicator testID="group-settings-saving" size="small" color="#FFFFFF" />
                  )}
                  <Text style={styles.submitLabel} numberOfLines={1}>
                    {t('community:actions.saveChanges')}
                  </Text>
                </View>
              </AnimatedPressable>

              {/* Archiving is the only irreversible act in the feature, so it is
                  confirmed INLINE — a modal would make it feel like a routine
                  interruption, and the warning has to be read, not dismissed. */}
              {isOwner && !archived && (
                <View style={[styles.danger, { borderColor: colors.border }]}>
                  {confirmingArchive ? (
                    <>
                      <View style={styles.dangerHead}>
                        <AlertTriangle size={16} color={colors.error} strokeWidth={2.5} />
                        <Text
                          testID="group-settings-archive-warning"
                          style={[styles.noticeText, styles.dangerText, { color: colors.error }]}
                          numberOfLines={4}
                        >
                          {t('community:groupState.archiveWarning')}
                        </Text>
                      </View>
                      <View style={styles.dangerActions}>
                        <AnimatedPressable
                          testID="group-settings-archive-cancel"
                          accessibilityRole="button"
                          accessibilityLabel={t('common:actions.cancel')}
                          hapticFeedback="light"
                          scaleTo={0.98}
                          disabled={archiving}
                          onPress={() => setConfirmingArchive(false)}
                          style={[styles.dangerButton, { borderColor: colors.border }]}
                        >
                          <Text
                            style={[styles.dangerButtonLabel, { color: colors.foreground }]}
                            numberOfLines={1}
                          >
                            {t('common:actions.cancel')}
                          </Text>
                        </AnimatedPressable>
                        <AnimatedPressable
                          testID="group-settings-archive-confirm"
                          accessibilityRole="button"
                          accessibilityLabel={t('community:groupState.archiveConfirm')}
                          accessibilityState={{ busy: archiving, disabled: archiving }}
                          hapticFeedback="heavy"
                          scaleTo={0.98}
                          disabled={archiving}
                          onPress={handleArchive}
                          style={[
                            styles.dangerButton,
                            { borderColor: colors.error, opacity: archiving ? 0.5 : 1 },
                          ]}
                        >
                          <View style={styles.submitInner}>
                            {archiving && <ActivityIndicator size="small" color={colors.error} />}
                            <Text
                              style={[styles.dangerButtonLabel, { color: colors.error }]}
                              numberOfLines={1}
                            >
                              {t('community:groupState.archiveConfirm')}
                            </Text>
                          </View>
                        </AnimatedPressable>
                      </View>
                    </>
                  ) : (
                    <AnimatedPressable
                      testID="group-settings-archive"
                      accessibilityRole="button"
                      accessibilityLabel={t('community:actions.archive')}
                      hapticFeedback="medium"
                      scaleTo={0.98}
                      disabled={saving}
                      onPress={() => setConfirmingArchive(true)}
                      style={[styles.dangerButton, { borderColor: colors.error }]}
                    >
                      <Text
                        style={[styles.dangerButtonLabel, { color: colors.error }]}
                        numberOfLines={1}
                      >
                        {t('community:actions.archive')}
                      </Text>
                    </AnimatedPressable>
                  )}
                </View>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 48,
    gap: 18,
  },
  skeletons: {
    gap: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    borderCurve: 'continuous',
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
  },
  multiline: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  lockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    borderCurve: 'continuous',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  lockedText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  choices: {
    gap: 8,
  },
  submit: {
    borderRadius: 14,
    borderCurve: 'continuous',
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  noticeBox: {
    borderWidth: 1,
    borderRadius: 14,
    borderCurve: 'continuous',
    padding: 14,
  },
  noticeText: {
    fontSize: 13,
    lineHeight: 19,
  },
  danger: {
    borderTopWidth: 1,
    paddingTop: 18,
    gap: 12,
  },
  dangerHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  dangerText: {
    flex: 1,
  },
  dangerActions: {
    flexDirection: 'row',
    gap: 10,
  },
  dangerButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    borderCurve: 'continuous',
    paddingVertical: 12,
    alignItems: 'center',
  },
  dangerButtonLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
});
