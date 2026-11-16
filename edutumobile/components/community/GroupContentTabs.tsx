import React, { useMemo } from "react";
import { PanResponder, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { AnimatedPressable } from "../ui/AnimatedPressable";
import { useTheme } from "../context/ThemeContext";

export type GroupContentTab = "posts" | "resources" | "about";

const TAB_ORDER: GroupContentTab[] = ["posts", "resources", "about"];

export function getGroupContentRoute(
  groupId: string,
  tab: GroupContentTab,
): string {
  return tab === "posts"
    ? `/discussions/${groupId}`
    : `/discussions/${groupId}?tab=${tab}`;
}

export function useGroupContentSwipe(
  groupId: string,
  active: GroupContentTab,
) {
  const router = useRouter();
  return useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 18 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.25,
        // The posts FlatList and About ScrollView otherwise claim the gesture
        // before the outer pager can see it. Capture only clearly horizontal
        // movement so their vertical scrolling remains untouched.
        onMoveShouldSetPanResponderCapture: (_, gesture) =>
          Math.abs(gesture.dx) > 18 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.25,
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: (_, gesture) => {
          if (Math.abs(gesture.dx) < 48) return;
          const currentIndex = TAB_ORDER.indexOf(active);
          const nextIndex =
            gesture.dx < 0 ? currentIndex + 1 : currentIndex - 1;
          const next = TAB_ORDER[nextIndex];
          if (!next) return;
          router.replace(getGroupContentRoute(groupId, next) as never);
        },
      }).panHandlers,
    [active, groupId, router],
  );
}

export function GroupContentTabs({
  groupId,
  active,
}: {
  groupId: string;
  active: GroupContentTab;
}) {
  const router = useRouter();
  const { t } = useTranslation("community");
  const { colors } = useTheme();
  const tabs: Array<{ key: GroupContentTab; label: string }> = [
    {
      key: "posts",
      label: t("contentTabs.posts"),
    },
    {
      key: "resources",
      label: t("contentTabs.resources"),
    },
    {
      key: "about",
      label: t("contentTabs.about"),
    },
  ];

  return (
    <View
      style={[styles.tabs, { borderBottomColor: colors.border }]}
      testID="group-content-tabs"
    >
      {tabs.map((tab) => {
        const selected = tab.key === active;
        return (
          <AnimatedPressable
            key={tab.key}
            testID={`group-tab-${tab.key}`}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected }}
            hapticFeedback="selection"
            onPress={() => {
              if (!selected) {
                router.replace(getGroupContentRoute(groupId, tab.key) as never);
              }
            }}
            style={styles.tab}
          >
            <Text
              style={[
                styles.label,
                { color: selected ? colors.accent : colors.textSecondary },
              ]}
            >
              {tab.label}
            </Text>
            {selected ? (
              <View
                style={[styles.indicator, { backgroundColor: colors.accent }]}
              />
            ) : null}
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: {
    minHeight: 52,
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
  },
  tab: {
    flex: 1,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  label: { fontSize: 14, fontWeight: "800" },
  indicator: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: -1,
    height: 3,
    borderRadius: 2,
  },
});
