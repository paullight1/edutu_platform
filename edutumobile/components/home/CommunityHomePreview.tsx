import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { ChevronRight, MessageCircle } from "lucide-react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { sceneForState } from "@edutu/ux-state/scenes";
import {
  fetchGroups,
  type GroupWithMembership,
} from "@edutu/core/src/services/communities";
import { useTheme } from "../context/ThemeContext";
import { GroupRow } from "../community/GroupRow";
import { SceneRenderer } from "../state/SceneRenderer";
import { AnimatedPressable } from "../ui/AnimatedPressable";

/** A bounded Home glimpse: enough signal to invite a return, never a chat feed. */
export function CommunityHomePreview() {
  const router = useRouter();
  const { getToken } = useAuth();
  const { colors } = useTheme();
  const [groups, setGroups] = useState<GroupWithMembership[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const rows = await fetchGroups({ limit: 4 }, getToken);
      setGroups(rows.filter((row) => !row.group.archivedAt).slice(0, 3));
    } catch {
      // Home is an overview. Community network errors must never blank it.
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View testID="home-community-preview" style={styles.section}>
      <View style={styles.headingRow}>
        <View style={styles.headingLeft}>
          <View
            style={[styles.icon, { backgroundColor: `${colors.accent}18` }]}
          >
            <MessageCircle size={16} color={colors.accent} />
          </View>
          <View>
            <Text style={[styles.title, { color: colors.foreground }]}>
              Community
            </Text>
          </View>
        </View>
      </View>

      {loading ? (
        <View
          style={[
            styles.loading,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Checking the community…
          </Text>
        </View>
      ) : groups.length > 0 ? (
        <View
          style={[
            styles.list,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          {groups.map((row, index) => (
            <GroupRow
              key={row.group.id}
              group={row.group}
              membership={row.membership?.status ?? null}
              index={index}
              onPress={(group) =>
                router.push(`/discussions/${group.id}` as never)
              }
            />
          ))}
        </View>
      ) : (
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel="Open community"
          onPress={() => router.push("/discussions" as never)}
          hapticFeedback="light"
          scaleTo={0.98}
          style={[
            styles.empty,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.emptyInner}>
            <SceneRenderer
              scene={sceneForState(
                { kind: "empty", reason: "firstRun" },
                "community",
              )}
              size={92}
            />
            <View style={styles.emptyCopy}>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                Find your people
              </Text>
              <Text
                style={[styles.emptyBody, { color: colors.textSecondary }]}
                numberOfLines={2}
              >
                Join a group around your goals and learn together.
              </Text>
            </View>
            <View
              style={[styles.emptyArrow, { backgroundColor: colors.muted }]}
            >
              <ChevronRight size={18} color={colors.accent} />
            </View>
          </View>
        </AnimatedPressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 18, gap: 9 },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headingLeft: { flexDirection: "row", alignItems: "center", gap: 9 },
  icon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  kicker: { fontSize: 9, fontWeight: "800", letterSpacing: 1.3 },
  title: { fontSize: 16, fontWeight: "800", marginTop: 1 },
  list: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    overflow: "hidden",
  },
  loading: {
    minHeight: 88,
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  loadingText: { fontSize: 13 },
  empty: {
    minHeight: 118,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  emptyInner: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  emptyCopy: { flex: 1, gap: 3 },
  emptyTitle: { fontSize: 16, fontWeight: "800" },
  emptyBody: { fontSize: 12, lineHeight: 17 },
  emptyArrow: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
});
