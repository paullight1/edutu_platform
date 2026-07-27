import { Logger } from "@nestjs/common";

jest.mock("../db", () => {
  const handlers: Record<string, any> = {};
  (globalThis as Record<string, any>).__funnelHandlers = handlers;
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
  const execute = async (query: any) => {
    const text = render(query);
    return handlers.execute ? handlers.execute(text) : { rows: [] };
  };
  return { db: { execute } };
});

import { AdminService } from "./admin.service";

const handlers = (): Record<string, any> =>
  (globalThis as Record<string, any>).__funnelHandlers;

/** Route a rendered SQL string to a canned { rows } payload by content marker. */
function route(map: Array<[string, any[]]>) {
  return (text: string) => {
    for (const [marker, rows] of map)
      if (text.includes(marker)) return { rows };
    return { rows: [] };
  };
}

function buildService(): AdminService {
  // Constructor is (clerkClient, auditService); getFunnel touches neither, so stub both.
  // AdminService does NOT import from ../auth — no auth mock needed.
  return new AdminService({} as any, { record: async () => undefined } as any);
}

describe("AdminService.getFunnel — stages", () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it("computes totals, weekly entrants, and conversion from previous stage", async () => {
    handlers().execute = route([
      // stage totals (each query tagged with a distinct marker comment)
      ["-- funnel:signup:total", [{ count: 100 }]],
      ["-- funnel:onboarded:total", [{ count: 60 }]],
      ["-- funnel:activated:total", [{ count: 30 }]],
      ["-- funnel:retained:total", [{ count: 12 }]],
      ["-- funnel:paying:total", [{ count: 6 }]],
      // weekly entrants (this week / last week) — one query returns both columns
      ["-- funnel:signup:weekly", [{ this_week: 20, last_week: 15 }]],
      ["-- funnel:onboarded:weekly", [{ this_week: 10, last_week: 8 }]],
      ["-- funnel:activated:weekly", [{ this_week: 5, last_week: 4 }]],
      ["-- funnel:retained:weekly", [{ this_week: 3, last_week: 2 }]],
      ["-- funnel:paying:weekly", [{ this_week: 1, last_week: 1 }]],
      // referral
      ["-- funnel:referral", [{ total: 8, this_week: 2 }]],
    ]);

    const res = await buildService().getFunnel();

    const byKey = Object.fromEntries(res.stages.map((s) => [s.key, s]));
    expect(byKey.signup.total).toBe(100);
    expect(byKey.signup.convFromPrev).toBeNull();
    expect(byKey.onboarded.total).toBe(60);
    expect(byKey.onboarded.convFromPrev).toBeCloseTo(0.6);
    expect(byKey.activated.convFromPrev).toBeCloseTo(0.5); // 30/60
    expect(byKey.activated.newThisWeek).toBe(5);
    expect(byKey.paying.convFromPrev).toBeCloseTo(0.5); // 6/12
    expect(res.referral.invitersTotal).toBe(8);
    expect(res.cohorts).toEqual([]);
  });

  it("returns null conversion when the prior stage is empty, and null total on query failure", async () => {
    handlers().execute = (text: string) => {
      if (text.includes("-- funnel:activated:total")) throw new Error("boom");
      if (text.includes("-- funnel:onboarded:total"))
        return { rows: [{ count: 0 }] };
      if (text.includes(":total")) return { rows: [{ count: 0 }] };
      if (text.includes(":weekly"))
        return { rows: [{ this_week: 0, last_week: 0 }] };
      if (text.includes("referral"))
        return { rows: [{ total: 0, this_week: 0 }] };
      return { rows: [] };
    };
    const res = await buildService().getFunnel();
    const byKey = Object.fromEntries(res.stages.map((s) => [s.key, s]));
    expect(byKey.activated.total).toBeNull(); // sub-query threw → degraded
    expect(byKey.retained.convFromPrev).toBeNull(); // prev (activated) null/0 → null
  });

  it("returns null (not 0, not Infinity) conversion when the prior stage total is a real zero", async () => {
    handlers().execute = route([
      ["-- funnel:signup:total", [{ count: 100 }]],
      ["-- funnel:onboarded:total", [{ count: 0 }]], // real zero, doesn't throw
      ["-- funnel:activated:total", [{ count: 30 }]], // positive, despite zero prior stage
      ["-- funnel:retained:total", [{ count: 12 }]],
      ["-- funnel:paying:total", [{ count: 6 }]],
      ["-- funnel:signup:weekly", [{ this_week: 20, last_week: 15 }]],
      ["-- funnel:onboarded:weekly", [{ this_week: 0, last_week: 0 }]],
      ["-- funnel:activated:weekly", [{ this_week: 5, last_week: 4 }]],
      ["-- funnel:retained:weekly", [{ this_week: 3, last_week: 2 }]],
      ["-- funnel:paying:weekly", [{ this_week: 1, last_week: 1 }]],
      ["-- funnel:referral", [{ total: 8, this_week: 2 }]],
    ]);

    const res = await buildService().getFunnel();
    const byKey = Object.fromEntries(res.stages.map((s) => [s.key, s]));
    expect(byKey.onboarded.total).toBe(0);
    expect(byKey.activated.total).toBe(30);
    expect(byKey.activated.convFromPrev).toBeNull();
  });

  it("degrades only the activated stage's weekly figures to null when its :weekly sub-query throws", async () => {
    handlers().execute = (text: string) => {
      if (text.includes("-- funnel:activated:weekly")) throw new Error("boom");
      if (text.includes("-- funnel:signup:total"))
        return { rows: [{ count: 100 }] };
      if (text.includes("-- funnel:onboarded:total"))
        return { rows: [{ count: 60 }] };
      if (text.includes("-- funnel:activated:total"))
        return { rows: [{ count: 30 }] };
      if (text.includes("-- funnel:retained:total"))
        return { rows: [{ count: 12 }] };
      if (text.includes("-- funnel:paying:total"))
        return { rows: [{ count: 6 }] };
      if (text.includes(":weekly"))
        return { rows: [{ this_week: 1, last_week: 1 }] };
      if (text.includes("referral"))
        return { rows: [{ total: 8, this_week: 2 }] };
      return { rows: [] };
    };

    const res = await buildService().getFunnel();
    expect(res.stages).toHaveLength(5);
    const byKey = Object.fromEntries(res.stages.map((s) => [s.key, s]));
    expect(byKey.activated.total).toBe(30); // total sub-query unaffected
    expect(byKey.activated.newThisWeek).toBeNull();
    expect(byKey.activated.newLastWeek).toBeNull();
    expect(byKey.signup.newThisWeek).toBe(1); // other stages unaffected
  });

  it("degrades referral to null without failing the whole response when funnel:referral throws", async () => {
    handlers().execute = (text: string) => {
      if (text.includes("-- funnel:referral")) throw new Error("boom");
      if (text.includes(":total")) return { rows: [{ count: 10 }] };
      if (text.includes(":weekly"))
        return { rows: [{ this_week: 1, last_week: 1 }] };
      return { rows: [] };
    };

    const res = await buildService().getFunnel();
    expect(res.stages).toHaveLength(5);
    expect(res.referral).toEqual({
      invitersTotal: null,
      invitersThisWeek: null,
    });
  });
});

