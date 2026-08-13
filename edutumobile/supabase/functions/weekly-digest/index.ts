import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GENERIC_ERROR = { error: "Request could not be processed" } as const;
const MAX_REQUEST_BYTES = 16_384;
const SIGNATURE_MAX_AGE_SECONDS = 300;
const DEFAULT_JOB_KEY = "weekly-digest";
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const DEFAULT_MAX_RECIPIENTS = 500;
const MAX_RECIPIENTS = 5_000;
const DEFAULT_EMAIL_TIMEOUT_MS = 10_000;
const MAX_EMAIL_TIMEOUT_MS = 30_000;
const MAX_DIGEST_ITEMS = 10;

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type WeeklyDigestCounts = {
  sent: number;
  skipped: number;
};

export type DigestRecipient = {
  userId: string;
  email: string | null;
};

export type DigestRecipientPage = {
  recipients: DigestRecipient[];
  hasMore: boolean;
};

type Environment = (name: string) => string | undefined;

type DigestRunnerDependencies = {
  now?: () => number;
  claimJob: (
    day: Weekday,
    executionDate: string,
    jobKey: string,
  ) => Promise<boolean>;
  listRecipients: (
    day: Weekday,
    page: number,
    pageSize: number,
  ) => Promise<DigestRecipientPage>;
  sendDigest: (recipient: DigestRecipient) => Promise<"sent" | "skipped">;
  pageSize?: number;
  maxRecipients?: number;
};

export type WeeklyDigestHandlerOptions = {
  env?: Environment;
  now?: () => number;
  runDigest?: (
    day: Weekday,
    jobKey: string,
  ) => Promise<WeeklyDigestCounts>;
  claimJob?: DigestRunnerDependencies["claimJob"];
  listRecipients?: DigestRunnerDependencies["listRecipients"];
  sendDigest?: DigestRunnerDependencies["sendDigest"];
  pageSize?: number;
  maxRecipients?: number;
};

function env(name: string): string | undefined {
  return Deno.env.get(name);
}

function jsonResponse(status: number, body: unknown = GENERIC_ERROR): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  let mismatch = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    mismatch |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return mismatch === 0;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function validJobKey(value: string): boolean {
  return /^[a-zA-Z0-9:_-]{1,80}$/.test(value);
}

function parseWeekday(value: unknown): Weekday | null {
  if (
    typeof value !== "number" || !Number.isInteger(value) || value < 1 ||
    value > 7
  ) return null;
  return value as Weekday;
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  maximum: number,
  name: string,
): number {
  const selected = value ?? fallback;
  if (!Number.isSafeInteger(selected) || selected <= 0 || selected > maximum) {
    throw new Error(`Invalid ${name}`);
  }
  return selected;
}

async function readBoundedBody(request: Request): Promise<string | null> {
  const advertised = request.headers.get("content-length");
  if (advertised !== null) {
    const length = Number(advertised);
    if (!Number.isSafeInteger(length) || length < 0 || length > MAX_REQUEST_BYTES) {
      return null;
    }
  }
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let bytesRead = 0;
  let body = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > MAX_REQUEST_BYTES) {
        await reader.cancel();
        return null;
      }
      body += decoder.decode(value, { stream: true });
    }
    return body + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

