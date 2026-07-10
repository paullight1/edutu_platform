import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import * as Speech from 'expo-speech';
import { getConfig } from './config';

/**
 * Edutu's branded voice. Speech is synthesized server-side by the chat-proxy
 * edge function (OpenAI neural TTS) so every user hears the same warm coach
 * voice regardless of the device's installed voices. Playback is a single
 * shared player — starting a new utterance always cancels the previous one.
 *
 * If synthesis fails (offline, no key, rate limit) we fall back to the device
 * synthesizer (expo-speech) so voice mode never goes silent. Either path
 * reports playback progress (0→1) so callers can reveal captions in sync with
 * the voice.
 */

export type SpeakProgress = (ratio: number) => void;

export interface SpeakOptions {
  /** OpenAI voice id (alloy, nova, shimmer, …). Falls back server-side. */
  voice?: string | null;
  /** ISO-639-1 hint, used only by the device fallback. */
  language?: string;
  getAuthToken?: () => Promise<string | null>;
  onStart?: () => void;
  /** Fires ~10×/sec with playback position as a 0→1 ratio. */
  onProgress?: SpeakProgress;
  onDone?: () => void;
  /** Fired when the caller (or a newer utterance) interrupts this one. */
  onStopped?: () => void;
  onError?: (error: unknown) => void;
}

/** Strip markdown/links so neither engine reads syntax aloud. */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/#{1,6}\s?/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`{1,3}([^`]*)`{1,3}/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

let fileCounter = 0;
let activePlayer: AudioPlayer | null = null;
let activeListener: { remove: () => void } | null = null;
let progressTimer: ReturnType<typeof setInterval> | null = null;
// Monotonically increasing token — a callback whose token is stale means a
// newer utterance (or a stop) has taken over, so it must not fire onDone.
let currentToken = 0;

function teardownPlayback() {
  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
  if (activeListener) {
    try {
      activeListener.remove();
    } catch {}
    activeListener = null;
  }
  if (activePlayer) {
    try {
      activePlayer.remove();
    } catch {}
    activePlayer = null;
  }
}

/** Cancel whatever is currently speaking (server audio or device fallback). */
export function stopSpeaking() {
  currentToken += 1;
  teardownPlayback();
  try {
    Speech.stop();
  } catch {}
}

async function synthesize(
  text: string,
  voice: string | null | undefined,
  getAuthToken?: () => Promise<string | null>,
): Promise<{ audio: string; mimeType: string } | null> {
  const supabaseUrl = getConfig().supabaseUrl;
  const authToken = await getAuthToken?.();
  if (!supabaseUrl || !authToken) return null;

  const res = await fetch(`${supabaseUrl}/functions/v1/chat-proxy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ mode: 'tts', text, voice: voice ?? undefined }),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!data?.audio) return null;
  return { audio: data.audio, mimeType: data.mimeType || 'audio/mpeg' };
}

function speakWithDevice(text: string, opts: SpeakOptions, token: number) {
  // Estimate duration for the caption reveal — device TTS gives no position.
  const words = text.split(/\s+/).filter(Boolean).length || 1;
  const estMs = Math.max(1200, (words / 2.6) * 1000);
  const startedAt = Date.now();
  progressTimer = setInterval(() => {
    if (token !== currentToken) return;
    const ratio = Math.min(0.98, (Date.now() - startedAt) / estMs);
    opts.onProgress?.(ratio);
  }, 100);

  Speech.speak(text, {
    language: opts.language || 'en',
    rate: 1.0,
    pitch: 1.02,
    onStart: () => {
      if (token === currentToken) opts.onStart?.();
    },
    onDone: () => {
      if (token !== currentToken) return;
      teardownPlayback();
      opts.onProgress?.(1);
      opts.onDone?.();
    },
    onStopped: () => {
      if (token === currentToken) opts.onStopped?.();
    },
    onError: () => {
      if (token !== currentToken) return;
      teardownPlayback();
      opts.onError?.(new Error('Device speech failed'));
    },
  });
}

/**
 * Speak `rawText` in Edutu's voice. Resolves immediately after playback
 * begins; use the callbacks for lifecycle. Only one utterance plays at a time.
 */
export async function speak(rawText: string, opts: SpeakOptions = {}): Promise<void> {
  const text = cleanForSpeech(rawText);
  stopSpeaking();
  if (!text) {
    opts.onProgress?.(1);
    opts.onDone?.();
    return;
  }

  const token = ++currentToken;

  let synthesized: { audio: string; mimeType: string } | null = null;
  try {
    synthesized = await synthesize(text, opts.voice, opts.getAuthToken);
  } catch {
    synthesized = null;
  }

  // A newer utterance started while we were awaiting synthesis — abandon.
  if (token !== currentToken) return;

  if (!synthesized) {
    speakWithDevice(text, opts, token);
    return;
  }

  try {
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });

    const file = new File(Paths.cache, `edutu-tts-${token}-${fileCounter++}.mp3`);
    try {
      if (file.exists) file.delete();
    } catch {}
    file.write(synthesized.audio, { encoding: 'base64' });

    if (token !== currentToken) {
      try {
        file.delete();
      } catch {}
      return;
    }

    const player = createAudioPlayer({ uri: file.uri });
    activePlayer = player;

    const cleanupFile = () => {
      try {
        file.delete();
      } catch {}
    };

    activeListener = player.addListener('playbackStatusUpdate', (status) => {
      if (token !== currentToken) return;
      if (status.duration > 0) {
        opts.onProgress?.(Math.min(1, status.currentTime / status.duration));
      }
      if (status.didJustFinish) {
        teardownPlayback();
        cleanupFile();
        opts.onProgress?.(1);
        opts.onDone?.();
      }
    });

    opts.onStart?.();
    player.play();
  } catch (error) {
    if (token !== currentToken) return;
    // Playback (not synthesis) failed — still try the device so we're not mute.
    speakWithDevice(text, opts, token);
  }
}
