import { useSyncExternalStore } from 'react';

/**
 * Global open/close state for the AI voice mode overlay.
 *
 * The overlay is mounted once at the (app) layout root, but it must be
 * openable from anywhere — the bottom-nav AI button (long press) and the
 * chat composer toggles — so a tiny module store beats prop drilling or a
 * context that would wrap the whole navigator.
 */
export type VoiceModeKind = 'voice' | 'live';

export interface VoiceModeState {
  visible: boolean;
  mode: VoiceModeKind;
  /**
   * Thread the last voice session wrote to. The chat screen consumes this
   * when the overlay closes so the spoken conversation appears in the chat.
   */
  lastThreadId: string | null;
}

let state: VoiceModeState = { visible: false, mode: 'voice', lastThreadId: null };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function openVoiceMode(mode: VoiceModeKind = 'voice') {
  if (state.visible && state.mode === mode) return;
  state = { ...state, visible: true, mode, lastThreadId: null };
  emit();
}

export function closeVoiceMode() {
  if (!state.visible) return;
  state = { ...state, visible: false };
  emit();
}

export function setVoiceModeThread(threadId: string | null) {
  if (state.lastThreadId === threadId) return;
  state = { ...state, lastThreadId: threadId };
  emit();
}

/** Reads and clears the last voice-session thread id. */
export function consumeVoiceModeThread(): string | null {
  const threadId = state.lastThreadId;
  if (threadId) {
    state = { ...state, lastThreadId: null };
    emit();
  }
  return threadId;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getVoiceModeState(): VoiceModeState {
  return state;
}

export function useVoiceModeState(): VoiceModeState {
  return useSyncExternalStore(subscribe, getVoiceModeState, getVoiceModeState);
}
