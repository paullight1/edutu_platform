import {
  OPENAI_REALTIME_VOICES,
  TTS_VOICES,
  getVoiceSettings,
  setRealtimeVoice,
} from '../lib/voiceSettingsStore';

describe('OpenAI voice settings', () => {
  it('offers every built-in Realtime voice supported by OpenAI', () => {
    expect(OPENAI_REALTIME_VOICES.map((voice) => voice.id)).toEqual([
      'alloy',
      'ash',
      'ballad',
      'coral',
      'echo',
      'sage',
      'shimmer',
      'verse',
      'marin',
      'cedar',
    ]);
  });

  it('keeps every built-in TTS voice available to tap-to-talk mode', () => {
    expect(TTS_VOICES.map((voice) => voice.id)).toEqual([
      'alloy',
      'ash',
      'ballad',
      'coral',
      'echo',
      'fable',
      'nova',
      'onyx',
      'sage',
      'shimmer',
      'verse',
    ]);
  });

  it('persists a valid Realtime voice and rejects unsupported identifiers', () => {
    setRealtimeVoice('cedar');
    expect(getVoiceSettings().realtimeVoice).toBe('cedar');

    setRealtimeVoice('nova');
    expect(getVoiceSettings().realtimeVoice).toBe('cedar');
  });
});
