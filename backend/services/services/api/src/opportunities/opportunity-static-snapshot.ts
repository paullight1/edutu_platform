import { existsSync } from "fs";
import { readFile } from "fs/promises";
import * as path from "path";
import { isPublicOpportunityRow } from "./opportunity-visibility";

const STATIC_OPPORTUNITY_SNAPSHOT_FILENAME = path.join(
  "edutu-web-app",
  "public",
  "data",
  "opportunities.json",
);

const STATIC_OPPORTUNITY_LOADED_AT = new Date().toISOString();

export type StaticOpportunityRow = Record<string, unknown>;

let cachedStaticOpportunityRows: StaticOpportunityRow[] | null = null;

function resolveStaticOpportunitySnapshotPath(): string | null {
  const roots = new Set<string>([
    process.cwd(),
    __dirname,
    path.resolve(process.cwd(), ".."),
    path.resolve(process.cwd(), "../.."),
    path.resolve(process.cwd(), "../../.."),
    path.resolve(process.cwd(), "../../../.."),
    path.resolve(__dirname, ".."),
    path.resolve(__dirname, "../.."),
    path.resolve(__dirname, "../../.."),
    path.resolve(__dirname, "../../../.."),
  ]);

  for (const root of roots) {
    let current = root;

    while (true) {
      const candidate = path.join(
        current,
        STATIC_OPPORTUNITY_SNAPSHOT_FILENAME,
      );
      if (existsSync(candidate)) {
        return candidate;
      }

      const parent = path.dirname(current);
      if (parent === current) {
        break;
      }

      current = parent;
    }
  }

  return null;
}

export function normaliseStaticOpportunityRow(
  row: Record<string, any>,
): StaticOpportunityRow {
  const deadline =
    row.deadline ?? row.close_date ?? row.application_deadline ?? null;
  const imageUrl = row.image_url ?? row.imageUrl ?? row.image ?? null;
  const applicationUrl = pickOpportunityUrl(
    row.application_url,
    row.applicationUrl,
    row.apply_url,
    row.applyUrl,
    row.link,
    row.canonical_url,
    row.canonicalUrl,
    row.url,
  );
  const lastUpdated =
    row.updated_at ??
    row.updatedAt ??
    row.updated ??
    row.lastUpdated ??
    STATIC_OPPORTUNITY_LOADED_AT;
  const createdAt = row.created_at ?? row.createdAt ?? lastUpdated;
  const isRemote =
    typeof row.is_remote === "boolean"
      ? row.is_remote
      : typeof row.isRemote === "boolean"
        ? row.isRemote
        : String(row.location ?? "")
            .toLowerCase()
            .includes("remote");

  return {
    ...row,
    deadline,
    close_date: row.close_date ?? deadline,
    image_url: imageUrl,
    application_url: applicationUrl ?? null,
    applicationUrl: applicationUrl ?? null,
    apply_url: row.apply_url ?? applicationUrl ?? null,
    applyUrl: row.applyUrl ?? applicationUrl ?? null,
    link: row.link ?? applicationUrl ?? null,
    updated_at: lastUpdated,
    created_at: createdAt,
    is_remote: isRemote,
    status: row.status ?? "active",
    source: row.source ?? "static-snapshot",
  };
}

export function pickOpportunityUrl(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return undefined;
}

export function withOpportunityUrlAliases(
  row: Record<string, any>,
): Record<string, unknown> {
  const applicationUrl = pickOpportunityUrl(
    row.application_url,
    row.applicationUrl,
    row.apply_url,
    row.applyUrl,
    row.link,
    row.canonical_url,
    row.canonicalUrl,
    row.url,
    row.metadata?.application_url,
    row.metadata?.applicationUrl,
    row.metadata?.applyUrl,
    row.metadata?.apply_url,
    row.metadata?.link,
    row.metadata?.canonical_url,
    row.metadata?.canonicalUrl,
    row.metadata?.url,
  );

  return {
    ...row,
    application_url: row.application_url ?? applicationUrl ?? null,
    apply_url: row.apply_url ?? applicationUrl ?? null,
    applicationUrl: row.applicationUrl ?? applicationUrl ?? null,
    applyUrl: row.applyUrl ?? applicationUrl ?? null,
    link: row.link ?? applicationUrl ?? null,
  };
}

export function filterStaticOpportunityRows(
  rows: StaticOpportunityRow[],
  limit: number,
  offset: number,
  status?: string,
  category?: string,
): StaticOpportunityRow[] {
  const normalizedStatus = (status || "active").trim().toLowerCase();
  const normalizedCategory = category?.trim().toLowerCase();

  if (normalizedStatus !== "active" && normalizedStatus !== "all") {
    return [];
  }

  const filtered = rows.filter((row) => {
    const rowCategory = String(row.category ?? row.canonical_category ?? "")
      .trim()
      .toLowerCase();
    const rowStatus = String(row.status ?? "active")
      .trim()
      .toLowerCase();

    if (normalizedStatus !== "all" && rowStatus !== normalizedStatus) {
      return false;
    }

    if (
      normalizedStatus === "active" &&
      !isPublicOpportunityRow(row, "snapshot")
    ) {
      return false;
    }

    if (normalizedCategory && rowCategory !== normalizedCategory) {
      return false;
    }

    return true;
  });

  return filtered.slice(offset, offset + limit);
}

export async function loadStaticOpportunitySnapshot(): Promise<
  StaticOpportunityRow[]
> {
  if (cachedStaticOpportunityRows) {
    return cachedStaticOpportunityRows;
  }

  const snapshotPath = resolveStaticOpportunitySnapshotPath();
  if (!snapshotPath) {
    return [];
  }

  try {
    const raw = await readFile(snapshotPath, "utf8");
    const parsed = JSON.parse(raw);
    const rows = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { data?: unknown }).data)
        ? ((parsed as { data: unknown[] }).data as Record<string, unknown>[])
        : [];

    cachedStaticOpportunityRows = rows.map((row) =>
      normaliseStaticOpportunityRow(row as Record<string, any>),
    );
    return cachedStaticOpportunityRows;
  } catch (error: any) {
    console.warn(
      `Could not load static opportunity snapshot from ${snapshotPath}: ${error?.message ?? String(error)}`,
    );
    return [];
  }
}
