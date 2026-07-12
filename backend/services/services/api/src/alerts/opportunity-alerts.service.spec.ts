import { OpportunityAlertsService } from "./opportunity-alerts.service";

describe("OpportunityAlertsService", () => {
  const service = new OpportunityAlertsService(
    {} as never,
    {} as never,
  ) as unknown as {
    deferForQuietHours(q: { start: string; end: string } | null): string | undefined;
    daysPhrase(days: number): string;
    forEachWithConcurrency<T>(
      items: T[],
      concurrency: number,
      worker: (item: T) => Promise<void>,
    ): Promise<void>;
  };

  describe("deferForQuietHours", () => {
    afterEach(() => jest.useRealTimers());

    function atUtc(hoursMinutes: string) {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(`2026-07-12T${hoursMinutes}:00.000Z`));
    }

    it("delivers immediately outside quiet hours", () => {
      atUtc("10:00");
      expect(
        service.deferForQuietHours({ start: "22:00", end: "08:00" }),
      ).toBeUndefined();
    });

    it("defers to the window end when inside a midnight-wrapping window (before midnight)", () => {
      atUtc("23:30");
      expect(service.deferForQuietHours({ start: "22:00", end: "08:00" })).toBe(
        "2026-07-13T08:00:00.000Z",
      );
    });

    it("defers to the window end when inside a midnight-wrapping window (after midnight)", () => {
      atUtc("03:00");
      expect(service.deferForQuietHours({ start: "22:00", end: "08:00" })).toBe(
        "2026-07-12T08:00:00.000Z",
      );
    });

    it("handles non-wrapping windows", () => {
      atUtc("13:00");
      expect(service.deferForQuietHours({ start: "12:00", end: "14:00" })).toBe(
        "2026-07-12T14:00:00.000Z",
      );
      atUtc("15:00");
      expect(
        service.deferForQuietHours({ start: "12:00", end: "14:00" }),
      ).toBeUndefined();
    });

    it("falls back to the default window when prefs are missing", () => {
      atUtc("23:00");
      expect(service.deferForQuietHours(null)).toBe(
        "2026-07-13T08:00:00.000Z",
      );
    });

    it("never defers on malformed or empty windows", () => {
      atUtc("23:00");
      expect(
        service.deferForQuietHours({ start: "abc", end: "08:00" }),
      ).toBeUndefined();
      expect(
        service.deferForQuietHours({ start: "08:00", end: "08:00" }),
      ).toBeUndefined();
    });
  });

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
});
