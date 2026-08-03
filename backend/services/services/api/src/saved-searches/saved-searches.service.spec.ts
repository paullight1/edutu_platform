const execute = jest.fn().mockResolvedValue({ rows: [] });
jest.mock("../db", () => ({
  db: { execute: (...args: unknown[]) => execute(...args) },
}));

import { SavedSearchesService } from "./saved-searches.service";

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

interface PendingRow {
  user_id: string;
  search_id: string;
  search_name: string;
  opportunity_id: string;
  title: string | null;
  deadline: string | null;
  notified_at: string;
}

function row(overrides: Partial<PendingRow> = {}): PendingRow {
  return {
    user_id: "user-1",
    search_id: "search-1",
    search_name: "Tech scholarships",
    opportunity_id: "opp-1",
    title: "Mastercard Foundation Scholars",
    deadline: null,
    notified_at: "2026-08-03T09:00:00.000Z",
    ...overrides,
  };
}

describe("SavedSearchesService — digest", () => {
  const broadcast = jest.fn().mockResolvedValue({});
  const service = new SavedSearchesService({
    broadcast,
  } as never) as unknown as {
    runSavedSearchDigest(): Promise<{
      users: number;
      matches: number;
      notified: number;
    }>;
    getPendingDigestRows(): Promise<PendingRow[]>;
    groupPendingMatches(rows: PendingRow[]): Array<{
      userId: string;
      matches: PendingRow[];
      searchNames: string[];
      latestMatchAt: string;
    }>;
    composeDigestCopy(digest: {
      userId: string;
      matches: PendingRow[];
      searchNames: string[];
      latestMatchAt: string;
    }): { title: string; body: string; url: string };
    runSavedSearchDigestCron(): Promise<void>;
  };

  beforeEach(() => {
    execute.mockClear();
    execute.mockResolvedValue({ rows: [] });
    broadcast.mockClear();
    delete process.env.SAVED_SEARCH_DIGEST_ENABLED;
  });

  // ── throttle ───────────────────────────────────────────────────────────────

  describe("6-hour per-user throttle", () => {
    it("excludes users any of whose searches was notified inside the window", async () => {
      await service.getPendingDigestRows();
      const query = renderSql(execute.mock.calls[0][0]);

      // The guard must look at EVERY search the user owns (t.user_id =
      // s.user_id), not just the ones with pending matches — otherwise a
      // second alert firing 10 minutes later would push again.
      expect(query).toContain("not exists");
      expect(query).toContain("from saved_searches t");
      expect(query).toContain("t.user_id = s.user_id");
      expect(query).toContain("t.last_notified_at >");
      expect(query).toContain("interval '1 hour'");
    });

    it("only considers hits recorded since that search's last digest", async () => {
      await service.getPendingDigestRows();
      const query = renderSql(execute.mock.calls[0][0]);
      expect(query).toContain(
        "m.notified_at > coalesce(s.last_notified_at, to_timestamp(0))",
      );
    });

    it("respects notify_enabled and the opportunity_alerts preference", async () => {
      await service.getPendingDigestRows();
      const query = renderSql(execute.mock.calls[0][0]);
      expect(query).toContain("s.notify_enabled");
      expect(query).toContain("coalesce(p.opportunity_alerts, true)");
      expect(query).toContain("o.status = 'active'");
    });

    it("caps the number of users drained per run", async () => {
      await service.getPendingDigestRows();
      const query = renderSql(execute.mock.calls[0][0]);
      expect(query).toContain("limit");
    });

    it("stamps every one of the user's searches after sending, arming the throttle", async () => {
      execute.mockResolvedValueOnce({ rows: [row()] });

      await service.runSavedSearchDigest();

      const update = renderSql(execute.mock.calls[1][0]);
      expect(update).toContain("update saved_searches");
      expect(update).toContain("last_notified_at = now()");
      // Per user — NOT per search id.
      expect(update).toContain("where user_id =");
      expect(update).not.toContain("where id =");
    });

    it("sends at most one push per user however many matches are pending", async () => {
      execute.mockResolvedValueOnce({
        rows: [
          row({ opportunity_id: "opp-1" }),
          row({ opportunity_id: "opp-2", search_id: "search-2" }),
          row({ opportunity_id: "opp-3" }),
          row({ user_id: "user-2", opportunity_id: "opp-4" }),
        ],
      });

      const result = await service.runSavedSearchDigest();

      expect(broadcast).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ users: 2, matches: 4, notified: 2 });
    });

    it("does nothing when SAVED_SEARCH_DIGEST_ENABLED is 'false'", async () => {
      process.env.SAVED_SEARCH_DIGEST_ENABLED = "false";
      await service.runSavedSearchDigestCron();
      expect(execute).not.toHaveBeenCalled();
      expect(broadcast).not.toHaveBeenCalled();
    });
  });

  // ── grouping ───────────────────────────────────────────────────────────────

  describe("grouping", () => {
    it("groups every search of a user into one digest", () => {
      const digests = service.groupPendingMatches([
        row({ opportunity_id: "opp-1", search_name: "Tech" }),
        row({
          opportunity_id: "opp-2",
          search_id: "search-2",
          search_name: "Fellowships",
        }),
        row({ user_id: "user-2", opportunity_id: "opp-9" }),
      ]);

      expect(digests).toHaveLength(2);
      expect(digests[0].userId).toBe("user-1");
      expect(digests[0].matches.map((m) => m.opportunity_id)).toEqual([
        "opp-1",
        "opp-2",
      ]);
      expect(digests[0].searchNames).toEqual(["Tech", "Fellowships"]);
    });

    it("counts an opportunity once even when it matches several searches", () => {
      const [digest] = service.groupPendingMatches([
        row({ opportunity_id: "opp-1", search_id: "search-1" }),
        row({
          opportunity_id: "opp-1",
          search_id: "search-2",
          search_name: "Fellowships",
        }),
      ]);

      expect(digest.matches).toHaveLength(1);
      expect(digest.searchNames).toEqual(["Tech scholarships", "Fellowships"]);
    });

    it("tracks the newest hit timestamp for the dedupe key", () => {
      const [digest] = service.groupPendingMatches([
        row({ opportunity_id: "opp-1", notified_at: "2026-08-03T09:00:00Z" }),
        row({ opportunity_id: "opp-2", notified_at: "2026-08-03T11:00:00Z" }),
        row({ opportunity_id: "opp-3", notified_at: "2026-08-03T10:00:00Z" }),
      ]);

      expect(digest.latestMatchAt).toBe("2026-08-03T11:00:00Z");
    });
  });

  // ── copy + dedupe key ──────────────────────────────────────────────────────

  describe("copy", () => {
    it("names the opportunity when there is exactly one match", () => {
      const copy = service.composeDigestCopy({
        userId: "user-1",
        matches: [row({ title: "Chevening Scholarship" })],
        searchNames: ["Tech scholarships"],
        latestMatchAt: "2026-08-03T09:00:00Z",
      });

      expect(copy.title).toContain("Chevening Scholarship");
      expect(copy.body).toContain("Tech scholarships");
      expect(copy.url).toBe("/opportunities/opp-1");
    });

    it("summarises multiple matches from one alert", () => {
      const copy = service.composeDigestCopy({
        userId: "user-1",
        matches: [row({ opportunity_id: "a" }), row({ opportunity_id: "b" })],
        searchNames: ["Tech scholarships"],
        latestMatchAt: "2026-08-03T09:00:00Z",
      });

      expect(copy.title).toContain("2 new matches");
      expect(copy.title).toContain("Tech scholarships");
      expect(copy.body).toContain("1 more");
      expect(copy.url).toBe("/saved-searches");
    });

    it("summarises across alerts when several searches contributed", () => {
      const copy = service.composeDigestCopy({
        userId: "user-1",
        matches: [
          row({ opportunity_id: "a" }),
          row({ opportunity_id: "b" }),
          row({ opportunity_id: "c" }),
        ],
        searchNames: ["Tech scholarships", "Fellowships"],
        latestMatchAt: "2026-08-03T09:00:00Z",
      });

      expect(copy.title).toBe("✨ 3 new matches across 2 alerts");
      expect(copy.url).toBe("/saved-searches");
    });

    it("uses a dedupe key that changes with every digest", async () => {
      execute.mockResolvedValueOnce({
        rows: [row({ notified_at: "2026-08-03T09:00:00Z" })],
      });
      await service.runSavedSearchDigest();

      execute.mockResolvedValueOnce({
        rows: [
          row({ opportunity_id: "opp-2", notified_at: "2026-08-03T18:00:00Z" }),
        ],
      });
      await service.runSavedSearchDigest();

      const keys = broadcast.mock.calls.map((call) => call[1].dedupeKey);
      expect(keys[0]).toBe("saved-search-digest:user-1:2026-08-03T09:00:00Z");
      expect(keys[1]).not.toBe(keys[0]);
      expect(keys[1]).toContain("2026-08-03T18:00:00Z");
    });

    it("pushes through broadcast so quiet hours and the master switch apply", async () => {
      execute.mockResolvedValueOnce({ rows: [row()] });
      await service.runSavedSearchDigest();

      const [userId, dto] = broadcast.mock.calls[0];
      expect(userId).toBe("user-1");
      expect(dto.kind).toBe("opportunity-alert");
      expect(dto.audience).toBe("specific");
      expect(dto.targetUserIds).toEqual(["user-1"]);
      expect(dto.channels).toEqual({ inApp: true, push: true, email: false });
      expect(dto.metadata.source).toBe("saved-search-digest");
    });
  });
});
