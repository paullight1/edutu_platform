import { randomUUID } from "crypto";
import { getTableName } from "drizzle-orm";
import { CopilotService } from "./copilot.service";
import type { AiService } from "../ai";
import type { MonetizationService } from "../monetization/monetization.service";
import { applicationKits, profiles, goals, opportunities } from "../db/schema";
import { toDatabaseUserId } from "../common/user-id";

// Drizzle `db` is mocked as a tiny builder chain so the service's real control
// flow runs with no database connection. Every terminal read/write consults a
// per-test handler on the global state object, and each rendered WHERE clause is
// recorded so the two profile reads (raw authId vs. the derived-uuid fallback)
// can be told apart. Same spirit as monetization.meter-refund.spec.ts, adapted
// from raw sql`` to the query-builder API this service uses.
jest.mock("../db", () => {
  const state: any = {
    selectRows: (_tableName: string, _whereText: string) => [] as any[],
    insertReturning: (_tableName: string, values: any) => [
      { id: "kit-1", createdAt: new Date(), updatedAt: new Date(), ...values },
    ],
    selectLog: [] as Array<{ tableName: string; whereText: string }>,
    inserts: [] as Array<{ tableName: string; values: any }>,
    updates: [] as Array<{ tableName: string; set: any }>,
  };
  (globalThis as Record<string, any>).__copilotDb = state;

  const render = (query: any): string => {
    if (!query || typeof query !== "object") return "";
    const chunks = query.queryChunks ?? [];
    return chunks
      .map((chunk: any) =>
        typeof chunk === "string"
          ? chunk
          : Array.isArray(chunk?.value)
            ? chunk.value.join("")
            : chunk?.queryChunks
              ? render(chunk)
              : "",
      )
      .join("");
  };

  // Lazily required so the factory doesn't import drizzle before jest is ready.
  const nameOf = (table: any): string => {
    const { getTableName: gtn } = require("drizzle-orm");
    return gtn(table);
  };

  const selectBuilder = () => {
    let tableName = "";
    let whereText = "";
    const rows = () => {
      state.selectLog.push({ tableName, whereText });
      return state.selectRows(tableName, whereText);
    };
    const builder: any = {
      from: (t: any) => {
        tableName = nameOf(t);
        return builder;
      },
      leftJoin: () => builder,
      where: (cond: any) => {
        whereText = render(cond);
        return builder;
      },
      orderBy: () => builder,
      limit: () => builder,
      execute: async () => rows(),
      then: (resolve: any, reject: any) =>
        Promise.resolve(rows()).then(resolve, reject),
    };
    return builder;
  };

  const insertBuilder = (table: any) => {
    const tableName = nameOf(table);
    let values: any;
    const builder: any = {
      values: (v: any) => {
        values = v;
        return builder;
      },
      onConflictDoUpdate: () => builder,
      returning: async () => {
        state.inserts.push({ tableName, values });
        return state.insertReturning(tableName, values);
      },
    };
    return builder;
  };

  const updateBuilder = (table: any) => {
    const tableName = nameOf(table);
    const builder: any = {
      set: (v: any) => {
        state.updates.push({ tableName, set: v });
        return builder;
      },
      where: async () => [],
    };
    return builder;
  };

  const deleteBuilder = () => ({ where: async () => [] });

  return {
    db: {
      select: () => selectBuilder(),
      insert: (t: any) => insertBuilder(t),
      update: (t: any) => updateBuilder(t),
      delete: () => deleteBuilder(),
    },
  };
});

const dbState = () => (globalThis as Record<string, any>).__copilotDb;

const APP_KITS = getTableName(applicationKits);
const PROFILES = getTableName(profiles);
const GOALS = getTableName(goals);
const OPPORTUNITIES = getTableName(opportunities);

const OPP_ID = randomUUID();
const RAW_USER_ID = "user_amara";
const AUTH_ID = RAW_USER_ID;
const DB_USER_ID = toDatabaseUserId(RAW_USER_ID);

