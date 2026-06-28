import { jest } from '@jest/globals';

process.env.EXPO_PUBLIC_SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://example.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'test-anon-key';
process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY || 'pk_test_mock';

const reanimatedBuilder = {
  duration: () => reanimatedBuilder,
  delay: () => reanimatedBuilder,
  springify: () => reanimatedBuilder,
};

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');
  const AnimatedView = React.forwardRef((props: Record<string, unknown>, ref: unknown) =>
    React.createElement(View, { ...props, ref }, props.children)
  );

  return {
    __esModule: true,
    default: {
      View: AnimatedView,
      Text: AnimatedView,
      ScrollView: AnimatedView,
      FlatList: AnimatedView,
      Image: AnimatedView,
      createAnimatedComponent: (Component: React.ComponentType<any>) => Component,
    },
    View: AnimatedView,
    Text: AnimatedView,
    ScrollView: AnimatedView,
    FlatList: AnimatedView,
    Image: AnimatedView,
    createAnimatedComponent: (Component: React.ComponentType<any>) => Component,
    useSharedValue: <T>(value: T) => ({ value }),
    useAnimatedStyle: (updater?: () => Record<string, unknown>) => (updater ? updater() : {}),
    useAnimatedProps: (updater?: () => Record<string, unknown>) => (updater ? updater() : {}),
    useDerivedValue: <T>(updater: () => T) => ({ value: updater() }),
    withTiming: <T>(value: T) => value,
    withSpring: <T>(value: T) => value,
    withDelay: (_delay: number, value: unknown) => value,
    withSequence: (...values: unknown[]) => values[values.length - 1],
    withRepeat: (value: unknown) => value,
    withDecay: <T>(value: T) => value,
    interpolate: () => 0,
    interpolateColor: () => '#000000',
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
    runOnUI: (fn: (...args: unknown[]) => unknown) => fn,
    cancelAnimation: () => {},
    Easing: {
      linear: jest.fn(),
      ease: jest.fn(),
      quad: jest.fn(),
      cubic: jest.fn(),
      out: jest.fn((fn) => fn),
      in: jest.fn((fn) => fn),
      inOut: jest.fn((fn) => fn),
    },
    FadeIn: reanimatedBuilder,
    FadeInDown: reanimatedBuilder,
    FadeInUp: reanimatedBuilder,
    FadeOut: reanimatedBuilder,
    FadeOutUp: reanimatedBuilder,
    Layout: reanimatedBuilder,
    SlideInRight: reanimatedBuilder,
    SlideOutLeft: reanimatedBuilder,
  };
});

jest.mock('react-native-worklets', () => ({
  __esModule: true,
  default: {},
  createSerializable: <T>(value: T) => value,
  isWorkletFunction: () => false,
  makeShareableCloneRecursive: <T>(value: T) => value,
  makeMutable: <T>(value: T) => ({ value }),
  runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
  runOnUI: (fn: (...args: unknown[]) => unknown) => fn,
  useSharedValue: <T>(value: T) => ({ value }),
}));

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    WebView: (props: Record<string, unknown>) => React.createElement(View, props),
  };
});

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});
