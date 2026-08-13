import { NotFoundException } from "@nestjs/common";
import { db } from "../db";
import {
  RespondSubmissionSchema,
  SubmitOpportunitySchema,
} from "./dto/opportunity-submission.dto";
import { OpportunitySubmissionsService } from "./opportunity-submissions.service";

jest.mock("drizzle-orm", () => ({
  and: jest.fn(),
  desc: jest.fn(),
  eq: jest.fn(),
}));

jest.mock("../db", () => ({
  db: {
    insert: jest.fn(),
    select: jest.fn(),
    update: jest.fn(),
  },
  opportunitySubmissions: {
    id: "id",
    userId: "userId",
    status: "status",
    submittedAt: "submittedAt",
  },
}));

const mockedDb = db as unknown as {
  insert: jest.Mock;
  select: jest.Mock;
  update: jest.Mock;
};

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const ADMIN_ID = "33333333-3333-4333-8333-333333333333";

function submission(overrides: Record<string, unknown> = {}) {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
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

function mockInsert(row: ReturnType<typeof submission>) {
  const returning = jest.fn().mockResolvedValue([row]);
  const values = jest.fn().mockReturnValue({ returning });
  mockedDb.insert.mockReturnValue({ values });
  return { values, returning };
}

function mockSelect(rows: unknown[]) {
  const orderBy = jest.fn().mockResolvedValue(rows);
  const whereResult = Promise.resolve(rows) as Promise<unknown[]> & {
    orderBy?: jest.Mock;
  };
  whereResult.orderBy = orderBy;
  const where = jest.fn().mockReturnValue(whereResult);
  const from = jest.fn().mockReturnValue({ where });
  mockedDb.select.mockReturnValue({ from });
  return { from, where, orderBy };
}

function mockUpdate(row: unknown) {
  const returning = jest.fn().mockResolvedValue(row ? [row] : []);
  const where = jest.fn().mockReturnValue({ returning });
  const set = jest.fn().mockReturnValue({ where });
  mockedDb.update.mockReturnValue({ set });
  return { set, where, returning };
}

function makeService(overrides: Record<string, unknown> = {}) {
  const notifications = { broadcast: jest.fn().mockResolvedValue(undefined) };
  const opportunities = {
    create: jest.fn(),
    findOne: jest.fn(),
    updateStatus: jest.fn(),
    ...overrides,
  };
  const settings = {
    getSettings: jest.fn().mockResolvedValue({
      settings: {
        userContent: {
          requireApproval: false,
          paidSubmissions: false,
          submissionCostCredits: 0,
        },
      },
    }),
  };
  const monetization = {
    chargeCredits: jest.fn(),
    refundCredits: jest.fn(),
  };
  const service = new OpportunitySubmissionsService(
    notifications as any,
    opportunities as any,
    settings as any,
    monetization as any,
  );
  return { service, notifications, opportunities, settings, monetization };
}

describe("OpportunitySubmissionsService publication state machine", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("always stores a user submission as pending even when approval is disabled", async () => {
    const row = submission();
    mockInsert(row);
    const { service, opportunities } = makeService();

    const result = await service.submit(USER_ID, {
      title: "Community scholarship",
      applyUrl: "https://example.com/apply",
    } as any);

    expect(result.status).toBe("pending");
    expect(opportunities.create).not.toHaveBeenCalled();
    expect(mockedDb.insert).toHaveBeenCalledTimes(1);
  });

  it("rejects dangerous URL protocols and unbounded submission metadata", () => {
    expect(() =>
      SubmitOpportunitySchema.parse({
        title: "Unsafe opportunity",
        applyUrl: "javascript:alert(1)",
      }),
    ).toThrow();

    expect(() =>
      SubmitOpportunitySchema.parse({
        title: "Too much metadata",
        extra: Object.fromEntries(
          Array.from({ length: 21 }, (_, index) => [`key-${index}`, true]),
        ),
      }),
    ).toThrow();
  });

  it("keeps submission reads and responses scoped to the submitter", async () => {
    mockSelect([]);
    const { service } = makeService();

    await expect(
      service.getMine(OTHER_USER_ID, "submission-1"),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.respond(OTHER_USER_ID, "submission-1", {
        message: "Here is the requested information.",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("returns a needs-info response to pending without giving the user publication control", async () => {
    const row = submission({ status: "needs_info" });
    mockSelect([row]);
    const updated = { ...row, status: "pending" };
    const update = mockUpdate(updated);
    const { service } = makeService();

    const result = await service.respond(USER_ID, row.id, {
      message: "Here is the missing application detail.",
      patch: { applyUrl: "https://example.com/apply-now" },
    } as any);

    expect(update.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "pending",
        applyUrl: "https://example.com/apply-now",
      }),
    );
    expect(result.status).toBe("pending");
  });

  it("does not accept a client publication status in a response patch", () => {
    expect(() =>
      RespondSubmissionSchema.parse({
        message: "Trying to self-publish",
        patch: { status: "approved" },
      }),
    ).toThrow();
  });
});
