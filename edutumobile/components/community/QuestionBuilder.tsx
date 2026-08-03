import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Check, Plus, X } from 'lucide-react-native';
import type { GroupQuestion } from '@edutu/core/src/services/communities';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { useTheme } from '../context/ThemeContext';

/**
 * The screening-question builder for a request-to-join group.
 *
 * It is a form BUILDER, not a form engine: three fixed answer types, five
 * questions, and every limit mirrored from `GroupQuestionSchema` in
 * `backend/.../communities/dto/community.dto.ts` so the client can never
 * assemble something the server will refuse.
 *
 * WHY DRAFTS ARE NOT `GroupQuestion`s
 * -----------------------------------
 * `GroupQuestion` is a discriminated union: `options` exists on `single_select`
 * and is rejected outright on the text types. That is exactly right for the
 * wire, and exactly wrong for an editor — a person who types three options,
 * switches to "Short text" to reconsider, and switches back would lose their
 * typing if the union were the editing state. So the editor holds a flat
 * `DraftQuestion` (options always present, ignored for text types) and
 * `toGroupQuestions` narrows on `type` at the boundary, dropping `options`
 * for text questions rather than sending a field the server rejects.
 */

/** All mirrored from the backend Zod schema — see the file header. */
export const MAX_QUESTIONS = 5;
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 6;
export const MAX_LABEL_CHARS = 60;
export const MAX_OPTION_CHARS = 40;
export const MAX_ID_CHARS = 40;

export type QuestionType = GroupQuestion['type'];

/** The editor's shape. See the header for why it is flat. */
export interface DraftQuestion {
  id: string;
  type: QuestionType;
  label: string;
  required: boolean;
  options: string[];
}

/**
 * A reason a draft cannot be saved. Codes, not sentences: the builder owns the
 * i18n lookup so callers (and tests) can reason about the rule, not the copy.
 */
export type QuestionIssue = 'labelRequired' | 'needsTwoOptions' | 'optionRequired';

export function issuesFor(draft: DraftQuestion): QuestionIssue[] {
  const issues: QuestionIssue[] = [];
  if (!draft.label.trim()) issues.push('labelRequired');
  if (draft.type === 'single_select') {
    const filled = draft.options.filter((option) => option.trim().length > 0);
    // "At least 2" is the rule that matters: a one-option dropdown is not a
    // choice, so the client refuses it before the server has to.
    if (filled.length < MIN_OPTIONS) issues.push('needsTwoOptions');
    else if (filled.length !== draft.options.length) issues.push('optionRequired');
  }
  return issues;
}

export function draftsAreValid(drafts: DraftQuestion[]): boolean {
  return drafts.length <= MAX_QUESTIONS && drafts.every((d) => issuesFor(d).length === 0);
}

/** Draft → wire. Narrows on `type`; text questions never carry `options`. */
export function toGroupQuestions(drafts: DraftQuestion[]): GroupQuestion[] {
  return drafts.map((draft) => {
    if (draft.type === 'single_select') {
      return {
        id: draft.id,
        type: 'single_select',
        label: draft.label.trim(),
        required: draft.required,
        options: draft.options.map((option) => option.trim()).filter(Boolean),
      };
    }
    return {
      id: draft.id,
      type: draft.type,
      label: draft.label.trim(),
      required: draft.required,
    };
  });
}

/** Wire → draft. A text question arrives without options; seed the editor's. */
export function toDrafts(questions: GroupQuestion[]): DraftQuestion[] {
  return questions.map((question) => ({
    id: question.id,
    type: question.type,
    label: question.label,
    required: question.required,
    options: question.type === 'single_select' ? [...question.options] : [],
  }));
}

/**
 * A fresh short-text question with an id unique within `existing`.
 * Ids stay short because the server caps them at 40 characters.
 */
export function makeDraft(existing: DraftQuestion[]): DraftQuestion {
  const taken = new Set(existing.map((draft) => draft.id));
  let n = existing.length + 1;
  let id = `q${n}`;
  while (taken.has(id)) {
    n += 1;
    id = `q${n}`;
  }
  return { id: id.slice(0, MAX_ID_CHARS), type: 'short_text', label: '', required: false, options: [] };
}

const TYPE_ORDER: QuestionType[] = ['short_text', 'long_text', 'single_select'];

