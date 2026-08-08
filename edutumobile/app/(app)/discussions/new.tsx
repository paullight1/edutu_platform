import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth, useUser } from '@clerk/clerk-expo';
import {
  BriefcaseBusiness,
  Check,
  Link2,
  Lock,
  Plus,
  Search,
  X,
} from 'lucide-react-native';
import {
  createGroup,
  createGroupCoverImageUpload,
  isCommunityApiError,
  updateGroup,
  type GroupJoinPolicy,
  type GroupVisibility,
} from '@edutu/core/src/services/communities';
import {
  fetchOpportunities,
  getCachedOpportunitiesSnapshot,
  getCachedOpportunity,
} from '@edutu/core/src/services/opportunities';
import type { Opportunity } from '@edutu/core/src/types/opportunity';
import { supabase } from '../../../lib/supabase';
import { ScreenHeader } from '../../../components/ui/ScreenHeader';
import { AnimatedPressable } from '../../../components/ui/AnimatedPressable';
import { useTheme } from '../../../components/context/ThemeContext';
import {
  ChoiceRow,
  LabeledField,
} from '../../../components/community/QuestionBuilder';
import { haptics } from '../../../lib/haptics';
import { uploadPrivateCommunityAsset } from '@edutu/core/src/services/storage';
import {
  GroupImagePicker,
  type PickedGroupImage,
} from '../../../components/community/GroupImagePicker';

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
  const { user } = useUser();
  const userId = user?.id;
  const { t } = useTranslation(['community', 'common']);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const opportunityAbortRef = useRef<AbortController | null>(null);

  // Arriving from an opportunity fixes that link. A group's opportunity is set
  // at creation and can never move (see UpdateGroupSchema, which omits it), so
  // the field is shown locked rather than as an editable value that silently
  // stops mattering.
  const params = useLocalSearchParams<{
    opportunityId?: string;
    opportunityTitle?: string;
  }>();
  const lockedOpportunityId =
    typeof params.opportunityId === 'string' ? params.opportunityId : null;

  const [opportunityTitle, setOpportunityTitle] = useState<string | null>(
    typeof params.opportunityTitle === 'string'
      ? params.opportunityTitle
      : null,
  );
  const [selectedOpportunity, setSelectedOpportunity] =
    useState<Opportunity | null>(null);
  const [opportunityOptions, setOpportunityOptions] = useState<Opportunity[]>(
    [],
  );
  const [opportunityQuery, setOpportunityQuery] = useState('');
  const [opportunityPickerOpen, setOpportunityPickerOpen] = useState(false);
  const [opportunityLoading, setOpportunityLoading] = useState(false);
  const [opportunityError, setOpportunityError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [coverEmoji, setCoverEmoji] = useState(EMOJI_CHOICES[0]);
  const [coverImage, setCoverImage] = useState<PickedGroupImage | null>(null);
  const [coverImageError, setCoverImageError] = useState<string | null>(null);
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
        if (!cancelled && opportunity?.title)
          setOpportunityTitle(opportunity.title);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [lockedOpportunityId, opportunityTitle]);

  useEffect(
    () => () => {
      opportunityAbortRef.current?.abort();
    },
    [],
  );

  const loadOpportunityOptions = useCallback(async () => {
    if (lockedOpportunityId || opportunityLoading) return;

    setOpportunityPickerOpen(true);
    setOpportunityError(null);
    setOpportunityLoading(true);
    opportunityAbortRef.current?.abort();
    const controller = new AbortController();
    opportunityAbortRef.current = controller;

    try {
      const cached = await getCachedOpportunitiesSnapshot(userId);
      if (controller.signal.aborted) return;
      if (cached.length > 0) setOpportunityOptions(cached);

      // The existing service revalidates through Edutu's authenticated
      // opportunity feed. The picker only filters those returned records; it
      // never invents a title/id pair from free text.
      if (userId) {
        const fresh = await fetchOpportunities({
          supabase,
          userId,
          getAuthToken: getToken,
          signal: controller.signal,
        });
        if (!controller.signal.aborted) setOpportunityOptions(fresh);
      }
    } catch (caught) {
      if (!controller.signal.aborted && opportunityOptions.length === 0) {
        setOpportunityError(
          caught instanceof Error ? caught.message : t('common:errors.generic'),
        );
      }
    } finally {
      if (!controller.signal.aborted) setOpportunityLoading(false);
    }
  }, [
    getToken,
    lockedOpportunityId,
    opportunityLoading,
    opportunityOptions.length,
    t,
    userId,
  ]);

  const matchingOpportunities = useMemo(() => {
    const query = opportunityQuery.trim().toLocaleLowerCase();
    const unique = new Map<string, Opportunity>();
    for (const opportunity of opportunityOptions) {
      if (!opportunity?.id || !opportunity.title) continue;
      unique.set(opportunity.id, opportunity);
    }
    return Array.from(unique.values())
      .filter((opportunity) => {
        if (!query) return true;
        return `${opportunity.title} ${opportunity.organization}`
          .toLocaleLowerCase()
          .includes(query);
      })
      .slice(0, 6);
  }, [opportunityOptions, opportunityQuery]);

  const selectedOpportunityId =
    lockedOpportunityId ?? selectedOpportunity?.id ?? null;

  const trimmedName = name.trim();
  const nameValid =
    trimmedName.length >= NAME_MIN && trimmedName.length <= NAME_MAX;

  /** Live, but not pre-emptive: an untouched empty field is not an error yet. */
  const nameError = useMemo(
    () =>
      nameTouched && !nameValid ? t('community:create.nameTooShort') : null,
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
          opportunityId: selectedOpportunityId ?? undefined,
          visibility,
          joinPolicy,
          coverEmoji,
        },
        getToken,
      );
      if (coverImage) {
        try {
          const reservation = await createGroupCoverImageUpload(
            group.id,
            {
              kind: 'image',
              name: coverImage.name,
              mime: coverImage.mime,
              size: coverImage.size,
            },
            getToken,
          );
          await uploadPrivateCommunityAsset(reservation.uploadUrl, {
            uri: coverImage.uri,
            type: coverImage.mime,
          });
          await updateGroup(
            group.id,
            { coverImageResourceUrl: reservation.resourceUrl },
            getToken,
          );
        } catch {
          haptics.error();
          router.replace(`/discussions/${group.id}/settings?photoError=1` as never);
          return;
        }
      }
      haptics.success();
      // `replace`, not `push`: the point of creating a group is to be in it, and
      // Back from a group you just made should not return to a spent form.
      router.replace(`/discussions/${group.id}` as never);
    } catch (caught) {
      // The 2-active-group cap and every other refusal arrive as a sentence the
      // server wrote for this person to read — including that the way out is
      // archiving, which cannot be undone. Showing a status code throws that
      // away; showing our own paraphrase risks promising a reversal.
      setError(
        isCommunityApiError(caught)
          ? caught.message
          : t('common:errors.generic'),
      );
      haptics.error();
      setSubmitting(false);
    }
  }, [
    nameValid,
    submitting,
    trimmedName,
    description,
    selectedOpportunityId,
    visibility,
    joinPolicy,
    coverEmoji,
    coverImage,
    getToken,
    router,
    t,
  ]);

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <ScreenHeader title={t('community:screens.createTitle')} showBack />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          testID="create-group-scroll"
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {!!error && (
            <View
              testID="create-group-error"
              style={[
                styles.errorBox,
                {
                  backgroundColor: `${colors.error}12`,
                  borderColor: colors.error,
                },
              ]}
            >
              <Text
                style={[styles.errorText, { color: colors.error }]}
                numberOfLines={6}
              >
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
                <Lock
                  size={14}
                  color={colors.textSecondary}
                  strokeWidth={2.5}
                />
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

          {!lockedOpportunityId && (
            <LabeledField
              label={t('community:create.opportunityLabel')}
              helper={t('community:create.opportunityHelper')}
            >
              {!!selectedOpportunity ? (
                <View
                  testID="create-group-opportunity-selected"
                  style={[
                    styles.selectedOpportunity,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.accent,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.contextIcon,
                      { backgroundColor: `${colors.accent}16` },
                    ]}
                  >
                    <BriefcaseBusiness
                      size={18}
                      color={colors.accent}
                      strokeWidth={2.2}
                    />
                  </View>
                  <View style={styles.opportunityCopy}>
                    <Text
                      style={[
                        styles.opportunityTitle,
                        { color: colors.foreground },
                      ]}
                      numberOfLines={2}
                    >
                      {selectedOpportunity.title}
                    </Text>
                    <Text
                      style={[
                        styles.opportunityMeta,
                        { color: colors.textSecondary },
                      ]}
                      numberOfLines={1}
                    >
                      {selectedOpportunity.organization}
                    </Text>
                  </View>
                  <AnimatedPressable
                    testID="create-group-opportunity-clear"
                    accessibilityRole="button"
                    accessibilityLabel="Remove linked opportunity"
                    hapticFeedback="light"
                    scaleTo={0.92}
                    disabled={submitting}
                    onPress={() => {
                      setSelectedOpportunity(null);
                      setOpportunityQuery('');
                    }}
                    style={[
                      styles.iconButton,
                      { backgroundColor: colors.muted },
                    ]}
                  >
                    <X size={17} color={colors.textSecondary} />
                  </AnimatedPressable>
                </View>
              ) : (
                <AnimatedPressable
                  testID="create-group-opportunity-toggle"
                  accessibilityRole="button"
                  accessibilityLabel="Link an existing opportunity"
                  accessibilityState={{ expanded: opportunityPickerOpen }}
                  hapticFeedback="light"
                  scaleTo={0.98}
                  disabled={submitting}
                  onPress={() => {
                    if (opportunityPickerOpen) {
                      opportunityAbortRef.current?.abort();
                      setOpportunityPickerOpen(false);
                      setOpportunityLoading(false);
                    } else {
                      void loadOpportunityOptions();
                    }
                  }}
                  style={[
                    styles.linkOpportunityButton,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.contextIcon,
                      { backgroundColor: colors.muted },
                    ]}
                  >
                    <Link2 size={18} color={colors.accent} strokeWidth={2.2} />
                  </View>
                  <View style={styles.opportunityCopy}>
                    <Text
                      style={[
                        styles.linkOpportunityTitle,
                        { color: colors.foreground },
                      ]}
                    >
                      Link an opportunity
                    </Text>
                    <Text
                      style={[
                        styles.opportunityMeta,
                        { color: colors.textSecondary },
                      ]}
                      numberOfLines={2}
                    >
                      Optional · helps applicants find the right group
                    </Text>
                  </View>
                  {opportunityPickerOpen ? (
                    <X size={18} color={colors.textSecondary} />
                  ) : (
                    <Plus size={18} color={colors.accent} />
                  )}
                </AnimatedPressable>
              )}

              {opportunityPickerOpen && !selectedOpportunity && (
                <View
                  testID="create-group-opportunity-picker"
                  style={[
                    styles.opportunityPicker,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.searchBox,
                      {
                        backgroundColor: colors.muted,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Search size={17} color={colors.textSecondary} />
                    <TextInput
                      testID="create-group-opportunity-input"
                      value={opportunityQuery}
                      onChangeText={setOpportunityQuery}
                      editable={!submitting}
                      autoCorrect={false}
                      placeholder="Search opportunities"
                      placeholderTextColor={colors.textSecondary}
                      style={[styles.searchInput, { color: colors.foreground }]}
                    />
                  </View>

                  {opportunityLoading && opportunityOptions.length === 0 ? (
                    <View
                      testID="create-group-opportunity-loading"
                      style={styles.opportunityStatus}
                    >
                      <ActivityIndicator size="small" color={colors.accent} />
                      <Text
                        style={[
                          styles.opportunityStatusText,
                          { color: colors.textSecondary },
                        ]}
                      >
                        Loading opportunities…
                      </Text>
                    </View>
                  ) : !!opportunityError ? (
                    <View style={styles.opportunityStatus}>
                      <Text
                        style={[
                          styles.opportunityStatusText,
                          { color: colors.error },
                        ]}
                      >
                        {opportunityError}
                      </Text>
                      <AnimatedPressable
                        accessibilityRole="button"
                        accessibilityLabel={t('common:actions.retry')}
                        onPress={() => void loadOpportunityOptions()}
                        style={[
                          styles.retryLink,
                          { borderColor: colors.error },
                        ]}
                      >
                        <Text
                          style={[
                            styles.retryLinkText,
                            { color: colors.error },
                          ]}
                        >
                          {t('common:actions.retry')}
                        </Text>
                      </AnimatedPressable>
                    </View>
                  ) : matchingOpportunities.length > 0 ? (
                    <View style={styles.opportunityResults}>
                      {matchingOpportunities.map((opportunity, index) => (
                        <AnimatedPressable
                          key={opportunity.id}
                          testID={`create-group-opportunity-${opportunity.id}`}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: false }}
                          accessibilityLabel={`${opportunity.title}, ${opportunity.organization}`}
                          hapticFeedback="selection"
                          scaleTo={0.99}
                          onPress={() => {
                            opportunityAbortRef.current?.abort();
                            setOpportunityLoading(false);
                            setSelectedOpportunity(opportunity);
                            setOpportunityPickerOpen(false);
                            setOpportunityQuery('');
                          }}
                          style={[
                            styles.opportunityResult,
                            index < matchingOpportunities.length - 1 && {
                              borderBottomColor: colors.border,
                              borderBottomWidth: StyleSheet.hairlineWidth,
                            },
                          ]}
                        >
                          <BriefcaseBusiness
                            size={17}
                            color={colors.accent}
                            strokeWidth={2.1}
                          />
                          <View style={styles.opportunityCopy}>
                            <Text
                              style={[
                                styles.opportunityTitle,
                                { color: colors.foreground },
                              ]}
                              numberOfLines={2}
                            >
                              {opportunity.title}
                            </Text>
                            <Text
                              style={[
                                styles.opportunityMeta,
                                { color: colors.textSecondary },
                              ]}
                              numberOfLines={1}
                            >
                              {opportunity.organization}
                            </Text>
                          </View>
                          <Check size={16} color={colors.border} />
                        </AnimatedPressable>
                      ))}
                    </View>
                  ) : (
                    <Text
                      style={[
                        styles.noOpportunityResults,
                        { color: colors.textSecondary },
                      ]}
                    >
                      No matching opportunities found.
                    </Text>
                  )}
                </View>
              )}
            </LabeledField>
          )}

          <LabeledField label="Group identity" error={coverImageError ?? undefined}>
            <GroupImagePicker
              testID="create-group-photo"
              emoji={coverEmoji}
              selected={coverImage}
              disabled={submitting}
              onChange={(image) => {
                setCoverImage(image);
                setCoverImageError(null);
              }}
              onError={setCoverImageError}
            />
          </LabeledField>

          <LabeledField
            label={t('community:create.emojiLabel')}
            helper={t('community:create.emojiHelper')}
          >
            <View
              style={[
                styles.iconPreview,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View
                style={[
                  styles.iconPreviewGlyph,
                  { backgroundColor: `${colors.accent}14` },
                ]}
              >
                <Text style={styles.iconPreviewEmoji}>{coverEmoji}</Text>
              </View>
              <View style={styles.opportunityCopy}>
                <Text
                  style={[
                    styles.iconPreviewTitle,
                    { color: colors.foreground },
                  ]}
                >
                  Group icon
                </Text>
                <Text
                  style={[
                    styles.opportunityMeta,
                    { color: colors.textSecondary },
                  ]}
                >
                  Shown in discovery and chat
                </Text>
              </View>
            </View>
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
                        backgroundColor: selected
                          ? `${colors.accent}14`
                          : colors.card,
                      },
                    ]}
                  >
                    <Text style={styles.emoji}>{emoji}</Text>
                    {selected && (
                      <View
                        style={[
                          styles.emojiCheck,
                          { backgroundColor: colors.accent },
                        ]}
                      >
                        <Check size={9} color="#FFFFFF" strokeWidth={3} />
                      </View>
                    )}
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
        </ScrollView>
        <View
          style={[
            styles.actionDock,
            {
              backgroundColor: colors.background,
              borderTopColor: colors.border,
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
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
              {
                backgroundColor: canSubmit ? colors.accent : `${colors.accent}55`,
                borderColor: canSubmit ? `${colors.accent}CC` : `${colors.accent}30`,
              },
            ]}
          >
            <View style={styles.submitInner}>
              {submitting && (
                <ActivityIndicator
                  testID="create-group-submitting"
                  size="small"
                  color="#FFFFFF"
                />
              )}
              {!submitting && (
                <Check size={19} color="#FFFFFF" strokeWidth={2.7} />
              )}
              <Text style={styles.submitLabel} numberOfLines={1}>
                {t('community:actions.createGroup')}
              </Text>
            </View>
          </AnimatedPressable>
        </View>
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
    paddingBottom: 32,
    gap: 18,
  },
  actionDock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingTop: 14,
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: -5 },
    elevation: 12,
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
  selectedOpportunity: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderWidth: 1,
    borderRadius: 14,
    borderCurve: 'continuous',
    padding: 12,
  },
  linkOpportunityButton: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderWidth: 1,
    borderRadius: 14,
    borderCurve: 'continuous',
    padding: 12,
  },
  contextIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  opportunityCopy: {
    flex: 1,
    gap: 3,
  },
  opportunityTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
  },
  linkOpportunityTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  opportunityMeta: {
    fontSize: 12,
    lineHeight: 17,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  opportunityPicker: {
    borderWidth: 1,
    borderRadius: 14,
    borderCurve: 'continuous',
    padding: 10,
    gap: 8,
  },
  searchBox: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 11,
    paddingHorizontal: 11,
  },
  searchInput: {
    flex: 1,
    minHeight: 42,
    fontSize: 14,
  },
  opportunityResults: {
    overflow: 'hidden',
  },
  opportunityResult: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8,
    paddingVertical: 9,
  },
  opportunityStatus: {
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 10,
  },
  opportunityStatusText: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  retryLink: {
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  retryLinkText: {
    fontSize: 12,
    fontWeight: '700',
  },
  noOpportunityResults: {
    paddingHorizontal: 8,
    paddingVertical: 16,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  iconPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderWidth: 1,
    borderRadius: 14,
    borderCurve: 'continuous',
    padding: 12,
  },
  iconPreviewGlyph: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPreviewEmoji: {
    fontSize: 26,
  },
  iconPreviewTitle: {
    fontSize: 14,
    fontWeight: '700',
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
    position: 'relative',
  },
  emoji: {
    fontSize: 20,
  },
  emojiCheck: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choices: {
    gap: 8,
  },
  submit: {
    minHeight: 56,
    borderRadius: 17,
    borderCurve: 'continuous',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.1,
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
