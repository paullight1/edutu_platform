import AsyncStorage from '@react-native-async-storage/async-storage';
import { waitFor } from '@testing-library/react-native';
import { ProductApiRequestError, requestProductApi } from '@edutu/core/src/services/productApi';
import { refreshAutoApplyActivity, syncAutoApplyActivity, syncAutoApplyActivityOwner } from '../lib/autoApplyActivity';

const mockInstance = {
  getId: () => 'fixture-activity',
  update: jest.fn(async () => {}),
  end: jest.fn(async () => {}),
  addPushTokenListener: jest.fn(() => ({ remove: jest.fn() })),
  getPushToken: jest.fn(async (): Promise<string | null> => null),
};
const mockFactory = {
  getInstances: jest.fn(),
  start: jest.fn(() => mockInstance),
};
jest.mock('../widgets/AutoApplyActivity', () => ({ getAutoApplyActivityFactory: () => mockFactory }));
jest.mock('@edutu/core/src/services/productApi', () => ({
  ...jest.requireActual('@edutu/core/src/services/productApi'), requestProductApi: jest.fn(),
}));

test('starts one iOS activity before the screen loads and ignores older progress', async () => {
  await AsyncStorage.clear();
  mockFactory.getInstances.mockReturnValueOnce([]).mockReturnValue([mockInstance]);
  const id = 'fixture-attempt';
  await syncAutoApplyActivity({ id, state: 'queued', version: 1 });
  await syncAutoApplyActivity({ id, state: 'needs_input', version: 3 });
  await syncAutoApplyActivity({ id, state: 'needs_input', version: 3 });
  await syncAutoApplyActivity({ id, state: 'running', version: 2 });
  expect(mockFactory.start).toHaveBeenCalledTimes(1);
  expect(mockInstance.update).toHaveBeenCalledTimes(1);
  expect(mockInstance.update).toHaveBeenCalledWith({ status: 'Your input is needed', actionRequired: true });

  await syncAutoApplyActivity({ id, state: 'submitted', version: 4 });
  await syncAutoApplyActivity({ id, state: 'running', version: 2 });
  expect(mockInstance.end).toHaveBeenCalledWith('immediate', { status: 'Submitted', actionRequired: false });
  expect(mockFactory.start).toHaveBeenCalledTimes(1);
});

test('keeps both attempts, isolates late updates, and clears the remaining activity on account change', async () => {
  await AsyncStorage.clear();
  await syncAutoApplyActivityOwner('learner');
  const first = { ...mockInstance, getId: () => 'activity-chevron', update: jest.fn(), end: jest.fn() };
  const second = { ...mockInstance, getId: () => 'activity-mastercard', update: jest.fn(), end: jest.fn() };
  mockFactory.start.mockClear().mockReturnValueOnce(first).mockReturnValueOnce(second);
  mockFactory.getInstances.mockReset()
    .mockReturnValueOnce([])
    .mockReturnValueOnce([first])
    .mockReturnValueOnce([first, second])
    .mockReturnValueOnce([first, second])
    .mockReturnValue([second]);
  await syncAutoApplyActivity({ id: 'chevron', state: 'needs_input', version: 2, title: 'Chevron Internship' });
  await syncAutoApplyActivity({ id: 'mastercard', state: 'queued', version: 1, title: 'Mastercard Scholarship' });
  expect(mockFactory.start).toHaveBeenNthCalledWith(1,
    { title: 'Chevron Internship', status: 'Your input is needed', actionRequired: true },
    'edutu://auto-apply/chevron');
  expect(mockFactory.start).toHaveBeenNthCalledWith(2,
    { title: 'Mastercard Scholarship', status: 'Waiting to start', actionRequired: false },
    'edutu://auto-apply/mastercard');
  expect(first.end).not.toHaveBeenCalled();
  await syncAutoApplyActivity({ id: 'chevron', state: 'running', version: 1 });
  expect(first.update).not.toHaveBeenCalled();
  await syncAutoApplyActivity({ id: 'mastercard', state: 'needs_review', version: 4, activityAction: 'correction' });
  expect(second.update).toHaveBeenCalledWith({ title: 'Mastercard Scholarship', status: 'Correct your draft', actionRequired: true });
  await syncAutoApplyActivity({ id: 'chevron', state: 'submitted', version: 3 });
  expect(first.end).toHaveBeenCalledWith('immediate', { title: 'Chevron Internship', status: 'Submitted', actionRequired: false });
  expect(second.end).not.toHaveBeenCalled();
  await syncAutoApplyActivityOwner('other-learner');
  expect(second.end).toHaveBeenCalledWith('immediate');
  expect(await AsyncStorage.getItem('edutu-auto-apply-activity-v1')).toBeNull();
});

