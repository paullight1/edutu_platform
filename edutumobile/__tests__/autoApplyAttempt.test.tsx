import React from 'react';
import { Alert, AppState, Linking } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { ProductApiRequestError, requestProductApi } from '@edutu/core/src/services/productApi';
import { getDocumentAsync } from 'expo-document-picker';
import { File } from 'expo-file-system';
import { shareAsync } from 'expo-sharing';
import * as SecureStore from 'expo-secure-store';
import { addNotificationReceivedListener, type Notification } from 'expo-notifications';
import AutoApplyAttempt from '../app/(app)/auto-apply/[id]';
import { syncAutoApplyActivity } from '../lib/autoApplyActivity';

jest.mock('../lib/autoApplyActivity', () => ({ syncAutoApplyActivity: jest.fn() }));

let mockNotice: string | undefined;
let mockAttemptId = 'attempt';
let mockOwner = 'learner';
jest.mock('@clerk/clerk-expo', () => ({ useAuth: () => ({ userId: mockOwner }) }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useLocalSearchParams: () => ({ id: mockAttemptId, notice: mockNotice }),
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));
jest.mock('../components/ui/ScreenHeader', () => ({ ScreenHeader: () => null }));
jest.mock('../components/context/ThemeContext', () => ({ useTheme: () => ({ colors: {} }) }));
jest.mock('@edutu/core/src/services/productApi', () => ({
  ...jest.requireActual('@edutu/core/src/services/productApi'),
  requestProductApi: jest.fn(),
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));

beforeEach(() => {
  jest.mocked(requestProductApi).mockReset();
  mockNotice = undefined;
  mockAttemptId = 'attempt';
  mockOwner = 'learner';
  jest.mocked(syncAutoApplyActivity).mockClear();
});

test('removes the previous learner’s review and ignores its late refresh on an account switch', async () => {
  const request = jest.mocked(requestProductApi);
  let resolveOld: (value: unknown) => void = () => {};
  request.mockResolvedValueOnce({ id: 'attempt', state: 'needs_review', version: 5, title: 'First learner listing',
    review: [{ label: 'Statement', value: 'Private statement for the first learner' }] })
    .mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }))
    .mockResolvedValueOnce({ id: 'attempt', state: 'needs_input', version: 2, title: 'Second learner listing', question: 'Enter your degree.' });
  const screen = render(<AutoApplyAttempt />);
  expect(await screen.findByText('Private statement for the first learner')).toBeTruthy();
  expect(syncAutoApplyActivity).toHaveBeenCalledWith(expect.objectContaining({ version: 5 }), { owner: 'learner' });
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Refresh status' })));
  const oldSignal = request.mock.calls[1]?.[1]?.signal;
  mockOwner = 'another-learner';
  screen.rerender(<AutoApplyAttempt />);
  expect(oldSignal?.aborted).toBe(true);
  expect(screen.queryByText('Private statement for the first learner')).toBeNull();
  await act(async () => resolveOld({ id: 'attempt', state: 'needs_review', version: 6, title: 'Stale listing' }));
  expect(await screen.findByText('Enter your degree.')).toBeTruthy();
  expect(syncAutoApplyActivity).toHaveBeenLastCalledWith(expect.objectContaining({ version: 2 }), { owner: 'another-learner' });
  expect(syncAutoApplyActivity).not.toHaveBeenCalledWith(expect.objectContaining({ version: 6 }), expect.anything());
});

test('retries an interrupted AI statement draft only after the learner chooses it', async () => {
  const request = jest.mocked(requestProductApi);
  request.mockResolvedValueOnce({ id: 'attempt', state: 'needs_input', version: 3,
    question: 'Why are you applying?', statementRequested: true, statementRetryAvailable: true })
    .mockResolvedValueOnce({ id: 'attempt' })
    .mockResolvedValueOnce({ id: 'attempt', state: 'needs_review', version: 6,
      review: [{ label: 'Statement of purpose', value: 'A draft for the learner to review.' }] });
  const screen = render(<AutoApplyAttempt />);
  const reply = await screen.findByLabelText('Your statement of purpose');
  fireEvent.changeText(reply, 'I have started writing.');
  expect(screen.queryByRole('button', { name: 'Try drafting again' })).toBeNull();
  fireEvent.changeText(reply, '');
  fireEvent.press(screen.getByRole('button', { name: 'Try drafting again' }));
  expect(await screen.findByText('A draft for the learner to review.')).toBeTruthy();
  expect(request).toHaveBeenNthCalledWith(2, '/me/auto-apply/attempts/attempt/retry-statement',
    { method: 'POST', body: JSON.stringify({ version: 3 }) });
});

test('shows a manual statement limit and preserves the draft until it fits', async () => {
  const request = jest.mocked(requestProductApi);
  request.mockResolvedValueOnce({
    id: 'attempt', state: 'needs_input', version: 2, question: 'Provide a statement of purpose.', answerMaxLength: 3, statementRequested: true,
  }).mockResolvedValueOnce({ id: 'attempt' })
    .mockResolvedValueOnce({ id: 'attempt', state: 'queued', version: 3 });
  const screen = render(<AutoApplyAttempt />);
  const input = await screen.findByLabelText('Your statement of purpose');
  fireEvent.changeText(input, '🙂🙂');
  expect(screen.getByText('Shorten your answer to 3 characters. 4 entered.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Save statement and continue' })).toBeDisabled();
  expect(input).toHaveProp('value', '🙂🙂');
  fireEvent.changeText(input, '🙂a');
  expect(screen.getByText('3 of 3 characters used')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Save statement and continue' }));
  expect(await screen.findByText('Waiting to start')).toBeTruthy();
  expect(request).toHaveBeenNthCalledWith(2, '/me/auto-apply/attempts/attempt/answer', {
    method: 'POST', body: JSON.stringify({ answer: '🙂a', version: 2 }),
  });
});

test('explains an automatic provider retry and a restored monthly run', async () => {
  const request = jest.mocked(requestProductApi);
  request.mockResolvedValue({ id: 'attempt', state: 'running', version: 2, waitingForProvider: true });
  const screen = render(<AutoApplyAttempt />);
  expect(await screen.findByText('Waiting to retry the provider')).toBeTruthy();
  expect(screen.getByText('Edutu will try again automatically. Your progress is saved, and you can leave this screen.')).toBeTruthy();

  request.mockResolvedValue({ id: 'attempt', state: 'failed', version: 3, allowanceRestored: true, canRetry: true });
  fireEvent.press(screen.getByText('Refresh status'));
  expect(await screen.findByText(/Edutu restored this run to your monthly allowance/)).toBeTruthy();
  expect(screen.getByText('Retry preparation')).toBeTruthy();
});

test('pauses preparation and resumes the same attempt at its latest version', async () => {
  const request = jest.mocked(requestProductApi);
  const running = { id: 'attempt', state: 'running', version: 2, canPause: true };
  const paused = { id: 'attempt', state: 'paused', version: 3, canResume: true };
  const queued = { id: 'attempt', state: 'queued', version: 4 };
  request.mockResolvedValueOnce(running)
    .mockResolvedValueOnce(paused)
    .mockResolvedValueOnce(paused)
    .mockResolvedValueOnce(queued)
    .mockResolvedValue(queued);
  const screen = render(<AutoApplyAttempt />);
  fireEvent.press(await screen.findByRole('button', { name: 'Pause Auto Apply' }));
  fireEvent.press(await screen.findByRole('button', { name: 'Resume Auto Apply' }));
  expect(await screen.findByText('Waiting to start')).toBeTruthy();
  const controls = request.mock.calls.filter(([path]) => path.endsWith('/control'));
  expect(controls.map(([, options]) => JSON.parse(String(options?.body)))).toEqual([
    { action: 'pause', version: 2 },
    { action: 'resume', version: 3 },
  ]);
});

test('shows the current step and keeps a waiting question actionable', async () => {
  const request = jest.mocked(requestProductApi);
  request.mockResolvedValueOnce({ id: 'attempt', state: 'needs_input', version: 2, question: 'What year are you in?' })
    .mockResolvedValueOnce({ id: 'attempt' })
    .mockResolvedValue({ id: 'attempt', state: 'needs_review', version: 4 });
  const screen = render(<AutoApplyAttempt />);
  expect(await screen.findByRole('progressbar', { value: { text: 'Step 1 of 3, Prepare' } })).toBeTruthy();
  expect(screen.getByText('Edutu is waiting for your input before continuing.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Pause Auto Apply' })).toBeNull();
  const send = screen.getByRole('button', { name: 'Send answer and continue' });
  expect(send).toBeDisabled();
  fireEvent.changeText(screen.getByLabelText('Your answer'), 'Third year');
  fireEvent.press(send);
  expect(await screen.findByRole('progressbar', { value: { text: 'Step 2 of 3, Review' } })).toBeTruthy();
});

