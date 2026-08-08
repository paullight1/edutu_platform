import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@clerk/clerk-expo";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  CalendarDays,
  ChevronRight,
  FileText,
  ImageIcon,
  Info,
  LockKeyhole,
  MessageCircle,
  Settings,
  ShieldCheck,
  UserCheck,
  Users,
} from "lucide-react-native";
import {
  fetchGroup,
  fetchGroupMembers,
  fetchGroupResources,
  isCommunityApiError,
  resolveCommunityAttachmentUrl,
  setMemberRole,
  type CommunityGroup,
  type CommunityGroupMember,
  type CommunityGroupResource,
  type CommunityResourceCursor,
  type CommunityMemberSummary,
  type MemberRole,
} from "@edutu/core/src/services/communities";
import { getOpportunityWithStatus } from "@edutu/core/src/services/opportunities";
import { getDeadlineBadge, urgencyColor } from "@edutu/core/src/utils/deadline";
import type { Opportunity } from "@edutu/core/src/types/opportunity";
import { ScreenHeader } from "../../../../components/ui/ScreenHeader";
import { AnimatedPressable } from "../../../../components/ui/AnimatedPressable";
import { Skeleton } from "../../../../components/ui/Skeleton";
import { useTheme } from "../../../../components/context/ThemeContext";
import { GroupAvatar } from "../../../../components/community/GroupAvatar";
import { GroupContentTabs } from "../../../../components/community/GroupContentTabs";

type PendingRole = { member: CommunityMemberSummary; role: "mod" | "member" };

/**
 * The group profile: identity, real activity summary, roster and administration.
 * Chat stays in `[id].tsx`; this route intentionally never duplicates messages.
 */
