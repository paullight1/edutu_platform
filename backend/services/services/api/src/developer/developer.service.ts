import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as crypto from "crypto";
import { and, eq, or, sql } from "drizzle-orm";
import { db } from "../db";
import { apiConsumers } from "../db/schema";
import { hashApiKey } from "../common/api-key-hash";
import type { CreateDeveloperProjectDto } from "./developer.dto";

type DeveloperProjectRow = {
  id: string;
  name: string;
  contact_email: string | null;
  key_prefix: string | null;
  status: string;
  plan: string;
  environment: string | null;
  allowed_scopes: string[] | null;
  monthly_quota: number | string | null;
  rate_limit_per_minute: number | string | null;
  last_used_at: Date | string | null;
  revoked_at: Date | string | null;
  expires_at: Date | string | null;
  created_at: Date | string | null;
  updated_at: Date | string | null;
  request_count: number | string | null;
};

type DeveloperRequestRow = {
  id: string;
  request_id: string | null;
  method: string;
  endpoint: string;
  status_code: number | string | null;
  latency_ms: number | string | null;
  created_at: Date | string | null;
  consumer_id: string;
  consumer_name: string;
  key_prefix: string | null;
  environment: string | null;
};

export interface DeveloperProjectSummary {
  id: string;
  name: string;
  contactEmail: string | null;
  keyPrefix: string | null;
  status: string;
  plan: string;
  environment: string | null;
  scopes: string[];
  monthlyQuota: number | null;
  rateLimitPerMinute: number | null;
  requestCount: number;
  remainingQuota: number | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  expiresAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface DeveloperRequestSummary {
  id: string;
  requestId: string | null;
  method: string;
  endpoint: string;
  statusCode: number | null;
  latencyMs: number | null;
  createdAt: string | null;
  consumerId: string;
  consumerName: string;
  keyPrefix: string | null;
  environment: string | null;
}

export interface DeveloperDashboardResponse {
  account: {
    userId: string;
    email: string | null;
  };
  summary: {
    totalProjects: number;
    activeProjects: number;
    totalRequestsThisMonth: number;
    totalMonthlyQuota: number | null;
    totalRemainingQuota: number | null;
    unlimitedProjects: number;
    latestActivityAt: string | null;
  };
  onboarding: Array<{
    title: string;
    description: string;
  }>;
  projects: DeveloperProjectSummary[];
  recentRequests: DeveloperRequestSummary[];
}

export interface CreateDeveloperProjectResult {
  rawKey: string;
  project: DeveloperProjectSummary;
}

const DEFAULT_SCOPES = [
  "opportunities:read",
  "opportunities:sync",
  "usage:read",
  "recommendations:read",
  "events:write",
] as const;

const DEFAULT_LIMITS = {
  live: {
    monthlyQuota: 1000,
    rateLimitPerMinute: 60,
  },
  test: {
    monthlyQuota: 250,
    rateLimitPerMinute: 30,
  },
} as const;

@Injectable()
export class DeveloperService {
  async getDashboard(
    userId: string,
    email?: string | null,
  ): Promise<DeveloperDashboardResponse> {
    const normalizedEmail = this.normalizeEmail(email);
    const [projects, recentRequests] = await Promise.all([
      this.listProjects(userId, normalizedEmail),
      this.listRecentRequests(userId, normalizedEmail),
    ]);

    const totalRequestsThisMonth = projects.reduce(
      (sum, project) => sum + project.requestCount,
      0,
    );
    const totalMonthlyQuota = this.sumProjectQuota(projects);
    const totalRemainingQuota = this.sumRemainingQuota(projects);
    const latestActivityAt =
      this.latestTimestamp(
        recentRequests.map((request) => request.createdAt).filter(Boolean),
      ) ??
      this.latestTimestamp(
        projects.map((project) => project.lastUsedAt).filter(Boolean),
      );

    return {
      account: {
        userId,
        email: normalizedEmail,
      },
      summary: {
        totalProjects: projects.length,
        activeProjects: projects.filter(
          (project) => project.status === "active",
        ).length,
        totalRequestsThisMonth,
        totalMonthlyQuota,
        totalRemainingQuota,
        unlimitedProjects: projects.filter(
          (project) => project.monthlyQuota === null,
        ).length,
        latestActivityAt,
      },
      onboarding: [
        {
          title: "Create a project",
          description:
            "Generate a named API project and receive a key that is stored hashed on the server.",
        },
        {
          title: "Configure scopes",
          description:
            "Choose read, sync, usage, or event scopes based on the integration you are shipping.",
        },
        {
          title: "Watch usage",
          description:
            "Track request counts, quota remaining, and recent activity from one dashboard.",
        },
      ],
      projects,
      recentRequests,
    };
  }

