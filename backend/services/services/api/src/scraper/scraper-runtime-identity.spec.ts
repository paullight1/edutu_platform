import { ScraperService } from "./scraper.service";

describe("ScraperService runtime identity", () => {
  const originalEnv = { ...process.env };

  const createService = () =>
    new ScraperService(
      {
        getCronJob: jest.fn(() => {
          throw new Error("not scheduled");
        }),
      } as never,
      {
        listConfig: jest.fn().mockResolvedValue({
          routes: [],
          providerKeys: [],
        }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.RENDER_GIT_COMMIT;
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    delete process.env.GITHUB_SHA;
    delete process.env.APP_VERSION;
    delete process.env.npm_package_version;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns safe runtime identity without exposing configured secrets", async () => {
    process.env.NODE_ENV = "production";
    process.env.APP_VERSION = "2026.8.23";
    process.env.RENDER_GIT_COMMIT = "1234567890abcdef";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "must-not-leak";
    process.env.DEEPSEEK_API_KEY = "also-must-not-leak";

    const result = await createService().getEngineStatus();
    const runtime = (result as unknown as { runtime?: unknown }).runtime;

    expect(runtime).toEqual({
      service: "edutu-api",
      environment: "production",
      version: "2026.8.23",
      commit: "1234567890ab",
      startedAt: expect.any(String),
    });
    expect(JSON.stringify(result)).not.toContain("must-not-leak");
  });

  it("uses safe commit fallbacks and keeps the process start time stable", async () => {
    process.env.NODE_ENV = "staging";
    process.env.npm_package_version = "0.0.1";
    process.env.VERCEL_GIT_COMMIT_SHA = "vercel1234567890";
    process.env.GITHUB_SHA = "github-should-not-win";

    const service = createService();
    const first = await service.getEngineStatus();
    const second = await service.getEngineStatus();
    const firstRuntime = (
      first as unknown as {
        runtime?: { version?: string; commit?: string | null; startedAt?: string };
      }
    ).runtime;
    const secondRuntime = (
      second as unknown as { runtime?: { startedAt?: string } }
    ).runtime;

    expect(firstRuntime).toMatchObject({
      version: "0.0.1",
      commit: "vercel123456",
    });
    expect(firstRuntime?.startedAt).toBe(secondRuntime?.startedAt);
  });

  it("reports a null commit when no deployment SHA is available", async () => {
    const result = await createService().getEngineStatus();
    const runtime = (
      result as unknown as { runtime?: { commit?: string | null } }
    ).runtime;

    expect(runtime?.commit).toBeNull();
  });
});
