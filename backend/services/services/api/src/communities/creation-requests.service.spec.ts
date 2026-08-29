import { ConflictException, ForbiddenException } from "@nestjs/common";
import type { CommunityCreationRequest } from "../db/schema";
import type { CreateCommunityRequestDto } from "./dto/creation-request.dto";
import {
  CreationRequestLimitError,
  CreationRequestsService,
  type CreationRequestsStore,
} from "./creation-requests.service";

const requesterId = "user_requester";
const requestId = "11111111-1111-4111-8111-111111111111";
const proposal: CreateCommunityRequestDto = {
  name: "Scholarship Builders",
  description: "Prepare strong applications together.",
  visibility: "public",
  joinPolicy: "open",
  coverEmoji: "💬",
};

function request(
  overrides: Partial<CommunityCreationRequest> = {},
): CommunityCreationRequest {
  return {
    id: requestId,
    requesterId,
    name: proposal.name,
    description: proposal.description ?? null,
    opportunityId: null,
    visibility: proposal.visibility,
    joinPolicy: proposal.joinPolicy,
    coverEmoji: proposal.coverEmoji,
    coverImageResourceUrl: null,
    status: "pending",
    reviewReason: null,
    reviewedBy: null,
    reviewedAt: null,
    approvedGroupId: null,
    createdAt: new Date("2026-08-28T12:00:00.000Z"),
    updatedAt: new Date("2026-08-28T12:00:00.000Z"),
    ...overrides,
  };
}

function setup() {
  const store = {
    submitWithinLimit: jest.fn().mockResolvedValue({
      request: request(),
      used: 1,
    }),
    listForRequester: jest.fn().mockResolvedValue([request()]),
    countUsedSlots: jest.fn().mockResolvedValue(1),
    findById: jest.fn().mockResolvedValue(request()),
    cancelPending: jest
      .fn()
      .mockResolvedValue(request({ status: "cancelled" })),
    setCoverImage: jest.fn().mockResolvedValue(
      request({
        coverImageResourceUrl:
          "https://api.edutu.test/communities/creation-requests/request/cover",
      }),
    ),
  };
  return {
    store,
    service: new CreationRequestsService(
      store as unknown as CreationRequestsStore,
    ),
  };
}

describe("CreationRequestsService", () => {
  it("reserves one of exactly two active-or-pending slots", async () => {
    const { service, store } = setup();

    await expect(service.submit(requesterId, proposal)).resolves.toEqual({
      request: expect.objectContaining({ status: "pending" }),
      slots: { used: 1, limit: 2 },
    });
    expect(store.submitWithinLimit).toHaveBeenCalledWith(
      requesterId,
      proposal,
      2,
    );
  });

  it("returns a stable quota conflict instead of leaking a store error", async () => {
    const { service, store } = setup();
    store.submitWithinLimit.mockRejectedValue(new CreationRequestLimitError());

    await expect(service.submit(requesterId, proposal)).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "COMMUNITY_CREATION_LIMIT_REACHED",
      }),
    });
  });

  it("lists only the caller's history with current slot usage", async () => {
    const { service, store } = setup();

    await expect(service.listMine(requesterId)).resolves.toEqual({
      requests: [expect.objectContaining({ requesterId })],
      slots: { used: 1, limit: 2 },
    });
    expect(store.listForRequester).toHaveBeenCalledWith(requesterId);
    expect(store.countUsedSlots).toHaveBeenCalledWith(requesterId);
  });

  it("does not let a member cancel another person's request", async () => {
    const { service, store } = setup();
    store.findById.mockResolvedValue(request({ requesterId: "user_other" }));

    await expect(service.cancel(requesterId, requestId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(store.cancelPending).not.toHaveBeenCalled();
  });

  it("rejects cancellation after review without changing the row", async () => {
    const { service, store } = setup();
    store.findById.mockResolvedValue(request({ status: "approved" }));

    await expect(service.cancel(requesterId, requestId)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(store.cancelPending).not.toHaveBeenCalled();
  });
});
