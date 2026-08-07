import { describe, expect, it } from "vitest";
import {
  communityCallReducer,
  initialCommunityCallState,
  reconnectDelayMs,
  shouldReconnectWebSocket,
  type CommunityCallState,
} from "../stateMachine";
import { callFixture } from "./fixtures";

describe("community call state machine", () => {
  it("moves a live call through preflight, join, and live muted", () => {
    let state = communityCallReducer(initialCommunityCallState, {
      type: "LOAD_SUCCEEDED",
      call: callFixture("live"),
    });
    expect(state.phase).toBe("preflight");
    state = communityCallReducer(state, { type: "MICROPHONE_READY", label: "Built-in mic" });
    state = communityCallReducer(state, { type: "JOIN_REQUESTED" });
    expect(state.phase).toBe("joining");
    state = communityCallReducer(state, { type: "JOIN_SUCCEEDED" });
    expect(state).toMatchObject({ phase: "live", muted: true });
  });

  it("shows a durable missed state after an ended invite", () => {
    const state = communityCallReducer(initialCommunityCallState, {
      type: "LOAD_SUCCEEDED",
      call: callFixture("ended"),
    });
    expect(state.phase).toBe("missed");
  });

  it("enters reconnecting, backs off, and restores muted", () => {
    let state: CommunityCallState = { ...initialCommunityCallState, phase: "live", call: callFixture("live"), muted: false };
    state = communityCallReducer(state, { type: "CONNECTION_LOST" });
    expect(state).toMatchObject({ phase: "reconnecting", muted: true });
    state = communityCallReducer(state, { type: "RECONNECT_ATTEMPT", attempt: 3 });
    expect(state.reconnectAttempt).toBe(3);
    state = communityCallReducer(state, { type: "RECONNECT_SUCCEEDED" });
    expect(state).toMatchObject({ phase: "live", reconnectAttempt: 0, muted: true });
    expect([reconnectDelayMs(1), reconnectDelayMs(3), reconnectDelayMs(9)]).toEqual([1000, 4000, 12000]);
    expect(shouldReconnectWebSocket(1006)).toBe(true);
    expect(shouldReconnectWebSocket(4003)).toBe(false);
    expect(shouldReconnectWebSocket(4004)).toBe(false);
  });
});
