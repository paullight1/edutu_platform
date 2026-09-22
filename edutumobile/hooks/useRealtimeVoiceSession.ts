import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { haptics } from '../lib/haptics';
import { setVoiceModeThread } from '../lib/voiceModeStore';
import {
  RealtimeVoiceSession,
  type RealtimeVoiceStatus,
} from '../lib/realtimeVoiceSession';
import {
  clearVoiceSessionCheckpoint,
  loadVoiceSessionCheckpoint,
  saveVoiceSessionCheckpoint,
} from '../lib/voiceSessionCheckpoint';
import type {
  VoiceSessionController,
  VoiceSessionError,
  VoiceSessionStatus,
} from './useVoiceSession';

interface UseRealtimeVoiceSessionOptions {
  userId: string | null;
  getAuthToken: () => Promise<string | null>;
  voice: string;
  locale: string;
  onUnavailable?: (error: Error) => void;
}

function uiStatus(status: RealtimeVoiceStatus): VoiceSessionStatus {
  switch (status) {
    case 'listening':
      return 'listening';
    case 'thinking':
      return 'thinking';
    case 'speaking':
      return 'speaking';
    case 'error':
      return 'error';
    default:
      return 'idle';
  }
}

export function useRealtimeVoiceSession({
  userId,
  getAuthToken,
  voice,
  locale,
  onUnavailable,
}: UseRealtimeVoiceSessionOptions): VoiceSessionController {
  const [status, setStatus] = useState<VoiceSessionStatus>('idle');
  const [errorCode, setErrorCode] = useState<VoiceSessionError>(null);
  const [muted, setMuted] = useState(false);
  const [userTranscript, setUserTranscript] = useState<string | null>(null);
  const [assistantReply, setAssistantReply] = useState<string | null>(null);
  const [spokenRatio, setSpokenRatio] = useState(0);
  const [turnCount, setTurnCount] = useState(0);
  const [paused, setPaused] = useState(false);

  const sessionRef = useRef<RealtimeVoiceSession | null>(null);
  const mountedRef = useRef(true);
  const beganRef = useRef(false);
  const pausedRef = useRef(false);
  const mutedRef = useRef(false);
  const statusRef = useRef<VoiceSessionStatus>('idle');
  const userTranscriptRef = useRef<string | null>(null);
  const assistantReplyRef = useRef<string | null>(null);
  const pendingTranscriptRef = useRef(false);
  const threadIdRef = useRef<string | null>(null);
  const generationRef = useRef(0);
  const startTransportRef = useRef<() => Promise<void>>(async () => undefined);
  const accountUserIdRef = useRef(userId);
  const transportConfigRef = useRef(`${voice}:${locale}`);

  const updateStatus = useCallback((next: VoiceSessionStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const checkpoint = useCallback(async () => {
    if (!userId) return;
    await saveVoiceSessionCheckpoint(userId, {
      threadId: threadIdRef.current,
      userTranscript: userTranscriptRef.current,
      assistantReply: assistantReplyRef.current,
      pendingUserTranscript: pendingTranscriptRef.current,
    }).catch(() => undefined);
  }, [userId]);

  const closeTransport = useCallback(() => {
    generationRef.current += 1;
    sessionRef.current?.close();
    sessionRef.current = null;
  }, []);

  const startTransport = useCallback(async () => {
    if (!mountedRef.current || !beganRef.current || !userId) return;
    closeTransport();
    const generation = generationRef.current;
    setErrorCode(null);
    updateStatus('idle');

    const session = new RealtimeVoiceSession({
      userId,
      getAuthToken,
      threadId: threadIdRef.current,
      voice,
      locale,
      handlers: {
        onReady: () => {
          if (mountedRef.current && generationRef.current === generation) {
            updateStatus(mutedRef.current ? 'idle' : 'listening');
          }
        },
        onStatus: (next) => {
          if (mountedRef.current && generationRef.current === generation) {
            updateStatus(uiStatus(next));
          }
        },
        onUserTranscript: (transcript, final) => {
          if (!mountedRef.current || generationRef.current !== generation) return;
          userTranscriptRef.current = transcript;
          pendingTranscriptRef.current = !final;
          setUserTranscript(transcript);
        },
        onAssistantTranscript: (transcript, final) => {
          if (!mountedRef.current || generationRef.current !== generation) return;
          assistantReplyRef.current = transcript;
          setAssistantReply(transcript || null);
          // Realtime transcript deltas arrive in playback order, so everything
          // delivered so far has effectively been spoken.
          setSpokenRatio(transcript ? 1 : final ? 1 : 0);
        },
        onThread: (threadId) => {
          if (!mountedRef.current || generationRef.current !== generation) return;
          threadIdRef.current = threadId;
          pendingTranscriptRef.current = false;
          setVoiceModeThread(threadId);
          setTurnCount((count) => count + 1);
          void checkpoint();
        },
        onExpiring: () => {
          if (
            mountedRef.current &&
            beganRef.current &&
            !pausedRef.current &&
            generationRef.current === generation
          ) {
            void checkpoint().then(() => startTransportRef.current());
          }
        },
        onReconnectNeeded: () => {
          if (
            !mountedRef.current ||
            !beganRef.current ||
            pausedRef.current ||
            generationRef.current !== generation
          ) return;
          void checkpoint().then(() => {
            if (
              mountedRef.current &&
              beganRef.current &&
              !pausedRef.current &&
              generationRef.current === generation
            ) {
              void startTransportRef.current();
            }
          });
        },
        onError: () => {
          if (!mountedRef.current || generationRef.current !== generation) return;
          setErrorCode('network');
          updateStatus('error');
        },
      },
    });
    sessionRef.current = session;
    session.setMuted(mutedRef.current);
    try {
      await session.start();
    } catch (error) {
      if (!mountedRef.current || generationRef.current !== generation) return;
      sessionRef.current = null;
      const failure = error instanceof Error ? error : new Error('Live voice unavailable');
      setErrorCode('network');
      updateStatus('error');
      onUnavailable?.(failure);
    }
  }, [checkpoint, closeTransport, getAuthToken, locale, onUnavailable, updateStatus, userId, voice]);

  useEffect(() => {
    startTransportRef.current = startTransport;
  }, [startTransport]);

  const begin = useCallback(() => {
    if (beganRef.current || !userId) return;
    beganRef.current = true;
    void loadVoiceSessionCheckpoint(userId)
      .then((saved) => {
        if (!mountedRef.current || !beganRef.current) return;
        if (saved) {
          threadIdRef.current = saved.threadId;
          userTranscriptRef.current = saved.userTranscript;
          assistantReplyRef.current = saved.assistantReply;
          pendingTranscriptRef.current = saved.pendingUserTranscript;
          setUserTranscript(saved.userTranscript);
          setAssistantReply(saved.assistantReply);
          if (saved.threadId) setVoiceModeThread(saved.threadId);
        }
        return startTransport();
      })
      .catch((error) => {
        const failure = error instanceof Error ? error : new Error('Live voice unavailable');
        setErrorCode('network');
        updateStatus('error');
        onUnavailable?.(failure);
      });
  }, [onUnavailable, startTransport, updateStatus, userId]);

  const end = useCallback(() => {
    beganRef.current = false;
    pausedRef.current = false;
    setPaused(false);
    closeTransport();
    if (userId) void clearVoiceSessionCheckpoint(userId).catch(() => undefined);
  }, [closeTransport, userId]);

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    sessionRef.current?.setMuted(next);
    updateStatus(next ? 'idle' : 'listening');
    haptics.selection();
  }, [updateStatus]);

  const bargeIn = useCallback(() => {
    sessionRef.current?.interrupt();
    setSpokenRatio(1);
    updateStatus(mutedRef.current ? 'idle' : 'listening');
  }, [updateStatus]);

  const retry = useCallback(() => {
    setErrorCode(null);
    void startTransport();
  }, [startTransport]);

  const onOrbPress = useCallback(() => {
    if (statusRef.current === 'speaking') {
      bargeIn();
    } else if (statusRef.current === 'error' || !sessionRef.current) {
      retry();
    }
  }, [bargeIn, retry]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      closeTransport();
    };
  }, [closeTransport]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'background' && beganRef.current) {
        pausedRef.current = true;
        setPaused(true);
        void checkpoint();
        closeTransport();
        updateStatus('idle');
        return;
      }
      if (next === 'active' && beganRef.current && pausedRef.current) {
        pausedRef.current = false;
        setPaused(false);
        void startTransport();
      }
    });
    return () => subscription?.remove?.();
  }, [checkpoint, closeTransport, startTransport, updateStatus]);

  useEffect(() => {
    if (accountUserIdRef.current === userId) return;
    accountUserIdRef.current = userId;
    closeTransport();
    threadIdRef.current = null;
    userTranscriptRef.current = null;
    assistantReplyRef.current = null;
    pendingTranscriptRef.current = false;
    setUserTranscript(null);
    setAssistantReply(null);
    setTurnCount(0);
    if (beganRef.current && userId) void startTransport();
  }, [closeTransport, startTransport, userId]);

  useEffect(() => {
    const nextConfig = `${voice}:${locale}`;
    if (transportConfigRef.current === nextConfig) return;
    transportConfigRef.current = nextConfig;
    if (beganRef.current && !pausedRef.current) {
      void checkpoint().then(() => startTransport());
    }
  }, [checkpoint, locale, startTransport, voice]);

  return {
    status,
    errorCode,
    muted,
    level: 0,
    userTranscript,
    assistantReply,
    spokenRatio,
    turnCount,
    paused,
    begin,
    end,
    onOrbPress,
    bargeIn,
    toggleMute,
    retry,
  };
}
