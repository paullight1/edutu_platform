import assert from "node:assert/strict";
import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { NestFactory, Reflector } from "@nestjs/core";
import { AppModule } from "../app.module.js";
import { ApiKeyGuard, getConfiguredEngineApiKeys } from "../auth/api-key.guard.js";
import { HealthController } from "../health/health.controller.js";
import { EngineController } from "../engine/engine.controller.js";
import { EngineService } from "../engine/engine.service.js";
import { assertSafeHttpUrl, resolvePublicAddress } from "../engine/url-safety.js";
import { buildEngineShareText } from "../engine/share-text.js";

type TestFn = () => void | Promise<void>;

const tests: Array<{ name: string; fn: TestFn }> = [];

function test(name: string, fn: TestFn) {
  tests.push({ name, fn });
}

async function withEnv(
  entries: Record<string, string | undefined>,
  fn: () => void | Promise<void>,
) {
  const snapshot = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(entries)) {
    snapshot.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    await fn();
  } finally {
    for (const [key, value] of snapshot.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function makeHttpContext(headers: Record<string, string | string[] | undefined>) {
  const request = { headers };
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  };
}

test("health controller reflects configured runtime flags", async () => {
  await withEnv(
    {
      EDUTU_ENGINE_API_KEYS: "alpha,beta",
      DEEPSEEK_API_KEY: "deepseek-test-key",
      SUPABASE_URL: "https://supabase.example.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    },
    async () => {
      const controller = new HealthController();
      const response = controller.health();

      assert.equal(response.status, "ok");
      assert.equal(response.service, "edutuengineapi");
      assert.equal(response.version, "0.1.0");
      assert.equal(response.checks.apiKeysConfigured, true);
      assert.equal(response.checks.deepseekConfigured, true);
      assert.equal(response.checks.supabaseConfigured, true);
      assert.ok(!Number.isNaN(Date.parse(response.timestamp)));
    },
  );
});

test("health controller reflects missing runtime flags", async () => {
  await withEnv(
    {
      EDUTU_ENGINE_API_KEYS: undefined,
      DEEPSEEK_API_KEY: undefined,
      SUPABASE_URL: undefined,
      SUPABASE_SERVICE_ROLE_KEY: undefined,
    },
    async () => {
      const controller = new HealthController();
      const response = controller.health();

      assert.equal(response.checks.apiKeysConfigured, false);
      assert.equal(response.checks.deepseekConfigured, false);
      assert.equal(response.checks.supabaseConfigured, false);
    },
  );
});

test("health endpoint is exposed on both /health and /v1/health", async () => {
  await withEnv(
    {
      EDUTU_ENGINE_API_KEYS: "alpha,beta",
      DEEPSEEK_API_KEY: "deepseek-test-key",
      SUPABASE_URL: "https://supabase.example.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    },
    async () => {
      const app = await NestFactory.create(AppModule, {
        logger: false,
        cors: true,
      });

      try {
        await app.listen(0, "127.0.0.1");
        const baseUrl = await app.getUrl();
        const [legacyResponse, versionedResponse] = await Promise.all([
          fetch(`${baseUrl}/health`).then((response) => response.json()),
          fetch(`${baseUrl}/v1/health`).then((response) => response.json()),
        ]);

        assert.equal(versionedResponse.status, legacyResponse.status);
        assert.equal(versionedResponse.service, legacyResponse.service);
        assert.equal(versionedResponse.version, legacyResponse.version);
        assert.deepEqual(versionedResponse.checks, legacyResponse.checks);
        assert.equal(versionedResponse.status, "ok");
        assert.equal(versionedResponse.service, "edutuengineapi");
        assert.ok(!Number.isNaN(Date.parse(versionedResponse.timestamp)));
      } finally {
        await app.close();
      }
    },
  );
});

test("discovery endpoint is exposed on both / and /v1", async () => {
  await withEnv(
    {
      EDUTU_ENGINE_API_KEYS: "alpha,beta",
      DEEPSEEK_API_KEY: "deepseek-test-key",
      SUPABASE_URL: "https://supabase.example.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
      EDUTU_ENGINE_DOCS_URL: "https://docs.edutu.org",
      EDUTU_ENGINE_DASHBOARD_URL: "https://www.edutu.org/developers",
      EDUTU_ENGINE_MARKETING_URL: "https://www.edutu.org/scholarship-engine",
      EDUTU_ENGINE_PUBLIC_URL: "http://localhost:3100/v1",
    },
    async () => {
      const app = await NestFactory.create(AppModule, {
        logger: false,
        cors: true,
      });

      try {
        await app.listen(0, "127.0.0.1");
        const baseUrl = await app.getUrl();
        const [rootResponse, versionedResponse] = await Promise.all([
          fetch(baseUrl).then((response) => response.json()),
          fetch(`${baseUrl}/v1`).then((response) => response.json()),
        ]);

        assert.equal(versionedResponse.status, "ok");
        assert.equal(versionedResponse.service, "edutuengineapi");
        assert.equal(versionedResponse.docsUrl, "https://docs.edutu.org");
        assert.equal(
          versionedResponse.dashboardUrl,
          "https://www.edutu.org/developers",
        );
        assert.equal(
          versionedResponse.marketingUrl,
          "https://www.edutu.org/scholarship-engine",
        );
        assert.ok(Array.isArray(versionedResponse.endpoints));
        assert.ok(
          versionedResponse.endpoints.some(
            (endpoint: { path: string }) => endpoint.path === "/v1/extract/url",
          ),
        );
        assert.ok(typeof versionedResponse.openapiUrl === "string");
        assert.match(versionedResponse.openapiUrl, /\/v1\/openapi\.json$/);
        assert.deepEqual(versionedResponse, rootResponse);
      } finally {
        await app.close();
      }
    },
  );
});

test("openapi document is exposed on both /openapi.json and /v1/openapi.json", async () => {
  await withEnv(
    {
      EDUTU_ENGINE_API_KEYS: "alpha,beta",
      DEEPSEEK_API_KEY: "deepseek-test-key",
      SUPABASE_URL: "https://supabase.example.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    },
    async () => {
      const app = await NestFactory.create(AppModule, {
        logger: false,
        cors: true,
      });

      try {
        await app.listen(0, "127.0.0.1");
        const baseUrl = await app.getUrl();
        const [rootSpec, versionedSpec] = await Promise.all([
          fetch(`${baseUrl}/openapi.json`).then((response) => response.json()),
          fetch(`${baseUrl}/v1/openapi.json`).then((response) =>
            response.json(),
          ),
        ]);

        assert.equal(versionedSpec.openapi, "3.1.0");
        assert.equal(versionedSpec.info.title, "Scholarship Engine API");
        assert.ok(versionedSpec.paths["/v1/extract/url"]);
        assert.ok(versionedSpec.paths["/v1/scrape/run"]);
        assert.ok(versionedSpec.components.securitySchemes.apiKeyAuth);
        assert.ok(versionedSpec.components.schemas.DiscoveryResponse);
        assert.deepEqual(versionedSpec, rootSpec);
      } finally {
        await app.close();
      }
    },
  );
});

test("discovery endpoint respects the configured openapi url override", async () => {
  await withEnv(
    {
      EDUTU_ENGINE_API_KEYS: "alpha,beta",
      EDUTU_ENGINE_OPENAPI_URL: "https://api.example.com/docs/openapi.json",
    },
    async () => {
      const controller = new (await import("../discovery/discovery.controller.js")).DiscoveryController();
      const overview = controller.getApiOverview() as any;

      assert.equal(
        overview.openapiUrl,
        "https://api.example.com/docs/openapi.json",
      );
    },
  );
});

test("API key helper trims configured keys and ignores empty entries", async () => {
  await withEnv(
    {
      EDUTU_ENGINE_API_KEYS: " alpha , , beta ,, gamma ",
    },
    async () => {
      assert.deepEqual(getConfiguredEngineApiKeys(), ["alpha", "beta", "gamma"]);
    },
  );
});

test("API key guard allows public routes without checking credentials", async () => {
  const publicReflector = {
    getAllAndOverride: () => true,
  } as unknown as Reflector;
  const publicGuard = new ApiKeyGuard(publicReflector);
  assert.equal(publicGuard.canActivate(makeHttpContext({}) as any), true);
});

test("API key guard accepts x-api-key and bearer token requests", async () => {
  await withEnv(
    {
      EDUTU_ENGINE_API_KEYS: "edutu_test_primary, edutu_test_secondary",
    },
    async () => {
      const reflector = {
        getAllAndOverride: () => undefined,
      } as unknown as Reflector;
      const guard = new ApiKeyGuard(reflector);

      assert.equal(
        guard.canActivate(
          makeHttpContext({ "x-api-key": "edutu_test_secondary" }) as any,
        ),
        true,
      );
      assert.equal(
        guard.canActivate(
          makeHttpContext({
            authorization: "Bearer edutu_test_primary",
          }) as any,
        ),
        true,
      );
    },
  );
});

test("API key guard rejects missing and mismatched credentials", async () => {
  await withEnv(
    {
      EDUTU_ENGINE_API_KEYS: "edutu_test_primary",
    },
    async () => {
      const reflector = {
        getAllAndOverride: () => undefined,
      } as unknown as Reflector;
      const guard = new ApiKeyGuard(reflector);

      assert.throws(
        () => guard.canActivate(makeHttpContext({}) as any),
        UnauthorizedException,
      );
      assert.throws(
        () =>
          guard.canActivate(
            makeHttpContext({ authorization: "Bearer wrong-key" }) as any,
          ),
        UnauthorizedException,
      );
    },
  );
});

test("safe URL validation accepts public HTTP URLs and preserves the parsed URL", () => {
  const parsed = assertSafeHttpUrl("https://example.com/opportunities/1?ref=home");

  assert.equal(parsed.hostname, "example.com");
  assert.equal(parsed.pathname, "/opportunities/1");
  assert.equal(parsed.search, "?ref=home");
});

test("safe URL validation blocks localhost, private IPs, and unsupported schemes", () => {
  assert.throws(() => assertSafeHttpUrl("http://localhost"), BadRequestException);
  assert.throws(() => assertSafeHttpUrl("https://127.0.0.1"), BadRequestException);
  assert.throws(() => assertSafeHttpUrl("ftp://example.com"), BadRequestException);
});

test("safe address resolution rejects obvious local and private hosts", async () => {
  await assert.rejects(() => resolvePublicAddress("localhost"), BadRequestException);
  await assert.rejects(() => resolvePublicAddress("127.0.0.1"), BadRequestException);
});

test("engine controller extract-url validates input and delegates to the service", async () => {
  const service = {
    extractOpportunityUrl: async (detailUrl: string, sourceUrl: string) => ({
      detailUrl,
      sourceUrl,
      title: "Validated opportunity",
    }),
  };
  const controller = new EngineController(service as any);

  const result = await controller.extractUrl({
    url: "https://example.com/opportunity/123?utm_source=feed",
    sourceUrl: "https://source.example.com/category/",
  });

  assert.equal(result.success, true);
  assert.deepEqual(result.opportunity, {
    detailUrl: "https://example.com/opportunity/123?utm_source=feed",
    sourceUrl: "https://source.example.com/category/",
    title: "Validated opportunity",
  });

  await assert.rejects(
    () => controller.extractUrl({ sourceUrl: "https://source.example.com" }),
    BadRequestException,
  );
});

test("engine controller scrape-run applies defaults and rejects oversized inputs", async () => {
  const calls: Array<{ url: string; options: { maxPages: number; limit: number } }> = [];
  const service = {
    runScrape: async (url: string, options: { maxPages: number; limit: number }) => {
      calls.push({ url, options });
      return { success: true, sourceUrl: url, discovered: 0, extracted: 0, opportunities: [], errors: [] };
    },
  };
  const controller = new EngineController(service as any);

  await controller.runScrape({ url: "https://source.example.com/feed" });
  await controller.runScrape({
    url: "https://source.example.com/feed",
    maxPages: 5,
    limit: 50,
  });

  assert.deepEqual(calls[0], {
    url: "https://source.example.com/feed",
    options: { maxPages: 1, limit: 20 },
  });
  assert.deepEqual(calls[1], {
    url: "https://source.example.com/feed",
    options: { maxPages: 5, limit: 50 },
  });

  await assert.rejects(
    () =>
      controller.runScrape({
        url: "https://source.example.com/feed",
        maxPages: 6,
      }),
    BadRequestException,
  );
});

test("share text helper formats active and expired opportunities", () => {
  const active = buildEngineShareText({
    title: "2026 KPMG Global Tech Innovator Competition",
    organization: "KPMG",
    category: "program",
    location: "All Countries",
    applicationUrl: "https://apply.example.com",
    metadata: { fundingType: "Full scholarship" },
  });
  assert.match(active, /^Still Active!/);
  assert.match(active, /Sponsor: KPMG/);
  assert.match(active, /Category: program/);
  assert.match(active, /Deadline: Not Specified/);
  assert.match(active, /https:\/\/apply\.example\.com/);

  const expired = buildEngineShareText({
    title: "Past Fellowship",
    organization: "Edutu",
    category: "fellowship",
    deadline: "2020-01-01",
  });
  assert.match(expired, /^Deadline Passed!/);
  assert.match(expired, /https:\/\/www\.edutu\.org/);
});

test("engine service runScrape deduplicates normalized URLs and respects limits", async () => {
  const service = new EngineService();
  const discoveredBatches = [
    [
      {
        title: "First opportunity",
        detailUrl: "https://example.com/opportunity/1?utm_source=feed",
        sourceUrl: "https://source.example.com",
      },
      {
        title: "First opportunity duplicate",
        detailUrl: "https://example.com/opportunity/1#section",
        sourceUrl: "https://source.example.com",
      },
      {
        title: "Second opportunity",
        detailUrl: "https://example.com/opportunity/2/",
        sourceUrl: "https://source.example.com",
      },
    ],
    [],
  ];
  let discoverCalls = 0;
  (service as any).discoverItems = async () => discoveredBatches[discoverCalls++] || [];
  const extracted: string[] = [];
  (service as any).extractOpportunityUrl = async (
    detailUrl: string,
    sourceUrl: string,
    seed: any,
  ) => {
    extracted.push(detailUrl);
    return {
      title: seed.title,
      summary: null,
      description: null,
      category: "other",
      organization: null,
      location: null,
      deadline: null,
      imageUrl: null,
      detailUrl,
      applicationUrl: null,
      sourceUrl,
      shareText: "share text",
      status: "needs_review",
      qualityScore: 80,
      missingFields: [],
      metadata: {},
    };
  };

  const result = await service.runScrape("https://source.example.com", {
    maxPages: 3,
    limit: 1,
  });

  assert.equal(discoverCalls, 2);
  assert.equal(result.success, true);
  assert.equal(result.discovered, 1);
  assert.equal(result.extracted, 1);
  assert.deepEqual(extracted, [
    "https://example.com/opportunity/1#section",
  ]);
});

test("engine service runScrape reports discovery failures when nothing can be extracted", async () => {
  const service = new EngineService();
  (service as any).discoverItems = async () => {
    throw new Error("discovery failed");
  };
  (service as any).extractOpportunityUrl = async () => {
    throw new Error("should not be called");
  };

  const result = await service.runScrape("https://source.example.com", {
    maxPages: 2,
    limit: 5,
  });

  assert.equal(result.success, false);
  assert.equal(result.discovered, 0);
  assert.equal(result.extracted, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /discovery failed/);
});

async function main() {
  let passed = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      passed += 1;
      console.log(`PASS ${name}`);
    } catch (error) {
      console.error(`FAIL ${name}`);
      console.error(error);
      process.exitCode = 1;
      break;
    }
  }

  console.log(`${passed}/${tests.length} tests passed`);
  if (process.exitCode) {
    process.exit(process.exitCode);
  }
}

void main();
