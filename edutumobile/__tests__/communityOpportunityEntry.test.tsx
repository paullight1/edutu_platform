import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

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
  fetchOpportunityRanking: jest.fn().mockResolvedValue(null),
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

  it('keeps opportunity details usable without social links or group lookups', async () => {
    const { getByText, queryByText } = render(<OpportunityDetailScreen />);
    await waitFor(() => expect(getByText('Global Fellowship')).toBeTruthy(), { timeout: 10000 });
    expect(getByText('Apply Now')).toBeTruthy();
    expect(queryByText('Discussion')).toBeNull();
    expect(queryByText('Start one')).toBeNull();
    expect(mockFetchGroups).not.toHaveBeenCalled();
  });
});
