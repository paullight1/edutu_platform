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
    dnsLookup.mockReset();
    (httpsRequest as unknown as jest.Mock).mockReset();
  });

  it.each([
    "http://127.0.0.1/apply",
    "http://localhost/apply",
    "http://169.254.169.254/latest/meta-data",
    "http://10.0.0.8/apply",
    "http://[::1]/apply",
    "http://[fd00::1]/apply",
    "http://[::ffff:7f00:1]/apply",
    "http://[0:0:0:0:0:ffff:7f00:1]/apply",
    "http://[::ffff:a9fe:a9fe]/latest/meta-data",
    "http://[::a00:1]/apply",
    "http://[0:0:0:0:0:0:c000:0201]/apply",
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

  it("revalidates hexadecimal mapped and compatible IPv4 redirects", async () => {
    dnsLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const service = new OpportunityVerificationService({} as any);
    const request = httpsRequest as unknown as jest.Mock;
    request.mockImplementation(((
      _options: any,
      _requestOptions: any,
      callback: any,
    ) => {
      callback({
        statusCode: 302,
        headers: { location: "http://[::ffff:7f00:1]/apply" },
        on: (event: string, handler: (value?: unknown) => void) => {
          if (event === "end") handler();
        },
      });
      return { on: jest.fn(), setTimeout: jest.fn(), end: jest.fn() } as any;
    }) as any);

    await expect(
      (service as any).fetchWithTimeout(
        "https://public.example/apply",
        "GET",
        100,
      ),
    ).rejects.toThrow(/unsafe|private|loopback|metadata/i);
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

  it("rejects a declared response body larger than the verification cap", async () => {
    const service = new OpportunityVerificationService({} as any);
    const request = httpsRequest as unknown as jest.Mock;
    const requestHandle = {
      on: jest.fn(),
      setTimeout: jest.fn(),
      destroy: jest.fn(),
      end: jest.fn(),
    };
    const response = {
      statusCode: 200,
      headers: { "content-length": "500001" },
      destroy: jest.fn(),
      on: jest.fn(),
    };
    request.mockImplementation(((
      _options: any,
      _requestOptions: any,
      callback: any,
    ) => {
      queueMicrotask(() => callback(response));
      return requestHandle as any;
    }) as any);

    await expect(
      (service as any).fetchWithTimeout(
        "https://93.184.216.34/large",
        "GET",
        100,
      ),
    ).rejects.toThrow(/response body/i);
    expect(response.destroy).toHaveBeenCalled();
    expect(requestHandle.destroy).toHaveBeenCalled();
    request.mockReset();
  });

  it("aborts an oversized GET body used after HEAD fallback", async () => {
    const service = new OpportunityVerificationService({} as any);
    const request = httpsRequest as unknown as jest.Mock;
    const headResponse = {
      statusCode: 405,
      headers: {},
      on: jest.fn((event: string, handler: () => void) => {
        if (event === "end") handler();
      }),
      destroy: jest.fn(),
    };
    const getResponse = {
      statusCode: 200,
      headers: {},
      on: jest.fn((event: string, handler: (chunk?: Buffer) => void) => {
        if (event === "data") handler(Buffer.alloc(500001));
      }),
      destroy: jest.fn(),
    };
    const requestHandles: Array<{ destroy: jest.Mock }> = [];
    request.mockImplementation(((
      _options: any,
      requestOptions: any,
      callback: any,
    ) => {
      const handle = {
        on: jest.fn(),
        setTimeout: jest.fn(),
        destroy: jest.fn(),
        end: jest.fn(),
      };
      requestHandles.push(handle);
      queueMicrotask(() =>
        callback(requestOptions.method === "HEAD" ? headResponse : getResponse),
      );
      return handle as any;
    }) as any);

    const result = await (service as any).checkUrl(
      "https://93.184.216.34/large",
    );

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/response body/i);
    expect(getResponse.destroy).toHaveBeenCalled();
    expect(requestHandles[1].destroy).toHaveBeenCalled();
    request.mockReset();
  });

  it("aborts in-flight verification work when the hard timeout fires", async () => {
    jest.useFakeTimers();
    try {
      const service = new OpportunityVerificationService({} as any);
      let signal: AbortSignal | undefined;
      jest
        .spyOn(service, "verifyOne")
        .mockImplementation(
          async (
            _id: string,
            _dryRun = false,
            context?: { signal?: AbortSignal },
          ) => {
            signal = context?.signal;
            return await new Promise(() => undefined);
          },
        );

      const pending = (service as any).verifyWithHardTimeout(
        "11111111-1111-4111-8111-111111111111",
      );
      const rejection = expect(pending).rejects.toThrow(/timed out/i);
      await jest.advanceTimersByTimeAsync(90000);

      await rejection;
      expect(signal?.aborted).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});
