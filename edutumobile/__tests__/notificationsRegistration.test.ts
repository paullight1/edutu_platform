import * as Notifications from 'expo-notifications';
import { notificationService, registerForPushNotificationsAsync, resetPushTokenSync } from '../lib/notifications';

jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('../lib/config', () => ({ getConfig: () => ({ apiBaseUrl: 'https://backend.invalid' }) }));
jest.mock('../lib/i18n', () => ({ __esModule: true, default: { t: (key: string) => key } }));
jest.mock('../lib/notificationCategories', () => ({ registerNotificationCategoriesAsync: jest.fn(async () => {}) }));
jest.mock('../lib/notificationActionTask', () => ({ registerNotificationActionTask: jest.fn(async () => {}) }));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  AndroidImportance: { MAX: 5, HIGH: 4 },
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
}));

const permissions = Notifications.getPermissionsAsync as jest.Mock;
const prompt = Notifications.requestPermissionsAsync as jest.Mock;
const token = Notifications.getExpoPushTokenAsync as jest.Mock;
const channel = Notifications.setNotificationChannelAsync as jest.Mock;

beforeEach(async () => {
  jest.clearAllMocks();
  await resetPushTokenSync();
  permissions.mockResolvedValue({ status: 'undetermined' });
  prompt.mockResolvedValue({ status: 'granted' });
  token.mockResolvedValue({ data: 'ExponentPushToken[own-device-fixture]' });
  channel.mockResolvedValue(null);
});

it('reports an explicit registration failure and allows an immediate retry', async () => {
  const fetchMock = jest.fn()
    .mockResolvedValueOnce({ ok: false, status: 503 })
    .mockResolvedValueOnce({ ok: true });
  const previousFetch = global.fetch;
  global.fetch = fetchMock;
  const getAuthToken = jest.fn(async () => 'fresh-session-token');
  try {
    await expect(registerForPushNotificationsAsync('owner', getAuthToken, { requireServerSync: true }))
      .rejects.toThrow('register');
    await expect(registerForPushNotificationsAsync('owner', getAuthToken, { requireServerSync: true }))
      .resolves.toBe('ExponentPushToken[own-device-fixture]');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith('https://backend.invalid/notifications/push-token', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer fresh-session-token' }),
      signal: expect.anything(),
    }));
  } finally { global.fetch = previousFetch; }
});

it('keeps background failures quiet but never confirms registration without authentication', async () => {
  const getAuthToken = jest.fn(async () => null);
  await expect(registerForPushNotificationsAsync('owner', getAuthToken, { promptIfNeeded: false }))
    .resolves.toBeNull();
  await expect(registerForPushNotificationsAsync('owner', getAuthToken, { requireServerSync: true }))
    .rejects.toThrow('register');
});

it('waits for Android channels before the permission prompt and token request', async () => {
  let release!: () => void;
  channel.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
  const registration = registerForPushNotificationsAsync();
  await Promise.resolve();
  await Promise.resolve();
  try {
    expect(channel).toHaveBeenCalled();
    expect(prompt).not.toHaveBeenCalled();
    expect(token).not.toHaveBeenCalled();
  } finally {
    release?.();
    await registration;
  }
  expect(prompt).toHaveBeenCalledTimes(1);
  expect(token).toHaveBeenCalledTimes(1);
  expect(channel.mock.calls.map(([id]) => id).sort()).toEqual(['community', 'deadlines', 'default', 'opportunities']);
});

it('does not create channels or raise the permission prompt during a noninteractive launch', async () => {
  await expect(registerForPushNotificationsAsync(undefined, undefined, { promptIfNeeded: false })).resolves.toBeNull();
  expect(channel).not.toHaveBeenCalled();
  expect(prompt).not.toHaveBeenCalled();
  expect(token).not.toHaveBeenCalled();
});

it('initializes channels before a manual settings permission request', async () => {
  await expect(notificationService.requestPermissions()).resolves.toBe(true);
  expect(channel).toHaveBeenCalled();
  expect(Math.max(...channel.mock.invocationCallOrder)).toBeLessThan(prompt.mock.invocationCallOrder[0]);
});
