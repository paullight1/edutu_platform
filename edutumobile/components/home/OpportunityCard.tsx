import React, { useMemo } from "react";
import { View, Text, Image, StyleSheet, TouchableOpacity, Alert, Dimensions } from "react-native";
import { ChevronRight, BookmarkPlus, Share2, Sparkles, MoreVertical } from "lucide-react-native";
import { FadeInDown } from "react-native-reanimated";
import { Opportunity } from "@edutu/core/src/types/opportunity";
import { getDeadlineBadge, urgencyColor } from "@edutu/core/src/utils/deadline";
import { getMatchTier, MATCH_TIER_KEY } from "@edutu/core/src/utils/matchTier";
import { AnimatedPressable } from "../ui/AnimatedPressable";
import { useTranslation } from "react-i18next";

const { width } = Dimensions.get("window");
const CARD_GAP = 12;
const CARD_WIDTH = (width - 40 - CARD_GAP) / 2;

export interface OpportunityCardProps {
    item: Opportunity;
    isDark: boolean;
    textPrimary: string;
    textSecondary: string;
    accent: string;
    /** Stable id-based handlers so React.memo can skip re-renders. */
    onPress?: (id: string) => void;
    onBookmark?: (id: string) => void;
    onShare?: (item: Opportunity) => void;
    onNotInterested?: (id: string) => void;
    bookmarked?: boolean;
    /** Show a subtle "NN% match" badge (Recommended section only). */
    showMatchBadge?: boolean;
    index?: number;
}

