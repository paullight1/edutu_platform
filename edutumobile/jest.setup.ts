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
  // The real API returns both `granted` and `status`; callers use either.
  requestPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted' })),
  getPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted' })),
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

// The icon sets pull in expo-font -> expo-modules-core, whose native
// EventEmitter throws under jest. The discovery tiles use Ionicons for their
// filled glyphs, so every screen importing them needs this.
jest.mock('@expo/vector-icons/Ionicons', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) => React.createElement(View, props),
  };
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

// expo-web-browser + expo-auth-session pull in expo-modules-core's native
// EventEmitter at import time, which throws under jest. Stub the surface the
// Google SSO button touches so suites that import it can render.
jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
  warmUpAsync: jest.fn(async () => undefined),
  coolDownAsync: jest.fn(async () => undefined),
  openBrowserAsync: jest.fn(async () => ({ type: 'cancel' })),
  openAuthSessionAsync: jest.fn(async () => ({ type: 'cancel' })),
  dismissBrowser: jest.fn(),
}));

jest.mock('expo-auth-session', () => ({
  makeRedirectUri: jest.fn(() => 'https://mock.edutu/redirect'),
  useAuthRequest: jest.fn(() => [null, null, jest.fn()]),
  useAutoDiscovery: jest.fn(() => null),
  exchangeCodeAsync: jest.fn(async () => ({})),
  ResponseType: { Code: 'code', Token: 'token' },
  Prompt: { SelectAccount: 'select_account', Login: 'login' },
}));

// The rest of the native expo modules import expo-modules-core's EventEmitter
// at load time (throws under jest), so stub the surface the app touches.
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(async () => ({ canceled: true, assets: null })),
}));

jest.mock('expo-print', () => ({
  printToFileAsync: jest.fn(async () => ({ uri: 'file://mock.pdf' })),
  printAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: null })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true, assets: null })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  MediaTypeOptions: { Images: 'Images', All: 'All', Videos: 'Videos' },
  MediaType: { Images: 'images' },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-linking', () => ({
  createURL: jest.fn((path: string) => `edutu://${path}`),
  openURL: jest.fn(async () => undefined),
  parse: jest.fn(() => ({ path: '', queryParams: {} })),
  useURL: jest.fn(() => null),
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  getInitialURL: jest.fn(async () => null),
}));

jest.mock('expo-background-task', () => ({
  registerTaskAsync: jest.fn(async () => undefined),
  unregisterTaskAsync: jest.fn(async () => undefined),
  getStatusAsync: jest.fn(async () => 1),
  BackgroundTaskStatus: { Available: 1, Restricted: 2 },
  BackgroundTaskResult: { Success: 1, Failed: 2 },
}));

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn(async () => false),
  isTaskDefined: jest.fn(() => false),
  unregisterAllTasksAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-updates', () => ({
  reloadAsync: jest.fn(async () => undefined),
  checkForUpdateAsync: jest.fn(async () => ({ isAvailable: false })),
  fetchUpdateAsync: jest.fn(async () => ({ isNew: false })),
  useUpdates: jest.fn(() => ({ isUpdateAvailable: false, isUpdatePending: false })),
  channel: null,
  runtimeVersion: 'test',
  isEnabled: false,
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
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});
