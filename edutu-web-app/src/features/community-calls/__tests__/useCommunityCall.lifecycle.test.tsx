import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommunityCallApiError, CommunityCallsApi } from "../api";
import { useCommunityCall } from "../useCommunityCall";
import { callFixture, CALL_ID } from "./fixtures";

const mediaMocks = vi.hoisted(() => ({
  preflight: vi.fn(),
}));

vi.mock("../media", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../media")>();
  return {
    ...actual,
    detectBrowserMediaSupport: () => ({ supported: true as const }),
    runMicrophonePreflight: (...args: unknown[]) => mediaMocks.preflight(...args),
  };
});

const getToken = vi.fn().mockResolvedValue("clerk-token");

describe("useCommunityCall cancellation lifecycle", () => {
  afterEach(() => vi.restoreAllMocks());

  it("aborts the previous account request and the current request on unmount", async () => {
    const signals: AbortSignal[] = [];
    vi.spyOn(CommunityCallsApi.prototype, "getCall").mockImplementation((_callId, signal) => {
      if (!signal) throw new Error("Expected an abort signal");
      signals.push(signal);
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          reject(new CommunityCallApiError("cancelled", "REQUEST_ABORTED", 0));
        }, { once: true });
      });
    });

    const { rerender, unmount } = renderHook(
      ({ identity }) => useCommunityCall(CALL_ID, getToken, identity),
      { initialProps: { identity: "user-a:session-a" } },
    );
    await waitFor(() => expect(signals).toHaveLength(1));

    rerender({ identity: "user-b:session-b" });
    await waitFor(() => expect(signals).toHaveLength(2));
    expect(signals[0].aborted).toBe(true);

    unmount();
    expect(signals[1].aborted).toBe(true);
  });

  it("aborts join-token acquisition when navigation unmounts the call", async () => {
    vi.spyOn(CommunityCallsApi.prototype, "getCall").mockResolvedValue(callFixture("live"));
    let joinSignal: AbortSignal | undefined;
    vi.spyOn(CommunityCallsApi.prototype, "createJoinSession").mockImplementation((_callId, signal) => {
      joinSignal = signal;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          reject(new CommunityCallApiError("cancelled", "REQUEST_ABORTED", 0));
        }, { once: true });
      });
    });
    mediaMocks.preflight.mockResolvedValue({ ok: true, label: "Test microphone" });

    const { result, unmount } = renderHook(() =>
      useCommunityCall(CALL_ID, getToken, "user-a:session-a"),
    );
    await waitFor(() => expect(result.current.state.phase).toBe("preflight"));
    await act(async () => { await result.current.checkMicrophone(); });
    expect(result.current.state.microphoneReady).toBe(true);

    let joinPromise!: Promise<void>;
    act(() => { joinPromise = result.current.join(); });
    await waitFor(() => expect(joinSignal).toBeDefined());
    unmount();
    expect(joinSignal?.aborted).toBe(true);
    await joinPromise;
  });
});
