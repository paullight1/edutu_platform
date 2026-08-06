import { Logger } from "@nestjs/common";

jest.mock("../db", () => {
  const executed: string[] = [];
  (globalThis as Record<string, any>).__snapSql = executed;
  const render = (query: any): string =>
    ((query?.queryChunks ?? []) as any[])
      .map((c) =>
        typeof c === "string"
          ? c
          : Array.isArray(c?.value)
            ? c.value.join("")
            : "",
      )
      .join("");
  return {
    db: {
      execute: async (q: any) => {
        executed.push(render(q));
        return { rows: [] };
      },
    },
  };
});

import { GrowthSnapshotService } from "./growth-snapshot.service";

const snapSql = (): string[] => (globalThis as Record<string, any>).__snapSql;

describe("GrowthSnapshotService", () => {
  beforeEach(() => {
    snapSql().length = 0;
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it("writes one engagement snapshot row from the funnel payload", async () => {
    const adminService = {
      getFunnel: async () => ({
        generatedAt: "2026-07-22T00:00:00Z",
        stages: [
          {
            key: "signup",
            label: "Signup",
            total: 100,
            newThisWeek: 20,
            newLastWeek: 15,
            convFromPrev: null,
          },
        ],
        referral: { invitersTotal: 8, invitersThisWeek: 2 },
        cohorts: [],
      }),
    } as any;

    await new GrowthSnapshotService(adminService).captureDailySnapshot();

    const inserts = snapSql().filter((t) => t.includes("analytics_snapshots"));
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toContain("engagement");
  });

  it("never throws even if getFunnel fails", async () => {
    const adminService = {
      getFunnel: async () => {
        throw new Error("db down");
      },
    } as any;
    await expect(
      new GrowthSnapshotService(adminService).captureDailySnapshot(),
    ).resolves.toBeUndefined();
    expect(
      snapSql().filter((t) => t.includes("analytics_snapshots")),
    ).toHaveLength(0);
  });
});
