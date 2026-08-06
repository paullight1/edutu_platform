import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockSignOut = jest.fn().mockResolvedValue(undefined);
const mockGetToken = jest.fn().mockResolvedValue('token');
const mockSetPackage = jest.fn();
const mockOpenBrowserAsync = jest.fn().mockResolvedValue(undefined);
const DEFAULT_NOTIF_SETTINGS = {
  pushEnabled: true,
  emailEnabled: false,
  hapticsEnabled: true,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
};

const mockLoadSettings = jest.fn();
const mockSaveSettings = jest.fn().mockResolvedValue(undefined);
const mockGetSettings = jest.fn(() => DEFAULT_NOTIF_SETTINGS);
const mockTriggerHaptic = jest.fn().mockResolvedValue(undefined);
const mockRequestPermissions = jest.fn().mockResolvedValue(true);
const mockRegisterPush = jest.fn().mockResolvedValue('ExponentPushToken[test]');
const mockGetStoredPushToken = jest.fn().mockResolvedValue('ExponentPushToken[test]');
const mockResetPushTokenSync = jest.fn().mockResolvedValue(undefined);
const mockGetPreferences = jest.fn();
const mockSavePreferences = jest.fn().mockResolvedValue(undefined);
const mockUnregisterPushToken = jest.fn().mockResolvedValue(undefined);
const mockUpdatePassword = jest.fn().mockResolvedValue(undefined);
const mockDeleteUser = jest.fn().mockResolvedValue(undefined);
const mockUpsert = jest.fn().mockResolvedValue({ data: null, error: null });
const alertSpy = jest.spyOn(Alert, 'alert');

let mockUserState: { user: any } = {
  user: {
    id: 'user-1',
    fullName: 'Amina Okafor',
    imageUrl: null,
    primaryEmailAddress: { emailAddress: 'amina@example.com' },
    unsafeMetadata: {
      country: 'Nigeria',
      education: 'University',
      onboardingComplete: true,
    },
    passwordEnabled: false,
    externalAccounts: [{ provider: 'google' }],
    updatePassword: mockUpdatePassword,
    delete: mockDeleteUser,
  },
};

let mockRole = 'user';
let mockMatchedOpportunities: Array<{ id: string }> = [];
let mockGoalsRows: Array<{ status: string; progress: number; deadline?: string }> = [];
let mockApplicationsCount = 0;
let mockBookmarksRows: Array<{ opportunity_id: string }> = [];
let mockBookmarkOpportunities: Array<{ title: string; deadline?: string | null; close_date?: string | null }> = [];
let mockProfileRow: Record<string, unknown> = {
  full_name: 'Amina Okafor',
  school: 'University of Lagos',
  major: 'Computer Science',
  cgpa: '3.80',
  country: 'Nigeria',
  bio: 'Scholarship applicant and community builder.',
};

const { createSupabaseMock } = require('../test-utils/supabaseMock');
const mockSupabase = {
  ...createSupabaseMock(),
  from: jest.fn(),
  functions: {
    invoke: jest.fn(),
  },
};

function makeBuilder(table: string) {
  const state: { selectArg?: string } = {};
  const builder: any = {
    select: (arg?: string) => {
      state.selectArg = arg;
      return builder;
    },
    eq: () => builder,
    in: () => builder,
    limit: () => builder,
    order: () => builder,
    insert: () => builder,
    update: () => builder,
    delete: () => builder,
    then: (resolve: any, reject: any) => {
      Promise.resolve(resolveQuery(table, state)).then(resolve, reject);
    },
    catch: (reject: any) => Promise.resolve(resolveQuery(table, state)).catch(reject),
    single: async () => resolveQuery(table, state, true),
    maybeSingle: async () => resolveQuery(table, state, true),
    upsert: mockUpsert,
  };
  return builder;
}

function resolveQuery(table: string, state: { selectArg?: string }, single = false) {
  if (table === 'profiles') {
    if ((state.selectArg || '').includes('role')) {
      return { data: { role: mockRole }, error: null };
    }
    if (single) {
      return { data: mockProfileRow, error: null };
    }
    return { data: [{ user_id: 'user-1', ...mockProfileRow }], error: null };
  }

  if (table === 'goals') {
    return { data: mockGoalsRows, error: null };
  }

  if (table === 'opportunity_applications') {
    return { data: null, error: null, count: mockApplicationsCount };
  }

  if (table === 'bookmarks') {
    return { data: mockBookmarksRows, error: null };
  }

  if (table === 'opportunities') {
    return { data: mockBookmarkOpportunities, error: null };
  }

  return { data: single ? null : [], error: null };
}

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: mockReplace }),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require('react');
    // Re-run when the callback identity changes — matches the real
    // useFocusEffect contract (screens memoize cb with useCallback).
    React.useEffect(() => cb(), [cb]);
  },
}));

