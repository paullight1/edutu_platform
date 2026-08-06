const execute = jest.fn().mockResolvedValue({ rows: [] });
jest.mock("../db", () => ({
  db: { execute: (...args: unknown[]) => execute(...args) },
}));

import { OpportunityDeadlineRemindersService } from "./opportunity-deadline-reminders.service";
import type { BroadcastNotificationDto } from "./dto/notification.dto";

type ReminderCandidate = {
  user_id: string;
  opportunity_id: string;
  title: string | null;
  deadline: string;
};

type Internals = {
  buildReminders(
    candidate: ReminderCandidate,
    nextAction: string | null,
  ): BroadcastNotificationDto[];
  collapseCrowdedDays(
    plans: Array<{
      candidate: ReminderCandidate;
      reminders: BroadcastNotificationDto[];
    }>,
  ): {
    perOpportunity: Array<{
      candidate: ReminderCandidate;
      reminders: BroadcastNotificationDto[];
    }>;
    summaries: BroadcastNotificationDto[];
  };
  describeMissingDocs(missing: string[]): string;
  loadNextActions(
    candidates: ReminderCandidate[],
  ): Promise<Map<string, string>>;
  scheduleUpcoming(
    limit?: number,
  ): Promise<{ pairs: number; scheduled: number; collapsed: number }>;
};

/** Renders a drizzle `sql` template back to its literal text (params dropped). */
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

function candidate(
  overrides: Partial<ReminderCandidate> & { opportunity_id: string },
): ReminderCandidate {
  return {
    user_id: "user-1",
    title: `Opportunity ${overrides.opportunity_id}`,
    // All candidates share a deadline by default so their whole 14/7/3/1/0
    // ladders land on the same five days — the crowding case.
    deadline: "2099-06-30T00:00:00.000Z",
    ...overrides,
  };
}

