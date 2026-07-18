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

const { AiActionBar } = require('../components/ai/AiActionBar');

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
    const onRun = jest.fn().mockResolvedValue("You're a strong fit — apply.");
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

  it('shows an error message when the action fails', async () => {
    const onRun = jest.fn().mockRejectedValue(new Error('Out of credits.'));
    const { getByText } = render(
      <AiActionBar actions={actions} onRun={onRun} />,
    );

    await act(async () => {
      fireEvent.press(getByText('Next move'));
    });

    await waitFor(() => expect(getByText('Out of credits.')).toBeTruthy());
  });
});