export default function GroupAboutScreen() {
  const router = useRouter();
  const { getToken, userId } = useAuth();
  const { t } = useTranslation(["community", "common"]);
  const { colors } = useTheme();
  const params = useLocalSearchParams<{
    id?: string | string[];
    tab?: string | string[];
  }>();
  const groupId = Array.isArray(params.id)
    ? (params.id[0] ?? "")
    : (params.id ?? "");
  const requestedTab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const activeTab = requestedTab === "resources" ? "resources" : "about";

  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<CommunityGroup | null>(null);
  const [membership, setMembership] = useState<CommunityGroupMember | null>(
    null,
  );
  const [members, setMembers] = useState<CommunityMemberSummary[]>([]);
  const [hasMoreMembers, setHasMoreMembers] = useState(false);
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [opportunityUnavailable, setOpportunityUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [pendingRole, setPendingRole] = useState<PendingRole | null>(null);
  const [changingUserId, setChangingUserId] = useState<string | null>(null);
  const [disclosureOpen, setDisclosureOpen] = useState(false);
  const [resources, setResources] = useState<CommunityGroupResource[]>([]);
  const [resourcesLoading, setResourcesLoading] = useState(true);
  const [resourcesLoadingMore, setResourcesLoadingMore] = useState(false);
  const [resourceCursor, setResourceCursor] =
    useState<CommunityResourceCursor | null>(null);
  const [resourceError, setResourceError] = useState<string | null>(null);
  const [openingResourceId, setOpeningResourceId] = useState<string | null>(
    null,
  );

  const load = useCallback(async () => {
    if (!groupId) return;
    setError(null);
    setResourceError(null);
    setResourcesLoading(true);
    try {
      const [detail, roster, resourceResult] = await Promise.all([
        fetchGroup(groupId, getToken),
        fetchGroupMembers(groupId, getToken),
        fetchGroupResources(groupId, { limit: 12 }, getToken)
          .then((page) => ({ page, error: null as string | null }))
          .catch((caught) => ({
            page: null,
            error: isCommunityApiError(caught)
              ? caught.message
              : t("common:errors.generic"),
          })),
      ]);
      setGroup(detail.group);
      setMembership(detail.membership);
      setMembers(roster.members);
      setHasMoreMembers(roster.hasMore);
      setResources(resourceResult.page?.resources ?? []);
      setResourceCursor(resourceResult.page?.nextCursor ?? null);
      setResourceError(resourceResult.error);

      if (detail.group.opportunityId) {
        const result = await getOpportunityWithStatus(
          detail.group.opportunityId,
        );
        setOpportunity(result.opportunity);
        setOpportunityUnavailable(!result.opportunity);
      } else {
        setOpportunity(null);
        setOpportunityUnavailable(false);
      }
    } catch (caught) {
      setError(
        isCommunityApiError(caught)
          ? caught.message
          : t("common:errors.generic"),
      );
    } finally {
      setLoading(false);
      setResourcesLoading(false);
    }
  }, [getToken, groupId, t]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void load();
    });
    return () => {
      active = false;
    };
  }, [load]);

  const isOwner =
    membership?.status === "active" && membership.role === "owner";
  const isAdmin = membership?.status === "active" && membership.role === "mod";
  const admins = useMemo(
    () =>
      members.filter(
        (row) =>
          row.membership.role === "owner" || row.membership.role === "mod",
      ),
    [members],
  );
  const creator = members.find(
    (row) => row.membership.userId === group?.ownerId,
  );
  const creatorName =
    creator?.profile.displayName || t("community:about.groupOwner");

  const confirmRoleChange = useCallback(async () => {
    if (!group || !pendingRole || changingUserId) return;
    const targetUserId = pendingRole.member.membership.userId;
    setChangingUserId(targetUserId);
    setRoleError(null);
    try {
      const updated = await setMemberRole(
        group.id,
        targetUserId,
        pendingRole.role,
        getToken,
      );
      setMembers((current) =>
        current.map((row) =>
          row.membership.userId === targetUserId
            ? { ...row, membership: { ...row.membership, role: updated.role } }
            : row,
        ),
      );
      setPendingRole(null);
    } catch (caught) {
      setRoleError(
        isCommunityApiError(caught)
          ? caught.message
          : t("common:errors.generic"),
      );
    } finally {
      setChangingUserId(null);
    }
  }, [changingUserId, getToken, group, pendingRole, t]);

  const openOpportunity = useCallback(() => {
    if (!opportunity) return;
    setDisclosureOpen(false);
    router.push(`/opportunities/${opportunity.id}` as never);
  }, [opportunity, router]);

  const openResource = useCallback(
    async (resource: CommunityGroupResource) => {
      if (openingResourceId) return;
      setOpeningResourceId(resource.id);
      setResourceError(null);
      try {
        const resolved = await resolveCommunityAttachmentUrl(
          resource.attachment.url,
          getToken,
        );
        await Linking.openURL(resolved.url);
      } catch (caught) {
        setResourceError(
          isCommunityApiError(caught)
            ? caught.message
            : "That resource could not be opened. Please try again.",
        );
      } finally {
        setOpeningResourceId(null);
      }
    },
    [getToken, openingResourceId],
  );

  const loadOlderResources = useCallback(async () => {
    if (!resourceCursor || resourcesLoadingMore) return;
    setResourcesLoadingMore(true);
    setResourceError(null);
    try {
      const page = await fetchGroupResources(
        groupId,
        {
          before: resourceCursor.before,
          beforeId: resourceCursor.beforeId,
          limit: 12,
        },
        getToken,
      );
      setResources((current) => {
        const byId = new Map(
          current.map((resource) => [resource.id, resource]),
        );
        page.resources.forEach((resource) => byId.set(resource.id, resource));
        return Array.from(byId.values());
      });
      setResourceCursor(page.nextCursor);
    } catch (caught) {
      setResourceError(
        isCommunityApiError(caught)
          ? caught.message
          : "Older resources could not be loaded. Please try again.",
      );
    } finally {
      setResourcesLoadingMore(false);
    }
  }, [getToken, groupId, resourceCursor, resourcesLoadingMore]);

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: colors.background }]}
      edges={["top"]}
    >
      <ScreenHeader
        title={
          group?.name ??
          (activeTab === "resources"
            ? t("community:about.resourcesTitle")
            : t("community:screens.aboutTitle"))
        }
        showBack
      />

      {!!group && <GroupContentTabs groupId={groupId} active={activeTab} />}

      {loading ? (
        <View testID="group-about-loading" style={styles.loading}>
          <Skeleton height={174} borderRadius={22} />
          <Skeleton height={112} borderRadius={18} />
          <Skeleton height={220} borderRadius={18} />
        </View>
      ) : error || !group ? (
        <View style={styles.centerState}>
          <Info size={34} color={colors.error} />
          <Text style={[styles.stateTitle, { color: colors.foreground }]}>
            {t("community:about.loadFailed")}
          </Text>
          <Text style={[styles.stateBody, { color: colors.textSecondary }]}>
            {error}
          </Text>
          <AnimatedPressable
            testID="group-about-retry"
            accessibilityRole="button"
            accessibilityLabel={t("common:actions.retry")}
            onPress={() => {
              setLoading(true);
              void load();
            }}
            style={[styles.primaryButton, { backgroundColor: colors.accent }]}
          >
            <Text style={styles.primaryButtonText}>
              {t("common:actions.retry")}
            </Text>
          </AnimatedPressable>
        </View>
      ) : (
        <ScrollView
          testID="group-about-scroll"
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <GroupHero group={group} membership={membership} />

          {activeTab === "about" && (
            <>
              <View style={styles.metrics}>
                <Metric
                  icon={Users}
                  value={String(group.memberCount)}
                  label={t("community:about.members")}
                />
                <Metric
                  icon={MessageCircle}
                  value={String(group.messageCount)}
                  label={t("community:about.messages")}
                />
                <Metric
                  icon={CalendarDays}
                  value={formatShortDate(group.createdAt)}
                  label={t("community:about.created")}
                />
              </View>

              {!!group.opportunityId && (
                <LinkedOpportunity
                  group={group}
                  opportunity={opportunity}
                  unavailable={opportunityUnavailable}
                  creatorName={creatorName}
                  onOpen={() => setDisclosureOpen(true)}
                />
              )}

              <Section title="Community guidelines" icon={ShieldCheck}>
                <GuidelineRow
                  number={1}
                  label="Be respectful, useful, and supportive."
                />
                <GuidelineRow
                  number={2}
                  label="Share verified opportunities and resources—no spam."
                />
                <GuidelineRow
                  number={3}
                  label="Protect personal details and application documents."
                />
                <GuidelineRow
                  number={4}
                  label="Keep posts relevant to this community's goal."
                />
              </Section>

              <Section
                title={t("community:about.historyTitle")}
                icon={MessageCircle}
              >
                <Text
                  style={[styles.sectionBody, { color: colors.textSecondary }]}
                >
                  {group.lastMessageAt
                    ? t("community:about.lastActive", {
                        date: formatLongDate(group.lastMessageAt),
                      })
                    : t("community:about.noActivity")}
                </Text>
                <RouteRow
                  testID="group-about-open-chat"
                  icon={MessageCircle}
                  title="Open posts"
                  body="Read the latest updates and join the conversation."
                  onPress={() =>
                    router.push(`/discussions/${group.id}` as never)
                  }
                />
              </Section>

              <Section title="Organizers & members" icon={Users}>
                <Text
                  style={[styles.sectionBody, { color: colors.textSecondary }]}
                >
                  {t("community:about.peopleSummary", {
                    admins: admins.length,
                    members: group.memberCount,
                  })}
                </Text>

                {!!roleError && (
                  <View
                    style={[styles.inlineError, { borderColor: colors.error }]}
                  >
                    <Text
                      style={[styles.inlineErrorText, { color: colors.error }]}
                    >
                      {roleError}
                    </Text>
                  </View>
                )}

                <View style={[styles.roster, { borderColor: colors.border }]}>
                  {members.map((row, index) => {
                    const role = row.membership.role;
                    const canChange =
                      isOwner &&
                      role !== "owner" &&
                      row.membership.userId !== userId &&
                      row.membership.status === "active";
                    const canMessage =
                      row.membership.userId !== userId &&
                      row.membership.status === "active";
                    const nextRole: "mod" | "member" =
                      role === "mod" ? "member" : "mod";
                    return (
                      <React.Fragment key={row.membership.id}>
                        {index > 0 && (
                          <View
                            style={[
                              styles.divider,
                              { backgroundColor: colors.border },
                            ]}
                          />
                        )}
                        <MemberRow
                          row={row}
                          creator={row.membership.userId === group.ownerId}
                          canChange={canChange}
                          canMessage={canMessage}
                          busy={changingUserId === row.membership.userId}
                          onChange={() =>
                            setPendingRole({ member: row, role: nextRole })
                          }
                          onMessage={() =>
                            router.push(
                              `/discussions/dm/new?userId=${encodeURIComponent(row.membership.userId)}&name=${encodeURIComponent(row.profile.displayName)}` as never,
                            )
                          }
                        />
                      </React.Fragment>
                    );
                  })}
                </View>
                {hasMoreMembers && (
                  <Text
                    style={[styles.footnote, { color: colors.textSecondary }]}
                  >
                    {t("community:about.memberLimitNote")}
                  </Text>
                )}
              </Section>
            </>
          )}

          {activeTab === "resources" && (
            <Section
              title={t("community:about.resourcesTitle")}
              icon={FileText}
            >
              {resourcesLoading ? (
                <View
                  testID="group-resources-loading"
                  style={styles.resourceLoading}
                >
                  <ActivityIndicator size="small" color={colors.accent} />
                  <Text
                    style={[
                      styles.resourceBody,
                      { color: colors.textSecondary },
                    ]}
                  >
                    Loading shared resources…
                  </Text>
                </View>
              ) : resources.length > 0 ? (
                <View
                  style={[styles.resourceList, { borderColor: colors.border }]}
                >
                  {resources.map((resource, index) => (
                    <React.Fragment key={resource.id}>
                      {index > 0 && (
                        <View
                          style={[
                            styles.divider,
                            { backgroundColor: colors.border },
                          ]}
                        />
                      )}
                      <ResourceRow
                        resource={resource}
                        opening={openingResourceId === resource.id}
                        onOpen={() => void openResource(resource)}
                      />
                    </React.Fragment>
                  ))}
                </View>
              ) : (
                <View
                  style={[
                    styles.resourceEmpty,
                    { backgroundColor: colors.muted },
                  ]}
                >
                  <FileText size={26} color={colors.textSecondary} />
                  <View style={styles.flex}>
                    <Text
                      style={[
                        styles.resourceTitle,
                        { color: colors.foreground },
                      ]}
                    >
                      {t("community:about.resourcesEmpty")}
                    </Text>
                    <Text
                      style={[
                        styles.resourceBody,
                        { color: colors.textSecondary },
                      ]}
                    >
                      Share a PDF or image in Posts and it will appear here for
                      members.
                    </Text>
                  </View>
                </View>
              )}
              {!!resourceCursor && (
                <AnimatedPressable
                  testID="group-resources-load-older"
                  accessibilityRole="button"
                  accessibilityLabel="Load older group resources"
                  accessibilityState={{
                    busy: resourcesLoadingMore,
                    disabled: resourcesLoadingMore,
                  }}
                  disabled={resourcesLoadingMore}
                  onPress={() => void loadOlderResources()}
                  style={[
                    styles.loadOlderResources,
                    { borderColor: colors.border },
                  ]}
                >
                  {resourcesLoadingMore ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : (
                    <Text
                      style={[
                        styles.loadOlderResourcesText,
                        { color: colors.accent },
                      ]}
                    >
                      Load older resources
                    </Text>
                  )}
                </AnimatedPressable>
              )}
              {!!resourceError && (
                <View
                  style={[
                    styles.resourceErrorRow,
                    { backgroundColor: `${colors.error}10` },
                  ]}
                >
                  <Text
                    style={[styles.resourceErrorText, { color: colors.error }]}
                  >
                    {resourceError}
                  </Text>
                  <AnimatedPressable
                    accessibilityRole="button"
                    accessibilityLabel="Retry loading group resources"
                    onPress={() => void load()}
                    style={[
                      styles.resourceRetry,
                      { borderColor: colors.error },
                    ]}
                  >
                    <Text
                      style={[
                        styles.resourceRetryText,
                        { color: colors.error },
                      ]}
                    >
                      Retry
                    </Text>
                  </AnimatedPressable>
                </View>
              )}
            </Section>
          )}

          {activeTab === "about" && (isOwner || isAdmin) && (
            <Section title={t("community:about.adminTools")} icon={ShieldCheck}>
              <View style={[styles.routeList, { borderColor: colors.border }]}>
                <RouteRow
                  testID="group-about-requests"
                  icon={UserCheck}
                  title={t("community:screens.requestsTitle")}
                  body={t("community:about.requestsBody")}
                  onPress={() =>
                    router.push(`/discussions/${group.id}/requests` as never)
                  }
                />
                {isOwner && (
                  <>
                    <View
                      style={[
                        styles.divider,
                        { backgroundColor: colors.border },
                      ]}
                    />
                    <RouteRow
                      testID="group-about-settings"
                      icon={Settings}
                      title={t("community:screens.settingsTitle")}
                      body={t("community:about.settingsBody")}
                      onPress={() =>
                        router.push(
                          `/discussions/${group.id}/settings` as never,
                        )
                      }
                    />
                  </>
                )}
              </View>
            </Section>
          )}
        </ScrollView>
      )}

      <RoleConfirmation
        pending={pendingRole}
        busy={changingUserId !== null}
        onCancel={() => setPendingRole(null)}
        onConfirm={() => void confirmRoleChange()}
      />
      <OpportunityDisclosure
        visible={disclosureOpen}
        creatorName={creatorName}
        opportunityTitle={opportunity?.title ?? ""}
        onCancel={() => setDisclosureOpen(false)}
        onContinue={openOpportunity}
      />
    </SafeAreaView>
  );
}

