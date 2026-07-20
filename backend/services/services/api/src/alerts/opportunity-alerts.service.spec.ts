import { OpportunityAlertsService } from "./opportunity-alerts.service";

describe("OpportunityAlertsService", () => {
  const service = new OpportunityAlertsService(
    {} as never,
    {} as never,
    {} as never,
  ) as unknown as {
    daysPhrase(days: number): string;
    forEachWithConcurrency<T>(
      items: T[],
      concurrency: number,
      worker: (item: T) => Promise<void>,
    ): Promise<void>;
    describeMissingDocs(
      missing: string[],
      daysLeft: number,
      title: string,
    ): { title: string; body: string };
  };

  describe("daysPhrase", () => {
    it("phrases day counts naturally", () => {
      expect(service.daysPhrase(0)).toBe("today");
      expect(service.daysPhrase(1)).toBe("tomorrow");
      expect(service.daysPhrase(7)).toBe("in 7 days");
    });
  });

  describe("forEachWithConcurrency", () => {
    it("processes every item and bounds concurrency", async () => {
      const seen: number[] = [];
      let running = 0;
      let peak = 0;

      await service.forEachWithConcurrency(
        [1, 2, 3, 4, 5, 6, 7],
        3,
        async (item) => {
          running += 1;
          peak = Math.max(peak, running);
          await new Promise((resolve) => setTimeout(resolve, 5));
          seen.push(item);
          running -= 1;
        },
      );

      expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
      expect(peak).toBeLessThanOrEqual(3);
    });
  });

  describe("describeMissingDocs", () => {
    it("names a single missing document and the urgency", () => {
      const copy = service.describeMissingDocs(["sop"], 5, "Chevening");
      expect(copy.title).toContain("Chevening");
      expect(copy.body).toContain("SOP");
      expect(copy.body).toContain("in 5 days");
      expect(copy.body).toContain("is still a draft");
    });

    it("pluralizes when several documents are missing", () => {
      const copy = service.describeMissingDocs(["cv", "sop"], 1, "Rhodes");
      expect(copy.body).toContain("CV and SOP");
      expect(copy.body).toContain("are still a draft");
      expect(copy.body).toContain("tomorrow");
    });
  });
});
