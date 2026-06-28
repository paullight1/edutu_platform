import React from 'react';
import { act, render } from '@testing-library/react-native';
import { Text, View } from 'react-native';

const mockReplace = jest.fn();
const mockPush = jest.fn();

let mockAuthState: { isLoaded: boolean; isSignedIn: boolean };
let mockUserState: { user: { unsafeMetadata?: { onboardingComplete?: boolean } } | null };

jest.mock('expo-router', () => {
  const React = require('react');
  const { Text, View } = require('react-native');

  const Stack = ({ children }: { children?: React.ReactNode }) => <View>{children}</View>;
  Stack.Screen = () => null;

  return {
    useRouter: () => ({ replace: mockReplace, push: mockPush }),
    Redirect: ({ href }: { href: string }) => <Text>{`Redirect:${href}`}</Text>,
    Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Stack,
  };
});

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => mockAuthState,
  useUser: () => mockUserState,
}));

jest.mock('../components/context/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#FFFFFF',
      foreground: '#111827',
      textSecondary: '#6B7280',
      card: '#FFFFFF',
      border: '#E5E7EB',
      accent: '#2563EB',
    },
    isDark: false,
  }),
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
}));

jest.mock('../components/ui/BrandedLoader', () => ({
  BrandedLoader: ({ label }: { label?: string }) => {
    const { Text } = require('react-native');
    return <Text>{label || 'Loading'}</Text>;
  },
}));

const SplashScreen = require('../app/index').default;
const AuthRoutesLayout = require('../app/(auth)/_layout').default;

describe('mobile entry routing', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockReplace.mockClear();
    mockPush.mockClear();
    mockAuthState = { isLoaded: true, isSignedIn: false };
    mockUserState = { user: null };
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('routes unauthenticated users to onboarding welcome after the splash delay', () => {
    render(<SplashScreen />);

    act(() => {
      jest.advanceTimersByTime(1700);
    });

    expect(mockReplace).toHaveBeenCalledWith('/onboarding-welcome');
  });

  it('routes signed-in users without onboarding to onboarding', () => {
    mockAuthState.isSignedIn = true;
    mockUserState = { user: { unsafeMetadata: { onboardingComplete: false } } };

    render(<SplashScreen />);

    act(() => {
      jest.advanceTimersByTime(1700);
    });

    expect(mockReplace).toHaveBeenCalledWith('/onboarding');
  });

  it('routes signed-in users with onboarding complete to the app shell', () => {
    mockAuthState.isSignedIn = true;
    mockUserState = { user: { unsafeMetadata: { onboardingComplete: true } } };

    render(<SplashScreen />);

    act(() => {
      jest.advanceTimersByTime(1700);
    });

    expect(mockReplace).toHaveBeenCalledWith('/(app)');
  });

  it('shows the auth loader while Clerk is still loading', () => {
    mockAuthState.isLoaded = false;

    const { getByText } = render(<AuthRoutesLayout />);

    expect(getByText('Loading')).toBeTruthy();
  });

  it('redirects signed-in auth users back into the app flow', () => {
    mockAuthState = { isLoaded: true, isSignedIn: true };
    mockUserState = { user: { unsafeMetadata: { onboardingComplete: false } } };

    const { getByText } = render(<AuthRoutesLayout />);

    expect(getByText('Redirect:/onboarding')).toBeTruthy();
  });

  it('redirects onboarded signed-in auth users to the app shell', () => {
    mockAuthState = { isLoaded: true, isSignedIn: true };
    mockUserState = { user: { unsafeMetadata: { onboardingComplete: true } } };

    const { getByText } = render(<AuthRoutesLayout />);

    expect(getByText('Redirect:/(app)')).toBeTruthy();
  });
});
