import { useCallback, useEffect, useReducer, useRef } from 'react';
import { AppState } from 'react-native';
import type { GetAuthToken } from '@edutu/core/src/services/productApi';
import { CommunityCallApiError, declineCommunityCall, endCommunityCall, fetchCommunityCallJoinToken, getCommunityCall, leaveCommunityCall, type CommunityCall } from './api';
import { CommunityCallMediaSession } from './media';
import { CommunityCallSignaling, type SignalingEvent } from './signaling';
import { endNativeCommunityCall, markNativeCommunityCallConnected, subscribeNativeCallEvents } from './nativeCall';

export type CallScreenPhase = 'loading' | 'preflight' | 'connecting' | 'live' | 'reconnecting' | 'summary' | 'denied' | 'full' | 'unsupported' | 'failed';
export interface CommunityCallState { phase: CallScreenPhase; call: CommunityCall | null; muted: boolean; participants: string[]; activeSpeakers: string[]; error: string | null }
export type CommunityCallAction =
  | { type: 'LOADED'; call: CommunityCall } | { type: 'SYNCED'; call: CommunityCall } | { type: 'CONNECTING' } | { type: 'LIVE' }
  | { type: 'MUTED'; muted: boolean } | { type: 'PARTICIPANTS'; participants: string[] }
  | { type: 'PEER_JOINED'; peerId: string } | { type: 'PEER_LEFT'; peerId: string }
  | { type: 'SPEAKERS'; speakers: string[] } | { type: 'RECONNECTING' }
  | { type: 'SUMMARY'; call?: CommunityCall } | { type: 'ERROR'; phase: 'denied' | 'full' | 'unsupported' | 'failed'; message: string };

export const initialCommunityCallState: CommunityCallState = { phase: 'loading', call: null, muted: true, participants: [], activeSpeakers: [], error: null };
export function communityCallReducer(state: CommunityCallState, action: CommunityCallAction): CommunityCallState {
  switch (action.type) {
    case 'LOADED': return { ...state, call: action.call, phase: action.call.status === 'live' ? 'preflight' : action.call.status === 'starting' ? 'preflight' : 'summary', error: null };
    case 'SYNCED': {
      const stillLive = action.call.status === 'live' || action.call.status === 'starting';
      const activePhase = state.phase === 'connecting' || state.phase === 'live' || state.phase === 'reconnecting';
      return {
        ...state,
        call: action.call,
        phase: stillLive ? (activePhase ? state.phase : 'preflight') : 'summary',
        muted: stillLive ? state.muted : true,
        participants: stillLive ? state.participants : [],
        activeSpeakers: stillLive ? state.activeSpeakers : [],
        error: null,
      };
    }
    case 'CONNECTING': return { ...state, phase: 'connecting', muted: true, error: null };
    case 'LIVE': return { ...state, phase: 'live', muted: true, error: null };
    case 'MUTED': return { ...state, muted: action.muted };
    case 'PARTICIPANTS': return { ...state, participants: action.participants };
    case 'PEER_JOINED': return state.participants.includes(action.peerId) ? state : { ...state, participants: [...state.participants, action.peerId] };
    case 'PEER_LEFT': return { ...state, participants: state.participants.filter((id) => id !== action.peerId), activeSpeakers: state.activeSpeakers.filter((id) => id !== action.peerId) };
    case 'SPEAKERS': return { ...state, activeSpeakers: action.speakers };
    case 'RECONNECTING': return { ...state, phase: 'reconnecting' };
    case 'SUMMARY': return { ...state, phase: 'summary', call: action.call ?? state.call, muted: true, participants: [], activeSpeakers: [] };
    case 'ERROR': return { ...state, phase: action.phase, error: action.message };
  }
}

function errorPhase(error: unknown): Extract<CallScreenPhase, 'denied' | 'full' | 'unsupported' | 'failed'> {
  if (error instanceof CommunityCallApiError && error.code === 'CALL_FULL') return 'full';
  if (error instanceof CommunityCallApiError && ['CALL_FORBIDDEN','CALL_MEMBERSHIP_REQUIRED','CALL_NOT_INVITED'].includes(error.code)) return 'denied';
  if (error instanceof Error && (/NotAllowedError/i.test(error.name) || /microphone.*(denied|permission)|permission.*microphone/i.test(error.message))) return 'denied';
  if (error instanceof Error && /Expo Go|unavailable in this build/i.test(error.message)) return 'unsupported';
  return 'failed';
}

