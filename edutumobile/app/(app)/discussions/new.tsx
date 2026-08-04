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
import { Lock } from 'lucide-react-native';
import {
  createGroup,
  isCommunityApiError,
  type GroupJoinPolicy,
  type GroupVisibility,
} from '@edutu/core/src/services/communities';
import { getCachedOpportunity } from '@edutu/core/src/services/opportunities';
import { ScreenHeader } from '../../../components/ui/ScreenHeader';
import { AnimatedPressable } from '../../../components/ui/AnimatedPressable';
import { useTheme } from '../../../components/context/ThemeContext';
import { ChoiceRow, LabeledField } from '../../../components/community/QuestionBuilder';
import { haptics } from '../../../lib/haptics';

/**
 * Start a group — a SCREEN, not a modal.
 *
 * DESIGN.md §5.2 names "modal reflex" as a known debt: most of what we put in
 * sheets is content rather than interruption. Creating a group is a destination
 * with five decisions in it, so it gets a route, a back button, and the space
 * to explain what public/private and open/request actually mean.
 *
 * Every limit below mirrors `CreateGroupSchema` in the backend DTO. The client
 * must not be able to assemble a request the server will refuse: name 3–60,
 * description ≤280, emoji ≤8. `visibility` and `joinPolicy` are INDEPENDENT
 * axes — who can see it, and how a person who can see it gets in — so they are
 * two questions, never one four-way switch.
 */

/** Mirrors CreateGroupSchema. */
const NAME_MIN = 3;
const NAME_MAX = 60;
const DESCRIPTION_MAX = 280;

/**
 * A short palette instead of a free-text emoji field: the server caps the
 * column at 8 characters, and a keyboard that can type anything into a field
 * that accepts one grapheme is a validation error waiting to happen.
 */
const EMOJI_CHOICES = ['💬', '🎓', '🚀', '💼', '🌍', '📚', '🤝', '💡'];

