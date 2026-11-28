import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Alert, Share } from 'react-native';
import { getDocumentAsync } from 'expo-document-picker';
import { requestProductApi } from '@edutu/core/src/services/productApi';
import { ApplicantBackground } from '../components/opportunity/ApplicantBackground';

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({
  File: class { uri = 'file:///mock/statement.txt'; exists = false; },
  Paths: { cache: { uri: 'file:///mock/' } },
}));
jest.mock('@edutu/core/src/services/productApi', () => ({
  requestProductApi: jest.fn(),
  ProductApiRequestError: Error,
}));
jest.mock('../components/context/ThemeContext', () => ({ useTheme: () => ({ colors: {} }) }));

beforeEach(() => {
  jest.mocked(requestProductApi).mockReset();
});

test('clears saved details only after confirmation and keeps the new version for future edits', async () => {
  const request = jest.mocked(requestProductApi);
  request.mockResolvedValueOnce({ background: 'Saved background', statement: 'Saved statement', version: 2 })
    .mockResolvedValueOnce({ version: 3 })
    .mockResolvedValueOnce({ version: 4 });
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  try {
    const screen = render(<ApplicantBackground initiallyOpen allowDelete />);
    fireEvent.press(await screen.findByRole('button', { name: 'Delete saved details' }));
    expect(request).toHaveBeenCalledTimes(1);
    await act(async () => alert.mock.lastCall?.[2]?.find(button => button.style === 'destructive')?.onPress?.());
    expect(await screen.findByText('Saved application details deleted.')).toBeTruthy();
    expect(screen.queryByDisplayValue('Saved background')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete saved details' })).toBeNull();
    expect(request).toHaveBeenNthCalledWith(2, '/me/auto-apply/profile',
      { method: 'DELETE', body: JSON.stringify({ version: 2 }) }, undefined, undefined, { throwOnError: true });
    fireEvent.changeText(screen.getByLabelText('Education, experience and achievements'), 'New background');
    fireEvent.press(screen.getByRole('button', { name: 'Save for future applications' }));
    expect(await screen.findByText('Application profile saved.')).toBeTruthy();
    expect(JSON.parse(String(request.mock.lastCall?.[1]?.body))).toMatchObject({ version: 3, background: 'New background' });
  } finally {
    alert.mockRestore();
  }
});

test('previews imported statement text and preserves an existing statement until replacement is chosen', async () => {
  jest.mocked(getDocumentAsync).mockResolvedValue({
    canceled: false,
    assets: [{ name: 'statement.txt', uri: 'file:///mock/statement.txt', mimeType: 'text/plain' }],
  });
  const request = jest.mocked(requestProductApi);
  request.mockResolvedValueOnce({ background: '', statement: 'Original statement', version: 2 })
    .mockResolvedValueOnce({ statement: 'Imported statement' })
    .mockResolvedValueOnce({ version: 3 });

  const originalFormData = global.FormData;
  global.FormData = class { append() {} } as unknown as typeof FormData;
  try {
    const screen = render(<ApplicantBackground />);
    fireEvent.press(screen.getByText('Edit application background'));
    fireEvent.press(await screen.findByText('Import statement file'));
    expect(await screen.findByText('Replace the existing statement with text from this file?')).toBeTruthy();
    expect(screen.getByDisplayValue('Original statement')).toBeTruthy();
    expect(request).toHaveBeenCalledTimes(2);
    fireEvent.press(screen.getByText('Replace statement'));
    expect(screen.getByDisplayValue('Imported statement')).toBeTruthy();
    fireEvent.press(screen.getByText('Save for future applications'));
    expect(await screen.findByText('Application profile saved.')).toBeTruthy();
    expect(request).toHaveBeenNthCalledWith(3, '/me/auto-apply/profile', {
      method: 'PUT', body: JSON.stringify({ background: '', statement: 'Imported statement', version: 2 }),
    });
  } finally {
    global.FormData = originalFormData;
  }
});

test('shares only the generic prompt and adds a reviewed summary locally before saving', async () => {
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
  const request = jest.mocked(requestProductApi);
  request.mockResolvedValueOnce({
    background: 'School: Example University', statement: 'Existing statement', version: 2,
    contact: { name: 'Example Learner', email: 'learner@example.test' },
  }).mockResolvedValueOnce({ version: 3 });
  try {
    const start = jest.fn();
    const screen = render(<ApplicantBackground onReady={start} />);
    fireEvent.press(await screen.findByText('Use a summary from ChatGPT or another AI'));
    fireEvent.press(screen.getByRole('button', { name: 'Share prompt' }));
    expect(share).toHaveBeenCalledTimes(1);
    const shared = share.mock.calls[0]![0].message;
    expect(shared).toContain('Use only facts I explicitly shared');
    expect(shared).not.toContain('Example University');
    expect(shared).not.toContain('learner@example.test');
    const source = screen.getByLabelText('Summary from your AI chat');
    fireEvent.changeText(source, 'Built a solar charger for a school project.');
    expect(screen.getByRole('button', { name: 'Save and start Auto Apply' })).toBeDisabled();
    expect(screen.getByDisplayValue('School: Example University')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Add summary to background' }));
    const background = 'School: Example University\n\nBuilt a solar charger for a school project.';
    expect(screen.getByDisplayValue(background)).toBeTruthy();
    expect(request).toHaveBeenCalledTimes(1);
    expect(start).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', { name: 'Save and start Auto Apply' }));
    expect(await screen.findByText('Application profile saved.')).toBeTruthy();
    const [, options] = request.mock.calls[1]!;
    expect(JSON.parse(String(options?.body))).toMatchObject({ background, statement: 'Existing statement', version: 2 });
    expect(start).toHaveBeenCalledTimes(1);
  } finally {
    share.mockRestore();
  }
});

test('keeps the existing background intact when the summary does not fit', async () => {
  const background = 'A'.repeat(7999);
  jest.mocked(requestProductApi).mockResolvedValueOnce({ background, statement: '', version: 2 });
  const screen = render(<ApplicantBackground initiallyOpen />);
  fireEvent.press(await screen.findByText('Use a summary from ChatGPT or another AI'));
  fireEvent.changeText(screen.getByLabelText('Summary from your AI chat'), 'AB');
  expect(screen.getByText('Shorten your summary or background by 3 characters to add it.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Add summary to background' })).toBeDisabled();
  fireEvent.press(screen.getByRole('button', { name: 'Discard summary' }));
  expect(screen.getByDisplayValue(background)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Save for future applications' })).toBeEnabled();
});

test('starts with edited education and keeps profile suggestions out of the background', async () => {
  const request = jest.mocked(requestProductApi);
  const education = { school: 'Edutu University', degree: 'BSc', major: 'Physics', graduationYear: '2027' };
  request.mockResolvedValueOnce({
    background: '', statement: '', version: 0, education,
    suggestedBackground: 'School: Edutu University', suggestedExperience: '',
  }).mockResolvedValueOnce({ version: 1 });
  const start = jest.fn();
  const screen = render(<ApplicantBackground onReady={start} />);
  const year = await screen.findByLabelText('Graduation year');
  expect(screen.getByLabelText('School or university')).toHaveProp('value', education.school);
  expect(screen.queryByDisplayValue('School: Edutu University')).toBeNull();
  fireEvent.changeText(year, '028');
  fireEvent.press(screen.getByRole('button', { name: 'Save and start Auto Apply' }));
  expect(screen.getByText('Enter your graduation year as four digits or leave it blank.')).toBeTruthy();
  expect(request).toHaveBeenCalledTimes(1);
  fireEvent.changeText(year, '2028');
  fireEvent.press(screen.getByRole('button', { name: 'Save and start Auto Apply' }));
  expect(await screen.findByText('Application profile saved.')).toBeTruthy();
  expect(request).toHaveBeenNthCalledWith(2, '/me/auto-apply/profile', {
    method: 'PUT',
    body: JSON.stringify({ background: '', statement: '', version: 0, education: { ...education, graduationYear: '2028' } }),
  });
  expect(start).toHaveBeenCalledTimes(1);
});