jest.mock('@clerk/clerk-expo', () => ({
  useUser: () => mockUserState,
  useAuth: () => ({ signOut: mockSignOut, getToken: mockGetToken }),
}));

jest.mock('../components/context/ThemeContext', () => {
  const THEME_ORDER = [
    'default', 'ocean', 'sunset', 'forest', 'royal', 'amethyst', 'rose', 'crimson', 'graphite',
  ];
  const swatch = { bg: '#0B1220', card: '#111827', accent: '#2563EB', accentLight: '#93C5FD' };
  const THEME_SWATCHES = THEME_ORDER.reduce(
    (acc: Record<string, typeof swatch>, id: string) => {
      acc[id] = swatch;
      return acc;
    },
    {},
  );
  return {
    useTheme: () => ({
      isDark: false,
      packageId: 'default',
      colors: {
        ...require('../test-utils/themeColors').TEST_THEME_COLORS,
        background: '#FFFFFF',
        foreground: '#111827',
        card: '#FFFFFF',
        border: '#E5E7EB',
        accent: '#2563EB',
        primary: '#2563EB',
        textSecondary: '#64748B',
      },
      setPackage: mockSetPackage,
    }),
    THEME_ORDER,
    THEME_SWATCHES,
  };
});

jest.mock('../components/ui/ScreenHeader', () => ({
  ScreenHeader: ({ title, subtitle, right, showBack }: { title: string; subtitle?: string; right?: React.ReactNode; showBack?: boolean }) => {
    const React = require('react');
    const { Text, View } = require('react-native');
    return (
      <View>
        {showBack ? <Text>Back</Text> : null}
        <Text>{title}</Text>
        {subtitle ? <Text>{subtitle}</Text> : null}
        {right}
      </View>
    );
  },
}));

jest.mock('../components/ui/Card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => {
    const React = require('react');
    const { View } = require('react-native');
    return <View>{children}</View>;
  },
}));

jest.mock('../components/ui/AnimatedPressable', () => ({
  AnimatedPressable: ({ children, ...props }: { children: React.ReactNode }) => {
    const React = require('react');
    const { TouchableOpacity } = require('react-native');
    return <TouchableOpacity {...props}>{children}</TouchableOpacity>;
  },
}));

jest.mock('../components/ui/BrandedLoader', () => ({
  BrandedLoader: ({ label }: { label?: string }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return <Text>{label || 'Loading'}</Text>;
  },
}));

jest.mock('../components/ui/Avatar', () => ({
  Avatar: ({ name }: { name: string }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return <Text>{`Avatar:${name}`}</Text>;
  },
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: (...args: unknown[]) => mockOpenBrowserAsync(...args),
}));

jest.mock('../lib/notifications', () => ({
  notificationService: {
    loadSettings: (...args: unknown[]) => mockLoadSettings(...args),
    saveSettings: (...args: unknown[]) => mockSaveSettings(...args),
    getSettings: (...args: unknown[]) => mockGetSettings(...args),
    triggerHaptic: (...args: unknown[]) => mockTriggerHaptic(...args),
    requestPermissions: (...args: unknown[]) => mockRequestPermissions(...args),
  },
  registerForPushNotificationsAsync: (...args: unknown[]) => mockRegisterPush(...args),
  getStoredPushToken: (...args: unknown[]) => mockGetStoredPushToken(...args),
  resetPushTokenSync: (...args: unknown[]) => mockResetPushTokenSync(...args),
}));

jest.mock('@edutu/core/src/services/notificationPreferences', () => ({
  ...jest.requireActual('@edutu/core/src/services/notificationPreferences'),
  getNotificationPreferences: (...args: unknown[]) => mockGetPreferences(...args),
  saveNotificationPreferences: (...args: unknown[]) => mockSavePreferences(...args),
  unregisterPushToken: (...args: unknown[]) => mockUnregisterPushToken(...args),
}));

