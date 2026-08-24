import React, { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ChevronDown } from "lucide-react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useTheme } from "../context/ThemeContext";
import { AnimatedPressable } from "../ui/AnimatedPressable";
import {
  cleanOpportunityNarrative,
  needsProgressiveDisclosure,
} from "../../lib/opportunityDisplay";

type CollapsibleSectionProps = {
  title: string;
  /** One line of the section's actual substance, shown while collapsed. */
  preview?: string;
  /** Small count / "3 items" hint rendered next to the title. */
  meta?: string;
  defaultExpanded?: boolean;
  /**
   * Keeps an open section compact until the learner explicitly asks to read
   * the complete copy. Intended for long narrative sections such as About.
   */
  progressiveDisclosure?: boolean;
  collapsedBodyHeight?: number;
  viewMoreLabel?: string;
  showLessLabel?: string;
  children: React.ReactNode;
};

function extractNarrativeText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractNarrativeText).join(" ");
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return extractNarrativeText(node.props.children);
  }
  return "";
}

function cleanNarrativeNode(node: React.ReactNode): React.ReactNode {
  if (typeof node === "string") return cleanOpportunityNarrative(node);
  if (Array.isArray(node)) return node.map(cleanNarrativeNode);
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    if (node.props.children === undefined) return node;
    return React.cloneElement(
      node,
      undefined,
      React.Children.map(node.props.children, cleanNarrativeNode),
    );
  }
  return node;
}

/**
 * Quiet reference section for the opportunity detail screen. It avoids card
 * stacking, previews collapsed content, and can progressively disclose a long
 * open body without making the page feel endless.
 */
export function CollapsibleSection({
  title,
  preview,
  meta,
  defaultExpanded = false,
  progressiveDisclosure,
  collapsedBodyHeight = 240,
  viewMoreLabel = "View more",
  showLessLabel = "Show less",
  children,
}: CollapsibleSectionProps) {
  const { colors, isDark, reducedMotion } = useTheme();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [fullContentVisible, setFullContentVisible] = useState(false);
  const textSecondary = isDark ? "#94A3B8" : "#64748B";
  const wantsProgressiveDisclosure = progressiveDisclosure ?? defaultExpanded;
  const narrativeText = useMemo(() => extractNarrativeText(children), [children]);
  const useProgressiveDisclosure =
    wantsProgressiveDisclosure && needsProgressiveDisclosure(narrativeText);
  const displayChildren = useMemo(
    () =>
      wantsProgressiveDisclosure ? cleanNarrativeNode(children) : children,
    [children, wantsProgressiveDisclosure],
  );

  const toggle = useCallback(() => {
    setExpanded((value) => {
      if (value) setFullContentVisible(false);
      return !value;
    });
  }, []);

  const toggleFullContent = useCallback(() => {
    setFullContentVisible((value) => !value);
  }, []);

  const contentIsClipped = useProgressiveDisclosure && !fullContentVisible;

  return (
    <View style={[styles.wrap, { borderTopColor: colors.border }]}>
      <AnimatedPressable
        onPress={toggle}
        scaleTo={0.99}
        hapticFeedback="selection"
        style={styles.headerHit}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={title}
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <View style={styles.titleRow}>
              <Text
                style={[styles.title, { color: colors.foreground }]}
                numberOfLines={1}
              >
                {title}
              </Text>
              {meta ? (
                <Text
                  style={[styles.meta, { color: textSecondary }]}
                  numberOfLines={1}
                >
                  {meta}
                </Text>
              ) : null}
            </View>
            {!expanded && preview ? (
              <Text
                style={[styles.preview, { color: textSecondary }]}
                numberOfLines={2}
              >
                {preview}
              </Text>
            ) : null}
          </View>
          <View
            style={[
              styles.chevron,
              {
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.06)"
                  : "rgba(15,23,42,0.05)",
              },
              expanded && { transform: [{ rotate: "180deg" }] },
            ]}
          >
            <ChevronDown size={18} color={textSecondary} />
          </View>
        </View>
      </AnimatedPressable>

      {expanded ? (
        <Animated.View
          entering={reducedMotion ? undefined : FadeIn.duration(180)}
          style={styles.body}
        >
          <View
            testID="collapsible-content-clip"
            style={[
              styles.contentClip,
              contentIsClipped && {
                maxHeight: collapsedBodyHeight,
                overflow: "hidden",
              },
            ]}
          >
            {displayChildren}
          </View>

          {useProgressiveDisclosure ? (
            <AnimatedPressable
              testID="collapsible-view-more"
              onPress={toggleFullContent}
              scaleTo={0.98}
              hapticFeedback="selection"
              style={styles.viewMoreButton}
              accessibilityRole="button"
              accessibilityState={{ expanded: fullContentVisible }}
              accessibilityLabel={
                fullContentVisible ? showLessLabel : viewMoreLabel
              }
            >
              <View style={styles.viewMoreInner}>
                <Text style={[styles.viewMoreText, { color: colors.accent }]}>
                  {fullContentVisible ? showLessLabel : viewMoreLabel}
                </Text>
                <ChevronDown
                  size={16}
                  color={colors.accent}
                  style={
                    fullContentVisible
                      ? { transform: [{ rotate: "180deg" }] }
                      : undefined
                  }
                />
              </View>
            </AnimatedPressable>
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  headerHit: { paddingVertical: 16 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerText: { flex: 1, gap: 4 },
  titleRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  title: { fontSize: 17, fontWeight: "700", flexShrink: 1 },
  meta: { fontSize: 13, fontWeight: "600" },
  preview: { fontSize: 13, lineHeight: 19 },
  chevron: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderCurve: "continuous",
  },
  body: { paddingBottom: 18, gap: 10 },
  contentClip: { gap: 10 },
  viewMoreButton: {
    alignSelf: "flex-start",
    minHeight: 36,
    justifyContent: "center",
  },
  viewMoreInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  viewMoreText: {
    fontSize: 14,
    fontWeight: "700",
  },
});