test('ends an iOS activity when registration returns a newer terminal state', async () => {
  await AsyncStorage.clear();
  const attemptId = 'late-registration';
  const instance = { ...mockInstance, getId: () => 'late-activity', end: jest.fn(),
    getPushToken: jest.fn(async (): Promise<string | null> => 'fixture-token') };
  mockFactory.getInstances.mockReset().mockReturnValueOnce([]).mockReturnValue([instance]);
  mockFactory.start.mockReturnValueOnce(instance);
  jest.mocked(requestProductApi).mockResolvedValueOnce({
    updated: false, progress: { id: attemptId, state: 'submitted', version: 4 },
  });
  await syncAutoApplyActivity({ id: attemptId, state: 'running', version: 2, title: 'Example Fellowship' });
  await waitFor(() => expect(instance.end).toHaveBeenCalledWith('immediate', {
    status: 'Submitted', actionRequired: false, title: 'Example Fellowship',
  }));
  expect(requestProductApi).toHaveBeenCalledWith('/me/auto-apply/attempts/' + attemptId + '/activity', {
    method: 'PUT', body: JSON.stringify({ activityId: 'late-activity', token: 'fixture-token' }),
  });
});

test('ignores a late mobile launch after the active account changes', async () => {
  await AsyncStorage.clear();
  await syncAutoApplyActivityOwner('current-owner');
  const starts = mockFactory.start.mock.calls.length;
  await syncAutoApplyActivity({ id: 'previous-account', state: 'queued', version: 1 }, { owner: 'old-owner' });
  expect(mockFactory.start).toHaveBeenCalledTimes(starts);
});

test('recovers a missed completion when Edutu returns to the foreground', async () => {
  await AsyncStorage.clear();
  const id = 'offline-attempt';
  const instance = { ...mockInstance, getId: () => 'offline-activity', end: jest.fn() };
  mockFactory.getInstances.mockReset().mockReturnValueOnce([]).mockReturnValue([instance]);
  mockFactory.start.mockReturnValueOnce(instance);
  await syncAutoApplyActivity({ id, state: 'running', version: 2, title: 'Example Fellowship' });
  const api = jest.mocked(requestProductApi);
  api.mockRejectedValueOnce(new Error('Offline'))
    .mockResolvedValueOnce({ id, state: 'submitted', version: 4 });
  const getToken = async () => 'fixture-auth';
  const { signal } = new AbortController();
  await refreshAutoApplyActivity(getToken, signal);
  expect(instance.end).not.toHaveBeenCalled();
  await refreshAutoApplyActivity(getToken, signal);
  expect(api).toHaveBeenLastCalledWith('/me/auto-apply/attempts/' + id, { signal }, getToken, undefined, { throwOnError: true });
  expect(instance.end).toHaveBeenCalledWith('immediate', {
    title: 'Example Fellowship', status: 'Submitted', actionRequired: false,
  });
  api.mockClear();
  await refreshAutoApplyActivity(getToken, signal);
  expect(api).not.toHaveBeenCalled();
});

test('dismisses an iOS card after a confirmed missing attempt and keeps it during authorization errors', async () => {
  await AsyncStorage.clear();
  const id = 'removed-attempt';
  const instance = { ...mockInstance, getId: () => 'removed-activity', end: jest.fn() };
  mockFactory.getInstances.mockReset().mockReturnValueOnce([]).mockReturnValue([instance]);
  mockFactory.start.mockReturnValueOnce(instance);
  await syncAutoApplyActivity({ id, state: 'needs_input', version: 2 });
  const api = jest.mocked(requestProductApi);
  api.mockRejectedValueOnce(new ProductApiRequestError('http', 401))
    .mockRejectedValueOnce(new ProductApiRequestError('http', 404));
  const token = async () => 'fixture-auth';
  const { signal } = new AbortController();
  await refreshAutoApplyActivity(token, signal);
  expect(instance.end).not.toHaveBeenCalled();
  await refreshAutoApplyActivity(token, signal);
  expect(instance.end).toHaveBeenCalledWith('immediate');
  api.mockClear();
  await refreshAutoApplyActivity(token, signal);
  expect(api).not.toHaveBeenCalled();
});

test('ignores a foreground status response after the user session is disposed', async () => {
  await AsyncStorage.clear();
  const id = 'disposed-attempt';
  const instance = { ...mockInstance, getId: () => 'disposed-activity', end: jest.fn() };
  mockFactory.getInstances.mockReset().mockReturnValueOnce([]).mockReturnValue([instance]);
  mockFactory.start.mockReturnValueOnce(instance);
  await syncAutoApplyActivity({ id, state: 'running', version: 2 });
  const session = new AbortController();
  jest.mocked(requestProductApi).mockImplementationOnce(async () => {
    session.abort();
    return { id, state: 'submitted', version: 4 } as never;
  });
  await refreshAutoApplyActivity(async () => 'fixture-auth', session.signal);
  expect(instance.end).not.toHaveBeenCalled();
});
