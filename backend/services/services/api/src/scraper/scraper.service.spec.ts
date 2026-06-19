import { Test, TestingModule } from "@nestjs/testing";
import { ScraperService } from "./scraper.service";
import { SchedulerRegistry } from "@nestjs/schedule";
import { AiService } from "../ai";
import { OpportunityShareCardService } from "../opportunities/opportunity-share-card.service";

describe("ScraperService", () => {
  let service: ScraperService;

  const mockSchedulerRegistry = {
    deleteCronJob: jest.fn(),
    addCronJob: jest.fn(),
  };
  const mockAiService = {
    generateJson: jest.fn(),
  };
  const mockOpportunityShareCardService = {
    ensureShareCardsForOpportunities: jest.fn(),
    ensureSharePdfsForOpportunities: jest.fn(),
    ensureShareCardForOpportunity: jest.fn(),
    buildSharePdfForOpportunity: jest.fn(),
  };

  beforeEach(async () => {
    // Clear env vars to test fallback behavior
    const originalEnv = { ...process.env };
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScraperService,
        { provide: SchedulerRegistry, useValue: mockSchedulerRegistry },
        { provide: AiService, useValue: mockAiService },
        {
          provide: OpportunityShareCardService,
          useValue: mockOpportunityShareCardService,
        },
      ],
    }).compile();

    service = module.get<ScraperService>(ScraperService);

    // Restore env
    Object.assign(process.env, originalEnv);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("getSettings", () => {
    it("should return defaults when Supabase not configured", async () => {
      const settings = await service.getSettings();
      expect(settings).toEqual({
        auto_run_enabled: false,
        cron_schedule: "0 0 * * *",
      });
    });
  });

  describe("runScraper", () => {
    it("should return mock data when Supabase not configured", async () => {
      const result = await service.runScraper({ allSources: true });
      expect(result.success).toBe(true);
      expect(result.sourcesScraped).toBe(1);
    });
  });

  describe("parseAmount", () => {
    it("should parse USD amount", () => {
      const result = (service as any).parseAmount("$5000");
      expect(result.stipend).toBe(5000);
      expect(result.currency).toBe("USD");
    });

    it("should parse EUR amount", () => {
      const result = (service as any).parseAmount("€3000");
      expect(result.stipend).toBe(3000);
      expect(result.currency).toBe("EUR");
    });

    it("should parse GBP amount", () => {
      const result = (service as any).parseAmount("£2500");
      expect(result.stipend).toBe(2500);
      expect(result.currency).toBe("GBP");
    });

    it("should return null for invalid amount", () => {
      const result = (service as any).parseAmount("no amount here");
      expect(result.stipend).toBeNull();
      expect(result.currency).toBe("USD");
    });

    it("should return null for null input", () => {
      const result = (service as any).parseAmount(null);
      expect(result.stipend).toBeNull();
      expect(result.currency).toBe("USD");
    });
  });

  describe("parseDate", () => {
    it("should parse valid ISO date", () => {
      const result = (service as any).parseDate("2025-06-15");
      expect(result).toBe("2025-06-15");
    });

    it("should return null for invalid date", () => {
      const result = (service as any).parseDate("not-a-date");
      expect(result).toBeNull();
    });

    it("should return null for null input", () => {
      const result = (service as any).parseDate(null);
      expect(result).toBeNull();
    });
  });

  describe("cleanText", () => {
    it("should clean and truncate text", () => {
      const result = (service as any).cleanText("  Hello   World  ");
      expect(result).toBe("Hello World");
    });

    it("should truncate to 500 chars", () => {
      const longText = "a".repeat(600);
      const result = (service as any).cleanText(longText);
      expect(result.length).toBe(500);
    });

    it("should handle null/undefined", () => {
      const result = (service as any).cleanText(null);
      expect(result).toBe("");
    });
  });

  describe("public opportunity cleanup", () => {
    it("removes scraper source artifacts from transformed opportunities", () => {
      const transformed = (service as any).transformToOpportunity(
        {
          title:
            "The Bridge Fully funded Leadership Residential Bootcamp 2026 (Nationwide for Nigerian Students)",
          apply_url:
            "https://jobs.smartyacad.com/the-bridge-leadership-residential-bootcamp-2026/",
          direct_apply_url: "https://thebridgeleadership.org/apply",
          description:
            "The Bridge Fully funded Leadership Residential Bootcamp 2026 By Admin On May 19, 2026 Applications are now open for The Bridge Program Fellowship 2026, a fully funded leadership accelerator programme designed for high potential young Nigerians interested in leadership, innovation, policy.",
          requirements: [
            "Review the official dixcoverhubx bootcamp page for final eligibility rules before applying.",
            "Open to young Nigerians interested in leadership, innovation, and policy.",
          ],
          benefits: [
            "Scholarships access through dixcoverhubx bootcamp.",
            "Fully funded residential leadership bootcamp.",
          ],
          application_process: ["Online application"],
          deadline: "2026-05-18",
          location: "Nigeria",
          source: "DixcoverHubX Bootcamp",
          source_url: "https://jobs.smartyacad.com/category/bootcamp/",
        },
        "job-123",
      );

      const publicText = [
        transformed.title,
        transformed.summary,
        transformed.organization,
        transformed.description,
        ...(transformed.tags as string[]),
        ...((transformed.metadata as any).requirements as string[]),
        ...((transformed.metadata as any).benefits as string[]),
      ].join(" ");

      expect(publicText).not.toMatch(/dixcoverhubx|smartyacad|by admin|scraped/i);
      expect(transformed.organization).toBe("The Bridge");
      expect(transformed.tags).not.toContain("Scraped");
      expect((transformed.metadata as any).requirements).toContain(
        "Open to young Nigerians interested in leadership, innovation, and policy.",
      );
      expect((transformed.metadata as any).requirements).not.toEqual(
        expect.arrayContaining([expect.stringMatching(/dixcoverhubx/i)]),
      );
    });
  });

  describe("resolveUrl", () => {
    it("should resolve relative paths against source URLs", () => {
      const result = (service as any).resolveUrl(
        "/scholarships/example",
        "https://opportunitiescircle.com/scholarships/",
      );

      expect(result).toBe(
        "https://opportunitiescircle.com/scholarships/example",
      );
    });

    it("should preserve absolute URLs", () => {
      const result = (service as any).resolveUrl(
        "https://provider.example/apply",
        "https://opportunitiescircle.com/scholarships/",
      );

      expect(result).toBe("https://provider.example/apply");
    });
  });

  describe("categorize", () => {
    it("should categorize computer science opportunities", () => {
      const result = (service as any).categorize(
        "Software Engineering Scholarship",
      );
      expect(result).toBe("Computer Science");
    });

    it("should categorize business opportunities", () => {
      const result = (service as any).categorize("MBA Fellowship Program");
      expect(result).toBe("Business");
    });

    it("should return General for unknown categories", () => {
      const result = (service as any).categorize("Random Opportunity");
      expect(result).toBe("General");
    });
  });
});
