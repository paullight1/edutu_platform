import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Linking, Text, View } from 'react-native';

jest.mock('../components/context/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#FFFFFF',
      foreground: '#111827',
      accent: '#2563EB',
    },
    isDark: false,
  }),
}));

jest.mock('../components/ui/Card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => {
    const React = require('react');
    const { View } = require('react-native');
    return <View>{children}</View>;
  },
}));

jest.mock('../components/ui/ScreenHeader', () => ({
  ScreenHeader: ({ title }: { title: string }) => {
    const React = require('react');
    const { Text, View } = require('react-native');
    return (
      <View>
        <Text>{title}</Text>
      </View>
    );
  },
}));

jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const icon = (name: string) => () => <Text>{name}</Text>;
  return new Proxy(
    { __esModule: true },
    {
      get: (_target, prop) => {
        if (prop === '__esModule') return true;
        if (typeof prop === 'string') return icon(prop);
        return undefined;
      },
    },
  );
});

const alertOpenUrlSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);

const HelpScreen = require('../app/(app)/help').default;
const PrivacyScreen = require('../app/(app)/privacy').default;

function pressNearestTouchTarget(node: any) {
  let current = node;
  while (current && !current.props?.onPress) {
    current = current.parent;
  }

  if (!current) {
    throw new Error('Could not find a pressable ancestor');
  }

  current.props.onPress?.();
}

describe('mobile help and privacy screens', () => {
  beforeEach(() => {
    alertOpenUrlSpy.mockClear();
  });

  it('expands FAQs and opens support links from the help screen', async () => {
    const { getByText } = render(<HelpScreen />);

    await waitFor(() => expect(getByText('Help & Support')).toBeTruthy());
    expect(getByText('How can we help?')).toBeTruthy();

    await act(async () => {
      pressNearestTouchTarget(getByText('How do I use Edutu AI?'));
    });
    await waitFor(() => expect(getByText(/center button on your navigation bar/i)).toBeTruthy());

    await act(async () => {
      pressNearestTouchTarget(getByText('Email Support'));
    });
    expect(alertOpenUrlSpy).toHaveBeenCalledWith('mailto:support@edutu.org');

    await act(async () => {
      pressNearestTouchTarget(getByText('Visit Website'));
    });
    expect(alertOpenUrlSpy).toHaveBeenCalledWith('https://edutu.org');
  });

  it('renders the privacy policy sections and footer copy', async () => {
    const { getByText } = render(<PrivacyScreen />);

    await waitFor(() => expect(getByText('Privacy Policy')).toBeTruthy());
    expect(getByText('Your Privacy Matters')).toBeTruthy();
    expect(getByText('Data We Collect')).toBeTruthy();
    expect(getByText('How We Use It')).toBeTruthy();
    expect(getByText('Data Protection')).toBeTruthy();
    expect(getByText('Your Rights')).toBeTruthy();
    expect(getByText(/never sell your personal data/i)).toBeTruthy();
    expect(getByText('Edutu Legal')).toBeTruthy();
  });

  it('keeps the help screen FAQ toggle state local to each item', async () => {
    const { getByText, queryByText } = render(<HelpScreen />);

    await waitFor(() => expect(getByText('Frequently Asked Questions')).toBeTruthy());
    expect(queryByText(/industry-standard encryption and Clerk/i)).toBeNull();

    await act(async () => {
      pressNearestTouchTarget(getByText('Is my data secure?'));
    });
    await waitFor(() => expect(getByText(/industry-standard encryption and Clerk/i)).toBeTruthy());
  });
});
