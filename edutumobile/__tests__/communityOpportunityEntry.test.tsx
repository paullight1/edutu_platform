import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

/**
 * The discussion-group row on the opportunity detail screen.
 *
 * WHAT THESE SPECS ARE GUARDING. The row is the only bridge between the
 * opportunity a user is reading and the people applying to it, and every way it
 * can go wrong is quiet: it can route to a create form for a group that already
 * exists (a duplicate room nobody wanted), it can navigate a signed-out guest
 * into a screen that will 401, or it can take the whole detail page down when
 * the lookup fails — a page that was complete before the row existed.
 *
 * So each spec asserts the OUTCOME (which route, which argument, which wall),
 * never that a function was called.
 */

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockGetToken = jest.fn().mockResolvedValue('token');
const mockGetOpportunity = jest.fn();
const mockIsOpportunitySaved = jest.fn().mockResolvedValue(false);
const mockFetchGroups = jest.fn();
const mockPromptAuth = jest.fn();

let mockIsSignedIn = false;
let mockIsGuest = false;

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'opp-1' }),
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => ({ getToken: mockGetToken, isSignedIn: mockIsSignedIn }),
  useUser: () => ({ user: { id: 'user-1' } }),
}));

jest.mock('../lib/guestModeStore', () => ({
  useGuestMode: () => ({ hydrated: true, isGuest: mockIsGuest }),
}));