function GroupHero({
  group,
  membership,
}: {
  group: CommunityGroup;
  membership: CommunityGroupMember | null;
}) {
  const { t } = useTranslation("community");
  const { colors } = useTheme();
  return (
    <View style={styles.heroBlock}>
      <View style={styles.hero}>
        <GroupAvatar
          testID="group-about-avatar"
          resourceUrl={group.coverImageResourceUrl}
          emoji={group.coverEmoji}
          size={72}
          radius={20}
          style={[styles.groupMark, { borderColor: colors.border }]}
        />
        <View style={styles.heroCopy}>
          <Text style={[styles.groupName, { color: colors.foreground }]}>
            {group.name}
          </Text>
          <Text style={[styles.heroMembers, { color: colors.textSecondary }]}>
            {group.memberCount} {group.memberCount === 1 ? "member" : "members"}
          </Text>
          <View style={styles.badges}>
            <Pill
              icon={group.visibility === "private" ? LockKeyhole : Users}
              label={t(`visibility.${group.visibility}`)}
            />
            {!!membership?.role && (
              <Pill icon={ShieldCheck} label={roleLabel(membership.role, t)} />
            )}
          </View>
        </View>
      </View>
      <Text style={[styles.description, { color: colors.textSecondary }]}>
        {group.description || t("about.noDescription")}
      </Text>
    </View>
  );
}

