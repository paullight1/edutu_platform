#!/usr/bin/env node
import "dotenv/config";
import { createClient, type FileObject } from "@supabase/supabase-js";
import {
  collectReferencedStoragePaths,
  planStorageCleanup,
  type CleanupCandidate,
} from "../src/storage/storage-cleanup-plan";

const ALLOWED_BUCKETS = new Set([
  "opportunities_images",
  "opportunity-share-cards",
]);
const DEFAULT_BUCKETS = [...ALLOWED_BUCKETS];
const APPLY_CONFIRMATION = "DELETE_UNREFERENCED_STORAGE";

function argumentValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(
    prefix.length,
  );
}

function positiveInteger(name: string, fallback: number): number {
  const raw = argumentValue(name);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`--${name} must be a positive integer`);
  }
  return parsed;
}

function selectedBuckets(): string[] {
  const requested = argumentValue("bucket");
  if (!requested) return DEFAULT_BUCKETS;
  const buckets = requested
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const unsupported = buckets.filter((bucket) => !ALLOWED_BUCKETS.has(bucket));
  if (unsupported.length > 0) {
    throw new Error(
      `Cleanup is restricted to generated public buckets. Unsupported: ${unsupported.join(", ")}`,
    );
  }
  return [...new Set(buckets)];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let value = bytes;
  let unit = -1;
  do {
    value /= 1024;
    unit += 1;
  } while (value >= 1024 && unit < units.length - 1);
  return `${value.toFixed(2)} ${units[unit]}`;
}

async function loadOpportunityReferences(
  client: ReturnType<typeof createClient>,
): Promise<unknown[]> {
  const records: unknown[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client
      .from("opportunities")
      .select("image_url,metadata")
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    records.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return records;
}

async function listFolder(
  client: ReturnType<typeof createClient>,
  bucket: string,
  prefix = "",
): Promise<CleanupCandidate[]> {
  const objects: CleanupCandidate[] = [];
  const folders: string[] = [];
  const pageSize = 1000;

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client.storage.from(bucket).list(prefix, {
      limit: pageSize,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;

    for (const entry of data ?? []) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (isFolder(entry)) {
        folders.push(path);
      } else {
        objects.push({
          path,
          size: Number(entry.metadata?.size) || 0,
          updatedAt: entry.updated_at ?? entry.created_at ?? null,
        });
      }
    }
    if (!data || data.length < pageSize) break;
  }

  for (const folder of folders) {
    objects.push(...(await listFolder(client, bucket, folder)));
  }
  return objects;
}

function isFolder(entry: FileObject): boolean {
  return !entry.id && !entry.metadata;
}

async function removeInBatches(
  client: ReturnType<typeof createClient>,
  bucket: string,
  paths: string[],
  batchSize: number,
): Promise<void> {
  for (let index = 0; index < paths.length; index += batchSize) {
    const batch = paths.slice(index, index + batchSize);
    const { error } = await client.storage.from(bucket).remove(batch);
    if (error) {
      throw new Error(
        `Deletion stopped in ${bucket} at object ${index + 1}: ${error.message}`,
      );
    }
    console.log(
      `[${bucket}] deleted ${Math.min(index + batch.length, paths.length)}/${paths.length}`,
    );
  }
}

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }

  const apply = process.argv.includes("--apply");
  if (apply && argumentValue("confirm-delete") !== APPLY_CONFIRMATION) {
    throw new Error(
      `Applying deletions requires --confirm-delete=${APPLY_CONFIRMATION}`,
    );
  }

  const minAgeDays = positiveInteger("min-age-days", 14);
  const batchSize = Math.min(positiveInteger("batch-size", 100), 1000);
  const buckets = selectedBuckets();
  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const records = await loadOpportunityReferences(client);

  console.log(
    `${apply ? "APPLY" : "DRY RUN"}: ${records.length} opportunity records; ${minAgeDays}-day grace period`,
  );

  for (const bucket of buckets) {
    const [objects, referencedPaths] = await Promise.all([
      listFolder(client, bucket),
      Promise.resolve(collectReferencedStoragePaths(records, bucket)),
    ]);
    const plan = planStorageCleanup({
      objects,
      referencedPaths,
      minAgeDays,
    });

    console.log(`\n${bucket}`);
    console.log(`  objects: ${objects.length}`);
    console.log(`  referenced objects found: ${plan.keptReferenced}`);
    console.log(`  protected by grace period: ${plan.keptWithinGracePeriod}`);
    console.log(`  protected because age is unknown: ${plan.keptUnknownAge}`);
    console.log(`  deletable: ${plan.deletePaths.length}`);
    console.log(`  reclaimable: ${formatBytes(plan.deleteBytes)}`);

    if (apply && plan.deletePaths.length > 0) {
      await removeInBatches(client, bucket, plan.deletePaths, batchSize);
    }
  }

  if (!apply) {
    console.log(
      `\nNo files were changed. Re-run with --apply --confirm-delete=${APPLY_CONFIRMATION} after reviewing this plan.`,
    );
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Storage cleanup failed: ${message}`);
  process.exitCode = 1;
});
