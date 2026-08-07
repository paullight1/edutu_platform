import { afterEach, describe, expect, it, vi } from "vitest";
import { CommunityCallApiError, CommunityCallsApi } from "../api";
import { CALL_ID } from "./fixtures";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("community calls REST API", () => {
  afterEach(() => vi.restoreAllMocks());

  it("parses the normalized backend call shape and defaults absent participants", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      id: CALL_ID,
      groupId: "22222222-2222-4222-8222-222222222222",
      title: "Scholarship check-in",
      scheduledFor: "2026-08-06T18:30:00.000Z",
      durationMinutes: 45,
      status: "live",
      startedAt: "2026-08-06T18:31:00.000Z",
      endedAt: null,
      ringExpiresAt: "2026-08-06T18:31:45.000Z",
      failureCode: null,
      viewer: {
        userId: "user_viewer",
        role: "mod",
        inviteStatus: "joined",
      },
    }));

    const api = new CommunityCallsApi(async () => "clerk-token");
    await expect(api.getCall(CALL_ID)).resolves.toMatchObject({
      id: CALL_ID,
      viewer: { userId: "user_viewer", role: "mod", inviteStatus: "joined" },
      participants: [],
    });
  });

  it("rejects legacy viewerParticipant-only and arbitrary viewer roles", async () => {
    const base = {
      id: CALL_ID,
      groupId: "22222222-2222-4222-8222-222222222222",
      title: "Scholarship check-in",
      scheduledFor: "2026-08-06T18:30:00.000Z",
      durationMinutes: 45,
      status: "live",
    };
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(jsonResponse({
      ...base,
      viewerParticipant: {
        userId: "user_viewer",
        roleAtStart: "owner",
        inviteStatus: "joined",
      },
    }));
    fetchMock.mockResolvedValueOnce(jsonResponse({
      ...base,
      viewer: {
        userId: "user_viewer",
        role: "admin-from-url",
        inviteStatus: "joined",
      },
    }));

    const api = new CommunityCallsApi(async () => "clerk-token");
    await expect(api.getCall(CALL_ID)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    await expect(api.getCall(CALL_ID)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("surfaces stable API error codes", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      code: "CALL_FULL",
      message: "Capacity reached",
    }, 409));
    const api = new CommunityCallsApi(async () => "clerk-token");
    await expect(api.createJoinSession(CALL_ID)).rejects.toMatchObject({
      name: "CommunityCallApiError",
      code: "CALL_FULL",
      status: 409,
    });
  });

  it("does not request a token or start fetch when already cancelled", async () => {
    const controller = new AbortController();
    const getToken = vi.fn().mockResolvedValue("clerk-token");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    controller.abort();

    const api = new CommunityCallsApi(getToken);
    await expect(api.getCall(CALL_ID, controller.signal)).rejects.toMatchObject({
      code: "REQUEST_ABORTED",
    });
    expect(getToken).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses and validates the media-node signalingUrl from the join response", async () => {
    vi.stubEnv("VITE_VOICE_ALLOWED_WSS_ORIGINS", "wss://voice-2.edutu.org");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      token: "a".repeat(32),
      expiresAt: "2026-08-06T18:31:00.000Z",
      signalingUrl: "wss://voice-2.edutu.org/signaling",
      nodeId: "voice-2",
      roomId: CALL_ID,
    }));
    const api = new CommunityCallsApi(async () => "clerk-token");
    await expect(api.createJoinSession(CALL_ID)).resolves.toMatchObject({
      signalingUrl: "wss://voice-2.edutu.org/signaling",
      nodeId: "voice-2",
      roomId: CALL_ID,
    });
  });

  it("rejects an assigned signaling origin outside the deployment allowlist", async () => {
    vi.stubEnv("VITE_VOICE_ALLOWED_WSS_ORIGINS", "wss://voice-1.edutu.org");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      token: "a".repeat(32),
      signaling_url: "wss://attacker.example/signaling",
    }));
    const api = new CommunityCallsApi(async () => "clerk-token");
    await expect(api.createJoinSession(CALL_ID)).rejects.toBeInstanceOf(Error);
  });

  it("rejects malformed successful responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ token: "short" }));
    const api = new CommunityCallsApi(async () => "clerk-token");
    await expect(api.createJoinSession(CALL_ID)).rejects.toBeInstanceOf(CommunityCallApiError);
  });
});
