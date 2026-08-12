import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { haptics } from '../lib/haptics';
import { ChatRateLimitError } from '@edutu/core/src/services/chat';
import { streamChatMessage } from '@edutu/core/src/services/chatStream';
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

type VoiceTurnScope = {
  generation: number;
  controller: AbortController;
};

function abortError() {
  const error = new Error('Voice turn aborted');
  error.name = 'AbortError';
  return error;
}

function readBlobAsBase64(blob: Blob, signal: AbortSignal): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    const reader = new FileReader();
    const onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    reader.onloadend = () => {
      signal.removeEventListener('abort', onAbort);
      if (signal.aborted) reject(abortError());
      else resolve((reader.result as string).split(',')[1]);
    };
    reader.onerror = () => {
      signal.removeEventListener('abort', onAbort);
      reject(new Error('Failed to read recording'));
    };
    reader.readAsDataURL(blob);
  });
}

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
  /**
   * True when the OS took the session away from us (the user backgrounded the
   * app or took a call) rather than the user stopping it. The UI says so
   * instead of pretending the mic is still live.
   */
  const [paused, setPaused] = useState(false);

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
  /**
   * The last thing the user actually said. Kept after a failed turn so
   * `retry()` can re-send those words instead of making the user repeat a
   * sentence they already spoke (the old failure mode: one dropped packet and
   * the whole utterance was gone).
   */
  const lastPromptRef = useRef<string | null>(null);
  const modeRef = useRef(mode);
  useEffect(() => {
    // Post-commit write — render-time ref writes are unsafe under concurrent
    // rendering. Readers are all async callbacks, which fire after commit.
    modeRef.current = mode;
  }, [mode]);
  // Ref mirror so async callbacks (TTS onDone fires long after render) see
  // the mute state at completion time, not at closure-creation time.
  const mutedRef = useRef(false);
  const pausedRef = useRef(false);
  const accountUserIdRef = useRef(userId);
  const turnGenerationRef = useRef(0);
  const currentTurnRef = useRef<VoiceTurnScope | null>(null);
  // expo-audio exposes one native recorder. Serialize prepare/record/stop so
  // an app-state transition cannot start a second arm while the first native
  // operation is still resolving.
  const recorderOperationRef = useRef<Promise<void>>(Promise.resolve());

  const runRecorderOperation = useCallback(async <T,>(operation: () => Promise<T> | T): Promise<T> => {
    const previous = recorderOperationRef.current.catch(() => undefined);
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    recorderOperationRef.current = previous.then(() => next);

    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }, []);

  const abortCurrentTurn = useCallback(() => {
    const current = currentTurnRef.current;
    currentTurnRef.current = null;
    current?.controller.abort();
  }, []);

  const createTurnScope = useCallback((): VoiceTurnScope => {
    abortCurrentTurn();
    const turn = {
      generation: ++turnGenerationRef.current,
      controller: new AbortController(),
    };
    currentTurnRef.current = turn;
    return turn;
  }, [abortCurrentTurn]);

  const isCurrentTurn = useCallback((turn: VoiceTurnScope) => (
    activeRef.current
    && currentTurnRef.current === turn
    && !turn.controller.signal.aborted
  ), []);

  const updateStatus = useCallback((next: VoiceSessionStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const stopRecorderQuietly = useCallback(async () => {
    await runRecorderOperation(async () => {
      try {
        await recorder.stop();
      } catch {
        // stop() throws if the recorder never started — nothing to clean up.
      }
      try {
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      } catch {}
    });
  }, [recorder, runRecorderOperation]);

  // Full teardown on unmount: kill the mic, the loop, and any speech.
  useEffect(() => {
    activeRef.current = true;
    return () => {
      abortCurrentTurn();
      activeRef.current = false;
      stopSpeaking();
      try {
        recorder.stop()?.catch?.(() => {});
      } catch {}
      setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abortCurrentTurn]);

  // A hook instance can outlive the Clerk account that created its turn.
  // Treat an identity change like a hard session boundary so captions,
  // threads and delayed callbacks can never cross accounts.
  useEffect(() => {
    if (accountUserIdRef.current === userId) return;
    accountUserIdRef.current = userId;
    abortCurrentTurn();
    processingRef.current = false;
    stopSpeaking();
    void stopRecorderQuietly();
    threadIdRef.current = null;
    lastPromptRef.current = null;
    durationMsRef.current = 0;
    greetedRef.current = false;
    mutedRef.current = false;
    pausedRef.current = false;
    setVoiceModeThread(null);
    setMuted(false);
    setPaused(false);
    setLevel(0);
    setUserTranscript(null);
    setAssistantReply(null);
    setSpokenRatio(0);
    setTurnCount(0);
    setErrorCode(null);
    updateStatus('idle');
  }, [abortCurrentTurn, stopRecorderQuietly, updateStatus, userId]);

  const startListening = useCallback(async () => {
    if (!activeRef.current || processingRef.current) return;
    // Hard mute gate: while muted the mic must never arm, no matter which
    // path calls this (orb tap, turn resume, live-mode silence recycle).
    if (mutedRef.current) {
      updateStatus('idle');
      return;
    }
    const turn = createTurnScope();
    try {
      const current = await AudioModule.getRecordingPermissionsAsync();
      if (!isCurrentTurn(turn)) return;
      if (!current.granted) {
        const requested = await AudioModule.requestRecordingPermissionsAsync();
        if (!isCurrentTurn(turn)) return;
        if (!requested.granted) {
          setErrorCode('permission');
          updateStatus('error');
          return;
        }
      }

      stopSpeaking();
      await runRecorderOperation(async () => {
        if (!isCurrentTurn(turn)) return;
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        if (!isCurrentTurn(turn)) return;
        await recorder.prepareToRecordAsync();
        if (!isCurrentTurn(turn)) return;
        recorder.record();
      });
      if (!isCurrentTurn(turn)) return;

      heardSpeechRef.current = false;
      lastVoiceAtRef.current = Date.now();
      setErrorCode(null);
      pausedRef.current = false;
      setPaused(false);
      updateStatus('listening');
      haptics.light();
    } catch {
      if (!isCurrentTurn(turn)) return;
      setErrorCode('network');
      updateStatus('error');
    }
  }, [createTurnScope, isCurrentTurn, recorder, runRecorderOperation, updateStatus]);

  const transcribe = useCallback(async (uri: string, turn: VoiceTurnScope): Promise<string | null> => {
    const { signal } = turn.controller;
    const response = await fetch(uri, { signal });
    if (!isCurrentTurn(turn)) throw abortError();
    const blob = await response.blob();
    if (!isCurrentTurn(turn)) throw abortError();
    const base64 = await readBlobAsBase64(blob, signal);

    const supabaseUrl = getConfig().supabaseUrl;
    const authToken = await getAuthToken();
    if (!isCurrentTurn(turn)) throw abortError();
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
      signal,
    });
    if (!isCurrentTurn(turn)) throw abortError();
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || 'Transcription failed');
    }
    const { transcript } = await res.json();
    if (!isCurrentTurn(turn)) throw abortError();
    return typeof transcript === 'string' ? transcript : null;
  }, [getAuthToken, isCurrentTurn]);

  const resumeAfterTurn = useCallback((turn: VoiceTurnScope) => {
    if (!isCurrentTurn(turn)) return;
    if (modeRef.current === 'live' && !mutedRef.current) {
      void startListening();
    } else {
      currentTurnRef.current = null;
      updateStatus('idle');
    }
  }, [isCurrentTurn, startListening, updateStatus]);

  const speakReply = useCallback((reply: string, turn: VoiceTurnScope) => {
    if (!isCurrentTurn(turn)) return;
    updateStatus('speaking');
    setSpokenRatio(0);
    void edutuSpeak(reply, {
      voice: getVoiceSettings().ttsVoice,
      language: i18n.language?.split('-')[0] || 'en',
      getAuthToken,
      signal: turn.controller.signal,
      onProgress: (ratio) => {
        if (isCurrentTurn(turn)) setSpokenRatio(ratio);
      },
      onDone: () => resumeAfterTurn(turn),
      onStopped: () => {
        // Barge-in or teardown stops speech; whoever stopped it owns the
        // next state, so don't re-arm the loop here.
      },
      onError: () => resumeAfterTurn(turn),
    });
  }, [getAuthToken, isCurrentTurn, resumeAfterTurn, updateStatus]);

  /**
   * The "think + speak" half of a turn, split out from the recording half so
   * a network failure can be retried against the words the user already said.
   */
  const askEdutu = useCallback(async (prompt: string, existingTurn?: VoiceTurnScope) => {
    const turn = existingTurn ?? createTurnScope();
    if (!isCurrentTurn(turn)) return;
    lastPromptRef.current = prompt;
    processingRef.current = true;
    setUserTranscript(prompt);
    setAssistantReply(null);
    setErrorCode(null);
    updateStatus('thinking');

    try {
      if (!userId) throw new Error('Sign in to use voice mode');
      const authToken = await getAuthToken();
      if (!isCurrentTurn(turn)) return;
      const result = await streamChatMessage({
        threadId: threadIdRef.current,
        message: prompt,
        userId,
        authToken,
        // Voice channel: the AI answers in speakable prose (no bullets/emoji/UI
        // references) and leans harder on profile personalization.
        channel: 'voice',
        // A spoken crisis disclosure deserves a reply in the user's own
        // language just as much as a typed one.
        locale: i18n.language?.split('-')[0] || 'en',
        signal: turn.controller.signal,
        handlers: {
          onContent: (content) => {
            if (isCurrentTurn(turn)) setAssistantReply(content || null);
          },
        },
      });
      if (!isCurrentTurn(turn)) return;

      threadIdRef.current = result.threadId;
      setVoiceModeThread(result.threadId);
      setTurnCount((count) => count + 1);

      const reply = result.assistantMessage?.content?.trim() || '';
      setAssistantReply(reply || null);
      processingRef.current = false;

      if (reply) {
        speakReply(reply, turn);
      } else {
        resumeAfterTurn(turn);
      }
    } catch (err) {
      if (!isCurrentTurn(turn)) return;
      processingRef.current = false;
      const isLimit = err instanceof ChatRateLimitError || (err as any)?.name === 'ChatRateLimitError';
      setErrorCode(isLimit ? 'limit' : 'network');
      updateStatus('error');
      haptics.error();
    }
  }, [createTurnScope, getAuthToken, isCurrentTurn, resumeAfterTurn, speakReply, updateStatus, userId]);

  /** Record → transcribe → hand the words to `askEdutu`. */
  const stopAndProcess = useCallback(async () => {
    if (statusRef.current !== 'listening' || processingRef.current) return;
    const turn = currentTurnRef.current;
    if (!turn || !isCurrentTurn(turn)) return;
    processingRef.current = true;
    updateStatus('transcribing');
    setLevel(0);
    haptics.medium();

    try {
      await stopRecorderQuietly();
      if (!isCurrentTurn(turn)) return;
      const uri = recorder.uri;
      const transcript = uri ? await transcribe(uri, turn) : null;
      if (!isCurrentTurn(turn)) return;

      const trimmed = transcript?.trim();
      if (!trimmed) {
        processingRef.current = false;
        resumeAfterTurn(turn);
        return;
      }

      await askEdutu(trimmed, turn);
    } catch (err) {
      if (!isCurrentTurn(turn)) return;
      processingRef.current = false;
      const isLimit = err instanceof ChatRateLimitError || (err as any)?.name === 'ChatRateLimitError';
      setErrorCode(isLimit ? 'limit' : 'network');
      updateStatus('error');
      haptics.error();
    }
  }, [askEdutu, isCurrentTurn, recorder, resumeAfterTurn, stopRecorderQuietly, transcribe, updateStatus]);

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

  /**
   * Cut Edutu off mid-sentence and hand the floor back to the user. Bound to
   * both the orb tap and the explicit "Interrupt" control, because a tap on a
   * talking orb is discoverable only once you already know it works.
   */
  const bargeIn = useCallback(() => {
    abortCurrentTurn();
    processingRef.current = false;
    stopSpeaking();
    setSpokenRatio(1);
    void startListening();
  }, [abortCurrentTurn, startListening]);

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
        bargeIn();
        break;
      default:
        break;
    }
  }, [bargeIn, startListening, stopAndProcess]);

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    if (next) {
      abortCurrentTurn();
      // Muting always kills the mic and drops any in-flight arm, whatever the
      // current status — otherwise a recording started mid-tap keeps running.
      stopSpeaking();
      void stopRecorderQuietly();
      processingRef.current = false;
      updateStatus('idle');
    } else if (statusRef.current === 'idle' && modeRef.current === 'live') {
      void startListening();
    }
    haptics.selection();
  }, [abortCurrentTurn, startListening, stopRecorderQuietly, updateStatus]);

  const begin = useCallback(() => {
    if (!activeRef.current) return;
    // First entry: Edutu introduces itself, its caption tracking the voice,
    // then the mic arms (live) or waits for a tap (voice).
    if (greeting && !greetedRef.current) {
      const turn = createTurnScope();
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
        signal: turn.controller.signal,
        onProgress: (ratio) => {
          if (isCurrentTurn(turn)) setSpokenRatio(ratio);
        },
        onDone: () => resumeAfterTurn(turn),
        onError: () => resumeAfterTurn(turn),
      });
      return;
    }
    void startListening();
  }, [createTurnScope, greeting, getAuthToken, isCurrentTurn, resumeAfterTurn, startListening, updateStatus]);

  /**
   * Recovery for whatever went wrong, without punishing the user for it:
   *  - network failure after they spoke → re-send the same words
   *  - anything else (permission granted since, rate limit lifted) → listen
   * The old `retry` was an alias for `begin`, which just re-armed the mic and
   * silently discarded the sentence the user had already said.
   */
  const retry = useCallback(() => {
    setErrorCode(null);
    if (errorCode === 'network' && lastPromptRef.current) {
      void askEdutu(lastPromptRef.current);
      return;
    }
    void startListening();
  }, [askEdutu, errorCode, startListening]);

  const end = useCallback(() => {
    abortCurrentTurn();
    activeRef.current = false;
    processingRef.current = false;
    stopSpeaking();
    void stopRecorderQuietly();
  }, [abortCurrentTurn, stopRecorderQuietly]);

  /**
   * The OS can take the session away at any moment — the user switches apps,
   * a call arrives, the screen locks. Before this, the recorder kept running
   * into a suspended audio session, TTS kept playing over whatever the user
   * switched to, and the UI came back still claiming "Listening…" over a mic
   * that was dead. Park the session honestly instead.
   */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'background') {
        if (statusRef.current === 'idle' && !pausedRef.current && !currentTurnRef.current) return;
        abortCurrentTurn();
        pausedRef.current = true;
        setPaused(true);
        stopSpeaking();
        processingRef.current = false;
        void stopRecorderQuietly();
        setLevel(0);
        updateStatus('idle');
        return;
      }
      if (next === 'active' && pausedRef.current) {
        pausedRef.current = false;
        setPaused(false);
        // Live mode is a hands-free conversation, so it resumes itself.
        // Tap-to-talk stays parked — re-arming a mic the user can't see would
        // be a surprise recording.
        if (activeRef.current && modeRef.current === 'live' && !mutedRef.current) {
          // If the background transition raced an in-flight native prepare or
          // cleanup, wait for the serialized recorder queue before arming the
          // next turn. This prevents two native prepare calls from overlapping.
          void recorderOperationRef.current.then(() => {
            if (activeRef.current && modeRef.current === 'live' && !mutedRef.current && pausedRef.current === false) {
              void startListening();
            }
          });
        }
      }
    });
    return () => subscription?.remove?.();
  }, [abortCurrentTurn, startListening, stopRecorderQuietly, updateStatus]);

  return {
    status,
    errorCode,
    muted,
    level,
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
