import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { openTrackedApplication } from '@edutu/core/src/services/applications';
import { ProductApiRequestError, requestProductApi } from '@edutu/core/src/services/productApi';
import { AutoApplyAction } from '../components/opportunity/AutoApplyAction';
import { applicationCvKey, saveApplicationCvSelection } from '../components/opportunity/applicationCvSelection';
import ApplicationProfileScreen from '../app/(app)/profile/application';
import { syncAutoApplyActivity } from '../lib/autoApplyActivity';
jest.mock('../lib/autoApplyActivity', () => ({ syncAutoApplyActivity: jest.fn() }));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));
jest.mock('../components/context/ThemeContext', () => ({ useTheme: () => ({ colors: {} }) }));
jest.mock('@edutu/core/src/services/applications', () => ({ openTrackedApplication: jest.fn() }));
jest.mock('@edutu/core/src/services/productApi', () => ({
  requestProductApi: jest.fn(),
  ProductApiRequestError: jest.requireActual('@edutu/core/src/services/productApi').ProductApiRequestError,
}));

const request = jest.mocked(requestProductApi);
const track = jest.mocked(openTrackedApplication);
const getToken = async () => 'test-token';

beforeEach(() => {
  request.mockReset();
  track.mockReset();
  mockPush.mockReset();
  jest.mocked(syncAutoApplyActivity).mockClear();
});

test('starts from the tracked draft and opens the new attempt', async () => {
  request.mockResolvedValueOnce({ available: true, attempt: null })
    .mockResolvedValueOnce({ id: 'attempt', state: 'running', version: 2 });
  track.mockResolvedValueOnce({ id: 'draft', status: 'draft', version: 1 });
  const screen = render(<AutoApplyAction opportunityId="opportunity" userId="learner" getToken={getToken} />);
  fireEvent.press(await screen.findByText('Auto Apply with Edutu'));
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith({ pathname: '/(app)/auto-apply/[id]', params: { id: 'attempt' } }));
  expect(track).toHaveBeenCalledWith('opportunity', getToken);
  expect(request.mock.calls[1]?.slice(0, 2)).toEqual(['/me/auto-apply/applications/draft', { method: 'POST' }]);
  expect(syncAutoApplyActivity).toHaveBeenCalledWith({ id: 'attempt', state: 'running', version: 2 }, { owner: 'learner' });
  expect(jest.mocked(syncAutoApplyActivity).mock.invocationCallOrder[0]).toBeLessThan(mockPush.mock.invocationCallOrder[0]);
});

test('leaves navigation alone when a start finishes after the learner leaves the opportunity', async () => {
  let complete: (value: unknown) => void = () => {};
  request.mockResolvedValueOnce({ available: true, attempt: null })
    .mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
  track.mockResolvedValueOnce({ id: 'draft', status: 'draft', version: 1 });
  const screen = render(<AutoApplyAction opportunityId="opportunity" userId="learner" getToken={getToken} />);
  fireEvent.press(await screen.findByText('Auto Apply with Edutu'));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  expect(screen.getByRole('button', { name: 'Starting…' })).toBeDisabled();
  screen.unmount();
  await act(async () => complete({ id: 'attempt', state: 'running', version: 2 }));
  expect(mockPush).not.toHaveBeenCalled();
  expect(syncAutoApplyActivity).toHaveBeenCalledWith({ id: 'attempt', state: 'running', version: 2 }, { owner: 'learner' });
});

test('opens Auto Apply when the same opportunity refreshes its auth callback during a start', async () => {
  let complete: (value: unknown) => void = () => {};
  request.mockResolvedValueOnce({ available: true, attempt: null })
    .mockReturnValueOnce(new Promise(resolve => { complete = resolve; }))
    .mockResolvedValueOnce({ available: true, attempt: null });
  track.mockResolvedValueOnce({ id: 'draft', status: 'draft', version: 1 });
  const screen = render(<AutoApplyAction opportunityId="opportunity" userId="learner" getToken={getToken} />);
  fireEvent.press(await screen.findByText('Auto Apply with Edutu'));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  screen.rerender(<AutoApplyAction opportunityId="opportunity" userId="learner" getToken={async () => 'refreshed-token'} />);
  await act(async () => complete({ id: 'attempt', state: 'queued', version: 1 }));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/(app)/auto-apply/[id]', params: { id: 'attempt' } });
});

test('tells the learner when the provider form check stops Auto Apply before opening an attempt', async () => {
  request.mockResolvedValueOnce({ available: true, attempt: null })
    .mockRejectedValueOnce(new ProductApiRequestError('http', 503))
    .mockResolvedValueOnce({ available: true, attempt: null });
  track.mockResolvedValueOnce({ id: 'draft', status: 'draft', version: 1 });
  const screen = render(<AutoApplyAction opportunityId="opportunity" userId="learner" getToken={getToken} />);
  fireEvent.press(await screen.findByText('Auto Apply with Edutu'));
  expect(await screen.findByText('Auto Apply could not check the provider’s form. Try again shortly.')).toBeTruthy();
  expect(mockPush).not.toHaveBeenCalled();
  expect(syncAutoApplyActivity).not.toHaveBeenCalled();
});