async function signSchedulerPayload(
  secret: string,
  timestamp: string,
  jobKey: string,
  rawBody: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${timestamp}.${jobKey}.${rawBody}`),
    ),
  );
  return `v1=${bytesToHex(digest)}`;
}

export async function authenticateSchedulerRequest(
  request: Request,
  rawBody: string,
  options: {
    secret?: string;
    jobKey?: string;
    now?: () => number;
  } = {},
): Promise<{ ok: true; jobKey: string } | { ok: false }> {
  const secret = options.secret;
  const configuredJobKey = options.jobKey ?? DEFAULT_JOB_KEY;
  const suppliedJobKey = request.headers.get("x-edutu-digest-job-key")?.trim();
  const timestamp = request.headers.get("x-edutu-digest-timestamp")?.trim();
  const suppliedSignature = request.headers.get("x-edutu-digest-signature")
    ?.trim();

  if (
    !secret || new TextEncoder().encode(secret).byteLength < 32 ||
    !validJobKey(configuredJobKey) || suppliedJobKey !== configuredJobKey ||
    !timestamp || !/^\d{10}$/.test(timestamp) || !suppliedSignature ||
    !/^v1=[a-f0-9]{64}$/.test(suppliedSignature)
  ) return { ok: false };

  const now = Math.floor((options.now ?? Date.now)() / 1000);
  const timestampSeconds = Number(timestamp);
  if (
    !Number.isSafeInteger(timestampSeconds) ||
    Math.abs(now - timestampSeconds) > SIGNATURE_MAX_AGE_SECONDS
  ) return { ok: false };

  const expected = await signSchedulerPayload(
    secret,
    timestamp,
    configuredJobKey,
    rawBody,
  );
  return constantTimeEqual(suppliedSignature, expected)
    ? { ok: true, jobKey: configuredJobKey }
    : { ok: false };
}

function executionDate(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export function createWeeklyDigestRunner(
  dependencies: DigestRunnerDependencies,
): (
  day: Weekday,
  jobKey: string,
  executionDateOverride?: string,
) => Promise<WeeklyDigestCounts> {
  const pageSize = boundedInteger(
    dependencies.pageSize,
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    "page size",
  );
  const maxRecipients = boundedInteger(
    dependencies.maxRecipients,
    DEFAULT_MAX_RECIPIENTS,
    MAX_RECIPIENTS,
    "recipient limit",
  );
  const now = dependencies.now ?? Date.now;

  return async (day, jobKey, executionDateOverride) => {
    if (!validJobKey(jobKey)) throw new Error("Invalid scheduler job key");
    const date = executionDateOverride ?? executionDate(now());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error("Invalid execution date");
    }

    const claimed = await dependencies.claimJob(day, date, jobKey);
    if (!claimed) return { sent: 0, skipped: 0 };

    let sent = 0;
    let skipped = 0;
    let processed = 0;
    let page = 0;

    while (processed < maxRecipients) {
      const result = await dependencies.listRecipients(day, page, pageSize);
      if (result.recipients.length === 0) break;

      for (const recipient of result.recipients) {
        if (processed >= maxRecipients) break;
        processed += 1;
        try {
          const outcome = await dependencies.sendDigest(recipient);
          if (outcome === "sent") sent += 1;
          else skipped += 1;
        } catch {
          skipped += 1;
        }
      }

      if (!result.hasMore || result.recipients.length < pageSize) break;
      page += 1;
    }

    return { sent, skipped };
  };
}

type SupabaseClientLike = any;

function requireEnvironment(environment: Environment): {
  url: string;
  serviceRoleKey: string;
} {
  const url = environment("SUPABASE_URL")?.trim();
  const serviceRoleKey = environment("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!url || !serviceRoleKey) throw new Error("Digest service unavailable");
  return { url, serviceRoleKey };
}

function responseError(result: { error?: unknown }): void {
  if (result.error) throw new Error("Digest service unavailable");
}

async function createDefaultDependencies(
  environment: Environment,
  now: () => number,
): Promise<DigestRunnerDependencies> {
  const { url, serviceRoleKey } = requireEnvironment(environment);
  const supabase: SupabaseClientLike = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const emailTimeoutRaw = environment("WEEKLY_DIGEST_EMAIL_TIMEOUT_MS")?.trim();
  const emailTimeoutMs = boundedInteger(
    emailTimeoutRaw ? Number(emailTimeoutRaw) : undefined,
    DEFAULT_EMAIL_TIMEOUT_MS,
    MAX_EMAIL_TIMEOUT_MS,
    "email timeout",
  );

  return {
    now,
    pageSize: Number(environment("WEEKLY_DIGEST_PAGE_SIZE")) || undefined,
    maxRecipients: Number(environment("WEEKLY_DIGEST_MAX_RECIPIENTS")) ||
      undefined,
    claimJob: async (day, date) => {
      const result = await supabase.rpc("claim_weekly_digest_job", {
        p_digest_day: day,
        p_execution_date: date,
      });
      responseError(result);
      return result.data === true;
    },
    listRecipients: async (day, page, pageSize) => {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      const preferencesResult = await supabase
        .from("notification_preferences")
        .select("user_id, weekly_digest_email")
        .eq("weekly_digest_enabled", true)
        .eq("weekly_digest_day", day)
        .order("user_id", { ascending: true })
        .range(from, to);
      responseError(preferencesResult);
      const preferences = (preferencesResult.data ?? []) as Array<{
        user_id: string;
        weekly_digest_email?: string | null;
      }>;
      if (preferences.length === 0) return { recipients: [], hasMore: false };

      const userIds = preferences.map((preference) => preference.user_id);
      const profilesResult = await supabase
        .from("profiles")
        .select("user_id, email")
        .in("user_id", userIds);
      responseError(profilesResult);
      const emailByUserId = new Map(
        ((profilesResult.data ?? []) as Array<{
          user_id: string;
          email?: string | null;
        }>).map((profile) => [profile.user_id, profile.email ?? null]),
      );
      return {
        recipients: preferences.map((preference) => ({
          userId: preference.user_id,
          email: preference.weekly_digest_email ??
            emailByUserId.get(preference.user_id) ?? null,
        })),
        hasMore: preferences.length === pageSize,
      };
    },
    sendDigest: async (recipient) => {
      const emailApiKey = environment("SUPABASE_EMAIL_API_KEY")?.trim();
      if (!recipient.email || !emailApiKey) return "skipped";

      const data = await fetchUserDigestData(supabase, recipient.userId, now);
      const hasContent = data.activeGoals > 0 || data.newSaved.length > 0 ||
        data.upcomingDeadlines.length > 0 || data.applicationUpdates.length > 0;
      if (!hasContent) return "skipped";

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), emailTimeoutMs);
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          signal: controller.signal,
          headers: {
            authorization: `Bearer ${emailApiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            from: "Edutu <digest@edutu.app>",
            to: recipient.email,
            subject: "Your Weekly Edutu Digest",
            html: generateDigestHtml(data, now),
          }),
        });
        return response.ok ? "sent" : "skipped";
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

