import { createHmac } from "node:crypto";
import {
  ScraperEgressRequestError,
  ScraperEgressService,
  buildPinnedHttpsRequestOptions,
  isGlobalUnicastAddress,
  parseApprovedEgressUrl,
  type ScraperEgressDependencies,
  type ScraperEgressTransportRequest,
} from "./scraper-egress.service";
import type { ScraperEgressEnabledConfig } from "./scraper-egress.config";

const NOW_MS = 1_700_000_000_000;
const TIMESTAMP = "1700000000";
const SHARED_SECRET = "e".repeat(32);

const config: ScraperEgressEnabledConfig = {
  enabled: true,
  sharedSecret: SHARED_SECRET,
  allowedHosts: ["approved.example", "redirect.example"],
  timeoutMs: 1_000,
  maxResponseBytes: 1_024,
  maxRedirects: 2,
  signatureMaxAgeSeconds: 300,
  maxRequestBytes: 4_096,
};

function signedRequest(url = "https://approved.example/page") {
  const rawBody = Buffer.from(JSON.stringify({ url }), "utf8");
  const signature = createHmac("sha256", SHARED_SECRET)
    .update(`${TIMESTAMP}.`)
    .update(rawBody)
    .digest("hex");
  return {
    rawBody,
    timestamp: TIMESTAMP,
    signature: `v1=${signature}`,
  };
}

function createService(
  overrides: Partial<ScraperEgressDependencies> = {},
): ScraperEgressService {
  return new ScraperEgressService(config, {
    now: () => NOW_MS,
    resolveHost: async () => [
      { address: "93.184.216.34", family: 4 as const },
    ],
    transport: async () => ({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: "<html>approved</html>",
    }),
    ...overrides,
  });
}

describe("scraper egress address policy", () => {
  it.each([
    "0.0.0.0",
    "10.1.2.3",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.0.0.1",
    "192.0.2.1",
    "192.168.1.1",
    "198.18.0.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "240.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "::ffff:127.0.0.1",
    "::ffff:8.8.8.8",
    "64:ff9b::808:808",
    "64:ff9b::a00:1",
    "64:ff9b:1::808:808",
    "100::1",
    "2001::1",
    "2001:db8::1",
    "2002:0808:0808::1",
    "3fff::1",
    "fc00::1",
    "fec0::1",
    "fe80::1",
    "ff00::1",
  ])("rejects non-global or transition address %s", (address) => {
    expect(isGlobalUnicastAddress(address)).toBe(false);
  });

  it.each([
    "1.1.1.1",
    "8.8.8.8",
    "93.184.216.34",
    "2606:4700:4700::1111",
    "2a00:1450:4009:80b::200e",
  ])("accepts global-unicast address %s", (address) => {
    expect(isGlobalUnicastAddress(address)).toBe(true);
  });

  it("rejects an explicit authority port even when URL would normalize :443 away", () => {
    expect(() =>
      parseApprovedEgressUrl(
        "https://approved.example:443/page",
        new Set(config.allowedHosts),
      ),
    ).toThrow(ScraperEgressRequestError);
  });
});

describe("address-pinned HTTPS transport contract", () => {
  it("pins lookup to the validated address while preserving hostname SNI and certificate checks", async () => {
    const url = new URL("https://approved.example/path?q=1");
    const options = buildPinnedHttpsRequestOptions(url, {
      address: "93.184.216.34",
      family: 4,
    });

    expect(options.hostname).toBe("approved.example");
    expect(options.servername).toBe("approved.example");
    expect(options.path).toBe("/path?q=1");
    expect(options.agent).toBe(false);
    expect(options.rejectUnauthorized).toBe(true);

    const lookup = options.lookup as (...args: any[]) => void;
    const result = await new Promise<{ address: string; family: number }>(
      (resolve, reject) => {
        lookup("approved.example", {}, (error: Error | null, address: string, family: number) => {
          if (error) reject(error);
          else resolve({ address, family });
        });
      },
    );
    expect(result).toEqual({ address: "93.184.216.34", family: 4 });
  });
});

describe("ScraperEgressService", () => {
  it("authenticates the exact raw body before resolving or fetching", async () => {
    const resolveHost = jest.fn();
    const transport = jest.fn();
    const service = createService({ resolveHost, transport });
    const request = signedRequest();

    await expect(
      service.fetchSigned({ ...request, signature: `v1=${"0".repeat(64)}` }),
    ).rejects.toMatchObject({ status: 401 });
    expect(resolveHost).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
  });

  it("rejects every DNS result when any answer is non-global", async () => {
    const transport = jest.fn();
    const service = createService({
      resolveHost: async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "64:ff9b::a00:1", family: 6 },
      ],
      transport,
    });

    await expect(service.fetchSigned(signedRequest())).rejects.toMatchObject({
      status: 502,
    });
    expect(transport).not.toHaveBeenCalled();
  });

  it("passes only a prevalidated address to the pinned transport", async () => {
    const requests: ScraperEgressTransportRequest[] = [];
    const service = createService({
      transport: async (request) => {
        requests.push(request);
        return {
          status: 200,
          contentType: "text/html",
          body: "<html>approved</html>",
        };
      },
    });

    await expect(service.fetchSigned(signedRequest())).resolves.toEqual({
      text: "<html>approved</html>",
      finalUrl: "https://approved.example/page",
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].address).toEqual({
      address: "93.184.216.34",
      family: 4,
    });
    expect(requests[0].url.hostname).toBe("approved.example");
  });

  it("revalidates redirects and rejects an explicit :443 authority before a second connection", async () => {
    const transport = jest.fn(async () => ({
      status: 302,
      location: "https://redirect.example:443/private",
    }));
    const service = createService({ transport });

    await expect(service.fetchSigned(signedRequest())).rejects.toMatchObject({
      status: 502,
    });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("rejects oversized and non-HTML successful responses", async () => {
    const oversized = createService({
      transport: async () => ({
        status: 200,
        contentType: "text/html",
        body: "x".repeat(config.maxResponseBytes + 1),
      }),
    });
    const nonHtml = createService({
      transport: async () => ({
        status: 200,
        contentType: "application/octet-stream",
        body: "binary",
      }),
    });

    await expect(oversized.fetchSigned(signedRequest())).rejects.toMatchObject({
      status: 502,
    });
    await expect(nonHtml.fetchSigned(signedRequest())).rejects.toMatchObject({
      status: 502,
    });
  });

  it("aborts the pinned transport at the configured deadline", async () => {
    const service = new ScraperEgressService(
      { ...config, timeoutMs: 10 },
      {
        now: () => NOW_MS,
        resolveHost: async () => [
          { address: "93.184.216.34", family: 4 },
        ],
        transport: ({ signal }) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener(
              "abort",
              () => reject(signal.reason),
              { once: true },
            );
          }),
      },
    );

    await expect(service.fetchSigned(signedRequest())).rejects.toMatchObject({
      status: 502,
    });
  });
});
