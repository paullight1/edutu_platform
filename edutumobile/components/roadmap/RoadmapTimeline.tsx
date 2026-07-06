import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Check, Trash2 } from 'lucide-react-native';

export interface TimelineMilestone {
  id: string;
  title: string;
  description?: string;
  date: string;
}

export interface RoadmapTimelineColors {
  foreground: string;
  textSecondary: string;
  accent: string;
  success: string;
  border: string;
  card: string;
}

interface RoadmapTimelineProps {
  milestones: TimelineMilestone[];
  /** ids of milestones the user has checked off. */
  completedIds?: string[];
  /** called when a milestone row is tapped, to toggle its done state. */
  onToggle?: (id: string) => void;
  /** when provided, each row shows a remove button that calls this with the id. */
  onRemove?: (id: string) => void;
  colors: RoadmapTimelineColors;
  /** injectable "now" so the today-marker is deterministic in tests. */
  today?: Date;
  /** when set, only the first N milestones render — used for staggered reveal. */
  visibleCount?: number;
}

function formatShort(dateStr: string): string {
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * A vertical, editable roadmap timeline: connected waypoint nodes with done /
 * current / upcoming states, strike-through on completed steps, and a "Today"
 * marker inserted at the first upcoming milestone. Tapping a row toggles it done.
 */
export function RoadmapTimeline({
  milestones,
  completedIds = [],
  onToggle,
  onRemove,
  colors,
  today = new Date(),
  visibleCount,
}: RoadmapTimelineProps) {
  const done = new Set(completedIds);
  const firstPendingIndex = milestones.findIndex((m) => !done.has(m.id));
  const todayMs = startOfDay(today);
  const todayIndex = milestones.findIndex((m) => {
    const parsed = new Date(m.date);
    return !Number.isNaN(parsed.getTime()) && startOfDay(parsed) >= todayMs;
  });

  const shown =
    typeof visibleCount === 'number'
      ? milestones.slice(0, Math.max(0, visibleCount))
      : milestones;

  return (
    <View>
      {shown.map((milestone, index) => {
        const isDone = done.has(milestone.id);
        const isActive = !isDone && index === firstPendingIndex;
        const isLast = index === shown.length - 1;
        const showTodayMarker = index === todayIndex && todayIndex > 0;

        return (
          <View key={milestone.id}>
            {showTodayMarker && (
              <View style={styles.todayRow} accessibilityRole="text">
                <View style={styles.todaySpacer} />
                <View style={[styles.todayLine, { backgroundColor: colors.accent }]} />
                <Text style={[styles.todayLabel, { color: colors.accent }]}>TODAY</Text>
                <View style={[styles.todayRule, { backgroundColor: `${colors.accent}40` }]} />
              </View>
            )}

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => onToggle?.(milestone.id)}
              style={styles.row}
              accessibilityRole="button"
              accessibilityState={{ checked: isDone }}
              accessibilityLabel={`${milestone.title}${isDone ? ', done' : ''}`}
            >
              <Text style={[styles.date, { color: colors.textSecondary }]}>
                {formatShort(milestone.date)}
              </Text>

              <View style={styles.track}>
                {!isLast && (
                  <View style={[styles.line, { backgroundColor: colors.border }]} />
                )}
                <View
                  style={[
                    styles.node,
                    {
                      backgroundColor: isDone ? colors.success : colors.card,
                      borderColor: isDone
                        ? colors.success
                        : isActive
                          ? colors.accent
                          : colors.border,
                    },
                    isActive && styles.nodeActive,
                    isActive && { shadowColor: colors.accent },
                  ]}
                >
                  {isDone ? <Check size={12} color="#FFFFFF" /> : null}
                </View>
              </View>

              <View style={styles.body}>
                <Text
                  style={[
                    styles.title,
                    {
                      color: colors.foreground,
                      textDecorationLine: isDone ? 'line-through' : 'none',
                      opacity: isDone ? 0.6 : 1,
                    },
                  ]}
                >
                  {milestone.title}
                </Text>
                {milestone.description ? (
                  <Text
                    style={[styles.desc, { color: colors.textSecondary }]}
                    numberOfLines={3}
                  >
                    {milestone.description}
                  </Text>
                ) : null}
              </View>

              {onRemove ? (
                <TouchableOpacity
                  onPress={() => onRemove(milestone.id)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${milestone.title}`}
                  style={styles.removeButton}
                >
                  <Trash2 size={15} color={colors.textSecondary} />
                </TouchableOpacity>
              ) : null}
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
}

const NODE_COLUMN = 28;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', minHeight: 64 },
  date: {
    width: 52,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'right',
    paddingTop: 2,
  },
  track: { width: NODE_COLUMN, alignItems: 'center' },
  line: {
    position: 'absolute',
    top: 18,
    bottom: -8,
    width: 2,
    left: NODE_COLUMN / 2 - 1,
  },
  node: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    marginTop: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeActive: {
    shadowOpacity: 0.35,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  body: { flex: 1, paddingBottom: 16, paddingLeft: 4 },
  removeButton: { padding: 4, marginTop: 2 },
  title: { fontSize: 15, fontWeight: '700', lineHeight: 20 },
  desc: { fontSize: 13, lineHeight: 18, marginTop: 3 },
  todayRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  todaySpacer: { width: 52 },
  todayLine: { width: NODE_COLUMN, height: 2 },
  todayLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    marginHorizontal: 6,
  },
  todayRule: { flex: 1, height: 1 },
});
