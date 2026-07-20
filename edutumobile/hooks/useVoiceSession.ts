import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { haptics } from '../lib/haptics';
import { sendChatMessage, ChatRateLimitError } from '@edutu/core/src/services/chat';
import { supabase } from '../lib/supabase';
import { getConfig } from '../lib/config';
import i18n from '../lib/i18n';
import { setVoiceModeThread } from '../lib/voiceModeStore';
import { getVoiceSettings } from '../lib/voiceSettingsStore';
import { speak as edutuSpeak, stopSpeaking } from '../lib/edutuSpeech';

/**
 * Conversation engine behind the voice mode overlay.
 *
 * One turn: listen (mic + metering VAD) → transcribe (Whisper via chat-proxy)
 * → think (sendChatMessage) → speak (expo-speech). In 'live' mode the loop
 * re-arms the mic when the AI finishes speaking; in 'voice' mode it returns
 * to idle and waits for the next orb tap.
 */
export type VoiceSessionStatus =
  | 'idle'
  | 'listening'
  | 'transcribing'
  | 'thinking'
  | 'speaking'
  | 'error';

export type VoiceSessionError = 'permission' | 'limit' | 'network' | null;

// Metering is dBFS (negative). Voice on phone mics typically peaks well
// above -35; the floor maps the animation range, not the VAD gate.
const SPEECH_DB_GATE = -35;
const LEVEL_DB_FLOOR = -52;
const LEVEL_DB_CEIL = -10;
const TRAILING_SILENCE_MS = 1600;
const MAX_TURN_MS = 30000;

const RECORDING_OPTIONS = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true };

export interface UseVoiceSessionOptions {
  mode: 'voice' | 'live';
  userId: string | null;
  getAuthToken: () => Promise<string | null>;
  /** Spoken once when the session opens, before the mic first arms. */
  greeting?: string;
}