export default function CreateGroupScreen() {
  const router = useRouter();
  const { getToken } = useAuth();
  const { t } = useTranslation(['community', 'common']);
  const { colors } = useTheme();

  // Arriving from an opportunity fixes that link. A group's opportunity is set
  // at creation and can never move (see UpdateGroupSchema, which omits it), so
  // the field is shown locked rather than as an editable value that silently
  // stops mattering.
  const params = useLocalSearchParams<{ opportunityId?: string; opportunityTitle?: string }>();
  const lockedOpportunityId = typeof params.opportunityId === 'string' ? params.opportunityId : null;

  const [opportunityTitle, setOpportunityTitle] = useState<string | null>(
    typeof params.opportunityTitle === 'string' ? params.opportunityTitle : null,
  );
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [coverEmoji, setCoverEmoji] = useState(EMOJI_CHOICES[0]);
  const [visibility, setVisibility] = useState<GroupVisibility>('public');
  const [joinPolicy, setJoinPolicy] = useState<GroupJoinPolicy>('open');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Cache-only lookup: the title is a courtesy label on a locked field, so it
    // must never block the form or cost a round trip.
    if (!lockedOpportunityId || opportunityTitle) return;
    let cancelled = false;
    void getCachedOpportunity(lockedOpportunityId)
      .then((opportunity) => {
        if (!cancelled && opportunity?.title) setOpportunityTitle(opportunity.title);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [lockedOpportunityId, opportunityTitle]);

  const trimmedName = name.trim();
  const nameValid = trimmedName.length >= NAME_MIN && trimmedName.length <= NAME_MAX;

  /** Live, but not pre-emptive: an untouched empty field is not an error yet. */
  const nameError = useMemo(
    () => (nameTouched && !nameValid ? t('community:create.nameTooShort') : null),
    [nameTouched, nameValid, t],
  );

  const canSubmit = nameValid && !submitting;

  const handleSubmit = useCallback(async () => {
    setNameTouched(true);
    if (!nameValid || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const group = await createGroup(
        {
          name: trimmedName,
          description: description.trim() || undefined,
          opportunityId: lockedOpportunityId ?? undefined,
          visibility,
          joinPolicy,
          coverEmoji,
        },
        getToken,
      );
      haptics.success();
      // `replace`, not `push`: the point of creating a group is to be in it, and
      // Back from a group you just made should not return to a spent form.
      router.replace(`/discussions/${group.id}` as never);
    } catch (caught) {
      // The 2-active-group cap and every other refusal arrive as a sentence the
      // server wrote for this person to read — including that the way out is
      // archiving, which cannot be undone. Showing a status code throws that
      // away; showing our own paraphrase risks promising a reversal.
      setError(isCommunityApiError(caught) ? caught.message : t('common:errors.generic'));
      haptics.error();
      setSubmitting(false);
    }
  }, [
    nameValid,
    submitting,
    trimmedName,
    description,
    lockedOpportunityId,
    visibility,
    joinPolicy,
    coverEmoji,
    getToken,
    router,
    t,
  ]);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader title={t('community:screens.createTitle')} showBack />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          testID="create-group-scroll"
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {!!error && (
            <View
              testID="create-group-error"
              style={[
                styles.errorBox,
                { backgroundColor: `${colors.error}12`, borderColor: colors.error },
              ]}
            >
              <Text style={[styles.errorText, { color: colors.error }]} numberOfLines={6}>
                {error}
              </Text>
            </View>
          )}

          <LabeledField
            label={t('community:create.nameLabel')}
            error={nameError}
            errorTestID="create-group-name-error"
          >
            <TextInput
              testID="create-group-name"
              value={name}
              onChangeText={(value) => {
                setName(value);
                setNameTouched(true);
              }}
              onBlur={() => setNameTouched(true)}
              editable={!submitting}
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
              testID="create-group-description"
              value={description}
              onChangeText={setDescription}
              editable={!submitting}
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

          {!!lockedOpportunityId && (
            <LabeledField
              label={t('community:create.opportunityLabel')}
              helper={t('community:create.opportunityLockedNote')}
            >
              <View
                testID="create-group-opportunity-locked"
                accessibilityRole="text"
                accessibilityState={{ disabled: true }}
                accessibilityLabel={`${t('community:create.opportunityLabel')}: ${
                  opportunityTitle ?? lockedOpportunityId
                }`}
                style={[
                  styles.lockedRow,
                  { borderColor: colors.border, backgroundColor: colors.muted },
                ]}
              >
                <Lock size={14} color={colors.textSecondary} strokeWidth={2.5} />
                <Text
                  testID="create-group-opportunity-title"
                  style={[styles.lockedText, { color: colors.foreground }]}
                  numberOfLines={2}
                >
                  {opportunityTitle ?? lockedOpportunityId}
                </Text>
              </View>
            </LabeledField>
          )}

          <LabeledField
            label={t('community:create.emojiLabel')}
            helper={t('community:create.emojiHelper')}
          >
            <View style={styles.emojiRow}>
              {EMOJI_CHOICES.map((emoji) => {
                const selected = emoji === coverEmoji;
                return (
                  <AnimatedPressable
                    key={emoji}
                    testID={`create-group-emoji-${emoji}`}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${t('community:create.emojiLabel')} ${emoji}`}
                    hapticFeedback="selection"
                    scaleTo={0.94}
                    disabled={submitting}
                    onPress={() => setCoverEmoji(emoji)}
                    style={[
                      styles.emojiChip,
                      {
                        borderColor: selected ? colors.accent : colors.border,
                        backgroundColor: colors.card,
                      },
                    ]}
                  >
                    <Text style={styles.emoji}>{emoji}</Text>
                  </AnimatedPressable>
                );
              })}
            </View>
          </LabeledField>

          <LabeledField label={t('community:create.visibilityLabel')}>
            <View style={styles.choices}>
              <ChoiceRow
                testID="create-group-visibility-public"
                title={t('community:visibility.public')}
                description={t('community:visibility.publicDesc')}
                selected={visibility === 'public'}
                disabled={submitting}
                onPress={() => setVisibility('public')}
              />
              <ChoiceRow
                testID="create-group-visibility-private"
                title={t('community:visibility.private')}
                description={t('community:visibility.privateDesc')}
                selected={visibility === 'private'}
                disabled={submitting}
                onPress={() => setVisibility('private')}
              />
            </View>
          </LabeledField>

          <LabeledField label={t('community:create.joinPolicyLabel')}>
            <View style={styles.choices}>
              <ChoiceRow
                testID="create-group-join-open"
                title={t('community:joinPolicy.open')}
                description={t('community:joinPolicy.openDesc')}
                selected={joinPolicy === 'open'}
                disabled={submitting}
                onPress={() => setJoinPolicy('open')}
              />
              <ChoiceRow
                testID="create-group-join-request"
                title={t('community:joinPolicy.request')}
                description={t('community:joinPolicy.requestDesc')}
                selected={joinPolicy === 'request'}
                disabled={submitting}
                onPress={() => setJoinPolicy('request')}
              />
            </View>
          </LabeledField>

          <AnimatedPressable
            testID="create-group-submit"
            accessibilityRole="button"
            accessibilityLabel={t('community:actions.createGroup')}
            accessibilityState={{ disabled: !canSubmit, busy: submitting }}
            hapticFeedback="medium"
            scaleTo={0.98}
            disabled={!canSubmit}
            onPress={handleSubmit}
            style={[
              styles.submit,
              { backgroundColor: colors.accent, opacity: canSubmit ? 1 : 0.5 },
            ]}
          >
            <View style={styles.submitInner}>
              {submitting && (
                <ActivityIndicator testID="create-group-submitting" size="small" color="#FFFFFF" />
              )}
              <Text style={styles.submitLabel} numberOfLines={1}>
                {t('community:actions.createGroup')}
              </Text>
            </View>
          </AnimatedPressable>
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
  emojiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  emojiChip: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderCurve: 'continuous',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 20,
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
  errorBox: {
    borderWidth: 1,
    borderRadius: 14,
    borderCurve: 'continuous',
    padding: 14,
  },
  errorText: {
    fontSize: 13,
    lineHeight: 19,
  },
});
