import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, Text, TouchableOpacity, View, Switch } from 'react-native';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockSignOut = jest.fn().mockResolvedValue(undefined);
const mockGetToken = jest.fn().mockResolvedValue('token');
const mockSetPackage = jest.fn();
const mockOpenBrowserAsync = jest.fn().mockResolvedValue(undefined);
const mockLoadSettings = jest.fn();
const mockSaveSettings = jest.fn().mockResolvedValue(undefined);
const mockTriggerHaptic = jest.fn().mockResolvedValue(undefined);
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

const mockSupabase = {
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
    upsert: mockUpsert,
  };
  return builder;
}

function resolveQuery(table: string, state: { selectArg?: string }, single = false) {
  if (table === 'profiles') {
    if ((state.selectArg || '').includes('role')) {
      return { data: { role: mockRole }, error: null };
    }
    return { data: mockProfileRow, error: null };
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
}));

jest.mock('@clerk/clerk-expo', () => ({
  useUser: () => mockUserState,
  useAuth: () => ({ signOut: mockSignOut, getToken: mockGetToken }),
}));

jest.mock('../components/context/ThemeContext', () => ({
  useTheme: () => ({
    isDark: false,
    packageId: 'default',
    colors: {
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
}));

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
    triggerHaptic: (...args: unknown[]) => mockTriggerHaptic(...args),
    requestPermissions: jest.fn(),
  },
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
    mockTriggerHaptic.mockClear();
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
    await waitFor(() => expect(getByText('Tomorrow')).toBeTruthy());
    expect(getByText('Active goals')).toBeTruthy();
    expect(getByText('Matches')).toBeTruthy();
    expect(getByText('Applied')).toBeTruthy();
    expect(getByText('Deadline')).toBeTruthy();

    pressNearestTouchTarget(getByText('Edit Profile'));
    expect(mockPush).toHaveBeenCalledWith('/profile/edit');

    pressNearestTouchTarget(getByText('Theme & app preferences'));
    expect(mockPush).toHaveBeenCalledWith('/profile/settings');

    pressNearestTouchTarget(getByText('Creator Studio'));
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
        user_id: 'safe-user-1',
        full_name: 'Ada Lovelace',
        cgpa: 3.9,
        country: 'Nigeria',
      }),
      { onConflict: 'user_id' },
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
