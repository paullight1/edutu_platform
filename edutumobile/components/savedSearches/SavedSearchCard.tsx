import React, { useCallback } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  Bell,
  BellOff,
  ChevronDown,
  ChevronRight,
  Globe,
  Pencil,
  Search,
  Tag,
  Trash2,
} from 'lucide-react-native';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { useTheme } from '../context/ThemeContext';
import { getDiscoveryCategory } from '../../lib/discoveryCategories';
import { decodeMaybe } from '../../lib/opportunityDisplay';
import type {
  SavedSearch,
  SavedSearchMatchPreview,
} from '@edutu/core/src/services/savedSearches';

/**
 * Relative label for "last new match". lib/utils' formatRelativeTime is
 * English-only, so alerts format their own through the catalog.
 */
export function relativeLabel(iso: string | null, t: TFunction): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const hours = Math.floor((Date.now() - then) / 3_600_000);
  if (hours < 1) return t('alerts.time.justNow');
  if (hours < 24) return t('alerts.time.hours', { n: hours });
  return t('alerts.time.days', { n: Math.floor(hours / 24) });
}

export interface SavedSearchCardProps {
  search: SavedSearch;
  expanded: boolean;
  /** null = not fetched yet; [] = fetched and genuinely empty. */
  matches: SavedSearchMatchPreview[] | null;
  matchesLoading: boolean;
  matchesFailed: boolean;
  onToggleExpand: (search: SavedSearch) => void;
  onToggleNotify: (search: SavedSearch) => void;
  onEdit: (search: SavedSearch) => void;
  onDelete: (search: SavedSearch) => void;
  onOpenMatch: (match: SavedSearchMatchPreview) => void;
}

/**
 * One alert. Tapping it expands the live preview (`/saved-searches/:id/matches`)
 * rather than re-running a lossy `q`/`category` search on Discover — Discover
 * can't express region/funding/remote, so that route showed a *wider* result
 * set than the alert actually watches.
 */
