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
 * Per-design colour set for the orb artwork. DELIBERATE EXEMPTION from the
 * "never hardcode hex" rule: orb palettes are user-chosen identity artwork,
 * intentionally not themed — `bubble` and `crystal` render the identical
 * silhouette and are told apart only by these colours, so tinting either to
 * `colors.accent` would make them indistinguishable and destroy the feature.
 *
 * Single source of truth, read by every orb renderer (currently only
 * `OrbPreview`, used by both the Voice Settings picker and the nav button —
 * see its docblock). Do not fork a second copy of these values.
 */
export interface OrbPalette {
  /** Gradient stops for the gradient-body designs (bubble/crystal/glass/blob). */
  gradient?: readonly [string, string, string];
  /** Foreground icon tint drawn over the gradient (bubble/crystal). */
  iconColor?: string;
  /** Border colour (ring's ring, glass's rim). */
  border?: string;
  /** Glow colour behind the ring design. */
  glow?: string;
  /** Glass design's inner swirl stroke. */
  swirl?: string;
  /** Glass design's sheen highlight. */
  sheen?: string;
  /** Blob design's eye colour. */
  eye?: string;
  /** Petals design's three dot tiers, outer→inner. */
  petalColors?: readonly [string, string, string];
  /** Robot design's body fill. */
  bodyColor?: string;
  /** Robot design's visor fill. */
  visorColor?: string;
  /** Robot design's visor border and eyes. */
  visorAccent?: string;
  visorEyeColor?: string;
  /** Particles design's dotted ring colour. */
  particleColor?: string;
}

export const ORB_PALETTES: Record<OrbDesign, OrbPalette> = {
  particles: {
    particleColor: '#7DD3FC',
  },
  ring: {
    border: '#EC4899',
    glow: '#D946EF',
  },
  bubble: {
    gradient: ['#8B5CF6', '#6D28D9', '#3B82F6'],
    iconColor: 'rgba(255,255,255,0.95)',
  },
  crystal: {
    gradient: ['#E9D5FF', '#C7B9FF', '#93C5FD'],
    iconColor: 'rgba(255,255,255,0.98)',
  },
  glass: {
    gradient: ['#2A1743', '#581C87', '#9333EA'],
    border: 'rgba(233,213,255,0.5)',
    swirl: 'rgba(216,180,254,0.75)',
    sheen: 'rgba(255,255,255,0.65)',
  },
  blob: {
    gradient: ['#EAF6FF', '#EDE4FF', '#F7C8E6'],
    eye: '#1E2A78',
    border: 'rgba(255,255,255,0.6)',
  },
  petals: {
    petalColors: ['#EC4899', '#A855F7', '#6D28D9'],
  },
  robot: {
    bodyColor: '#F3F4F6',
    visorColor: '#0B0B10',
    visorAccent: '#EC4899',
    visorEyeColor: '#FFFFFF',
  },
};

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