function GuidelineRow({ number, label }: { number: number; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.guidelineRow}>
      <View style={[styles.guidelineNumber, { backgroundColor: colors.muted }]}>
        <Text
          style={[styles.guidelineNumberText, { color: colors.foreground }]}
        >
          {number}
        </Text>
      </View>
      <Text style={[styles.guidelineLabel, { color: colors.foreground }]}>
        {label}
      </Text>
    </View>
  );
}

function LinkedOpportunity({
  group,
  opportunity,
  unavailable,
  creatorName,
  onOpen,
}: {
  group: CommunityGroup;
  opportunity: Opportunity | null;
  unavailable: boolean;
  creatorName: string;
  onOpen: () => void;
}) {
  const { t } = useTranslation("community");
  const { colors } = useTheme();
  const deadline = getDeadlineBadge(opportunity?.deadline ?? group.expiresAt);
  const statusColor = urgencyColor(deadline.level);
  const isClosed = deadline.level === "expired";

  return (
    <Section title={t("about.opportunityTitle")} icon={CalendarDays} prominent>
      {opportunity ? (
        <>
          <Text style={[styles.opportunityName, { color: colors.foreground }]}>
            {opportunity.title}
          </Text>
          <Text
            style={[styles.opportunityOrg, { color: colors.textSecondary }]}
          >
            {opportunity.organization}
          </Text>
          <View style={styles.opportunityFacts}>
            <View
              style={[styles.statusDot, { backgroundColor: statusColor }]}
            />
            <Text style={[styles.opportunityStatus, { color: statusColor }]}>
              {deadline.label}
            </Text>
            {!!deadline.date && (
              <Text
                style={[
                  styles.opportunityDate,
                  { color: colors.textSecondary },
                ]}
              >
                · {deadline.date}
              </Text>
            )}
          </View>
          <DisclosureNote creatorName={creatorName} />
          <AnimatedPressable
            testID="group-about-opportunity-action"
            accessibilityRole="button"
            accessibilityLabel={
              isClosed ? t("about.viewOpportunity") : t("about.viewApply")
            }
            onPress={onOpen}
            style={[styles.primaryButton, { backgroundColor: colors.accent }]}
          >
            <Text style={styles.primaryButtonText}>
              {isClosed ? t("about.viewOpportunity") : t("about.viewApply")}
            </Text>
            <ChevronRight size={19} color="#FFFFFF" />
          </AnimatedPressable>
        </>
      ) : (
        <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
          {unavailable
            ? t("about.opportunityUnavailable")
            : t("about.opportunityLoading")}
        </Text>
      )}
    </Section>
  );
}

