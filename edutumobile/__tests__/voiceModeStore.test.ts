import {
  openVoiceMode,
  closeVoiceMode,
  setVoiceModeThread,
  consumeVoiceModeThread,
  getVoiceModeState,
} from '../lib/voiceModeStore';

describe('voiceModeStore', () => {
  afterEach(() => {
    closeVoiceMode();
    consumeVoiceModeThread();
  });

  it('opens in the requested mode and clears any stale thread', () => {
    setVoiceModeThread('thread-stale');
    openVoiceMode('live');

    const state = getVoiceModeState();
    expect(state.visible).toBe(true);
    expect(state.mode).toBe('live');
    expect(state.lastThreadId).toBeNull();
  });

  it('defaults to tap-to-talk voice mode', () => {
    openVoiceMode();
    expect(getVoiceModeState().mode).toBe('voice');
  });

  it('keeps the session thread across close so chat can pick it up', () => {
    openVoiceMode('voice');
    setVoiceModeThread('thread-1');
    closeVoiceMode();

    const state = getVoiceModeState();
    expect(state.visible).toBe(false);
    expect(state.lastThreadId).toBe('thread-1');
  });

  it('consume returns the thread exactly once', () => {
    openVoiceMode('voice');
    setVoiceModeThread('thread-2');
    closeVoiceMode();

    expect(consumeVoiceModeThread()).toBe('thread-2');
    expect(consumeVoiceModeThread()).toBeNull();
    expect(getVoiceModeState().lastThreadId).toBeNull();
  });

  it('reopening for a new session starts with a clean thread', () => {
    openVoiceMode('voice');
    setVoiceModeThread('thread-3');
    closeVoiceMode();
    openVoiceMode('live');

    expect(consumeVoiceModeThread()).toBeNull();
  });
});