jest.mock('../components/context/AuthWallContext', () => ({
  useAuthWall: () => ({ promptAuth: mockPromptAuth, hide: jest.fn() }),
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
      primary: '#4331C9',
      mutedForeground: '#6B7280',
      error: '#DC2626',
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

jest.mock('react-native/Libraries/Animated/Animated', () => {
  const React = require('react');
  const { View } = require('react-native');
  const AnimatedView = React.forwardRef(({ children, ...props }: any, ref: any) => (
    <View ref={ref} {...props}>
      {children}
    </View>
  ));
  const builder = {
    duration: () => builder,
    delay: () => builder,
    springify: () => builder,
  };
  return {
    __esModule: true,
    default: {
      View: AnimatedView,
      Text: AnimatedView,
      ScrollView: AnimatedView,
      FlatList: AnimatedView,
      Image: AnimatedView,
      timing: () => ({ start: jest.fn(), stop: jest.fn() }),
      event: () => jest.fn(),
      Value: class {
        value: number;
        constructor(value: number) {
          this.value = value;
        }
        interpolate() {
          return 0;
        }
        setValue(value: number) {
          this.value = value;
        }
        resetAnimation() {
          this.value = 1;
        }
        stopAnimation(callback?: (value: number) => void) {
          callback?.(this.value);
        }
      },
      FadeIn: builder,
      FadeInDown: builder,
      FadeInUp: builder,
      Layout: builder,
      ZoomIn: builder,
      createAnimatedComponent: (Component: any) => Component,
    },
  };
});

jest.mock('react-native-view-shot', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  captureRef: jest.fn().mockResolvedValue('file://share.png'),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(false),
  shareAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-file-system', () => ({
  File: { downloadFileAsync: jest.fn() },
  Paths: { cache: '/tmp' },
}));

jest.mock('../components/ui/AnimatedPressable', () => ({
  AnimatedPressable: ({ children, ...props }: { children: React.ReactNode }) => {
    const React = require('react');
    const { TouchableOpacity } = require('react-native');
    return <TouchableOpacity {...props}>{children}</TouchableOpacity>;
  },
}));

jest.mock('../components/ui/ProgressBar', () => ({
  ProgressBar: () => {
    const React = require('react');
    const { Text } = require('react-native');
    return <Text>ProgressBar</Text>;
  },
}));

jest.mock('../components/ui/BrandedLoader', () => ({
  BrandedLoader: ({ label }: { label?: string }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return <Text>{label || 'Loading'}</Text>;
  },
}));

jest.mock('../components/branding/EdutuLogo', () => ({
  EdutuLogo: () => {
    const React = require('react');
    const { Text } = require('react-native');
    return <Text>EdutuLogo</Text>;
  },
}));

jest.mock('../lib/config', () => ({
  getConfig: () => ({ apiBaseUrl: 'https://api.example.com' }),
}));

jest.mock('../lib/notifications', () => ({
  notificationService: {
    scheduleGoalReminder: jest.fn().mockResolvedValue(undefined),
    cancelNotification: jest.fn().mockResolvedValue(undefined),
    notify: jest.fn(),
    triggerHaptic: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../lib/supabase', () => ({
  supabase: require('../test-utils/supabaseMock').createSupabaseMock(),
}));

jest.mock('@edutu/core/src/services/opportunities', () => ({
  getOpportunity: (...args: unknown[]) => mockGetOpportunity(...args),
  getOpportunityWithStatus: async (...args: unknown[]) => {
    const opportunity = await mockGetOpportunity(...args);
    return { opportunity, status: opportunity ? 'ok' : 'not_found' };
  },
}), { virtual: true });

jest.mock('../packages/core/src/services/bookmarks', () => ({
  isOpportunitySaved: (...args: unknown[]) => mockIsOpportunitySaved(...args),
  saveOpportunity: jest.fn().mockResolvedValue(undefined),
  unsaveOpportunity: jest.fn().mockResolvedValue(undefined),
}), { virtual: true });

jest.mock('../packages/core/src/services/applications', () => ({
  trackOpportunityApplication: jest.fn().mockResolvedValue(undefined),
}), { virtual: true });

jest.mock('@edutu/core/src/services/opportunitySignals', () => ({
  recordOpportunitySignal: jest.fn(),
}), { virtual: true });

jest.mock('@edutu/core/src/services/aiRoadmapGenerator', () => ({
  generateRoadmapFromOpportunity: jest.fn(),
  generateRoadmap: jest.fn(),
}), { virtual: true });

jest.mock('@edutu/core/src/hooks/useGoals', () => ({
  useGoals: () => ({ createGoal: jest.fn(), updateGoal: jest.fn() }),
}), { virtual: true });

jest.mock('@edutu/core/src/hooks/useCredits', () => ({
  useCredits: () => ({ credits: 12, isLoading: false, spendCredits: jest.fn() }),
}), { virtual: true });

jest.mock('@edutu/core/src/hooks/useProStatus', () => ({
  useProStatus: () => ({ isPro: false, isLoading: false }),
}), { virtual: true });

jest.mock('@edutu/core/src/utils/auth', () => ({
  toSafeUUID: (value: string) => `safe-${value}`,
}), { virtual: true });

/**
 * The one module under test at the seam. `CommunityApiError` is reconstructed
 * here rather than imported so the mock stays self-contained, and the screen's
 * `catch` is exercised with the real shape it will see in production.
 */
jest.mock('@edutu/core/src/services/communities', () => ({
  fetchGroups: (...args: unknown[]) => mockFetchGroups(...args),
}), { virtual: true });

const OpportunityDetailScreen = require('../app/(app)/opportunities/[id]').default;

function makeOpportunity() {
  return {
    id: 'opp-1',
    title: 'Global Fellowship',
    organization: 'Edutu',
    category: 'Fellowship',
    location: 'Remote',
    description: 'A leadership opportunity for emerging scholars.',
    aiSummary: 'Short summary',
    deadline: new Date(Date.now() + 20 * 86400000).toISOString(),
    applyUrl: 'https://example.com/apply',
    image: null,
    requirements: ['Requirement 1'],
    benefits: ['Benefit 1'],
    applicationProcess: ['Step 1'],
    match: 91,
    featured: true,
    roadmap: [],
  };
}

function makeGroup(overrides: Record<string, unknown> = {}) {
  return {
    id: 'group-9',
    slug: 'global-fellowship-crew',
    name: 'Global Fellowship crew',
    description: null,
    opportunityId: 'opp-1',
    ownerId: 'user-2',
    visibility: 'public',
    joinPolicy: 'open',
    coverEmoji: '💬',
    accent: null,
    expiresAt: null,
    archivedAt: null,
    memberCount: 4,
    messageCount: 12,
    lastMessageAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

/** Walks up to the nearest pressable, mirroring the sibling detail suite. */
function pressNearest(node: any) {
  let current = node;
  while (current && !current.props?.onPress) current = current.parent;
  if (!current) throw new Error('Could not find a pressable ancestor');
  current.props.onPress();
}

describe('opportunity detail — discussion group row', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockBack.mockClear();
    mockPromptAuth.mockClear();
    mockGetOpportunity.mockReset();
    mockGetOpportunity.mockResolvedValue(makeOpportunity());
    mockFetchGroups.mockReset();
    mockFetchGroups.mockResolvedValue([]);
    mockIsSignedIn = true;
    mockIsGuest = false;
  });

  it("opens this opportunity's existing group", async () => {
    mockFetchGroups.mockResolvedValue([{ group: makeGroup(), membership: null }]);

    const { getByText } = render(<OpportunityDetailScreen />);
    await waitFor(() => expect(getByText('Global Fellowship crew')).toBeTruthy());

    // The lookup is scoped to THIS opportunity: an unfiltered list would open
    // whichever group happened to be first in the feed.
    expect(mockFetchGroups).toHaveBeenCalledWith(
      expect.objectContaining({ opportunityId: 'opp-1' }),
      mockGetToken,
    );

    pressNearest(getByText('Global Fellowship crew'));

    expect(mockPush).toHaveBeenCalledWith('/discussions/group-9');
    // Not the create form — the whole failure this spec exists to catch.
    expect(mockPush).not.toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/discussions/new' }),
    );
  });

  it('routes to create with the opportunity prefilled when no group exists', async () => {
    mockFetchGroups.mockResolvedValue([]);

    const { getByText } = render(<OpportunityDetailScreen />);
    await waitFor(() => expect(getByText('Start a group')).toBeTruthy());

    pressNearest(getByText('Start a group'));

    // Prefilled AND labelled: the create screen renders the opportunity as a
    // locked row, and without the title it would show a raw UUID there.
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/discussions/new',
      params: { opportunityId: 'opp-1', opportunityTitle: 'Global Fellowship' },
    });
  });

  it('raises the auth wall for a guest instead of navigating', async () => {
    mockIsSignedIn = false;
    mockIsGuest = true;

    const { getByText } = render(<OpportunityDetailScreen />);
    await waitFor(() => expect(getByText('Start a group')).toBeTruthy());

    pressNearest(getByText('Start a group'));

    expect(mockPromptAuth).toHaveBeenCalled();
    // Nothing about discussions may be pushed: a guest landing on a group
    // screen gets a 401 and a dead end instead of a sign-in prompt.
    mockPush.mock.calls.forEach(([arg]) => {
      const route = typeof arg === 'string' ? arg : arg?.pathname;
      expect(String(route)).not.toContain('/discussions');
    });
    // And a guest costs no request: the answer would not change the outcome.
    expect(mockFetchGroups).not.toHaveBeenCalled();
  });

  it('leaves the rest of the detail screen intact when the lookup fails', async () => {
    class CommunityApiError extends Error {
      status: number;
      constructor(message: string, status: number) {
        super(message);
        this.name = 'CommunityApiError';
        this.status = status;
      }
    }
    mockFetchGroups.mockRejectedValue(
      new CommunityApiError('Groups are having a moment.', 500),
    );

    const { getByText, queryByText } = render(<OpportunityDetailScreen />);

    // The page still renders everything it rendered before this row existed.
    await waitFor(() => expect(getByText('Global Fellowship')).toBeTruthy());
    expect(getByText('Apply Now')).toBeTruthy();
    expect(getByText('Edutu')).toBeTruthy();

    await waitFor(() => expect(mockFetchGroups).toHaveBeenCalled());

    // The row itself is gone rather than guessing. "No group exists" and "we
    // could not find out" are different facts, and offering "Start a group" on
    // a failed lookup produces a duplicate room.
    expect(queryByText('Start a group')).toBeNull();
    expect(queryByText('Discussion')).toBeNull();
    // Nothing is shouted at a user who never asked about groups.
    expect(queryByText('Groups are having a moment.')).toBeNull();
  });

  it('does not render the row while the opportunity is still loading', async () => {
    let resolveOpportunity: (value: unknown) => void = () => {};
    mockGetOpportunity.mockReturnValue(
      new Promise((resolve) => {
        resolveOpportunity = resolve;
      }),
    );
    mockFetchGroups.mockResolvedValue([{ group: makeGroup(), membership: null }]);

    const { queryByText, getByText } = render(<OpportunityDetailScreen />);

    expect(queryByText('Discussion')).toBeNull();
    expect(queryByText('Global Fellowship crew')).toBeNull();

    resolveOpportunity(makeOpportunity());
    await waitFor(() => expect(getByText('Global Fellowship crew')).toBeTruthy());
  });
});
