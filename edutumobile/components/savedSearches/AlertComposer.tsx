import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Check, Search, X } from 'lucide-react-native';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { useTheme } from '../context/ThemeContext';
import { DISCOVERY_CATEGORY_CATALOG } from '../../lib/discoveryCategories';
import type {
  SavedSearch,
  SavedSearchCriteria,
} from '@edutu/core/src/services/savedSearches';

// Backend limits (dto/saved-search.dto.ts). Enforced here too so a user never
// types past the point where the server would silently 400 into a null.
const NAME_MAX = 80;
const QUERY_MAX = 200;

/**
 * The name the server stores when the user doesn't type one. Mirrors the
 * label Discover's "Save this search" builds, so an alert created from either
 * surface reads the same in the list.
 */
export function deriveAlertName(query: string, categoryLabel?: string | null): string {
  const parts = [query.trim() ? `“${query.trim()}”` : null, categoryLabel || null].filter(Boolean);
  return parts.join(' · ').slice(0, NAME_MAX);
}

export interface AlertComposerProps {
  mode: 'create' | 'edit';
  /** Prefills the form (edit) and carries through criteria this form can't set. */
  initial?: SavedSearch | null;
  saving?: boolean;
  /** Omitted in the empty state, where the form is the screen and can't be dismissed. */
  onCancel?: () => void;
  onSubmit: (criteria: SavedSearchCriteria) => void;
}

/**
 * Inline create/edit form for a saved search. Inline, not a modal: this is
 * content, not an interruption (DESIGN.md §5.2), and in the empty state it is
 * the only thing worth showing.
 */
