import React from 'react';
import { cleanup, render, waitFor } from '@testing-library/react-native';

const mockRecorder = {
  record: jest.fn(),
  stop: jest.fn(async () => undefined),
  prepareToRecordAsync: jest.fn(async () => undefined),
  uri: null,
};

jest.mock('expo-audio', () => ({
  useAudioPlayer: () => ({ seekTo: jest.fn(), play: jest.fn() }),
  useAudioRecorder: () => mockRecorder,
  useAudioRecorderState: () => ({ isRecording: false, metering: -60, durationMillis: 0 }),
  setAudioModeAsync: jest.fn(async () => undefined),
  RecordingPresets: { HIGH_QUALITY: {} },
  AudioModule: {
    getRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })),
    requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })),
  },
}));

jest.mock('@clerk/clerk-expo', () => ({
  useUser: () => ({ user: { id: 'user_1' } }),
  useAuth: () => ({ getToken: async () => 'token' }),
}));

jest.mock('@edutu/core/src/hooks/useProStatus', () => ({
  useProStatus: () => ({ isPro: false, isLoading: false }),
}));

jest.mock('../lib/edutuSpeech', () => ({
  premiumVoiceEnabledForEntitlement: () => false,
  setPremiumVoiceEnabled: jest.fn(),
  speak: jest.fn(async () => undefined),
  stopSpeaking: jest.fn(),
}));

jest.mock('../lib/haptics', () => ({
  haptics: {
    light: jest.fn(),
    medium: jest.fn(),
    error: jest.fn(),
    selection: jest.fn(),
  },
}));

jest.mock('../lib/supabase', () => ({ supabase: {} }));
jest.mock('../lib/upsell', () => ({ usePromptProUpgrade: () => jest.fn() }));
jest.mock('../lib/voiceSettingsStore', () => ({
  useVoiceSettings: () => ({ design: 'particles' }),
  getVoiceSettings: () => ({ ttsVoice: null }),
}));
jest.mock('../components/context/ThemeContext', () => ({
  useTheme: () => ({
    reducedMotion: true,
    colors: {
      accent: '#2563eb',
      accentLight: '#60a5fa',
      error: '#ef4444',
      success: '#10b981',
      warning: '#f59e0b',
    },
  }),
}));
jest.mock('../components/branding/EdutuLogo', () => ({ EdutuLogo: () => null }));
jest.mock('../components/chat/ParticleOrb', () => ({ ParticleOrb: () => null }));
jest.mock('../components/chat/VoiceSettingsSheet', () => ({ VoiceSettingsSheet: () => null }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const { VoiceModeOverlay } = require('../components/chat/VoiceModeOverlay');
const { closeVoiceMode, openVoiceMode } = require('../lib/voiceModeStore');

describe('voice mode startup', () => {
  afterEach(() => {
    cleanup();
    closeVoiceMode();
  });

  it('leaves the Starting state as part of mounting the live session', async () => {
    openVoiceMode('live');

    const screen = render(<VoiceModeOverlay />);

    await waitFor(() => {
      expect(screen.getByText('voiceMode.statusSpeaking')).toBeTruthy();
    }, { timeout: 100 });
    expect(screen.queryByText('voiceMode.statusConnecting')).toBeNull();
  });

});
