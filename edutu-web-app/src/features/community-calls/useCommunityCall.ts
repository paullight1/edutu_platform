import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { ClerkTokenGetter } from "../../lib/clerkToken";
import { CommunityCallApiError, CommunityCallsApi } from "./api";
import {
  CommunityCallMedia,
  CommunityCallMediaAbortedError,
  detectBrowserMediaSupport,
  runMicrophonePreflight,
  type RemoteAudioTrack,
} from "./media";
import {
  CommunityCallSignaling,
  SignalingError,
  emptyResponseSchema,
  type CommunityCallServerEvent,
} from "./signaling";
import {
  MAX_RECONNECT_ATTEMPTS,
  communityCallReducer,
  initialCommunityCallState,
  reconnectDelayMs,
  shouldReconnectWebSocket,
} from "./stateMachine";
import { canEndCommunityCall, type CommunityCallParticipant, type CommunityRole } from "./types";

export interface LiveParticipant extends CommunityCallParticipant {
  peerId: string | null;
  isSelf: boolean;
}

function readableError(error: unknown): { message: string; code?: string } {
  if (error instanceof CommunityCallApiError) {
    const domainMessages: Record<string, string> = {
      CALL_FULL: "This call has reached its participant limit.",
      CALL_NOT_LIVE: "This call is no longer live.",
      MEDIA_UNAVAILABLE: "The voice service is temporarily unavailable.",
      MEMBERSHIP_REQUIRED: "You are no longer a member of this community.",
      UNAUTHENTICATED: "Your session expired. Sign in again to continue.",
    };
    return { message: domainMessages[error.code] ?? error.message, code: error.code };
  }
  return {
    message: error instanceof Error ? error.message : "The call could not be connected.",
  };
}

function isCancellation(error: unknown, signal?: AbortSignal): boolean {
  return Boolean(
    signal?.aborted ||
    error instanceof CommunityCallMediaAbortedError ||
    (error instanceof CommunityCallApiError && error.code === "REQUEST_ABORTED") ||
    (error instanceof SignalingError && error.code === "ABORTED"),
  );
}

