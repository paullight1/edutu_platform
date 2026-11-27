import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { ProductApiRequestError, requestProductApi } from '@edutu/core/src/services/productApi';
import {
  bindAndroidAutoApplyPush, receiveAutoApplyAndroidProgress,
  clearAutoApplyAndroidProgress, refreshAndroidAutoApplyProgress, showAutoApplyAndroidProgress,
} from '../lib/autoApplyAndroidProgress';

jest.mock('@edutu/core/src/services/productApi', () => ({
  ...jest.requireActual('@edutu/core/src/services/productApi'), requestProductApi: jest.fn(),
}));

jest.mock('expo-notifications', () => ({
  AndroidImportance: { LOW: 2 },
  getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(null),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('edutu-auto-apply-current'),
  dismissNotificationAsync: jest.fn().mockResolvedValue(undefined),
}));

const id = 'a0000000-0000-4000-8000-000000000001';
const otherId = 'a0000000-0000-4000-8000-000000000002';
const identifier = 'edutu-auto-apply-' + id;
const source = 'auto-apply-progress';
beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

test('uses a silent ongoing notification and ignores stale or unrelated progress', async () => {
  await showAutoApplyAndroidProgress({ id, state: 'queued', version: 1 }, true);
  await receiveAutoApplyAndroidProgress({ source, attemptId: id, state: 'needs_input', version: 3 });
  await receiveAutoApplyAndroidProgress({ source, attemptId: id, state: 'running', version: 2 });
  await receiveAutoApplyAndroidProgress({ source, attemptId: 'a0000000-0000-4000-8000-000000000002', state: 'running', version: 2 });
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
  expect(Notifications.scheduleNotificationAsync).toHaveBeenLastCalledWith(expect.objectContaining({
    identifier,
    content: expect.objectContaining({
      body: 'Your input is needed', sticky: true, sound: false,
      data: { source, attemptId: id, version: 3, url: '/auto-apply/' + id },
    }),
  }));
  await receiveAutoApplyAndroidProgress({ source, attemptId: id, state: 'submitted', version: 4 });
  expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith(identifier);
  await receiveAutoApplyAndroidProgress({ source, attemptId: id, state: 'submitting', version: 3 });
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
});

test('adds a known action to existing progress without displaying unknown payload values', async () => {
  await showAutoApplyAndroidProgress({ id, state: 'needs_input', version: 1 }, true);
  await receiveAutoApplyAndroidProgress({ source, attemptId: id, state: 'needs_input', version: 1, activityAction: 'cv' });
  await receiveAutoApplyAndroidProgress({ source, attemptId: id, state: 'needs_input', version: 1, activityAction: 'untrusted' });
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
  expect(Notifications.scheduleNotificationAsync).toHaveBeenLastCalledWith(expect.objectContaining({
    content: expect.objectContaining({ body: 'Choose a CV', sticky: true }),
  }));
});

test('shows the opportunity name when it arrives at the current progress version', async () => {
  const progress = { id, state: 'needs_input' as const, version: 3 };
  await showAutoApplyAndroidProgress(progress, true);
  await showAutoApplyAndroidProgress({ ...progress, title: 'Chevron' }, true);
  await showAutoApplyAndroidProgress(progress);

  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
  expect(Notifications.scheduleNotificationAsync).toHaveBeenLastCalledWith(expect.objectContaining({
    identifier, content: expect.objectContaining({ title: 'Chevron', body: 'Your input is needed' }),
  }));
});

test('binds an attempt already in progress when push token registration finishes', async () => {
  await showAutoApplyAndroidProgress({ id, state: 'queued', version: 1 }, true);
  const token = 'ExponentPushToken[fixture]';
  const getToken = async () => 'test-auth';
  await bindAndroidAutoApplyPush(token, getToken);
  expect(requestProductApi).toHaveBeenCalledWith('/me/auto-apply/attempts/' + id + '/activity', {
    method: 'PUT', body: JSON.stringify({ activityId: 'android', token, platform: 'android' }),
  }, getToken);
});