  async listProjects(
    userId: string,
    email?: string | null,
  ): Promise<DeveloperProjectSummary[]> {
    const normalizedEmail = this.normalizeEmail(email);
    const periodStart = this.getCurrentPeriodStart();
    const rowsResult = await db.execute(sql`
      select
        api_consumers.id,
        api_consumers.name,
        api_consumers.contact_email,
        api_consumers.key_prefix,
        api_consumers.status,
        api_consumers.plan,
        api_consumers.environment,
        api_consumers.allowed_scopes,
        api_consumers.monthly_quota,
        api_consumers.rate_limit_per_minute,
        api_consumers.last_used_at,
        api_consumers.revoked_at,
        api_consumers.expires_at,
        api_consumers.created_at,
        api_consumers.updated_at,
        coalesce(api_usage_buckets.request_count, 0)::int as request_count
      from api_consumers
      left join api_usage_buckets
        on api_usage_buckets.consumer_id = api_consumers.id
        and api_usage_buckets.period_start = ${periodStart}::date
      where ${this.buildOwnershipPredicate(userId, normalizedEmail)}
      order by api_consumers.created_at desc
    `);

    const rows = this.extractRows<DeveloperProjectRow>(rowsResult);
    return rows.map((row) => this.mapProjectRow(row));
  }

  async listRecentRequests(
    userId: string,
    email?: string | null,
  ): Promise<DeveloperRequestSummary[]> {
    const normalizedEmail = this.normalizeEmail(email);
    const rowsResult = await db.execute(sql`
      select
        api_usage_events.id,
        api_usage_events.request_id,
        api_usage_events.method,
        api_usage_events.endpoint,
        api_usage_events.status_code,
        api_usage_events.latency_ms,
        api_usage_events.created_at,
        api_consumers.id as consumer_id,
        api_consumers.name as consumer_name,
        api_consumers.key_prefix,
        api_consumers.environment
      from api_usage_events
      join api_consumers
        on api_consumers.id = api_usage_events.consumer_id
      where ${this.buildOwnershipPredicate(userId, normalizedEmail)}
      order by api_usage_events.created_at desc
      limit 20
    `);

    const rows = this.extractRows<DeveloperRequestRow>(rowsResult);
    return rows.map((row) => this.mapRequestRow(row));
  }

