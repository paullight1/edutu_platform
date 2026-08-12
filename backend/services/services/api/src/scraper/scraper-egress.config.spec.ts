import {
  ScraperEgressConfigError,
  loadScraperEgressConfig,
} from "./scraper-egress.config";

describe("loadScraperEgressConfig", () => {
  it("keeps the internal endpoint disabled when it is not explicitly enabled", () => {
    expect(loadScraperEgressConfig({})).toEqual({ enabled: false });
  });

  it("loads a bounded exact-host configuration", () => {
    expect(
      loadScraperEgressConfig({
        SCRAPE_EGRESS_ENABLED: "true",
        SCRAPE_EGRESS_SHARED_SECRET: "s".repeat(32),
        SCRAPE_EGRESS_ALLOWED_HOSTS:
          "approved.example, second-approved.example",
        SCRAPE_EGRESS_TIMEOUT_MS: "12000",
        SCRAPE_EGRESS_MAX_RESPONSE_BYTES: "1500000",
        SCRAPE_EGRESS_MAX_REDIRECTS: "4",
      }),
    ).toEqual({
      enabled: true,
      sharedSecret: "s".repeat(32),
      allowedHosts: ["approved.example", "second-approved.example"],
      timeoutMs: 12_000,
      maxResponseBytes: 1_500_000,
      maxRedirects: 4,
      signatureMaxAgeSeconds: 300,
      maxRequestBytes: 4_096,
    });
  });

  it.each([
    [{ SCRAPE_EGRESS_ENABLED: "yes" }, /exactly true or false/i],
    [
      {
        SCRAPE_EGRESS_ENABLED: "true",
        SCRAPE_EGRESS_SHARED_SECRET: "short",
        SCRAPE_EGRESS_ALLOWED_HOSTS: "approved.example",
      },
      /at least 32 bytes/i,
    ],
    [
      {
        SCRAPE_EGRESS_ENABLED: "true",
        SCRAPE_EGRESS_SHARED_SECRET: "s".repeat(32),
        SCRAPE_EGRESS_ALLOWED_HOSTS: "*.example.com",
      },
      /exact hostnames/i,
    ],
  ])("fails closed for invalid configuration", (environment, message) => {
    expect(() => loadScraperEgressConfig(environment)).toThrow(
      ScraperEgressConfigError,
    );
    expect(() => loadScraperEgressConfig(environment)).toThrow(message);
  });
});