function makeService() {
  const ai = {
    generateJson: jest.fn(),
  } as unknown as jest.Mocked<Pick<AiService, "generateJson">>;

  const charge = {
    userId: DB_USER_ID,
    action: "copilotKit" as const,
    charged: 15,
    ledgerId: "ledger-1",
    chatCounted: false,
    remaining: null,
  };
  const monetization = {
    meter: jest.fn(async () => charge),
    refund: jest.fn(async () => undefined),
  } as unknown as jest.Mocked<Pick<MonetizationService, "meter" | "refund">>;

  const service = new CopilotService(
    ai as unknown as AiService,
    monetization as unknown as MonetizationService,
  );
  return { service, ai, monetization, charge };
}

// Minimal opportunity row the loadOpportunity select returns.
const opportunityRow = () => ({
  id: OPP_ID,
  title: "Global Leaders Scholarship",
  summary: "A fully funded scholarship.",
  description: null,
  organization: "Global Fund",
  category: "scholarship",
  canonicalCategory: "scholarship",
  deadline: null,
  eligibilityCriteria: null,
  fundingType: null,
  targetRegion: null,
  imageUrl: null,
  applyUrl: null,
  applicationUrl: null,
  sourceUrl: null,
  location: null,
  type: null,
  eligibility: null,
  metadata: {},
});

// Route a select to a table-specific fixture; `handlers[table]` receives the
// rendered WHERE clause so profile-preference tests can branch on it.
function routeSelects(handlers: Record<string, (whereText: string) => any[]>) {
  dbState().selectRows = (tableName: string, whereText: string) =>
    handlers[tableName] ? handlers[tableName](whereText) : [];
}