async function fetchUserDigestData(
  supabase: SupabaseClientLike,
  userId: string,
  now: () => number,
): Promise<{
  activeGoals: number;
  completedGoals: number;
  newSaved: Array<Record<string, unknown>>;
  upcomingDeadlines: Array<Record<string, unknown>>;
  applicationUpdates: Array<Record<string, unknown>>;
}> {
  const weekAgo = new Date(now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const nextWeek = new Date(now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const [goalsResult, savedResult, deadlinesResult, applicationsResult] =
    await Promise.all([
      supabase.from("goals").select("title, progress, status")
        .eq("user_id", userId).eq("status", "active"),
      supabase.from("bookmarks").select("opportunities(title, organization)")
        .eq("user_id", userId).gte("created_at", weekAgo).limit(MAX_DIGEST_ITEMS),
      supabase.from("goals").select("title, deadline").eq("user_id", userId)
        .eq("status", "active").gte("deadline", new Date(now()).toISOString())
        .lte("deadline", nextWeek).order("deadline").limit(MAX_DIGEST_ITEMS),
      supabase.from("opportunity_applications")
        .select("status, updated_at, opportunities(title)")
        .eq("user_id", userId).gte("updated_at", weekAgo)
        .order("updated_at", { ascending: false }).limit(MAX_DIGEST_ITEMS),
    ]);
  responseError(goalsResult);
  responseError(savedResult);
  responseError(deadlinesResult);
  responseError(applicationsResult);
  const goals = (goalsResult.data ?? []) as Array<{ progress?: number }>;
  return {
    activeGoals: goals.length,
    completedGoals: goals.filter((goal) => (goal.progress ?? 0) >= 100).length,
    newSaved: (savedResult.data ?? []) as Array<Record<string, unknown>>,
    upcomingDeadlines: (deadlinesResult.data ?? []) as Array<Record<string, unknown>>,
    applicationUpdates: (applicationsResult.data ?? []) as Array<Record<string, unknown>>,
  };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function generateDigestHtml(
  data: Awaited<ReturnType<typeof fetchUserDigestData>>,
  now: () => number,
): string {
  const saved = data.newSaved.slice(0, MAX_DIGEST_ITEMS).map((item) => {
    const opportunity = item.opportunities as Record<string, unknown> | undefined;
    return `<li>${escapeHtml(String(opportunity?.title ?? "Untitled"))}</li>`;
  }).join("");
  const deadlines = data.upcomingDeadlines.slice(0, MAX_DIGEST_ITEMS).map((item) =>
    `<li>${escapeHtml(String(item.title ?? "Upcoming deadline"))}</li>`
  ).join("");
  return `<!doctype html><html><body><h1>Your Week in Review</h1><p>${new Date(now()).toISOString().slice(0, 10)}</p><p>${data.activeGoals} active goals; ${data.completedGoals} completed.</p>${saved ? `<h2>Saved opportunities</h2><ul>${saved}</ul>` : ""}${deadlines ? `<h2>Upcoming deadlines</h2><ul>${deadlines}</ul>` : ""}</body></html>`;
}

export async function runWeeklyDigest(
  day: Weekday,
  jobToken: string,
  dependencies?: DigestRunnerDependencies,
): Promise<WeeklyDigestCounts> {
  const now = dependencies?.now ?? Date.now;
  const runner = createWeeklyDigestRunner(
    dependencies ?? await createDefaultDependencies(env, now),
  );
  return runner(day, jobToken, executionDate(now()));
}

function parseRequestDay(rawBody: string): Weekday | null {
  try {
    const payload = JSON.parse(rawBody) as Record<string, unknown>;
    if (
      !payload || Array.isArray(payload) || Object.keys(payload).length !== 1 ||
      !Object.hasOwn(payload, "day")
    ) return null;
    return parseWeekday(payload.day);
  } catch {
    return null;
  }
}

export function createWeeklyDigestHandler(
  options: WeeklyDigestHandlerOptions = {},
): (request: Request) => Promise<Response> {
  const environment = options.env ?? env;
  const now = options.now ?? Date.now;
  const runDigest = options.runDigest ?? (async (day: Weekday, jobKey: string) => {
    const defaults = await createDefaultDependencies(environment, now);
    return runWeeklyDigest(day, jobKey, {
      ...defaults,
      claimJob: options.claimJob ?? defaults.claimJob,
      listRecipients: options.listRecipients ?? defaults.listRecipients,
      sendDigest: options.sendDigest ?? defaults.sendDigest,
      pageSize: options.pageSize ?? defaults.pageSize,
      maxRecipients: options.maxRecipients ?? defaults.maxRecipients,
    });
  });

  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return jsonResponse(405);
    const rawBody = await readBoundedBody(request);
    if (!rawBody) return jsonResponse(400);

    const authentication = await authenticateSchedulerRequest(request, rawBody, {
      secret: environment("WEEKLY_DIGEST_JOB_SECRET"),
      jobKey: environment("WEEKLY_DIGEST_JOB_KEY") ?? DEFAULT_JOB_KEY,
      now,
    }).catch(() => ({ ok: false } as const));
    if (!authentication.ok) return jsonResponse(401);

    const day = parseRequestDay(rawBody);
    if (day === null) return jsonResponse(400);

    try {
      const counts = await runDigest(day, authentication.jobKey);
      return jsonResponse(200, {
        sent: Math.max(0, Math.floor(counts.sent)),
        skipped: Math.max(0, Math.floor(counts.skipped)),
      });
    } catch {
      console.error("weekly_digest_failed");
      return jsonResponse(500);
    }
  };
}

export const handler = createWeeklyDigestHandler();

if (import.meta.main) Deno.serve(handler);
