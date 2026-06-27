import { OpportunitiesService } from "./opportunities.service";

describe("OpportunitiesService public app URL", () => {
  const originalEnv = {
    EDUTU_PUBLIC_APP_URL: process.env.EDUTU_PUBLIC_APP_URL,
    PUBLIC_WEB_APP_URL: process.env.PUBLIC_WEB_APP_URL,
    WEB_APP_URL: process.env.WEB_APP_URL,
    FRONTEND_URL: process.env.FRONTEND_URL,
    APP_URL: process.env.APP_URL,
  };

  afterEach(() => {
    process.env.EDUTU_PUBLIC_APP_URL = originalEnv.EDUTU_PUBLIC_APP_URL;
    process.env.PUBLIC_WEB_APP_URL = originalEnv.PUBLIC_WEB_APP_URL;
    process.env.WEB_APP_URL = originalEnv.WEB_APP_URL;
    process.env.FRONTEND_URL = originalEnv.FRONTEND_URL;
    process.env.APP_URL = originalEnv.APP_URL;
  });

  it("defaults to the Scholarship Engine main app domain", () => {
    delete process.env.EDUTU_PUBLIC_APP_URL;
    delete process.env.PUBLIC_WEB_APP_URL;
    delete process.env.WEB_APP_URL;
    delete process.env.FRONTEND_URL;
    delete process.env.APP_URL;

    const service = new OpportunitiesService({} as any, {} as any, {} as any);

    expect(service.getPublicAppBaseUrl()).toBe("https://www.edutu.org");
  });

  it("respects the configured public app url", () => {
    process.env.EDUTU_PUBLIC_APP_URL = "https://app.edutu.org/";

    const service = new OpportunitiesService({} as any, {} as any, {} as any);

    expect(service.getPublicAppBaseUrl()).toBe("https://app.edutu.org");
  });
});