export function SavedSearchCard({
  search,
  expanded,
  matches,
  matchesLoading,
  matchesFailed,
  onToggleExpand,
  onToggleNotify,
  onEdit,
  onDelete,
  onOpenMatch,
}: SavedSearchCardProps) {
  const { t } = useTranslation('opps');
  const { colors, isDark } = useTheme();
  const textSecondary = isDark ? '#94A3B8' : '#64748B';
  const muted = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';

  const categoryLabel = (() => {
    const entry = getDiscoveryCategory(search.category);
    if (entry) return t(entry.oppsLabelKey, { defaultValue: entry.fallbackTitle });
    return search.category;
  })();

  const lastMatch = relativeLabel(search.lastMatchedAt, t);

  const handleExpand = useCallback(() => onToggleExpand(search), [onToggleExpand, search]);

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: search.notifyEnabled ? 1 : 0.72,
        },
      ]}
      testID={`alert-card-${search.id}`}
    >
      <AnimatedPressable
        onPress={handleExpand}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={search.name}
        style={styles.head}
        testID={`alert-expand-${search.id}`}
      >
        <View style={styles.headRow}>
          <View
            style={[
              styles.iconWrap,
              { backgroundColor: search.notifyEnabled ? `${colors.accent}15` : muted },
            ]}
          >
            {search.notifyEnabled ? (
              <Bell size={18} color={colors.accent} />
            ) : (
              <BellOff size={18} color={textSecondary} />
            )}
          </View>
          <View style={styles.headText}>
            <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={2}>
              {search.name}
            </Text>
            <Text style={[styles.meta, { color: textSecondary }]} numberOfLines={1}>
              {search.notifyEnabled ? t('alerts.card.watching') : t('alerts.card.paused')}
              {lastMatch ? ` · ${t('alerts.card.lastMatch', { when: lastMatch })}` : ''}
            </Text>
          </View>
          {expanded ? (
            <ChevronDown size={18} color={textSecondary} />
          ) : (
            <ChevronRight size={18} color={textSecondary} />
          )}
        </View>

        <View style={styles.chipRow}>
          {search.query ? (
            <Chip icon={<Search size={11} color={colors.accent} />} tint={colors.accent}>
              {search.query}
            </Chip>
          ) : null}
          {categoryLabel ? (
            <Chip icon={<Tag size={11} color={colors.accent} />} tint={colors.accent}>
              {categoryLabel}
            </Chip>
          ) : null}
          {search.remoteOnly ? (
            <Chip icon={<Globe size={11} color={colors.accent} />} tint={colors.accent}>
              {t('alerts.card.remoteChip')}
            </Chip>
          ) : null}
          {search.targetRegion ? (
            <Chip tint={colors.accent}>{search.targetRegion}</Chip>
          ) : null}
          {search.fundingType ? (
            <Chip tint={colors.accent}>{search.fundingType}</Chip>
          ) : null}
        </View>
      </AnimatedPressable>

      {expanded ? (
        <View style={[styles.preview, { borderTopColor: colors.border }]}>
          {matchesLoading ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : matchesFailed ? (
            <Text style={[styles.previewNote, { color: textSecondary }]}>
              {t('alerts.card.liveError')}
            </Text>
          ) : matches && matches.length ? (
            <>
              <Text style={[styles.previewCount, { color: colors.foreground }]}>
                {t('alerts.card.liveCount', { n: matches.length })}
              </Text>
              {matches.slice(0, 5).map((match) => (
                <AnimatedPressable
                  key={match.id}
                  onPress={() => onOpenMatch(match)}
                  accessibilityRole="button"
                  style={styles.matchRow}
                >
                  <View style={[styles.matchDot, { backgroundColor: colors.accent }]} />
                  <View style={styles.matchText}>
                    <Text
                      style={[styles.matchTitle, { color: colors.foreground }]}
                      numberOfLines={2}
                    >
                      {decodeMaybe(match.title)}
                    </Text>
                    {match.organization ? (
                      <Text style={[styles.matchOrg, { color: textSecondary }]} numberOfLines={1}>
                        {decodeMaybe(match.organization)}
                      </Text>
                    ) : null}
                  </View>
                  <ChevronRight size={15} color={textSecondary} />
                </AnimatedPressable>
              ))}
            </>
          ) : (
            <Text style={[styles.previewNote, { color: textSecondary }]}>
              {t('alerts.card.liveEmpty')}
            </Text>
          )}
        </View>
      ) : null}

      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <Text style={[styles.footerCount, { color: textSecondary }]} numberOfLines={1}>
          {search.matchCount > 0
            ? t('alerts.card.matchesTotal', { n: search.matchCount })
            : t('alerts.card.noMatchesYet')}
        </Text>
        <View style={styles.footerActions}>
          <IconButton
            label={
              search.notifyEnabled ? t('alerts.card.muteA11y') : t('alerts.card.unmuteA11y')
            }
            tint={muted}
            onPress={() => onToggleNotify(search)}
            testID={`alert-toggle-${search.id}`}
          >
            {search.notifyEnabled ? (
              <BellOff size={15} color={textSecondary} />
            ) : (
              <Bell size={15} color={colors.accent} />
            )}
          </IconButton>
          <IconButton
            label={t('alerts.card.editA11y')}
            tint={muted}
            onPress={() => onEdit(search)}
            testID={`alert-edit-${search.id}`}
          >
            <Pencil size={15} color={textSecondary} />
          </IconButton>
          <IconButton
            label={t('alerts.card.deleteA11y')}
            tint="rgba(239,68,68,0.1)"
            onPress={() => onDelete(search)}
            testID={`alert-delete-${search.id}`}
          >
            <Trash2 size={15} color="#ef4444" />
          </IconButton>
        </View>
      </View>
    </View>
  );
}

function Chip({
  icon,
  tint,
  children,
}: {
  icon?: React.ReactNode;
  tint: string;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.chip, { backgroundColor: `${tint}10` }]}>
      {icon}
      <Text style={[styles.chipText, { color: tint }]} numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
}

function IconButton({
  label,
  tint,
  onPress,
  testID,
  children,
}: {
  label: string;
  tint: string;
  onPress: () => void;
  testID: string;
  children: React.ReactNode;
}) {
  return (
    <AnimatedPressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={[styles.iconBtn, { backgroundColor: tint }]}
      testID={testID}
    >
      <View style={styles.iconBtnInner}>{children}</View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderCurve: 'continuous',
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
  },
  head: { padding: 14 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headText: { flex: 1 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 13,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 12, marginTop: 2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    maxWidth: 220,
  },
  chipText: { fontSize: 12, fontWeight: '600' },
  preview: { borderTopWidth: 1, paddingHorizontal: 14, paddingVertical: 12, gap: 6 },
  previewCount: { fontSize: 12.5, fontWeight: '700', marginBottom: 2 },
  previewNote: { fontSize: 12.5, lineHeight: 18 },
  matchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  matchDot: { width: 6, height: 6, borderRadius: 3 },
  matchText: { flex: 1 },
  matchTitle: { fontSize: 13.5, fontWeight: '600' },
  matchOrg: { fontSize: 11.5, marginTop: 1 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  footerCount: { flex: 1, fontSize: 12.5, fontWeight: '600' },
  footerActions: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 11,
    borderCurve: 'continuous',
  },
  iconBtnInner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