export function useCommunityCall(callId: string, getToken: GetAuthToken) {
  const [state, dispatch] = useReducer(communityCallReducer, initialCommunityCallState);
  const signalingRef = useRef<CommunityCallSignaling | null>(null); const mediaRef = useRef<CommunityCallMediaSession | null>(null);
  const joiningRef = useRef(false);
  const mountedRef = useRef(false);
  const sessionGenerationRef = useRef(0);
  const cleanup = useCallback(async () => {
    sessionGenerationRef.current += 1;
    const media = mediaRef.current; const signaling = signalingRef.current;
    mediaRef.current = null; signalingRef.current = null;
    signaling?.close();
    await media?.close().catch(() => undefined);
  }, []);
  const refresh = useCallback(async () => { try { const call = await getCommunityCall(callId, getToken); if (mountedRef.current) dispatch({ type: 'LOADED', call }); } catch (error) { if (mountedRef.current) dispatch({ type: 'ERROR', phase: errorPhase(error), message: error instanceof Error ? error.message : 'The call could not be loaded.' }); } }, [callId, getToken]);
  const synchronize = useCallback(async () => {
    try {
      const call = await getCommunityCall(callId, getToken);
      if (!mountedRef.current) return;
      if (call.status !== 'live' && call.status !== 'starting') await cleanup();
      if (mountedRef.current) dispatch({ type: 'SYNCED', call });
    } catch (error) {
      if (mountedRef.current) dispatch({ type: 'ERROR', phase: errorPhase(error), message: error instanceof Error ? error.message : 'The call could not be refreshed.' });
    }
  }, [callId, cleanup, getToken]);
  useEffect(() => { mountedRef.current = true; void refresh(); return () => { mountedRef.current = false; void cleanup(); }; }, [cleanup, refresh]);

  const handleEvent = useCallback((event: SignalingEvent) => {
    if (event.type === 'callEnded' || event.type === 'membershipRevoked') { void cleanup().then(synchronize); return; }
    if (event.type === 'reconnectRequired') dispatch({ type: 'RECONNECTING' });
    if (event.type === 'activeSpeakers' && Array.isArray(event.data.speakers)) dispatch({ type: 'SPEAKERS', speakers: event.data.speakers.map((v: any) => v?.peerId).filter((v): v is string => typeof v === 'string') });
    if (event.type === 'peerJoined' && typeof event.data.peerId === 'string') dispatch({ type: 'PEER_JOINED', peerId: event.data.peerId });
    if (event.type === 'peerLeft' && typeof event.data.peerId === 'string') dispatch({ type: 'PEER_LEFT', peerId: event.data.peerId });
  }, [cleanup, synchronize]);

  const join = useCallback(async () => {
    if (joiningRef.current) return; joiningRef.current = true; dispatch({ type: 'CONNECTING' });
    let signaling: CommunityCallSignaling | null = null;
    let media: CommunityCallMediaSession | null = null;
    try {
      await cleanup();
      const generation = sessionGenerationRef.current;
      const isCurrent = () => mountedRef.current && sessionGenerationRef.current === generation;
      const credentials = await fetchCommunityCallJoinToken(callId, getToken);
      if (!isCurrent()) return;
      // credentials/token deliberately remain function-local and are discarded after authentication.
      signaling = new CommunityCallSignaling(); signalingRef.current = signaling;
      const authenticated = await signaling.connect(credentials.signalingUrl, credentials.token);
      if (!isCurrent()) { signaling.close(); return; }
      signaling.onEvent(handleEvent);
      media = new CommunityCallMediaSession(signaling, () => { if (isCurrent()) dispatch({ type: 'RECONNECTING' }); });
      mediaRef.current = media;
      await media.start(authenticated.existingProducers);
      if (!isCurrent()) { await media.close().catch(() => undefined); signaling.close(); return; }
      await markNativeCommunityCallConnected(callId);
      if (isCurrent()) dispatch({ type: 'LIVE' });
    } catch (error) {
      const ownsSession = signaling !== null && signalingRef.current === signaling;
      if (ownsSession) await cleanup();
      else { signaling?.close(); await media?.close().catch(() => undefined); }
      if (mountedRef.current && ownsSession) dispatch({ type: 'ERROR', phase: errorPhase(error), message: error instanceof Error ? error.message : 'The call could not connect.' });
    }
    finally { joiningRef.current = false; }
  }, [callId, cleanup, getToken, handleEvent]);
  const setMuted = useCallback(async (muted: boolean) => { try { await mediaRef.current?.setMuted(muted); if (mountedRef.current) dispatch({ type: 'MUTED', muted }); } catch (error) { if (mountedRef.current) dispatch({ type: 'ERROR', phase: 'failed', message: error instanceof Error ? error.message : 'Microphone state could not change.' }); } }, []);
  const leave = useCallback(async () => { await cleanup(); await leaveCommunityCall(callId, getToken).catch(() => undefined); await endNativeCommunityCall(callId); if (mountedRef.current) dispatch({ type: 'SUMMARY' }); }, [callId, cleanup, getToken]);
  const endForEveryone = useCallback(async () => { await endCommunityCall(callId, getToken); await leave(); await refresh(); }, [callId, getToken, leave, refresh]);
  useEffect(() => subscribeNativeCallEvents((event) => { if (event.callId !== callId) return; if (event.type === 'answer') void join(); else if (event.type === 'decline') void declineCommunityCall(callId, getToken); else void leave(); }), [callId, getToken, join, leave]);
  useEffect(() => { const subscription = AppState.addEventListener('change', (next) => { if (next === 'active' && (state.phase === 'reconnecting' || state.phase === 'live')) void synchronize(); }); return () => subscription.remove(); }, [state.phase, synchronize]);
  return { state, refresh, join, reconnect: join, setMuted, leave, endForEveryone };
}
