import {
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
jest.mock("@supabase/supabase-js", () => ({ createClient: jest.fn() }));
import { createClient } from "@supabase/supabase-js";
import { MeService } from "./me.service";
import { toDatabaseUserId } from "../common/user-id";

const APP = "11111111-1111-4111-8111-111111111111";
const OPP = "22222222-2222-4222-8222-222222222222";

describe("application creation is idempotent", () => {
  const previous = {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  beforeEach(() => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test";
  });
  afterEach(() => {
    if (previous.url === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previous.url;
    if (previous.key === undefined)
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previous.key;
  });

  it("never resets an existing submission, notes, or submission time when reopening Apply", async () => {
    let stored = {
      id: APP,
      user_id: "user-1",
      opportunity_id: OPP,
      status: "submitted",
      notes: "Interview Tuesday",
      submitted_at: "2026-10-01T00:00:00Z",
    };
    const expected = { ...stored };
    let inserted = false;
    let reads = 0;
    const upsert = jest.fn(
      (
        payload: Record<string, unknown>,
        options?: { ignoreDuplicates?: boolean },
      ) => {
        if (!options?.ignoreDuplicates) stored = { ...stored, ...payload };
        inserted = !options?.ignoreDuplicates;
      },
    );
    (createClient as jest.Mock).mockReturnValue({
      from(table: string) {
        const builder: any = {};
        for (const method of ["select", "eq", "in", "order", "limit"])
          builder[method] = () => builder;
        builder.upsert = (
          payload: Record<string, unknown>,
          options: { ignoreDuplicates?: boolean },
        ) => {
          upsert(payload, options);
          return builder;
        };
        builder.single = async () => ({ data: stored, error: null });
        builder.maybeSingle = async () => ({
          data: ++reads === 1 ? null : inserted ? stored : null,
          error: null,
        });
        // Reads after the duplicate is ignored return the existing owner-scoped row.
        builder.eq = () => {
          inserted = true;
          return builder;
        };
        builder.then = (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(resolve);
        if (table !== "opportunity_applications")
          builder.maybeSingle = async () => ({ data: null, error: null });
        return builder;
      },
    });
    const service = new MeService();
    const result = await service.createApplication("user-1", {
      opportunityId: OPP,
      status: "draft",
      notes: null,
    });
    expect(stored).toEqual(expected);
    expect(result.status).toBe("submitted");
    expect(upsert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ ignoreDuplicates: true }),
    );
  });

  it("preserves a raw Clerk-owned application and rejects another account before recording events", async () => {
    const raw = "user_legacy_application";
    const row = {
      id: APP,
      user_id: raw,
      opportunity_id: OPP,
      status: "submitted",
      notes: "Saved note",
    };
    const writes: unknown[] = [];
    (createClient as jest.Mock).mockReturnValue({
      from(table: string) {
        const builder: any = {};
        let owners: string[] = [];
        for (const method of ["select", "eq", "order", "limit"])
          builder[method] = () => builder;
        builder.in = (column: string, values: string[]) => {
          if (column === "user_id") owners = values;
          return builder;
        };
        builder.maybeSingle = async () => ({
          data:
            table === "opportunity_applications" && owners.includes(raw)
              ? row
              : null,
          error: null,
        });
        builder.upsert = (value: unknown) => {
          writes.push(value);
          return builder;
        };
        builder.then = (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(resolve);
        return builder;
      },
    });
    const service = new MeService();
    expect(
      (
        await service.createApplication(raw, {
          opportunityId: OPP,
          status: "draft",
        })
      ).status,
    ).toBe("submitted");
    expect(writes).toHaveLength(0);
    await expect(
      service.recordApplicationEvent("user_other", APP, {
        eventId: OPP,
        event: "application_prompt_snoozed",
      }),
    ).rejects.toThrow("Application not found");
    expect(writes).toHaveLength(0);
    await service.recordApplicationEvent(raw, APP, {
      eventId: OPP,
      event: "application_prompt_snoozed",
    });
    expect(writes).toHaveLength(1);
  });

  it("includes raw-owned applications in deadlines and dashboard totals", async () => {
    const raw = "user_legacy_deadline";
    (createClient as jest.Mock).mockReturnValue({
      from(table: string) {
        const builder: any = {};
        let owners: string[] = [];
        for (const method of ["select", "eq", "order", "is", "not"])
          builder[method] = () => builder;
        builder.in = (_column: string, values: string[]) => {
          owners = values;
          return builder;
        };
        builder.then = (resolve: (value: unknown) => unknown) =>
          Promise.resolve({
            data:
              table === "opportunity_applications" && owners.includes(raw)
                ? [
                    {
                      id: APP,
                      user_id: raw,
                      opportunity_id: OPP,
                      status: "draft",
                    },
                  ]
                : table === "opportunities"
                  ? [
                      {
                        id: OPP,
                        title: "Verification fellowship",
                        category: "Scholarships",
                        deadline: "2100-01-01",
                      },
                    ]
                  : [],
            error: null,
            count: 0,
          }).then(resolve);
        return builder;
      },
    });
    const service = new MeService();
    expect((await service.listDeadlines(raw)).summary.total).toBe(1);
    const panel = await service.getStatusPanel(toDatabaseUserId(raw), raw);
    expect(panel.opportunities.applicationCount).toBe(1);
    expect(panel.opportunities.draftApplications).toBe(1);
    expect(
      (await service.getStatusPanel("user_other", "user_other")).opportunities
        .applicationCount,
    ).toBe(0);
  });
});
