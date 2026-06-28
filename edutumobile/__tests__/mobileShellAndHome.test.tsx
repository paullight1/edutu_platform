import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Text, View } from 'react-native';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockSetSupabaseAccessTokenGetter = jest.fn();
const mockRequestPermissions = jest.fn().mockResolvedValue(undefined);
const mockRegisterForPushNotificationsAsync = jest.fn().mockResolvedValue(undefined);
const mockSyncWidgetSnapshot = jest.fn().mockResolvedValue(undefined);
const mockUseDeepLink = jest.fn();
const mockUseInAppUpdatePrompt = jest.fn();
const mockRecordOpportunitySignal = jest.fn();
const mockNotificationHaptic = jest.fn();
const mockRefresh = jest.fn();
const mockUnreadCount = 2;

let mockAuthState: {
  isLoaded: boolean;
  isSignedIn: boolean;
  getToken: jest.Mock;
  userId?: string | null;
};
let mockUserState: { user: { id: string; unsafeMetadata?: { onboardingComplete?: boolean } } | null };
let mockPathname = '/';
let mockSegments = ['(app)', 'index'];
let mockGlobalSearchParams: Record<string, string | string[]> = {};
let mockOpportunitiesData: Array<any> = [];
let mockOpportunitiesLoading = false;

jest.mock('expo-router', () => {
  const React = require('react');
  const { Text, View } = require('react-native');

  const Stack = ({ children }: { children?: React.ReactNode }) => <View>{children}</View>;
  Stack.Screen = () => null;

  return {
    Slot: () => <Text>slot</Text>,
    Stack,
    Redirect: ({ href }: { href: string }) => <Text>{`Redirect:${href}`}</Text>,
    useRouter: () => ({ push: mockPush, replace: mockReplace }),
    useSegments: () => mockSegments,
    usePathname: () => mockPathname,
    useGlobalSearchParams: () => mockGlobalSearchParams,
    Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

jest.mock('@clerk/clerk-expo', () => ({
  ClerkProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ClerkLoaded: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => mockAuthState,
  useUser: () => mockUserState,
}));

jest.mock('../components/context/ThemeContext', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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

jest.mock('../components/context/OfflineContext', () => ({
  OfflineProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('../components/ui/OfflineBanner', () => ({
  OfflineBanner: () => null,
}));

jest.mock('../components/ui/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('../components/ui/WelcomeHintSystem', () => ({
  WelcomeHintSystem: () => null,
}));

jest.mock('../components/branding/EdutuLogo', () => ({
  EdutuLogo: () => {
    const { Text } = require('react-native');
    return <Text>EdutuLogo</Text>;
  },
}));

jest.mock('../components/mobile-control/MobileCampaignHost', () => ({
  MobileCampaignHost: () => null,
}));

jest.mock('../components/ui/AnimatedPressable', () => {
  const React = require('react');
  const { TouchableOpacity } = require('react-native');
  return {
    AnimatedPressable: ({ children, ...props }: { children: React.ReactNode }) => (
      <TouchableOpacity {...props}>{children}</TouchableOpacity>
    ),
    AnimatedTouchableOpacity: ({ children, ...props }: { children: React.ReactNode }) => (
      <TouchableOpacity {...props}>{children}</TouchableOpacity>
    ),
  };
});

jest.mock('react-native-svg', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    SvgXml: () => <Text>SvgXml</Text>,
  };
});

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('expo-blur', () => ({
  BlurView: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const icon = (name: string) => () => <Text>{name}</Text>;
  return {
    Bell: icon('Bell'),
    BookmarkPlus: icon('BookmarkPlus'),
    ChevronRight: icon('ChevronRight'),
    Compass: icon('Compass'),
    FileText: icon('FileText'),
    Home: icon('Home'),
    ShoppingBag: icon('ShoppingBag'),
    Sparkles: icon('Sparkles'),
    Store: icon('Store'),
    Target: icon('Target'),
    UserCircle: icon('UserCircle'),
  };
});

jest.mock('../hooks/useDeepLink', () => ({
  useDeepLink: () => mockUseDeepLink(),
}));

jest.mock('../lib/updatePrompt', () => ({
  useInAppUpdatePrompt: () => mockUseInAppUpdatePrompt(),
}));

jest.mock('../lib/opportunityWidgetSync', () => ({
  syncAndUpdateOpportunityWidgetSnapshot: (...args: unknown[]) => mockSyncWidgetSnapshot(...args),
}));

jest.mock('../lib/notifications', () => ({
  notificationService: {
    requestPermissions: () => mockRequestPermissions(),
    notify: () => mockNotificationHaptic(),
    triggerHaptic: () => mockNotificationHaptic(),
  },
  registerForPushNotificationsAsync: (...args: unknown[]) => mockRegisterForPushNotificationsAsync(...args),
}));

jest.mock('../packages/core/src/services/supabase', () => ({
  setSupabaseAccessTokenGetter: (...args: unknown[]) => mockSetSupabaseAccessTokenGetter(...args),
}));

jest.mock('@edutu/core/src/services/opportunitySignals', () => ({
  recordOpportunitySignal: (...args: unknown[]) => mockRecordOpportunitySignal(...args),
}), { virtual: true });

jest.mock('@edutu/core/src/hooks/useNotifications', () => ({
  useNotifications: () => ({
    unreadCount: mockUnreadCount,
  }),
}), { virtual: true });

jest.mock('@edutu/core/src/hooks/useOpportunities', () => ({
  useOpportunities: () => ({
    data: mockOpportunitiesData,
    loading: mockOpportunitiesLoading,
    refresh: mockRefresh,
  }),
}), { virtual: true });

jest.mock('@edutu/core/src/utils/auth', () => ({
  toSafeUUID: (value: string) => `safe-${value}`,
}), { virtual: true });

jest.mock('@edutu/core/src/types/opportunity', () => ({
  Opportunity: {},
}), { virtual: true });

jest.mock('../lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        in: jest.fn().mockResolvedValue({ data: [] }),
      })),
    })),
  },
}));

