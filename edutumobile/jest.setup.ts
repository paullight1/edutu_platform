import { jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// expo-localization is a native module; lib/i18n already tolerates it being
// absent (falls back to English), so an empty mock is enough for tests.
jest.mock('expo-localization', () => ({}), { virtual: true });

// Initialize i18next (English catalogs) so components render real strings
// instead of raw keys under test.
require('./lib/i18n');

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
    useReducedMotion: () => false,
    withTiming: <T>(value: T) => value,
    withSpring: <T>(value: T) => value,
    withDelay: (_delay: number, value: unknown) => value,
    withSequence: (...values: unknown[]) => values[values.length - 1],
    withRepeat: (value: unknown) => value,
    withDecay: <T>(value: T) => value,
    interpolate: () => 0,
    interpolateColor: () => '#000000',
    Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
    Extrapolate: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
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
    LinearTransition: reanimatedBuilder,
    PinwheelIn: reanimatedBuilder,
    ZoomIn: reanimatedBuilder,
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

jest.mock('expo-glass-effect', () => {
  const { View } = require('react-native');
  return {
    GlassView: View,
    isLiquidGlassAvailable: () => false,
  };
});

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  getPermissionsAsync: jest.fn(async () => ({ granted: true })),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: 'ExponentPushToken[test]' })),
  setNotificationChannelAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(async () => 'notification-id'),
  cancelScheduledNotificationAsync: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
}));

jest.mock('expo-calendar', () => ({
  requestCalendarPermissionsAsync: jest.fn(async () => ({ granted: true })),
  getCalendarsAsync: jest.fn(async () => []),
  createCalendarAsync: jest.fn(async () => 'calendar-id'),
  createEventAsync: jest.fn(async () => 'event-id'),
  EntityTypes: { EVENT: 'event' },
  CalendarType: { LOCAL: 'local' },
}));

// Native audio/speech/file modules used by edutuSpeech (chat TTS + voice
// mode): no native runtime in jest, so stub the surface the app touches.
jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(() => ({
    play: jest.fn(),
    pause: jest.fn(),
    remove: jest.fn(),
    seekTo: jest.fn(),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  })),
  useAudioPlayer: jest.fn(() => ({ play: jest.fn(), pause: jest.fn(), seekTo: jest.fn() })),
  setAudioModeAsync: jest.fn(async () => undefined),
  AudioModule: {
    requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })),
    getRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })),
  },
  RecordingPresets: { HIGH_QUALITY: {}, LOW_QUALITY: {} },
  useAudioRecorder: jest.fn(() => ({
    record: jest.fn(),
    stop: jest.fn(async () => undefined),
    uri: null,
    isRecording: false,
    getStatus: jest.fn(() => ({ durationMillis: 0, metering: -60 })),
  })),
}));

jest.mock('expo-speech', () => ({
  speak: jest.fn(),
  stop: jest.fn(),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: {} }, manifest: {} },
}));

jest.mock('expo-blur', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { BlurView: (props: Record<string, unknown>) => React.createElement(View, props) };
});

jest.mock('expo-linear-gradient', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { LinearGradient: (props: Record<string, unknown>) => React.createElement(View, props) };
});

jest.mock('expo-file-system', () => ({
  File: class MockFile {
    uri = 'file://mock';
    exists = false;
    size = 0;
    write() {}
    delete() {}
  },
  Paths: { cache: 'file://cache' },
  documentDirectory: 'file://docs/',
  cacheDirectory: 'file://cache/',
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

// Ships untranspiled ESM that jest's transformIgnorePatterns excludes; mock
// it wholesale (tests never exercise real purchases).
jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    getOfferings: jest.fn(async () => ({ current: null })),
    getCustomerInfo: jest.fn(async () => ({ entitlements: { active: {} } })),
    purchasePackage: jest.fn(),
    restorePurchases: jest.fn(async () => ({ entitlements: { active: {} } })),
    addCustomerInfoUpdateListener: jest.fn(),
    removeCustomerInfoUpdateListener: jest.fn(),
    logIn: jest.fn(),
    logOut: jest.fn(),
    setLogLevel: jest.fn(),
  },
  LOG_LEVEL: { VERBOSE: 'VERBOSE', ERROR: 'ERROR' },
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
