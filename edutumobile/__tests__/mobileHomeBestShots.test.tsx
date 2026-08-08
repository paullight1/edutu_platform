import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

// Drives the real home screen (app/(app)/index) through the two Best Matches
// states and the Best-Matches/Recommended allocation, observing exactly what a
// user would see in each case:
//   • incomplete profile  -> "Complete profile" prompt
//   • complete profile -> strongest available matches, even below 60
//   • the broader feed remains distinct in Recommended Opportunities

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockRefresh = jest.fn();

let mockAuthState: {
  isLoaded: boolean;
  isSignedIn: boolean;
  getToken: jest.Mock;
  userId?: string | null;
};
let mockUserState: { user: { id: string; unsafeMetadata?: { onboardingComplete?: boolean } } | null };
let mockOpportunitiesData: Array<any> = [];
let mockOpportunitiesLoading = false;
let mockProfileComplete = false;
let mockRecentlyOpenedOpportunity: Record<string, unknown> | null = null;

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
    useSegments: () => ['(app)', 'index'],
    usePathname: () => '/',
    useGlobalSearchParams: () => ({}),
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
      ...require('../test-utils/themeColors').TEST_THEME_COLORS,
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
jest.mock('../components/ui/OfflineBanner', () => ({ OfflineBanner: () => null }));
jest.mock('../components/ui/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('../components/ui/WelcomeHintSystem', () => ({ WelcomeHintSystem: () => null }));
jest.mock('../components/branding/EdutuLogo', () => ({
  EdutuLogo: () => {
    const { Text } = require('react-native');
    return <Text>EdutuLogo</Text>;
  },
}));
jest.mock('../components/mobile-control/MobileCampaignHost', () => ({ MobileCampaignHost: () => null }));

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

jest.mock('react-native-svg', () => require('../test-utils/svgMock'));
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('expo-blur', () => ({
  BlurView: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const cache = new Map<PropertyKey, () => React.JSX.Element>();
  return new Proxy(
    {},
    {
      get: (_target, name: PropertyKey) => {
        if (name === '__esModule') return true;
        if (!cache.has(name)) {
          const Icon = () => <Text>{String(name)}</Text>;
          cache.set(name, Icon);
        }
        return cache.get(name);
      },
    },
  );
});

jest.mock('../hooks/useDeepLink', () => ({ useDeepLink: () => undefined }));
jest.mock('../lib/updatePrompt', () => ({ useInAppUpdatePrompt: () => undefined }));
jest.mock('../lib/opportunityWidgetSync', () => ({
  syncAndUpdateOpportunityWidgetSnapshot: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../lib/recentlyOpenedOpportunity', () => ({
  getRecentlyOpenedOpportunity: jest.fn(async () => mockRecentlyOpenedOpportunity),
  subscribeToRecentlyOpenedOpportunity: jest.fn(() => jest.fn()),
}));
jest.mock('../lib/notifications', () => ({
  notificationService: {
    requestPermissions: jest.fn().mockResolvedValue(undefined),
    notify: jest.fn(),
    triggerHaptic: jest.fn(),
  },
  registerForPushNotificationsAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../packages/core/src/services/supabase', () => ({
  setSupabaseAccessTokenGetter: jest.fn(),
}));
jest.mock('@edutu/core/src/services/opportunitySignals', () => ({
  recordOpportunitySignal: jest.fn(),
}), { virtual: true });
jest.mock('@edutu/core/src/hooks/useNotifications', () => ({
  useNotifications: () => ({ unreadCount: 0 }),
}), { virtual: true });
jest.mock('@edutu/core/src/hooks/useOpportunities', () => ({
  useOpportunities: () => ({
    data: mockOpportunitiesData,
    loading: mockOpportunitiesLoading,
    refresh: mockRefresh,
    noteDismissed: jest.fn(),
  }),
}), { virtual: true });
jest.mock('@edutu/core/src/hooks/useGoals', () => ({
  useGoals: () => ({ goals: [], isLoading: false }),
}), { virtual: true });

// The hook under test for the empty-state fix: lets us flip profile
// completeness without a live Supabase profile row.
jest.mock('@edutu/core/src/hooks/useProfileCompleteness', () => ({
  useProfileCompleteness: () => ({
    completeness: {
      score: mockProfileComplete ? 100 : 0,
      isComplete: mockProfileComplete,
      missingFields: [],
      missingCount: mockProfileComplete ? 0 : 6,
      totalFields: 6,
      hasInterests: mockProfileComplete,
      hasSkills: mockProfileComplete,
      hasAmbitions: mockProfileComplete,
      hasCountry: mockProfileComplete,
      hasEducation: mockProfileComplete,
      hasFieldOfStudy: mockProfileComplete,
    },
    isLoading: false,
    rawProfile: null,
    needsProfileUpdate: !mockProfileComplete,
    personalizedMatchEnabled: mockProfileComplete,
    refresh: jest.fn(),
  }),
}), { virtual: true });

jest.mock('@edutu/core/src/utils/auth', () => ({
  toSafeUUID: (value: string) => `safe-${value}`,
}), { virtual: true });
jest.mock('@edutu/core/src/types/opportunity', () => ({ Opportunity: {} }), { virtual: true });

jest.mock('../lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        in: jest.fn().mockResolvedValue({ data: [] }),
        eq: jest.fn(() => ({ maybeSingle: jest.fn().mockResolvedValue({ data: null }) })),
      })),
    })),
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

