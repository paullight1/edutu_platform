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

  it("renders a flyer canvas containing the opportunity's real details", () => {
    const service = new OpportunityShareCardService();
    const svg = (service as any).renderSvg({
      id: "opp-flyer",
      title: "ECOWAS Young Professional Programme",
      organization: "ECOWAS Bank for Investment and Development",
      category: "Fellowship",
      summary: "A professional development opportunity.",
      close_date: "2026-10-30",
      location: "West Africa",
      application_url: "https://example.org/apply",
      benefits: ["Competitive salary"],
      requirements: ["Bachelor's degree"],
      metadata: {},
    });

    expect(svg).toContain('width="1080" height="1350"');
    expect(svg).toContain('viewBox="0 0 1080 1350"');
    expect(svg).toContain("ECOWAS Young Professional");
    expect(svg).toContain("Programme");
    expect(svg).toContain("ECOWAS Bank for Investment and");
    expect(svg).toContain("FELLOWSHIP");
    expect(svg).toContain("Competitive salary");
    expect(svg).toContain("Bachelor's degree");
  });

  it("places generated artwork behind the verified flyer text", () => {
    const service = new OpportunityShareCardService();
    const svg = (service as any).renderSvg(
      {
        id: "opp-ai-flyer",
        title: "ECOWAS Young Professional Programme",
        organization: "ECOWAS Bank for Investment and Development",
        category: "Fellowship",
        summary: "A professional development opportunity.",
        close_date: "2026-10-30",
        metadata: {},
      },
      { data: Buffer.from("generated-artwork"), mimeType: "image/png" },
    );

    expect(svg).toContain("data:image/png;base64,Z2VuZXJhdGVkLWFydHdvcms=");
    expect(svg).toContain('<image x="0" y="0" width="1080" height="1350"');
    expect(svg).toContain("url(#creativeShade)");
    expect(svg).toContain("ECOWAS Young Professional");
    expect(svg).toContain("OPPORTUNITY BRIEF");
  });

  it("fills sparse no-AI flyers with honest next steps instead of fake details", () => {
    const service = new OpportunityShareCardService();
    const svg = (service as any).renderSvg({
      id: "opp-sparse-flyer",
      title: "LAEL Fellowship Program",
      category: "Fellowships",
      summary: "A leadership fellowship for emerging environmental leaders.",
      application_url: "https://apply.example.org/form?campaign=long-token",
      metadata: {},
    });

    expect(svg).toContain("A GOOD PLACE TO START");
    expect(svg).toContain("Check your eligibility.");
    expect(svg).toContain("apply.example.org");
    expect(svg).not.toContain("Worldwide");
    expect(svg).not.toContain("Open opportunity");
    expect(svg).not.toContain("campaign=long-token");
  });
  it("invalidates saved creative posters when verified details change", () => {
    const service = new OpportunityShareCardService();
    const opportunity = {
      id: "cache",
      title: "Fellowship",
      stipend: 1000,
      metadata: {},
    };
    const card = {
      url: "https://example.org/poster.png",
      fingerprint: (service as any).createFingerprint(opportunity),
    };
    const saved = { ...opportunity, metadata: { creative_share_card: card } };
    expect(service.getCreativeShareCard(saved)).toBe(card);
    expect(
      service.getCreativeShareCard({ ...saved, stipend: 2000 }),
    ).toBeNull();
    expect(
      service.getCreativeShareCard({
        ...saved,
        application_url: "https://example.org/apply",
      }),
    ).toBeNull();
  });

  it("does not advertise scraper machinery as the provider", () => {
    const service = new OpportunityShareCardService();
    const svg = (service as any).renderSvg({
      title: "Fellowship",
      source: "scraper",
      metadata: {},
    });
    expect(svg).not.toContain(">scraper<");
    expect(svg).not.toContain("Opportunity provider");
  });
  it("returns the branded cache separately without replacing the opportunity image", async () => {
    const service = new OpportunityShareCardService();
    const opportunity = { id: "variants", title: "Fellowship", metadata: {} };
    const fingerprint = (service as any).createFingerprint(opportunity);
    const branded = { url: "https://example.org/template.png", fingerprint };
    const creative = { url: "https://example.org/ai.png", fingerprint };
    const fallback = jest
      .spyOn(service as any, "ensureImageFallback")
      .mockResolvedValue(undefined);
    const saved = {
      ...opportunity,
      metadata: { share_card: creative, branded_share_card: branded },
    };
    expect(
      await service.ensureShareCardForOpportunity(saved, { design: "branded" }),
    ).toBe(branded);
    expect(fallback).not.toHaveBeenCalled();
  });
});
