import {
  createWeeklyDigestHandler,
  createWeeklyDigestRunner,
  type DigestRecipient,
  type WeeklyDigestCounts,
} from "./index.ts";

const NOW_MS = 1_722_816_000_000;
const NOW_SECONDS = Math.floor(NOW_MS / 1000);
const SECRET = "s".repeat(32);
const JOB_KEY = "weekly-digest";
const EXECUTION_DATE = "2024-08-03";

function assert(
  condition: unknown,
  message = "Assertion failed",
): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T, message?: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(
      message ?? `Expected ${String(expected)}, got ${String(actual)}`,
    );
  }
}

function assertJsonEquals(actual: unknown, expected: unknown): void {
  assertEquals(JSON.stringify(actual), JSON.stringify(expected));
}

async function signedRequest(
  body: string,
  overrides: { timestamp?: string; jobKey?: string; secret?: string } = {},
): Promise<Request> {
  const timestamp = overrides.timestamp ?? String(NOW_SECONDS);
  const jobKey = overrides.jobKey ?? JOB_KEY;
  const secret = overrides.secret ?? SECRET;
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
      new TextEncoder().encode(`${timestamp}.${jobKey}.${body}`),
    ),
  );
  const signature = Array.from(digest).map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");

  return new Request("https://edge.test/weekly-digest", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-edutu-digest-timestamp": timestamp,
      "x-edutu-digest-job-key": jobKey,
      "x-edutu-digest-signature": `v1=${signature}`,
    },
    body,
  });
}

function recipient(index: number): DigestRecipient {
  return { userId: `user-${index}`, email: `user-${index}@example.test` };
}

function runnerOptions(overrides: {
  claimJob?: () => Promise<boolean>;
  listRecipients?: (
    day: number,
    page: number,
    pageSize: number,
  ) => Promise<{ recipients: DigestRecipient[]; hasMore: boolean }>;
  sendDigest?: (recipient: DigestRecipient) => Promise<"sent" | "skipped">;
  pageSize?: number;
  maxRecipients?: number;
} = {}) {
  return {
    now: () => NOW_MS,
    claimJob: overrides.claimJob ?? (async () => true),
    listRecipients: overrides.listRecipients ?? (async () => ({
      recipients: [],
      hasMore: false,
    })),
    sendDigest: overrides.sendDigest ?? (async () => "sent" as const),
    pageSize: overrides.pageSize ?? 50,
    maxRecipients: overrides.maxRecipients ?? 500,
  };
}

Deno.test("weekly digest rejects a request with no scheduler credential", async () => {
  let ran = false;
  const handler = createWeeklyDigestHandler({
    env: (name) => name === "WEEKLY_DIGEST_JOB_SECRET" ? SECRET : undefined,
    now: () => NOW_MS,
    runDigest: async () => {
      ran = true;
      return { sent: 1, skipped: 0 };
    },
  });

  const response = await handler(
    new Request("https://edge.test/weekly-digest", {
      method: "POST",
      body: JSON.stringify({ day: 6 }),
    }),
  );

  assertEquals(response.status, 401);
  assertEquals(ran, false);
  assertEquals(await response.text(), '{"error":"Request could not be processed"}');
});

Deno.test("weekly digest rejects a stale or tampered signed scheduler request", async () => {
  const handler = createWeeklyDigestHandler({
    env: (name) => {
      if (name === "WEEKLY_DIGEST_JOB_SECRET") return SECRET;
      if (name === "WEEKLY_DIGEST_JOB_KEY") return JOB_KEY;
      return undefined;
    },
    now: () => NOW_MS,
    runDigest: async () => ({ sent: 1, skipped: 0 }),
  });
  const body = JSON.stringify({ day: 6 });

  const stale = await handler(
    await signedRequest(body, { timestamp: String(NOW_SECONDS - 301) }),
  );
  assertEquals(stale.status, 401);

  const tampered = await signedRequest(body, { secret: "t".repeat(32) });
  const tamperedResponse = await handler(tampered);
  assertEquals(tamperedResponse.status, 401);
});

Deno.test("weekly digest rejects an invalid day before running the job", async () => {
  let ran = false;
  const handler = createWeeklyDigestHandler({
    env: (name) => name === "WEEKLY_DIGEST_JOB_SECRET" ? SECRET : undefined,
    now: () => NOW_MS,
    runDigest: async () => {
      ran = true;
      return { sent: 0, skipped: 0 };
    },
  });

  const response = await handler(
    await signedRequest(JSON.stringify({ day: 8 })),
  );

  assertEquals(response.status, 400);
  assertEquals(ran, false);
});

Deno.test("weekly digest returns counts only for a valid signed scheduler request", async () => {
  const handler = createWeeklyDigestHandler({
    env: (name) => name === "WEEKLY_DIGEST_JOB_SECRET" ? SECRET : undefined,
    now: () => NOW_MS,
    runDigest: async () => ({ sent: 3, skipped: 2 }),
  });
  const response = await handler(
    await signedRequest(JSON.stringify({ day: 6 })),
  );

  assertEquals(response.status, 200);
  const body = JSON.parse(await response.text()) as Record<string, unknown>;
  assertJsonEquals(body, { sent: 3, skipped: 2 });
  assert(!("email" in body) && !("userId" in body) && !("results" in body));
});

Deno.test("weekly digest claims the day and execution date before recipient work", async () => {
  const events: string[] = [];
  const runner = createWeeklyDigestRunner(runnerOptions({
    claimJob: async () => {
      events.push("claim");
      return true;
    },
    listRecipients: async () => {
      events.push("list");
      return { recipients: [recipient(1)], hasMore: false };
    },
    sendDigest: async () => {
      events.push("send");
      return "sent";
    },
  }));

  const counts = await runner(6, JOB_KEY, EXECUTION_DATE);
  assertJsonEquals(counts, { sent: 1, skipped: 0 });
  assertJsonEquals(events, ["claim", "list", "send"]);
});

Deno.test("weekly digest does no user or email work when the job was already claimed", async () => {
  let listed = false;
  let sent = false;
  const runner = createWeeklyDigestRunner(runnerOptions({
    claimJob: async () => false,
    listRecipients: async () => {
      listed = true;
      return { recipients: [recipient(1)], hasMore: false };
    },
    sendDigest: async () => {
      sent = true;
      return "sent";
    },
  }));

  const counts = await runner(6, JOB_KEY, EXECUTION_DATE);
  assertJsonEquals(counts, { sent: 0, skipped: 0 });
  assertEquals(listed, false);
  assertEquals(sent, false);
});

Deno.test("weekly digest bounds pages and total recipients", async () => {
  const pages: Array<[number, number]> = [];
  const sentRecipients: string[] = [];
  const runner = createWeeklyDigestRunner(runnerOptions({
    pageSize: 2,
    maxRecipients: 3,
    listRecipients: async (_day, page, pageSize) => {
      pages.push([page, pageSize]);
      return page === 0
        ? { recipients: [recipient(1), recipient(2)], hasMore: true }
        : { recipients: [recipient(3), recipient(4)], hasMore: true };
    },
    sendDigest: async (user) => {
      sentRecipients.push(user.userId);
      return user.userId === "user-2" ? "skipped" : "sent";
    },
  }));

  const counts: WeeklyDigestCounts = await runner(6, JOB_KEY, EXECUTION_DATE);
  assertJsonEquals(counts, { sent: 2, skipped: 1 });
  assertJsonEquals(pages, [[0, 2], [1, 2]]);
  assertJsonEquals(sentRecipients, ["user-1", "user-2", "user-3"]);
});
