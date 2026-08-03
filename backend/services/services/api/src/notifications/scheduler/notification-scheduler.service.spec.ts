const execute = jest.fn().mockResolvedValue({ rows: [] });
jest.mock("../../db", () => ({
  db: { execute: (...args: unknown[]) => execute(...args) },
}));

import { NotificationSchedulerService } from "./notification-scheduler.service";
import {
  ageInHours,
  buildOpenHourHistogram,
  clamp,
  collapseByEntity,
  countConsecutiveUnopened,
  engagementMultiplier,
  kindSuppression,
  modalOpenHour,
  nextLocalTimeUtc,
  rankCandidates,
  recencyDecay,
  resolveSendTime,
  scoreCandidate,
} from "./notification-scheduler.scoring";
import type {
  KindEngagement,
  ScorableCandidate,
  ScoredCandidate,
} from "./notification-scheduler.types";
import { rows } from "./notification-scheduler.types";

const NOW = new Date("2026-08-03T00:00:00.000Z");

function scored(overrides: Partial<ScoredCandidate>): ScoredCandidate {
  return {
    id: overrides.id ?? "c1",
    userId: overrides.userId ?? "u1",
    kind: overrides.kind ?? "deadline-reminder",
    entityType: overrides.entityType ?? null,
    entityId: overrides.entityId ?? null,
    payload: overrides.payload ?? {},
    urgency: overrides.urgency ?? 0.5,
    relevance: overrides.relevance ?? 1,
    createdAt: overrides.createdAt ?? NOW,
    score: overrides.score ?? 0,
  };
}

function candidate(overrides: Partial<ScorableCandidate>): ScorableCandidate {
  const base = scored(overrides);
  const { score: _score, ...rest } = base;
  void _score;
  return rest;
}

function engagement(overrides: Partial<KindEngagement>): KindEngagement {
  return {
    deliveredCount: overrides.deliveredCount ?? 0,
    openedCount: overrides.openedCount ?? 0,
    consecutiveUnopened: overrides.consecutiveUnopened ?? 0,
    lastDeliveredAt: overrides.lastDeliveredAt ?? null,
  };
}

describe("rows()", () => {
  it("unwraps a pg QueryResult object as well as a plain array", () => {
    // db.execute() returns { rows, rowCount } under node-postgres, which is not
    // iterable — the exact shape that silently emptied earlier versions.
    expect(rows<{ id: string }>({ rows: [{ id: "a" }], rowCount: 1 })).toEqual([
      { id: "a" },
    ]);
    expect(rows<{ id: string }>([{ id: "b" }])).toEqual([{ id: "b" }]);
    expect(rows(null)).toEqual([]);
    expect(rows({})).toEqual([]);
  });
});

describe("clamp()", () => {
  it("bounds both ends and rejects non-finite input", () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
    expect(clamp(Number.NaN, 0.25, 2)).toBe(0.25);
  });
});

describe("recencyDecay()", () => {
  it("is 1.0 at age zero", () => {
    expect(recencyDecay(0)).toBe(1);
  });

  it("decreases monotonically with age", () => {
    const ages = [0, 1, 6, 12, 24, 48, 72, 168, 720];
    const values = ages.map(recencyDecay);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]).toBeLessThan(values[i - 1]);
    }
  });

  it("decays by 1/e at the 72h scale and never reaches zero", () => {
    expect(recencyDecay(72)).toBeCloseTo(Math.exp(-1), 10);
    expect(recencyDecay(10_000)).toBeGreaterThan(0);
  });

  it("treats negative/invalid ages as brand new rather than boosting them", () => {
    expect(recencyDecay(-50)).toBe(1);
    expect(recencyDecay(Number.NaN)).toBe(1);
  });
});

describe("ageInHours()", () => {
  it("measures backwards from now and never goes negative", () => {
    expect(ageInHours(new Date("2026-08-02T00:00:00.000Z"), NOW)).toBeCloseTo(
      24,
      10,
    );
    expect(ageInHours(new Date("2026-08-04T00:00:00.000Z"), NOW)).toBe(0);
  });
});

