import { BadRequestException } from "@nestjs/common";
import { db } from "../db";
import { OpportunitySubmissionsService } from "./opportunity-submissions.service";

jest.mock("../db", () => ({
  db: {
    transaction: jest.fn(),
  },
  opportunitySubmissions: {
    id: "id",
  },
}));

const mockedDb = db as unknown as { transaction: jest.Mock };

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN_ID = "33333333-3333-4333-8333-333333333333";
const SUBMISSION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OPPORTUNITY_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function submission(overrides: Record<string, unknown> = {}) {
  return {
    id: SUBMISSION_ID,
    userId: USER_ID,
    title: "Community scholarship",
    organization: "Edutu Foundation",
    category: "scholarship",
    type: "scholarship",
    summary: "A scholarship for learners.",
    description: "A longer description for the opportunity.",
    location: "Nigeria",
    isRemote: false,
    eligibility: "Nigerian learners",
    benefits: "Tuition support",
    deadline: new Date("2026-12-01T00:00:00.000Z"),
    applyUrl: "https://example.com/apply",
    sourceUrl: "https://example.com",
    imageUrl: null,
    extra: {},
    status: "pending",
    adminNote: null,
    userResponse: null,
    thread: [],
    reviewedBy: null,
    reviewedAt: null,
    approvedOpportunityId: null,
    submittedAt: new Date("2026-08-13T00:00:00.000Z"),
    updatedAt: new Date("2026-08-13T00:00:00.000Z"),
    ...overrides,
  };
}

function makeService() {
  const catalog = {
    createPendingReviewFromSubmission: jest
      .fn()
      .mockResolvedValue(OPPORTUNITY_ID),
    prepareSubmissionOpportunityForApproval: jest
      .fn()
      .mockResolvedValue(OPPORTUNITY_ID),
    setSubmissionCatalogReviewState: jest.fn().mockResolvedValue(undefined),
  };
  const verification = { verifyOne: jest.fn().mockResolvedValue(null) };
  const notifications = { broadcast: jest.fn().mockResolvedValue(undefined) };
  const settings = {
    getSettings: jest.fn().mockResolvedValue({
      settings: {
        userContent: { paidSubmissions: false, submissionCostCredits: 0 },
      },
    }),
  };
  const monetization = { chargeCredits: jest.fn(), refundCredits: jest.fn() };
  const service = new OpportunitySubmissionsService(
    notifications as any,
    catalog as any,
    settings as any,
    monetization as any,
    verification as any,
  );
  return { service, catalog, verification, notifications };
}

function rawSubmission(row: ReturnType<typeof submission>) {
  return {
    ...row,
    user_id: row.userId,
    is_remote: row.isRemote,
    apply_url: row.applyUrl,
    source_url: row.sourceUrl,
    image_url: row.imageUrl,
    admin_note: row.adminNote,
    user_response: row.userResponse,
    reviewed_by: row.reviewedBy,
    reviewed_at: row.reviewedAt,
    approved_opportunity_id: row.approvedOpportunityId,
    submitted_at: row.submittedAt,
    updated_at: row.updatedAt,
  };
}

function transactionFor(row: ReturnType<typeof submission>) {
  const state = { ...row };
  const catalogRow = {
    id: OPPORTUNITY_ID,
    status: "pending_review",
    verificationStatus: "unverified",
    metadata: { submission_id: row.id },
  };
  const tx = {
    execute: jest
      .fn()
      .mockImplementation(async () => ({ rows: [rawSubmission(state)] })),
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        onConflictDoNothing: jest.fn().mockReturnValue({
          returning: jest.fn().mockReturnValue({
            execute: jest.fn().mockResolvedValue([catalogRow]),
          }),
        }),
      }),
    }),
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([catalogRow]),
        }),
      }),
    }),
    update: jest.fn().mockImplementation(() => ({
      set: jest.fn().mockImplementation((patch: Record<string, unknown>) => ({
        where: jest.fn().mockImplementation(() => ({
          returning: jest.fn().mockImplementation(async () => {
            Object.assign(state, patch);
            return [rawSubmission(state)];
          }),
        })),
      })),
    })),
  };
  mockedDb.transaction.mockImplementation(
    async (callback: (tx: unknown) => unknown) => callback(tx),
  );
  return { tx, state };
}

describe("Task 8 publication corrections", () => {
  beforeEach(() => jest.clearAllMocks());

  it("creates an unverified pending-review row and verifies before public activation", async () => {
    const { service, catalog, verification } = makeService();
    transactionFor(submission());

    const result = await service.review(SUBMISSION_ID, ADMIN_ID, {
      decision: "approved",
    });

    expect(mockedDb.transaction).toHaveBeenCalledTimes(1);
    expect(catalog.createPendingReviewFromSubmission).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: SUBMISSION_ID }),
    );
    expect(verification.verifyOne).toHaveBeenCalledWith(OPPORTUNITY_ID);
    expect(result).toMatchObject({
      status: "approved",
      approved_opportunity_id: OPPORTUNITY_ID,
    });
  });

  it("withdraws the linked catalog row for approved-to-rejected and approved-to-needs-info", async () => {
    for (const decision of ["rejected", "needs_info"] as const) {
      const { service, catalog } = makeService();
      transactionFor(
        submission({
          status: "approved",
          approvedOpportunityId: OPPORTUNITY_ID,
        }),
      );

      const result = await service.review(SUBMISSION_ID, ADMIN_ID, {
        decision,
        ...(decision === "needs_info"
          ? { adminNote: "Please add the official deadline." }
          : {}),
      });

      expect(catalog.setSubmissionCatalogReviewState).toHaveBeenCalledWith(
        expect.anything(),
        OPPORTUNITY_ID,
        SUBMISSION_ID,
        decision,
      );
      expect(result.status).toBe(decision);
    }
  });

  it("makes repeated decisions idempotent and does not create a second catalog row", async () => {
    const { service, catalog, notifications } = makeService();
    const row = submission();
    transactionFor(row);

    await service.review(SUBMISSION_ID, ADMIN_ID, { decision: "approved" });
    const firstCreateCount =
      catalog.createPendingReviewFromSubmission.mock.calls.length;

    transactionFor(
      submission({ status: "approved", approvedOpportunityId: OPPORTUNITY_ID }),
    );
    await service.review(SUBMISSION_ID, ADMIN_ID, { decision: "approved" });

    expect(catalog.createPendingReviewFromSubmission).toHaveBeenCalledTimes(
      firstCreateCount,
    );
    expect(catalog.prepareSubmissionOpportunityForApproval).toHaveBeenCalled();
    expect(notifications.broadcast).toHaveBeenCalledTimes(1);
  });

  it("surfaces transaction persistence failures instead of swallowing recovery errors", async () => {
    const { service } = makeService();
    mockedDb.transaction.mockRejectedValueOnce(new Error("commit failed"));

    await expect(
      service.review(SUBMISSION_ID, ADMIN_ID, { decision: "approved" }),
    ).rejects.toThrow("commit failed");
  });

  it("rejects needs-info decisions without an admin note", async () => {
    const { service } = makeService();
    await expect(
      service.review(SUBMISSION_ID, ADMIN_ID, { decision: "needs_info" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockedDb.transaction).not.toHaveBeenCalled();
  });
});
