import {
  type AuthDecision,
  createOpportunityExtractor,
  createRequestAuthenticator,
  createScrapeHandler,
} from "./index.ts";
import { createSafeFetchApprovedPage } from "../_shared/safe-fetch.ts";

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

async function assertRejects(operation: () => Promise<unknown>): Promise<void> {
  try {
    await operation();
  } catch {
    return;
  }
  throw new Error("Expected operation to reject");
}

function publicResolver(): Promise<string[]> {
  return Promise.resolve([
    "93.184.216.34",
    "2606:2800:220:1:248:1893:25c8:1946",
  ]);
}

function htmlResponse(
  body = "<html><body>Approved page</body></html>",
): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function safeFetcher(overrides: {
  allowedHosts?: string[];
  resolveHost?: (hostname: string) => Promise<string[]>;
  fetchImpl?: typeof fetch;
  maxBytes?: number;
  maxRedirects?: number;
  timeoutMs?: number;
} = {}) {
  return createSafeFetchApprovedPage({
    allowedHosts: overrides.allowedHosts ?? ["approved.example"],
    resolveHost: overrides.resolveHost ?? publicResolver,
    fetchImpl: overrides.fetchImpl ?? (async () => htmlResponse()),
    maxBytes: overrides.maxBytes ?? 1024,
    maxRedirects: overrides.maxRedirects ?? 2,
    timeoutMs: overrides.timeoutMs ?? 100,
  });
}

Deno.test("scrape handler rejects a request with no authentication before fetching", async () => {
  let fetched = false;
  const authenticate = createRequestAuthenticator({
    env: () => undefined,
    now: () => 1_700_000_000_000,
    verifyClerkAdminToken: async () => null,
  });
  const handler = createScrapeHandler({
    allowedOrigins: ["https://admin.edutu.org"],
    authenticate,
    safeFetch: async () => {
      fetched = true;
      return { text: "", finalUrl: "" };
    },
    extractOpportunity: async () => ({}),
  });

  const response = await handler(
    new Request("https://edge.test/scrape", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://approved.example/page" }),
    }),
  );

  assertEquals(response.status, 401);
  assertEquals(fetched, false);
  assertEquals(
    await response.text(),
    '{"error":"Request could not be processed"}',
  );
});

Deno.test("scrape handler rejects wildcard request origins without CORS reflection", async () => {
  let authenticated = false;
  const handler = createScrapeHandler({
    allowedOrigins: ["https://admin.edutu.org"],
    authenticate: async () => {
      authenticated = true;
      return { ok: true, kind: "admin", principal: "admin:user_123" };
    },
    safeFetch: async () => ({ text: "", finalUrl: "" }),
    extractOpportunity: async () => ({}),
  });

  const response = await handler(
    new Request("https://edge.test/scrape", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "*",
      },
      body: JSON.stringify({ url: "https://approved.example/page" }),
    }),
  );

  assertEquals(response.status, 403);
  assertEquals(response.headers.has("access-control-allow-origin"), false);
  assertEquals(authenticated, false);
});

