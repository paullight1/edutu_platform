import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { and, eq } from "drizzle-orm";
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

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

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
