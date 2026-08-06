import { Test, TestingModule } from "@nestjs/testing";
import { ScraperService } from "./scraper.service";
import { SchedulerRegistry } from "@nestjs/schedule";
import { AiService } from "../ai";
import { OpportunityShareCardService } from "../opportunities/opportunity-share-card.service";
import { OpportunityEmbeddingService } from "../opportunities/opportunity-embedding.service";
import { ScraperAlertsService } from "./scraper-alerts.service";
import { RobotsChecker } from "./robots-checker";
import { OpportunityDedupService } from "./opportunity-dedup.service";

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
  const mockScraperAlertsService = {
    checkAlertConditions: jest.fn().mockResolvedValue([]),
    checkYieldDrop: jest.fn().mockResolvedValue(null),
    checkErrorSpike: jest.fn().mockResolvedValue(null),
  };
  const mockRobotsChecker = {
    isAllowed: jest.fn().mockResolvedValue(true),
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
        {
          provide: ScraperAlertsService,
          useValue: mockScraperAlertsService,
        },
        {
          provide: RobotsChecker,
          useValue: mockRobotsChecker,
        },
        {
          provide: OpportunityDedupService,
          useValue: {
            annotateDuplicates: jest.fn().mockResolvedValue({
              checked: 0,
              duplicates: 0,
              byFingerprint: 0,
              byTitleOrg: 0,
            }),
            applyDomainTrustGate: jest.fn().mockResolvedValue({ capped: 0 }),
          },
        },
        {
          provide: OpportunityEmbeddingService,
          useValue: { embedOpportunity: jest.fn().mockResolvedValue(false) },
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
        data_retention_days: null,
        recheck_after_days: 3,
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

  describe("inferOrganizerName", () => {
    const infer = (item: Record<string, unknown>) =>
      (service as any).inferOrganizerName(item);

    it("keeps a genuinely extracted organiser", () => {
      expect(
        infer({
          title: "IMF Research Analyst Program 2026",
          eligibility: { organization: "International Monetary Fund (IMF)" },
        }),
      ).toBe("International Monetary Fund (IMF)");
    });

    it("never infers an organiser from the title itself", () => {
      // The old non-greedy title-lead match returned "Fully" here.
      expect(
        infer({
          title: "Fully Funded Masters Scholarship in Canada",
          eligibility: {},
        }),
      ).toBeNull();
      expect(
        infer({
          title: "PremiumTrust Bank Graduate Trainee Program 2026",
          eligibility: {},
        }),
      ).toBeNull();
      expect(infer({ title: "2027 RAVE Scholarship in Germany" })).toBeNull();
    });

    it("rejects an extracted organiser that only echoes the title", () => {
      expect(
        infer({
          title: "Mastercard Foundation Scholarship Program at Pretoria 2026",
          eligibility: { organization: "Mastercard Foundation" },
        }),
      ).toBeNull();
    });

    it("rejects aggregator brands before they are substituted away", () => {
      // scrubPublicText rewrites these to "the official organizer", so the
      // guard has to see the raw value or it can never match.
      expect(
        infer({
          title: "Some Scholarship 2026",
          eligibility: { organization: "Opportunities Circle" },
        }),
      ).toBeNull();
      expect(
        infer({
          title: "Some Scholarship 2026",
          eligibility: { organization: "Scholars4Dev" },
        }),
      ).toBeNull();
    });

    it("rejects generic organiser filler", () => {
      for (const filler of [
        "the official organizer",
        "The Official Organiser",
        "Program Organizer",
        "organizer",
      ]) {
        expect(
          infer({
            title: "Some Scholarship 2026",
            eligibility: { organization: filler },
          }),
        ).toBeNull();
      }
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
        ...(transformed.metadata.requirements as string[]),
        ...(transformed.metadata.benefits as string[]),
      ].join(" ");

      expect(publicText).not.toMatch(
        /dixcoverhubx|smartyacad|by admin|scraped/i,
      );
      // Organiser is null, not "The Bridge": that value only ever came from
      // slicing the title at "Fully funded", and a title slice is no longer
      // accepted as an organiser. Null routes the row to re-enrichment.
      expect(transformed.organization).toBeNull();
      expect(transformed.tags).not.toContain("Scraped");
      expect(transformed.metadata.requirements).toContain(
        "Open to young Nigerians interested in leadership, innovation, and policy.",
      );
      expect(transformed.metadata.requirements).not.toEqual(
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

    it("should return null for unknown categories so the caller derives a label", () => {
      const result = (service as any).categorize("Random Opportunity");
      expect(result).toBeNull();
    });

    it("should map canonical categories to display labels", () => {
      expect((service as any).displayCategoryFor("scholarships")).toBe(
        "Scholarship",
      );
      expect((service as any).displayCategoryFor("unknown_thing")).toBe(
        "General",
      );
    });
  });

  describe("anti-generic guards", () => {
    it("normalizeSummary returns empty string when no real content exists", () => {
      const result = (service as any).normalizeSummary("", "", "");
      expect(result).toBe("");
    });

    it("normalizeSummary never emits placeholder copy", () => {
      const result = (service as any).normalizeSummary(null, null, "");
      expect(result).not.toMatch(/being verified by Edutu/i);
    });

    it("inferOrganizerName returns null instead of a generic default", () => {
      const result = (service as any).inferOrganizerName({
        title: "",
        apply_url: "https://example.com",
        source: "",
        source_url: "https://example.com",
      });
      expect(result).toBeNull();
    });

    it("inferType detects non-scholarship opportunity types", () => {
      expect((service as any).inferType("Software Internship 2026")).toBe(
        "internship",
      );
      expect((service as any).inferType("Research Fellowship")).toBe(
        "fellowship",
      );
      // "grant" is not in the opportunities_type_check constraint — grants
      // map to scholarship (canonical_category keeps the precise class).
      expect((service as any).inferType("Innovation Grant for Startups")).toBe(
        "scholarship",
      );
      expect((service as any).inferType("Fully Funded Scholarship")).toBe(
        "scholarship",
      );
      expect(
        (service as any).inferType("Leadership Training Conference 2026"),
      ).toBe("course");
      expect((service as any).inferType("Data Science Bootcamp")).toBe(
        "bootcamp",
      );
      // Every inferType output must satisfy the DB constraint.
      for (const sample of [
        "Innovation Grant",
        "Tech Workshop",
        "Annual Summit",
        "Random Opportunity",
      ]) {
        expect(
          (service as any).toAllowedType((service as any).inferType(sample)),
        ).toBe((service as any).inferType(sample));
      }
    });
  });

  describe("unique meta images", () => {
    it("rejects an image already claimed by a different opportunity in the run", async () => {
      const banner = "https://cdn.example.com/site-default-banner.jpg";

      const first = await (service as any).claimUniqueImage(
        [banner],
        "https://source.example.com/post-a",
      );
      const second = await (service as any).claimUniqueImage(
        [banner, "https://cdn.example.com/post-b-hero.jpg"],
        "https://source.example.com/post-b",
      );
      const third = await (service as any).claimUniqueImage(
        [banner],
        "https://source.example.com/post-c",
      );

      expect(first).toBe(banner);
      // Second item skips the shared banner and keeps its own article image.
      expect(second).toBe("https://cdn.example.com/post-b-hero.jpg");
      // No unique candidate left → no image (UI renders a category tile).
      expect(third).toBeNull();
    });

    it("lets the same opportunity re-claim its own image on retry", async () => {
      const image = "https://cdn.example.com/unique-hero.jpg";
      const applyUrl = "https://source.example.com/post-a";

      const first = await (service as any).claimUniqueImage([image], applyUrl);
      const retry = await (service as any).claimUniqueImage([image], applyUrl);

      expect(first).toBe(image);
      expect(retry).toBe(image);
    });

    it("extractImageCandidatesFromHTML returns og:image first, then article images", () => {
      const html = `
        <html><head>
          <meta property="og:image" content="https://cdn.example.com/og.jpg" />
        </head><body>
          <article><img src="/uploads/inline-1.jpg" /><img src="/uploads/inline-2.jpg" /></article>
        </body></html>`;

      const candidates = (service as any).extractImageCandidatesFromHTML(
        html,
        "https://source.example.com/post",
      );

      expect(candidates[0]).toBe("https://cdn.example.com/og.jpg");
      expect(candidates).toContain(
        "https://source.example.com/uploads/inline-1.jpg",
      );
    });
  });

  describe("clean output contract", () => {
    const nextYear = new Date().getUTCFullYear() + 1;

    it("parses messy scraped deadline fragments into exact ISO dates", () => {
      const parse = (value: string) =>
        (service as any).parseDeadlineDate(value);

      expect(parse(`Deadline: 15th March ${nextYear} at 11:59 PM GMT`)).toBe(
        `${nextYear}-03-15`,
      );
      expect(parse(`March 5, ${nextYear}`)).toBe(`${nextYear}-03-05`);
      expect(parse(`${nextYear}-11-30`)).toBe(`${nextYear}-11-30`);
      expect(parse(`Applications close on 28/02/${nextYear}`)).toBe(
        `${nextYear}-02-28`,
      );
    });

    it("infers the next occurrence when the year is omitted", () => {
      const result = (service as any).parseDeadlineDate("December 1");
      expect(result).toMatch(/^\d{4}-12-01$/);
      expect(new Date(result).getTime()).toBeGreaterThan(
        Date.now() - 24 * 3600 * 1000,
      );
    });

    it("returns null for rolling deadlines, junk, and implausible dates", () => {
      const parse = (value: string) =>
        (service as any).parseDeadlineDate(value);

      expect(parse("Rolling basis")).toBeNull();
      expect(parse("open until filled")).toBeNull();
      expect(parse("contact the office for details")).toBeNull();
      // Stale/misparsed: years in the past or absurdly far ahead.
      expect(parse("January 10, 2020")).toBeNull();
      expect(parse("March 1, 2085")).toBeNull();
      // Invalid calendar date must not roll over into a real one.
      expect(parse(`February 31, ${nextYear}`)).toBeNull();
    });

    it("strips CTA junk and aggregator branding from titles", () => {
      const clean = (value: string) =>
        (service as any).cleanOpportunityTitle(value);

      expect(
        clean(
          "Apply Now: Mastercard Foundation Scholarship 2026 – Deadline March 5",
        ),
      ).toBe("Mastercard Foundation Scholarship 2026");
      expect(clean("XYZ Global Fellowship | Opportunities Circle")).toBe(
        "XYZ Global Fellowship",
      );
      expect(clean("UN Youth Programme - Apply Now")).toBe(
        "UN Youth Programme",
      );
      expect(clean("  Chevening   Scholarship  ")).toBe(
        "Chevening Scholarship",
      );
    });

    it("holds records with already-passed deadlines out of the live feed", () => {
      const item = {
        title: "Complete Fellowship With Every Field Present",
        apply_url: "https://source.example.com/post",
        direct_apply_url: "https://organizer.example.com/apply",
        image_url: "https://cdn.example.com/hero.jpg",
        summary:
          "A fully documented fellowship offering mentorship, funding, and a global cohort experience for early-career professionals across multiple regions.",
        description:
          "This fellowship provides a comprehensive programme including a living stipend, dedicated mentorship, and structured training. Applicants join a global cohort and complete a capstone project with placement support after graduation. The programme runs for twelve months and includes travel support for two in-person residencies.",
        requirements: ["Bachelor's degree", "Two references"],
        benefits: ["Stipend", "Mentorship"],
        application_process: ["Online form", "Interview"],
        deadline: "January 10, 2024",
        eligibility: { organization: "Global Fellowship Institute" },
        source: "Test Source",
        source_url: "https://source.example.com",
      };

      const record = (service as any).transformToOpportunity(item, null);
      // Unparseable-past deadline → no close_date, but the record itself is
      // complete, so it publishes with no deadline rather than a wrong one.
      expect(record.close_date).toBeNull();

      const futureRecord = (service as any).transformToOpportunity(
        { ...item, deadline: `March 5, ${nextYear}` },
        null,
      );
      expect(futureRecord.close_date).toBe(`${nextYear}-03-05`);
      expect(futureRecord.status).toBe("active");
    });
  });
});
