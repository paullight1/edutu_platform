import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import { AuditService } from "../common/audit";
import { db } from "../db";
import {
  communityGroupMessages,
  communityGroups,
  communityReports,
} from "../db/schema";
import type {
  AdminCommunityReport,
  CommunityReportStatus,
} from "./community-safety.dto";

type StoredReport = typeof communityReports.$inferSelect;

export interface AdminCommunitySafetyStore {
  listReports(
    status: CommunityReportStatus | "all",
    limit: number,
  ): Promise<AdminCommunityReport[]>;
  findReport(id: string): Promise<StoredReport | null>;
  findMessageGroupId(messageId: string): Promise<string | null>;
  setReportStatus(
    id: string,
    status: CommunityReportStatus,
  ): Promise<StoredReport | null>;
  removeMessage(id: string, actorId: string): Promise<boolean>;
  archiveGroup(id: string): Promise<boolean>;
}

export const ADMIN_COMMUNITY_SAFETY_STORE = Symbol(
  "ADMIN_COMMUNITY_SAFETY_STORE",
);

function toIso(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function extractRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: unknown } | null)?.rows;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

@Injectable()
export class DrizzleAdminCommunitySafetyStore
  implements AdminCommunitySafetyStore
{
  async listReports(
    status: CommunityReportStatus | "all",
    limit: number,
  ): Promise<AdminCommunityReport[]> {
    const filter = status === "all" ? sql`` : sql`and r.status = ${status}`;
    const result = await db.execute(sql`
      select
        r.id::text as id,
        r.target_type as target_type,
        r.target_id::text as target_id,
        r.reporter_id as reporter_id,
        r.reason,
        r.status,
        r.created_at as created_at,
        coalesce(g_target.id, g_message.id)::text as group_id,
        coalesce(g_target.name, g_message.name) as group_name,
        coalesce(g_target.visibility, g_message.visibility) as group_visibility,
        coalesce(g_target.archived_at, g_message.archived_at) as group_archived_at,
        m.id::text as message_id,
        m.user_id as message_user_id,
        m.body as message_body,
        m.deleted_at as message_deleted_at
      from community_reports r
      left join community_group_messages m
        on r.target_type = 'message' and m.id = r.target_id
      left join community_groups g_message
        on m.group_id = g_message.id
      left join community_groups g_target
        on r.target_type = 'group' and g_target.id = r.target_id
      where 1 = 1 ${filter}
      order by r.created_at desc, r.id desc
      limit ${limit}
    `);

    return extractRows<{
      id: string;
      target_type: string;
      target_id: string;
      reporter_id: string;
      reason: string;
      status: string;
      created_at: string | Date;
      group_id: string | null;
      group_name: string | null;
      group_visibility: string | null;
      group_archived_at: string | Date | null;
      message_id: string | null;
      message_user_id: string | null;
      message_body: string | null;
      message_deleted_at: string | Date | null;
    }>(result).map((row) => ({
      id: row.id,
      targetType: row.target_type === "group" ? "group" : "message",
      targetId: row.target_id,
      reporterId: row.reporter_id,
      reason: row.reason,
      status: row.status as CommunityReportStatus,
      createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
      group:
        row.group_id && row.group_name
          ? {
              id: row.group_id,
              name: row.group_name,
              visibility: row.group_visibility ?? "unknown",
              archivedAt: toIso(row.group_archived_at),
            }
          : null,
      message: row.message_id
        ? {
            id: row.message_id,
            userId: row.message_user_id ?? "unknown",
            body: row.message_body ?? "",
            deletedAt: toIso(row.message_deleted_at),
          }
        : null,
    }));
  }

  async findReport(id: string): Promise<StoredReport | null> {
    const [row] = await db
      .select()
      .from(communityReports)
      .where(eq(communityReports.id, id))
      .limit(1);
    return row ?? null;
  }

  async findMessageGroupId(messageId: string): Promise<string | null> {
    const [row] = await db
      .select({ groupId: communityGroupMessages.groupId })
      .from(communityGroupMessages)
      .where(eq(communityGroupMessages.id, messageId))
      .limit(1);
    return row?.groupId ?? null;
  }

  async setReportStatus(
    id: string,
    status: CommunityReportStatus,
  ): Promise<StoredReport | null> {
    const [row] = await db
      .update(communityReports)
      .set({ status })
      .where(eq(communityReports.id, id))
      .returning();
    return row ?? null;
  }

  async removeMessage(id: string, actorId: string): Promise<boolean> {
    const rows = await db
      .update(communityGroupMessages)
      .set({ deletedAt: new Date(), deletedBy: `admin:${actorId}` })
      .where(
        and(
          eq(communityGroupMessages.id, id),
          sql`${communityGroupMessages.deletedAt} is null`,
        ),
      )
      .returning({ id: communityGroupMessages.id });
    return rows.length > 0;
  }

  async archiveGroup(id: string): Promise<boolean> {
    const rows = await db
      .update(communityGroups)
      .set({ archivedAt: new Date() })
      .where(
        and(eq(communityGroups.id, id), sql`${communityGroups.archivedAt} is null`),
      )
      .returning({ id: communityGroups.id });
    return rows.length > 0;
  }
}