  async createProject(
    userId: string,
    email: string | null | undefined,
    dto: CreateDeveloperProjectDto,
  ): Promise<CreateDeveloperProjectResult> {
    const normalizedEmail = this.normalizeEmail(email);
    if (!normalizedEmail) {
      throw new BadRequestException(
        "A verified email address is required before creating a developer project.",
      );
    }

    const environment = dto.environment ?? "live";
    const scopes = dto.scopes?.length ? dto.scopes : [...DEFAULT_SCOPES];
    const monthlyQuota =
      dto.monthlyQuota ?? DEFAULT_LIMITS[environment].monthlyQuota;
    const rateLimitPerMinute =
      dto.rateLimitPerMinute ?? DEFAULT_LIMITS[environment].rateLimitPerMinute;
    const { rawKey, keyPrefix } = this.buildKeyMaterial(environment);

    const [created] = await db
      .insert(apiConsumers)
      .values({
        ownerUserId: userId,
        name: dto.name,
        contactEmail: normalizedEmail,
        keyPrefix,
        apiKeyHash: hashApiKey(rawKey),
        status: "active",
        plan: "starter",
        environment,
        allowedScopes: scopes,
        monthlyQuota,
        rateLimitPerMinute,
        metadata: {
          ownerUserId: userId,
          contactEmail: normalizedEmail,
          environment,
          keyPrefix,
          projectName: dto.name,
        },
      })
      .returning()
      .execute();

    if (!created) {
      throw new BadRequestException("Unable to create developer project");
    }

    return {
      rawKey,
      project: this.mapProjectRow({
        id: created.id,
        name: created.name,
        contact_email: created.contactEmail ?? null,
        key_prefix: created.keyPrefix ?? null,
        status: created.status,
        plan: created.plan,
        environment: created.environment,
        allowed_scopes: created.allowedScopes ?? [],
        monthly_quota: created.monthlyQuota ?? monthlyQuota,
        rate_limit_per_minute: created.rateLimitPerMinute ?? rateLimitPerMinute,
        last_used_at: created.lastUsedAt ?? null,
        revoked_at: created.revokedAt ?? null,
        expires_at: created.expiresAt ?? null,
        created_at: created.createdAt ?? new Date(),
        updated_at: created.updatedAt ?? new Date(),
        request_count: 0,
      }),
    };
  }

  async rotateProject(
    userId: string,
    email: string | null | undefined,
    projectId: string,
  ): Promise<CreateDeveloperProjectResult> {
    const project = await this.findOwnedProject(userId, email, projectId);
    const environment = (project.environment ?? "live") as "test" | "live";
    const { rawKey } = this.buildKeyMaterial(
      environment,
      project.key_prefix ?? undefined,
    );

    const [updated] = await db
      .update(apiConsumers)
      .set({
        apiKeyHash: hashApiKey(rawKey),
        status: "active",
        revokedAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(apiConsumers.id, projectId),
          this.buildOwnershipPredicate(userId, this.normalizeEmail(email)),
        ),
      )
      .returning()
      .execute();

    if (!updated) {
      throw new NotFoundException("Developer project not found");
    }

    return {
      rawKey,
      project: await this.findOwnedProject(userId, email, projectId).then(
        (row) => this.mapProjectRow(row),
      ),
    };
  }

  async revokeProject(
    userId: string,
    email: string | null | undefined,
    projectId: string,
  ): Promise<DeveloperProjectSummary> {
    const [updated] = await db
      .update(apiConsumers)
      .set({
        status: "revoked",
        revokedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(apiConsumers.id, projectId),
          this.buildOwnershipPredicate(userId, this.normalizeEmail(email)),
        ),
      )
      .returning()
      .execute();

    if (!updated) {
      throw new NotFoundException("Developer project not found");
    }

    return this.findOwnedProject(userId, email, projectId).then((row) =>
      this.mapProjectRow(row),
    );
  }

  private buildOwnershipPredicate(userId: string, email?: string | null) {
    const ownerClause = eq(apiConsumers.ownerUserId, userId);
    if (!email) return ownerClause;
    return or(ownerClause, eq(apiConsumers.contactEmail, email))!;
  }

  private buildKeyMaterial(
    environment: "test" | "live",
    existingKeyPrefix?: string,
  ) {
    const keyPrefix =
      existingKeyPrefix?.trim() ||
      `edu_${environment}_${crypto.randomBytes(4).toString("hex")}`;
    const secret = crypto.randomBytes(20).toString("hex");
    return {
      keyPrefix,
      rawKey: `${keyPrefix}_${secret}`,
    };
  }

  private extractRows<T>(result: unknown): T[] {
    if (Array.isArray(result)) return result as T[];
    if (result && typeof result === "object" && "rows" in result) {
      return (result as { rows?: T[] }).rows ?? [];
    }
    return [];
  }

