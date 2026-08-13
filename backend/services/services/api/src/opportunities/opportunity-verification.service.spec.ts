import { OpportunityVerificationService } from "./opportunity-verification.service";
import { request as httpsRequest } from "node:https";

jest.mock("node:https", () => ({
  request: jest.fn(),
}));

jest.mock("node:dns/promises", () => ({
  lookup: jest.fn(),
}));

import { lookup } from "node:dns/promises";

describe("OpportunityVerificationService outbound URL policy", () => {
  const dnsLookup = lookup as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    "http://127.0.0.1/apply",
    "http://localhost/apply",
    "http://169.254.169.254/latest/meta-data",
    "http://10.0.0.8/apply",
    "http://[::1]/apply",
    "http://[fd00::1]/apply",
    "http://2130706433/apply",
  ])(
    "rejects private, link-local, metadata, or encoded target %s",
    async (url) => {
      const service = new OpportunityVerificationService({} as any);
      await expect(
        (service as any).fetchWithTimeout(url, "GET", 100),
      ).rejects.toThrow(/unsafe|private|loopback|metadata/i);
      expect(dnsLookup).not.toHaveBeenCalled();
    },
  );

  it("rejects DNS names that resolve to private addresses before making a request", async () => {
    dnsLookup.mockResolvedValue([{ address: "192.168.1.9", family: 4 }]);
    const service = new OpportunityVerificationService({} as any);

    await expect(
      (service as any).fetchWithTimeout(
        "https://public.example/apply",
        "GET",
        100,
      ),
    ).rejects.toThrow(/unsafe|private/i);
  });

  it("does not follow a redirect into a private or metadata target", async () => {
    dnsLookup
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      .mockResolvedValueOnce([{ address: "169.254.169.254", family: 4 }]);
    const service = new OpportunityVerificationService({} as any);
    const request = httpsRequest as unknown as jest.Mock;
    request.mockImplementation(((
      _options: any,
      _requestOptions: any,
      callback: any,
    ) => {
      const response = {
        statusCode: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data" },
        on: (event: string, handler: (value?: unknown) => void) => {
          if (event === "end") handler();
        },
      };
      callback(response);
      return { on: jest.fn(), setTimeout: jest.fn(), end: jest.fn() } as any;
    }) as any);

    await expect(
      (service as any).fetchWithTimeout(
        "https://public.example/apply",
        "GET",
        100,
      ),
    ).rejects.toThrow(/unsafe|private|metadata/i);
    expect(request).toHaveBeenCalledTimes(1);
    request.mockReset();
  });

  it("stops redirect loops at the bounded outbound redirect limit", async () => {
    const service = new OpportunityVerificationService({} as any);
    const request = httpsRequest as unknown as jest.Mock;
    request.mockImplementation(((
      _options: any,
      _requestOptions: any,
      callback: any,
    ) => {
      callback({
        statusCode: 302,
        headers: { location: "https://93.184.216.34/apply" },
        on: (event: string, handler: (value?: unknown) => void) => {
          if (event === "end") handler();
        },
      });
      return { on: jest.fn(), setTimeout: jest.fn(), end: jest.fn() } as any;
    }) as any);

    await expect(
      (service as any).fetchWithTimeout(
        "https://93.184.216.34/apply",
        "GET",
        100,
      ),
    ).rejects.toThrow(/redirect limit/i);
    expect(request).toHaveBeenCalledTimes(6);
    request.mockReset();
  });
});