test('keeps restarted progress visible when the cancellation push arrives late', async () => {
  await showAutoApplyAndroidProgress({ id, state: 'needs_input', version: 4, title: 'Chevron' }, true);
  await showAutoApplyAndroidProgress({ id, state: 'queued', version: 6 }, true);
  await receiveAutoApplyAndroidProgress({ source, attemptId: id, state: 'cancelled', version: 5 });
  expect(Notifications.dismissNotificationAsync).not.toHaveBeenCalled();
  await receiveAutoApplyAndroidProgress({ source, attemptId: id, state: 'running', version: 7 });
  expect(Notifications.scheduleNotificationAsync).toHaveBeenLastCalledWith(expect.objectContaining({
    identifier,
    content: expect.objectContaining({ title: 'Chevron', body: 'Preparing application',
      data: expect.objectContaining({ version: 7, url: '/auto-apply/' + id }) }),
  }));
});

test('removes stale progress on foreground recovery when the terminal push was missed', async () => {
  await showAutoApplyAndroidProgress({ id, state: 'submitting', version: 3 }, true);
  jest.mocked(requestProductApi).mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ id, state: 'submitted', version: 4 });
  const getToken = async () => 'test-auth';
  await refreshAndroidAutoApplyProgress(getToken);
  expect(Notifications.dismissNotificationAsync).not.toHaveBeenCalled();
  await refreshAndroidAutoApplyProgress(getToken);
  expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith(identifier);
  await refreshAndroidAutoApplyProgress(getToken);
  expect(requestProductApi).toHaveBeenCalledTimes(2);
});

test('ignores a status response that arrives after the Android session ends', async () => {
  await showAutoApplyAndroidProgress({ id, state: 'running', version: 1 }, true);
  const api = jest.mocked(requestProductApi);
  const session = new AbortController();
  let finish: (value: unknown) => void = () => {};
  let started: () => void = () => {};
  const requested = new Promise<void>(resolve => { started = resolve; });
  api.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; started(); }));
  const refresh = refreshAndroidAutoApplyProgress(async () => 'old-auth', session.signal);
  await requested;
  session.abort();
  finish({ id, state: 'needs_review', version: 2 });
  await refresh;
  expect(api).toHaveBeenCalledWith('/me/auto-apply/attempts/' + id,
    { signal: session.signal }, expect.any(Function), undefined, { throwOnError: true });
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
});

test('dismisses a missing attempt without reviving it from late Android pushes', async () => {
  await showAutoApplyAndroidProgress({ id, state: 'running', version: 3 }, true);
  const api = jest.mocked(requestProductApi);
  api.mockRejectedValueOnce(new ProductApiRequestError('http', 503))
    .mockRejectedValueOnce(new ProductApiRequestError('http', 404));
  const token = async () => 'test-auth';
  await refreshAndroidAutoApplyProgress(token);
  expect(Notifications.dismissNotificationAsync).not.toHaveBeenCalled();
  await refreshAndroidAutoApplyProgress(token);
  expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith(identifier);
  await receiveAutoApplyAndroidProgress({ source, attemptId: id, state: 'needs_review', version: 5 });
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  await refreshAndroidAutoApplyProgress(token);
  expect(api).toHaveBeenCalledTimes(2);
});

test('shows current progress when Android notification permission is restored without a new attempt version', async () => {
  const permission = jest.mocked(Notifications.getPermissionsAsync);
  permission.mockResolvedValueOnce({ granted: false } as Awaited<ReturnType<typeof Notifications.getPermissionsAsync>>);
  const progress = { id, state: 'needs_input' as const, version: 3, title: 'Chevron' };
  await showAutoApplyAndroidProgress(progress, true);
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  const api = jest.mocked(requestProductApi);
  api.mockResolvedValueOnce(progress).mockResolvedValueOnce(progress);
  const token = async () => 'test-auth';
  await refreshAndroidAutoApplyProgress(token);
  await refreshAndroidAutoApplyProgress(token);
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(expect.objectContaining({
    identifier,
    content: expect.objectContaining({ title: 'Chevron', body: 'Your input is needed' }),
  }));
});

test('retains progress after Android fails to post the notification and retries the same version', async () => {
  const schedule = jest.mocked(Notifications.scheduleNotificationAsync);
  schedule.mockRejectedValueOnce(new Error('Native notification service was unavailable'));
  await showAutoApplyAndroidProgress({ id, state: 'running', version: 2, title: 'Chevron' }, true);

  await receiveAutoApplyAndroidProgress({ source, attemptId: id, state: 'running', version: 2 });
  expect(schedule).toHaveBeenCalledTimes(2);
  expect(schedule).toHaveBeenLastCalledWith(expect.objectContaining({
    identifier, content: expect.objectContaining({ title: 'Chevron', body: 'Preparing application' }),
  }));
  await receiveAutoApplyAndroidProgress({ source, attemptId: id, state: 'running', version: 2 });
  expect(schedule).toHaveBeenCalledTimes(2);
});