  private mapProjectRow(row: DeveloperProjectRow): DeveloperProjectSummary {
    const monthlyQuota = this.toNumber(row.monthly_quota);
    const requestCount = this.toNumber(row.request_count) ?? 0;
    const remainingQuota =
      monthlyQuota === null ? null : Math.max(monthlyQuota - requestCount, 0);

    return {
      id: row.id,
      name: row.name,
      contactEmail: row.contact_email,
      keyPrefix: row.key_prefix,
      status: row.status,
      plan: row.plan,
      environment: row.environment,
      scopes: row.allowed_scopes ?? [],
      monthlyQuota,
      rateLimitPerMinute: this.toNumber(row.rate_limit_per_minute),
      requestCount,
      remainingQuota,
      lastUsedAt: this.toIso(row.last_used_at),
      revokedAt: this.toIso(row.revoked_at),
      expiresAt: this.toIso(row.expires_at),
      createdAt: this.toIso(row.created_at),
      updatedAt: this.toIso(row.updated_at),
    };
  }

  private mapRequestRow(row: DeveloperRequestRow): DeveloperRequestSummary {
    return {
      id: row.id,
      requestId: row.request_id,
      method: row.method,
      endpoint: row.endpoint,
      statusCode: this.toNumber(row.status_code),
      latencyMs: this.toNumber(row.latency_ms),
      createdAt: this.toIso(row.created_at),
      consumerId: row.consumer_id,
      consumerName: row.consumer_name,
      keyPrefix: row.key_prefix,
      environment: row.environment,
    };
  }

  private findOwnedProject(
    userId: string,
    email: string | null | undefined,
    projectId: string,
  ) {
    const normalizedEmail = this.normalizeEmail(email);
    return db
      .execute(
        sql`
        select
          api_consumers.id,
          api_consumers.name,
          api_consumers.contact_email,
          api_consumers.key_prefix,
          api_consumers.status,
          api_consumers.plan,
          api_consumers.environment,
          api_consumers.allowed_scopes,
          api_consumers.monthly_quota,
          api_consumers.rate_limit_per_minute,
          api_consumers.last_used_at,
          api_consumers.revoked_at,
          api_consumers.expires_at,
          api_consumers.created_at,
          api_consumers.updated_at,
          0::int as request_count
        from api_consumers
        where api_consumers.id = ${projectId}
          and ${this.buildOwnershipPredicate(userId, normalizedEmail)}
        limit 1
      `,
      )
      .then((result) => {
        const [project] = this.extractRows<DeveloperProjectRow>(result);
        if (!project) {
          throw new NotFoundException("Developer project not found");
        }
        return project;
      });
  }

  private sumProjectQuota(projects: DeveloperProjectSummary[]) {
    const numericQuotas = projects
      .map((project) => project.monthlyQuota)
      .filter((quota): quota is number => typeof quota === "number");

    return numericQuotas.length > 0
      ? numericQuotas.reduce((sum, quota) => sum + quota, 0)
      : null;
  }

  private sumRemainingQuota(projects: DeveloperProjectSummary[]) {
    const remaining = projects
      .map((project) => project.remainingQuota)
      .filter((quota): quota is number => typeof quota === "number");

    return remaining.length > 0
      ? remaining.reduce((sum, quota) => sum + quota, 0)
      : null;
  }

  private latestTimestamp(values: Array<string | null>) {
    const valid = values
      .map((value) => (value ? new Date(value) : null))
      .filter((value): value is Date =>
        Boolean(value && !Number.isNaN(value.getTime())),
      );

    if (valid.length === 0) return null;
    return valid
      .sort((left, right) => right.getTime() - left.getTime())[0]
      .toISOString();
  }

  private getCurrentPeriodStart() {
    const now = new Date();
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    ).toISOString();
  }

  private normalizeEmail(email?: string | null) {
    const trimmed = email?.trim().toLowerCase() ?? "";
    return trimmed || null;
  }

  private toNumber(value: number | string | null | undefined) {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private toIso(value: Date | string | null | undefined) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
}
