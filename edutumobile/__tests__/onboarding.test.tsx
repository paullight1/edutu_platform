import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '../components/context/ThemeContext';

jest.mock('@react-native-async-storage/async-storage', () => ({
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
}));

// Mock dependencies
jest.mock('expo-router', () => ({
    useRouter: () => ({
        push: jest.fn(),
        replace: jest.fn(),
    }),
}));

jest.mock('@clerk/clerk-expo', () => ({
    useAuth: () => ({
        isSignedIn: false,
        getToken: jest.fn(),
    }),
    useUser: () => ({
        user: { update: jest.fn(), reload: jest.fn() },
        isLoaded: true,
    }),
    useOAuth: () => ({
        startOAuthFlow: jest.fn(),
    }),
}));

jest.mock('expo-linear-gradient', () => ({
    LinearGradient: ({ children }: { children: any }) => children,
}));

jest.mock('expo-blur', () => ({
    BlurView: ({ children }: { children: any }) => children,
}));

jest.mock('../components/ui/VideoCard', () => {
    const React = require('react');
    const { Text } = require('react-native');
    return () => <Text>Video Card</Text>;
});
jest.mock('../components/ui/ReviewCard', () => {
    const React = require('react');
    const { Text } = require('react-native');
    return () => <Text>Review Card</Text>;
});
jest.mock('../components/ui/LandingCTA', () => {
    const React = require('react');
    const { Text } = require('react-native');
    return () => <Text>Landing CTA</Text>;
});

const OnboardingWelcome = require('../app/onboarding-welcome').default;
const OnboardingScreen = require('../app/onboarding').default;

describe('Onboarding Revamp', () => {
    it('renders onboarding welcome with correct steps', async () => {
        const { findByText } = render(
            <ThemeProvider>
                <OnboardingWelcome />
            </ThemeProvider>
        );
        expect(await findByText(/Find real opportunities/i)).toBeTruthy();
    });

    it('renders functional onboarding screen', async () => {
        const { findByText } = render(
            <ThemeProvider>
                <OnboardingScreen />
            </ThemeProvider>
        );
        expect(await findByText(/Basic Info/i)).toBeTruthy();
    });
});