describe("engagementMultiplier()", () => {
  it("returns exactly 1.0 below the 5-delivery confidence floor", () => {
    // 1-of-1 is a 100% open rate on paper and must not swing anything.
    for (let delivered = 1; delivered < 5; delivered += 1) {
      expect(
        engagementMultiplier({
          deliveredCount: delivered,
          openedCount: delivered,
          globalOpenRate: 0.1,
        }),
      ).toBe(1);
    }
  });

  it("starts responding at exactly 5 deliveries", () => {
    expect(
      engagementMultiplier({
        deliveredCount: 5,
        openedCount: 5,
        globalOpenRate: 0.5,
      }),
    ).toBe(2);
  });

  it("clamps at the upper bound", () => {
    expect(
      engagementMultiplier({
        deliveredCount: 100,
        openedCount: 100,
        globalOpenRate: 0.01,
      }),
    ).toBe(2);
  });

  it("clamps at the lower bound", () => {
    expect(
      engagementMultiplier({
        deliveredCount: 100,
        openedCount: 0,
        globalOpenRate: 0.5,
      }),
    ).toBe(0.25);
  });

  it("is neutral for a user exactly on the global rate", () => {
    expect(
      engagementMultiplier({
        deliveredCount: 10,
        openedCount: 3,
        globalOpenRate: 0.3,
      }),
    ).toBeCloseTo(1, 10);
  });

  it("is neutral when there is no usable global rate or no deliveries", () => {
    expect(
      engagementMultiplier({
        deliveredCount: 50,
        openedCount: 25,
        globalOpenRate: 0,
      }),
    ).toBe(1);
    expect(
      engagementMultiplier({
        deliveredCount: 0,
        openedCount: 0,
        globalOpenRate: 0.3,
      }),
    ).toBe(1);
  });
});

describe("scoreCandidate()", () => {
  it("is the product of the four factors", () => {
    expect(
      scoreCandidate({
        urgency: 0.5,
        relevance: 0.5,
        ageHours: 0,
        engagementMultiplier: 2,
      }),
    ).toBeCloseTo(0.5, 10);
  });

  it("lets an older candidate lose to a fresher, equal one", () => {
    const fresh = scoreCandidate({
      urgency: 0.5,
      relevance: 1,
      ageHours: 0,
      engagementMultiplier: 1,
    });
    const stale = scoreCandidate({
      urgency: 0.5,
      relevance: 1,
      ageHours: 240,
      engagementMultiplier: 1,
    });
    expect(stale).toBeLessThan(fresh);
  });
});

describe("kindSuppression()", () => {
  it("is neutral below the halving threshold", () => {
    for (const streak of [0, 1, 2]) {
      expect(
        kindSuppression({ consecutiveUnopened: streak, now: NOW }).multiplier,
      ).toBe(1);
    }
  });

  it("halves at exactly 3 consecutive unopened", () => {
    expect(
      kindSuppression({ consecutiveUnopened: 3, now: NOW }).multiplier,
    ).toBe(0.5);
    expect(
      kindSuppression({ consecutiveUnopened: 5, now: NOW }).multiplier,
    ).toBe(0.5);
  });

  it("zeroes at exactly 6 and mutes the kind for 14 days", () => {
    const lastDeliveredAt = new Date("2026-08-02T00:00:00.000Z");
    const result = kindSuppression({
      consecutiveUnopened: 6,
      lastDeliveredAt,
      now: NOW,
    });
    expect(result.multiplier).toBe(0);
    expect(result.skipUntil?.toISOString()).toBe("2026-08-16T00:00:00.000Z");
  });

  it("restores full weight once the 14-day mute has elapsed", () => {
    const result = kindSuppression({
      consecutiveUnopened: 9,
      lastDeliveredAt: new Date("2026-07-01T00:00:00.000Z"),
      now: NOW,
    });
    expect(result.multiplier).toBe(1);
    expect(result.skipUntil).toBeNull();
  });
});

describe("countConsecutiveUnopened()", () => {
  it("counts the newest-first run and stops at the first open", () => {
    expect(countConsecutiveUnopened([false, false, false, true, false])).toBe(
      3,
    );
    expect(countConsecutiveUnopened([true, false, false])).toBe(0);
    expect(countConsecutiveUnopened([])).toBe(0);
    expect(countConsecutiveUnopened([false, false])).toBe(2);
  });
});