jest.mock('../widgets/OpportunityWidget', () => ({}));
jest.mock('../cache', () => ({
  tokenCache: {},
}));
jest.mock('../global.css', () => ({}), { virtual: true });

const AppLayout = require('../app/(app)/_layout').default;
const Dashboard = require('../app/(app)/index').default;

type Opportunity = {
  id: string;
  title: string;
  organization: string;
  description: string;
  category: string;
  location: string;
  deadline?: string | null;
  featured: boolean;
  requirements: string[];
  benefits: string[];
  applicationProcess: string[];
  match: number;
  createdAt: string;
  updatedAt: string;
};

const testOpportunities: Opportunity[] = [
  {
    id: 'opp-featured',
    title: 'Global Fellowship',
    organization: 'Edutu',
    description: 'Featured opportunity',
    category: 'Fellowship',
    location: 'Remote',
    deadline: null,
    featured: true,
    requirements: [],
    benefits: [],
    applicationProcess: [],
    match: 95,
    createdAt: '2026-06-22T00:00:00.000Z',
    updatedAt: '2026-06-22T00:00:00.000Z',
  },
  {
    id: 'opp-regular',
    title: 'Campus Internship',
    organization: 'Edutu',
    description: 'Recommended opportunity',
    category: 'Internship',
    location: 'Lagos',
    deadline: null,
    featured: false,
    requirements: [],
    benefits: [],
    applicationProcess: [],
    match: 82,
    createdAt: '2026-06-22T00:00:00.000Z',
    updatedAt: '2026-06-22T00:00:00.000Z',
  },
];

describe('mobile app shell and home dashboard', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockPush.mockClear();
    mockSetSupabaseAccessTokenGetter.mockClear();
    mockRequestPermissions.mockClear();
    mockRegisterForPushNotificationsAsync.mockClear();
    mockSyncWidgetSnapshot.mockClear();
    mockUseDeepLink.mockClear();
    mockUseInAppUpdatePrompt.mockClear();
    mockRecordOpportunitySignal.mockClear();
    mockNotificationHaptic.mockClear();
    mockRefresh.mockClear();
    mockAuthState = {
      isLoaded: true,
      isSignedIn: false,
      getToken: jest.fn().mockResolvedValue('token'),
      userId: null,
    };
    mockUserState = { user: null };
    mockPathname = '/';
    mockSegments = ['(app)', 'index'];
    mockGlobalSearchParams = {};
    mockOpportunitiesData = testOpportunities;
    mockOpportunitiesLoading = false;
  });

  it('redirects unauthenticated app-shell users to sign-in', () => {
    const { getByText } = render(<AppLayout />);

    expect(getByText('Redirect:/(auth)/sign-in')).toBeTruthy();
  });

  it('shows the bottom navigation and AI shortcut for authenticated onboarded users', async () => {
    mockAuthState = {
      isLoaded: true,
      isSignedIn: true,
      getToken: jest.fn().mockResolvedValue('token'),
      userId: 'user-1',
    };
    mockUserState = { user: { id: 'user-1', unsafeMetadata: { onboardingComplete: true } } };

    const { getAllByText, getByText, getByLabelText } = render(<AppLayout />);

    await waitFor(() => expect(getAllByText('Home').length).toBeGreaterThan(0));
    expect(getByText('Discover')).toBeTruthy();
    expect(getByText('Plan')).toBeTruthy();
    expect(getByText('Me')).toBeTruthy();
    expect(getByLabelText('Open Edutu AI chat')).toBeTruthy();
  });

  it('renders the home dashboard with discovery and quick-action routes', async () => {
    mockAuthState = {
      isLoaded: true,
      isSignedIn: true,
      getToken: jest.fn().mockResolvedValue('token'),
      userId: 'user-1',
    };
    mockUserState = { user: { id: 'user-1', unsafeMetadata: { onboardingComplete: true } } };

    const { getAllByText, getByText } = render(<Dashboard />);

    await waitFor(() => expect(getByText('Explore opportunities')).toBeTruthy());
    expect(getByText('Quick Actions')).toBeTruthy();
    expect(getByText('Featured Opportunities')).toBeTruthy();
    expect(getByText('Recommended Opportunities')).toBeTruthy();
    expect(getAllByText('Global Fellowship').length).toBeGreaterThan(0);
    expect(getAllByText('Campus Internship').length).toBeGreaterThan(0);

    fireEvent.press(getByText('Programs'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/opportunities', params: { category: 'grants' } });

    fireEvent.press(getByText('Roadmaps'));
    expect(mockPush).toHaveBeenCalledWith('/roadmaps');
  });
});