test('retries native dismissal on return without reviving completed progress', async () => {
  const dismiss = jest.mocked(Notifications.dismissNotificationAsync);
  await showAutoApplyAndroidProgress({ id, state: 'submitting', version: 2, title: 'Chevron' }, true);
  dismiss.mockRejectedValueOnce(new Error('Native notification service was unavailable'));
  await receiveAutoApplyAndroidProgress({ source, attemptId: id, state: 'submitted', version: 3 });

  await receiveAutoApplyAndroidProgress({ source, attemptId: id, state: 'submitting', version: 2 });
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  const auth = async () => 'test-auth';
  await refreshAndroidAutoApplyProgress(auth);
  expect(dismiss.mock.calls).toEqual([[identifier], [identifier]]);
  expect(requestProductApi).not.toHaveBeenCalled();
  await refreshAndroidAutoApplyProgress(auth);
  expect(dismiss).toHaveBeenCalledTimes(2);
});

test('dismisses the Android notification when the attempt ends before push registration', async () => {
  await showAutoApplyAndroidProgress({ id, state: 'running', version: 2 }, true);
  jest.mocked(requestProductApi).mockResolvedValueOnce({
    updated: false, progress: { id, state: 'submitted', version: 4 },
  });
  const token = 'ExpoPushToken[fixture-late]';
  await bindAndroidAutoApplyPush(token);
  expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith(identifier);
  await bindAndroidAutoApplyPush(token);
  expect(requestProductApi).toHaveBeenCalledTimes(1);
});

test('updates two attempt notifications independently and clears both when the account changes', async () => {
  const otherIdentifier = 'edutu-auto-apply-' + otherId;
  await showAutoApplyAndroidProgress({ id, state: 'queued', version: 1, title: 'Chevron' }, true);
  await showAutoApplyAndroidProgress({ id: otherId, state: 'running', version: 1, title: 'Mastercard' }, true);
  await receiveAutoApplyAndroidProgress({ source, attemptId: id, state: 'needs_input', version: 3 });
  expect(Notifications.scheduleNotificationAsync).toHaveBeenLastCalledWith(expect.objectContaining({
    identifier,
    content: expect.objectContaining({ title: 'Chevron', data: expect.objectContaining({ url: '/auto-apply/' + id }) }),
  }));
  await receiveAutoApplyAndroidProgress({ source, attemptId: id, state: 'submitted', version: 4 });
  expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith(identifier);
  expect(Notifications.dismissNotificationAsync).not.toHaveBeenCalledWith(otherIdentifier);
  await bindAndroidAutoApplyPush('ExpoPushToken[fixture-two]');
  expect(requestProductApi).toHaveBeenCalledTimes(1);
  expect(requestProductApi).toHaveBeenCalledWith('/me/auto-apply/attempts/' + otherId + '/activity', expect.anything(), undefined);
  await clearAutoApplyAndroidProgress();
  expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith(otherIdentifier);
  await receiveAutoApplyAndroidProgress({ source, attemptId: otherId, state: 'needs_review', version: 5 });
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(3);
});

test('keeps the pre-upgrade notification until its own attempt completes', async () => {
  await AsyncStorage.setItem('edutu-android-auto-apply-progress', JSON.stringify({ id, state: 'running', version: 2 }));
  await showAutoApplyAndroidProgress({ id: otherId, state: 'running', version: 1 }, true);
  await receiveAutoApplyAndroidProgress({ source, attemptId: id, state: 'submitted', version: 3 });
  expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith('edutu-auto-apply-current');
  expect(Notifications.dismissNotificationAsync).not.toHaveBeenCalledWith('edutu-auto-apply-' + otherId);
});

test('retries unknown device registrations and coalesces verified bindings', async () => {
  await showAutoApplyAndroidProgress({ id, state: 'running', version: 1 }, true);
  const api = jest.mocked(requestProductApi);
  api.mockResolvedValueOnce({ updated: false }).mockResolvedValueOnce({ updated: true });
  const token = 'ExpoPushToken[fixture-dedupe]';
  await bindAndroidAutoApplyPush(token);
  await bindAndroidAutoApplyPush(token);
  await bindAndroidAutoApplyPush(token);
  expect(api).toHaveBeenCalledTimes(2);
});
