import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { FirstRunSetup } from '../components/ui/FirstRunSetup';
import { registerForPushNotificationsAsync } from '../lib/notifications';
import { saveNotificationPreferences } from '@edutu/core/src/services/notificationPreferences';

const mockPush = jest.fn();
const mockGetToken = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@clerk/clerk-expo', () => ({ useAuth: () => ({ getToken: mockGetToken }) }));
jest.mock('../lib/welcomeModalStore', () => ({ useWelcomeModalActive: () => false }));
jest.mock('../components/context/ThemeContext', () => ({ useTheme: () => ({ colors: require('../test-utils/themeColors').TEST_THEME_COLORS }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_key: string, options: { defaultValue: string }) => options.defaultValue }) }));
jest.mock('../components/ui/WelcomeHintSystem', () => ({
  WelcomeHintSystem: ({ onComplete }: { onComplete: () => void }) => {
    const { Button } = require('react-native');
    return <Button title="Finish tour" onPress={onComplete} />;
  },
}));
jest.mock('../components/ui/LoginOfferModal', () => ({ LoginOfferModal: () => null }));
jest.mock('../lib/notifications', () => ({
  registerForPushNotificationsAsync: jest.fn(),
  notificationService: { saveSettings: jest.fn(async () => {}) },
}));
jest.mock('../lib/pushOptIn', () => ({ markPushOptInAsked: jest.fn(async () => {}) }));
jest.mock('@edutu/core/src/services/notificationPreferences', () => ({ saveNotificationPreferences: jest.fn(async () => {}) }));

beforeEach(async () => {
  jest.clearAllMocks();
  Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
  await AsyncStorage.clear();
  (registerForPushNotificationsAsync as jest.Mock).mockResolvedValue('ExponentPushToken[device]');
});

it('waits until the tour finishes, then registers only after an explicit choice', async () => {
  const screen = render(<FirstRunSetup userId="owner" enabled isDark={false} showLoginOffer={false} />);
  await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalled());
  expect(screen.queryByText('Enable notifications')).toBeNull();
  expect(registerForPushNotificationsAsync).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText(/finish tour/i));
  await waitFor(() => expect(screen.getByText('Enable notifications')).toBeTruthy());
  fireEvent.press(screen.getByText('Enable notifications'));
  await waitFor(() => expect(screen.queryByText('Enable notifications')).toBeNull());
  expect(registerForPushNotificationsAsync).toHaveBeenCalledWith('owner', mockGetToken, { requireServerSync: true });
  expect(saveNotificationPreferences).toHaveBeenCalledWith(mockGetToken, { pushNotifications: true });
  expect(await AsyncStorage.getItem('edutu:notification-setup:v1:owner')).toBe('done');
});

it('offers existing users setup once and remembers Not now without enabling anything', async () => {
  await AsyncStorage.setItem('edutu:welcome-hints:v1:owner', 'done');
  const screen = render(<FirstRunSetup userId="owner" enabled isDark={false} showLoginOffer={false} />);
  fireEvent.press(await screen.findByText('Not now'));
  await waitFor(() => expect(screen.queryByText('Enable notifications')).toBeNull());
  expect(registerForPushNotificationsAsync).not.toHaveBeenCalled();
  expect(saveNotificationPreferences).not.toHaveBeenCalled();
  screen.unmount();
  const reopened = render(<FirstRunSetup userId="owner" enabled isDark={false} showLoginOffer={false} />);
  await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalledWith('edutu:notification-setup:v1:owner'));
  expect(reopened.queryByText('Enable notifications')).toBeNull();
});

it('keeps setup retryable when the server rejects registration', async () => {
  await AsyncStorage.setItem('edutu:welcome-hints:v1:owner', 'done');
  (registerForPushNotificationsAsync as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  const screen = render(<FirstRunSetup userId="owner" enabled isDark={false} showLoginOffer={false} />);
  fireEvent.press(await screen.findByText('Enable notifications'));
  await waitFor(() => expect(screen.getByText('We could not connect notifications. Check your connection and try again.')).toBeTruthy());
  expect(saveNotificationPreferences).not.toHaveBeenCalled();
  expect(await AsyncStorage.getItem('edutu:notification-setup:v1:owner')).toBeNull();
  fireEvent.press(screen.getByText('Enable notifications'));
  await waitFor(() => expect(saveNotificationPreferences).toHaveBeenCalledTimes(1));
});

it('leaves setup available if phone permission is denied', async () => {
  await AsyncStorage.setItem('edutu:welcome-hints:v1:owner', 'done');
  (registerForPushNotificationsAsync as jest.Mock).mockResolvedValueOnce(null);
  const screen = render(<FirstRunSetup userId="owner" enabled isDark={false} showLoginOffer={false} />);
  fireEvent.press(await screen.findByText('Enable notifications'));
  await waitFor(() => expect(screen.getByText('Enable notifications')).toBeTruthy());
  expect(saveNotificationPreferences).not.toHaveBeenCalled();
  expect(await AsyncStorage.getItem('edutu:notification-setup:v1:owner')).toBeNull();
});

it('opens the existing settings screen without changing preferences', async () => {
  await AsyncStorage.setItem('edutu:welcome-hints:v1:owner', 'done');
  const screen = render(<FirstRunSetup userId="owner" enabled isDark={false} showLoginOffer={false} />);
  fireEvent.press(await screen.findByText('Review settings'));
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/profile/settings'));
  expect(saveNotificationPreferences).not.toHaveBeenCalled();
});
