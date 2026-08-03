const execute = jest.fn().mockResolvedValue({ rows: [] });
jest.mock("../db", () => ({
  db: { execute: (...args: unknown[]) => execute(...args) },
}));

import { OpportunityAlertsService } from "./opportunity-alerts.service";

/**
 * Renders a drizzle `sql` template back to its literal text (params dropped)
 * so we can assert on the shape of hand-written SQL without a database.
 */
function renderSql(query: unknown): string {
  const chunks = (query as { queryChunks?: unknown[] })?.queryChunks ?? [];
  return chunks
    .map((chunk) => {
      if (chunk && Array.isArray((chunk as { value?: unknown }).value)) {
        return ((chunk as { value: string[] }).value ?? []).join("");
      }
      if (chunk && (chunk as { queryChunks?: unknown[] }).queryChunks) {
        return renderSql(chunk);
      }
      return "";
    })
    .join("");
}

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
    getEligibleUsers(): Promise<unknown[]>;
    getIncompleteApplicationNudges(): Promise<unknown[]>;
  };

  beforeEach(() => {
    execute.mockClear();
    execute.mockResolvedValue({ rows: [] });
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

  // profiles.user_id is dual-keyed (raw Clerk id OR derived uuid). A
  // single-keyed join silently drops half the profiles, so timezone comes back
  // null and quiet hours are evaluated in UTC for a UTC+0..+3 user base.
  describe("profiles lookups are dual-keyed", () => {
    const cases: Array<[string, () => Promise<unknown[]>]> = [
      ["getEligibleUsers", () => service.getEligibleUsers()],
      [
        "getIncompleteApplicationNudges",
        () => service.getIncompleteApplicationNudges(),
      ],
    ];

    it.each(cases)("%s matches both id representations", async (_name, run) => {
      await run();
      const query = renderSql(execute.mock.calls[0][0]);

      // Both keys, via the live conversion function.
      expect(query).toContain("public.clerk_id_to_uuid(pr.user_id)::text");
      // Correlated subquery, not a join — a join over a dual-keyed predicate
      // can match two profile rows and duplicate the push.
      expect(query).not.toMatch(/join\s+profiles/i);
      // Most recently updated non-null timezone wins (travellers).
      expect(query).toContain("pr.timezone is not null");
      expect(query).toContain("order by pr.updated_at desc nulls last");
    });

    it("still resolves a display name for the pulse copy", async () => {
      await service.getEligibleUsers();
      const query = renderSql(execute.mock.calls[0][0]);
      expect(query).toContain("pr.full_name is not null");
    });
  });

  // Consolidation: OpportunityDeadlineRemindersService is the single deadline
  // authority. This service must neither send deadline reminders itself nor
  // duplicate one that is already scheduled.
  describe("deadline reminders are no longer sent from here", () => {
    it("exposes no deadline-reminder entry points", () => {
      const surface = service as unknown as Record<string, unknown>;
      expect(surface.runDeadlineReminders).toBeUndefined();
      expect(surface.runDeadlineRemindersCron).toBeUndefined();
      expect(surface.remindUser).toBeUndefined();
      expect(surface.getDueDeadlinePairs).toBeUndefined();
    });

    it("doc nudges skip pairs with a pending scheduled deadline reminder", async () => {
      await service.getIncompleteApplicationNudges();
      const query = renderSql(execute.mock.calls[0][0]);

      expect(query).toContain("from notification_queue q");
      expect(query).toContain("q.status = 'pending'");
      expect(query).toContain(
        "q.payload->'metadata'->>'dedupePrefix' = 'opp-deadline:' || o.id::text",
      );
      // The queue stamps the derived uuid; applications may hold the raw
      // Clerk id — matching only one silently disables the guard.
      expect(query).toContain("q.payload->'metadata'->>'userId' = a.user_id");
      expect(query).toContain("public.clerk_id_to_uuid(a.user_id)::text");
    });
  });
});
