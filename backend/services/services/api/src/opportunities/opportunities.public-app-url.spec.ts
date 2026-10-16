import { getPublicAppBaseUrl } from "./opportunity-public-app-url";

describe("public app URL", () => {
  it("defaults to the Scholarship Engine main app domain", () => {
    expect(getPublicAppBaseUrl({})).toBe("https://www.edutu.org");
  });

  it("respects the configured public app url", () => {
    expect(
      getPublicAppBaseUrl({ EDUTU_PUBLIC_APP_URL: "https://app.edutu.org/" }),
    ).toBe("https://app.edutu.org");
  });

  it("normalizes the bare public domain to the canonical www host", () => {
    expect(
      getPublicAppBaseUrl({ EDUTU_PUBLIC_APP_URL: "https://edutu.org/" }),
    ).toBe("https://www.edutu.org");
  });
});