const TYPE_LABEL_KEY: Record<QuestionType, string> = {
  short_text: 'community:questionBuilder.typeShortText',
  long_text: 'community:questionBuilder.typeLongAnswer',
  single_select: 'community:questionBuilder.typeSingleChoice',
};

const ISSUE_KEY: Record<QuestionIssue, string> = {
  labelRequired: 'community:questionBuilder.labelRequired',
  needsTwoOptions: 'community:questionBuilder.needsTwoOptions',
  optionRequired: 'community:questionBuilder.optionRequired',
};

// ---------------------------------------------------------------------------
// Shared field primitives
//
// The builder and both group forms (create + settings) speak the same field
// vocabulary, so it lives in one place rather than being restyled per screen —
// DESIGN.md §5.5 names that drift as a debt. Promote to `components/ui/` the
// moment a fourth consumer appears.
// ---------------------------------------------------------------------------

export function LabeledField({
  label,
  helper,
  error,
  errorTestID,
  children,
}: {
  label: string;
  helper?: string;
  error?: string | null;
  errorTestID?: string;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.foreground }]} numberOfLines={2}>
        {label}
      </Text>
      {children}
      {!!helper && !error && (
        <Text style={[styles.helper, { color: colors.textSecondary }]} numberOfLines={3}>
          {helper}
        </Text>
      )}
      {!!error && (
        <Text testID={errorTestID} style={[styles.helper, { color: colors.error }]} numberOfLines={3}>
          {error}
        </Text>
      )}
    </View>
  );
}

/**
 * One choice in a mutually exclusive set, with its own explanatory line.
 * Selection is carried by the accent only (DESIGN.md: Restrained) — a form is
 * neither an AI moment nor a celebration, so nothing here gets a saturated field.
 */
export function ChoiceRow({
  testID,
  title,
  description,
  selected,
  disabled,
  onPress,
}: {
  testID: string;
  title: string;
  description?: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <AnimatedPressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: !!disabled }}
      accessibilityLabel={title}
      hapticFeedback="selection"
      scaleTo={0.98}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.choice,
        {
          borderColor: selected ? colors.accent : colors.border,
          backgroundColor: colors.card,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <View style={styles.choiceInner}>
        <View style={styles.choiceText}>
          <Text
            style={[styles.choiceTitle, { color: selected ? colors.accent : colors.foreground }]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {!!description && (
            <Text style={[styles.choiceDesc, { color: colors.textSecondary }]} numberOfLines={2}>
              {description}
            </Text>
          )}
        </View>
        {selected && <Check size={16} color={colors.accent} strokeWidth={2.5} />}
      </View>
    </AnimatedPressable>
  );
}

// ---------------------------------------------------------------------------
// The builder
// ---------------------------------------------------------------------------

export interface QuestionBuilderProps {
  questions: DraftQuestion[];
  onChange: (next: DraftQuestion[]) => void;
  /** Saving, or the group is archived — everything goes read-only. */
  disabled?: boolean;
}

