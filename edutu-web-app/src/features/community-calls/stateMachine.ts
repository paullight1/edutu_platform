import type { CommunityCall } from "./types";

export type CallPhase =
  | "loading"
  | "scheduled"
  | "preflight"
  | "joining"
  | "live"
  | "reconnecting"
  | "left"
  | "ended"
  | "missed"
  | "unsupported"
  | "error";

export interface CommunityCallState {
  phase: CallPhase;
  call: CommunityCall | null;
  microphoneReady: boolean;
  microphoneLabel: string | null;
  muted: boolean;
  reconnectAttempt: number;
  error: string | null;
  errorCode: string | null;
}

export type CommunityCallAction =
  | { type: "LOAD_SUCCEEDED"; call: CommunityCall }
  | { type: "LOAD_FAILED"; message: string; code?: string }
  | { type: "CALL_REFRESHED"; call: CommunityCall }
  | { type: "UNSUPPORTED"; message: string }
  | { type: "MICROPHONE_READY"; label: string }
  | { type: "MICROPHONE_FAILED"; message: string; code: string }
  | { type: "JOIN_REQUESTED" }
  | { type: "JOIN_SUCCEEDED" }
  | { type: "JOIN_FAILED"; message: string; code?: string }
  | { type: "MUTE_CHANGED"; muted: boolean }
  | { type: "CONTROL_FAILED"; message: string; code?: string }
  | { type: "CONNECTION_LOST" }
  | { type: "RECONNECT_ATTEMPT"; attempt: number }
  | { type: "RECONNECT_SUCCEEDED" }
  | { type: "RECONNECT_FAILED"; message: string; attempt: number }
  | { type: "LEFT" }
  | { type: "CALL_ENDED"; call?: CommunityCall }
  | { type: "RETRY" };

export const initialCommunityCallState: CommunityCallState = {
  phase: "loading",
  call: null,
  microphoneReady: false,
  microphoneLabel: null,
  muted: true,
  reconnectAttempt: 0,
  error: null,
  errorCode: null,
};

export function phaseForCall(call: CommunityCall): CallPhase {
  if (call.status === "scheduled" || call.status === "starting") return "scheduled";
  if (call.status === "live") return "preflight";
  if (
    (call.status === "ended" || call.status === "cancelled" || call.status === "expired") &&
    (call.viewer.inviteStatus === "missed" || call.viewer.inviteStatus === "unreachable")
  ) {
    return "missed";
  }
  if (call.status === "failed") return "error";
  return "ended";
}

export function communityCallReducer(
  state: CommunityCallState,
  action: CommunityCallAction,
): CommunityCallState {
  switch (action.type) {
    case "LOAD_SUCCEEDED": {
      const phase = phaseForCall(action.call);
      return {
        ...state,
        call: action.call,
        phase,
        error: phase === "error" ? "This call could not connect to the voice service." : null,
        errorCode: phase === "error" ? action.call.failureCode ?? "CALL_FAILED" : null,
      };
    }
    case "LOAD_FAILED":
      return { ...state, phase: "error", error: action.message, errorCode: action.code ?? null };
    case "CALL_REFRESHED": {
      if (state.phase === "unsupported" && action.call.status === "live") {
        return { ...state, call: action.call };
      }
      if (["live", "joining", "reconnecting"].includes(state.phase)) {
        if (action.call.status !== "live") {
          return {
            ...state,
            call: action.call,
            phase: phaseForCall(action.call),
            error: null,
          };
        }
        return { ...state, call: action.call };
      }
      return { ...state, call: action.call, phase: phaseForCall(action.call), error: null };
    }
    case "UNSUPPORTED":
      return { ...state, phase: "unsupported", error: action.message, errorCode: "UNSUPPORTED_BROWSER" };
    case "MICROPHONE_READY":
      if (state.phase !== "preflight" && state.phase !== "left") return state;
      return {
        ...state,
        microphoneReady: true,
        microphoneLabel: action.label,
        error: null,
        errorCode: null,
      };
    case "MICROPHONE_FAILED":
      return {
        ...state,
        microphoneReady: false,
        microphoneLabel: null,
        error: action.message,
        errorCode: action.code,
      };
    case "JOIN_REQUESTED":
      if (!state.call || state.call.status !== "live" || !state.microphoneReady) return state;
      return { ...state, phase: "joining", muted: true, error: null, errorCode: null };
    case "JOIN_SUCCEEDED":
      if (state.phase !== "joining" && state.phase !== "reconnecting") return state;
      return { ...state, phase: "live", muted: true, reconnectAttempt: 0, error: null, errorCode: null };
    case "JOIN_FAILED":
      return {
        ...state,
        phase: state.call?.status === "live" ? "preflight" : "error",
        error: action.message,
        errorCode: action.code ?? null,
      };
    case "MUTE_CHANGED":
      if (state.phase !== "live") return state;
      return { ...state, muted: action.muted, error: null };
    case "CONTROL_FAILED":
      return { ...state, error: action.message, errorCode: action.code ?? null };
    case "CONNECTION_LOST":
      if (state.phase !== "live" && state.phase !== "joining") return state;
      return { ...state, phase: "reconnecting", muted: true, reconnectAttempt: 0, error: null };
    case "RECONNECT_ATTEMPT":
      if (state.phase !== "reconnecting") return state;
      return { ...state, reconnectAttempt: action.attempt, error: null };
    case "RECONNECT_SUCCEEDED":
      if (state.phase !== "reconnecting") return state;
      return { ...state, phase: "live", muted: true, reconnectAttempt: 0, error: null };
    case "RECONNECT_FAILED":
      if (state.phase !== "reconnecting") return state;
      return { ...state, reconnectAttempt: action.attempt, error: action.message };
    case "LEFT":
      return { ...state, phase: "left", muted: true, reconnectAttempt: 0, error: null };
    case "CALL_ENDED": {
      const call = action.call ?? state.call;
      return {
        ...state,
        call,
        phase: call ? phaseForCall({ ...call, status: "ended" }) : "ended",
        muted: true,
        reconnectAttempt: 0,
        error: null,
      };
    }
    case "RETRY":
      if (!state.call) return { ...initialCommunityCallState };
      return {
        ...state,
        phase: phaseForCall(state.call),
        error: null,
        errorCode: null,
        reconnectAttempt: 0,
      };
    default:
      return state;
  }
}

export const MAX_RECONNECT_ATTEMPTS = 5;

export function reconnectDelayMs(attempt: number): number {
  const normalized = Math.max(1, Math.floor(attempt));
  return Math.min(12_000, 1_000 * 2 ** (normalized - 1));
}

export function shouldReconnectWebSocket(code: number): boolean {
  return ![1000, 4003, 4004].includes(code);
}
