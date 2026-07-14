import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { OpportunityShareCardService } from "./opportunity-share-card.service";

// The service builds a Supabase client in its constructor. These tests stub
// ensureSharePdfForOpportunity, so they never touch the client and only need it
// to be non-null. Building a real one also reaches realtime-js, which throws on
// Node < 22 (no native WebSocket) and broke this suite on CI's Node 20.
jest.mock("@supabase/supabase-js", () => ({
  createClient: () => ({}),
}));

describe("OpportunityShareCardService", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  const restoreEnv = (key: keyof typeof originalEnv) => {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  };

  beforeEach(() => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
    delete process.env.OPPORTUNITY_SHARE_PDF_GENERATION;
    delete process.env.OPPORTUNITY_SHARE_PDF_CONCURRENCY;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    // Jest workers share process.env across spec files, so leaving these set
    // makes other suites build a real Supabase client and fail.
    restoreEnv("SUPABASE_URL");
    restoreEnv("SUPABASE_SERVICE_ROLE_KEY");
    jest.restoreAllMocks();
  });

  it("prewarms PDF assets for each opportunity", async () => {
    const service = new OpportunityShareCardService();
    const ensureSharePdfForOpportunity = jest
      .spyOn(service as any, "ensureSharePdfForOpportunity")
      .mockResolvedValue({ sharePdf: null, buffer: Buffer.from("pdf") });

    await service.ensureSharePdfsForOpportunities([
      { id: "opp-1" },
      { id: "opp-2" },
      { id: "opp-3" },
    ]);

    expect(ensureSharePdfForOpportunity).toHaveBeenCalledTimes(3);
  });

  it("uses the cached PDF URL when building a share buffer", async () => {
    const service = new OpportunityShareCardService();
    const cachedSharePdf = {
      url: "https://cdn.example.com/opportunity.pdf",
      path: "active/opp-1-abc123.pdf",
      format: "pdf" as const,
      generatedAt: new Date().toISOString(),
      fingerprint: "abc123",
      expiresAt: null,
    };

    jest
      .spyOn(service as any, "ensureSharePdfForOpportunity")
      .mockResolvedValue({
        sharePdf: cachedSharePdf,
      });

    const fetchMock = jest.spyOn(globalThis as any, "fetch").mockResolvedValue({
      ok: true,
      arrayBuffer: async () => Uint8Array.from([37, 80, 68, 70]).buffer,
    });

    const result = await service.buildSharePdfForOpportunity({ id: "opp-1" });

    expect(fetchMock).toHaveBeenCalledWith(cachedSharePdf.url);
    expect(result?.sharePdf).toEqual(cachedSharePdf);
    expect(result?.buffer).toBeInstanceOf(Buffer);
  });
});