describe("AdminService.getFunnel — cohorts", () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it("returns per-cohort W1/W2/W4 percentages, null when window not elapsed", async () => {
    handlers().execute = (text: string) => {
      if (text.includes("-- funnel:cohorts")) {
        return {
          rows: [
            {
              cohort_week: "2026-W20",
              size: 50,
              w1_pct: 0.4,
              w2_pct: 0.3,
              w4_pct: 0.2,
            },
            {
              cohort_week: "2026-W29",
              size: 10,
              w1_pct: 0.5,
              w2_pct: null,
              w4_pct: null,
            },
          ],
        };
      }
      if (text.includes(":total")) return { rows: [{ count: 0 }] };
      if (text.includes(":weekly"))
        return { rows: [{ this_week: 0, last_week: 0 }] };
      if (text.includes("referral"))
        return { rows: [{ total: 0, this_week: 0 }] };
      return { rows: [] };
    };

    const res = await buildService().getFunnel();
    expect(res.cohorts).toHaveLength(2);
    expect(res.cohorts[0]).toMatchObject({
      cohortWeek: "2026-W20",
      size: 50,
      w1Pct: 0.4,
      w4Pct: 0.2,
    });
    expect(res.cohorts[1].w2Pct).toBeNull(); // window not yet elapsed
  });
});
