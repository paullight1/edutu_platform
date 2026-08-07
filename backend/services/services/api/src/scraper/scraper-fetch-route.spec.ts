import axios from "axios";
import { ScraperHttpClient } from "./scraper-http-client";

let mockedGet: jest.SpyInstance;

const RELAY_PREFIX = "https://r.jina.ai/";
const TARGET = "https://blocked.example.com/list";

/**
 * Cloudflare 403s our datacenter IP on sources whose robots.txt allows us, so a
 * blocked fetch must fall back to the reader relay rather than report an empty
 * page as a clean run.
 */
describe("ScraperHttpClient routing (direct → relay)", () => {
  let client: ScraperHttpClient;

  beforeEach(async () => {
    jest.restoreAllMocks();
    mockedGet = jest.spyOn(axios, "get");
    client = new ScraperHttpClient({ warn: jest.fn() });
    // The relay throttle spaces calls seconds apart; irrelevant to routing.
    jest.spyOn(client as any, "throttleRelay").mockResolvedValue(undefined);
  });

  const isRelayCall = (url: string) => url.startsWith(RELAY_PREFIX);

  it("retries through the relay when the direct fetch is blocked", async () => {
    mockedGet.mockImplementation(async (url: string) =>
      isRelayCall(url)
        ? ({ status: 200, data: "<html>relayed</html>" } as any)
        : ({ status: 403, data: "denied" } as any),
    );

    const html = await client.fetchHtml(TARGET, 1_000);

    expect(html).toBe("<html>relayed</html>");
    expect(mockedGet).toHaveBeenCalledTimes(2);
    expect(mockedGet.mock.calls[1][0]).toBe(
      `${RELAY_PREFIX}${encodeURIComponent(TARGET)}`,
    );
  });

  it("skips the doomed direct hit for a host already known to block us", async () => {
    mockedGet.mockImplementation(async (url: string) =>
      isRelayCall(url)
        ? ({ status: 200, data: "<html>relayed</html>" } as any)
        : ({ status: 403, data: "denied" } as any),
    );

    await client.fetchHtml(TARGET, 1_000);
    mockedGet.mockClear();
    await client.fetchHtml("https://blocked.example.com/other-page", 1_000);

    expect(mockedGet).toHaveBeenCalledTimes(1);
    expect(isRelayCall(mockedGet.mock.calls[0][0])).toBe(true);
  });

  it("treats a relayed bot-challenge page as a block instead of content", async () => {
    mockedGet.mockResolvedValue({
      status: 200,
      data: "<html><title>Just a moment...</title>cf-browser-verification</html>",
    } as any);

    await expect(client.fetchHtml(TARGET, 1_000)).rejects.toThrow(
      /Bot challenge/i,
    );
  });

  it("unwraps relayed JSON so REST discovery still parses", async () => {
    const payload = [{ id: 22, slug: "bootcamps" }];
    mockedGet.mockImplementation(async (url: string) =>
      isRelayCall(url)
        ? ({
            status: 200,
            data: `<html><body><pre>${JSON.stringify(payload)}</pre></body></html>`,
          } as any)
        : ({ status: 403, data: "denied" } as any),
    );

    const res = await client.fetchRestResponse(
      "https://blocked.example.com/wp-json/wp/v2/categories?slug=bootcamps",
      1_000,
    );

    expect(res.status).toBe(200);
    expect(res.data).toEqual(payload);
  });

  it("does not relay a fetch that succeeds directly", async () => {
    mockedGet.mockResolvedValue({
      status: 200,
      data: "<html>direct</html>",
    } as any);

    const html = await client.fetchHtml(TARGET, 1_000);

    expect(html).toBe("<html>direct</html>");
    expect(mockedGet).toHaveBeenCalledTimes(1);
    expect(isRelayCall(mockedGet.mock.calls[0][0])).toBe(false);
  });
});
