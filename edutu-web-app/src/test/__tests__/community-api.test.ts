import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CommunityApiError,
  fetchGroupResources,
  fetchGroups,
  fetchMessages,
} from "../../services/community";

const makeGroup = () => ({
  id: "group-1",
  slug: "scholarship-builders",
  name: "Scholarship Builders",
  description: "A focused room for applicants.",
  opportunityId: null,
  ownerId: "user_owner",
  visibility: "public" as const,
  joinPolicy: "open" as const,
  coverEmoji: "🎓",
  coverImageResourceUrl: null,
  accent: null,
  expiresAt: null,
  archivedAt: null,
  memberCount: 12,
  messageCount: 41,
  lastMessageAt: "2026-08-22T12:00:00.000Z",
  createdAt: "2026-08-01T12:00:00.000Z",
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("community API transport", () => {
  it("authenticates group discovery and ignores malformed deploy-skew rows", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          { group: makeGroup(), membership: null },
          makeGroup(),
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const rows = await fetchGroups(
      { query: "scholarship", limit: 20 },
      async () => "clerk-token",
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].group.name).toBe("Scholarship Builders");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/communities/groups?query=scholarship&limit=20");
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer clerk-token",
    );
  });

  it("preserves before plus beforeId on bounded message and resource pages", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ resources: [], nextCursor: null }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    const getToken = async () => "clerk-token";
    const before = "2026-08-22T12:00:00.000Z";
    const beforeId = "11111111-1111-4111-8111-111111111111";

    await fetchMessages("group-1", { before, beforeId, limit: 50 }, getToken);
    await fetchGroupResources("group-1", { before, beforeId, limit: 50 }, getToken);

    expect(String(fetchMock.mock.calls[0][0])).toContain(
      `/communities/groups/group-1/messages?before=${encodeURIComponent(before)}&beforeId=${beforeId}&limit=50`,
    );
    expect(String(fetchMock.mock.calls[1][0])).toContain(
      `/communities/groups/group-1/resources?before=${encodeURIComponent(before)}&beforeId=${beforeId}&limit=50`,
    );
  });

  it("preserves the backend refusal sentence for the UI", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          message: "You can run 2 active groups at a time. Archive one first.",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(
      fetchGroups({}, async () => "clerk-token"),
    ).rejects.toMatchObject({
      name: "CommunityApiError",
      status: 400,
      message: "You can run 2 active groups at a time. Archive one first.",
    });
  });

  it("fails closed when there is no authenticated Clerk token", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(fetchGroups({}, async () => null)).rejects.toEqual(
      expect.objectContaining<Partial<CommunityApiError>>({
        name: "CommunityApiError",
        status: 401,
      }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
