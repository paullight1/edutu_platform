import { afterEach, describe, expect, it, vi } from "vitest";
import * as communityApiModule from "../../features/community/api";
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

  it("uses the post engagement endpoint contract", async () => {
    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response("{}", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const api = new CommunityApi(async () => "token") as CommunityApi & {
      fetchPinnedPost(groupId: string): Promise<unknown>;
      fetchPostThread(groupId: string, postId: string): Promise<unknown>;
      sendComment(
        groupId: string,
        postId: string,
        input: { body: string },
      ): Promise<unknown>;
      likeMessage(messageId: string): Promise<unknown>;
      unlikeMessage(messageId: string): Promise<unknown>;
      pinMessage(messageId: string, pinned: boolean): Promise<unknown>;
    };

    await api.fetchPinnedPost("group/1");
    await api.fetchPostThread("group/1", "post/1");
    await api.sendComment("group/1", "post/1", { body: "Helpful" });
    await api.likeMessage("post/1");
    await api.unlikeMessage("post/1");
    await api.pinMessage("post/1", true);

    expect(
      fetchMock.mock.calls.map(([url, options]) => [
        String(url).replace("https://api.edutu.test", ""),
        (options as RequestInit).method ?? "GET",
        (options as RequestInit).body ?? null,
      ]),
    ).toEqual([
      ["/communities/groups/group%2F1/pinned-post", "GET", null],
      ["/communities/groups/group%2F1/posts/post%2F1", "GET", null],
      [
        "/communities/groups/group%2F1/posts/post%2F1/comments",
        "POST",
        JSON.stringify({ body: "Helpful" }),
      ],
      ["/communities/messages/post%2F1/like", "PUT", null],
      ["/communities/messages/post%2F1/like", "DELETE", null],
      [
        "/communities/messages/post%2F1/pin",
        "PATCH",
        JSON.stringify({ pinned: true }),
      ],
    ]);
  });

  it("serializes the complete member-roster cursor", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ members: [], hasMore: false, nextCursor: null }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const api = new CommunityApi(async () => "token");

    await api.getMembers("group-1", 25, {
      role: "mod",
      joinedAt: "2026-08-20T10:00:00.000Z",
      id: "11111111-1111-4111-8111-111111111111",
    });

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("limit=25");
    expect(url).toContain("afterRole=mod");
    expect(url).toContain("afterJoinedAt=2026-08-20T10%3A00%3A00.000Z");
    expect(url).toContain("afterId=11111111-1111-4111-8111-111111111111");
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

  it("reserves community attachments through the backend and uploads only to the signed HTTPS URL", async () => {
    const reservation = {
      uploadUrl: "https://storage.edutu.test/signed-upload",
      resourceUrl:
        "https://api.edutu.test/communities/groups/group-1/attachments/download-url?path=groups%2Fgroup-1%2Ffile.png&signature=signed",
      storagePath: "groups/group-1/file.png",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(reservation), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const api = new CommunityApi(async () => "token");
    const attachmentApi = api as unknown as {
      createAttachmentUpload: (
        groupId: string,
        input: { kind: "image"; name: string; mime: "image/png"; size: number },
      ) => Promise<typeof reservation>;
    };
    const uploader = (
      communityApiModule as unknown as {
        uploadCommunityAttachment: (uploadUrl: string, file: File) => Promise<void>;
      }
    ).uploadCommunityAttachment;

    const reserved = await attachmentApi.createAttachmentUpload("group-1", {
      kind: "image",
      name: "proof.png",
      mime: "image/png",
      size: 4,
    });
    const file = new File([new Uint8Array([1, 2, 3, 4])], "proof.png", {
      type: "image/png",
    });
    await uploader(reserved.uploadUrl, file);

    const [reserveUrl, reserveOptions] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(reserveUrl).toBe(
      "https://api.edutu.test/communities/groups/group-1/attachments/upload-url",
    );
    expect(reserveOptions.method).toBe("POST");
    expect(JSON.parse(String(reserveOptions.body))).toEqual({
      kind: "image",
      name: "proof.png",
      mime: "image/png",
      size: 4,
    });

    const [uploadUrl, uploadOptions] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(uploadUrl).toBe(reservation.uploadUrl);
    expect(uploadOptions.method).toBe("PUT");
    expect(new Headers(uploadOptions.headers).get("Content-Type")).toBe("image/png");
    expect(new Headers(uploadOptions.headers).get("x-upsert")).toBe("false");
    expect(uploadOptions.body).toBe(file);
  });
});