jest.mock('../widgets/OpportunityWidget', () => ({}));
jest.mock('../cache', () => ({ tokenCache: {} }));
jest.mock('../global.css', () => ({}), { virtual: true });

const Dashboard = require('../app/(app)/index').default;

function makeOpp(overrides: Record<string, any>) {
  return {
    id: 'opp',
    title: 'Untitled',
    organization: 'Edutu',
    description: 'An opportunity',
    category: 'Fellowship',
    location: 'Remote',
    deadline: null,
    featured: false,
    requirements: [],
    benefits: [],
    applicationProcess: [],
    matchReasons: [],
    match: 40,
    createdAt: '2026-06-22T00:00:00.000Z',
    updatedAt: '2026-06-22T00:00:00.000Z',
    ...overrides,
  };
}

describe('home Best Shots — empty states and dedupe', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockReplace.mockClear();
    mockRefresh.mockClear();
    mockAuthState = {
      isLoaded: true,
      isSignedIn: true,
      getToken: jest.fn().mockResolvedValue('token'),
      userId: 'user-1',
    };
    mockUserState = { user: { id: 'user-1', unsafeMetadata: { onboardingComplete: true } } };
    mockOpportunitiesLoading = false;
    mockOpportunitiesData = [];
    mockProfileComplete = false;
    mockRecentlyOpenedOpportunity = null;
  });

  it('shows the compact next-move card only after an opportunity has been opened', async () => {
    mockRecentlyOpenedOpportunity = {
      id: 'recent',
      title: 'Recently Opened Fellowship',
      deadline: null,
      openedAt: '2026-08-07T10:00:00.000Z',
    };

    const { getByTestId, getByText } = render(<Dashboard />);

    await waitFor(() => expect(getByTestId('recent-opportunity-card')).toBeTruthy());
    expect(getByText('Recently Opened Fellowship')).toBeTruthy();
    fireEvent.press(getByTestId('recent-opportunity-card'));
    expect(mockPush).toHaveBeenCalledWith('/opportunities/recent');
  });

  it('does not show a generic next-move card without an opened opportunity', async () => {
    const { getByText, queryByTestId } = render(<Dashboard />);

    await waitFor(() => expect(getByText('Best matches for you')).toBeTruthy());
    expect(queryByTestId('recent-opportunity-card')).toBeNull();
  });

  it('incomplete profile: shows the "Complete profile" prompt, not the searching copy', async () => {
    mockProfileComplete = false;
    // Below the 60% bar, so Best Shots is empty even though the feed has items.
    mockOpportunitiesData = [
      makeOpp({ id: 'a', title: 'DataCamp Scholarship', match: 53 }),
      makeOpp({ id: 'b', title: 'Graduate Trainee', match: 48 }),
    ];

    const { getByText, queryByText, getByLabelText } = render(<Dashboard />);

    await waitFor(() => expect(getByText('Best matches for you')).toBeTruthy());
    expect(getByText('Complete your profile')).toBeTruthy();
    expect(getByText(/Get more accurate opportunity matches/)).toBeTruthy();
    // The "profile already complete" copy must NOT appear here.
    expect(queryByText(/We'll notify you when a better fit appears/)).toBeNull();
    expect(queryByText('No strong match yet')).toBeNull();

    // The whole card is tappable and routes to the profile screen.
    fireEvent.press(getByLabelText('Complete your profile to unlock your best matches'));
    expect(mockPush).toHaveBeenCalledWith('/profile/edit');
  });

  it('complete profile: shows the strongest available matches even when they are below 60', async () => {
    mockProfileComplete = true;
    // A complete profile has enough signal to rank the available feed. The
    // strongest item belongs in Best Matches and the second is reserved below.
    mockOpportunitiesData = [
      makeOpp({ id: 'a', title: 'DataCamp Scholarship', match: 53 }),
      makeOpp({ id: 'b', title: 'Graduate Trainee', match: 48 }),
    ];

    const { getByText, queryByText } = render(<Dashboard />);

    await waitFor(() => expect(getByText('Best matches for you')).toBeTruthy());
    expect(getByText('DataCamp Scholarship')).toBeTruthy();
    expect(getByText('Graduate Trainee')).toBeTruthy();
    expect(getByText('Ranked from your profile')).toBeTruthy();
    expect(queryByText('No strong match yet')).toBeNull();
    expect(queryByText('Complete your profile')).toBeNull();
  });

  it('allocates the strongest match once and reserves the next item for Recommended', async () => {
    mockProfileComplete = true;
    mockOpportunitiesData = [
      // Strongest match -> Best Matches. The second item is deliberately
      // reserved for the broader Recommended section.
      makeOpp({ id: 'strong', title: 'Chevening Scholarship', match: 88, featured: false }),
      makeOpp({ id: 'weak', title: 'Local Bootcamp', match: 40, featured: false }),
    ];

    const { getByText, getAllByText } = render(<Dashboard />);

    await waitFor(() => expect(getByText('Best matches for you')).toBeTruthy());
    // Best match is present exactly once (excluded from Recommended).
    expect(getAllByText('Chevening Scholarship')).toHaveLength(1);
    // The sub-60 item still shows in Recommended.
    expect(getByText('Local Bootcamp')).toBeTruthy();
  });

  // Regression: impression fatigue (up to -20 on the feed score for items shown
  // repeatedly without engagement) must not disqualify a Best Shot. Fit is what
  // decides "can you win this"; fatigue only reorders the feed. Without this,
  // simply opening the app five times erases the section.
  it('gates on fit, not the fatigue-adjusted feed score', async () => {
    mockProfileComplete = true;
    mockOpportunitiesData = [
      // Genuinely competitive (fit 72) but fatigued down to 52 in the feed.
      makeOpp({ id: 'fatigued', title: 'Mandela Fellowship', match: 52, matchFit: 72 }),
      makeOpp({ id: 'weak', title: 'Local Bootcamp', match: 40, matchFit: 40 }),
    ];

    const { getByText, getAllByText, queryByText } = render(<Dashboard />);

    await waitFor(() => expect(getByText('Best matches for you')).toBeTruthy());
    expect(getAllByText('Mandela Fellowship')).toHaveLength(1);
    // And it reports the fit it was chosen on, not the fatigued feed score.
    expect(getByText('72% match')).toBeTruthy();
    expect(queryByText('52% match')).toBeNull();
  });

  // A complete profile should never produce an empty Best Matches rail merely
  // because the strongest currently available item is below an arbitrary bar.
  it('keeps the fit badge honest when the strongest available item has low fit', async () => {
    mockProfileComplete = true;
    mockOpportunitiesData = [
      makeOpp({ id: 'hyped', title: 'Clicked A Lot', match: 88, matchFit: 35 }),
    ];

    const { getByText, getAllByText, queryByText } = render(<Dashboard />);

    await waitFor(() => expect(getByText('Best matches for you')).toBeTruthy());
    // A completed profile still gets its strongest available candidate. The
    // fit badge remains honest even when behavior lifted the feed score.
    expect(queryByText('No strong match yet')).toBeNull();
    expect(getByText('35% match')).toBeTruthy();
    expect(getAllByText('Clicked A Lot')).toHaveLength(1);
  });
});
