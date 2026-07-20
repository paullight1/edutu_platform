import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { ApplicationStatusSchema } from "./dto/me.dto";

// createClient is invoked in the MeService constructor. We hand it a fully
// chainable stub so updateApplication + recordOutcomeSignal run end-to-end and
// we can assert the outcome signal that gets inserted.
jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(),
}));

import { createClient } from "@supabase/supabase-js";
import { MeService } from "./me.service";

const APP_ID = "11111111-1111-4111-8111-111111111111";
const OPP_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "user_test";

interface Captured {
  signalInserts: Array<Record<string, unknown>>;
}

function buildMockClient(updatedRow: Record<string, unknown>): {
  client: unknown;
  captured: Captured;
} {
  const captured: Captured = { signalInserts: [] };

  const client = {
    from(table: string) {
      const builder: Record<string, unknown> = { _table: table };
      for (const method of [
        "select",
        "update",
        "delete",
        "eq",
        "in",
        "order",
        "limit",
        "abortSignal",
        "upsert",
      ]) {
        builder[method] = () => builder;
      }
      builder.insert = (payload: Record<string, unknown>) => {
        if (table === "user_opportunity_signals") {
          captured.signalInserts.push(payload);
        }
        return Promise.resolve({ error: null });
      };
      builder.maybeSingle = () => {
        if (table === "opportunity_applications") {
          return Promise.resolve({ data: updatedRow, error: null });
        }
        // user_opportunity_signals existence check: none exists yet.
        return Promise.resolve({ data: null, error: null });
      };
      // Awaiting the builder directly (e.g. after `.in(...)` in the opportunity
      // hydration query) resolves to an empty result set.
      builder.then = (
        resolve: (value: unknown) => unknown,
        reject: (reason?: unknown) => unknown,
      ) => Promise.resolve({ data: [], error: null }).then(resolve, reject);
      return builder;
    },
  };

  return { client, captured };
}

describe("ApplicationStatusSchema", () => {
  it("accepts no_response as a terminal status", () => {
    expect(ApplicationStatusSchema.parse("no_response")).toBe("no_response");
  });

  it("still accepts the existing pipeline statuses", () => {
    for (const status of [
      "draft",
      "submitted",
      "interview",
      "offer",
      "rejected",
      "withdrawn",
    ]) {
      expect(ApplicationStatusSchema.parse(status)).toBe(status);
    }
  });
});

describe("MeService.updateApplication no_response outcome signal", () => {
  const originalEnv = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  beforeEach(() => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
    (createClient as jest.Mock).mockReset();
  });

  afterEach(() => {
    if (originalEnv.SUPABASE_URL === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalEnv.SUPABASE_URL;
    if (originalEnv.SUPABASE_SERVICE_ROLE_KEY === undefined)
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else
      process.env.SUPABASE_SERVICE_ROLE_KEY =
        originalEnv.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("emits an outcome_ghosted signal when status becomes no_response", async () => {
    const updatedRow = {
      id: APP_ID,
      user_id: USER_ID,
      opportunity_id: OPP_ID,
      status: "no_response",
    };
    const { client, captured } = buildMockClient(updatedRow);
    (createClient as jest.Mock).mockReturnValue(client);

    const service = new MeService();
    await service.updateApplication(USER_ID, APP_ID, {
      status: "no_response",
    });

    expect(captured.signalInserts).toHaveLength(1);
    expect(captured.signalInserts[0]).toMatchObject({
      opportunity_id: OPP_ID,
      signal_type: "outcome_ghosted",
    });
  });

  it("does not stamp submitted_at when transitioning to no_response", async () => {
    const updatedRow = {
      id: APP_ID,
      user_id: USER_ID,
      opportunity_id: OPP_ID,
      status: "no_response",
    };
    const { client } = buildMockClient(updatedRow);
    let capturedPatch: Record<string, unknown> | null = null;
    // Wrap update() to capture the patch object.
    const wrapped = {
      from(table: string) {
        const builder = (
          client as { from: (t: string) => Record<string, unknown> }
        ).from(table);
        if (table === "opportunity_applications") {
          const originalUpdate = builder.update as () => Record<
            string,
            unknown
          >;
          builder.update = (patch: Record<string, unknown>) => {
            capturedPatch = patch;
            return originalUpdate();
          };
        }
        return builder;
      },
    };
    (createClient as jest.Mock).mockReturnValue(wrapped);

    const service = new MeService();
    await service.updateApplication(USER_ID, APP_ID, {
      status: "no_response",
    });

    expect(capturedPatch).not.toBeNull();
    expect(capturedPatch).not.toHaveProperty("submitted_at");
  });
});