function OpportunityCardBase({
    item,
    isDark,
    textPrimary,
    textSecondary,
    accent,
    onPress,
    onBookmark,
    onShare,
    onNotInterested,
    bookmarked = false,
    showMatchBadge = false,
    index = 0,
}: OpportunityCardProps) {
    const { t } = useTranslation('home');
    // Dead image URLs fall back to the imageless layout instead of a blank block.
    const [imageFailed, setImageFailed] = React.useState(false);
    const deadlineBadge = useMemo(() => getDeadlineBadge(item.deadline), [item.deadline]);
    const deadlineText = deadlineBadge.shortLabel;
    const deadlineColor = deadlineBadge.level === "none"
        ? (isDark ? "#94A3B8" : "#64748B")
        : urgencyColor(deadlineBadge.level);

    const topMatchReason = item.matchReasons?.[0];
    const matchPct = Math.round(item.match ?? 0);
    const showMatchReason = Boolean(topMatchReason) && matchPct >= 40;
    const showMatch = showMatchBadge && matchPct >= 40;

    // The org field often mirrors the title; only show the pill when it adds
    // something new, so the title isn't duplicated on the card.
    const orgLabel = (item.organization ?? "").trim();
    const titleLabel = (item.title ?? "").trim();
    const org = orgLabel.toLowerCase();
    const title = titleLabel.toLowerCase();
    const showOrg =
        orgLabel.length > 0 &&
        org !== title &&
        !title.startsWith(org) &&
        !org.startsWith(title);

    const promptNotInterested = () => {
        if (!onNotInterested) return;
        Alert.alert(
            t('opportunityCard.notInterestedTitle'),
            t('opportunityCard.notInterestedMessage'),
            [
                { text: t('common:actions.cancel'), style: "cancel" },
                {
                    text: t('opportunityCard.notInterestedConfirm'),
                    style: "destructive",
                    onPress: () => onNotInterested(item.id),
                },
            ],
        );
    };

    return (
        <AnimatedPressable
            onPress={() => onPress?.(item.id)}
            onLongPress={onNotInterested ? promptNotInterested : undefined}
            style={[styles.opportunityCard, {
                backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "#FFFFFF",
            }]}
            entering={FadeInDown.delay(index * 60).duration(350).springify()}
        >
            {item.image && !imageFailed && (
                <Image
                    source={{ uri: item.image }}
                    style={styles.oppCardImage}
                    resizeMode="cover"
                    onError={() => setImageFailed(true)}
                />
            )}
            <View style={styles.oppCardContent}>
                <View style={styles.oppCardTop}>
                    {showOrg ? (
                        <View style={[styles.oppOrgBadge, { backgroundColor: isDark ? "rgba(99,102,241,0.15)" : "#F0F0FF" }]}>
                            <Text style={styles.oppOrgText} numberOfLines={1}>{orgLabel}</Text>
                        </View>
                    ) : (
                        <View style={{ flex: 1 }} />
                    )}
                    <View style={styles.oppCardActions}>
                        {onShare && (
                            <TouchableOpacity
                                onPress={(e) => {
                                    e.stopPropagation();
                                    onShare(item);
                                }}
                                hitSlop={6}
                                style={styles.bookmarkBtn}
                            >
                                <Share2 size={15} color={textSecondary} />
                            </TouchableOpacity>
                        )}
                        {onBookmark && (
                            <TouchableOpacity
                                onPress={(e) => {
                                    e.stopPropagation();
                                    onBookmark(item.id);
                                }}
                                hitSlop={6}
                                style={styles.bookmarkBtn}
                            >
                                <BookmarkPlus size={16} color={bookmarked ? "#6366F1" : textSecondary} fill={bookmarked ? "#6366F1" : "transparent"} />
                            </TouchableOpacity>
                        )}
                        {onNotInterested && (
                            <TouchableOpacity
                                onPress={(e) => {
                                    e.stopPropagation();
                                    promptNotInterested();
                                }}
                                hitSlop={6}
                                style={styles.bookmarkBtn}
                            >
                                <MoreVertical size={16} color={textSecondary} />
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
                {showMatch && (
                    <View style={[styles.oppMatchBadge, { backgroundColor: isDark ? "rgba(99,102,241,0.18)" : "rgba(99,102,241,0.10)" }]}>
                        <Sparkles size={9} color={accent} />
                        <Text style={[styles.oppMatchBadgeText, { color: accent }]}>{t('opportunityCard.' + MATCH_TIER_KEY[getMatchTier(matchPct)])}</Text>
                    </View>
                )}
                <Text style={[styles.oppTitle, { color: textPrimary }]} numberOfLines={2}>{item.title}</Text>
                {showMatchReason && (
                    <Text style={styles.oppMatchReason} numberOfLines={1}>{topMatchReason}</Text>
                )}
                <View style={[styles.oppFooter, { borderTopColor: isDark ? "rgba(255,255,255,0.05)" : "#F1F5F9" }]}>
                    <View style={styles.deadlineRow}>
                        <View style={[styles.deadlineDot, { backgroundColor: deadlineColor }]} />
                        <Text style={[styles.oppDeadline, { color: deadlineColor }]}>
                            {deadlineText}
                        </Text>
                    </View>
                    <View style={styles.oppArrowBtn}>
                        <ChevronRight size={14} color="#FFFFFF" />
                    </View>
                </View>
            </View>
        </AnimatedPressable>
    );
}

/**
 * Memoized so a card only re-renders when its own props change (e.g. its
 * bookmark toggles) instead of on every parent state change. Relies on the
 * parent passing stable id-based callbacks.
 */
export const OpportunityCard = React.memo(OpportunityCardBase);

const styles = StyleSheet.create({
    opportunityCard: {
        borderRadius: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: "rgba(99,102,241,0.1)",
        overflow: "hidden",
    },
    oppCardImage: {
        width: "100%",
        height: 92,
    },
    oppCardContent: {
        padding: 11,
    },
    oppCardTop: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 7,
    },
    oppCardActions: {
        flexDirection: "row",
        alignItems: "center",
        gap: 2,
    },
    bookmarkBtn: {
        padding: 4,
    },
    oppOrgBadge: {
        alignSelf: "flex-start",
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 8,
        marginBottom: 7,
    },
    oppOrgText: {
        fontSize: 9,
        fontWeight: "600",
        color: "#6366F1",
    },
    oppMatchBadge: {
        alignSelf: "flex-start",
        flexDirection: "row",
        alignItems: "center",
        gap: 3,
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: 7,
        marginBottom: 7,
    },
    oppMatchBadgeText: {
        fontSize: 10,
        fontWeight: "700",
    },
    oppTitle: {
        fontSize: 12,
        lineHeight: 16,
        fontWeight: "600",
        marginBottom: 8,
    },
    oppMatchReason: {
        fontSize: 10,
        lineHeight: 13,
        fontWeight: "600",
        color: "#10B981",
        marginTop: -4,
        marginBottom: 8,
    },
    oppFooter: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingTop: 8,
        borderTopWidth: 1,
    },
    deadlineRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
    },
    deadlineDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    oppDeadline: {
        fontSize: 10,
        fontWeight: "500",
    },
    oppArrowBtn: {
        backgroundColor: "#6366F1",
        width: 26,
        height: 26,
        borderRadius: 13,
        alignItems: "center",
        justifyContent: "center",
    },
});

export { CARD_WIDTH };