test('pauses the current version if the worker claimed the attempt during the tap', async () => {
  const request = jest.mocked(requestProductApi);
  const paused = { id: 'attempt', state: 'paused', version: 4, canResume: true };
  request.mockResolvedValueOnce({ id: 'attempt', state: 'queued', version: 2, canPause: true })
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ id: 'attempt', state: 'running', version: 3, canPause: true })
    .mockResolvedValueOnce(paused)
    .mockResolvedValue(paused);
  const screen = render(<AutoApplyAttempt />);
  fireEvent.press(await screen.findByRole('button', { name: 'Pause Auto Apply' }));
  expect(await screen.findByRole('button', { name: 'Resume Auto Apply' })).toBeEnabled();
  expect(request.mock.calls.filter(([path]) => path.endsWith('/control')).map(([, options]) =>
    JSON.parse(String(options?.body)))).toEqual([{ action: 'pause', version: 2 }, { action: 'pause', version: 3 }]);
});

test('marks cached progress after a refresh failure and restores the pause control after reconnecting', async () => {
  const request = jest.mocked(requestProductApi);
  const running = { id: 'attempt', state: 'running', version: 2, canPause: true };
  request.mockResolvedValueOnce(running).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(running);
  const screen = render(<AutoApplyAttempt />);
  expect(await screen.findByRole('button', { name: 'Pause Auto Apply' })).toBeEnabled();
  fireEvent.press(screen.getByRole('button', { name: 'Refresh status' }));
  expect(await screen.findByText('Last known status. Refresh to check for updates.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Pause Auto Apply' })).toBeDisabled();
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Refresh status' })));
  expect(screen.getByRole('button', { name: 'Pause Auto Apply' })).toBeEnabled();
});

test('offers a status retry without inventing progress or controls when the first load fails', async () => {
  const request = jest.mocked(requestProductApi);
  request.mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({ id: 'attempt', state: 'paused', version: 3, canResume: true });
  const screen = render(<AutoApplyAttempt />);
  expect(await screen.findByRole('header', { name: 'Could not load this attempt' })).toBeTruthy();
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Pause Auto Apply' })).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Refresh status' }));
  expect(await screen.findByRole('button', { name: 'Resume Auto Apply' })).toBeEnabled();
  expect(screen.getByRole('progressbar', { value: { text: 'Step 1 of 3, Prepare' } })).toBeTruthy();
});

test('reloads the same attempt once with a fresh token after an expired session', async () => {
  const request = jest.mocked(requestProductApi);
  request.mockRejectedValueOnce(new ProductApiRequestError('http', 401))
    .mockResolvedValueOnce({ id: 'attempt', state: 'needs_input', version: 3, question: 'What year are you in?' });
  const screen = render(<AutoApplyAttempt />);
  expect(await screen.findByText('What year are you in?')).toBeTruthy();
  expect(request).toHaveBeenCalledTimes(2);
  expect(request).toHaveBeenNthCalledWith(2, '/me/auto-apply/attempts/attempt', { signal: request.mock.calls[0][1]?.signal },
    undefined, undefined, { throwOnError: true, forceRefreshToken: true });
});

test('opens the current question and sends the answer with its version', async () => {
  const request = jest.mocked(requestProductApi);
  request.mockResolvedValueOnce({ id: 'attempt', state: 'needs_input', question: 'What is your field of study?', version: 2 })
    .mockResolvedValueOnce({ id: 'attempt' })
    .mockResolvedValueOnce({ id: 'attempt', state: 'queued', version: 3 });
  const screen = render(<AutoApplyAttempt />);
  expect(await screen.findByText('What is your field of study?')).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText('Your answer'), 'Engineering');
  fireEvent.press(screen.getByText('Send answer and continue'));
  expect(await screen.findByText('Waiting to start')).toBeTruthy();
  expect(request).toHaveBeenNthCalledWith(2, '/me/auto-apply/attempts/attempt/answer', {
    method: 'POST', body: JSON.stringify({ answer: 'Engineering', version: 2 }),
  });
});

test('restores an unsent answer only for the same learner and version, then clears it after sending', async () => {
  const request = jest.mocked(requestProductApi);
  const items = new Map<string, string>();
  const get = jest.mocked(SecureStore.getItemAsync);
  const set = jest.mocked(SecureStore.setItemAsync);
  const remove = jest.mocked(SecureStore.deleteItemAsync);
  get.mockImplementation(async key => items.get(key) ?? null);
  set.mockImplementation(async (key, value) => { items.set(key, value); });
  remove.mockImplementation(async key => { items.delete(key); });
  const attempt = { id: 'attempt', state: 'needs_input', version: 2, question: 'What do you study?' };
  try {
    request.mockResolvedValueOnce(attempt);
    const original = render(<AutoApplyAttempt />);
    fireEvent.changeText(await original.findByLabelText('Your answer'), 'Engineering');
    original.unmount();

    mockOwner = 'different-learner';
    request.mockResolvedValueOnce(attempt);
    const other = render(<AutoApplyAttempt />);
    expect(await other.findByLabelText('Your answer')).toHaveProp('value', '');
    other.unmount();

    mockOwner = 'learner';
    request.mockResolvedValueOnce(attempt)
      .mockResolvedValueOnce({ id: 'attempt' }).mockResolvedValueOnce({ id: 'attempt', state: 'queued', version: 3 });
    const reopened = render(<AutoApplyAttempt />);
    expect(await reopened.findByText('Draft restored from this device.')).toBeTruthy();
    expect(reopened.getByLabelText('Your answer')).toHaveProp('value', 'Engineering');
    expect(request.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0);
    fireEvent.press(reopened.getByRole('button', { name: 'Send answer and continue' }));
    expect(await reopened.findByText('Waiting to start')).toBeTruthy();
    await act(async () => {});
    expect(items.size).toBe(0);
    reopened.unmount();
  } finally {
    get.mockReset().mockResolvedValue(null);
    set.mockReset().mockResolvedValue(undefined);
    remove.mockReset().mockResolvedValue(undefined);
  }
});

