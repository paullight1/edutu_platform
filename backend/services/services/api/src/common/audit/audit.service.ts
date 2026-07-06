import { Injectable } from "@nestjs/common";
import { db } from "../../db";
import { adminAuditLogs } from "../../db/schema";

export interface AuditEntry {
  action: string;
  userId: string;
  resource: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  private readonly logFn: (entry: AuditEntry & { timestamp: string }) => void;

  constructor() {
    // In production, this would write to the admin_audit_logs table via Drizzle.
    // For now, it logs to console in a structured format that can be ingested
    // by log aggregation services (CloudWatch, Datadog, etc.)
    this.logFn = (entry) => {
      console.log(
        JSON.stringify({
          event: "audit",
          ...entry,
        }),
      );
    };
  }

  async log(
    action: string,
    userId: string,
    resource: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const entry: AuditEntry & { timestamp: string } = {
      action,
      userId,
      resource,
      timestamp: new Date().toISOString(),
      ...(metadata && { metadata }),
    };

    try {
      this.logFn(entry);
    } catch (error) {
      // Audit failures must never break the main flow
      console.error("Audit log write failed:", error);
    }

    // Persist to admin_audit_logs, best-effort. A DB failure (or the table not
    // yet existing in some environment) must never break the audited action.
    try {
      const resourceId =
        typeof metadata?.resourceId === "string" ? metadata.resourceId : null;
      await db.insert(adminAuditLogs).values({
        action,
        actorUserId: userId,
        resource,
        resourceId,
        metadata: metadata ?? {},
      });
    } catch (error) {
      console.error("Audit DB write failed:", error);
    }
  }

  // Convenience methods for common actions
  async logOpportunityCreate(
    userId: string,
    opportunityId: string,
    title: string,
  ): Promise<void> {
    await this.log("opportunity.create", userId, "opportunity", {
      resourceId: opportunityId,
      title,
    });
  }

  async logOpportunityUpdate(
    userId: string,
    opportunityId: string,
    changes: Record<string, unknown>,
  ): Promise<void> {
    await this.log("opportunity.update", userId, "opportunity", {
      resourceId: opportunityId,
      changes,
    });
  }

  async logOpportunityDelete(
    userId: string,
    opportunityId: string,
    title: string,
  ): Promise<void> {
    await this.log("opportunity.delete", userId, "opportunity", {
      resourceId: opportunityId,
      title,
    });
  }

  async logCreatorApproval(
    adminId: string,
    creatorId: string,
    approved: boolean,
  ): Promise<void> {
    await this.log(
      approved ? "creator.approve" : "creator.reject",
      adminId,
      "creator",
      { resourceId: creatorId },
    );
  }

  async logSettingChange(
    userId: string,
    key: string,
    oldValue: unknown,
    newValue: unknown,
  ): Promise<void> {
    await this.log("settings.update", userId, "settings", {
      key,
      oldValue,
      newValue,
    });
  }

  async logUserRoleChange(
    adminId: string,
    targetUserId: string,
    oldRole: string,
    newRole: string,
  ): Promise<void> {
    await this.log("user.role_change", adminId, "user", {
      resourceId: targetUserId,
      oldRole,
      newRole,
    });
  }
}
