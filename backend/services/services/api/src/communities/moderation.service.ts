import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { toDatabaseUserId } from "../common/user-id";
import {
  communityGroupMembers,
  communityGroupMessages,
  communityGroups,
  communityReports,
  userBlocks,
  type CommunityGroup,
  type CommunityGroupMember,
  type CommunityGroupMessage,
} from "../db/schema";
import { canReadGroup } from "./community-authz";
// One fallback name for the whole feature: the "Blocked" screen and the chat
// bubble show the same people, and calling them different things is how a user
// ends up unable to tell which member they blocked.
import { UNNAMED_MEMBER } from "./messages.service";
import { NotificationsService } from "../notifications/notifications.service";
import type { BroadcastNotificationDto } from "../notifications/dto/notification.dto";
import type { ReportDto } from "./dto/community.dto";

export type { CommunityGroup, CommunityGroupMember, CommunityGroupMessage };
export type CommunityReport = typeof communityReports.$inferSelect;

/**
 * The report row, decided in full by the service — including `status: 'open'`,
 * which is what puts it in front of the owner. The store applies it; it derives
 * nothing.
 */
export type NewReportRow = {
  targetType: string;
  targetId: string;
  reporterId: string;
  reason: string;
  status: string;
};

/**
 * A block, in RAW Clerk subjects on both sides.
 *
 * `user_blocks` predates this feature and its two columns are `uuid`, not
 * `text` — the derived-uuid namespace the roadmap tables use. The translation
 * therefore has to happen somewhere, and it happens in the ADAPTER, which is
 * the thing that knows the column types, rather than in the service, which
 * stays in raw-Clerk space like the rest of Group Discussions. See
 * `DrizzleModerationStore.insertBlock`.
 */
export type NewBlockRow = {
  blockerId: string;
  blockedId: string;
};

/**
 * One stored block, as the adapter reads it back — RAW COLUMN VALUES, no
 * decisions. The service turns this into what the "Blocked" screen renders.
 *
 * `blockedDatabaseId` is the `uuid` actually stored. `profileUserId` is
 * `profiles.user_id` when a profile matched, and in practice that IS the raw
 * Clerk subject — which is what makes the row actionable: the client filters
 * messages by `message.userId`, so a block it cannot map back to a subject is a
 * block it cannot apply. `toDatabaseUserId` is one-way, so the profiles join is
 * the only way back.
 */
export type BlockedUserRow = {
  blockedDatabaseId: string;
  profileUserId: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  createdAt: Date | null;
};

/**
 * A blocked person as the client renders and undoes them.
 *
 * Name and avatar and nothing else — `profiles` also holds email, country and
 * school, and none of it is selected. `userId` is the blocked person's own
 * subject, which the blocker already had (they tapped their message to block
 * them) and needs again to unblock.
 */
export type BlockedUser = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  blockedAt: Date | null;
  /**
   * False when the stored uuid could not be mapped back to a profile, so
   * `userId` is that uuid rather than a subject. The client can still unblock
   * it (the route re-derives), but it cannot match it against a message author.
   */
  resolved: boolean;
};

/**
 * The slice of `NotificationsService` this service uses. Structural on purpose
 * so the spec can pass `{ broadcast: jest.fn() }` without dragging Expo, Brevo
 * and the cron decorators into a unit test.
 */
export interface OwnerNotifier {
  broadcast(actorId: string, dto: BroadcastNotificationDto): Promise<unknown>;
}

/** The persistence boundary; every method is a dumb applier. */
export interface ModerationStore {
  findGroup(groupId: string): Promise<CommunityGroup | null>;
  findMembership(
    groupId: string,
    userId: string,
  ): Promise<CommunityGroupMember | null>;
  findMessage(messageId: string): Promise<CommunityGroupMessage | null>;
  /** An existing un-actioned report by this person about this target. */
  findOpenReport(
    reporterId: string,
    targetType: string,
    targetId: string,
  ): Promise<CommunityReport | null>;
  insertReport(row: NewReportRow): Promise<CommunityReport>;
  insertBlock(row: NewBlockRow): Promise<void>;
  /** Everyone this person has blocked, newest first, with names to render. */
  listBlocks(blockerId: string): Promise<BlockedUserRow[]>;
  /** True when a row was actually removed; false when there was none. */
  deleteBlock(row: NewBlockRow): Promise<boolean>;
}

/** Token so the module can swap the store without touching the service. */
export const MODERATION_STORE = Symbol("MODERATION_STORE");

// ---------------------------------------------------------------------------
// Drizzle-backed store
// ---------------------------------------------------------------------------

