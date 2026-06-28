import React from 'react';
import { Alert, Text, View } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockGoogleOAuth = jest.fn();
const mockAppleOAuth = jest.fn();

let mockAuthState: { isSignedIn: boolean };
let mockUserState: { user: { unsafeMetadata?: { onboardingComplete?: boolean } } | null };
let mockSignInState: {
  isLoaded: boolean;
  signIn: { create: jest.Mock };
  setActive: jest.Mock;
};
let mockSignUpState: {
  isLoaded: boolean;
  signUp: {
    create: jest.Mock;
    prepareEmailAddressVerification: jest.Mock;
    attemptEmailAddressVerification: jest.Mock;
  };
  setActive: jest.Mock;
};

jest.mock('expo-router', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    useRouter: () => ({ replace: mockReplace, push: mockPush }),
    Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => mockAuthState,
  useUser: () => mockUserState,
  useSignIn: () => mockSignInState,
  useSignUp: () => mockSignUpState,
  useOAuth: ({ strategy }: { strategy: string }) => ({
    startOAuthFlow: strategy === 'oauth_google' ? mockGoogleOAuth : mockAppleOAuth,
  }),
}));

jest.mock('../components/auth/AuthShell', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  return {
    AuthShell: ({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) => (
      <View>
        <Text>{title}</Text>
        <Text>{subtitle}</Text>
        {children}
      </View>
    ),
  };
});

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

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
}));

jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const icon = (name: string) => () => <Text>{name}</Text>;
  return {
    ArrowRight: icon('ArrowRight'),
    Eye: icon('Eye'),
    EyeOff: icon('EyeOff'),
    Lock: icon('Lock'),
    LogIn: icon('LogIn'),
    Mail: icon('Mail'),
    Sparkles: icon('Sparkles'),
    User: icon('User'),
  };
});

const SignInScreen = require('../app/(auth)/sign-in').default;
const SignUpScreen = require('../app/(auth)/sign-up').default;

const invalidPasswordError = {
  errors: [
    {
      code: 'form_password_incorrect',
      message: 'Incorrect password',
      longMessage: 'Incorrect password',
    },
  ],
  message: 'Incorrect password',
};

describe('mobile auth screens', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockPush.mockClear();
    mockGoogleOAuth.mockReset();
    mockAppleOAuth.mockReset();
    mockAuthState = { isSignedIn: false };
    mockUserState = { user: null };
    mockSignInState = {
      isLoaded: true,
      signIn: {
        create: jest.fn().mockRejectedValue(invalidPasswordError),
      },
      setActive: jest.fn().mockResolvedValue(undefined),
    };
    mockSignUpState = {
      isLoaded: true,
      signUp: {
        create: jest.fn().mockResolvedValue(undefined),
        prepareEmailAddressVerification: jest.fn().mockResolvedValue(undefined),
        attemptEmailAddressVerification: jest.fn(),
      },
      setActive: jest.fn().mockResolvedValue(undefined),
    };
  });

  it('blocks sign-up submission when required fields are missing', () => {
    const { getByText } = render(<SignUpScreen />);

    fireEvent.press(getByText('Create account'));

    expect(getByText('Enter your full name.')).toBeTruthy();
    expect(mockSignUpState.signUp.create).not.toHaveBeenCalled();
  });

  it('blocks sign-up submission when the password is too short', () => {
    const { getByPlaceholderText, getByText } = render(<SignUpScreen />);

    fireEvent.changeText(getByPlaceholderText('John Doe'), 'Ada Lovelace');
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'ada@example.com');
    fireEvent.changeText(getByPlaceholderText('Minimum 8 characters'), 'short');
    fireEvent.press(getByText('Create account'));

    expect(getByText('Password must be at least 8 characters.')).toBeTruthy();
    expect(mockSignUpState.signUp.create).not.toHaveBeenCalled();
  });

  it('completes the sign-up verification flow and routes to onboarding', async () => {
    mockSignUpState.signUp.create.mockResolvedValueOnce(undefined);
    mockSignUpState.signUp.prepareEmailAddressVerification.mockResolvedValueOnce(undefined);
    mockSignUpState.signUp.attemptEmailAddressVerification.mockResolvedValueOnce({
      status: 'complete',
      createdSessionId: 'session-1',
    });

    const { getByPlaceholderText, getByText } = render(<SignUpScreen />);

    fireEvent.changeText(getByPlaceholderText('John Doe'), 'Ada Lovelace');
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'ada@example.com');
    fireEvent.changeText(getByPlaceholderText('Minimum 8 characters'), 'strong-pass');
    fireEvent.press(getByText('Create account'));

    await waitFor(() => expect(mockSignUpState.signUp.prepareEmailAddressVerification).toHaveBeenCalledTimes(1));
    expect(getByText('Verify and continue')).toBeTruthy();

    fireEvent.changeText(getByPlaceholderText('000000'), '123456');
    fireEvent.press(getByText('Verify and continue'));

    await waitFor(() => expect(mockSignUpState.setActive).toHaveBeenCalledWith({ session: 'session-1' }));
    expect(mockReplace).toHaveBeenCalledWith('/onboarding');
  });

  it('shows the recovery hint after repeated sign-in password failures', async () => {
    mockSignInState.signIn.create.mockRejectedValue(invalidPasswordError);

    const { getByPlaceholderText, getByText } = render(<SignInScreen />);

    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'user@example.com');
    fireEvent.changeText(getByPlaceholderText('Enter password'), 'wrong-password');

    fireEvent.press(getByText('Sign in'));

    await waitFor(() => expect(getByText('Incorrect password')).toBeTruthy());

    fireEvent.press(getByText('Sign in'));

    await waitFor(() =>
      expect(
        getByText(
          'That password did not work. If you created your account with Google or Apple, use that sign-in option above.',
        ),
      ).toBeTruthy(),
    );
  });

  it('shows the reset-password alert when no email address is present', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());

    try {
      const { getByText } = render(<SignInScreen />);

      fireEvent.press(getByText('Forgot password?'));

      expect(alertSpy).toHaveBeenCalledWith('Email required', 'Enter your email address first.');
    } finally {
      alertSpy.mockRestore();
    }
  });
});