describe("collapseByEntity()", () => {
  it("keeps the top scorer per entity and drops the rest", () => {
    const result = collapseByEntity([
      scored({
        id: "a",
        entityType: "opportunity",
        entityId: "o1",
        score: 0.2,
      }),
      scored({
        id: "b",
        entityType: "opportunity",
        entityId: "o1",
        score: 0.9,
      }),
      scored({
        id: "c",
        entityType: "opportunity",
        entityId: "o1",
        score: 0.4,
      }),
    ]);
    expect(result.map((c) => c.id)).toEqual(["b"]);
  });

  it("keeps distinct entities apart", () => {
    const result = collapseByEntity([
      scored({
        id: "a",
        entityType: "opportunity",
        entityId: "o1",
        score: 0.2,
      }),
      scored({
        id: "b",
        entityType: "opportunity",
        entityId: "o2",
        score: 0.1,
      }),
      scored({ id: "c", entityType: "goal", entityId: "o1", score: 0.3 }),
    ]);
    expect(result.map((c) => c.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("never collapses entity-less candidates together", () => {
    const result = collapseByEntity([
      scored({ id: "a", score: 0.2 }),
      scored({ id: "b", score: 0.9 }),
    ]);
    expect(result).toHaveLength(2);
  });

  it("breaks score ties deterministically on the earlier candidate", () => {
    const result = collapseByEntity([
      scored({
        id: "late",
        entityType: "opportunity",
        entityId: "o1",
        score: 0.5,
        createdAt: new Date("2026-08-02T12:00:00.000Z"),
      }),
      scored({
        id: "early",
        entityType: "opportunity",
        entityId: "o1",
        score: 0.5,
        createdAt: new Date("2026-08-01T12:00:00.000Z"),
      }),
    ]);
    expect(result.map((c) => c.id)).toEqual(["early"]);
  });
});

describe("modalOpenHour()", () => {
  it("returns null below the 10-open evidence floor", () => {
    expect(modalOpenHour({ 19: 9 }, 9)).toBeNull();
    expect(modalOpenHour(null, 50)).toBeNull();
  });

  it("returns the most common hour once there is enough evidence", () => {
    expect(modalOpenHour({ 8: 3, 19: 9 }, 12)).toBe(19);
  });

  it("breaks ties on the earlier hour", () => {
    expect(modalOpenHour({ 7: 5, 21: 5 }, 10)).toBe(7);
  });

  it("ignores out-of-range buckets", () => {
    expect(modalOpenHour({ 99: 40, 6: 10 }, 50)).toBe(6);
  });
});

describe("nextLocalTimeUtc()", () => {
  it("finds the next instant matching the local wall clock", () => {
    // Africa/Lagos is UTC+1: local time at 00:00Z is 01:00.
    expect(nextLocalTimeUtc(NOW, "Africa/Lagos", 8, 30).toISOString()).toBe(
      "2026-08-03T07:30:00.000Z",
    );
  });

  it("rolls to tomorrow when the local time has already passed", () => {
    const afternoon = new Date("2026-08-03T12:00:00.000Z");
    expect(
      nextLocalTimeUtc(afternoon, "Africa/Lagos", 8, 30).toISOString(),
    ).toBe("2026-08-04T07:30:00.000Z");
  });

  it("falls back to UTC for a missing or invalid timezone", () => {
    expect(nextLocalTimeUtc(NOW, null, 8, 30).toISOString()).toBe(
      "2026-08-03T08:30:00.000Z",
    );
    expect(nextLocalTimeUtc(NOW, "Not/AZone", 8, 30).toISOString()).toBe(
      "2026-08-03T08:30:00.000Z",
    );
  });
});

describe("resolveSendTime()", () => {
  it("defaults to 08:30 local for an Africa/Lagos user", () => {
    expect(
      resolveSendTime({ now: NOW, timezone: "Africa/Lagos" }).toISOString(),
    ).toBe("2026-08-03T07:30:00.000Z");
  });

  it("still defaults to 08:30 local when opens are below the floor", () => {
    expect(
      resolveSendTime({
        now: NOW,
        timezone: "Africa/Lagos",
        openHourCounts: { 19: 9 },
        totalOpens: 9,
      }).toISOString(),
    ).toBe("2026-08-03T07:30:00.000Z");
  });

  it("uses the modal open hour once there are at least 10 opens", () => {
    // Modal hour 19 local in Lagos (UTC+1) => 18:00Z the same day.
    expect(
      resolveSendTime({
        now: NOW,
        timezone: "Africa/Lagos",
        openHourCounts: { 8: 4, 19: 8 },
        totalOpens: 12,
      }).toISOString(),
    ).toBe("2026-08-03T18:00:00.000Z");
  });
});

describe("buildOpenHourHistogram()", () => {
  it("buckets by the user's local hour, not UTC", () => {
    const histogram = buildOpenHourHistogram(
      [
        new Date("2026-08-01T07:15:00.000Z"),
        new Date("2026-08-02T07:45:00.000Z"),
        new Date("2026-08-02T18:05:00.000Z"),
      ],
      "Africa/Lagos",
    );
    expect(histogram.total).toBe(3);
    expect(histogram.counts[8]).toBe(2);
    expect(histogram.counts[19]).toBe(1);
  });

  it("skips invalid dates", () => {
    const histogram = buildOpenHourHistogram(
      [new Date("nope"), new Date("2026-08-01T00:30:00.000Z")],
      null,
    );
    expect(histogram.total).toBe(1);
    expect(histogram.counts[0]).toBe(1);
  });
});

describe("rankCandidates()", () => {
  it("collapses duplicates about one entity and orders survivors best-first", () => {
    const result = rankCandidates({
      candidates: [
        candidate({
          id: "dup-low",
          kind: "deadline-reminder",
          entityType: "opportunity",
          entityId: "o1",
          urgency: 0.2,
        }),
        candidate({
          id: "dup-high",
          kind: "deadline-reminder",
          entityType: "opportunity",
          entityId: "o1",
          urgency: 0.9,
        }),
        candidate({
          id: "other",
          kind: "deadline-reminder",
          entityType: "opportunity",
          entityId: "o2",
          urgency: 0.5,
        }),
      ],
      engagementByKind: new Map(),
      globalOpenRateByKind: new Map(),
      now: NOW,
    });
    expect(result.map((c) => c.id)).toEqual(["dup-high", "other"]);
  });

  it("drops kinds the user has ignored six times in a row", () => {
    const result = rankCandidates({
      candidates: [
        candidate({ id: "muted", kind: "opportunity-alert", urgency: 1 }),
        candidate({ id: "kept", kind: "deadline-reminder", urgency: 0.1 }),
      ],
      engagementByKind: new Map([
        [
          "opportunity-alert",
          engagement({
            deliveredCount: 8,
            openedCount: 0,
            consecutiveUnopened: 6,
            lastDeliveredAt: new Date("2026-08-02T00:00:00.000Z"),
          }),
        ],
      ]),
      globalOpenRateByKind: new Map([["opportunity-alert", 0.3]]),
      now: NOW,
    });
    expect(result.map((c) => c.id)).toEqual(["kept"]);
  });

  it("halves a drifting kind's score without dropping it", () => {
    const [only] = rankCandidates({
      candidates: [
        candidate({
          id: "c1",
          kind: "goal-reminder",
          urgency: 1,
          relevance: 1,
        }),
      ],
      engagementByKind: new Map([
        ["goal-reminder", engagement({ consecutiveUnopened: 3 })],
      ]),
      globalOpenRateByKind: new Map(),
      now: NOW,
    });
    expect(only.score).toBeCloseTo(0.5, 10);
  });
});

describe("NotificationSchedulerService cron gating", () => {
  const notificationsService = {
    broadcast: jest.fn().mockResolvedValue({ delivered: 1 }),
  };
  const service = new NotificationSchedulerService(
    notificationsService as never,
  );
  const original = process.env.NOTIFICATION_SCHEDULER_V2_ENABLED;

  beforeEach(() => {
    execute.mockClear();
    notificationsService.broadcast.mockClear();
    delete process.env.NOTIFICATION_SCHEDULER_V2_ENABLED;
  });

  afterAll(() => {
    if (original === undefined) {
      delete process.env.NOTIFICATION_SCHEDULER_V2_ENABLED;
    } else {
      process.env.NOTIFICATION_SCHEDULER_V2_ENABLED = original;
    }
  });

  it("is a no-op when the flag is unset (opt-IN, unlike every other cron flag)", async () => {
    await service.runScheduled();
    expect(execute).not.toHaveBeenCalled();
    expect(notificationsService.broadcast).not.toHaveBeenCalled();
  });

  it("stays off for any value other than the exact string 'true'", async () => {
    for (const value of ["false", "1", "TRUE", "yes", ""]) {
      process.env.NOTIFICATION_SCHEDULER_V2_ENABLED = value;
      await service.runScheduled();
    }
    expect(execute).not.toHaveBeenCalled();
  });

  it("runs the drain once explicitly enabled", async () => {
    process.env.NOTIFICATION_SCHEDULER_V2_ENABLED = "true";
    await service.runScheduled();
    expect(execute).toHaveBeenCalledTimes(1);
    // No candidates came back, so nothing is broadcast.
    expect(notificationsService.broadcast).not.toHaveBeenCalled();
  });
});