export class DrizzleModerationStore implements ModerationStore {
  async findGroup(groupId: string): Promise<CommunityGroup | null> {
    const [row] = await db
      .select()
      .from(communityGroups)
      .where(eq(communityGroups.id, groupId))
      .limit(1);
    return row ?? null;
  }

  async findMembership(
    groupId: string,
    userId: string,
  ): Promise<CommunityGroupMember | null> {
    const [row] = await db
      .select()
      .from(communityGroupMembers)
      .where(
        and(
          eq(communityGroupMembers.groupId, groupId),
          eq(communityGroupMembers.userId, userId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async findMessage(messageId: string): Promise<CommunityGroupMessage | null> {
    const [row] = await db
      .select()
      .from(communityGroupMessages)
      .where(eq(communityGroupMessages.id, messageId))
      .limit(1);
    return row ?? null;
  }

  async findOpenReport(
    reporterId: string,
    targetType: string,
    targetId: string,
  ): Promise<CommunityReport | null> {
    const [row] = await db
      .select()
      .from(communityReports)
      .where(
        and(
          eq(communityReports.reporterId, reporterId),
          eq(communityReports.targetType, targetType),
          eq(communityReports.targetId, targetId),
          eq(communityReports.status, "open"),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async insertReport(row: NewReportRow): Promise<CommunityReport> {
    const [stored] = await db.insert(communityReports).values(row).returning();
    return stored;
  }

  /**
   * THE ONE ID TRANSLATION IN THIS FEATURE.
   *
   * `community_*` columns are `text` and hold the raw Clerk subject; the
   * pre-existing `user_blocks` table is `uuid` on both sides and is already
   * written by `RoadmapsService` through `toDatabaseUserId`. Writing the raw
   * subject here would not merely be inconsistent, it would fail — Postgres
   * answers `user_2abc…` with 22P02 on a `uuid` column — and a second,
   * community-only block table would mean a person blocked in a group still
   * appearing on their roadmap comments.
   *
   * `toDatabaseUserId` is deterministic, so the two writers agree. It is called
   * HERE, in the adapter that knows the column type, and nowhere in the
   * service.
   */
  async insertBlock(row: NewBlockRow): Promise<void> {
    await db
      .insert(userBlocks)
      .values({
        blockerUserId: toDatabaseUserId(row.blockerId),
        blockedUserId: toDatabaseUserId(row.blockedId),
      })
      .onConflictDoNothing({
        target: [userBlocks.blockerUserId, userBlocks.blockedUserId],
      });
  }

  /**
   * Reads the block list back and maps each stored uuid to the subject the
   * client knows the person by.
   *
   * `toDatabaseUserId` IS ONE-WAY, so there is no arithmetic that recovers the
   * subject from the uuid — the only route back is a join, and the join is
   * dual-keyed for the same reason the author lookup is: `profiles.user_id` is
   * declared `uuid` in `schema.ts` but is `text` in the live database, holding
   * the raw subject for most rows and the derived uuid for the rest.
   *
   * Only `full_name` and `avatar_url` are selected. A `select *` here would put
   * a blocked person's email in front of the person who blocked them.
   */
  async listBlocks(blockerId: string): Promise<BlockedUserRow[]> {
    const result = await db.execute(sql`
      select
        ub.blocked_user_id::text           as blocked_database_id,
        max(p.user_id::text)               as profile_user_id,
        max(p.full_name)                   as full_name,
        max(p.avatar_url)                  as avatar_url,
        max(ub.created_at)                 as created_at
      from public.user_blocks ub
      left join public.profiles p
        on p.user_id::text = ub.blocked_user_id::text
        or public.clerk_id_to_uuid(p.user_id::text) = ub.blocked_user_id::text
      where ub.blocker_user_id = ${toDatabaseUserId(blockerId)}::uuid
      group by ub.blocked_user_id
      order by max(ub.created_at) desc nulls last
    `);

    return extractRows<{
      blocked_database_id: string;
      profile_user_id: string | null;
      full_name: string | null;
      avatar_url: string | null;
      created_at: string | Date | null;
    }>(result).map((row) => ({
      blockedDatabaseId: row.blocked_database_id,
      profileUserId: row.profile_user_id ?? null,
      fullName: row.full_name ?? null,
      avatarUrl: row.avatar_url ?? null,
      createdAt: row.created_at ? new Date(row.created_at) : null,
    }));
  }

  /**
   * The undo. Same id translation as `insertBlock`, for the same reason and in
   * the same place — an unblock that derived the uuid differently from the
   * block would delete nothing and report success.
   */
  async deleteBlock(row: NewBlockRow): Promise<boolean> {
    const removed = await db
      .delete(userBlocks)
      .where(
        and(
          eq(userBlocks.blockerUserId, toDatabaseUserId(row.blockerId)),
          eq(userBlocks.blockedUserId, toDatabaseUserId(row.blockedId)),
        ),
      )
      .returning({ id: userBlocks.id });
    return removed.length > 0;
  }
}

/** `db.execute` is a pg `QueryResult` on some paths and a bare array on others. */
function extractRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    return (result as { rows?: T[] }).rows ?? [];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Reports and blocks.
 *
 * THERE IS NO ADMIN CONSOLE IN THIS RELEASE, so the group's owner IS the
 * moderator: every report notifies them. A report that lands in a table nobody
 * opens is worse than no report button at all, because the button implies a
 * response that never comes.
 */
@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);
  private readonly store: ModerationStore;
  private readonly notifier: OwnerNotifier;

  constructor(
    @Optional() @Inject(MODERATION_STORE) store?: ModerationStore,
    @Optional() @Inject(NotificationsService) notifier?: OwnerNotifier,
  ) {
    this.store = store ?? new DrizzleModerationStore();
    // Falls back to a real instance rather than to a silent no-op: a module
    // that forgot to import NotificationsModule would otherwise ship a report
    // button that quietly notifies nobody, which is the exact failure this
    // service exists to prevent.
    this.notifier = notifier ?? new NotificationsService();
  }

  async report(userId: string, dto: ReportDto): Promise<CommunityReport> {
    const reporterId = this.requireUserId(userId);
    if (dto?.targetType !== "message" && dto?.targetType !== "group") {
      throw new BadRequestException("You can report a message or a group.");
    }
    this.assertUuid(dto.targetId, dto.targetType);
    const reason = (dto.reason || "").trim();
    if (!reason) {
      throw new BadRequestException(
        "Tell us what's wrong so we can act on it.",
      );
    }

    // Resolve the group the report belongs to. It is what the owner is notified
    // through, and it is what the reporter has to be able to see: without this,
    // anyone holding a leaked uuid could file reports against a private group
    // they are refused any other view of.
    const { group } = await this.resolveTarget(dto.targetType, dto.targetId);
    const membership = await this.store.findMembership(group.id, reporterId);
    if (!canReadGroup(group, membership)) {
      throw new ForbiddenException(
        "This group is private. Ask an owner for an invite.",
      );
    }

    // The same person tapping report twice is one concern, not two. Returning
    // the existing row keeps the queue honest and, more importantly, stops a
    // second notification — an owner who gets pinged five times for one message
    // learns to ignore the channel.
    const existing = await this.store.findOpenReport(
      reporterId,
      dto.targetType,
      dto.targetId,
    );
    if (existing) return existing;

    const report = await this.store.insertReport({
      targetType: dto.targetType,
      targetId: dto.targetId,
      reporterId,
      reason,
      // `open` is the service's decision, not a column default: it is what puts
      // the row in the owner's queue, so it is asserted in the spec.
      status: "open",
    });

    await this.notifyOwner(group, report);
    return report;
  }

  /**
   * Stop seeing someone. Writes the EXISTING `user_blocks` table so a block
   * made in a group also applies to their roadmap comments — one block list,
   * not one per surface.
   */
  async block(
    userId: string,
    targetUserId: string,
  ): Promise<{ success: true; blockedUserId: string }> {
    const blockerId = this.requireUserId(userId);
    const blockedId = (targetUserId || "").trim();
    if (!blockedId) {
      throw new BadRequestException("Tell us who to block.");
    }
    if (blockerId === blockedId) {
      throw new BadRequestException("You can't block yourself.");
    }

    await this.store.insertBlock({ blockerId, blockedId });
    return { success: true, blockedUserId: blockedId };
  }

  /**
   * UNBLOCKING IS SUPPORTED, deliberately.
   *
   * Block sits in a row-level action sheet next to Report and Delete, on a
   * touch target the width of a message bubble. People mis-tap it. A block with
   * no undo turns one mis-tap into a permanently invisible member — and because
   * the same list backs roadmap comments, it would silently be invisible there
   * too. Refusing the undo would also make the moderation kit worse at its job:
   * a member who is afraid of blocking irreversibly is a member who does not
   * block at all.
   *
   * It is NOT the undo for a ban, which is a moderator's decision about
   * somebody else and stays one-way; this only ever unwinds the caller's own
   * choice about what they personally see.
   */
  async unblock(
    userId: string,
    targetUserId: string,
  ): Promise<{ success: true; blockedUserId: string; wasBlocked: boolean }> {
    const blockerId = this.requireUserId(userId);
    const blockedId = (targetUserId || "").trim();
    if (!blockedId) {
      throw new BadRequestException("Tell us who to unblock.");
    }

    // Unblocking someone who was never blocked is not an error — it is the
    // state the caller asked for. Two devices racing the same undo would
    // otherwise show one of them a failure for a thing that worked.
    const wasBlocked = await this.store.deleteBlock({ blockerId, blockedId });
    return { success: true, blockedUserId: blockedId, wasBlocked };
  }

  /**
   * The blocker's own block list, named so it can be rendered and undone.
   *
   * Only ever the CALLER's list: `user_blocks` is symmetric in neither
   * direction, and there is no route that shows one person who has blocked
   * them — that would be a harassment vector, not a feature.
   */
  async listBlocks(userId: string): Promise<BlockedUser[]> {
    const blockerId = this.requireUserId(userId);
    const rows = await this.store.listBlocks(blockerId);
    return rows.map((row) => this.toBlockedUser(row));
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Decided HERE, not in the adapter: which id the client is handed back, and
   * what an unnamed person is called. The store returns the columns; this turns
   * them into the row a "Blocked" screen renders.
   */
  private toBlockedUser(row: BlockedUserRow): BlockedUser {
    const profileUserId = (row.profileUserId || "").trim();
    const displayName = (row.fullName || "").trim();
    const avatarUrl = (row.avatarUrl || "").trim();
    return {
      // The subject when we could map back to one — that is the value the
      // client compares against `message.userId`. The stored uuid otherwise, so
      // the row is at least visible and undoable rather than dropped.
      userId: profileUserId || row.blockedDatabaseId,
      displayName: displayName || UNNAMED_MEMBER,
      avatarUrl: avatarUrl || null,
      blockedAt: row.createdAt ?? null,
      resolved: Boolean(profileUserId),
    };
  }

  private async resolveTarget(
    targetType: "message" | "group",
    targetId: string,
  ): Promise<{ group: CommunityGroup }> {
    if (targetType === "group") {
      const group = await this.store.findGroup(targetId);
      if (!group) throw new NotFoundException("That group was not found.");
      return { group };
    }
    const message = await this.store.findMessage(targetId);
    if (!message) throw new NotFoundException("That message was not found.");
    const group = await this.store.findGroup(message.groupId);
    if (!group) throw new NotFoundException("That group was not found.");
    return { group };
  }

  /**
   * Best-effort, and deliberately so: the report row is already committed, and
   * throwing here would lose a filed report because a push provider was down.
   * The failure is logged rather than swallowed silently.
   *
   * THE REPORTER IS NEVER NAMED — not in the title, not in the body, not in the
   * metadata. An owner who can see who reported them is an owner who can
   * retaliate, and a report button people are afraid to press is decoration.
   */
  private async notifyOwner(
    group: CommunityGroup,
    report: CommunityReport,
  ): Promise<void> {
    // An owner reporting inside their own group already knows; the notification
    // would only be their own tap echoed back at them.
    if (group.ownerId === report.reporterId) return;

    const what = report.targetType === "group" ? "your group" : "a message";
    try {
      await this.notifier.broadcast(group.ownerId, {
        title: `Someone reported ${what} in ${group.name}`,
        // The reason is the reporter's own words and is what makes the report
        // actionable; it is capped at 280 characters by ReportSchema.
        body: `"${report.reason}" — open the group to review it.`,
        // MUST stay inside notifications_kind_check's fixed list, or the insert
        // raises 23514 and the reporter sees a 500 for somebody else's problem.
        kind: "system",
        severity: "warning",
        audience: "specific",
        // Raw Clerk subject: NotificationsService.resolveRecipients derives the
        // uuid the `notifications` table needs, so the translation stays in one
        // place there rather than being duplicated here.
        targetUserIds: [group.ownerId],
        metadata: {
          reportId: report.id,
          groupId: group.id,
          targetType: report.targetType,
          targetId: report.targetId,
        },
        dedupeKey: `community-report:${report.id}`,
        channels: { inApp: true, push: true, email: false },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to notify owner of report ${report.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private requireUserId(userId: string): string {
    // Raw Clerk subject, never toDatabaseUserId: community_reports.reporter_id
    // is `text`. The one uuid-keyed table this service touches, `user_blocks`,
    // is translated inside its adapter and nowhere else.
    const trimmed = (userId || "").trim();
    if (!trimmed) throw new BadRequestException("You need to be signed in.");
    return trimmed;
  }

  private assertUuid(value: string, label: string): void {
    if (!UUID_PATTERN.test(value)) {
      throw new BadRequestException(`That ${label} link isn't valid.`);
    }
  }
}
