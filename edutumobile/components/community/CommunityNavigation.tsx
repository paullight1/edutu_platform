import React from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  ArrowLeft,
  Compass,
  MessageCircle,
  Settings,
  UserCircle,
  Users,
} from "lucide-react-native";
import { usePathname, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useTheme } from "../context/ThemeContext";

/**
 * Community-only chrome. The global Groups tab is the entry point, then this
 * dedicated navigation owns Explore, Groups and Chats. Profile lives in the
 * header so it stays reachable without competing with the primary destinations.
 * Conversation routes stay focused and keep explicit back navigation.
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
        accessibilityLabel={t("navigation.backHome")}
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
          {t("navigation.eyebrow")}
        </Text>
        <Text
          style={[styles.title, { color: colors.foreground }]}
          numberOfLines={1}
        >
          {title}
        </Text>
      </View>
      <View style={styles.headerActions}>
        <TouchableOpacity
          testID={page === "profile" ? "community-profile-settings" : "community-profile-shortcut"}
          accessibilityRole="button"
          accessibilityLabel={
            page === "profile"
              ? t("navigation.profileSettings")
              : t("screens.profileTitle")
          }
          onPress={() => router.push((page === "profile" ? "/profile/settings" : "/discussions/profile") as never)}
          style={[styles.activity, { backgroundColor: colors.muted }]}
        >
          {page === "profile" ? (
            <Settings size={19} color={colors.foreground} />
          ) : (
            <UserCircle size={20} color={colors.foreground} />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function CommunityNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation("community");
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  const isGroups = normalizedPath === "/discussions";
  const isExplore = normalizedPath === "/discussions/explore";
  const isChats = normalizedPath === "/discussions/chats";

  const items = [
    {
      label: t("screens.exploreTitle"),
      icon: Compass,
      active: isExplore,
      onPress: () => router.replace("/discussions/explore" as never),
    },
    {
      label: t("screens.browseTitle"),
      icon: Users,
      active: isGroups,
      onPress: () => router.replace("/discussions" as never),
    },
    {
      label: t("screens.chatsTitle"),
      icon: MessageCircle,
      active: isChats,
      onPress: () => router.replace("/discussions/chats" as never),
    },
  ];

  return (
    <View
      testID="community-navigation"
      style={[
        styles.nav,
        {
          backgroundColor: isDark
            ? "rgba(15,23,42,0.97)"
            : "rgba(255,255,255,0.97)",
          borderTopColor: colors.border,
          height: 58 + insets.bottom,
          paddingBottom: insets.bottom,
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
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  nav: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 58,
    paddingTop: 4,
    paddingHorizontal: 8,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    elevation: 12,
    zIndex: 20,
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
