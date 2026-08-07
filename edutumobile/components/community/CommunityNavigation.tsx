import React from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  ArrowLeft,
  Compass,
  MessageCircle,
  Plus,
  Settings,
  UserCircle,
  Users,
} from "lucide-react-native";
import { usePathname, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useTheme } from "../context/ThemeContext";

/**
 * Community-only chrome. It intentionally does not reuse the global app tabs:
 * a conversation is a focused mode, and leaving it should be an explicit,
 * legible action rather than an accidental tab switch.
 */
export function CommunityHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation("community");
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const page = pathname.includes("/discussions/explore")
    ? "explore"
    : pathname.includes("/discussions/chats")
      ? "chats"
      : pathname.includes("/discussions/profile")
        ? "profile"
        : "groups";

  const title =
    page === "explore"
      ? t("screens.exploreTitle")
      : page === "chats"
        ? t("screens.chatsTitle")
        : page === "profile"
          ? t("screens.profileTitle")
          : t("screens.browseTitle");

  const contextualAction =
    page === "groups"
      ? {
          label: t("actions.createGroup"),
          icon: Plus,
          onPress: () => router.push("/discussions/new" as never),
        }
      : page === "profile"
        ? {
            label: "Profile settings",
            icon: Settings,
            onPress: () => router.push("/profile/settings" as never),
          }
        : null;
  const ActionIcon = contextualAction?.icon;

  return (
    <View
      style={[
        styles.header,
        {
          backgroundColor: colors.background,
          borderBottomColor: colors.border,
          paddingTop: insets.top,
          height: 76 + insets.top,
        },
      ]}
    >
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Back to Edutu home"
        onPress={() => router.replace("/(app)" as never)}
        style={[
          styles.back,
          { backgroundColor: isDark ? "rgba(255,255,255,0.08)" : colors.muted },
        ]}
      >
        <ArrowLeft size={19} color={colors.foreground} />
      </TouchableOpacity>
      <View style={styles.titleWrap}>
        <Text style={[styles.eyebrow, { color: colors.accent }]}>
          COMMUNITY
        </Text>
        <Text
          style={[styles.title, { color: colors.foreground }]}
          numberOfLines={1}
        >
          {title}
        </Text>
      </View>
      {contextualAction && ActionIcon ? (
        <TouchableOpacity
          testID={
            page === "groups"
              ? "discussions-create"
              : "community-profile-settings"
          }
          accessibilityRole="button"
          accessibilityLabel={contextualAction.label}
          onPress={contextualAction.onPress}
          style={[
            styles.activity,
            {
              backgroundColor: page === "groups" ? colors.accent : colors.muted,
            },
          ]}
        >
          <ActionIcon
            size={19}
            color={page === "groups" ? "#FFFFFF" : colors.foreground}
          />
        </TouchableOpacity>
      ) : (
        <View style={styles.actionSpacer} />
      )}
    </View>
  );
}

export function CommunityNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation("community");
  const { colors, isDark } = useTheme();
  const isGroups =
    pathname === "/discussions" || pathname.includes("/discussions/");
  const isExplore = pathname.includes("/discussions/explore");
  const isChats = pathname.includes("/discussions/chats");
  const isProfile = pathname.includes("/discussions/profile");

  const items = [
    {
      label: t("screens.browseTitle"),
      icon: Users,
      active: isGroups && !isExplore && !isChats && !isProfile,
      onPress: () => router.replace("/discussions" as never),
    },
    {
      label: t("screens.exploreTitle"),
      icon: Compass,
      active: isExplore,
      onPress: () => router.replace("/discussions/explore" as never),
    },
    {
      label: t("screens.chatsTitle"),
      icon: MessageCircle,
      active: isChats,
      onPress: () => router.replace("/discussions/chats" as never),
    },
    {
      label: t("screens.profileTitle"),
      icon: UserCircle,
      active: isProfile,
      onPress: () => router.replace("/discussions/profile" as never),
    },
  ];

  return (
    <View
      style={[
        styles.nav,
        {
          backgroundColor: isDark
            ? "rgba(15,23,42,0.97)"
            : "rgba(255,255,255,0.97)",
          borderTopColor: colors.border,
        },
      ]}
    >
      {items.map(({ label, icon: Icon, active, onPress }) => (
        <TouchableOpacity
          key={label}
          accessibilityRole="button"
          accessibilityState={{ selected: active }}
          accessibilityLabel={label}
          onPress={onPress}
          style={styles.navItem}
          activeOpacity={0.7}
        >
          <View
            style={[
              styles.iconBubble,
              active && { backgroundColor: `${colors.accent}20` },
            ]}
          >
            <Icon
              size={21}
              color={active ? colors.accent : colors.textSecondary}
              strokeWidth={active ? 2.5 : 2}
            />
          </View>
          <Text
            style={[
              styles.navLabel,
              { color: active ? colors.accent : colors.textSecondary },
            ]}
          >
            {label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 76,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  titleWrap: { flex: 1, marginLeft: 12 },
  eyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.4 },
  title: { fontSize: 22, fontWeight: "800", letterSpacing: -0.4 },
  activity: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  actionSpacer: { width: 38, height: 38 },
  nav: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: Platform.OS === "ios" ? 86 : 70,
    paddingBottom: Platform.OS === "ios" ? 18 : 4,
    paddingHorizontal: 8,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    elevation: 12,
  },
  navItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3 },
  iconBubble: {
    width: 42,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  navLabel: { fontSize: 11, fontWeight: "700" },
});
