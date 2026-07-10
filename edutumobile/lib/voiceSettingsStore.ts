import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

/**
 * Persisted voice-mode preferences: which orb design renders the AI and
 * which device TTS voice Edutu speaks with. Module store (like
 * voiceModeStore) so the session hook can read it synchronously without a
 * provider.
 */
export type OrbDesign =
  | 'particles'
  | 'ring'
  | 'bubble'
  | 'robot'
  | 'crystal'
  | 'glass'
  | 'blob'
  | 'petals';

export const ORB_DESIGNS: OrbDesign[] = [
  'particles',
  'ring',
  'bubble',
  'robot',
  'crystal',
  'glass',
  'blob',
  'petals',
];

/**
 * Edutu's branded neural voices (OpenAI TTS, synthesized server-side). These
 * replace the device's inconsistent installed voices — every user hears the
 * same coach. `tone` is a short human label for the picker.
 */
export interface TtsVoiceOption {
  id: string;
  label: string;
  tone: string;
}

export const TTS_VOICES: TtsVoiceOption[] = [
  { id: 'nova', label: 'Nova', tone: 'Warm · upbeat (recommended)' },
  { id: 'shimmer', label: 'Shimmer', tone: 'Bright · friendly' },
  { id: 'coral', label: 'Coral', tone: 'Warm · expressive' },
  { id: 'sage', label: 'Sage', tone: 'Calm · reassuring' },
  { id: 'alloy', label: 'Alloy', tone: 'Neutral · balanced' },
  { id: 'echo', label: 'Echo', tone: 'Clear · confident' },
  { id: 'fable', label: 'Fable', tone: 'Storytelling · lively' },
  { id: 'onyx', label: 'Onyx', tone: 'Deep · grounded' },
];

export const DEFAULT_TTS_VOICE = 'nova';

export interface VoiceSettings {
  design: OrbDesign;
  /** OpenAI TTS voice id — Edutu's spoken voice. */
  ttsVoice: string;
  /** Legacy expo-speech voice identifier; used only if server TTS is down. */
  voiceId: string | null;
  hydrated: boolean;
}

const STORAGE_KEY = '@edutu/voiceSettings';

let state: VoiceSettings = { design: 'particles', ttsVoice: DEFAULT_TTS_VOICE, voiceId: null, hydrated: false };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function persist() {
  AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ design: state.design, ttsVoice: state.ttsVoice, voiceId: state.voiceId }),
  ).catch(() => {});
}

let hydrating: Promise<void> | null = null;
function hydrate() {
  if (state.hydrated || hydrating) return;
  hydrating = AsyncStorage.getItem(STORAGE_KEY)
    .then((raw) => {
      const saved = raw ? JSON.parse(raw) : null;
      const savedVoice = typeof saved?.ttsVoice === 'string' ? saved.ttsVoice : null;
      state = {
        design: ORB_DESIGNS.includes(saved?.design) ? saved.design : 'particles',
        ttsVoice: TTS_VOICES.some((v) => v.id === savedVoice) ? savedVoice! : DEFAULT_TTS_VOICE,
        voiceId: typeof saved?.voiceId === 'string' ? saved.voiceId : null,
        hydrated: true,
      };
      emit();
    })
    .catch(() => {
      state = { ...state, hydrated: true };
      emit();
    });
}

export function setOrbDesign(design: OrbDesign) {
  if (state.design === design) return;
  state = { ...state, design };
  persist();
  emit();
}

export function setVoiceId(voiceId: string | null) {
  if (state.voiceId === voiceId) return;
  state = { ...state, voiceId };
  persist();
  emit();
}

export function setTtsVoice(ttsVoice: string) {
  if (state.ttsVoice === ttsVoice) return;
  state = { ...state, ttsVoice };
  persist();
  emit();
}

export function getVoiceSettings(): VoiceSettings {
  return state;
}

function subscribe(listener: () => void) {
  hydrate();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useVoiceSettings(): VoiceSettings {
  return useSyncExternalStore(subscribe, getVoiceSettings, getVoiceSettings);
}