export function QuestionBuilder({ questions, onChange, disabled = false }: QuestionBuilderProps) {
  const { t } = useTranslation(['community', 'common']);
  const { colors } = useTheme();

  // Validation is live but not pre-emptive: a question you have not touched yet
  // does not shout at you. DESIGN.md asks for inline validation, not a wall of
  // errors — and an error under a field you have not reached is exactly that.
  const [touched, setTouched] = useState<string[]>([]);

  const atCap = questions.length >= MAX_QUESTIONS;

  const update = useCallback(
    (id: string, patch: Partial<DraftQuestion>) => {
      setTouched((prev) => (prev.includes(id) ? prev : [...prev, id]));
      onChange(questions.map((q) => (q.id === id ? { ...q, ...patch } : q)));
    },
    [questions, onChange],
  );

  const addQuestion = useCallback(() => {
    // Guarded as well as disabled: the cap is a rule, not a styling choice.
    if (atCap || disabled) return;
    onChange([...questions, makeDraft(questions)]);
  }, [atCap, disabled, questions, onChange]);

  const removeQuestion = useCallback(
    (id: string) => {
      setTouched((prev) => prev.filter((entry) => entry !== id));
      onChange(questions.filter((q) => q.id !== id));
    },
    [questions, onChange],
  );

  const setType = useCallback(
    (draft: DraftQuestion, type: QuestionType) => {
      // Switching to single choice seeds the two options the schema demands, so
      // the shape you are shown is the shape that can be saved.
      const options =
        type === 'single_select' && draft.options.length < MIN_OPTIONS
          ? [...draft.options, ...Array(MIN_OPTIONS - draft.options.length).fill('')]
          : draft.options;
      update(draft.id, { type, options });
    },
    [update],
  );

  const errorsById = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const draft of questions) {
      const issues = touched.includes(draft.id) ? issuesFor(draft) : [];
      map[draft.id] = issues.length ? t(ISSUE_KEY[issues[0]]) : null;
    }
    return map;
  }, [questions, touched, t]);

  return (
    <View style={styles.builder}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]} numberOfLines={2}>
        {t('community:questionBuilder.title')}
      </Text>
      <Text style={[styles.helper, { color: colors.textSecondary }]} numberOfLines={3}>
        {t('community:questionBuilder.helper')}
      </Text>

      {questions.map((draft) => (
        <View
          key={draft.id}
          testID={`question-card-${draft.id}`}
          style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}
        >
          <View style={styles.cardHead}>
            <Text style={[styles.cardTitle, { color: colors.textSecondary }]} numberOfLines={1}>
              {t('community:questionBuilder.questionLabel')}
            </Text>
            <AnimatedPressable
              testID={`question-remove-${draft.id}`}
              accessibilityRole="button"
              accessibilityLabel={t('community:questionBuilder.removeQuestion')}
              hapticFeedback="light"
              scaleTo={0.9}
              disabled={disabled}
              onPress={() => removeQuestion(draft.id)}
              style={styles.iconButton}
            >
              <X size={16} color={colors.textSecondary} strokeWidth={2.5} />
            </AnimatedPressable>
          </View>

          <TextInput
            testID={`question-label-${draft.id}`}
            value={draft.label}
            onChangeText={(label) => update(draft.id, { label })}
            editable={!disabled}
            maxLength={MAX_LABEL_CHARS}
            placeholder={t('community:questionBuilder.questionPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            style={[
              styles.input,
              {
                color: colors.foreground,
                borderColor: errorsById[draft.id] ? colors.error : colors.border,
                backgroundColor: colors.background,
              },
            ]}
          />

          <Text style={[styles.miniLabel, { color: colors.textSecondary }]} numberOfLines={1}>
            {t('community:questionBuilder.typeLabel')}
          </Text>
          <View style={styles.typeRow}>
            {TYPE_ORDER.map((type) => {
              const selected = draft.type === type;
              return (
                <AnimatedPressable
                  key={type}
                  testID={`question-type-${draft.id}-${type}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected, disabled }}
                  accessibilityLabel={t(TYPE_LABEL_KEY[type])}
                  hapticFeedback="selection"
                  scaleTo={0.97}
                  disabled={disabled}
                  onPress={() => setType(draft, type)}
                  style={[
                    styles.typePill,
                    {
                      borderColor: selected ? colors.accent : colors.border,
                      backgroundColor: colors.background,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.typeLabel,
                      { color: selected ? colors.accent : colors.textSecondary },
                    ]}
                    numberOfLines={1}
                  >
                    {t(TYPE_LABEL_KEY[type])}
                  </Text>
                </AnimatedPressable>
              );
            })}
          </View>

          {draft.type === 'single_select' && (
            <View style={styles.options}>
              <Text style={[styles.miniLabel, { color: colors.textSecondary }]} numberOfLines={1}>
                {t('community:questionBuilder.optionsLabel')}
              </Text>
              {draft.options.map((option, index) => (
                <View key={`${draft.id}-opt-${index}`} style={styles.optionRow}>
                  <TextInput
                    testID={`question-option-${draft.id}-${index}`}
                    value={option}
                    onChangeText={(value) =>
                      update(draft.id, {
                        options: draft.options.map((entry, i) => (i === index ? value : entry)),
                      })
                    }
                    editable={!disabled}
                    maxLength={MAX_OPTION_CHARS}
                    placeholder={t('community:questionBuilder.optionPlaceholder')}
                    placeholderTextColor={colors.textSecondary}
                    style={[
                      styles.input,
                      styles.optionInput,
                      {
                        color: colors.foreground,
                        borderColor: colors.border,
                        backgroundColor: colors.background,
                      },
                    ]}
                  />
                  <AnimatedPressable
                    testID={`question-option-remove-${draft.id}-${index}`}
                    accessibilityRole="button"
                    accessibilityLabel={t('community:questionBuilder.removeOption')}
                    hapticFeedback="light"
                    scaleTo={0.9}
                    disabled={disabled}
                    onPress={() =>
                      update(draft.id, {
                        options: draft.options.filter((_, i) => i !== index),
                      })
                    }
                    style={styles.iconButton}
                  >
                    <X size={14} color={colors.textSecondary} strokeWidth={2.5} />
                  </AnimatedPressable>
                </View>
              ))}
              {draft.options.length < MAX_OPTIONS && (
                <AnimatedPressable
                  testID={`question-option-add-${draft.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={t('community:questionBuilder.addOption')}
                  hapticFeedback="light"
                  scaleTo={0.98}
                  disabled={disabled}
                  onPress={() => update(draft.id, { options: [...draft.options, ''] })}
                  style={[styles.ghostButton, { borderColor: colors.border }]}
                >
                  <View style={styles.ghostInner}>
                    <Plus size={14} color={colors.accent} strokeWidth={2.5} />
                    <Text style={[styles.ghostLabel, { color: colors.accent }]} numberOfLines={1}>
                      {t('community:questionBuilder.addOption')}
                    </Text>
                  </View>
                </AnimatedPressable>
              )}
            </View>
          )}

          <AnimatedPressable
            testID={`question-required-${draft.id}`}
            accessibilityRole="switch"
            accessibilityState={{ checked: draft.required, disabled }}
            accessibilityLabel={t('community:questionBuilder.requiredLabel')}
            hapticFeedback="selection"
            scaleTo={0.98}
            disabled={disabled}
            onPress={() => update(draft.id, { required: !draft.required })}
            style={styles.requiredRow}
          >
            <View style={styles.ghostInner}>
              <View
                style={[
                  styles.checkbox,
                  {
                    borderColor: draft.required ? colors.accent : colors.border,
                    backgroundColor: draft.required ? colors.accent : 'transparent',
                  },
                ]}
              >
                {draft.required && <Check size={12} color="#FFFFFF" strokeWidth={3} />}
              </View>
              <Text style={[styles.ghostLabel, { color: colors.foreground }]} numberOfLines={1}>
                {t('community:questionBuilder.requiredLabel')}
              </Text>
            </View>
          </AnimatedPressable>

          {!!errorsById[draft.id] && (
            <Text
              testID={`question-error-${draft.id}`}
              style={[styles.helper, { color: colors.error }]}
              numberOfLines={3}
            >
              {errorsById[draft.id]}
            </Text>
          )}
        </View>
      ))}

      <AnimatedPressable
        testID="question-add"
        accessibilityRole="button"
        accessibilityLabel={t('community:questionBuilder.addQuestion')}
        accessibilityState={{ disabled: atCap || disabled }}
        accessibilityHint={atCap ? t('community:questionBuilder.limitReached') : undefined}
        hapticFeedback="medium"
        scaleTo={0.98}
        disabled={atCap || disabled}
        onPress={addQuestion}
        style={[
          styles.ghostButton,
          { borderColor: colors.border, opacity: atCap || disabled ? 0.5 : 1 },
        ]}
      >
        <View style={styles.ghostInner}>
          <Plus size={16} color={colors.accent} strokeWidth={2.5} />
          <Text style={[styles.ghostLabel, { color: colors.accent }]} numberOfLines={1}>
            {t('community:questionBuilder.addQuestion')}
          </Text>
        </View>
      </AnimatedPressable>

      {/* A disabled control that says nothing reads as a broken app rather than
          a limit, so the cap explains itself the moment it applies. */}
      {atCap && (
        <Text
          testID="question-limit-reason"
          style={[styles.helper, { color: colors.textSecondary }]}
          numberOfLines={2}
        >
          {t('community:questionBuilder.limitReached')}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  builder: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    borderCurve: 'continuous',
    padding: 14,
    gap: 10,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  miniLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  helper: {
    fontSize: 13,
    lineHeight: 19,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    borderCurve: 'continuous',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typePill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  typeLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  options: {
    gap: 8,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  optionInput: {
    flex: 1,
  },
  ghostButton: {
    borderWidth: 1,
    borderRadius: 12,
    borderCurve: 'continuous',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  ghostInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ghostLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  requiredRow: {
    paddingVertical: 4,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choice: {
    borderWidth: 1,
    borderRadius: 14,
    borderCurve: 'continuous',
  },
  choiceInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  choiceText: {
    flex: 1,
    gap: 2,
  },
  choiceTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  choiceDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
});