function DisclosureNote({ creatorName }: { creatorName: string }) {
  const { t } = useTranslation("community");
  const { colors } = useTheme();
  return (
    <View style={[styles.disclosureNote, { backgroundColor: colors.muted }]}>
      <Info size={18} color={colors.accent} />
      <Text style={[styles.disclosureText, { color: colors.textSecondary }]}>
        {t("about.disclosure", { owner: creatorName })}
      </Text>
    </View>
  );
}

function MemberRow({
  row,
  creator,
  canChange,
  canMessage,
  busy,
  onChange,
  onMessage,
}: {
  row: CommunityMemberSummary;
  creator: boolean;
  canChange: boolean;
  canMessage: boolean;
  busy: boolean;
  onChange: () => void;
  onMessage: () => void;
}) {
  const { t } = useTranslation("community");
  const { colors } = useTheme();
  const name = row.profile.displayName;
  const action =
    row.membership.role === "mod"
      ? t("about.removeAdmin")
      : t("about.makeAdmin");
  return (
    <View style={styles.memberRow}>
      {row.profile.avatarUrl ? (
        <Image source={{ uri: row.profile.avatarUrl }} style={styles.avatar} />
      ) : (
        <View
          style={[
            styles.avatar,
            styles.avatarFallback,
            { backgroundColor: `${colors.accent}18` },
          ]}
        >
          <Text style={[styles.avatarInitial, { color: colors.accent }]}>
            {initials(name)}
          </Text>
        </View>
      )}
      <View style={styles.flex}>
        <Text
          style={[styles.memberName, { color: colors.foreground }]}
          numberOfLines={1}
        >
          {name}
        </Text>
        <Text style={[styles.memberRole, { color: colors.textSecondary }]}>
          {creator ? t("about.creator") : roleLabel(row.membership.role, t)}
        </Text>
      </View>
      {(canMessage || canChange) && (
        <View style={styles.memberActions}>
          {canMessage && (
            <AnimatedPressable
              testID={`group-member-message-${row.membership.userId}`}
              accessibilityRole="button"
              accessibilityLabel={`Message ${name}`}
              onPress={onMessage}
              style={[
                styles.messageAction,
                { backgroundColor: `${colors.accent}16` },
              ]}
            >
              <MessageCircle size={15} color={colors.accent} />
              <Text
                style={[styles.messageActionText, { color: colors.accent }]}
              >
                Message
              </Text>
            </AnimatedPressable>
          )}
          {canChange && (
            <AnimatedPressable
              testID={`group-member-role-${row.membership.userId}`}
              accessibilityRole="button"
              accessibilityLabel={`${action}: ${name}`}
              accessibilityState={{ busy, disabled: busy }}
              disabled={busy}
              onPress={onChange}
              style={[styles.roleAction, { borderColor: colors.border }]}
            >
              {busy ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Text style={[styles.roleActionText, { color: colors.accent }]}>
                  {action}
                </Text>
              )}
            </AnimatedPressable>
          )}
        </View>
      )}
    </View>
  );
}