export function useVoiceSession({ mode, userId, getAuthToken, greeting }: UseVoiceSessionOptions) {
  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, 120);

  const [status, setStatus] = useState<VoiceSessionStatus>('idle');
  const [errorCode, setErrorCode] = useState<VoiceSessionError>(null);
  const [muted, setMuted] = useState(false);
  const [level, setLevel] = useState(0);
  const [userTranscript, setUserTranscript] = useState<string | null>(null);
  const [assistantReply, setAssistantReply] = useState<string | null>(null);
  // 0→1 fraction of the current reply that has been spoken — drives the
  // word-by-word caption highlight so the text tracks Edutu's voice.
  const [spokenRatio, setSpokenRatio] = useState(0);
  const [turnCount, setTurnCount] = useState(0);

  const greetedRef = useRef(false);
  const activeRef = useRef(true);
  const statusRef = useRef<VoiceSessionStatus>('idle');
  const processingRef = useRef(false);
  const heardSpeechRef = useRef(false);
  const lastVoiceAtRef = useRef(0);
  const threadIdRef = useRef<string | null>(null);
  // Last observed recording length — reported with the transcription request
  // so server-side usage metering can bill real seconds, not estimates.
  const durationMsRef = useRef(0);
  const modeRef = useRef(mode);
  useEffect(() => {
    // Post-commit write — render-time ref writes are unsafe under concurrent
    // rendering. Readers are all async callbacks, which fire after commit.
    modeRef.current = mode;
  }, [mode]);
  // Ref mirror so async callbacks (TTS onDone fires long after render) see
  // the mute state at completion time, not at closure-creation time.
  const mutedRef = useRef(false);

  const updateStatus = useCallback((next: VoiceSessionStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const stopRecorderQuietly = useCallback(async () => {
    try {
      await recorder.stop();
    } catch {
      // stop() throws if the recorder never started — nothing to clean up.
    }
    try {
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    } catch {}
  }, [recorder]);

  // Full teardown on unmount: kill the mic, the loop, and any speech.
  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      stopSpeaking();
      try {
        recorder.stop()?.catch?.(() => {});
      } catch {}
      setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startListening = useCallback(async () => {
    if (!activeRef.current || processingRef.current) return;
    // Hard mute gate: while muted the mic must never arm, no matter which
    // path calls this (orb tap, turn resume, live-mode silence recycle).
    if (mutedRef.current) {
      updateStatus('idle');
      return;
    }
    try {
      const current = await AudioModule.getRecordingPermissionsAsync();
      if (!current.granted) {
        const requested = await AudioModule.requestRecordingPermissionsAsync();
        if (!requested.granted) {
          setErrorCode('permission');
          updateStatus('error');
          return;
        }
      }

      stopSpeaking();
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();

      heardSpeechRef.current = false;
      lastVoiceAtRef.current = Date.now();
      setErrorCode(null);
      updateStatus('listening');
      haptics.light();
    } catch {
      setErrorCode('network');
      updateStatus('error');
    }
  }, [recorder, updateStatus]);

  const transcribe = useCallback(async (uri: string): Promise<string | null> => {
    const response = await fetch(uri);
    const blob = await response.blob();
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = () => reject(new Error('Failed to read recording'));
      reader.readAsDataURL(blob);
    });

    const supabaseUrl = getConfig().supabaseUrl;
    const authToken = await getAuthToken();
    if (!supabaseUrl || !authToken) {
      throw new Error('Sign in to use voice mode');
    }

    const res = await fetch(`${supabaseUrl}/functions/v1/chat-proxy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({
        mode: 'transcribe',
        audio: { mimeType: 'audio/m4a', data: base64 },
        language: i18n.language?.split('-')[0] || 'en',
        durationSeconds: Math.round(durationMsRef.current / 100) / 10 || undefined,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || 'Transcription failed');
    }
    const { transcript } = await res.json();
    return typeof transcript === 'string' ? transcript : null;
  }, [getAuthToken]);

  const resumeAfterTurn = useCallback(() => {
    if (!activeRef.current) return;
    if (modeRef.current === 'live' && !mutedRef.current) {
      void startListening();
    } else {
      updateStatus('idle');
    }
  }, [startListening, updateStatus]);

  const speakReply = useCallback((reply: string) => {
    updateStatus('speaking');
    setSpokenRatio(0);
    void edutuSpeak(reply, {
      voice: getVoiceSettings().ttsVoice,
      language: i18n.language?.split('-')[0] || 'en',
      getAuthToken,
      onProgress: setSpokenRatio,
      onDone: resumeAfterTurn,
      onStopped: () => {
        // Barge-in or teardown stops speech; whoever stopped it owns the
        // next state, so don't re-arm the loop here.
      },
      onError: resumeAfterTurn,
    });
  }, [getAuthToken, resumeAfterTurn, updateStatus]);

  const stopAndProcess = useCallback(async () => {
    if (statusRef.current !== 'listening' || processingRef.current) return;
    processingRef.current = true;
    updateStatus('transcribing');
    setLevel(0);
    haptics.medium();

    try {
      await stopRecorderQuietly();
      const uri = recorder.uri;
      const transcript = uri ? await transcribe(uri) : null;
      if (!activeRef.current) return;

      const trimmed = transcript?.trim();
      if (!trimmed) {
        processingRef.current = false;
        resumeAfterTurn();
        return;
      }

      setUserTranscript(trimmed);
      setAssistantReply(null);
      updateStatus('thinking');

      if (!userId) throw new Error('Sign in to use voice mode');
      const result = await sendChatMessage(supabase, {
        threadId: threadIdRef.current,
        message: trimmed,
        userId,
        authToken: await getAuthToken(),
        // Voice channel: the AI answers in speakable prose (no bullets/emoji/UI
        // references) and leans harder on profile personalization.
        channel: 'voice',
        // A spoken crisis disclosure deserves a reply in the user's own
        // language just as much as a typed one.
        locale: i18n.language?.split('-')[0] || 'en',
      });
      if (!activeRef.current) return;

      threadIdRef.current = result.threadId;
      setVoiceModeThread(result.threadId);
      setTurnCount((count) => count + 1);

      const reply = result.assistantMessage?.content?.trim() || '';
      setAssistantReply(reply || null);
      processingRef.current = false;

      if (reply) {
        speakReply(reply);
      } else {
        resumeAfterTurn();
      }
    } catch (err) {
      processingRef.current = false;
      if (!activeRef.current) return;
      const isLimit = err instanceof ChatRateLimitError || (err as any)?.name === 'ChatRateLimitError';
      setErrorCode(isLimit ? 'limit' : 'network');
      updateStatus('error');
      haptics.error();
    }
  }, [getAuthToken, recorder, resumeAfterTurn, speakReply, stopRecorderQuietly, transcribe, updateStatus, userId]);

  // Metering → level for the audio-reactive orb + trailing-silence VAD.
  useEffect(() => {
    if (statusRef.current !== 'listening' || !recorderState.isRecording) return;

    const db = recorderState.metering;
    const now = Date.now();
    durationMsRef.current = recorderState.durationMillis || durationMsRef.current;

    if (typeof db === 'number' && Number.isFinite(db)) {
      const normalized = (db - LEVEL_DB_FLOOR) / (LEVEL_DB_CEIL - LEVEL_DB_FLOOR);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- this effect IS the delivery path for expo-audio's metering stream (recorderState updates ~per frame); level holds its last value while not listening, so it is not render-derivable. Proper fix is useSyncExternalStore over the recorder — tracked, out of scope here.
      setLevel(Math.max(0, Math.min(1, normalized)));

      if (db > SPEECH_DB_GATE) {
        heardSpeechRef.current = true;
        lastVoiceAtRef.current = now;
      } else if (heardSpeechRef.current && now - lastVoiceAtRef.current > TRAILING_SILENCE_MS) {
        void stopAndProcess();
        return;
      }
    }

    if (recorderState.durationMillis > MAX_TURN_MS) {
      if (heardSpeechRef.current) {
        void stopAndProcess();
      } else if (modeRef.current === 'live') {
        // Long stretch of ambient silence — recycle the recording so a
        // later utterance isn't buried in a huge upload.
        void stopRecorderQuietly().then(() => {
          if (activeRef.current && statusRef.current === 'listening') void startListening();
        });
      } else {
        void stopAndProcess();
      }
    }
  }, [recorderState, startListening, stopAndProcess, stopRecorderQuietly]);

  /** Primary orb interaction: tap to talk / stop / barge in over the AI. */
  const onOrbPress = useCallback(() => {
    switch (statusRef.current) {
      case 'idle':
      case 'error':
        void startListening();
        break;
      case 'listening':
        void stopAndProcess();
        break;
      case 'speaking':
        stopSpeaking();
        void startListening();
        break;
      default:
        break;
    }
  }, [startListening, stopAndProcess]);

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    if (next) {
      // Muting always kills the mic and drops any in-flight arm, whatever the
      // current status — otherwise a recording started mid-tap keeps running.
      void stopRecorderQuietly();
      processingRef.current = false;
      if (statusRef.current === 'listening') {
        updateStatus('idle');
      }
    } else if (statusRef.current === 'idle' && modeRef.current === 'live') {
      void startListening();
    }
    haptics.selection();
  }, [startListening, stopRecorderQuietly, updateStatus]);

  const begin = useCallback(() => {
    // First entry: Edutu introduces itself, its caption tracking the voice,
    // then the mic arms (live) or waits for a tap (voice).
    if (greeting && !greetedRef.current) {
      greetedRef.current = true;
      setUserTranscript(null);
      setAssistantReply(greeting);
      setSpokenRatio(0);
      updateStatus('speaking');
      void edutuSpeak(greeting, {
        voice: getVoiceSettings().ttsVoice,
        language: i18n.language?.split('-')[0] || 'en',
        // Same sentence every session — replay the cached mp3 (per voice+lang)
        // instead of paying for a fresh synthesis each time.
        cacheKey: `greeting-${i18n.language?.split('-')[0] || 'en'}`,
        getAuthToken,
        onProgress: setSpokenRatio,
        onDone: resumeAfterTurn,
        onError: resumeAfterTurn,
      });
      return;
    }
    void startListening();
  }, [greeting, getAuthToken, resumeAfterTurn, startListening, updateStatus]);

  const end = useCallback(() => {
    activeRef.current = false;
    stopSpeaking();
    void stopRecorderQuietly();
  }, [stopRecorderQuietly]);

  return {
    status,
    errorCode,
    muted,
    level,
    userTranscript,
    assistantReply,
    spokenRatio,
    turnCount,
    begin,
    end,
    onOrbPress,
    toggleMute,
    retry: begin,
  };
}