export function useCommunityCall(
  callId: string,
  getToken: ClerkTokenGetter,
  identityKey = "anonymous",
) {
  const [state, dispatch] = useReducer(communityCallReducer, initialCommunityCallState);
  const [participants, setParticipants] = useState<LiveParticipant[]>([]);
  const [remoteTracks, setRemoteTracks] = useState<RemoteAudioTrack[]>([]);
  const [busyAction, setBusyAction] = useState<"microphone" | "join" | "mute" | "leave" | "end" | null>(null);
  const api = useMemo(() => new CommunityCallsApi(getToken), [getToken]);
  const signalingRef = useRef<CommunityCallSignaling | null>(null);
  const mediaRef = useRef<CommunityCallMedia | null>(null);
  const queuedProducersRef = useRef<Array<{ producerId: string; peerId: string }>>([]);
  const reconnectTimerRef = useRef<number | null>(null);
  const refreshControllerRef = useRef<AbortController | null>(null);
  const sessionControllerRef = useRef<AbortController | null>(null);
  const actionControllerRef = useRef<AbortController | null>(null);
  const sessionGenerationRef = useRef(0);
  const mountedRef = useRef(false);
  const identityKeyRef = useRef(identityKey);
  identityKeyRef.current = identityKey;

  const beginAction = useCallback(() => {
    actionControllerRef.current?.abort();
    const controller = new AbortController();
    actionControllerRef.current = controller;
    return controller;
  }, []);

  const finishAction = useCallback((controller: AbortController) => {
    if (actionControllerRef.current !== controller) return;
    actionControllerRef.current = null;
    if (mountedRef.current) setBusyAction(null);
  }, []);

  const syncParticipants = useCallback((callParticipants: CommunityCallParticipant[], viewerId: string) => {
    setParticipants((current) => {
      const peerByUser = new Map(
        current.filter((item) => item.peerId).map((item) => [item.userId, item.peerId]),
      );
      return callParticipants.map((participant) => ({
        ...participant,
        peerId: peerByUser.get(participant.userId) ?? null,
        isSelf: participant.userId === viewerId,
      }));
    });
  }, []);

  const refreshCall = useCallback(async (signal?: AbortSignal) => {
    const controller = signal ? null : new AbortController();
    if (controller) {
      refreshControllerRef.current?.abort();
      refreshControllerRef.current = controller;
    }
    const requestSignal = signal ?? controller?.signal;
    try {
      const call = await api.getCall(callId, requestSignal);
      if (!mountedRef.current || requestSignal?.aborted) return call;
      dispatch({ type: "CALL_REFRESHED", call });
      syncParticipants(call.participants, call.viewer.userId);
      return call;
    } finally {
      if (controller && refreshControllerRef.current === controller) {
        refreshControllerRef.current = null;
      }
    }
  }, [api, callId, syncParticipants]);

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();
    const requestIdentityKey = identityKey;
    void api.getCall(callId, controller.signal).then((call) => {
      if (!mountedRef.current || identityKeyRef.current !== requestIdentityKey) return;
      dispatch({ type: "LOAD_SUCCEEDED", call });
      syncParticipants(call.participants, call.viewer.userId);
      if (call.status === "live") {
        const support = detectBrowserMediaSupport();
        if (!support.supported) dispatch({ type: "UNSUPPORTED", message: support.reason });
      }
    }).catch((error) => {
      if (controller.signal.aborted || !mountedRef.current) return;
      const readable = readableError(error);
      dispatch({ type: "LOAD_FAILED", ...readable });
    });

    return () => {
      mountedRef.current = false;
      controller.abort();
    };
  }, [api, callId, identityKey, syncParticipants]);

  useEffect(() => {
    if (!state.call || !["scheduled", "starting", "live"].includes(state.call.status)) return;
    let inFlight: AbortController | null = null;
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      inFlight?.abort();
      inFlight = new AbortController();
      void refreshCall(inFlight.signal).catch(() => undefined);
    }, 15_000);
    return () => {
      window.clearInterval(interval);
      inFlight?.abort();
    };
  }, [refreshCall, state.call]);

  const removeRemoteTrack = useCallback((producerId: string) => {
    setRemoteTracks((tracks) => tracks.filter((track) => track.producerId !== producerId));
  }, []);

  const upsertRemoteTrack = useCallback((track: RemoteAudioTrack) => {
    setRemoteTracks((tracks) => [
      ...tracks.filter((item) => item.producerId !== track.producerId),
      track,
    ]);
  }, []);

  const handleServerEvent = useCallback((event: CommunityCallServerEvent) => {
    switch (event.event) {
      case "peerJoined": {
        setParticipants((current) => {
          const existing = current.find((participant) => participant.userId === event.data.userId);
          if (existing) {
            return current.map((participant) =>
              participant.userId === event.data.userId
                ? { ...participant, peerId: event.data.peerId, inviteStatus: "joined" }
                : participant,
            );
          }
          return [...current, {
            userId: event.data.userId,
            displayName: "Community member",
            role: event.data.role,
            inviteStatus: "joined",
            isMuted: true,
            isSpeaking: false,
            joinedAt: new Date().toISOString(),
            peerId: event.data.peerId,
            isSelf: false,
          }];
        });
        return;
      }
      case "peerLeft":
        setParticipants((current) => current.map((participant) =>
          participant.peerId === event.data.peerId
            ? { ...participant, peerId: null, isSpeaking: false }
            : participant,
        ));
        return;
      case "newProducer":
        if (mediaRef.current) void mediaRef.current.consume(event.data.producerId).catch(() => undefined);
        else queuedProducersRef.current.push(event.data);
        return;
      case "producerClosed":
        mediaRef.current?.removeProducer(event.data.producerId);
        removeRemoteTrack(event.data.producerId);
        return;
      case "participantMuted":
        setParticipants((current) => current.map((participant) =>
          participant.peerId === event.data.peerId
            ? { ...participant, isMuted: event.data.muted }
            : participant,
        ));
        return;
      case "activeSpeakers": {
        const activePeers = new Set(event.data.speakers.map((speaker) => speaker.peerId));
        setParticipants((current) => current.map((participant) => ({
          ...participant,
          isSpeaking: participant.peerId ? activePeers.has(participant.peerId) : false,
        })));
        return;
      }
      case "callEnded":
        sessionControllerRef.current?.abort();
        sessionControllerRef.current = null;
        mediaRef.current?.close();
        signalingRef.current?.close(1000, "call ended");
        dispatch({ type: "CALL_ENDED" });
        return;
      case "membershipRevoked":
        sessionControllerRef.current?.abort();
        sessionControllerRef.current = null;
        mediaRef.current?.close();
        signalingRef.current?.close(4003, "membership revoked");
        dispatch({
          type: "JOIN_FAILED",
          code: "MEMBERSHIP_REQUIRED",
          message: "You are no longer a member of this community.",
        });
        return;
      case "reconnectRequired":
        dispatch({ type: "CONNECTION_LOST" });
        return;
    }
  }, [removeRemoteTrack]);

  const closeSession = useCallback((resetUi = true) => {
    sessionGenerationRef.current += 1;
    sessionControllerRef.current?.abort();
    sessionControllerRef.current = null;
    mediaRef.current?.close();
    mediaRef.current = null;
    signalingRef.current?.close();
    signalingRef.current = null;
    queuedProducersRef.current = [];
    if (!resetUi) return;
    setParticipants((current) => current
      .filter((participant) => !participant.userId.startsWith("peer:"))
      .map((participant) => ({ ...participant, peerId: null, isSpeaking: false })),
    );
    setRemoteTracks([]);
  }, []);

  const connectSession = useCallback(async (reconnecting = false) => {
    const generation = ++sessionGenerationRef.current;
    sessionControllerRef.current?.abort();
    const controller = new AbortController();
    sessionControllerRef.current = controller;
    const { signal } = controller;
    const assignment = await api.createJoinSession(callId, signal);
    if (!mountedRef.current || signal.aborted || generation !== sessionGenerationRef.current) return;

    const signaling = new CommunityCallSignaling(assignment.signalingUrl);
    signalingRef.current = signaling;
    signaling.onEvent(handleServerEvent);
    signaling.onUnexpectedClose((event) => {
      if (
        !mountedRef.current ||
        signal.aborted ||
        generation !== sessionGenerationRef.current ||
        signalingRef.current !== signaling ||
        !shouldReconnectWebSocket(event.code)
      ) return;
      mediaRef.current?.close();
      mediaRef.current = null;
      signalingRef.current = null;
      dispatch({ type: "CONNECTION_LOST" });
    });

    const authenticated = await signaling.connect(assignment.token, signal);
    if (!mountedRef.current || signal.aborted || generation !== sessionGenerationRef.current) {
      signaling.close();
      return;
    }
    setParticipants((current) => current.map((participant) =>
      participant.isSelf ? { ...participant, peerId: authenticated.peerId } : participant,
    ));
    queuedProducersRef.current.push(...authenticated.existingProducers);
    setParticipants((current) => {
      const knownPeers = new Set(current.map((participant) => participant.peerId).filter(Boolean));
      const additions: LiveParticipant[] = authenticated.existingProducers
        .filter(({ peerId }) => !knownPeers.has(peerId))
        .map(({ peerId }) => ({
          userId: `peer:${peerId}`,
          displayName: "Community member",
          role: "member",
          inviteStatus: "joined",
          isMuted: false,
          isSpeaking: false,
          joinedAt: null,
          peerId,
          isSelf: false,
        }));
      return additions.length ? [...current, ...additions] : current;
    });

    const media = new CommunityCallMedia(signaling, {
      onRemoteTrack: upsertRemoteTrack,
      onRemoteTrackRemoved: removeRemoteTrack,
      onConnectionIssue: () => {
        if (
          mountedRef.current &&
          !signal.aborted &&
          generation === sessionGenerationRef.current
        ) dispatch({ type: "CONNECTION_LOST" });
      },
    });
    mediaRef.current = media;
    const queued = queuedProducersRef.current;
    queuedProducersRef.current = [];
    queued.forEach(({ producerId }) => void media.consume(producerId));
    await media.start(signal);
    if (!mountedRef.current || signal.aborted || generation !== sessionGenerationRef.current) {
      media.close();
      signaling.close();
      return;
    }

    dispatch({ type: reconnecting ? "RECONNECT_SUCCEEDED" : "JOIN_SUCCEEDED" });
  }, [api, callId, handleServerEvent, removeRemoteTrack, upsertRemoteTrack]);

  const reconnect = useCallback(async (attempt: number) => {
    if (attempt > MAX_RECONNECT_ATTEMPTS || !mountedRef.current) {
      dispatch({
        type: "JOIN_FAILED",
        code: "RECONNECT_FAILED",
        message: "We could not restore the call. Check your connection and join again.",
      });
      return;
    }
    dispatch({ type: "RECONNECT_ATTEMPT", attempt });
    closeSession();
    try {
      await connectSession(true);
    } catch (error) {
      if (!mountedRef.current || isCancellation(error)) return;
      closeSession();
      const readable = readableError(error);
      dispatch({ type: "RECONNECT_FAILED", message: readable.message, attempt });
      reconnectTimerRef.current = window.setTimeout(
        () => void reconnect(attempt + 1),
        reconnectDelayMs(attempt),
      );
    }
  }, [closeSession, connectSession]);

  useEffect(() => {
    if (state.phase !== "reconnecting" || reconnectTimerRef.current !== null) return;
    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null;
      void reconnect(Math.max(1, state.reconnectAttempt + 1));
    }, reconnectDelayMs(Math.max(1, state.reconnectAttempt + 1)));
    return () => {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [reconnect, state.phase, state.reconnectAttempt]);

  useEffect(() => () => {
    mountedRef.current = false;
    refreshControllerRef.current?.abort();
    actionControllerRef.current?.abort();
    if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
    const signaling = signalingRef.current;
    if (signaling) void signaling.request("leave", {}, emptyResponseSchema).catch(() => undefined);
    closeSession(false);
  }, [api, callId, closeSession, identityKey]);

  const checkMicrophone = useCallback(async () => {
    const controller = beginAction();
    setBusyAction("microphone");
    try {
      const result = await runMicrophonePreflight(controller.signal);
      if (!mountedRef.current || controller.signal.aborted) return;
      if (result.ok) dispatch({ type: "MICROPHONE_READY", label: result.label });
      else dispatch({ type: "MICROPHONE_FAILED", code: result.code, message: result.message });
    } catch (error) {
      if (!isCancellation(error, controller.signal) && mountedRef.current) {
        const readable = readableError(error);
        dispatch({ type: "MICROPHONE_FAILED", code: readable.code ?? "MEDIA_UNAVAILABLE", message: readable.message });
      }
    } finally {
      finishAction(controller);
    }
  }, [beginAction, finishAction]);

  const join = useCallback(async () => {
    const controller = beginAction();
    dispatch({ type: "JOIN_REQUESTED" });
    setBusyAction("join");
    try {
      await connectSession(false);
    } catch (error) {
      closeSession();
      if (!isCancellation(error, controller.signal) && mountedRef.current) {
        const readable = readableError(error);
        dispatch({ type: "JOIN_FAILED", ...readable });
      }
    } finally {
      finishAction(controller);
    }
  }, [beginAction, closeSession, connectSession, finishAction]);

  const toggleMute = useCallback(async () => {
    const controller = beginAction();
    const nextMuted = !state.muted;
    setBusyAction("mute");
    try {
      await mediaRef.current?.setMuted(nextMuted, controller.signal);
      if (!mountedRef.current || controller.signal.aborted) return;
      dispatch({ type: "MUTE_CHANGED", muted: nextMuted });
    } catch (error) {
      if (!isCancellation(error, controller.signal) && mountedRef.current) {
        const readable = readableError(error);
        dispatch({ type: "CONNECTION_LOST" });
        dispatch({ type: "CONTROL_FAILED", ...readable });
      }
    } finally {
      finishAction(controller);
    }
  }, [beginAction, finishAction, state.muted]);

  const leave = useCallback(async () => {
    const controller = beginAction();
    setBusyAction("leave");
    const signaling = signalingRef.current;
    const signalLeave = signaling
      ? signaling.request("leave", {}, emptyResponseSchema, controller.signal).catch(() => undefined)
      : Promise.resolve();
    closeSession();
    await Promise.allSettled([signalLeave, api.leave(callId, controller.signal)]);
    if (mountedRef.current && !controller.signal.aborted) dispatch({ type: "LEFT" });
    finishAction(controller);
  }, [api, beginAction, callId, closeSession, finishAction]);

  const endForEveryone = useCallback(async () => {
    const role: CommunityRole | undefined = state.call?.viewer.role;
    if (!role || !canEndCommunityCall(role)) return false;
    const controller = beginAction();
    setBusyAction("end");
    try {
      const call = await api.end(callId, controller.signal);
      if (!mountedRef.current || controller.signal.aborted) return;
      closeSession();
      dispatch({ type: "CALL_ENDED", call: call ?? undefined });
      return true;
    } catch (error) {
      if (!isCancellation(error, controller.signal) && mountedRef.current) {
        const readable = readableError(error);
        dispatch({ type: "CONTROL_FAILED", ...readable });
      }
      return false;
    } finally {
      finishAction(controller);
    }
  }, [api, beginAction, callId, closeSession, finishAction, state.call?.viewer.role]);

  return {
    state,
    participants,
    remoteTracks,
    busyAction,
    checkMicrophone,
    join,
    toggleMute,
    leave,
    endForEveryone,
    refresh: () => refreshCall(),
  };
}