jest.mock('@edutu/core/src/utils/auth', () => ({
  toSafeUUID: (value: string) => `safe-${value}`,
}), { virtual: true });

jest.mock('@edutu/core/src/hooks/useOpportunities', () => ({
  useOpportunities: () => ({
    data: mockMatchedOpportunities,
    loading: false,
    error: null,
    refresh: jest.fn(),
  }),
}), { virtual: true });

jest.mock('../lib/supabase', () => ({
  supabase: mockSupabase,
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

const ProfileScreen = require('../app/(app)/profile/index').default;
const EditProfileScreen = require('../app/(app)/profile/edit').default;
const SettingsScreen = require('../app/(app)/profile/settings').default;

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

describe('mobile profile routes', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockBack.mockClear();
    mockReplace.mockClear();
    mockSignOut.mockClear();
    mockGetToken.mockClear();
    mockSetPackage.mockClear();
    mockOpenBrowserAsync.mockClear();
    mockLoadSettings.mockReset();
    mockSaveSettings.mockClear();
    mockGetSettings.mockClear();
    mockTriggerHaptic.mockClear();
    mockRequestPermissions.mockClear().mockResolvedValue(true);
    mockRegisterPush.mockClear();
    mockGetStoredPushToken.mockClear();
    mockResetPushTokenSync.mockClear();
    mockSavePreferences.mockClear().mockResolvedValue(undefined);
    mockUnregisterPushToken.mockClear();
    // The settings screen reconciles against the server on mount; default to
    // the same values the local cache reports so tests assert their own change.
    mockGetPreferences.mockReset().mockResolvedValue({
      pushNotifications: true,
      emailNotifications: false,
      opportunityAlerts: true,
      deadlineReminders: true,
      goalReminders: true,
      achievementCelebrations: true,
      quietHours: { start: '00:00', end: '00:00' },
    });
    mockUpdatePassword.mockClear();
    mockDeleteUser.mockClear();
    mockUpsert.mockClear();
    alertSpy.mockClear();
    mockSupabase.from.mockImplementation((table: string) => makeBuilder(table));
    mockSupabase.functions.invoke.mockReset();
    mockProfileRow = {
      full_name: 'Amina Okafor',
      school: 'University of Lagos',
      major: 'Computer Science',
      cgpa: '3.80',
      country: 'Nigeria',
      bio: 'Scholarship applicant and community builder.',
    };
    mockRole = 'user';
    mockMatchedOpportunities = [{ id: 'opp-1' }, { id: 'opp-2' }, { id: 'opp-3' }];
    mockGoalsRows = [
      { status: 'active', progress: 40, deadline: new Date(Date.now() + 2 * 86400000).toISOString() },
      { status: 'completed', progress: 100, deadline: new Date(Date.now() + 9 * 86400000).toISOString() },
      { status: 'active', progress: 10, deadline: new Date(Date.now() + 1 * 86400000).toISOString() },
    ];
    mockApplicationsCount = 5;
    mockBookmarksRows = [
      { opportunity_id: 'opp-1' },
      { opportunity_id: 'opp-2' },
    ];
    mockBookmarkOpportunities = [
      {
        title: 'Global Fellowship',
        deadline: new Date(Date.now() + 86400000).toISOString(),
      },
      {
        title: 'Tech Grant',
        close_date: new Date(Date.now() + 5 * 86400000).toISOString(),
      },
    ];
    mockUserState = {
      user: {
        id: 'user-1',
        fullName: 'Amina Okafor',
        imageUrl: null,
        primaryEmailAddress: { emailAddress: 'amina@example.com' },
        unsafeMetadata: {
          country: 'Nigeria',
          education: 'University',
          onboardingComplete: true,
        },
        passwordEnabled: false,
        externalAccounts: [{ provider: 'google' }],
        updatePassword: mockUpdatePassword,
        delete: mockDeleteUser,
      },
    };
    mockLoadSettings.mockResolvedValue({
      pushEnabled: true,
      emailEnabled: false,
      hapticsEnabled: true,
      quietHoursEnabled: false,
      quietHoursStart: '22:00',
      quietHoursEnd: '08:00',
    });
  });

  it('routes from the profile overview into primary destinations and shows stats', async () => {
    const { getByText } = render(<ProfileScreen />);

    await waitFor(() => expect(getByText('Profile')).toBeTruthy());
    // The stat cards and Edit Profile action moved to /profile/view; the
    // overview keeps the header + primary navigation menu.

    pressNearestTouchTarget(getByText('Theme & app preferences'));
    expect(mockPush).toHaveBeenCalledWith('/profile/settings');

    // Renamed Creator Studio -> Mentor Studio; the route is still /creator-dashboard.
    pressNearestTouchTarget(getByText('Mentor Studio'));
    expect(mockPush).toHaveBeenCalledWith('/creator-dashboard');

    pressNearestTouchTarget(getByText('Log Out'));
    expect(mockSignOut).toHaveBeenCalled();
  });

  it('shows admin tools when the profile role query returns admin', async () => {
    mockRole = 'admin';

    const { getByText } = render(<ProfileScreen />);

    await waitFor(() => expect(getByText('Admin')).toBeTruthy());
    expect(getByText('Creator Applications')).toBeTruthy();
    expect(getByText('Create Roadmap')).toBeTruthy();
    expect(getByText('Testimonials')).toBeTruthy();
    expect(getByText('Premium Features')).toBeTruthy();

    pressNearestTouchTarget(getByText('Creator Applications'));
    expect(mockPush).toHaveBeenCalledWith('/admin/creator-applications');

    pressNearestTouchTarget(getByText('Create Roadmap'));
    expect(mockPush).toHaveBeenCalledWith('/admin/roadmap/create');

    pressNearestTouchTarget(getByText('Testimonials'));
    expect(mockPush).toHaveBeenCalledWith('/admin/testimonials');

    pressNearestTouchTarget(getByText('Premium Features'));
    expect(mockPush).toHaveBeenCalledWith('/admin/premium-features');
  });

  it('loads profile data and saves updates from the edit screen', async () => {
    const { getByPlaceholderText, getByText } = render(<EditProfileScreen />);

    await waitFor(() => expect(getByText('Edit Profile')).toBeTruthy());
    fireEvent.changeText(getByPlaceholderText('Your full name'), 'Ada Lovelace');
    fireEvent.changeText(getByPlaceholderText('e.g., 3.8'), '3.9');

    await act(async () => {
      pressNearestTouchTarget(getByText('Save Changes'));
    });

    await waitFor(() => expect(mockSupabase.from).toHaveBeenCalledWith('profiles'));
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        full_name: 'Ada Lovelace',
        cgpa: 3.9,
        country: 'Nigeria',
      }),
      { onConflict: 'user_id' },
    );
  });

  it('turning push off unregisters this device and saves the preference server-side', async () => {
    const { getByText, getAllByRole } = render(<SettingsScreen />);
    await waitFor(() => expect(getByText('Settings')).toBeTruthy());

    await act(async () => {
      fireEvent(getAllByRole('switch')[0], 'valueChange', false);
    });

    // The switch is only honest if all three agree: local cache, this device's
    // token, and the server preference the backend actually enforces.
    await waitFor(() =>
      expect(mockSavePreferences).toHaveBeenCalledWith(expect.anything(), {
        pushNotifications: false,
      }),
    );
    expect(mockUnregisterPushToken).toHaveBeenCalledWith(
      expect.anything(),
      'ExponentPushToken[test]',
    );
    expect(mockResetPushTokenSync).toHaveBeenCalled();
    expect(mockSaveSettings).toHaveBeenCalledWith({ pushEnabled: false });
  });

  it('turning push on asks the OS first and registers the device', async () => {
    mockGetPreferences.mockResolvedValue({
      pushNotifications: false,
      emailNotifications: false,
      opportunityAlerts: true,
      deadlineReminders: true,
      goalReminders: true,
      achievementCelebrations: true,
      quietHours: { start: '00:00', end: '00:00' },
    });

    const { getByText, getAllByRole } = render(<SettingsScreen />);
    await waitFor(() => expect(getByText('Settings')).toBeTruthy());

    await act(async () => {
      fireEvent(getAllByRole('switch')[0], 'valueChange', true);
    });

    await waitFor(() => expect(mockRequestPermissions).toHaveBeenCalled());
    expect(mockRegisterPush).toHaveBeenCalled();
    await waitFor(() =>
      expect(mockSavePreferences).toHaveBeenCalledWith(expect.anything(), {
        pushNotifications: true,
      }),
    );
  });

  it('does not enable push when the OS denies permission', async () => {
    mockRequestPermissions.mockResolvedValue(false);
    mockGetPreferences.mockResolvedValue({
      pushNotifications: false,
      emailNotifications: false,
      opportunityAlerts: true,
      deadlineReminders: true,
      goalReminders: true,
      achievementCelebrations: true,
      quietHours: { start: '00:00', end: '00:00' },
    });

    const { getByText, getAllByRole } = render(<SettingsScreen />);
    await waitFor(() => expect(getByText('Settings')).toBeTruthy());

    await act(async () => {
      fireEvent(getAllByRole('switch')[0], 'valueChange', true);
    });

    // Claiming push is on while the OS blocks it would be the exact lie this
    // screen is meant to stop telling — offer the system settings instead.
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith(
      'Notifications are turned off',
      expect.stringContaining('permission'),
      expect.any(Array),
    ));
    expect(mockRegisterPush).not.toHaveBeenCalled();
    expect(mockSavePreferences).not.toHaveBeenCalled();
  });

  it('reverts the switch and warns when the server rejects the save', async () => {
    mockSavePreferences.mockRejectedValue(new Error('offline'));

    const { getByText, getAllByRole } = render(<SettingsScreen />);
    await waitFor(() => expect(getByText('Settings')).toBeTruthy());

    const emailSwitch = getAllByRole('switch')[1];
    expect(emailSwitch.props.value).toBe(false);

    await act(async () => {
      fireEvent(emailSwitch, 'valueChange', true);
    });

    // A failed save must not leave the UI claiming the setting stuck.
    await waitFor(() =>
      expect(getAllByRole('switch')[1].props.value).toBe(false),
    );
  });

  it('encodes quiet hours off as a zero-length window the backend understands', async () => {
    mockGetPreferences.mockResolvedValue({
      pushNotifications: true,
      emailNotifications: false,
      opportunityAlerts: true,
      deadlineReminders: true,
      goalReminders: true,
      achievementCelebrations: true,
      quietHours: { start: '22:00', end: '08:00' },
    });

    const { getByText, getAllByRole } = render(<SettingsScreen />);
    await waitFor(() => expect(getByText('Settings')).toBeTruthy());

    // Reconciled from the server: the window is real, so the switch reads on.
    await waitFor(() => expect(getAllByRole('switch')[3].props.value).toBe(true));

    await act(async () => {
      fireEvent(getAllByRole('switch')[3], 'valueChange', false);
    });

    await waitFor(() =>
      expect(mockSavePreferences).toHaveBeenCalledWith(expect.anything(), {
        quietHours: { start: '00:00', end: '00:00' },
      }),
    );
  });

  it('updates theme, notification settings, password setup, and support links from settings', async () => {
    const { getByText, getByPlaceholderText, getAllByRole } = render(<SettingsScreen />);

    await waitFor(() => expect(getByText('Settings')).toBeTruthy());
    await waitFor(() => expect(getByText('Add password')).toBeTruthy());

    pressNearestTouchTarget(getByText('Ocean Breeze'));
    expect(mockSetPackage).toHaveBeenCalledWith('ocean');

    const switches = getAllByRole('switch');
    await act(async () => {
      fireEvent(switches[0], 'valueChange', false);
    });
    await waitFor(() => expect(mockSaveSettings).toHaveBeenCalledWith({ pushEnabled: false }));

    fireEvent.changeText(getByPlaceholderText('New password'), 'short');
    fireEvent.changeText(getByPlaceholderText('Confirm password'), 'short');
    pressNearestTouchTarget(getByText('Add password'));
    expect(alertSpy).toHaveBeenCalledWith('Password too short', 'Use at least 8 characters.');

    fireEvent.changeText(getByPlaceholderText('New password'), 'securePass123');
    fireEvent.changeText(getByPlaceholderText('Confirm password'), 'securePass123');
    await act(async () => {
      pressNearestTouchTarget(getByText('Add password'));
    });
    await waitFor(() => expect(mockUpdatePassword).toHaveBeenCalledWith({
      newPassword: 'securePass123',
      signOutOfOtherSessions: false,
    }));

    pressNearestTouchTarget(getByText('Privacy Policy'));
    expect(mockOpenBrowserAsync).toHaveBeenCalledWith('https://edutu.org/privacy');

    pressNearestTouchTarget(getByText('Terms of Service'));
    expect(mockOpenBrowserAsync).toHaveBeenCalledWith('https://edutu.org/terms');

    pressNearestTouchTarget(getByText('Help Center'));
    expect(mockPush).toHaveBeenCalledWith('/help');
  });
});
