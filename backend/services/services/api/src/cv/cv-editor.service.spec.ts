import { toDatabaseUserId } from "../common/user-id";
import { CvEditorService } from "./cv-editor.service";
const owner = "user_clerk_owner";
const id = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
function fixture(
  uuidSchema = false,
  profilePresent = true,
  canonicalProfile = false,
) {
  const profileId = canonicalProfile
    ? toDatabaseUserId(owner)
    : "8be7e62a-1890-425b-a018-f4ab0e2d4773";
  const rows: any[] = [
    {
      id,
      user_id: uuidSchema ? profileId : owner,
      name: "Research CV",
      template_id: "academic",
      data_json: {
        research: [{ title: "Malaria study" }],
        publications: [{ title: "Paper" }],
        custom: { preserved: true },
      },
      updated_at: "2026-10-01T00:00:00.000Z",
    },
  ];
  const client = {
    from: (table: string) => {
      const predicates: Array<[string, unknown]> = [];
      let patch: any;
      let insert: any;
      const q: any = {
        select: () => q,
        eq: (key: string, value: unknown) => {
          predicates.push([key, value]);
          return q;
        },
        in: (key: string, values: unknown[]) => {
          predicates.push([key, values]);
          return q;
        },
        order: () => q,
        limit: () => q,
        update: (p: any) => {
          patch = p;
          return q;
        },
        insert: (p: any) => {
          insert = p;
          return q;
        },
        delete: () => q,
        maybeSingle: async () => {
          const row = rows.find((r) =>
            predicates.every(([k, v]) => r[k] === v),
          );
          if (row && patch) Object.assign(row, patch);
          return { data: row || null, error: null };
        },
        single: async () => {
          const row = { ...insert, id };
          rows.push(row);
          return { data: row, error: null };
        },
        then: (resolve: any) => {
          if (
            table === "user_cvs" &&
            uuidSchema &&
            predicates.some(
              ([k, v]) => k === "user_id" && String(v).startsWith("user_"),
            )
          )
            return resolve({ data: null, error: { code: "22P02" } });
          const source =
            table === "profiles"
              ? profilePresent
                ? [
                    canonicalProfile
                      ? { user_id: profileId }
                      : { id: profileId, user_id: owner },
                  ]
                : []
              : rows;
          return resolve({
            data: source.filter((r) =>
              predicates.every(([k, v]) =>
                Array.isArray(v) ? v.includes(r[k]) : r[k] === v,
              ),
            ),
            error: null,
          });
        },
      };
      return q;
    },
  };
  return { rows, service: new CvEditorService(client as never) };
}
describe("cross-platform CV editor", () => {
  it("preserves complete mobile sections and unknown fields on edit", async () => {
    const { service, rows } = fixture();
    const cv = await service.get(owner, id);
    const saved = await service.update(owner, id, {
      name: "Updated",
      data: cv.data,
      templateId: "academic",
      expectedUpdatedAt: cv.updatedAt,
    });
    expect(saved.data).toEqual({
      research: [{ title: "Malaria study" }],
      publications: [{ title: "Paper" }],
      custom: { preserved: true },
      _edutuTemplateSlug: "academic",
    });
    expect(rows[0].name).toBe("Updated");
    expect(rows[0].template_id).toBeNull();
    expect(saved.templateId).toBe("academic");
  });
  it("rejects stale revisions without overwriting another device", async () => {
    const { service, rows } = fixture();
    await expect(
      service.update(owner, id, {
        name: "Stale",
        data: {},
        expectedUpdatedAt: "2025-01-01T00:00:00Z",
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(rows[0].name).toBe("Research CV");
  });
  it("does not reveal another owner record", async () => {
    await expect(fixture().service.get("user_other", id)).rejects.toMatchObject(
      { status: 404 },
    );
  });
});

it("rejects malformed CV sections before persistence", async () => {
  const { service } = fixture();
  await expect(
    service.create(owner, {
      name: "Bad",
      data: { skills: "not an array" },
    } as never),
  ).rejects.toMatchObject({ status: 400 });
});

it("resolves a UUID foreign-key owner through the authenticated profile", async () => {
  const { service, rows } = fixture(true);
  const cv = await service.get(owner, id);
  await service.update(owner, id, {
    name: "UUID save",
    data: cv.data,
    expectedUpdatedAt: cv.updatedAt,
  });
  expect(rows[0].name).toBe("UUID save");
  await expect(service.get("user_other", id)).rejects.toMatchObject({
    status: 503,
  });
});
it("does not guess a profile UUID when no owned profile exists", async () => {
  await expect(
    fixture(true, false).service.create(owner, { name: "CV", data: {} }),
  ).rejects.toMatchObject({ status: 503 });
});
it("resolves database template names and clears stale slug metadata when changed", async () => {
  const { service, rows } = fixture();
  rows[0].template_id = id;
  rows[0].cv_templates = { name: "Academic Research" };
  expect((await service.get(owner, id)).templateId).toBe("academic-research");
  const cv = await service.get(owner, id);
  const saved = await service.update(owner, id, {
    name: cv.name,
    data: { ...cv.data, _edutuTemplateSlug: "bold-impact" },
    templateId: id,
    expectedUpdatedAt: cv.updatedAt,
  });
  expect(saved.data._edutuTemplateSlug).toBeUndefined();
  expect(rows[0].template_id).toBe(id);
});

it("supports the canonical backend profile primary key without a separate id column", async () => {
  const { service, rows } = fixture(true, true, true);
  const cv = await service.get(owner, id);
  await service.update(owner, id, {
    name: "Canonical",
    data: cv.data,
    expectedUpdatedAt: cv.updatedAt,
  });
  expect(rows[0].user_id).toBe(toDatabaseUserId(owner));
  expect(rows[0].name).toBe("Canonical");
});
it.each([
  ["Professional", "minimal-ats"],
  ["Modern", "modern-professional"],
  ["Academic", "academic-research"],
  ["Tech Executive", "executive"],
  ["Investment Banking", "executive"],
])("round trips legacy seeded template %s", async (name, slug) => {
  const { service, rows } = fixture();
  rows[0].template_id = id;
  rows[0].cv_templates = { name };
  const cv = await service.get(owner, id);
  expect(cv.templateId).toBe(slug);
  const saved = await service.update(owner, id, {
    name: cv.name,
    data: cv.data,
    templateId: cv.templateId,
    expectedUpdatedAt: cv.updatedAt,
  });
  expect(saved.data._edutuTemplateSlug).toBe(slug);
  expect(rows[0].template_id).toBeNull();
});