test('opens the recorded attempt when the start response times out', async () => {
  request.mockResolvedValueOnce({ available: true, attempt: null })
    .mockRejectedValueOnce(new Error('Timed out'))
    .mockResolvedValueOnce({ available: true, attempt: { id: 'existing', state: 'running', version: 2 } });
  track.mockResolvedValueOnce({ id: 'draft', status: 'draft', version: 1 });
  const screen = render(<AutoApplyAction opportunityId="opportunity" userId="learner" getToken={getToken} />);
  fireEvent.press(await screen.findByText('Auto Apply with Edutu'));
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith({
    pathname: '/(app)/auto-apply/[id]', params: { id: 'existing' },
  }));
  expect(request.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
});

test('preserves access to existing attempts after the pilot is disabled', async () => {
  request.mockResolvedValueOnce({ available: false, attempt: { id: 'attempt', state: 'needs_input', version: 2 } });
  const screen = render(<AutoApplyAction opportunityId="opportunity" userId="learner" getToken={getToken} />);
  expect(await screen.findByText('Your input is needed')).toBeTruthy();
  expect(screen.queryByText('Auto Apply with Edutu')).toBeNull();
});

test('opens the saved application profile without starting an attempt', async () => {
  request.mockResolvedValueOnce({ available: true, profileRequired: false, attempt: null });
  const screen = render(<AutoApplyAction opportunityId="opportunity" userId="learner" getToken={getToken} />);
  fireEvent.press(await screen.findByText('Edit application profile'));
  expect(mockPush).toHaveBeenCalledWith('/profile/application');
  expect(track).not.toHaveBeenCalled();
});

test('edits saved details for later applications without creating a new attempt', async () => {
  request.mockResolvedValueOnce({
    background: 'Studying engineering', statement: '', version: 2,
    contact: { name: 'Example Learner', email: 'old@example.test' },
  }).mockResolvedValueOnce({ version: 3 });
  const screen = render(<ApplicationProfileScreen />);
  expect(await screen.findByDisplayValue('old@example.test')).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText('Application email'), 'new@example.test');
  fireEvent.changeText(screen.getByLabelText('Application phone number'), '12');
  fireEvent.press(screen.getByText('Save for future applications'));
  expect(await screen.findByText('Enter a phone number with 7 to 15 digits or leave it blank.')).toBeTruthy();
  expect(request).toHaveBeenCalledTimes(1);
  fireEvent.changeText(screen.getByLabelText('Application phone number'), '+1 202 555 0100');
  fireEvent.press(screen.getByText('Save for future applications'));
  expect(await screen.findByText('Application profile saved.')).toBeTruthy();
  expect(request.mock.calls[1]?.slice(0, 2)).toEqual(['/me/auto-apply/profile', {
    method: 'PUT',
    body: JSON.stringify({
      background: 'Studying engineering', statement: '', version: 2,
      contact: { name: 'Example Learner', email: 'new@example.test', phone: '+1 202 555 0100' },
    }),
  }]);
  expect(track).not.toHaveBeenCalled();
});

test('uses the provider’s manual application path for an applicant-only listing', async () => {
  request.mockResolvedValueOnce({ available: false, applicantOnly: true, attempt: null });
  const screen = render(<AutoApplyAction opportunityId="opportunity" userId="learner" getToken={getToken} />);
  expect(await screen.findByText(/complete and submit your own application/)).toBeTruthy();
  expect(screen.queryByText('Auto Apply with Edutu')).toBeNull();
  expect(track).not.toHaveBeenCalled();
});

test('explains a temporary provider outage without starting an application', async () => {
  request.mockResolvedValueOnce({ available: false, providerUnavailable: true, attempt: null });
  const screen = render(<AutoApplyAction opportunityId="opportunity" userId="learner" getToken={getToken} />);
  expect(await screen.findByText(/Use Apply Now to continue/)).toBeTruthy();
  expect(screen.queryByText('Auto Apply with Edutu')).toBeNull();
  expect(track).not.toHaveBeenCalled();
});

test.each([
  ['workday_sign_in', /sign in to Workday/],
  ['itu_provider_form', /AI disclosure and consent/],
])('shows %s guidance without creating an attempt', async (manualApplication, message) => {
  request.mockResolvedValueOnce({ available: false, manualApplication, attempt: null });
  const screen = render(<AutoApplyAction opportunityId="opportunity" userId="learner" getToken={getToken} />);
  expect(await screen.findByText(message)).toBeTruthy();
  expect(screen.queryByText('Auto Apply with Edutu')).toBeNull();
  expect(track).not.toHaveBeenCalled();
});

