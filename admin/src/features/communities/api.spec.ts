import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ backendFetchJson: vi.fn() }));

vi.mock("../../lib/backend", () => ({
  backendFetchJson: mocks.backendFetchJson,
}));

import {
  approveCreationRequest,
  listCommunityGroups,
  replaceTrendingCommunities,
} from "./api";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.backendFetchJson.mockResolvedValue({});
});

describe("community admin API", () => {
  it("encodes catalog filters without leaking empty values", async () => {
    await listCommunityGroups({ query: "study help", status: "active" });
    expect(mocks.backendFetchJson).toHaveBeenCalledWith(
      "/admin/community/groups?query=study+help&status=active",
    );
  });

  it("uses the dedicated approval mutation", async () => {
    await approveCreationRequest("request/one");
    expect(mocks.backendFetchJson).toHaveBeenCalledWith(
      "/admin/community/creation-requests/request%2Fone/approve",
      { method: "POST" },
    );
  });

  it("sends the complete ordered Trending selection", async () => {
    await replaceTrendingCommunities(["group-b", "group-a"]);
    expect(mocks.backendFetchJson).toHaveBeenCalledWith(
      "/admin/community/trending",
      {
        method: "PUT",
        body: JSON.stringify({ groupIds: ["group-b", "group-a"] }),
      },
    );
  });
});
