import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: jest.fn(),
    canGoBack: () => true,
    replace: jest.fn(),
  }),
}));

jest.mock('../components/context/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#FFFFFF',
      foreground: '#111827',
    },
    isDark: false,
  }),
}));

jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    ChevronLeft: () => <View />,
  };
});

const { ScreenHeader } = require('../components/ui/ScreenHeader');

describe('ScreenHeader accessibility', () => {
  it('names the back control for assistive technology', () => {
    const { getByRole } = render(<ScreenHeader title="Become a Mentor" showBack />);

    expect(getByRole('button', { name: 'Back' })).toBeTruthy();
  });
});