test('prefills Edutu profile details and saves the learner’s changes before creating the first attempt', async () => {
  request.mockResolvedValueOnce({ available: true, attempt: null, profileRequired: true })
    .mockResolvedValueOnce({ background: '', statement: '', version: 0, suggestedBackground: 'School: Example University',
      contact: { name: 'Example Learner', email: 'learner@example.test' } })
    .mockResolvedValueOnce({ version: 1 })
    .mockResolvedValueOnce({ id: 'attempt' });
  track.mockResolvedValueOnce({ id: 'draft', status: 'draft', version: 1 });
  const screen = render(<AutoApplyAction opportunityId="opportunity" userId="learner" getToken={getToken} />);
  fireEvent.press(await screen.findByText('Auto Apply with Edutu'));
  expect(await screen.findByDisplayValue('School: Example University')).toBeTruthy();
  expect(request.mock.calls[1]?.[0]).toBe('/me/auto-apply/profile?includeSavedDetails=true');
  expect(screen.getByText(/saved details from your Edutu profile/)).toBeTruthy();
  expect(screen.getByDisplayValue('Example Learner')).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText('Application email'), 'invalid-address');
  fireEvent.changeText(screen.getByLabelText('Education, experience and achievements'), 'Studying engineering');
  fireEvent.press(screen.getByText('Save and start Auto Apply'));
  expect(await screen.findByText('Enter a valid application email or leave it blank.')).toBeTruthy();
  expect(track).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByLabelText('Application email'), 'updated@example.test');
  fireEvent.press(screen.getByText('Save and start Auto Apply'));
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith({ pathname: '/(app)/auto-apply/[id]', params: { id: 'attempt' } }));
  expect(request.mock.calls[2]?.slice(0, 2)).toEqual(['/me/auto-apply/profile', {
    method: 'PUT', body: JSON.stringify({ background: 'Studying engineering', statement: '', version: 0,
      contact: { name: 'Example Learner', email: 'updated@example.test' } }),
  }]);
});

test('includes the learner’s CV selection in the start request', async () => {
  const storageKey = 'application-cv:["learner","opportunity"]';
  await AsyncStorage.setItem(storageKey, 'chosen-cv');
  try {
    request.mockResolvedValueOnce({ available: true, attempt: null })
      .mockResolvedValueOnce([{ id: 'chosen-cv', name: 'Academic CV' }])
      .mockResolvedValueOnce({ id: 'attempt' });
    track.mockResolvedValueOnce({ id: 'draft', status: 'draft', version: 1 });
    const screen = render(<AutoApplyAction opportunityId="opportunity" userId="learner" getToken={getToken} />);
    expect(await screen.findByRole('button', { name: 'Change CV · Academic CV' })).toBeTruthy();
    fireEvent.press(await screen.findByText('Auto Apply with Edutu'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith({ pathname: '/(app)/auto-apply/[id]', params: { id: 'attempt' } }));
    expect(request.mock.calls[2]?.slice(0, 2)).toEqual(['/me/auto-apply/applications/draft', {
      method: 'POST', body: JSON.stringify({ cvId: 'chosen-cv' }),
    }]);
  } finally {
    await AsyncStorage.removeItem(storageKey);
  }
});

test('loads saved CV names on demand and starts with the one chosen from the opportunity', async () => {
  const key = 'application-cv:["learner","opportunity"]';
  request.mockResolvedValueOnce({ available: true, attempt: null })
    .mockResolvedValueOnce([{ id: 'research', name: 'Research CV' }, { id: 'industry', name: 'Industry CV' }])
    .mockResolvedValueOnce({ id: 'attempt' });
  track.mockResolvedValueOnce({ id: 'draft', status: 'draft', version: 1 });
  try {
    const screen = render(<AutoApplyAction opportunityId="opportunity" userId="learner" getToken={getToken} />);
    const choose = await screen.findByText('Choose a CV');
    expect(request).toHaveBeenCalledTimes(1);
    fireEvent.press(choose);
    fireEvent.press(await screen.findByRole('radio', { name: 'Industry CV' }));
    await screen.findByText('CV selected for this application.');
    expect(screen.getByRole('button', { name: 'Change CV · Industry CV' })).toBeTruthy();
    expect(await AsyncStorage.getItem(key)).toBe('industry');
    fireEvent.press(screen.getByText('Auto Apply with Edutu'));
    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    expect(request.mock.calls[2]?.slice(0, 2)).toEqual(['/me/auto-apply/applications/draft', {
      method: 'POST', body: JSON.stringify({ cvId: 'industry' }),
    }]);
  } finally {
    await AsyncStorage.removeItem(key);
  }
});

test('shows a CV selected in application details without loading the full CV list again', async () => {
  const key = applicationCvKey('learner', 'opportunity');
  try {
    request.mockResolvedValueOnce({ available: true, attempt: null });
    const screen = render(<AutoApplyAction opportunityId="opportunity" userId="learner" getToken={getToken} />);
    expect(await screen.findByRole('button', { name: 'Choose a CV' })).toBeTruthy();
    await act(async () => saveApplicationCvSelection(key, { id: 'research', name: 'Research CV' }));
    expect(screen.getByRole('button', { name: 'Change CV · Research CV' })).toBeTruthy();
    expect(request).toHaveBeenCalledTimes(1);
    await act(async () => saveApplicationCvSelection(key, null));
    expect(screen.getByRole('button', { name: 'Choose a CV' })).toBeTruthy();
  } finally {
    await AsyncStorage.removeItem(key);
  }
});

test.each([false, true])('resumes the same draft after fixing a missing CV selection (replacement=%s)', async replace => {
  const key = 'application-cv:["learner","opportunity"]';
  await AsyncStorage.setItem(key, 'deleted-cv');
  const replacement = { id: 'replacement-cv', name: 'Research CV' };
  const available = { available: true, attempt: null };
  request.mockResolvedValueOnce(available)
    .mockResolvedValueOnce([])
    .mockRejectedValueOnce(new ProductApiRequestError('http', 404))
    .mockResolvedValueOnce(available).mockResolvedValueOnce(replace ? [replacement] : []).mockResolvedValueOnce({ id: 'attempt' });
  track.mockResolvedValue({ id: 'draft', status: 'draft', version: 1 });
  try {
    const screen = render(<AutoApplyAction opportunityId="opportunity" userId="learner" getToken={getToken} />);
    await screen.findByRole('button', { name: 'Review selected CV' });
    fireEvent.press(await screen.findByText('Auto Apply with Edutu'));
    await screen.findByText('The previously selected CV is unavailable.');
    fireEvent.press(screen.getByRole('button', { name: replace ? 'Start with Research CV' : 'Start without a CV' }));
    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    expect(await AsyncStorage.getItem(key)).toBe(replace ? replacement.id : null);
    expect(track).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[5]?.slice(0, 2)).toEqual(['/me/auto-apply/applications/draft', { method: 'POST', ...(replace ? { body: JSON.stringify({ cvId: replacement.id }) } : {}) }]);
  } finally {
    await AsyncStorage.removeItem(key);
  }
});