describe("CopilotService.generateKit", () => {
  beforeEach(() => {
    const state = dbState();
    state.selectLog.length = 0;
    state.inserts.length = 0;
    state.updates.length = 0;
    state.selectRows = () => [];
    state.insertReturning = (_t: string, values: any) => [
      { id: "kit-1", createdAt: new Date(), updatedAt: new Date(), ...values },
    ];
  });

  afterEach(() => jest.restoreAllMocks());

  // (a) A cached kit makes no AI call, so it must not meter (the bug that used
  // to charge 15 credits for a free cache read).
  it("returns a cached kit without metering or calling the AI", async () => {
    const { service, ai, monetization } = makeService();
    const cached = {
      id: "kit-1",
      userId: DB_USER_ID,
      opportunityId: OPP_ID,
      kit: { fitNote: "You are a strong fit.", checklist: [] },
      essays: [],
      checklistState: {},
      generatedBy: "ai",
    };
    routeSelects({ [APP_KITS]: () => [cached] });

    const result = await service.generateKit(
      RAW_USER_ID,
      OPP_ID,
      false,
      AUTH_ID,
    );

    expect(result).toBe(cached);
    expect(monetization.meter).not.toHaveBeenCalled();
    expect(monetization.refund).not.toHaveBeenCalled();
    expect(ai.generateJson).not.toHaveBeenCalled();
  });

  // (b) On an AI failure the service serves the deterministic fallback kit and
  // hands the credits back — the fallback template must cost nothing.
  it("falls back to a heuristic kit and refunds the charge when the AI fails", async () => {
    const { service, ai, monetization, charge } = makeService();
    (ai.generateJson as jest.Mock).mockRejectedValue(
      new Error("provider down"),
    );
    routeSelects({
      [APP_KITS]: () => [], // no cached kit, no concurrent winner
      [OPPORTUNITIES]: () => [opportunityRow()],
      [GOALS]: () => [],
      [PROFILES]: () => [{ country: "Kenya" }],
    });

    await service.generateKit(RAW_USER_ID, OPP_ID, false, AUTH_ID);

    expect(monetization.meter).toHaveBeenCalledWith(DB_USER_ID, "copilotKit");
    expect(monetization.refund).toHaveBeenCalledWith(charge);
    const inserted = dbState().inserts.find(
      (row: any) => row.tableName === APP_KITS,
    );
    expect(inserted?.values.generatedBy).toBe("fallback");
    // The fallback stays honest: no invented eligibility flags or gaps.
    expect(inserted?.values.kit.eligibilityFlags).toEqual([]);
    expect(inserted?.values.kit.gaps).toEqual([]);
  });

  // (c) P0.1: when the user has both a populated raw-authId profile row and an
  // empty derived-uuid orphan, the raw row must win. loadProfile reads the raw
  // row first (plain eq) and only falls back to the dual-key match
  // (clerk_id_to_uuid) if that is empty — which it must not reach here.
  it("prefers the raw authId profile row over the derived-uuid orphan", async () => {
    const { service, ai } = makeService();
    (ai.generateJson as jest.Mock).mockResolvedValue({
      fitNote: "ok",
      strategy: [],
      checklist: [],
      essayPrompts: [],
      eligibilityFlags: [],
      gaps: [],
    });
    routeSelects({
      [APP_KITS]: () => [],
      [OPPORTUNITIES]: () => [opportunityRow()],
      [GOALS]: () => [],
      // The dual-key fallback query contains clerk_id_to_uuid; the raw authId
      // read is a plain equality. Serve the populated row only to the raw read.
      [PROFILES]: (whereText: string) =>
        whereText.includes("clerk_id_to_uuid")
          ? [{ country: "Nowhere" }]
          : [
              {
                fullName: "Amara",
                country: "Kenya",
                major: "Computer Science",
              },
            ],
    });

    await service.generateKit(RAW_USER_ID, OPP_ID, false, AUTH_ID);

    const prompt = (ai.generateJson as jest.Mock).mock.calls[0][0].prompt;
    expect(prompt).toContain("Country: Kenya");
    expect(prompt).toContain("Computer Science");
    expect(prompt).not.toContain("Nowhere");
    // The orphan/fallback query must never have been executed.
    const profileReads = dbState().selectLog.filter(
      (entry: any) => entry.tableName === PROFILES,
    );
    expect(
      profileReads.some((entry: any) =>
        entry.whereText.includes("clerk_id_to_uuid"),
      ),
    ).toBe(false);
  });

  // (d) stripNulls + KitContentSchema: LLMs emit null for unknown fields and
  // stray null array items. The service must strip them and apply schema
  // defaults, including the new eligibilityFlags/gaps.
  it("strips nulls and parses a null-riddled AI payload", async () => {
    const { service, ai } = makeService();
    (ai.generateJson as jest.Mock).mockResolvedValue({
      fitNote: "You are a strong fit.",
      strategy: ["Lead with results", null, "Quantify impact"],
      checklist: [
        { id: "cv", label: "Prepare CV", detail: null, category: "documents" },
        null,
      ],
      essayPrompts: [
        { id: null, prompt: "Why you?", guidance: null, suggestedAngle: null },
      ],
      eligibilityFlags: [
        { flag: "Country not eligible", severity: null },
        null,
      ],
      gaps: ["Need more leadership experience", null],
      extraJunk: null,
    });
    routeSelects({
      [APP_KITS]: () => [],
      [OPPORTUNITIES]: () => [opportunityRow()],
      [GOALS]: () => [],
      [PROFILES]: () => [{ country: "Kenya" }],
    });

    await service.generateKit(RAW_USER_ID, OPP_ID, false, AUTH_ID);

    const kit = dbState().inserts.find((row: any) => row.tableName === APP_KITS)
      ?.values.kit;
    expect(kit.strategy).toEqual(["Lead with results", "Quantify impact"]);
    expect(kit.checklist).toHaveLength(1);
    expect(kit.checklist[0]).toMatchObject({
      label: "Prepare CV",
      category: "documents",
    });
    expect(kit.checklist[0].detail).toBeUndefined();
    // Blank essay-prompt id is backfilled by ensureStableIds.
    expect(kit.essayPrompts[0].id).toBe("prompt-0");
    // Null severity falls back to "warning" via the schema's .catch.
    expect(kit.eligibilityFlags).toEqual([
      { flag: "Country not eligible", severity: "warning" },
    ]);
    expect(kit.gaps).toEqual(["Need more leadership experience"]);
  });

  // (e) P2.3: on refresh the regenerated checklist keeps the previous item ids
  // for labels that match (case-insensitive), so preserved checklistState ticks
  // still line up; genuinely new items keep their fresh ids.
  it("carries previous checklist ids onto matching labels when refreshing", async () => {
    const { service, ai } = makeService();
    const previousKit = {
      id: "kit-1",
      userId: DB_USER_ID,
      opportunityId: OPP_ID,
      kit: {
        fitNote: "old",
        checklist: [
          { id: "old-cv", label: "Prepare CV", category: "documents" },
          {
            id: "old-ref",
            label: "Request references",
            category: "preparation",
          },
        ],
      },
      essays: [],
      checklistState: { "old-cv": true },
      generatedBy: "ai",
    };
    routeSelects({
      [APP_KITS]: () => [previousKit],
      [OPPORTUNITIES]: () => [opportunityRow()],
      [GOALS]: () => [],
      [PROFILES]: () => [{ country: "Kenya" }],
    });
    (ai.generateJson as jest.Mock).mockResolvedValue({
      fitNote: "new",
      strategy: [],
      checklist: [
        // Same item, different case + freshly-minted id → must reclaim old-cv.
        { id: "new-1", label: "prepare cv", category: "documents" },
        // Brand-new item → keeps its own id.
        { id: "new-2", label: "Submit application", category: "submission" },
      ],
      essayPrompts: [],
      eligibilityFlags: [],
      gaps: [],
    });

    await service.generateKit(RAW_USER_ID, OPP_ID, true, AUTH_ID);

    const kit = dbState().inserts.find((row: any) => row.tableName === APP_KITS)
      ?.values.kit;
    expect(kit.checklist[0].id).toBe("old-cv");
    expect(kit.checklist[1].id).toBe("new-2");
  });

  // P2.2: a concurrent request that won the race (wrote a kit while our slow AI
  // call ran) must be returned as-is, with our charge refunded and no clobbering
  // second write.
  it("returns a concurrently-written kit and refunds instead of double-charging", async () => {
    const { service, ai, monetization, charge } = makeService();
    const concurrentKit = {
      id: "kit-1",
      userId: DB_USER_ID,
      opportunityId: OPP_ID,
      kit: { fitNote: "the winner", checklist: [] },
      essays: [],
      checklistState: {},
      generatedBy: "ai",
    };
    // First applicationKits read (cache check) is empty, the second (the P2.2
    // guard, after the AI call) finds the concurrent winner.
    let appKitReads = 0;
    routeSelects({
      [APP_KITS]: () => (appKitReads++ === 0 ? [] : [concurrentKit]),
      [OPPORTUNITIES]: () => [opportunityRow()],
      [GOALS]: () => [],
      [PROFILES]: () => [{ country: "Kenya" }],
    });
    (ai.generateJson as jest.Mock).mockResolvedValue({
      fitNote: "our slower kit",
      strategy: [],
      checklist: [],
      essayPrompts: [],
      eligibilityFlags: [],
      gaps: [],
    });

    await service.generateKit(RAW_USER_ID, OPP_ID, false, AUTH_ID);

    expect(monetization.refund).toHaveBeenCalledWith(charge);
    // No kit was inserted — the winner was returned untouched.
    expect(
      dbState().inserts.some((row: any) => row.tableName === APP_KITS),
    ).toBe(false);
  });
});
