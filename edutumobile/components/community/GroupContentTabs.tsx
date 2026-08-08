import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { AnimatedPressable } from "../ui/AnimatedPressable";
import { useTheme } from "../context/ThemeContext";

export type GroupContentTab = "posts" | "resources" | "about";

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
  const tabs: Array<{ key: GroupContentTab; label: string; route: string }> = [
    {
      key: "posts",
      label: t("contentTabs.posts"),
      route: `/discussions/${groupId}`,
    },
    {
      key: "resources",
      label: t("contentTabs.resources"),
      route: `/discussions/${groupId}/about?tab=resources`,
    },
    {
      key: "about",
      label: t("contentTabs.about"),
      route: `/discussions/${groupId}/about?tab=about`,
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
              if (!selected) router.replace(tab.route as never);
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