Deno.test("request authenticator accepts a fresh correctly signed internal job", async () => {
  const secret = "s".repeat(32);
  const body = '{"url":"https://approved.example/page"}';
  const timestamp = "1700000000";
  const jobKey = "daily-scholarship-import";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signatureBytes = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${timestamp}.${jobKey}.${body}`),
    ),
  );
  const signature = Array.from(signatureBytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const authenticate = createRequestAuthenticator({
    env: (name) => name === "SCRAPE_INTERNAL_JOB_SECRET" ? secret : undefined,
    now: () => 1_700_000_000_000,
    verifyClerkAdminToken: async () => null,
  });

  const decision = await authenticate(
    new Request("https://edge.test/scrape", {
      method: "POST",
      headers: {
        "x-edutu-job-key": jobKey,
        "x-edutu-job-timestamp": timestamp,
        "x-edutu-job-signature": `v1=${signature}`,
      },
      body,
    }),
    body,
  );

  assert(decision.ok);
  assertEquals(decision.principal, `job:${jobKey}`);
});

Deno.test("request authenticator returns forbidden for a verified non-admin Clerk user", async () => {
  const authenticate = createRequestAuthenticator({
    env: () => undefined,
    now: () => 1_700_000_000_000,
    verifyClerkAdminToken: async () => ({ status: "forbidden" }),
  });

  const decision = await authenticate(
    new Request("https://edge.test/scrape", {
      method: "POST",
      headers: { authorization: "Bearer signed-clerk-token" },
      body: "{}",
    }),
    "{}",
  );

  assertEquals(decision.ok, false);
  assertEquals((decision as Extract<AuthDecision, { ok: false }>).status, 403);
});

Deno.test("safe fetch rejects plain HTTP", async () => {
  await assertRejects(() => safeFetcher()("http://approved.example/page"));
});

for (
  const [label, url, addresses, allowedHosts] of [
    ["IPv4 loopback", "https://127.0.0.1/admin", [] as string[], ["127.0.0.1"]],
    ["IPv6 loopback", "https://[::1]/admin", [] as string[], ["::1"]],
    ["RFC1918 10/8", "https://approved.example/admin", ["10.1.2.3"], [
      "approved.example",
    ]],
    ["RFC1918 172.16/12", "https://approved.example/admin", ["172.16.2.3"], [
      "approved.example",
    ]],
    ["RFC1918 192.168/16", "https://approved.example/admin", ["192.168.2.3"], [
      "approved.example",
    ]],
    ["link-local", "https://approved.example/admin", ["169.254.1.1"], [
      "approved.example",
    ]],
    ["cloud metadata address", "https://approved.example/latest/meta-data", [
      "169.254.169.254",
    ], ["approved.example"]],
  ] as const
) {
  Deno.test(`safe fetch rejects ${label}`, async () => {
    let fetched = false;
    const fetchPage = safeFetcher({
      allowedHosts: [...allowedHosts],
      resolveHost: async () => [...addresses],
      fetchImpl: async () => {
        fetched = true;
        return htmlResponse();
      },
    });

    await assertRejects(() => fetchPage(url));
    assertEquals(fetched, false);
  });
}

Deno.test("safe fetch rejects a host outside the exact allowlist", async () => {
  let resolved = false;
  const fetchPage = safeFetcher({
    resolveHost: async () => {
      resolved = true;
      return ["93.184.216.34"];
    },
  });

  await assertRejects(() => fetchPage("https://sub.approved.example/page"));
  assertEquals(resolved, false);
});

Deno.test("safe fetch rejects redirects beyond the configured cap", async () => {
  let calls = 0;
  const fetchPage = safeFetcher({
    maxRedirects: 2,
    fetchImpl: async () => {
      calls += 1;
      return new Response(null, {
        status: 302,
        headers: { location: `/redirect-${calls}` },
      });
    },
  });

  await assertRejects(() => fetchPage("https://approved.example/start"));
  assertEquals(calls, 3);
});

Deno.test("safe fetch revalidates redirected hosts and rejects private DNS answers", async () => {
  let calls = 0;
  const fetchPage = safeFetcher({
    allowedHosts: ["approved.example", "approved-redirect.example"],
    resolveHost: async (hostname) =>
      hostname === "approved.example" ? ["93.184.216.34"] : ["10.0.0.8"],
    fetchImpl: async () => {
      calls += 1;
      return new Response(null, {
        status: 302,
        headers: { location: "https://approved-redirect.example/private" },
      });
    },
  });

  await assertRejects(() => fetchPage("https://approved.example/start"));
  assertEquals(calls, 1);
});

Deno.test("safe fetch rejects a streamed response larger than the byte cap", async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("1234"));
      controller.enqueue(new TextEncoder().encode("5678"));
      controller.close();
    },
  });
  const fetchPage = safeFetcher({
    maxBytes: 7,
    fetchImpl: async () =>
      new Response(stream, {
        headers: { "content-type": "text/html" },
      }),
  });

  await assertRejects(() => fetchPage("https://approved.example/page"));
});

Deno.test("safe fetch aborts a request after its deadline", async () => {
  let aborted = false;
  const fetchPage = safeFetcher({
    timeoutMs: 10,
    fetchImpl: (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          aborted = true;
          reject(
            init.signal?.reason ?? new DOMException("Aborted", "AbortError"),
          );
        }, { once: true });
      }),
  });

  await assertRejects(() => fetchPage("https://approved.example/page"));
  assertEquals(aborted, true);
});

Deno.test("safe fetch rejects a non-HTML response", async () => {
  const fetchPage = safeFetcher({
    fetchImpl: async () =>
      new Response("binary", {
        headers: { "content-type": "application/octet-stream" },
      }),
  });

  await assertRejects(() => fetchPage("https://approved.example/file"));
});

Deno.test("safe fetch returns a bounded approved HTTPS page and final URL", async () => {
  const seenHosts: string[] = [];
  const fetchPage = safeFetcher({
    resolveHost: async (hostname) => {
      seenHosts.push(hostname);
      return ["93.184.216.34"];
    },
  });

  const result = await fetchPage("https://APPROVED.example/page#fragment");

  assert(result.text.includes("Approved page"));
  assertEquals(result.finalUrl, "https://approved.example/page");
  assertEquals(seenHosts.join(","), "approved.example");
});

Deno.test("scrape handler returns only a generic error when an approved upstream fails", async () => {
  const handler = createScrapeHandler({
    allowedOrigins: [],
    authenticate: async () => ({
      ok: true,
      kind: "job",
      principal: "job:daily-scholarship-import",
    }),
    safeFetch: async () => {
      throw new Error("upstream exposed its internal hostname and URL");
    },
    extractOpportunity: async () => ({}),
  });

  const response = await handler(
    new Request("https://edge.test/scrape", {
      method: "POST",
      body: JSON.stringify({
        url: "https://approved.example/page?secret=value",
      }),
    }),
  );

  assertEquals(response.status, 502);
  assertEquals(
    await response.text(),
    '{"error":"Request could not be processed"}',
  );
});

Deno.test("AI extraction caps attacker-controlled page text before provider input", async () => {
  let providerPrompt = "";
  const extractOpportunity = createOpportunityExtractor({
    apiKey: "server-only-key",
    fetchImpl: async (_input, init) => {
      const payload = JSON.parse(String(init?.body)) as {
        messages: Array<{ content: string }>;
      };
      providerPrompt = payload.messages[0].content;
      return Response.json({
        choices: [{ message: { content: "{}" } }],
      });
    },
  });

  await extractOpportunity(
    `${"A".repeat(8_100)}NEVER_SEND_THIS_MARKER`,
    "https://approved.example/page",
  );

  assertEquals(providerPrompt.includes("NEVER_SEND_THIS_MARKER"), false);
  assert(providerPrompt.includes("A".repeat(8_000)));
});