@Injectable()
export class AdminCommunitySafetyService {
  constructor(
    @Inject(ADMIN_COMMUNITY_SAFETY_STORE)
    private readonly store: AdminCommunitySafetyStore,
    private readonly audit: AuditService,
  ) {}

  async list(
    status: CommunityReportStatus | "all" = "open",
    limit = 50,
  ) {
    const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 100);
    return {
      reports: await this.store.listReports(status, safeLimit),
      status,
      generatedAt: new Date().toISOString(),
    };
  }

  async setStatus(
    adminId: string,
    reportId: string,
    status: CommunityReportStatus,
  ) {
    const report = await this.requireReport(reportId);
    const updated = await this.store.setReportStatus(report.id, status);
    if (!updated) throw new NotFoundException("Community report not found.");
    await this.audit.log("community.report.status", adminId, "community_report", {
      resourceId: report.id,
      from: report.status,
      to: status,
      targetType: report.targetType,
      targetId: report.targetId,
    });
    return updated;
  }

  async enforce(
    adminId: string,
    reportId: string,
    action: "remove_message" | "archive_group",
  ) {
    const report = await this.requireReport(reportId);

    if (action === "remove_message") {
      if (report.targetType !== "message") {
        throw new BadRequestException(
          "Only a message report can remove a message.",
        );
      }
      const changed = await this.store.removeMessage(report.targetId, adminId);
      if (!changed) {
        throw new BadRequestException(
          "The reported message is already removed or no longer exists.",
        );
      }
    } else {
      const groupId = await this.resolveGroupId(report);
      const changed = await this.store.archiveGroup(groupId);
      if (!changed) {
        throw new BadRequestException(
          "The reported group is already archived or no longer exists.",
        );
      }
    }

    await this.store.setReportStatus(report.id, "resolved");
    await this.audit.log(`community.report.${action}`, adminId, "community_report", {
      resourceId: report.id,
      targetType: report.targetType,
      targetId: report.targetId,
      action,
    });
    return { success: true, reportId: report.id, status: "resolved", action };
  }

  private async requireReport(id: string): Promise<StoredReport> {
    const report = await this.store.findReport(id);
    if (!report) throw new NotFoundException("Community report not found.");
    return report;
  }

  private async resolveGroupId(report: StoredReport): Promise<string> {
    if (report.targetType === "group") return report.targetId;
    const groupId = await this.store.findMessageGroupId(report.targetId);
    if (!groupId) {
      throw new BadRequestException(
        "The reported message is no longer attached to a group.",
      );
    }
    return groupId;
  }
}
