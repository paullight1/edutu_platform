import {
  ApplicationDocumentsService,
  deriveMissingRoles,
  REQUIRED_ROLES,
} from "./application-documents.service";

describe("deriveMissingRoles", () => {
  it("reports required roles that have no submitted/draft doc", () => {
    expect(deriveMissingRoles([{ role: "cv", status: "submitted" }])).toEqual([
      "sop",
    ]);
  });

  it("is empty when every required role is present (any non-missing status)", () => {
    const rows = REQUIRED_ROLES.map((role) => ({ role, status: "draft" }));
    expect(deriveMissingRoles(rows)).toEqual([]);
  });

  it("treats a 'missing' status row as not present", () => {
    expect(
      deriveMissingRoles([
        { role: "cv", status: "missing" },
        { role: "sop", status: "submitted" },
      ]),
    ).toEqual(["cv"]);
  });

  it("ignores non-required roles", () => {
    expect(
      deriveMissingRoles([{ role: "transcript", status: "submitted" }]).sort(),
    ).toEqual([...REQUIRED_ROLES].sort());
  });
});

describe("ApplicationDocumentsService.markSubmitted", () => {
  it("flips the application to submitted once every required role is submitted", async () => {
    const appUpdate = jest.fn().mockReturnValue({
      eq: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
    });

    // Both required roles already submitted, so the post-mark status check
    // returns no missing roles and the application should be flipped.
    const client = {
      from: (table: string) => {
        if (table === "application_documents") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: () =>
                      Promise.resolve({ data: { id: "row_1" }, error: null }),
                  }),
                }),
                // listForUser's docs query: .select().eq(user)
                then: undefined,
              }),
            }),
            update: () => ({
              eq: () => ({
                select: () => ({
                  single: () =>
                    Promise.resolve({
                      data: {
                        id: "row_1",
                        application_id: "app_1",
                        role: "cv",
                        status: "submitted",
                        document_id: null,
                        upload_id: null,
                        submitted_at: "2026-07-18T00:00:00Z",
                      },
                      error: null,
                    }),
                }),
              }),
            }),
          } as never;
        }
        if (table === "opportunity_applications") {
          return { update: appUpdate } as never;
        }
        return {} as never;
      },
    };

    // Stub listForUser (used by the internal completeness check) so both
    // required roles read as submitted → missingRoles empty → flip.
    const service = new ApplicationDocumentsService(client as never);
    jest.spyOn(service, "getStatus").mockResolvedValue({
      applicationId: "app_1",
      opportunityId: "opp_1",
      opportunityTitle: "Rhodes",
      status: "draft",
      deadline: null,
      docs: [
        {
          id: "r1",
          role: "cv",
          status: "submitted",
          documentId: null,
          uploadId: null,
          submittedAt: null,
        },
        {
          id: "r2",
          role: "sop",
          status: "submitted",
          documentId: null,
          uploadId: null,
          submittedAt: null,
        },
      ],
      missingRoles: [],
    });

    const result = await service.markSubmitted("user_1", {
      applicationId: "app_1",
      role: "cv",
    });

    expect(result.status).toBe("submitted");
    expect(appUpdate).toHaveBeenCalled();
  });
});
