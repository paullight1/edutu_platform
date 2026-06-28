import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, Text, View, TouchableOpacity } from 'react-native';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockGetToken = jest.fn().mockResolvedValue('token');
const mockFetchSavedOpportunities = jest.fn();
const mockUnsaveOpportunity = jest.fn().mockResolvedValue(true);
const mockMarkAsRead = jest.fn().mockResolvedValue(undefined);
const mockDeleteNotification = jest.fn().mockResolvedValue(undefined);
const mockRefreshCredits = jest.fn().mockResolvedValue(undefined);
const mockUpdateGoal = jest.fn().mockResolvedValue(undefined);
const mockDeleteGoal = jest.fn().mockResolvedValue(undefined);
const mockInitRevenueCat = jest.fn().mockResolvedValue(false);
const mockGetOfferings = jest.fn();
const mockPurchasePackage = jest.fn();
const mockRestorePurchases = jest.fn();

let mockUserState: {
  user: {
    id: string;
    passwordEnabled?: boolean;
    externalAccounts?: Array<{ provider: string }>;
    unsafeMetadata?: { onboardingComplete?: boolean };
  } | null;
};
let mockSavedBookmarks: Array<{
  id: string;
  opportunity_id: string;
  title: string;
  organization: string;
  deadline: string | null;
  category?: string | null;
  location?: string | null;
  image?: string | null;
  match_score?: number | null;
  created_at?: string | null;
}>;
let mockNotifications: Array<{
  id: string;
  kind: string;
  title: string;
  body: string;
  severity?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
}>;
let mockUnreadCount = 0;
let mockCredits = 0;
let mockCreditsLoading = false;
let mockTransactions: Array<{
  id: string;
  amount: number;
  description?: string;
  type?: string;
  created_at: string;
}> = [];
let mockIsPro = false;
let mockProLoading = false;
let mockGoals: Array<{
  id: string;
  title: string;
  status: string;
  source: string;
  deadline?: string | null;
  notification_id?: string | null;
  progress?: number;
  opportunity_title?: string | null;
}> = [];
let mockGoalsLoading = false;
let mockGoalBookmarkRows: Array<{ id: string; opportunity_id: string }> = [];

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: () => ({ push: mockPush, replace: mockReplace }),
    Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => ({ getToken: mockGetToken }),
  useUser: () => mockUserState,
}));

jest.mock('../components/context/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#FFFFFF',
      foreground: '#111827',
      textSecondary: '#64748B',
      card: '#FFFFFF',
      border: '#E5E7EB',
      accent: '#2563EB',
    },
    isDark: false,
  }),
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

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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

jest.mock('../components/ui/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('../components/ui/EmptyState', () => ({
  EmptyState: ({ variant, title, description, actionLabel, onAction }: {
    variant?: string;
    title?: string;
    description?: string;
    actionLabel?: string;
    onAction?: () => void;
  }) => {
    const React = require('react');
    const { Text, View, TouchableOpacity } = require('react-native');
    return (
      <View>
        <Text>{title || (variant === 'saved' ? 'No saved opportunities' : 'Empty state')}</Text>
        {description ? <Text>{description}</Text> : null}
        {actionLabel ? (
          <TouchableOpacity onPress={onAction}>
            <Text>{actionLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  },
}));

jest.mock('../components/ui/Skeleton', () => ({
  OpportunityCardSkeleton: () => {
    const React = require('react');
    const { Text } = require('react-native');
    return <Text>Opportunity skeleton</Text>;
  },
}));

jest.mock('../components/ui/BrandedLoader', () => ({
  BrandedLoader: ({ label }: { label?: string }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return <Text>{label || 'Loading'}</Text>;
  },
}));

jest.mock('../components/ui/AdBanner', () => ({
  AdBanner: ({
    config,
    onPress,
    onClose,
    showClose,
  }: {
    config: { title: string; subtitle: string; actionLabel: string };
    onPress?: () => void;
    onClose?: () => void;
    showClose?: boolean;
  }) => {
    const React = require('react');
    const { Text, View, TouchableOpacity } = require('react-native');
    return (
      <View>
        <Text>{config.title}</Text>
        <Text>{config.subtitle}</Text>
        <TouchableOpacity onPress={onPress}>
          <Text>{config.actionLabel}</Text>
        </TouchableOpacity>
        {showClose ? (
          <TouchableOpacity onPress={onClose}>
            <Text>Close</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  },
}));

jest.mock('../components/goals', () => ({
  GoalCard: ({ goal }: { goal: { title: string } }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return <Text>{goal.title}</Text>;
  },
  GoalCalendar: ({ goals, opportunities }: { goals: Array<unknown>; opportunities: Array<unknown> }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return <Text>{`GoalCalendar:${goals.length}:${opportunities.length}`}</Text>;
  },
  UpcomingGoalCard: ({ goal }: { goal: { title: string } }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return <Text>{goal.title}</Text>;
  },
  useFilteredGoals: ({ goals }: { goals: Array<unknown> }) => ({ filteredGoals: goals }),
}));

jest.mock('../packages/core/src/services/bookmarks', () => ({
  fetchSavedOpportunities: (...args: unknown[]) => mockFetchSavedOpportunities(...args),
  unsaveOpportunity: (...args: unknown[]) => mockUnsaveOpportunity(...args),
}));

jest.mock('../lib/supabase', () => ({
  supabase: {
    from: jest.fn((table: string) => {
      if (table === 'bookmarks') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(async () => ({ data: mockGoalBookmarkRows, error: null })),
          })),
        };
      }

      return {
        select: jest.fn(() => ({
          eq: jest.fn(async () => ({ data: [], error: null })),
          in: jest.fn(async () => ({ data: [], error: null })),
        })),
      };
    }),
  },
}));

