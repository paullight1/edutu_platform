import { HttpException } from "@nestjs/common";
import { IS_PUBLIC_KEY } from "../auth/public.decorator";
import { ScraperEgressController } from "./scraper-egress.controller";
import { ScraperEgressRequestError } from "./scraper-egress.service";

describe("ScraperEgressController", () => {
  const fetchSigned = jest.fn();
  const controller = new ScraperEgressController({ fetchSigned } as any);

  beforeEach(() => jest.clearAllMocks());

  it("is public only to the global Clerk guard and still requires its internal signature", () => {
    expect(
      Reflect.getMetadata(IS_PUBLIC_KEY, ScraperEgressController),
    ).toBe(true);
  });

  it("passes the exact raw bytes and signature headers to the service", async () => {
    const rawBody = Buffer.from('{"url":"https://approved.example/page"}');
    fetchSigned.mockResolvedValue({
      text: "<html>approved</html>",
      finalUrl: "https://approved.example/page",
    });
    const request = {
      rawBody,
      get: (name: string) =>
        ({
          "x-edutu-egress-timestamp": "1700000000",
          "x-edutu-egress-signature": `v1=${"a".repeat(64)}`,
        })[name.toLowerCase()],
    };

    await expect(controller.fetch(request as any)).resolves.toEqual({
      text: "<html>approved</html>",
      finalUrl: "https://approved.example/page",
    });
    expect(fetchSigned).toHaveBeenCalledWith({
      rawBody,
      timestamp: "1700000000",
      signature: `v1=${"a".repeat(64)}`,
    });
  });

  it("returns only the generic error contract for internal failures", async () => {
    fetchSigned.mockRejectedValue(new ScraperEgressRequestError(502));

    let thrown: unknown;
    try {
      await controller.fetch({ rawBody: Buffer.from("{}"), get: () => undefined } as any);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(HttpException);
    expect((thrown as HttpException).getStatus()).toBe(502);
    expect((thrown as HttpException).getResponse()).toEqual({
      error: "Request could not be processed",
    });
  });

  it("passes the signed principal and socket address without trusting forwarded headers", async () => {
    fetchSigned.mockResolvedValue({
      text: "<html>approved</html>",
      finalUrl: "https://approved.example/page",
    });

    await expect(
      controller.fetch({
        rawBody: Buffer.from('{"url":"https://approved.example/page"}'),
        get: (name: string) =>
          ({ "x-edutu-egress-principal": "job:a" })[name.toLowerCase()],
        socket: { remoteAddress: "203.0.113.10" },
        headers: { "x-forwarded-for": "198.51.100.7" },
      } as any),
    ).resolves.toBeDefined();

    expect(fetchSigned).toHaveBeenCalledWith(
      expect.objectContaining({
        principal: "job:a",
        clientIp: "203.0.113.10",
      }),
    );
  });
});
