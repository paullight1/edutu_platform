import { ScraperController } from "./scraper.controller";

describe("ScraperController runtime identity", () => {
  const originalEnv = { ...process.env };

  const createController = () =>
    new ScraperController(
      {
        getEngineStatus: jest.fn().mockResolvedValue({
          success: true,
          database: { configured: false, reachable: false },
          ai: {
            deepseekConfigured: false,
            geminiConfigured: false,
            source: "missing",
            feature: "scraper.extract",
            provider: "deepseek",
            model: "deepseek-chat",
            enabled: true,
          },
          scraper: {
            schedulerEnabled: false,
            autoRunEnabled: false,
            cronSchedule: "0 0 * * *",
          },
        }),
      } as never,
      {} as never,
    );

  beforeEach(() => {
    process.env = { ...originalEnv };
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

    const result = await createController().getEngineStatus();

    expect(result.runtime).toEqual({
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

    const controller = createController();
    const first = await controller.getEngineStatus();
    const second = await controller.getEngineStatus();

    expect(first.runtime).toMatchObject({
      environment: "staging",
      version: "0.0.1",
      commit: "vercel123456",
    });
    expect(first.runtime.startedAt).toBe(second.runtime.startedAt);
  });

  it("reports a null commit when no deployment SHA is available", async () => {
    const result = await createController().getEngineStatus();

    expect(result.runtime.commit).toBeNull();
  });
});