jest.mock('../lib/notifications', () => ({
  notificationService: {
    notify: jest.fn(),
    triggerHaptic: jest.fn().mockResolvedValue(undefined),
    scheduleGoalReminder: jest.fn().mockResolvedValue(undefined),
    cancelNotification: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@edutu/core/src/hooks/useNotifications', () => ({
  useNotifications: () => ({
    notifications: mockNotifications,
    unreadCount: mockUnreadCount,
    isLoading: false,
    markAsRead: (...args: unknown[]) => mockMarkAsRead(...args),
    deleteNotification: (...args: unknown[]) => mockDeleteNotification(...args),
  }),
}), { virtual: true });

jest.mock('@edutu/core/src/hooks/useCredits', () => ({
  useCredits: () => ({
    credits: mockCredits,
    isLoading: mockCreditsLoading,
    transactions: mockTransactions,
    refreshCredits: (...args: unknown[]) => mockRefreshCredits(...args),
  }),
}), { virtual: true });

jest.mock('@edutu/core/src/hooks/useProStatus', () => ({
  useProStatus: () => ({
    isPro: mockIsPro,
    isLoading: mockProLoading,
  }),
}), { virtual: true });

jest.mock('@edutu/core/src/hooks/useGoals', () => ({
  useGoals: () => ({
    goals: mockGoals,
    isLoading: mockGoalsLoading,
    updateGoal: (...args: unknown[]) => mockUpdateGoal(...args),
    deleteGoal: (...args: unknown[]) => mockDeleteGoal(...args),
  }),
}), { virtual: true });

jest.mock('@edutu/core/src/services/opportunities', () => ({
  fetchOpportunities: jest.fn(),
}), { virtual: true });

jest.mock('@edutu/core/src/services/payments', () => ({
  initRevenueCat: (...args: unknown[]) => mockInitRevenueCat(...args),
  getOfferings: (...args: unknown[]) => mockGetOfferings(...args),
  purchasePackage: (...args: unknown[]) => mockPurchasePackage(...args),
  restorePurchases: (...args: unknown[]) => mockRestorePurchases(...args),
}), { virtual: true });

jest.mock('@edutu/core/src/utils/auth', () => ({
  toSafeUUID: (value: string) => `safe-${value}`,
}), { virtual: true });

jest.mock('@edutu/core/src/types/notification', () => ({}), { virtual: true });
jest.mock('@edutu/core/src/types/opportunity', () => ({}), { virtual: true });

const SavedScreen = require('../app/(app)/saved/index').default;
const NotificationsScreen = require('../app/(app)/notifications').default;
const WalletScreen = require('../app/(app)/wallet').default;
const GoalsDashboard = require('../app/(app)/goals/index').default;
const MyOpportunitiesScreen = require('../app/(app)/my-opportunities').default;
const PaywallScreen = require('../app/(app)/paywall').default;

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

describe('mobile engagement routes', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockReplace.mockClear();
    mockGetToken.mockClear();
    mockFetchSavedOpportunities.mockReset();
    mockUnsaveOpportunity.mockClear();
    mockMarkAsRead.mockClear();
    mockDeleteNotification.mockClear();
    mockRefreshCredits.mockClear();
    mockUpdateGoal.mockClear();
    mockDeleteGoal.mockClear();
    mockInitRevenueCat.mockClear();
    mockGetOfferings.mockClear();
    mockPurchasePackage.mockClear();
    mockRestorePurchases.mockClear();
    mockSavedBookmarks = [];
    mockNotifications = [];
    mockUnreadCount = 0;
    mockCredits = 0;
    mockCreditsLoading = false;
    mockTransactions = [];
    mockIsPro = false;
    mockProLoading = false;
    mockGoals = [];
    mockGoalsLoading = false;
    mockGoalBookmarkRows = [];
    mockUserState = {
      user: {
        id: 'user-1',
        passwordEnabled: true,
        externalAccounts: [],
        unsafeMetadata: { onboardingComplete: true },
      },
    };
  });

  it('renders saved opportunities, filters them, and opens opportunity details', async () => {
    mockSavedBookmarks = [
      {
        id: 'bm-urgent',
        opportunity_id: 'opp-urgent',
        title: 'Global Fellowship',
        organization: 'Edutu',
        deadline: daysFromNow(3),
        category: 'Fellowship',
        location: 'Remote',
        image: '',
        match_score: 91,
        created_at: '2026-06-22T00:00:00.000Z',
      },
      {
        id: 'bm-upcoming',
        opportunity_id: 'opp-upcoming',
        title: 'Campus Internship',
        organization: 'Edutu',
        deadline: daysFromNow(14),
        category: 'Internship',
        location: 'Lagos',
        image: '',
        match_score: 78,
        created_at: '2026-06-22T00:00:00.000Z',
      },
    ];
    mockFetchSavedOpportunities.mockResolvedValue(mockSavedBookmarks);

    const { getAllByText, getByText, queryByText } = render(<SavedScreen />);

    await waitFor(() => expect(getByText('Saved Opportunities')).toBeTruthy());
    expect(getByText('All (2)')).toBeTruthy();
    expect(getByText('Urgent (1)')).toBeTruthy();
    expect(getByText('Upcoming (1)')).toBeTruthy();
    expect(getByText('Global Fellowship')).toBeTruthy();
    expect(getByText('Campus Internship')).toBeTruthy();

    fireEvent.press(getByText('Urgent (1)'));
    await waitFor(() => expect(getByText('Global Fellowship')).toBeTruthy());
    expect(queryByText('Campus Internship')).toBeNull();

    fireEvent.press(getAllByText('View Details')[0]);
    expect(mockPush).toHaveBeenCalledWith('/opportunities/opp-urgent');

    fireEvent.press(getByText('Upcoming (1)'));
    await waitFor(() => expect(getByText('Campus Internship')).toBeTruthy());
    expect(queryByText('Global Fellowship')).toBeNull();
  });

  it('shows notification actions, password prompts, and read handling', async () => {
    mockUserState = {
      user: {
        id: 'user-1',
        passwordEnabled: false,
        externalAccounts: [{ provider: 'google' }],
        unsafeMetadata: { onboardingComplete: true },
      },
    };
    mockNotifications = [
      {
        id: 'notif-1',
        kind: 'goal-reminder',
        title: 'Finish your goal',
        body: 'Update your progress today',
        severity: 'info',
        metadata: {},
        createdAt: '2026-06-22T00:00:00.000Z',
        readAt: null,
      },
    ];
    mockUnreadCount = 1;

    const { getByText } = render(<NotificationsScreen />);

    await waitFor(() => expect(getByText('Notifications')).toBeTruthy());
    expect(getByText('Add a password to your account')).toBeTruthy();
    expect(getByText('Set password')).toBeTruthy();
    expect(getByText('All')).toBeTruthy();
    expect(getByText('Unread (1)')).toBeTruthy();
    expect(getByText('Finish your goal')).toBeTruthy();

    fireEvent.press(getByText('Set password'));
    expect(mockPush).toHaveBeenCalledWith('/profile/settings');

    fireEvent.press(getByText('Finish your goal'));
    expect(mockMarkAsRead).toHaveBeenCalledWith('notif-1');
  });

  it('shows wallet balances, transactions, and paywall routes', async () => {
    mockCredits = 123;
    mockTransactions = [
      {
        id: 'tx-1',
        amount: 50,
        description: 'Referral bonus',
        type: 'credit',
        created_at: '2026-06-22T00:00:00.000Z',
      },
    ];
    mockIsPro = false;

    const { getAllByText, getByText } = render(<WalletScreen />);

    expect(getByText('Credits Balance')).toBeTruthy();
    expect(getByText('123')).toBeTruthy();
    expect(getByText('Recent Transactions')).toBeTruthy();
    expect(getByText('Referral bonus')).toBeTruthy();
    expect(getAllByText('Upgrade to Pro').length).toBeGreaterThan(0);
    expect(getAllByText('Buy Credits').length).toBeGreaterThan(0);

    fireEvent.press(getAllByText('Upgrade to Pro')[0]);
    expect(mockPush).toHaveBeenCalledWith('/paywall');
  });

  it('renders goal dashboard empty states and routes to the key flows', async () => {
    mockGoals = [];
    mockGoalBookmarkRows = [];

    const { getByText } = render(<GoalsDashboard />);

    await waitFor(() => expect(getByText('Goals')).toBeTruthy());
    expect(getByText('0 active · 0% completed')).toBeTruthy();
    expect(getByText('My Opportunities')).toBeTruthy();
    expect(getByText('Have Opportunities to Share?')).toBeTruthy();
    expect(getByText('No Roadmaps')).toBeTruthy();
    expect(getByText('No Personal Goals')).toBeTruthy();
    expect(getByText('Browse Roadmaps')).toBeTruthy();
    expect(getByText('Create Goal')).toBeTruthy();
    expect(getByText('Contact Us')).toBeTruthy();

    fireEvent.press(getByText('My Opportunities'));
    expect(mockPush).toHaveBeenCalledWith('/my-opportunities');

    fireEvent.press(getByText('Browse Roadmaps'));
    expect(mockPush).toHaveBeenCalledWith('/goals/all-roadmaps');

    fireEvent.press(getByText('Create Goal'));
    expect(mockPush).toHaveBeenCalledWith('/goals/add');

    fireEvent.press(getByText('Contact Us'));
    expect(mockPush).toHaveBeenCalledWith('/help');
  });

  it('renders my opportunities summary and filters the saved list', async () => {
    mockSavedBookmarks = [
      {
        id: 'bm-urgent',
        opportunity_id: 'opp-urgent',
        title: 'Global Fellowship',
        organization: 'Edutu',
        deadline: daysFromNow(3),
        category: 'Fellowship',
        location: 'Remote',
        image: '',
        match_score: 91,
        created_at: '2026-06-22T00:00:00.000Z',
      },
      {
        id: 'bm-upcoming',
        opportunity_id: 'opp-upcoming',
        title: 'Campus Internship',
        organization: 'Edutu',
        deadline: daysFromNow(14),
        category: 'Internship',
        location: 'Lagos',
        image: '',
        match_score: 78,
        created_at: '2026-06-22T00:00:00.000Z',
      },
    ];
    mockFetchSavedOpportunities.mockResolvedValue(mockSavedBookmarks);

    const { getAllByText, getByText, queryByText } = render(<MyOpportunitiesScreen />);

    await waitFor(() => expect(getByText('My Opportunities')).toBeTruthy());
    expect(getByText('2 saved')).toBeTruthy();
    expect(getByText('Open')).toBeTruthy();
    expect(getByText('Urgent')).toBeTruthy();
    expect(getByText('Avg Match')).toBeTruthy();
    expect(getByText('All (2)')).toBeTruthy();
    expect(getByText('Urgent (1)')).toBeTruthy();
    expect(getByText('Upcoming (1)')).toBeTruthy();

    fireEvent.press(getByText('Urgent (1)'));
    await waitFor(() => expect(getByText('Global Fellowship')).toBeTruthy());
    expect(queryByText('Campus Internship')).toBeNull();

    fireEvent.press(getAllByText('View Details')[0]);
    expect(mockPush).toHaveBeenCalledWith('/opportunities/opp-urgent');
  });

  it('renders the paywall, shows premium messaging, and surfaces subscribe handling', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined as never);
    mockInitRevenueCat.mockResolvedValue(false);
    mockGetOfferings.mockResolvedValue(null);

    const { getByText } = render(<PaywallScreen />);

    await waitFor(() => expect(getByText('Premium')).toBeTruthy());
    expect(getByText('Unlock premium')).toBeTruthy();
    expect(getByText('Subscribe to premium')).toBeTruthy();
    expect(getByText('Subscription renews automatically and can be managed in your device settings.')).toBeTruthy();

    fireEvent.press(getByText('Subscribe to premium'));
    expect(alertSpy).toHaveBeenCalledWith('Coming Soon', expect.any(String));

    alertSpy.mockRestore();
  });
});
