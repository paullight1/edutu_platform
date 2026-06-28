import { useState, useCallback, useRef, useEffect } from 'react';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import { supabase } from '../lib/supabase';
import { getConfig } from '../lib/config';

interface UseVoiceRecordingOptions {
  onTranscription?: (text: string) => void;
  onError?: (error: Error) => void;
  maxDurationMs?: number;
  language?: string;
}

export function useVoiceRecording({
  onTranscription,
  onError,
  maxDurationMs = 30000,
  language = 'en',
}: UseVoiceRecordingOptions = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isPermissionGranted, setIsPermissionGranted] = useState(false);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (durationTimerRef.current) clearInterval(durationTimerRef.current);
      if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
    };
  }, []);

  // Check permission on mount
  useEffect(() => {
    Audio.getPermissionsAsync().then(({ granted }) => setIsPermissionGranted(granted));
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      setIsPermissionGranted(granted);
      return granted;
    } catch (err) {
      setError('Failed to request microphone permission');
      return false;
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      setDuration(0);

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      recordingRef.current = recording;
      setIsRecording(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Duration tracking
      const startTime = Date.now();
      durationTimerRef.current = setInterval(() => setDuration(Date.now() - startTime), 100);

      // Auto-stop at max duration
      maxTimerRef.current = setTimeout(() => {
        if (recordingRef.current) stopRecording();
      }, maxDurationMs);

    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to start recording');
      setError(e.message);
      onError?.(e);
      setIsRecording(false);
    }
  }, [maxDurationMs, onError]);

  const stopRecording = useCallback(async () => {
    if (!recordingRef.current) return;
    try {
      setIsRecording(false);
      setIsProcessing(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      if (durationTimerRef.current) { clearInterval(durationTimerRef.current); durationTimerRef.current = null; }
      if (maxTimerRef.current) { clearTimeout(maxTimerRef.current); maxTimerRef.current = null; }

      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      if (uri && onTranscription) {
        // Read audio file and send to edge function for Whisper transcription
        const response = await fetch(uri);
        const blob = await response.blob();
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
          reader.readAsDataURL(blob);
        });

        const supabaseUrl = getConfig().supabaseUrl;
        const supabaseKey = getConfig().supabaseAnonKey;

        if (supabaseUrl && supabaseKey) {
          const res = await fetch(`${supabaseUrl}/functions/v1/chat-proxy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
            body: JSON.stringify({ action: 'transcribe', audio: { mimeType: 'audio/m4a', data: base64 }, language }),
          });
          if (res.ok) {
            const { transcript } = await res.json();
            if (transcript) onTranscription(transcript);
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
  }, [onTranscription, onError, language]);

  const cancelRecording = useCallback(() => {
    recordingRef.current?.stopAndUnloadAsync().catch(() => {});
    recordingRef.current = null;
    if (durationTimerRef.current) { clearInterval(durationTimerRef.current); durationTimerRef.current = null; }
    if (maxTimerRef.current) { clearTimeout(maxTimerRef.current); maxTimerRef.current = null; }
    setIsRecording(false);
    setIsProcessing(false);
    setDuration(0);
    setError(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }, []);

  return { isRecording, isProcessing, duration, error, startRecording, stopRecording, cancelRecording, isPermissionGranted, requestPermission };
}
