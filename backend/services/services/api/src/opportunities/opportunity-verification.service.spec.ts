import { OpportunityVerificationService } from "./opportunity-verification.service";
import { request as httpsRequest } from "node:https";
import { PgDialect } from "drizzle-orm/pg-core";
import { db } from "../db";

jest.mock("node:https", () => ({
  request: jest.fn(),
}));

jest.mock("node:dns/promises", () => ({
  lookup: jest.fn(),
}));

jest.mock("../db", () => ({
  db: {
    execute: jest.fn(),
  },
}));

import { lookup } from "node:dns/promises";

const mockedDb = db as unknown as {
  execute: jest.Mock;
};

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

  it("returns the pinned address as an array when Node requests all DNS answers", async () => {
    dnsLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const service = new OpportunityVerificationService({} as any);
    const request = httpsRequest as unknown as jest.Mock;
    let pinnedLookupResult: unknown[] = [];

    request.mockImplementation(
      (
        _url: URL,
        requestOptions: {
          lookup: (
            hostname: string,
            options: { all: boolean },
            callback: (...args: unknown[]) => void,
          ) => void;
        },
        callback: (response: unknown) => void,
      ) => {
        requestOptions.lookup(
          "public.example",
          { all: true },
          (...args: unknown[]) => {
            pinnedLookupResult = args;
          },
        );
        callback({
          statusCode: 200,
          headers: {},
          on: jest.fn((event: string, handler: () => void) => {
            if (event === "end") queueMicrotask(handler);
          }),
        });
        return {
          on: jest.fn(),
          setTimeout: jest.fn(),
          destroy: jest.fn(),
          end: jest.fn(),
        };
      },
    );

    await (service as any).fetchWithTimeout(
      "https://public.example/apply",
      "HEAD",
      100,
    );

    expect(pinnedLookupResult).toEqual([
      null,
      [{ address: "93.184.216.34", family: 4 }],
    ]);
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

describe("OpportunityVerificationService bulk verification query", () => {
  it("binds selected IDs as one PostgreSQL uuid-array parameter", async () => {
    const ids = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ];
    mockedDb.execute.mockResolvedValue({ rows: [] });
    const service = new OpportunityVerificationService({} as any);

    await service.verifyMany(ids, true);

    const statement = mockedDb.execute.mock.calls[0]?.[0];
    const query = new PgDialect().sqlToQuery(statement);
    expect(query.sql).toContain("where opportunity.id = any($1::uuid[])");
    expect(query.params).toEqual([ids]);
  });
});

describe("AI deadline evidence", () => {
  it.each([
    [
      { deadline: "2026-10-08", evidence: "Posted October 8, 2026" },
      "Posted October 8, 2026. Applications are open to all students.",
    ],
    [
      { deadline: "2026-10-30", evidence: "Deadline: October 30, 2026" },
      "Posted October 8, 2026. Applications are open to all students. No deadline announced.",
    ],
    [
      { deadline: "2026-10-30", evidence: "Deadline: November 11, 2026" },
      "Applications welcome to this fellowship. Deadline: November 11, 2026. Please apply online.",
    ],
  ])("rejects unsupported dates", async (result, text) => {
    const service = new OpportunityVerificationService({
      generateJson: jest.fn().mockResolvedValue(result),
    } as any);
    expect(
      await (service as any).extractDeadlineWithAi(
        { id: "test", title: "Fellowship" },
        text,
      ),
    ).toBeNull();
  });
  it("accepts an exact supported deadline quote", async () => {
    const service = new OpportunityVerificationService({
      generateJson: jest.fn().mockResolvedValue({
        deadline: "2026-11-11",
        evidence: "Deadline: November 11, 2026",
      }),
    } as any);
    expect(
      await (service as any).extractDeadlineWithAi(
        { id: "test", title: "Fellowship" },
        "Applications welcome to this fellowship. Deadline: November 11, 2026. Please apply online.",
      ),
    ).toMatchObject({ date: "2026-11-11" });
  });
});

describe("source deadline recovery safeguards", () => {
  function prepare(deadline: string, text: string) {
    jest.clearAllMocks();
    mockedDb.execute
      .mockResolvedValueOnce({
        rows: [
          {
            id: "1827885d-2d96-469e-b7f4-c580dd537334",
            title: "Fellowship 2026",
            status: "pending_review",
            source_url: "https://source.example/article",
            close_date: deadline,
            metadata: {},
          },
        ],
      })
      .mockResolvedValue({
        rows: [{ id: "1827885d-2d96-469e-b7f4-c580dd537334" }],
      });
    const service = new OpportunityVerificationService({} as any);
    (service as any).fetchPageText = jest
      .fn()
      .mockResolvedValue({ text, httpStatus: 200, error: null });
    (service as any).extractDeadlineWithAi = jest.fn().mockResolvedValue(null);
    return service;
  }
  it("marks an unsupported stored date for review without inventing a replacement", async () => {
    const service = prepare(
      "2026-10-30",
      "Applications are open. No closing date has been announced.",
    );
    expect(
      await service.refreshDeadlineFromSource(
        "1827885d-2d96-469e-b7f4-c580dd537334",
      ),
    ).toMatchObject({ updated: false, needsReview: true });
    const query = new PgDialect().sqlToQuery(mockedDb.execute.mock.calls[1][0]);
    expect(query.sql).toContain("deadline_needs_review");
    expect(query.sql).not.toContain("close_date =");
  });
  it("clears a stored publication date when the source has no application deadline", async () => {
    const service = prepare(
      "2026-10-08",
      "Published: October 8, 2026. Applications are open. No closing date has been announced.",
    );
    expect(
      await service.refreshDeadlineFromSource(
        "1827885d-2d96-469e-b7f4-c580dd537334",
      ),
    ).toMatchObject({
      updated: true,
      deadline: null,
      clearedAsPublicationDate: true,
    });
  });
});

describe("application page deadline fallback", () => {
  it("recovers a labeled date from the application page when the source article is blocked", async () => {
    jest.clearAllMocks();
    mockedDb.execute
      .mockResolvedValueOnce({
        rows: [
          {
            id: "1827885d-2d96-469e-b7f4-c580dd537334",
            title: "Fellowship 2026",
            source_url: "https://source.example/article",
            application_url: "https://provider.example/apply",
            metadata: {},
          },
        ],
      })
      .mockResolvedValue({
        rows: [{ id: "1827885d-2d96-469e-b7f4-c580dd537334" }],
      });
    const service = new OpportunityVerificationService({} as any);
    (service as any).fetchPageText = jest
      .fn()
      .mockResolvedValueOnce({ text: null, httpStatus: 403, error: "HTTP 403" })
      .mockResolvedValueOnce({
        text: "Application deadline: November 11, 2026. Applications are open.",
        httpStatus: 200,
        error: null,
      });
    expect(
      await service.refreshDeadlineFromSource(
        "1827885d-2d96-469e-b7f4-c580dd537334",
      ),
    ).toMatchObject({
      updated: true,
      deadline: "2026-11-11",
      sourceUrl: "https://provider.example/apply",
    });
  });
});