export function AlertComposer({
  mode,
  initial,
  saving = false,
  onCancel,
  onSubmit,
}: AlertComposerProps) {
  const { t } = useTranslation('opps');
  const { colors, isDark } = useTheme();
  const textSecondary = isDark ? '#94A3B8' : '#64748B';

  const [name, setName] = useState(initial?.name ?? '');
  const [query, setQuery] = useState(initial?.query ?? '');
  const [category, setCategory] = useState<string | null>(initial?.category ?? null);
  const [remoteOnly, setRemoteOnly] = useState(Boolean(initial?.remoteOnly));

  const categories = useMemo(
    () =>
      DISCOVERY_CATEGORY_CATALOG.map((entry) => ({
        id: entry.id,
        label: t(entry.oppsLabelKey, { defaultValue: entry.fallbackTitle }),
      })),
    [t],
  );

  const categoryLabel = categories.find((entry) => entry.id === category)?.label ?? null;
  const derivedName = deriveAlertName(query, categoryLabel);
  const canSubmit = Boolean(query.trim() || category || remoteOnly);

  const handleSubmit = useCallback(() => {
    if (!canSubmit || saving) return;
    onSubmit({
      name: (name.trim() || derivedName || t('alerts.composer.untitled')).slice(0, NAME_MAX),
      query: query.trim() || undefined,
      category: category || undefined,
      remoteOnly,
      // Criteria this form doesn't expose must survive an edit untouched.
      fundingType: initial?.fundingType || undefined,
      targetRegion: initial?.targetRegion || undefined,
    });
  }, [canSubmit, saving, onSubmit, name, derivedName, t, query, category, remoteOnly, initial]);

  return (
    <View
      style={[styles.shell, { backgroundColor: colors.card, borderColor: colors.border }]}
      testID="alert-composer"
    >
      <Text style={[styles.heading, { color: colors.foreground }]}>
        {mode === 'edit' ? t('alerts.composer.editTitle') : t('alerts.composer.createTitle')}
      </Text>

      <Text style={[styles.label, { color: textSecondary }]}>
        {t('alerts.composer.keywordLabel')}
      </Text>
      <View style={[styles.field, { borderColor: colors.border }]}>
        <Search size={16} color={textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('alerts.composer.keywordPlaceholder')}
          placeholderTextColor={textSecondary}
          maxLength={QUERY_MAX}
          autoCapitalize="none"
          style={[styles.input, { color: colors.foreground }]}
          testID="alert-composer-query"
        />
      </View>

      <Text style={[styles.label, { color: textSecondary }]}>
        {t('alerts.composer.categoryLabel')}
      </Text>
      <View style={styles.chipRow}>
        {categories.map((entry) => {
          const selected = entry.id === category;
          return (
            <AnimatedPressable
              key={entry.id}
              hapticFeedback="selection"
              onPress={() => setCategory(selected ? null : entry.id)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={[
                styles.chip,
                {
                  backgroundColor: selected ? colors.accent : 'transparent',
                  borderColor: selected ? colors.accent : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: selected ? '#FFFFFF' : colors.foreground },
                ]}
              >
                {entry.label}
              </Text>
            </AnimatedPressable>
          );
        })}
      </View>

      <View style={[styles.switchRow, { borderTopColor: colors.border }]}>
        <Text style={[styles.switchLabel, { color: colors.foreground }]}>
          {t('alerts.composer.remoteLabel')}
        </Text>
        <Switch
          value={remoteOnly}
          onValueChange={setRemoteOnly}
          trackColor={{ false: colors.border, true: `${colors.accent}80` }}
          thumbColor={remoteOnly ? colors.accent : '#f4f3f4'}
          accessibilityLabel={t('alerts.composer.remoteLabel')}
        />
      </View>

      <Text style={[styles.label, { color: textSecondary }]}>
        {t('alerts.composer.nameLabel')}
      </Text>
      <View style={[styles.field, { borderColor: colors.border }]}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={derivedName || t('alerts.composer.namePlaceholder')}
          placeholderTextColor={textSecondary}
          maxLength={NAME_MAX}
          style={[styles.input, { color: colors.foreground }]}
          testID="alert-composer-name"
        />
      </View>

      {!canSubmit ? (
        <Text style={[styles.hint, { color: textSecondary }]}>
          {t('alerts.composer.needCriterion')}
        </Text>
      ) : null}

      <View style={styles.actions}>
        {onCancel ? (
          <AnimatedPressable
            onPress={onCancel}
            accessibilityRole="button"
            style={[styles.secondaryBtn, { borderColor: colors.border }]}
          >
            <X size={15} color={textSecondary} />
            <Text style={[styles.secondaryBtnText, { color: textSecondary }]}>
              {t('alerts.composer.cancel')}
            </Text>
          </AnimatedPressable>
        ) : null}
        <AnimatedPressable
          onPress={handleSubmit}
          disabled={!canSubmit || saving}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSubmit || saving }}
          style={[
            styles.primaryBtn,
            { backgroundColor: colors.accent, opacity: !canSubmit || saving ? 0.5 : 1 },
          ]}
          testID="alert-composer-submit"
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Check size={16} color="#FFFFFF" />
          )}
          <Text style={styles.primaryBtnText}>
            {mode === 'edit' ? t('alerts.composer.update') : t('alerts.composer.save')}
          </Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: 16,
    borderCurve: 'continuous',
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  heading: { fontSize: 17, fontWeight: '700', marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    borderCurve: 'continuous',
    paddingHorizontal: 12,
    marginTop: 8,
    marginBottom: 16,
  },
  input: { flex: 1, fontSize: 15, paddingVertical: 11 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, marginBottom: 4 },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  chipText: { fontSize: 13, fontWeight: '600' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    marginTop: 14,
    paddingTop: 12,
    marginBottom: 14,
  },
  switchLabel: { fontSize: 15, fontWeight: '600' },
  hint: { fontSize: 12.5, lineHeight: 18, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 13,
    borderCurve: 'continuous',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  secondaryBtnText: { fontSize: 14, fontWeight: '600' },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 13,
    borderCurve: 'continuous',
    paddingVertical: 12,
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
