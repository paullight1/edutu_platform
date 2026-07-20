import { useState, useCallback, useRef, useEffect } from 'react';
import { haptics } from '../lib/haptics';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { getConfig } from '../lib/config';

interface UseVoiceRecordingOptions {
  onTranscription?: (text: string) => void;
  onError?: (error: Error) => void;
  maxDurationMs?: number;
  language?: string;
  /** Clerk token getter (e.g. useAuth().getToken) — chat-proxy requires a Clerk JWT. */
  getAuthToken?: () => Promise<string | null>;
}

const RECORDING_OPTIONS = { ...RecordingPresets.HIGH_QUALITY };

/**
 * One-shot dictation: record a clip, transcribe it via Whisper (chat-proxy),
 * and hand back the text. This is the "voice message" recorder behind the
 * composer mic — distinct from voice mode's continuous conversation loop.
 */
export function useVoiceRecording({
  onTranscription,
  onError,
  maxDurationMs = 30000,
  language = 'en',
  getAuthToken,
}: UseVoiceRecordingOptions = {}) {
  const recorder = useAudioRecorder(RECORDING_OPTIONS);

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [duration, setDuration] = useState(0); // seconds
  const [error, setError] = useState<string | null>(null);
  const [isPermissionGranted, setIsPermissionGranted] = useState(false);

  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopRef = useRef<() => void>(() => {});

  const clearTimers = useCallback(() => {
    if (durationTimerRef.current) { clearInterval(durationTimerRef.current); durationTimerRef.current = null; }
    if (maxTimerRef.current) { clearTimeout(maxTimerRef.current); maxTimerRef.current = null; }
  }, []);

  useEffect(() => {
    return () => {
      clearTimers();
      recorder.stop?.().catch?.(() => {});
      setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    AudioModule.getRecordingPermissionsAsync()
      .then(({ granted }) => setIsPermissionGranted(granted))
      .catch(() => {});
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      const { granted } = await AudioModule.requestRecordingPermissionsAsync();
      setIsPermissionGranted(granted);
      return granted;
    } catch {
      setError('Failed to request microphone permission');
      return false;
    }
  }, []);

  const stopRecording = useCallback(async () => {
    if (!isRecording) return;
    try {
      setIsRecording(false);
      setIsProcessing(true);
      clearTimers();
      haptics.light();

      await recorder.stop();
      const uri = recorder.uri;
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });

      if (uri && onTranscription) {
        const response = await fetch(uri);
        const blob = await response.blob();
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror = () => reject(new Error('Failed to read recording'));
          reader.readAsDataURL(blob);
        });

        const supabaseUrl = getConfig().supabaseUrl;
        // chat-proxy verifies a Clerk JWT — the anon key is rejected.
        const authToken = await getAuthToken?.();
        if (!authToken) throw new Error('Sign in to use voice input');

        if (supabaseUrl) {
          const res = await fetch(`${supabaseUrl}/functions/v1/chat-proxy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
            body: JSON.stringify({ mode: 'transcribe', audio: { mimeType: 'audio/m4a', data: base64 }, language }),
          });
          if (res.ok) {
            const { transcript } = await res.json();
            if (transcript) onTranscription(transcript);
          } else {
            const body = await res.json().catch(() => null);
            throw new Error(body?.error || 'Transcription failed');
          }
        }
      }
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Recording failed');
      setError(e.message);
      onError?.(e);
    } finally {
      setIsProcessing(false);
      setIsRecording(false);
    }
  }, [isRecording, recorder, onTranscription, onError, language, getAuthToken, clearTimers]);
  useEffect(() => {
    // Post-commit write (render-time ref writes are unsafe under concurrent
    // rendering); the only reader is the max-duration setTimeout below, which
    // always fires after commit.
    stopRef.current = () => { void stopRecording(); };
  });

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      setDuration(0);

      const current = await AudioModule.getRecordingPermissionsAsync();
      if (!current.granted) {
        const requested = await AudioModule.requestRecordingPermissionsAsync();
        if (!requested.granted) {
          const e = new Error('Microphone permission denied');
          setError(e.message);
          onError?.(e);
          return;
        }
        setIsPermissionGranted(true);
      }

      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setIsRecording(true);
      haptics.medium();

      const startTime = Date.now();
      durationTimerRef.current = setInterval(
        () => setDuration(Math.floor((Date.now() - startTime) / 1000)),
        250,
      );
      maxTimerRef.current = setTimeout(() => stopRef.current(), maxDurationMs);
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to start recording');
      setError(e.message);
      onError?.(e);
      setIsRecording(false);
    }
  }, [maxDurationMs, onError, recorder]);

  const cancelRecording = useCallback(() => {
    clearTimers();
    recorder.stop?.().catch?.(() => {});
    setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    setIsRecording(false);
    setIsProcessing(false);
    setDuration(0);
    setError(null);
    haptics.warning();
  }, [recorder, clearTimers]);

  return {
    isRecording,
    isProcessing,
    duration,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
    isPermissionGranted,
    requestPermission,
  };
}
