import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { AiAction } from '../components/ai/AiActionBar';

jest.mock('../components/context/ThemeContext', () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      background: '#FFFFFF',
      foreground: '#111827',
      card: '#FFFFFF',
      border: '#E5E7EB',
      primary: '#2563EB',
      accent: '#6366F1',
      accentLight: '#EEF2FF',
      mutedForeground: '#6B7280',
      error: '#DC2626',
    },
  }),
}));

jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return new Proxy(
    { __esModule: true },
    {
      get: (_target, prop) => {
        if (prop === '__esModule') return true;
        if (typeof prop === 'string') return () => <Text>{prop}</Text>;
        return undefined;
      },
    },
  );
});

const { AiActionBar, AiActionError } = require('../components/ai/AiActionBar');

const actions: AiAction[] = [
  { label: 'Am I a fit?', intent: 'fit_check', message: 'Am I a fit for this?' },
  { label: 'Next move', intent: 'next_move', message: "What's my next move?" },
];

describe('AiActionBar', () => {
  it('renders a pill per action', () => {
    const { getByText } = render(
      <AiActionBar actions={actions} onRun={jest.fn()} />,
    );
    expect(getByText('Am I a fit?')).toBeTruthy();
    expect(getByText('Next move')).toBeTruthy();
  });

  it('runs the tapped action and shows the reply', async () => {
    const onRun = jest.fn().mockResolvedValue({
      text: "You're a strong fit — apply.",
      threadId: 'thread-1',
    });
    const { getByText } = render(
      <AiActionBar actions={actions} onRun={onRun} />,
    );

    await act(async () => {
      fireEvent.press(getByText('Am I a fit?'));
    });

    expect(onRun).toHaveBeenCalledWith(actions[0]);
    await waitFor(() =>
      expect(getByText("You're a strong fit — apply.")).toBeTruthy(),
    );
  });

  it('lets the user reopen the thread the advice lives in', async () => {
    const onRun = jest.fn().mockResolvedValue({
      text: 'Polish your essay.',
      threadId: 'thread-7',
    });
    const onOpenInChat = jest.fn();
    const { getByText } = render(
      <AiActionBar
        actions={actions}
        onRun={onRun}
        onOpenInChat={onOpenInChat}
      />,
    );

    await act(async () => {
      fireEvent.press(getByText('Am I a fit?'));
    });

    await waitFor(() => expect(getByText('Open in chat')).toBeTruthy());
    fireEvent.press(getByText('Open in chat'));
    expect(onOpenInChat).toHaveBeenCalledWith('thread-7');
  });

  it('hides "Open in chat" when there is no thread to open', async () => {
    const onRun = jest.fn().mockResolvedValue({
      text: 'Polish your essay.',
      threadId: null,
    });
    const { getByText, queryByText } = render(
      <AiActionBar actions={actions} onRun={onRun} onOpenInChat={jest.fn()} />,
    );

    await act(async () => {
      fireEvent.press(getByText('Am I a fit?'));
    });

    await waitFor(() => expect(getByText('Polish your essay.')).toBeTruthy());
    expect(queryByText('Open in chat')).toBeNull();
  });

  it('offers a retry when a generic failure happens', async () => {
    const onRun = jest
      .fn()
      .mockRejectedValueOnce(new Error('Something broke.'))
      .mockResolvedValueOnce({ text: 'Second time lucky.', threadId: null });
    const onUpgrade = jest.fn();
    const { getByText, queryByText } = render(
      <AiActionBar actions={actions} onRun={onRun} onUpgrade={onUpgrade} />,
    );

    await act(async () => {
      fireEvent.press(getByText('Next move'));
    });

    await waitFor(() => expect(getByText('Something broke.')).toBeTruthy());
    // A generic failure is not a billing problem — no upsell.
    expect(queryByText('Upgrade to Pro')).toBeNull();

    await act(async () => {
      fireEvent.press(getByText('Retry'));
    });

    await waitFor(() => expect(getByText('Second time lucky.')).toBeTruthy());
    expect(onRun).toHaveBeenCalledTimes(2);
  });

  it('offers Upgrade alongside Retry when the failure is a billing limit', async () => {
    const onRun = jest
      .fn()
      .mockRejectedValue(new AiActionError('You are out of credits.', 'billing'));
    const onUpgrade = jest.fn();
    const { getByText } = render(
      <AiActionBar actions={actions} onRun={onRun} onUpgrade={onUpgrade} />,
    );

    await act(async () => {
      fireEvent.press(getByText('Next move'));
    });

    await waitFor(() => expect(getByText('You are out of credits.')).toBeTruthy());
    expect(getByText('Retry')).toBeTruthy();
    fireEvent.press(getByText('Upgrade to Pro'));
    expect(onUpgrade).toHaveBeenCalled();
  });
});