function ResourceRow({
  resource,
  opening,
  onOpen,
}: {
  resource: CommunityGroupResource;
  opening: boolean;
  onOpen: () => void;
}) {
  const { colors } = useTheme();
  const Icon = resource.kind === "image" ? ImageIcon : FileText;
  return (
    <AnimatedPressable
      testID={`group-resource-${resource.id}`}
      accessibilityRole="button"
      accessibilityLabel={`Open ${resource.kind === "image" ? "image" : "PDF"} ${resource.attachment.name}`}
      accessibilityHint="Requests a private download link before opening"
      accessibilityState={{ busy: opening, disabled: opening }}
      disabled={opening}
      onPress={onOpen}
      style={styles.resourceRow}
    >
      <View
        style={[styles.resourceIcon, { backgroundColor: `${colors.accent}14` }]}
      >
        <Icon size={20} color={colors.accent} />
      </View>
      <View style={styles.flex}>
        <Text
          style={[styles.resourceName, { color: colors.foreground }]}
          numberOfLines={2}
        >
          {resource.attachment.name}
        </Text>
        <Text
          style={[styles.resourceMeta, { color: colors.textSecondary }]}
          numberOfLines={1}
        >
          {formatFileSize(resource.attachment.size)} ·{" "}
          {resource.sender.displayName} · {formatLongDate(resource.createdAt)}
        </Text>
      </View>
      {opening ? (
        <ActivityIndicator size="small" color={colors.accent} />
      ) : (
        <ChevronRight size={18} color={colors.textSecondary} />
      )}
    </AnimatedPressable>
  );
}

