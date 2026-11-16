import { useCallback, useEffect, useRef, useState } from 'react';
import { useRealtimeVoiceSession } from './useRealtimeVoiceSession';
import {
  useVoiceSession,
  type VoiceSessionController,
  type UseVoiceSessionOptions,
} from './useVoiceSession';

interface UseVoiceModeSessionOptions extends UseVoiceSessionOptions {
  realtimeEnabled: boolean;
  voice: string;
  locale: string;
}

export function useVoiceModeSession(
  options: UseVoiceModeSessionOptions,
): VoiceSessionController {
  const identity = `${options.userId ?? ''}:${options.mode}:${options.voice}:${options.locale}`;
  const [unavailableIdentity, setUnavailableIdentity] = useState<string | null>(null);
  const beganRef = useRef(false);
  const tapSessionRef = useRef<VoiceSessionController | null>(null);
  const realtimeSessionRef = useRef<VoiceSessionController | null>(null);

  const tapSession = useVoiceSession(options);
  const handleRealtimeUnavailable = useCallback(() => {
    setUnavailableIdentity(identity);
    realtimeSessionRef.current?.end();
    if (beganRef.current) tapSessionRef.current?.begin();
  }, [identity]);
  const realtimeSession = useRealtimeVoiceSession({
    userId: options.userId,
    getAuthToken: options.getAuthToken,
    voice: options.voice,
    locale: options.locale,
    onUnavailable: handleRealtimeUnavailable,
  });

  useEffect(() => {
    tapSessionRef.current = tapSession;
    realtimeSessionRef.current = realtimeSession;
  }, [realtimeSession, tapSession]);

  const activeRealtime =
    options.mode === 'live' &&
    options.realtimeEnabled &&
    unavailableIdentity !== identity;
  const active = activeRealtime ? realtimeSession : tapSession;

  const begin = useCallback(() => {
    beganRef.current = true;
    if (activeRealtime) realtimeSession.begin();
    else tapSession.begin();
  }, [activeRealtime, realtimeSession, tapSession]);

  const end = useCallback(() => {
    beganRef.current = false;
    // Both hooks stay mounted so switching engines after a provider failure
    // never leaves the previous microphone owner alive.
    realtimeSession.end();
    tapSession.end();
  }, [realtimeSession, tapSession]);

  return {
    ...active,
    begin,
    end,
  };
}
