import { Test, TestingModule } from "@nestjs/testing";
import { ScraperService } from "./scraper.service";
import { SchedulerRegistry } from "@nestjs/schedule";
import { AiService } from "../ai";

describe("ScraperService", () => {
  let service: ScraperService;

  const mockSchedulerRegistry = {
    deleteCronJob: jest.fn(),
    addCronJob: jest.fn(),
  };
  const mockAiService = {
    generateJson: jest.fn(),
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