test('shows exhaustion and offers only the configured higher plans', async () => {
  request.mockResolvedValueOnce({
    available: true, attempt: null, profileRequired: true,
    allowance: { monthlyLimit: 3, used: 3, resetAt: '2026-12-01T00:00:00.000Z',
      upgradeOptions: [{ tier: 'pro', monthlyLimit: 8 }] },
  });
  const screen = render(<AutoApplyAction opportunityId="opportunity" userId="learner" getToken={getToken} />);
  expect(await screen.findByText('Monthly Auto Apply limit reached')).toBeTruthy();
  expect(screen.getByText('Pro includes 8 per month')).toBeTruthy();
  expect(screen.queryByText('Auto Apply with Edutu')).toBeNull();
  fireEvent.press(screen.getByText('View plans'));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/paywall', params: { source: 'auto-apply' } });
  expect(track).not.toHaveBeenCalled();
});

test('shows remaining attempts before a learner starts', async () => {
  request.mockResolvedValueOnce({
    available: true, attempt: null,
    allowance: { monthlyLimit: 3, used: 1, resetAt: '2026-12-01T00:00:00.000Z', upgradeOptions: [] },
  });
  const screen = render(<AutoApplyAction opportunityId="opportunity" userId="learner" getToken={getToken} />);
  expect(await screen.findByText('2 of 3 Auto Apply attempts left this month')).toBeTruthy();
  expect(screen.queryByText('View plans')).toBeNull();
});

test('rechecks an exhausted allowance and enables Auto Apply when an admin adds attempts', async () => {
  const initial = { available: true, profileRequired: false, attempt: null,
    allowance: { monthlyLimit: 3, used: 3, resetAt: '2026-12-01T00:00:00.000Z', upgradeOptions: [] } };
  request.mockResolvedValueOnce(initial).mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ ...initial, allowance: { ...initial.allowance, monthlyLimit: 6 } });
  const screen = render(<AutoApplyAction opportunityId="opportunity" userId="learner" getToken={getToken} />);
  fireEvent.press(await screen.findByRole('button', { name: 'Refresh allowance' }));
  expect(await screen.findByText('Could not check your allowance. Try again.')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Refresh allowance' }));
  expect(await screen.findByText('3 of 6 Auto Apply attempts left this month')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Auto Apply with Edutu' })).toBeEnabled();
  expect(track).not.toHaveBeenCalled();
});
