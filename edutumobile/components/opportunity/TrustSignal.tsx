import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { BadgeCheck, Clock, Info } from "lucide-react-native";
import type { OpportunityTrust } from "@edutu/core/src/types/opportunity";

/**
 * Learner-facing credibility row: a "Verified" badge, when the opportunity was
 * last checked, and an honest note for estimated/rolling/unconfirmed deadlines.
 * Credibility is the product's moat, so these signals sit right on the detail.
 * Renders nothing when there is no trust data.
 */
export function TrustSignal({
  trust,
  mutedColor,
  verifiedColor = "#059669",
}: {
  trust?: OpportunityTrust | null;
  mutedColor: string;
  verifiedColor?: string;
}) {
  if (!trust) return null;

  const checkedAgo = relativeTime(trust.lastVerifiedAt);
  const note = deadlineConfidenceNote(trust.deadlineConfidence);
  if (!trust.verified && !checkedAgo && !note) return null;

  return (
    <View style={styles.row}>
      {trust.verified ? (
        <View style={styles.item}>
          <BadgeCheck size={14} color={verifiedColor} />
          <Text style={[styles.verifiedText, { color: verifiedColor }]}>
            Verified
          </Text>
        </View>
      ) : null}
      {checkedAgo ? (
        <View style={styles.item}>
          <Clock size={12} color={mutedColor} />
          <Text style={[styles.mutedText, { color: mutedColor }]}>
            Checked {checkedAgo}
          </Text>
        </View>
      ) : null}
      {note ? (
        <View style={styles.item}>
          <Info size={12} color={mutedColor} />
          <Text style={[styles.mutedText, { color: mutedColor }]}>{note}</Text>
        </View>
      ) : null}
    </View>
  );
}

function relativeTime(iso: string | null): string | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}

function deadlineConfidenceNote(
  confidence: OpportunityTrust["deadlineConfidence"],
): string | null {
  switch (confidence) {
    case "inferred":
      return "Estimated deadline";
    case "rolling":
      return "Rolling deadline";
    case "unknown":
      return "Deadline unconfirmed";
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
    marginTop: 8,
  },
  item: { flexDirection: "row", alignItems: "center", gap: 4 },
  verifiedText: { fontSize: 12, fontWeight: "700" },
  mutedText: { fontSize: 12, fontWeight: "500" },
});
