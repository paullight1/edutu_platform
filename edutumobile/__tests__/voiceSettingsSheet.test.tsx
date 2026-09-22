import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => ({ getToken: async () => 'token' }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0 }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('../components/ui/OrbPreview', () => ({ OrbPreview: () => null }));
jest.mock('../lib/haptics', () => ({ haptics: { selection: jest.fn() } }));
jest.mock('../lib/edutuSpeech', () => ({
  isPremiumVoiceEnabled: () => true,
  speak: jest.fn(async () => undefined),
}));

const { VoiceSettingsSheet } = require('../components/chat/VoiceSettingsSheet');
const { getVoiceSettings } = require('../lib/voiceSettingsStore');

describe('VoiceSettingsSheet Realtime voices', () => {
  it('shows all Realtime-compatible voices in Live mode and saves the selection', async () => {
    const screen = render(
      <VoiceSettingsSheet visible mode="live" onClose={jest.fn()} />,
    );

    expect(screen.getByText('Marin')).toBeTruthy();
    expect(screen.getByText('Cedar')).toBeTruthy();
    expect(screen.getByText('Ash')).toBeTruthy();
    expect(screen.queryByText('Nova')).toBeNull();
    expect(screen.queryByText('Onyx')).toBeNull();
    expect(screen.queryByText('Fable')).toBeNull();

    fireEvent.press(screen.getByText('Cedar'));
    await waitFor(() => expect(getVoiceSettings().realtimeVoice).toBe('cedar'));
  });
});