function RoleConfirmation({
  pending,
  busy,
  onCancel,
  onConfirm,
}: {
  pending: PendingRole | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation(["community", "common"]);
  const { colors } = useTheme();
  if (!pending) return null;
  const makingAdmin = pending.role === "mod";
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onCancel}>
      <View style={styles.modalBackdrop}>
        <View
          style={[
            styles.modalCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <ShieldCheck size={28} color={colors.accent} />
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>
            {makingAdmin
              ? t("community:about.makeAdminTitle")
              : t("community:about.removeAdminTitle")}
          </Text>
          <Text style={[styles.modalBody, { color: colors.textSecondary }]}>
            {makingAdmin
              ? t("community:about.makeAdminBody", {
                  name: pending.member.profile.displayName,
                })
              : t("community:about.removeAdminBody", {
                  name: pending.member.profile.displayName,
                })}
          </Text>
          <View style={styles.modalActions}>
            <SecondaryButton
              label={t("common:actions.cancel")}
              disabled={busy}
              onPress={onCancel}
            />
            <PrimaryButton
              label={
                makingAdmin
                  ? t("community:about.makeAdmin")
                  : t("community:about.removeAdmin")
              }
              busy={busy}
              onPress={onConfirm}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function OpportunityDisclosure({
  visible,
  creatorName,
  opportunityTitle,
  onCancel,
  onContinue,
}: {
  visible: boolean;
  creatorName: string;
  opportunityTitle: string;
  onCancel: () => void;
  onContinue: () => void;
}) {
  const { t } = useTranslation(["community", "common"]);
  const { colors } = useTheme();
  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.modalBackdrop}>
        <View
          style={[
            styles.modalCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Info size={28} color={colors.accent} />
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>
            {t("community:about.beforeYouContinue")}
          </Text>
          <Text style={[styles.modalBody, { color: colors.textSecondary }]}>
            {t("community:about.disclosureModal", {
              owner: creatorName,
              opportunity: opportunityTitle,
            })}
          </Text>
          <View style={styles.modalActions}>
            <SecondaryButton
              label={t("common:actions.cancel")}
              disabled={false}
              onPress={onCancel}
            />
            <PrimaryButton
              label={t("community:about.continueToOpportunity")}
              busy={false}
              onPress={onContinue}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Section({
  title,
  icon: Icon,
  prominent = false,
  children,
}: {
  title: string;
  icon: typeof Users;
  prominent?: boolean;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.section,
        {
          backgroundColor: colors.card,
          borderColor: prominent ? `${colors.accent}70` : colors.border,
        },
      ]}
    >
      <View style={styles.sectionHeading}>
        <Icon
          size={19}
          color={prominent ? colors.accent : colors.textSecondary}
        />
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

function Metric({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Users;
  value: string;
  label: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.metric,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <Icon size={17} color={colors.accent} />
      <Text
        style={[styles.metricValue, { color: colors.foreground }]}
        numberOfLines={1}
      >
        {value}
      </Text>
      <Text
        style={[styles.metricLabel, { color: colors.textSecondary }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

function Pill({ icon: Icon, label }: { icon: typeof Users; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.pill, { backgroundColor: colors.muted }]}>
      <Icon size={13} color={colors.textSecondary} />
      <Text style={[styles.pillText, { color: colors.textSecondary }]}>
        {label}
      </Text>
    </View>
  );
}

function RouteRow({
  testID,
  icon: Icon,
  title,
  body,
  onPress,
}: {
  testID: string;
  icon: typeof Users;
  title: string;
  body: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <AnimatedPressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={styles.routeRow}
    >
      <View
        style={[styles.routeIcon, { backgroundColor: `${colors.accent}14` }]}
      >
        <Icon size={20} color={colors.accent} />
      </View>
      <View style={styles.flex}>
        <Text style={[styles.routeTitle, { color: colors.foreground }]}>
          {title}
        </Text>
        <Text
          style={[styles.routeBody, { color: colors.textSecondary }]}
          numberOfLines={2}
        >
          {body}
        </Text>
      </View>
      <ChevronRight size={19} color={colors.textSecondary} />
    </AnimatedPressable>
  );
}

function PrimaryButton({
  label,
  busy,
  onPress,
}: {
  label: string;
  busy: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy, disabled: busy }}
      disabled={busy}
      onPress={onPress}
      style={[styles.modalButton, { backgroundColor: colors.accent }]}
    >
      {busy ? (
        <ActivityIndicator size="small" color="#FFFFFF" />
      ) : (
        <Text style={styles.primaryButtonText}>{label}</Text>
      )}
    </AnimatedPressable>
  );
}

function SecondaryButton({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.modalButton,
        { borderColor: colors.border, borderWidth: 1 },
      ]}
    >
      <Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

function roleLabel(role: MemberRole, t: (key: string) => string): string {
  if (role === "owner") return t("about.owner");
  if (role === "mod") return t("about.admin");
  return t("about.member");
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "E"
  );
}

function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });
}

function formatLongDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "File";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 18, paddingBottom: 52, gap: 14 },
  loading: { padding: 16, gap: 14 },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    gap: 12,
  },
  stateTitle: { fontSize: 20, fontWeight: "800", textAlign: "center" },
  stateBody: { fontSize: 14, lineHeight: 21, textAlign: "center" },
  heroBlock: { paddingVertical: 18, gap: 12 },
  hero: { flexDirection: "row", alignItems: "center", gap: 14 },
  heroCopy: { flex: 1, minWidth: 0, gap: 3 },
  groupMark: { borderWidth: 1 },
  groupName: {
    fontSize: 21,
    lineHeight: 26,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  heroMembers: { fontSize: 13, lineHeight: 18, fontWeight: "700" },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 3,
    gap: 8,
  },
  pill: {
    minHeight: 28,
    borderRadius: 999,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  pillText: { fontSize: 12, fontWeight: "700" },
  description: {
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 520,
  },
  metrics: { flexDirection: "row", gap: 8 },
  metric: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 8,
    paddingVertical: 11,
    alignItems: "center",
    gap: 4,
  },
  metricValue: { fontSize: 14, fontWeight: "800" },
  metricLabel: { fontSize: 11, fontWeight: "600" },
  section: {
    borderWidth: 1,
    borderRadius: 20,
    borderCurve: "continuous",
    padding: 16,
    gap: 12,
  },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: { fontSize: 17, fontWeight: "800", letterSpacing: -0.2 },
  sectionBody: { fontSize: 14, lineHeight: 21 },
  guidelineRow: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  guidelineNumber: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  guidelineNumberText: { fontSize: 13, fontWeight: "900" },
  guidelineLabel: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: "600" },
  opportunityName: { fontSize: 18, lineHeight: 24, fontWeight: "800" },
  opportunityOrg: { marginTop: -7, fontSize: 13, lineHeight: 18 },
  opportunityFacts: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  opportunityStatus: { fontSize: 13, fontWeight: "800" },
  opportunityDate: { fontSize: 13 },
  disclosureNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    borderRadius: 14,
    padding: 12,
  },
  disclosureText: { flex: 1, fontSize: 12, lineHeight: 18 },
  primaryButton: {
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
  },
  roster: { borderWidth: 1, borderRadius: 16, overflow: "hidden" },
  memberRow: {
    minHeight: 68,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatar: { width: 44, height: 44, borderRadius: 15 },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontSize: 14, fontWeight: "800" },
  memberName: { fontSize: 14, fontWeight: "800" },
  memberRole: { marginTop: 3, fontSize: 12 },
  roleAction: {
    minHeight: 36,
    maxWidth: 112,
    borderWidth: 1,
    borderRadius: 11,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  roleActionText: { fontSize: 11, fontWeight: "800", textAlign: "center" },
  memberActions: { alignItems: "flex-end", gap: 6 },
  messageAction: {
    minHeight: 36,
    borderRadius: 11,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  messageActionText: { fontSize: 11, fontWeight: "800" },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 66 },
  inlineError: { borderWidth: 1, borderRadius: 12, padding: 10 },
  inlineErrorText: { fontSize: 12, lineHeight: 18 },
  footnote: { fontSize: 12, lineHeight: 18 },
  resourceEmpty: {
    borderRadius: 15,
    padding: 13,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
  },
  resourceLoading: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  resourceList: { borderWidth: 1, borderRadius: 16, overflow: "hidden" },
  resourceRow: {
    minHeight: 70,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  resourceIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  resourceName: { fontSize: 14, lineHeight: 19, fontWeight: "800" },
  resourceMeta: { marginTop: 3, fontSize: 11, lineHeight: 16 },
  resourceErrorRow: {
    borderRadius: 13,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  resourceErrorText: { flex: 1, fontSize: 12, lineHeight: 17 },
  resourceRetry: {
    minHeight: 34,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  resourceRetryText: { fontSize: 12, fontWeight: "800" },
  loadOlderResources: {
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  loadOlderResourcesText: { fontSize: 13, fontWeight: "800" },
  resourceTitle: { fontSize: 14, fontWeight: "800" },
  resourceBody: { marginTop: 3, fontSize: 12, lineHeight: 18 },
  routeList: { borderWidth: 1, borderRadius: 16, overflow: "hidden" },
  routeRow: {
    minHeight: 68,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  routeIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  routeTitle: { fontSize: 14, fontWeight: "800" },
  routeBody: { marginTop: 2, fontSize: 12, lineHeight: 17 },
  flex: { flex: 1 },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.58)",
    padding: 14,
  },
  modalCard: {
    borderWidth: 1,
    borderRadius: 24,
    borderCurve: "continuous",
    padding: 20,
    gap: 12,
  },
  modalTitle: { fontSize: 20, lineHeight: 25, fontWeight: "800" },
  modalBody: { fontSize: 14, lineHeight: 21 },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  modalButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 13,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: { fontSize: 14, fontWeight: "800" },
});
