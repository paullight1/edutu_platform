import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { FeatureMenu } from '../FeatureMenu';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

jest.mock('../../branding/EdutuLogo', () => ({
  EdutuLogo: () => null,
}));

jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return new Proxy({}, {
    get: (_target: object, name: PropertyKey) => {
      if (name === '__esModule') return true;
      return () => <Text>{String(name)}</Text>;
    },
  });
});

describe('FeatureMenu', () => {
  it('attaches the swipe responder and preserves explicit close control', () => {
    const onClose = jest.fn();
    const { getByLabelText, getByTestId } = render(
      <FeatureMenu
        visible
        onClose={onClose}
        isDark={false}
        colors={{ background: '#FFFFFF', foreground: '#111827' }}
      />,
    );
    const drawer = getByTestId('feature-menu-underlay');
    expect(typeof drawer.props.onMoveShouldSetResponder).toBe('function');
    expect(typeof drawer.props.onMoveShouldSetResponderCapture).toBe('function');
    expect(typeof drawer.props.onResponderRelease).toBe('function');

    fireEvent.press(getByLabelText('Close menu'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
