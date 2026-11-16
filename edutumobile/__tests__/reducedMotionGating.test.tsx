import React from 'react';
import { Animated } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';

const Reanimated = require('react-native-reanimated');

// Both components under test call useTheme() directly; mocking the module
// gives each spec full control over reducedMotion without waiting on
// ThemeProvider's AsyncStorage-backed load.
let mockReducedMotion = false;
jest.mock('../components/context/ThemeContext', () => ({
  useTheme: () => ({
    isDark: false,
    colors: { accent: '#6366F1', accentLight: '#818CF8' },
    reducedMotion: mockReducedMotion,
  }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
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

describe('reducedMotion gates infinite loops on the AI surfaces', () => {
  beforeEach(() => {
    mockReducedMotion = false;
    jest.restoreAllMocks();
  });

  // WelcomeHintSystem's icon pulse uses the classic Animated API (react-native
  // core), gated on reducedMotion the same way chat.tsx's TypingDot gates its
  // reanimated withRepeat.
  describe('WelcomeHintSystem icon pulse', () => {
    const { WelcomeHintSystem } = require('../components/ui/WelcomeHintSystem');

    it('starts an infinite loop when reducedMotion is off', async () => {
      const loopSpy = jest.spyOn(Animated, 'loop');
      render(<WelcomeHintSystem userId="user-1" enabled isDark={false} />);
      await waitFor(() => expect(loopSpy).toHaveBeenCalled());
    });

    it('never starts the loop when reducedMotion is on', async () => {
      mockReducedMotion = true;
      const loopSpy = jest.spyOn(Animated, 'loop');
      const { findByText } = render(<WelcomeHintSystem userId="user-2" enabled isDark={false} />);
      // Wait for the hint card to actually mount (the AsyncStorage-backed
      // "seen this before" check settles asynchronously) before asserting
      // the loop never ran.
      await findByText('Use Home as your daily overview.');
      expect(loopSpy).not.toHaveBeenCalled();
    });
  });

  // ProUpgradeModal's PulsingCrown uses reanimated withRepeat, gated the same
  // way — a static, fully-opaque crown instead of an unconditional pulse.
  describe('ProUpgradeModal PulsingCrown', () => {
    const { ProUpgradeModal } = require('../components/cv/ProUpgradeModal');

    it('drives withRepeat when reducedMotion is off', () => {
      const withRepeatSpy = jest.spyOn(Reanimated, 'withRepeat');
      render(
        <ProUpgradeModal
          visible
          onClose={jest.fn()}
          feature="Roadmaps"
          trialUsed={false}
          onTrialActivated={jest.fn()}
        />,
      );
      expect(withRepeatSpy).toHaveBeenCalled();
    });

    it('cancels/skips withRepeat when reducedMotion is on', () => {
      mockReducedMotion = true;
      const withRepeatSpy = jest.spyOn(Reanimated, 'withRepeat');
      const cancelSpy = jest.spyOn(Reanimated, 'cancelAnimation');
      render(
        <ProUpgradeModal
          visible
          onClose={jest.fn()}
          feature="Roadmaps"
          trialUsed={false}
          onTrialActivated={jest.fn()}
        />,
      );
      expect(withRepeatSpy).not.toHaveBeenCalled();
      expect(cancelSpy).toHaveBeenCalled();
    });
  });
});
