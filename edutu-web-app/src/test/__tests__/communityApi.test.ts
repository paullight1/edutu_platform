import { afterEach, describe, expect, it, vi } from "vitest";
import { CommunityApi, CommunityApiError } from "../../features/community/api";
import { fetchPublicGroups } from "../../features/community/publicApi";

vi.stubEnv("VITE_BACKEND_URL", "https://api.edutu.test");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Community browser API", () => {
  it("preserves the backend refusal sentence and status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "This group is private. Ask an owner for an invite." }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const api = new CommunityApi(async () => "token");

    await expect(api.getGroup("group-1")).rejects.toMatchObject({
      name: "CommunityApiError",
      status: 403,
      message: "This group is private. Ask an owner for an invite.",
    } satisfies Partial<CommunityApiError>);
  });

  it("requires a signed-in session before authenticated community calls", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const api = new CommunityApi(async () => null);

    await expect(api.listGroups({ limit: 20 })).rejects.toMatchObject({
      status: 401,
      message: "You need to be signed in to use community.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("serializes both keyset cursor fields for message history", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const api = new CommunityApi(async () => "token");

    await api.fetchMessages("group-1", {
      before: "2026-08-20T10:00:00.000Z",
      beforeId: "11111111-1111-4111-8111-111111111111",
      limit: 40,
    });

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("before=2026-08-20T10%3A00%3A00.000Z");
    expect(url).toContain("beforeId=11111111-1111-4111-8111-111111111111");
    expect(url).toContain("limit=40");
  });

  it("fetches public group discovery without an Authorization header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchPublicGroups(12);

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.edutu.test/public/communities/groups?limit=12");
    const headers = new Headers(options.headers);
    expect(headers.has("Authorization")).toBe(false);
  });
});
