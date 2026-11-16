import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { GraduationCap, Search, X } from "lucide-react-native";
import {
  fetchOpportunities,
  getCachedOpportunitiesSnapshot,
  searchOpportunities,
} from "@edutu/core/src/services/opportunities";
import type { Opportunity } from "@edutu/core/src/types/opportunity";
import { supabase } from "../../lib/supabase";
import { AnimatedPressable } from "../ui/AnimatedPressable";
import { useTheme } from "../context/ThemeContext";

export function OpportunitySharePicker({
  visible,
  sending,
  onClose,
  onShare,
  shareError = null,
}: {
  visible: boolean;
  sending: boolean;
  onClose: () => void;
  onShare: (opportunity: Opportunity) => void;
  shareError?: string | null;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const { getToken } = useAuth();
  const { user } = useUser();
  const [rows, setRows] = useState<Opportunity[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialRows = useRef<Opportunity[]>([]);

  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      setError(null);
      setLoading(true);
      const cached = await getCachedOpportunitiesSnapshot(user?.id);
      if (controller.signal.aborted) return;
      initialRows.current = cached;
      if (cached.length > 0) setRows(cached);
      try {
        if (user?.id) {
          const fresh = await fetchOpportunities({
            supabase,
            userId: user.id,
            getAuthToken: getToken,
            signal: controller.signal,
            force: true,
          });
          if (!controller.signal.aborted) {
            initialRows.current = fresh;
            setRows(fresh);
            setError(null);
          }
        }
      } catch {
        if (!controller.signal.aborted && cached.length === 0) {
          setError("Opportunities could not be loaded. Try again.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    });
    return () => controller.abort();
  }, [getToken, user?.id, visible]);

  useEffect(() => {
    const term = query.trim();
    if (!visible || term.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void searchOpportunities(term, { limit: 60, signal: controller.signal })
        .then((opportunities) => {
          setRows(opportunities);
          setError(null);
        })
        .catch((caught) => {
          if ((caught as { name?: string })?.name !== "AbortError") {
            setError("Search could not be loaded. Try again.");
          }
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, visible]);

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return rows.filter((opportunity) => {
      if (!term) return true;
      return `${opportunity.title} ${opportunity.organization} ${opportunity.category}`
        .toLocaleLowerCase()
        .includes(term);
    });
  }, [query, rows]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView
        style={[styles.screen, { backgroundColor: colors.background }]}
        edges={["top", "bottom"]}
      >
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={styles.headerCopy}>
            <Text
              accessibilityRole="header"
              style={[styles.title, { color: colors.foreground }]}
            >
              Share an opportunity
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Choose a verified listing. It will post immediately.
            </Text>
          </View>
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel="Close opportunity picker"
            disabled={sending}
            onPress={onClose}
            style={styles.close}
          >
            <X size={21} color={colors.foreground} />
          </AnimatedPressable>
        </View>
        <View
          style={[
            styles.search,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Search size={18} color={colors.textSecondary} />
          <TextInput
            autoFocus
            value={query}
            onChangeText={(next) => {
              setQuery(next);
              if (next.trim().length < 2) {
                setRows(initialRows.current);
                setError(null);
              }
            }}
            placeholder="Search title or organization"
            placeholderTextColor={colors.textSecondary}
            accessibilityLabel="Search opportunities"
            style={[styles.input, { color: colors.foreground }]}
          />
        </View>
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel="Submit or import an opportunity"
          disabled={sending}
          onPress={() => {
            onClose();
            router.push("/opportunities/submit" as never);
          }}
          style={[styles.submitLink, { borderColor: colors.border }]}
        >
          <Text style={[styles.submitLinkText, { color: colors.accent }]}>
            Can’t find it? Submit or import an opportunity
          </Text>
        </AnimatedPressable>
        {!!shareError && (
          <Text
            accessibilityLiveRegion="assertive"
            style={[styles.shareError, { color: colors.error }]}
          >
            {shareError}
          </Text>
        )}
        {loading && rows.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text
              accessibilityLiveRegion="polite"
              style={[styles.error, { color: colors.error }]}
            >
              {error}
            </Text>
          </View>
        ) : (
          <FlatList
            testID="opportunity-share-list"
            data={filtered}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <Text style={[styles.empty, { color: colors.textSecondary }]}>
                No matching opportunities.
              </Text>
            }
            renderItem={({ item }) => (
              <AnimatedPressable
                accessibilityRole="button"
                accessibilityLabel={`Share ${item.title}`}
                accessibilityHint="Posts this opportunity to the community"
                disabled={sending}
                onPress={() => onShare(item)}
                style={[
                  styles.card,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.card,
                    opacity: sending ? 0.55 : 1,
                  },
                ]}
              >
                <View
                  style={[
                    styles.icon,
                    { backgroundColor: `${colors.accent}14` },
                  ]}
                >
                  <GraduationCap size={20} color={colors.accent} />
                </View>
                <View style={styles.cardCopy}>
                  <Text
                    style={[styles.cardTitle, { color: colors.foreground }]}
                    numberOfLines={2}
                  >
                    {item.title}
                  </Text>
                  <Text
                    style={[styles.meta, { color: colors.textSecondary }]}
                    numberOfLines={2}
                  >
                    {[item.organization, item.deadline]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                </View>
                {sending ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : null}
              </AnimatedPressable>
            )}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    minHeight: 76,
    borderBottomWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  headerCopy: { flex: 1, gap: 3 },
  title: { fontSize: 20, lineHeight: 26, fontWeight: "800" },
  subtitle: { fontSize: 13, lineHeight: 18 },
  close: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  search: {
    minHeight: 48,
    margin: 16,
    marginBottom: 4,
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  input: { flex: 1, fontSize: 16, paddingVertical: 10 },
  submitLink: {
    minHeight: 44,
    marginHorizontal: 16,
    marginTop: 7,
    borderWidth: 1,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  submitLinkText: { fontSize: 13, fontWeight: "800", textAlign: "center" },
  shareError: {
    marginHorizontal: 18,
    marginTop: 10,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  error: { textAlign: "center", fontSize: 14 },
  list: { padding: 16, paddingTop: 10, gap: 9 },
  empty: { textAlign: "center", paddingVertical: 50, fontSize: 14 },
  card: {
    minHeight: 78,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cardCopy: { flex: 1, minWidth: 0, gap: 4 },
  cardTitle: { fontSize: 14, lineHeight: 19, fontWeight: "800" },
  meta: { fontSize: 11, lineHeight: 16 },
});