describe("OpportunityDeadlineRemindersService", () => {
  const replaceScheduledUserNotifications = jest.fn();
  const notifications = {
    replaceScheduledUserNotifications,
  } as unknown as ConstructorParameters<
    typeof OpportunityDeadlineRemindersService
  >[0];

  const service = new OpportunityDeadlineRemindersService(
    notifications,
  ) as unknown as Internals;

  beforeEach(() => {
    execute.mockClear();
    execute.mockResolvedValue({ rows: [] });
    replaceScheduledUserNotifications.mockReset();
    replaceScheduledUserNotifications.mockResolvedValue({ scheduled: 0 });
  });

  describe("buildReminders", () => {
    it("emits the full 14/7/3/1/0 ladder with per-offset dedupe keys", () => {
      const reminders = service.buildReminders(
        candidate({ opportunity_id: "opp-a" }),
        null,
      );

      expect(reminders.map((r) => r.dedupeKey)).toEqual([
        "opp-deadline:opp-a:14",
        "opp-deadline:opp-a:7",
        "opp-deadline:opp-a:3",
        "opp-deadline:opp-a:1",
        "opp-deadline:opp-a:0",
      ]);
      // Distinct keys per offset: the partial unique index on
      // (user_id, dedupe_key) would otherwise suppress every rung after the
      // first, since a conflict now also suppresses the push.
      expect(new Set(reminders.map((r) => r.dedupeKey)).size).toBe(5);
    });

    it("carries the next action into the body", () => {
      const reminders = service.buildReminders(
        candidate({ opportunity_id: "opp-a" }),
        "Upload your CV",
      );
      expect(reminders[0].body).toContain("Upload your CV");
      expect(reminders[4].body).toContain("Upload your CV");
    });
  });

  describe("describeMissingDocs", () => {
    it("names a single missing document", () => {
      expect(service.describeMissingDocs(["cv"])).toBe("Upload your CV");
    });

    it("joins several missing documents", () => {
      expect(service.describeMissingDocs(["cv", "sop"])).toBe(
        "Upload your CV and draft your statement of purpose",
      );
    });
  });

  describe("loadNextActions", () => {
    it("prefers a missing required document over the checklist item", async () => {
      execute
        .mockResolvedValueOnce({
          rows: [
            {
              user_id: "user-1",
              opportunity_id: "opp-a",
              kit: { checklist: [{ id: "c1", title: "Ask for a reference" }] },
              checklist_state: {},
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              user_id: "user-1",
              opportunity_id: "opp-a",
              cv_missing: true,
              sop_missing: false,
            },
          ],
        });

      const actions = await service.loadNextActions([
        candidate({ opportunity_id: "opp-a" }),
      ]);
      expect(actions.get("user-1:opp-a")).toBe("Upload your CV");
    });

    it("falls back to the checklist item when no document is missing", async () => {
      execute
        .mockResolvedValueOnce({
          rows: [
            {
              user_id: "user-1",
              opportunity_id: "opp-a",
              kit: { checklist: [{ id: "c1", title: "Ask for a reference" }] },
              checklist_state: {},
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              user_id: "user-1",
              opportunity_id: "opp-a",
              cv_missing: false,
              sop_missing: false,
            },
          ],
        });

      const actions = await service.loadNextActions([
        candidate({ opportunity_id: "opp-a" }),
      ]);
      expect(actions.get("user-1:opp-a")).toBe("Ask for a reference");
    });

    it("still returns checklist actions when the document query fails", async () => {
      execute
        .mockResolvedValueOnce({
          rows: [
            {
              user_id: "user-1",
              opportunity_id: "opp-a",
              kit: { checklist: [{ id: "c1", title: "Ask for a reference" }] },
              checklist_state: {},
            },
          ],
        })
        .mockRejectedValueOnce(new Error("relation does not exist"));

      const actions = await service.loadNextActions([
        candidate({ opportunity_id: "opp-a" }),
      ]);
      expect(actions.get("user-1:opp-a")).toBe("Ask for a reference");
    });

    it("only considers live applications for document gaps", async () => {
      await service.loadNextActions([candidate({ opportunity_id: "opp-a" })]);
      const docQuery = renderSql(execute.mock.calls[1][0]);
      expect(docQuery).toContain("public.opportunity_applications");
      expect(docQuery).toContain(
        "a.status not in ('submitted', 'offer', 'rejected', 'withdrawn')",
      );
    });
  });

  describe("collapseCrowdedDays", () => {
    const plansFor = (ids: string[]) =>
      ids.map((id) => {
        const c = candidate({ opportunity_id: id });
        return { candidate: c, reminders: service.buildReminders(c, null) };
      });

    it("leaves three-per-day alone", () => {
      const { perOpportunity, summaries } = service.collapseCrowdedDays(
        plansFor(["a", "b", "c"]),
      );
      expect(summaries).toHaveLength(0);
      expect(perOpportunity.every((p) => p.reminders.length === 5)).toBe(true);
    });

    it("replaces a crowded day with one summary and strips the individuals", () => {
      const { perOpportunity, summaries } = service.collapseCrowdedDays(
        plansFor(["a", "b", "c", "d"]),
      );

      // All four opportunities share a deadline, so all five days are crowded.
      expect(summaries).toHaveLength(5);
      expect(perOpportunity.every((p) => p.reminders.length === 0)).toBe(true);
      expect(summaries[0].body).toContain("4 of your saved opportunities");
    });

    it("collapses only the crowded day when deadlines differ", () => {
      const crowdedDeadline = "2099-06-30T00:00:00.000Z";
      const plans = ["a", "b", "c", "d"].map((id) => {
        const c = candidate({
          opportunity_id: id,
          deadline: crowdedDeadline,
        });
        return { candidate: c, reminders: service.buildReminders(c, null) };
      });
      // A fifth opportunity closing much later shares no reminder day.
      const lonely = candidate({
        opportunity_id: "e",
        deadline: "2099-09-30T00:00:00.000Z",
      });
      plans.push({
        candidate: lonely,
        reminders: service.buildReminders(lonely, null),
      });

      const { perOpportunity, summaries } = service.collapseCrowdedDays(plans);
      const lonelyPlan = perOpportunity.find(
        (p) => p.candidate.opportunity_id === "e",
      );
      expect(lonelyPlan?.reminders).toHaveLength(5);
      expect(summaries).toHaveLength(5);
    });

    it("gives each collapsed day its own dedupe key and names the soonest", () => {
      const { summaries } = service.collapseCrowdedDays(
        plansFor(["a", "b", "c", "d"]),
      );
      const keys = summaries.map((s) => s.dedupeKey);
      expect(new Set(keys).size).toBe(keys.length);
      for (const key of keys) {
        expect(key).toMatch(/^opp-deadline-summary:\d{4}-\d{2}-\d{2}$/);
      }
      // The last scheduled summary is deadline day itself.
      expect(summaries[summaries.length - 1].body).toContain("today");
      expect(summaries[summaries.length - 1].severity).toBe("warning");
    });
  });

  describe("scheduleUpcoming", () => {
    it("writes the summary series under its own prefix, per user", async () => {
      const rows = ["a", "b", "c", "d"].map((id) =>
        candidate({ opportunity_id: id }),
      );
      execute
        .mockResolvedValueOnce({ rows }) // getCandidates
        .mockResolvedValueOnce({ rows: [] }) // application_kits
        .mockResolvedValueOnce({ rows: [] }); // document gaps
      replaceScheduledUserNotifications.mockImplementation(
        (_user: string, _prefix: string, items: unknown[]) =>
          Promise.resolve({ scheduled: items.length }),
      );

      const result = await service.scheduleUpcoming();

      const prefixes = replaceScheduledUserNotifications.mock.calls.map(
        (call) => call[1],
      );
      expect(prefixes).toEqual([
        "opp-deadline:a",
        "opp-deadline:b",
        "opp-deadline:c",
        "opp-deadline:d",
        "opp-deadline-summary",
      ]);
      // Four opportunities × five offsets collapsed into five summaries.
      expect(result.collapsed).toBe(5);
      expect(result.scheduled).toBe(5);
    });

    it("always rewrites the summary prefix so a thinned-out day is cleared", async () => {
      execute
        .mockResolvedValueOnce({ rows: [candidate({ opportunity_id: "a" })] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await service.scheduleUpcoming();

      const summaryCall = replaceScheduledUserNotifications.mock.calls.find(
        (call) => call[1] === "opp-deadline-summary",
      );
      expect(summaryCall).toBeDefined();
      expect(summaryCall?.[2]).toEqual([]);
    });

    it("keeps going when one opportunity fails to schedule", async () => {
      execute
        .mockResolvedValueOnce({
          rows: [
            candidate({ opportunity_id: "a" }),
            candidate({ opportunity_id: "b" }),
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });
      replaceScheduledUserNotifications
        .mockRejectedValueOnce(new Error("deadlock"))
        .mockResolvedValue({ scheduled: 5 });

      const result = await service.scheduleUpcoming();
      expect(result.pairs).toBe(2);
      expect(result.scheduled).toBe(10); // opp-b + the (empty) summary call
    });
  });
});