test('shows the new question when the answer response times out after saving', async () => {
  const request = jest.mocked(requestProductApi);
  request.mockResolvedValueOnce({ id: 'attempt', state: 'needs_input', version: 2, question: 'What do you study?' })
    .mockRejectedValueOnce(new Error('Timed out'))
    .mockResolvedValueOnce({ id: 'attempt', state: 'needs_input', version: 4, question: 'Where do you study?' });
  const screen = render(<AutoApplyAttempt />);
  fireEvent.changeText(await screen.findByLabelText('Your answer'), 'Engineering');
  fireEvent.press(screen.getByRole('button', { name: 'Send answer and continue' }));
  expect(await screen.findByText('Where do you study?')).toBeTruthy();
  expect(screen.queryByText(/could not confirm the answer/i)).toBeNull();
  expect(request.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
});

test('keeps the answer draft available when the status still shows the same question', async () => {
  const request = jest.mocked(requestProductApi);
  const attempt = { id: 'attempt', state: 'needs_input', version: 2, question: 'What do you study?' };
  request.mockResolvedValueOnce(attempt).mockResolvedValueOnce(null).mockResolvedValueOnce(attempt);
  const screen = render(<AutoApplyAttempt />);
  fireEvent.changeText(await screen.findByLabelText('Your answer'), 'Engineering');
  fireEvent.press(screen.getByRole('button', { name: 'Send answer and continue' }));
  expect(await screen.findByText('Could not confirm the answer was saved. Your draft is still here.')).toBeTruthy();
  expect(screen.getByLabelText('Your answer')).toHaveProp('value', 'Engineering');
  expect(screen.getByRole('button', { name: 'Send answer and continue' })).toBeEnabled();
});

test('shows the receipt when the approval response is lost after submission', async () => {
  const request = jest.mocked(requestProductApi);
  request.mockResolvedValueOnce({ id: 'attempt', state: 'needs_review', version: 8, canSubmit: true })
    .mockRejectedValueOnce(new Error('Timed out'))
    .mockResolvedValueOnce({ id: 'attempt', state: 'submitted', version: 10, receipt: 'PROVIDER-2' });
  const screen = render(<AutoApplyAttempt />);
  fireEvent.press(await screen.findByRole('button', { name: 'Approve and submit with Edutu' }));
  expect(await screen.findByText('Provider receipt PROVIDER-2')).toBeTruthy();
  expect(screen.queryByText(/could not confirm approval/i)).toBeNull();
  expect(request.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
});

test('reloads the current question when another notification reaches an open attempt', async () => {
  mockNotice = '2';
  const request = jest.mocked(requestProductApi);
  request.mockResolvedValueOnce({ id: 'attempt', state: 'needs_input', question: 'What do you study?', version: 3 })
    .mockResolvedValueOnce({ id: 'attempt', state: 'needs_input', question: 'Where do you study?', version: 5 });
  const screen = render(<AutoApplyAttempt />);
  expect(await screen.findByText('What do you study?')).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText('Your answer'), 'Engineering');
  mockNotice = '4';
  screen.rerender(<AutoApplyAttempt />);
  expect(await screen.findByText('Where do you study?')).toBeTruthy();
  expect(screen.getByLabelText('Your answer').props.value).toBe('');
});

test('updates a paused attempt when its push arrives and ignores pushes for other attempts', async () => {
  mockAttemptId = 'a0000000-0000-4000-8000-000000000009';
  const request = jest.mocked(requestProductApi);
  request.mockResolvedValueOnce({ id: mockAttemptId, state: 'needs_input', question: 'What do you study?', version: 3 })
    .mockResolvedValueOnce({ id: mockAttemptId, state: 'needs_review', version: 4 });
  const screen = render(<AutoApplyAttempt />);
  expect(await screen.findByText('What do you study?')).toBeTruthy();
  const receive = jest.mocked(addNotificationReceivedListener).mock.lastCall?.[0];
  expect(receive).toBeDefined();
  const sendPush = (attemptId: string) => receive?.({
    request: { content: { data: { source: 'auto-apply-action', attemptId } } },
  } as Notification);
  act(() => { sendPush('a0000000-0000-4000-8000-000000000008'); });
  expect(request).toHaveBeenCalledTimes(1);
  act(() => { sendPush(mockAttemptId); });
  expect(await screen.findByText('Ready for review')).toBeTruthy();
  expect(request).toHaveBeenCalledTimes(2);
});

test('refreshes an unconfirmed attempt when a verified receipt alert arrives', async () => {
  mockAttemptId = 'a0000000-0000-4000-8000-000000000009';
  const id = mockAttemptId;
  const request = jest.mocked(requestProductApi);
  request.mockResolvedValueOnce({ id, state: 'unconfirmed', version: 4, canCheckReceipt: true })
    .mockResolvedValueOnce({ id, state: 'submitted', version: 5, receipt: 'PROVIDER-44' });
  const screen = render(<AutoApplyAttempt />);
  await screen.findByText('Submission unconfirmed');
  const receive = jest.mocked(addNotificationReceivedListener).mock.lastCall?.[0];
  expect(receive).toBeDefined();
  act(() => receive?.({ request: { content: { data: {
    source: 'application-status', status: 'submitted', submissionVerified: true, attemptId: id, attemptVersion: 5,
  } } } } as Notification));
  expect(await screen.findByText('Provider receipt PROVIDER-44')).toBeTruthy();
  expect(screen.queryByText('Check for a receipt')).toBeNull();
});

test('coalesces alerts received during a status request and loads the newer question', async () => {
  mockAttemptId = 'a0000000-0000-4000-8000-000000000009';
  const id = mockAttemptId;
  const request = jest.mocked(requestProductApi);
  let finishStatus: (value: unknown) => void = () => {};
  request.mockReturnValueOnce(new Promise(resolve => { finishStatus = resolve; }))
    .mockResolvedValueOnce({ id, state: 'needs_input', question: 'Which CV should we use?', version: 4 });
  const screen = render(<AutoApplyAttempt />);
  const receive = jest.mocked(addNotificationReceivedListener).mock.lastCall?.[0];
  expect(receive).toBeDefined();
  const push = { request: { content: { data: { source: 'auto-apply-action', attemptId: id } } } } as Notification;
  act(() => { receive?.(push); receive?.(push); });
  expect(request).toHaveBeenCalledTimes(1);
  await act(async () => {
    finishStatus({ id, state: 'needs_input', question: 'What do you study?', version: 3 });
  });
  expect(await screen.findByText('Which CV should we use?')).toBeTruthy();
  expect(request).toHaveBeenCalledTimes(2);
});

test('clears the previous question and draft when an alert opens another application', async () => {
  const request = jest.mocked(requestProductApi);
  let finishStatus: (value: unknown) => void = () => {};
  request.mockResolvedValueOnce({ id: 'attempt', state: 'needs_input', question: 'What do you study?', version: 3 })
    .mockReturnValueOnce(new Promise(resolve => { finishStatus = resolve; }));
  const screen = render(<AutoApplyAttempt />);
  fireEvent.changeText(await screen.findByLabelText('Your answer'), 'Engineering');
  mockAttemptId = 'different-attempt';
  mockNotice = '3';
  screen.rerender(<AutoApplyAttempt />);
  expect(screen.queryByText('What do you study?')).toBeNull();
  expect(screen.queryByText('Send answer and continue')).toBeNull();
  expect(request.mock.calls[1]?.[0]).toBe('/me/auto-apply/attempts/different-attempt');
  await act(async () => {
    finishStatus({ id: 'different-attempt', state: 'needs_input', question: 'Where do you study?', version: 3 });
  });
  expect(await screen.findByText('Where do you study?')).toBeTruthy();
  expect(screen.getByLabelText('Your answer').props.value).toBe('');
});

test('lets the learner choose a saved PDF for an attachment question', async () => {
  const request = jest.mocked(requestProductApi);
  request.mockResolvedValueOnce({ id: 'attempt', state: 'needs_input', version: 3,
    question: 'Choose a PDF for Institution letter.', attachmentRequired: true })
    .mockResolvedValueOnce([{ id: 'pdf', fileName: 'institution-letter.pdf', mimeType: 'application/pdf' },
      { id: 'note', fileName: 'notes.txt', mimeType: 'text/plain' }])
    .mockResolvedValueOnce({ id: 'attempt' })
    .mockResolvedValueOnce({ id: 'attempt', state: 'queued', version: 4 });
  const screen = render(<AutoApplyAttempt />);
  const pdf = await screen.findByRole('button', { name: 'institution-letter.pdf' });
  expect(screen.queryByText('notes.txt')).toBeNull();
  expect(screen.queryByLabelText('Your answer')).toBeNull();
  fireEvent.press(pdf);
  expect(await screen.findByText('Waiting to start')).toBeTruthy();
  expect(request).toHaveBeenNthCalledWith(3, '/me/auto-apply/attempts/attempt/attachment', {
    method: 'POST', body: JSON.stringify({ uploadId: 'pdf', version: 3 }),
  }, undefined, 12_000, { throwOnError: true });
});

test('keeps two document questions on the same attempt and shows both files for review', async () => {
  const request = jest.mocked(requestProductApi);
  const path = '/me/auto-apply/attempts/attempt';
  const pending = { id: 'attempt', state: 'needs_input', attachmentRequired: true };
  const documents = [
    { id: 'letter', fileName: 'letter.pdf', mimeType: 'application/pdf' },
    { id: 'transcript', fileName: 'transcript.pdf', mimeType: 'application/pdf' },
  ];
  request.mockResolvedValueOnce({ ...pending, version: 3, question: 'Choose an institution letter.' })
    .mockResolvedValueOnce(documents)
    .mockResolvedValueOnce({ id: 'attempt' })
    .mockResolvedValueOnce({ ...pending, version: 5, question: 'Choose your transcript.' })
    .mockResolvedValueOnce(documents)
    .mockResolvedValueOnce({ id: 'attempt' })
    .mockResolvedValueOnce({
      id: 'attempt', state: 'needs_review', version: 7,
      review: documents.map(({ id, fileName }) => ({
        label: id === 'letter' ? 'Institution letter' : 'Transcript',
        value: fileName, attachment: { type: 'pdf', uploadId: id },
      })),
    });
  const screen = render(<AutoApplyAttempt />);
  fireEvent.press(await screen.findByRole('button', { name: 'letter.pdf' }));
  expect(await screen.findByText('Choose your transcript.')).toBeTruthy();
  fireEvent.press(await screen.findByRole('button', { name: 'transcript.pdf' }));
  expect(await screen.findByText('Ready for review')).toBeTruthy();
  expect(screen.getByText('letter.pdf')).toBeTruthy();
  expect(screen.getByText('transcript.pdf')).toBeTruthy();
  expect(request.mock.calls.filter(([, options]) => options?.method === 'POST')).toEqual([
    [path + '/attachment', { method: 'POST', body: JSON.stringify({ uploadId: 'letter', version: 3 }) }, undefined, 12_000, { throwOnError: true }],
    [path + '/attachment', { method: 'POST', body: JSON.stringify({ uploadId: 'transcript', version: 5 }) }, undefined, 12_000, { throwOnError: true }],
  ]);
});

test('replaces one reviewed PDF and returns to the updated review before approval', async () => {
  const request = jest.mocked(requestProductApi);
  const path = '/me/auto-apply/attempts/attempt';
  const review = { id: 'attempt', state: 'needs_review', version: 7, canSubmit: true, review: [
    { label: 'Statement', value: 'My revised statement' },
    { label: 'Transcript', value: 'old.pdf', attachment: { type: 'pdf', uploadId: 'old' } },
    { label: 'Reference', value: 'letter.pdf', attachment: { type: 'pdf', uploadId: 'letter' } },
  ] };
  request.mockResolvedValueOnce(review)
    .mockResolvedValueOnce([{ id: 'new', fileName: 'updated.pdf', mimeType: 'application/pdf' }])
    .mockResolvedValueOnce({ id: 'attempt', version: 8 })
    .mockResolvedValueOnce({ ...review, version: 8, review: [
      review.review[0], { label: 'Transcript', value: 'updated.pdf', attachment: { type: 'pdf', uploadId: 'new' } }, review.review[2],
    ] });
  const screen = render(<AutoApplyAttempt />);
  fireEvent.press(await screen.findByRole('button', { name: 'Replace PDF for Transcript' }));
  expect(screen.queryByRole('button', { name: 'Approve and submit with Edutu' })).toBeNull();
  fireEvent.press(await screen.findByRole('button', { name: 'updated.pdf' }));
  expect(await screen.findByRole('link', { name: 'updated.pdf' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'letter.pdf' })).toBeTruthy();
  expect(screen.getByText('My revised statement')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Approve and submit with Edutu' })).toBeTruthy();
  expect(request.mock.calls.filter(([, options]) => options?.method === 'POST')).toEqual([
    [path + '/attachment', { method: 'POST', body: JSON.stringify({ uploadId: 'new', version: 7, fieldIndex: 1 }) },
      undefined, 12_000, { throwOnError: true }],
  ]);
});

test('explains a PDF size refusal and lets the learner restart document selection', async () => {
  const request = jest.mocked(requestProductApi);
  const path = '/me/auto-apply/attempts/attempt';
  request.mockResolvedValueOnce({ id: 'attempt', state: 'needs_input', version: 5, question: 'Choose your transcript.',
    attachmentRequired: true, attachmentBytesRemaining: 1024, canResetDocuments: true })
    .mockResolvedValueOnce([{ id: 'transcript', fileName: 'transcript.pdf', mimeType: 'application/pdf' }])
    .mockRejectedValueOnce(new ProductApiRequestError('http', 413))
    .mockResolvedValueOnce({ id: 'attempt', state: 'queued', version: 6 })
    .mockResolvedValueOnce({ id: 'attempt', state: 'queued', version: 6 });
  const confirm = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    buttons?.find(button => button.text === 'Choose again')?.onPress?.();
  });
  try {
    const screen = render(<AutoApplyAttempt />);
    fireEvent.press(await screen.findByRole('button', { name: 'transcript.pdf' }));
    expect(await screen.findByText(/This PDF exceeds the remaining space/)).toBeTruthy();
    expect(screen.getByText('1 KB remaining for supporting PDFs')).toBeTruthy();
    expect(screen.getByText('Choose your transcript.')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Start document selection again' }));
    expect(await screen.findByText('Waiting to start')).toBeTruthy();
    expect(request).toHaveBeenCalledWith(path + '/control', {
      method: 'POST', body: JSON.stringify({ action: 'reset_documents', version: 5 }),
    });
  } finally {
    confirm.mockRestore();
  }
});

test('lets the learner pick one of several saved CVs from the paused attempt', async () => {
  const request = jest.mocked(requestProductApi);
  const queued = { id: 'attempt', state: 'queued', version: 4 };
  request.mockResolvedValueOnce({
    id: 'attempt', state: 'needs_input', version: 3, question: 'Paste CV text.', cvRequested: true,
  }).mockResolvedValueOnce([{ id: 'academic', name: 'Academic CV' }, { id: 'industry', name: 'Industry CV' }])
    .mockResolvedValueOnce(queued).mockResolvedValueOnce(queued);
  const screen = render(<AutoApplyAttempt />);
  const academic = await screen.findByRole('button', { name: 'Use Academic CV' });
  expect(screen.getByRole('button', { name: 'Use Industry CV' })).toBeTruthy();
  expect(screen.queryByLabelText('Your answer')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Paste CV text instead' }));
  expect(screen.getByLabelText('Your answer')).toBeTruthy();
  fireEvent.press(academic);
  expect(await screen.findByText('Waiting to start')).toBeTruthy();
  expect(request).toHaveBeenNthCalledWith(3, '/me/auto-apply/attempts/attempt/cv', {
    method: 'POST', body: JSON.stringify({ cvId: 'academic', version: 3 }),
  });
});

test('uploads a device PDF before attaching it to the current question', async () => {
  const request = jest.mocked(requestProductApi);
  const append = jest.spyOn(FormData.prototype, 'append').mockImplementation(() => {});
  jest.mocked(getDocumentAsync).mockResolvedValueOnce({
    canceled: false,
    assets: [{ name: 'institution-letter.pdf', uri: 'file:///fixture/institution-letter.pdf', size: 100 }],
  });
  request.mockResolvedValueOnce({ id: 'attempt', state: 'needs_input', version: 3,
    question: 'Choose a PDF for Institution letter.', attachmentRequired: true })
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce({ uploadId: 'pdf' })
    .mockResolvedValueOnce({ id: 'attempt' })
    .mockResolvedValueOnce({ id: 'attempt', state: 'queued', version: 4 });
  try {
    const screen = render(<AutoApplyAttempt />);
    fireEvent.press(await screen.findByRole('button', { name: 'Upload a PDF' }));
    expect(await screen.findByText('Waiting to start')).toBeTruthy();
    expect(append).toHaveBeenCalledWith('file', expect.any(File));
    expect(append.mock.calls.find(([part]) => part === 'file')?.[1]).toMatchObject({
      name: 'institution-letter.pdf', type: 'application/pdf',
    });
    expect(request).toHaveBeenNthCalledWith(3, '/uploads/file',
      { method: 'POST', body: expect.any(FormData) }, undefined, 30_000);
    expect(request).toHaveBeenNthCalledWith(4, '/me/auto-apply/attempts/attempt/attachment', {
      method: 'POST', body: JSON.stringify({ uploadId: 'pdf', version: 3 }),
    }, undefined, 12_000, { throwOnError: true });
  } finally {
    append.mockRestore();
  }
});

test('uses the saved status when attaching a PDF succeeds but its response is lost', async () => {
  const request = jest.mocked(requestProductApi);
  request.mockResolvedValueOnce({ id: 'attempt', state: 'needs_input', version: 3,
    question: 'Choose a PDF for Institution letter.', attachmentRequired: true })
    .mockResolvedValueOnce([{ id: 'pdf', fileName: 'Letter.pdf', mimeType: 'application/pdf' }])
    .mockRejectedValueOnce(new Error('Timed out'))
    .mockResolvedValueOnce({ id: 'attempt', state: 'needs_review', version: 5 });
  const screen = render(<AutoApplyAttempt />);
  fireEvent.press(await screen.findByRole('button', { name: 'Letter.pdf' }));
  expect(await screen.findByText('Ready for review')).toBeTruthy();
  expect(screen.queryByText(/could not confirm the PDF/i)).toBeNull();
  expect(request.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
});

test('reloads saved documents after an uncertain upload without attaching a guessed file', async () => {
  const request = jest.mocked(requestProductApi);
  const append = jest.spyOn(FormData.prototype, 'append').mockImplementation(() => {});
  jest.mocked(getDocumentAsync).mockResolvedValueOnce({
    canceled: false,
    assets: [{ name: 'Letter.pdf', uri: 'file:///fixture/Letter.pdf', size: 100 }],
  });
  request.mockResolvedValueOnce({ id: 'attempt', state: 'needs_input', version: 3,
    question: 'Choose a PDF for Institution letter.', attachmentRequired: true })
    .mockResolvedValueOnce([])
    .mockRejectedValueOnce(new Error('Timed out'))
    .mockResolvedValueOnce([{ id: 'pdf', fileName: 'Letter.pdf', mimeType: 'application/pdf' }])
    .mockResolvedValueOnce({ id: 'attempt' })
    .mockResolvedValueOnce({ id: 'attempt', state: 'needs_review', version: 5 });
  try {
    const screen = render(<AutoApplyAttempt />);
    fireEvent.press(await screen.findByRole('button', { name: 'Upload a PDF' }));
    expect(await screen.findByText('Could not confirm the upload. Check My Documents for the PDF before uploading again.')).toBeTruthy();
    const saved = await screen.findByRole('button', { name: 'Letter.pdf' });
    expect(request.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
    fireEvent.press(saved);
    expect(await screen.findByText('Ready for review')).toBeTruthy();
    expect(request.mock.calls.filter(([, options]) => options?.method === 'POST').map(([path]) => path))
      .toEqual(['/uploads/file', '/me/auto-apply/attempts/attempt/attachment']);
  } finally {
    append.mockRestore();
  }
});

test.each(['provider_busy', 'provider_unavailable'])('explains %s and retries the same application', async (failureReason) => {
  const request = jest.mocked(requestProductApi);
  request.mockResolvedValueOnce({
    id: 'attempt', state: 'failed', version: 5, failureReason, canRetry: true,
  }).mockResolvedValueOnce({ id: 'attempt', state: 'queued', version: 6 })
    .mockResolvedValueOnce({ id: 'attempt', state: 'queued', version: 6 });
  const screen = render(<AutoApplyAttempt />);
  expect(await screen.findByText(/without using another monthly attempt/)).toBeTruthy();
  fireEvent.press(screen.getByText('Retry preparation'));
  expect(await screen.findByText('Waiting to start')).toBeTruthy();
  expect(request).toHaveBeenNthCalledWith(2, '/me/auto-apply/attempts/attempt/control', {
    method: 'POST', body: JSON.stringify({ action: 'retry', version: 5 }),
  });
});

test('keeps receipt checks available after an opportunity closes', async () => {
  jest.mocked(requestProductApi).mockResolvedValueOnce({
    id: 'attempt', state: 'unconfirmed', version: 6, listingClosed: true, canCheckReceipt: true,
  });
  const screen = render(<AutoApplyAttempt />);
  expect(await screen.findByText('Check for a receipt')).toBeTruthy();
  expect(screen.queryByText('Retry preparation')).toBeNull();
  expect(screen.queryByText('Approve and submit with Edutu')).toBeNull();
});

test('shows closure and hides a pending question when the deadline has passed', async () => {
  jest.mocked(requestProductApi).mockResolvedValueOnce({
    id: 'attempt', state: 'needs_input', version: 6, listingClosed: true, question: 'Your field of study?',
  });
  const screen = render(<AutoApplyAttempt />);
  expect(await screen.findByText('This opportunity has closed.')).toBeTruthy();
  expect(screen.queryByLabelText('Your answer')).toBeNull();
});

test.each([false, true])('saves a phone to the profile only with explicit consent (%s)', async remember => {
  const request = jest.mocked(requestProductApi);
  request.mockResolvedValueOnce({ id: 'attempt', state: 'needs_input', version: 3,
    question: 'What should Edutu enter for Phone number?', savePhoneOffered: true })
    .mockResolvedValueOnce({ id: 'attempt', ...(remember ? { phoneSaved: true } : {}) })
    .mockResolvedValueOnce({ id: 'attempt', state: 'queued', version: 4 });
  const screen = render(<AutoApplyAttempt />);
  const consent = await screen.findByRole('checkbox', { name: 'Save this number for future applications', checked: false });
  const input = screen.getByLabelText('Phone number');
  fireEvent.changeText(input, '202 555 0100');
  if (remember) {
    fireEvent.press(consent);
    expect(screen.getByRole('button', { name: 'Send answer and continue' })).toBeDisabled();
    fireEvent.changeText(input, '+1 (202) 555-0100');
  }
  fireEvent.press(screen.getByRole('button', { name: 'Send answer and continue' }));
  await screen.findByText('Waiting to start');
  const [path, options] = request.mock.calls[1]!;
  expect(path).toBe('/me/auto-apply/attempts/attempt/answer');
  expect(options?.method).toBe('POST');
  expect(JSON.parse(String(options?.body))).toEqual(remember
    ? { version: 3, answer: '+1 (202) 555-0100', rememberPhone: true }
    : { version: 3, answer: '202 555 0100' });
  expect(Boolean(screen.queryByText('Phone number saved to your application profile.'))).toBe(remember);
});

test('shows the provider format on the exact question and blocks approval of a flagged review', async () => {
  const request = jest.mocked(requestProductApi);
  const hint = 'Enter + followed by 11 digits, without spaces.';
  request.mockResolvedValueOnce({ id: 'attempt', state: 'needs_input', version: 3,
    question: 'What should Edutu enter for Phone number?', answerHint: hint })
    .mockResolvedValueOnce({ id: 'attempt' })
    .mockResolvedValueOnce({ id: 'attempt', state: 'needs_review', version: 5, canSubmit: false,
      review: [{ label: 'Phone number', value: '+1 202 555 0100', validationHint: hint }] });
  const screen = render(<AutoApplyAttempt />);
  expect(await screen.findByText(hint)).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText('Your answer'), '+12025550100');
  fireEvent.press(screen.getByRole('button', { name: 'Send answer and continue' }));
  fireEvent.press(await screen.findByRole('button', { name: 'Edit highlighted answers' }));
  expect(screen.getByLabelText('Phone number')).toBeTruthy();
  expect(screen.getByText(hint)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Approve and submit with Edutu' })).toBeNull();
});

test('puts a flagged provider answer first, saves it in provider order, and reloads approval', async () => {
  const request = jest.mocked(requestProductApi);
  const fields = [
    { label: 'Applicant', value: 'Test Learner' },
    { label: 'Phone number', value: '202 555 0100', validationHint: 'Use an international format.' },
  ];
  const fixed = [fields[0], { label: 'Phone number', value: '+12025550100' }];
  request.mockResolvedValueOnce({ id: 'attempt', state: 'needs_review', version: 5, canSubmit: false, review: fields })
    .mockResolvedValueOnce({ id: 'attempt', version: 6, review: fixed })
    .mockResolvedValueOnce({ id: 'attempt', state: 'needs_review', version: 6, canSubmit: true, review: fixed });
  const screen = render(<AutoApplyAttempt />);
  expect(await screen.findByText('Correction needed')).toBeTruthy();
  expect(screen.getByText('Use an international format.')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Edit highlighted answers' }));
  expect(screen.queryByLabelText('Applicant')).toBeNull();
  fireEvent.changeText(screen.getByLabelText('Phone number'), '+12025550100');
  fireEvent.press(screen.getByRole('button', { name: 'Save corrections' }));
  expect(await screen.findByRole('button', { name: 'Approve and submit with Edutu' })).toBeTruthy();
  expect(screen.getByText('Test Learner')).toBeTruthy();
  expect(screen.queryByText('Use an international format.')).toBeNull();
  expect(request).toHaveBeenNthCalledWith(2, '/me/auto-apply/attempts/attempt/review', {
    method: 'PUT', body: JSON.stringify({ version: 5, values: ['Test Learner', '+12025550100'] }),
  });
});

test('loads previous answers only on request and keeps them out of the current review', async () => {
  const request = jest.mocked(requestProductApi);
  request.mockResolvedValueOnce({
    id: 'attempt', state: 'needs_review', version: 8, hasPreviousAnswers: true, canSubmit: true,
    review: [{ label: 'Statement', value: 'Current draft' }],
  }).mockResolvedValueOnce({ version: 8, answers: [{ label: 'Statement', value: 'Earlier edited draft' }] });
  const screen = render(<AutoApplyAttempt />);
  const previous = await screen.findByRole('button', { name: 'Previous draft answers', expanded: false });
  expect(request).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Earlier edited draft')).toBeNull();
  fireEvent.press(previous);
  expect((await screen.findByText('Earlier edited draft')).props.selectable).toBe(true);
  expect(screen.getByText('Current draft')).toBeTruthy();
  expect(request).toHaveBeenLastCalledWith('/me/auto-apply/attempts/attempt/previous-answers', { signal: expect.anything() });
  fireEvent.press(screen.getByRole('button', { name: 'Previous draft answers', expanded: true }));
  expect(screen.queryByText('Earlier edited draft')).toBeNull();
});

test('groups multi-page review fields without changing where edits are saved', async () => {
  const request = jest.mocked(requestProductApi);
  const fields = [
    { label: 'Background', value: 'Previous background', providerPage: { number: 1, total: 2 } },
    { label: 'Applicant name', value: 'Example Learner', providerPage: { number: 2, total: 2 } },
    { label: 'Phone number', value: '+12025550100', providerPage: { number: 2, total: 2 } },
  ];
  request.mockResolvedValueOnce({ id: 'attempt', state: 'needs_review', version: 5, canSubmit: true, review: fields })
    .mockResolvedValueOnce({ id: 'attempt', version: 6,
      review: [{ ...fields[0], value: 'Updated background' }, ...fields.slice(1)] });
  const screen = render(<AutoApplyAttempt />);
  expect(await screen.findByRole('header', { name: 'Provider page 1 of 2' })).toBeTruthy();
  expect(screen.getAllByRole('header', { name: 'Provider page 2 of 2' })).toHaveLength(1);
  fireEvent.press(screen.getByRole('button', { name: 'Edit application draft' }));
  fireEvent.changeText(screen.getByLabelText('Background'), 'Updated background');
  fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByText('Updated background')).toBeTruthy();
  expect(screen.getByRole('header', { name: 'Provider page 1 of 2' })).toBeTruthy();
  expect(request).toHaveBeenLastCalledWith('/me/auto-apply/attempts/attempt/review', {
    method: 'PUT', body: JSON.stringify({ version: 5, values: ['Updated background', 'Example Learner', '+12025550100'] }),
  });
});

test('shows AI provenance only on a generated statement', async () => {
  const request = jest.mocked(requestProductApi);
  request.mockResolvedValueOnce({ id: 'attempt', state: 'needs_review', version: 5, canSubmit: true, review: [
    { label: 'Statement of purpose', value: 'Written by the learner' },
    { label: 'Board contribution', value: 'Started from learner facts', generatedByAi: true },
  ] });
  const screen = render(<AutoApplyAttempt />);
  expect(await screen.findByText('Started with Edutu AI')).toBeTruthy();
  expect(screen.getAllByText('Started with Edutu AI')).toHaveLength(1);
  expect(screen.getByText('Written by the learner')).toBeTruthy();
  expect(screen.getByText('Started from learner facts')).toBeTruthy();
});

test('only sends approval after a learner presses submit on the displayed review', async () => {
  const request = jest.mocked(requestProductApi);
  request.mockResolvedValueOnce({
    id: 'attempt', state: 'needs_review', version: 8, canSubmit: true, destinationHost: 'provider.example',
    review: [{ label: 'Field of study', value: 'Engineering', providerLabel: 'Current degree subject' }, {
      label: 'CV', value: 'Example research background', attachment: { type: 'pdf', sourceName: 'Academic CV' },
    }],
  }).mockResolvedValueOnce({ id: 'attempt' })
    .mockResolvedValueOnce({ id: 'attempt', state: 'submitting', version: 9 });
  const screen = render(<AutoApplyAttempt />);
  expect(await screen.findByText('Engineering')).toBeTruthy();
  expect(screen.getByText('On the provider form: Current degree subject')).toBeTruthy();
  expect(screen.getByText('Application destination provider.example')).toBeTruthy();
  expect(screen.getByText('Destination · provider.example')).toBeTruthy();
  expect(screen.getByText('Generated CV PDF · based on Academic CV')).toBeTruthy();
  expect(screen.getByText('Edutu will send these reviewed answers and files only after you approve.')).toBeTruthy();
  expect(screen.getByText('PDF attachment based on Academic CV')).toBeTruthy();
  expect(screen.getByText('Example research background')).toBeTruthy();
  expect(request).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByText('Approve and submit with Edutu'));
  expect(await screen.findByText('Submitting')).toBeTruthy();
  expect(request).toHaveBeenNthCalledWith(2, '/me/auto-apply/attempts/attempt/approve', {
    method: 'POST', body: JSON.stringify({ version: 8 }),
  });
});

test('keeps the review available until submission returns', async () => {
  const review = { id: 'attempt', state: 'needs_review', version: 8,
    review: [{ label: 'Field of study', value: 'Engineering' }] };
  const request = jest.mocked(requestProductApi);
  request.mockResolvedValueOnce({ ...review, canSubmit: false, submissionUnavailable: true })
    .mockResolvedValueOnce({ ...review, canSubmit: true });
  const screen = render(<AutoApplyAttempt />);
  expect(await screen.findByText(/Submission is temporarily unavailable/)).toBeTruthy();
  expect(screen.getByText('Engineering')).toBeTruthy();
  expect(screen.queryByText('Approve and submit with Edutu')).toBeNull();
  fireEvent.press(screen.getByText('Refresh status'));
  expect(await screen.findByText('Approve and submit with Edutu')).toBeTruthy();
  expect(request.mock.calls.every(([, options]) => options?.method !== 'POST')).toBe(true);
});

test('opens the generated PDF for the current review without approving the application', async () => {
  const request = jest.mocked(requestProductApi);
  jest.mocked(shareAsync).mockClear();
  request.mockResolvedValueOnce({
    id: 'attempt', state: 'needs_review', version: 8, canPreviewCv: true, canSubmit: true,
    review: [{ label: 'Education', value: 'Engineering' }, {
      label: 'CV', value: 'Academic work', attachment: { type: 'pdf', sourceName: 'Academic CV' },
    }],
  }).mockResolvedValueOnce({ pdf: 'JVBERi0xLjQ=' });
  const screen = render(<AutoApplyAttempt />);
  fireEvent.press(await screen.findByRole('button', { name: 'Open or share CV PDF' }));
  expect(await screen.findByText('Open or share CV PDF')).toBeTruthy();
  expect(shareAsync).toHaveBeenCalledWith('file://mock', expect.objectContaining({ mimeType: 'application/pdf' }));
  expect(request).toHaveBeenNthCalledWith(2, '/me/auto-apply/attempts/attempt/cv-preview', {
    method: 'POST', body: JSON.stringify({ version: 8, fieldIndex: 1 }),
  }, undefined, 15_000);
  expect(request).toHaveBeenCalledTimes(2);
});

test('refreshes work in progress and stops polling once the learner needs to act', async () => {
  const previous = AppState.currentState;
  AppState.currentState = 'active';
  jest.useFakeTimers();
  const request = jest.mocked(requestProductApi);
  request.mockResolvedValueOnce({ id: 'attempt', state: 'running', version: 2 })
    .mockResolvedValueOnce({
      id: 'attempt', state: 'needs_input', version: 3, question: 'What degree are you studying for?',
    });
  try {
    const screen = render(<AutoApplyAttempt />);
    expect(await screen.findByText('Preparing application')).toBeTruthy();
    await act(async () => { jest.advanceTimersByTime(8000); });
    expect(await screen.findByText('What degree are you studying for?')).toBeTruthy();
    await act(async () => { jest.advanceTimersByTime(16000); });
    expect(request).toHaveBeenCalledTimes(2);
  } finally {
    jest.useRealTimers();
    AppState.currentState = previous;
  }
});

test('edits a provider choice through the review picker and saves it', async () => {
  const request = jest.mocked(requestProductApi);
  const field = { label: 'Remote placement', value: 'Yes', choices: ['Yes', 'No'] };
  request.mockResolvedValueOnce({ id: 'attempt', state: 'needs_review', version: 5, review: [field], canSubmit: true })
    .mockResolvedValueOnce({ id: 'attempt', version: 6, review: [{ ...field, value: 'No' }] });
  const screen = render(<AutoApplyAttempt />);
  fireEvent.press(await screen.findByText('Edit application draft'));
  expect(screen.queryByLabelText('Remote placement')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Change Remote placement' }));
  expect(screen.getByRole('radio', { name: 'Yes' }).props.accessibilityState.checked).toBe(true);
  fireEvent.press(screen.getByRole('radio', { name: 'No' }));
  expect(screen.queryByRole('radio', { name: 'No' })).toBeNull();
  fireEvent.press(screen.getByText('Save changes'));
  expect(await screen.findByText('Approve and submit with Edutu')).toBeTruthy();
  expect(screen.getByText('No')).toBeTruthy();
  expect(request).toHaveBeenNthCalledWith(2, '/me/auto-apply/attempts/attempt/review', {
    method: 'PUT', body: JSON.stringify({ version: 5, values: ['No'] }),
  });
});

test('saves edited text and approves only the new draft version', async () => {
  const request = jest.mocked(requestProductApi);
  const review = [{ label: 'Statement of purpose', value: 'The first draft.' }];
  request.mockResolvedValueOnce({ id: 'attempt', state: 'needs_review', version: 8, review, canSubmit: true })
    .mockResolvedValueOnce({ id: 'attempt', version: 9, review: [{ ...review[0], value: 'My corrected statement.' }] })
    .mockResolvedValueOnce({ id: 'attempt' })
    .mockResolvedValueOnce({ id: 'attempt', state: 'submitting', version: 10 });
  const screen = render(<AutoApplyAttempt />);
  fireEvent.press(await screen.findByText('Edit application draft'));
  expect(screen.queryByText('Approve and submit with Edutu')).toBeNull();
  fireEvent.changeText(screen.getByLabelText('Statement of purpose'), 'My corrected statement.');
  fireEvent.press(screen.getByText('Save changes'));
  expect(await screen.findByText('My corrected statement.')).toBeTruthy();
  fireEvent.press(screen.getByText('Approve and submit with Edutu'));
  expect(await screen.findByText('Submitting')).toBeTruthy();
  expect(request).toHaveBeenNthCalledWith(2, '/me/auto-apply/attempts/attempt/review', {
    method: 'PUT', body: JSON.stringify({ version: 8, values: ['My corrected statement.'] }),
  });
  expect(request).toHaveBeenNthCalledWith(3, '/me/auto-apply/attempts/attempt/approve', {
    method: 'POST', body: JSON.stringify({ version: 9 }),
  });
});

test('recovers a saved review when the response is lost', async () => {
  const request = jest.mocked(requestProductApi);
  const field = { label: 'Statement of purpose', value: 'Initial statement' };
  request.mockResolvedValueOnce({ id: 'attempt', state: 'needs_review', version: 8, review: [field], canSubmit: true })
    .mockRejectedValueOnce(new Error('Timed out'))
    .mockResolvedValueOnce({
      id: 'attempt', state: 'needs_review', version: 9, canSubmit: true,
      review: [{ ...field, value: 'Updated statement' }],
    });
  const screen = render(<AutoApplyAttempt />);
  fireEvent.press(await screen.findByText('Edit application draft'));
  fireEvent.changeText(screen.getByLabelText('Statement of purpose'), '  Updated statement  ');
  fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByText('Updated statement')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Approve and submit with Edutu' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
  expect(request.mock.calls.filter(([, options]) => options?.method === 'PUT')).toHaveLength(1);
});

test('keeps local review edits available to copy when a newer saved draft differs', async () => {
  const request = jest.mocked(requestProductApi);
  const field = { label: 'Statement of purpose', value: 'Initial statement' };
  request.mockResolvedValueOnce({ id: 'attempt', state: 'needs_review', version: 8, review: [field], canSubmit: true })
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({
      id: 'attempt', state: 'needs_review', version: 9, canSubmit: true,
      review: [{ ...field, value: 'Edited on another device' }],
    });
  const screen = render(<AutoApplyAttempt />);
  fireEvent.press(await screen.findByText('Edit application draft'));
  fireEvent.changeText(screen.getByLabelText('Statement of purpose'), 'Local statement');
  fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByText('This draft changed. Copy your edits, then discard them to view the latest draft.')).toBeTruthy();
  expect(screen.getByLabelText('Statement of purpose')).toHaveProp('value', 'Local statement');
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  fireEvent.press(screen.getByRole('button', { name: 'Discard edits' }));
  expect(screen.getByText('Edited on another device')).toBeTruthy();
});

test('cancels only after confirmation and retries the same attempt', async () => {
  const request = jest.mocked(requestProductApi);
  request.mockResolvedValueOnce({ id: 'attempt', state: 'running', version: 2, canCancel: true })
    .mockResolvedValueOnce({ id: 'attempt', state: 'cancelled', version: 3 })
    .mockResolvedValueOnce({ id: 'attempt', state: 'cancelled', version: 3, canRetry: true })
    .mockResolvedValueOnce({ id: 'attempt', state: 'queued', version: 4 })
    .mockResolvedValueOnce({ id: 'attempt', state: 'queued', version: 4, canCancel: true });
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  try {
    const screen = render(<AutoApplyAttempt />);
    fireEvent.press(await screen.findByText('Stop Auto Apply'));
    expect(request).toHaveBeenCalledTimes(1);
    await act(async () => { alert.mock.calls[0]?.[2]?.[1]?.onPress?.(); });
    fireEvent.press(await screen.findByText('Retry preparation'));
    expect(await screen.findByText('Waiting to start')).toBeTruthy();
    expect(request).toHaveBeenNthCalledWith(2, '/me/auto-apply/attempts/attempt/control', {
      method: 'POST', body: JSON.stringify({ action: 'cancel', version: 2 }),
    });
    expect(request).toHaveBeenNthCalledWith(4, '/me/auto-apply/attempts/attempt/control', {
      method: 'POST', body: JSON.stringify({ action: 'retry', version: 3 }),
    });
  } finally {
    alert.mockRestore();
  }
});

test('saves an optional answer as blank while preserving required answers', async () => {
  const request = jest.mocked(requestProductApi);
  const review = [
    { label: 'Applicant name', value: 'Example Learner' },
    { label: 'Additional notes', value: 'A note', optional: true },
  ];
  request.mockResolvedValueOnce({ id: 'attempt', state: 'needs_review', version: 2, review, canSubmit: true })
    .mockResolvedValueOnce({ id: 'attempt', version: 3, review: [review[0], { ...review[1], value: '' }] });
  const screen = render(<AutoApplyAttempt />);
  fireEvent.press(await screen.findByText('Edit application draft'));
  fireEvent.changeText(screen.getByLabelText('Applicant name'), '');
  fireEvent.changeText(screen.getByLabelText('Additional notes'), '');
  expect(screen.getByText('Optional')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  fireEvent.changeText(screen.getByLabelText('Applicant name'), 'Example Learner');
  fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByText('Left blank')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Approve and submit with Edutu' })).toBeTruthy();
  expect(request).toHaveBeenNthCalledWith(2, '/me/auto-apply/attempts/attempt/review', {
    method: 'PUT', body: JSON.stringify({ version: 2, values: ['Example Learner', ''] }),
  });
});

test('asks the learner to shorten an overlong answer before saving or approving', async () => {
  const request = jest.mocked(requestProductApi);
  const value = 'Four';
  const review = [{ label: 'Short answer', value, maxLength: 3 }];
  request.mockResolvedValueOnce({ id: 'attempt', state: 'needs_review', version: 2, review, canSubmit: true })
    .mockResolvedValueOnce({ id: 'attempt', version: 3, review: [{ ...review[0], value: 'Yes' }] });
  const screen = render(<AutoApplyAttempt />);
  expect(await screen.findByText('Shorten this answer to 3 characters. 4 entered.')).toBeTruthy();
  expect(screen.queryByText('Approve and submit with Edutu')).toBeNull();
  fireEvent.press(screen.getByText('Edit application draft'));
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  fireEvent.changeText(screen.getByLabelText('Short answer'), 'Yes');
  fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByText('3 of 3 characters used')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Approve and submit with Edutu' })).toBeTruthy();
  expect(request.mock.calls[1]?.[0]).toBe('/me/auto-apply/attempts/attempt/review');
});

test('checks for a receipt and displays a recovered confirmation', async () => {
  const request = jest.mocked(requestProductApi);
  request.mockResolvedValueOnce({ id: 'attempt', state: 'unconfirmed', version: 8, canCheckReceipt: true })
    .mockResolvedValueOnce({ id: 'attempt', state: 'submitted', version: 9, receipt: 'RECOVERED-1' });
  const screen = render(<AutoApplyAttempt />);
  fireEvent.press(await screen.findByText('Check for a receipt'));
  expect(await screen.findByText('Provider receipt RECOVERED-1')).toBeTruthy();
  expect(request).toHaveBeenNthCalledWith(2, '/me/auto-apply/attempts/attempt/check-receipt',
    { method: 'POST' }, undefined, 12000);
  expect(screen.queryByText('Approve and submit with Edutu')).toBeNull();
});

test('opens the provider for an unconfirmed submission without offering another submit', async () => {
  const request = jest.mocked(requestProductApi);
  const handoffUrl = 'https://provider.example/apply';
  request.mockResolvedValueOnce({
    id: 'attempt', state: 'unconfirmed', version: 8, listingClosed: true,
    handoffUrl, canCheckReceipt: true, canRetry: false, canSubmit: false,
  });
  const open = jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('Browser unavailable'));
  try {
    const screen = render(<AutoApplyAttempt />);
    expect(await screen.findByText(/The provider may have received part or all of your application/)).toBeTruthy();
    fireEvent.press(await screen.findByRole('link', { name: 'Open provider site to check' }));
    expect(open).toHaveBeenCalledWith(handoffUrl);
    expect(await screen.findByText('Could not open the provider site. Check your email for a confirmation.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Check for a receipt' })).toBeTruthy();
    expect(screen.queryByText('Approve and submit with Edutu')).toBeNull();
    expect(screen.queryByText('Retry preparation')).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
  } finally {
    open.mockRestore();
  }
});

test('records an application submitted on the provider site only after learner confirmation', async () => {
  const request = jest.mocked(requestProductApi);
  request.mockResolvedValueOnce({ id: 'attempt', state: 'needs_input', version: 8, handoffRequired: true,
    question: 'Sign in on the provider site.', canRecordManualSubmission: true, canRetry: true })
    .mockResolvedValueOnce({ id: 'attempt', state: 'submitted', version: 9, manuallySubmitted: true });
  const dialog = jest.spyOn(Alert, 'alert');
  try {
    const screen = render(<AutoApplyAttempt />);
    fireEvent.press(await screen.findByRole('button', { name: 'I submitted on the provider site' }));
    expect(request).toHaveBeenCalledTimes(1);
    await act(async () => dialog.mock.lastCall?.[2]?.find(button => button.text === 'Record submission')?.onPress?.());
    expect(await screen.findByText('You recorded this submission from the provider site.')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Submission recorded' })).toBeTruthy();
    expect(screen.getByRole('progressbar', { value: { text: 'Step 3 of 3, Submit' } })).toBeTruthy();
    expect(screen.queryByRole('header', { name: 'Submitted' })).toBeNull();
    expect(request).toHaveBeenLastCalledWith('/me/auto-apply/attempts/attempt/manual-submission', {
      method: 'POST', body: JSON.stringify({ version: 8 }),
    });
    expect(screen.queryByText('Recheck provider form')).toBeNull();
    expect(screen.queryByText(/Provider receipt/)).toBeNull();
  } finally {
    dialog.mockRestore();
  }
});

test('preserves the draft and disables Edutu approval when the learner opts into provider-site submission', async () => {
  const request = jest.mocked(requestProductApi);
  const review = {
    id: 'attempt', state: 'needs_review', version: 8, canSubmit: true, canStartManualSubmission: true,
    handoffUrl: 'https://provider.example/apply', review: [{ label: 'Background', value: 'Reviewed project' }],
  };
  const manual = { ...review, version: 9, canSubmit: false, canStartManualSubmission: false,
    reviewingOnProvider: true, canRecordManualSubmission: true };
  request.mockResolvedValueOnce(review).mockResolvedValueOnce(manual)
    .mockResolvedValueOnce({ ...review, version: 10, reviewingOnProvider: false });
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const browser = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  try {
    const screen = render(<AutoApplyAttempt />);
    fireEvent.press(await screen.findByRole('button', { name: 'Submit on the provider site' }));
    expect(await screen.findByText('Submitting on the provider site')).toBeTruthy();
    expect(browser).toHaveBeenCalledWith(review.handoffUrl);
    expect(screen.getByText('Reviewed project')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Approve and submit with Edutu' })).toBeNull();
    expect(screen.getByRole('button', { name: 'I submitted on the provider site' })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Switch back to Edutu' }));
    expect(request).toHaveBeenCalledTimes(2);
    await act(async () => alert.mock.lastCall?.[2]?.find(button => button.text === 'Switch back')?.onPress?.());
    expect(await screen.findByRole('button', { name: 'Approve and submit with Edutu' })).toBeTruthy();
    expect(request.mock.calls.slice(1).map(([path, options]) => [path, JSON.parse(String(options?.body))]))
      .toEqual([
        ['/me/auto-apply/attempts/attempt/manual-review', { version: 8, enabled: true }],
        ['/me/auto-apply/attempts/attempt/manual-review', { version: 9, enabled: false }],
      ]);
  } finally {
    browser.mockRestore();
    alert.mockRestore();
  }
});

test('shows provider choices and sends the selected label', async () => {
  const request = jest.mocked(requestProductApi);
  request.mockResolvedValueOnce({
    id: 'attempt', state: 'needs_input', question: 'Field of study?', choices: ['Physics', 'Engineering'], version: 4,
  }).mockResolvedValueOnce({ id: 'attempt' })
    .mockResolvedValueOnce({ id: 'attempt', state: 'queued', version: 5 });
  const screen = render(<AutoApplyAttempt />);
  const option = await screen.findByRole('radio', { name: 'Engineering' });
  expect(screen.queryByLabelText('Your answer')).toBeNull();
  fireEvent.press(option);
  expect(screen.getByRole('radio', { name: 'Engineering', checked: true })).toBeTruthy();
  fireEvent.press(screen.getByText('Send answer and continue'));
  expect(await screen.findByText('Waiting to start')).toBeTruthy();
  expect(request).toHaveBeenNthCalledWith(2, '/me/auto-apply/attempts/attempt/answer', {
    method: 'POST', body: JSON.stringify({ answer: 'Engineering', version: 4 }),
  });
});

test('saves multiple selected answers and explicitly skips the optional question', async () => {
  const request = jest.mocked(requestProductApi);
  request.mockResolvedValueOnce({
    id: 'attempt', state: 'needs_input', version: 4, question: 'Which topics?',
    choices: ['Digital access', 'Digital skills', 'Inclusion'], selectionMode: 'multiple_required',
  }).mockResolvedValueOnce({ id: 'attempt' }).mockResolvedValueOnce({
    id: 'attempt', state: 'needs_input', version: 7, question: 'Which contact channels?',
    choices: ['Email', 'Phone'], selectionMode: 'multiple_optional',
  }).mockResolvedValueOnce({ id: 'attempt' }).mockResolvedValueOnce({
    id: 'attempt', state: 'needs_review', version: 10,
    review: [
      { label: 'Advice topics', value: '["Digital access","Inclusion"]', selectionMode: 'multiple_required' },
      { label: 'Contact channels', value: '[]', selectionMode: 'multiple_optional' },
    ],
  });

  const screen = render(<AutoApplyAttempt />);
  const save = await screen.findByRole('button', { name: 'Save selections and continue' });
  expect(save).toBeDisabled();
  fireEvent.press(screen.getByRole('checkbox', { name: 'Digital skills', checked: false }));
  fireEvent.press(screen.getByRole('checkbox', { name: 'Digital access', checked: false }));
  fireEvent.press(screen.getByRole('checkbox', { name: 'Digital skills', checked: true }));
  fireEvent.press(screen.getByRole('checkbox', { name: 'Inclusion', checked: false }));
  fireEvent.press(screen.getByRole('button', { name: 'Save selections and continue' }));
  fireEvent.press(await screen.findByRole('button', { name: 'Continue without selecting' }));
  expect(await screen.findByText('Digital access, Inclusion')).toBeTruthy();
  expect(screen.getByText('No options selected')).toBeTruthy();
  expect(request.mock.calls.filter(([, options]) => options?.method === 'POST').map(([, options]) =>
    JSON.parse(String(options?.body)))).toEqual([
    { version: 4, answer: '["Digital access","Inclusion"]' },
    { version: 7, answer: '[]' },
  ]);
});

test('finds a provider choice beyond the initial options shown', async () => {
  jest.mocked(requestProductApi).mockResolvedValueOnce({
    id: 'attempt', state: 'needs_input', question: 'Country?', version: 2,
    choices: [...Array.from({ length: 24 }, (_, index) => 'Country ' + (index + 1)), 'Nigeria'],
  });
  const screen = render(<AutoApplyAttempt />);
  const search = await screen.findByLabelText('Search options');
  expect(screen.queryByRole('radio', { name: 'Nigeria' })).toBeNull();
  fireEvent.changeText(search, 'nigeria');
  expect(screen.getByRole('radio', { name: 'Nigeria' })).toBeTruthy();
});

test.each([
  ['Open provider step', 'https://provider.example/apply/documents#references', true],
  ['Open provider site', 'https://provider.example/apply', false],
])('opens a provider handoff through %s without showing an answer field', async (label, handoffUrl, exactHandoff) => {
  const request = jest.mocked(requestProductApi);
  const question = 'Complete the security check on the provider’s website.';
  request.mockResolvedValueOnce({
    id: 'attempt', state: 'needs_input', version: 3, canRetry: true,
    handoffRequired: true, handoffUrl, exactHandoff,
    question,
  });
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  try {
    const screen = render(<AutoApplyAttempt />);
    fireEvent.press(await screen.findByRole('link', { name: label }));
    expect(open).toHaveBeenCalledWith(handoffUrl);
    expect(screen.getByText(question)).toBeTruthy();
    expect(screen.queryByLabelText('Your answer')).toBeNull();
    expect(screen.getByText('Recheck provider form')).toBeTruthy();
  } finally {
    open.mockRestore();
  }
});

test('requires an explicit provider recheck after the learner returns from the browser', async () => {
  const request = jest.mocked(requestProductApi);
  const paused = {
    id: 'attempt', state: 'needs_input', version: 3, canRetry: true, handoffRequired: true, exactHandoff: true,
    handoffUrl: 'https://provider.example/apply#documents', question: 'Complete the provider check.',
  };
  const review = { id: 'attempt', state: 'needs_review', version: 5, canSubmit: true };
  request.mockResolvedValueOnce(paused).mockResolvedValueOnce(paused)
    .mockResolvedValueOnce({ id: 'attempt', state: 'queued', version: 4 })
    .mockResolvedValueOnce(review).mockResolvedValueOnce(review);
  const previousState = AppState.currentState;
  AppState.currentState = 'active';
  let appStateChange: ((state: typeof AppState.currentState) => void) | undefined;
  const originalListener = jest.isMockFunction(AppState.addEventListener)
    ? jest.mocked(AppState.addEventListener).getMockImplementation() : undefined;
  const appListener = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, handler) => {
    appStateChange = handler;
    return { remove: jest.fn() };
  });
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  const switchState = (state: typeof AppState.currentState) => {
    AppState.currentState = state;
    appStateChange?.(state);
  };
  try {
    const screen = render(<AutoApplyAttempt />);
    fireEvent.press(await screen.findByRole('link', { name: 'Open provider step' }));
    expect(request.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0);
    act(() => switchState('background'));
    await act(async () => switchState('active'));
    expect(await screen.findByText('You’re back from the provider. Tap Recheck provider form when you’re ready.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Recheck provider form' })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Recheck provider form' }));
    expect(await screen.findByRole('button', { name: 'Approve and submit with Edutu' })).toBeTruthy();
    expect(request).toHaveBeenNthCalledWith(3, '/me/auto-apply/attempts/attempt/control', {
      method: 'POST', body: JSON.stringify({ action: 'retry', version: 3 }),
    });
    act(() => switchState('background'));
    await act(async () => switchState('active'));
    expect(request.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
  } finally {
    AppState.currentState = previousState;
    if (originalListener) appListener.mockImplementation(originalListener);
    else appListener.mockRestore();
    open.mockRestore();
  }
});

test('opens the current provider link after a form change before submission', async () => {
  const handoffUrl = 'https://provider.example/apply';
  jest.mocked(requestProductApi).mockResolvedValueOnce({
    id: 'attempt', state: 'failed', version: 3, failureReason: 'mapping_changed',
    canRetry: true, handoffUrl,
  });
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  try {
    const screen = render(<AutoApplyAttempt />);
    fireEvent.press(await screen.findByRole('link', { name: 'Open provider site' }));
    expect(open).toHaveBeenCalledWith(handoffUrl);
    expect(screen.getByText('Retry preparation')).toBeTruthy();
    expect(screen.queryByText('Approve and submit with Edutu')).toBeNull();
  } finally {
    open.mockRestore();
  }
});
