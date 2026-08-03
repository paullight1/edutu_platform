import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, Linking, Share } from 'react-native';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockGetToken = jest.fn().mockResolvedValue('token');
const mockGetOpportunity = jest.fn();
const mockFetchOpportunityRanking = jest.fn().mockResolvedValue(null);
const mockIsOpportunitySaved = jest.fn();
const mockSaveOpportunity = jest.fn().mockResolvedValue(undefined);
const mockUnsaveOpportunity = jest.fn().mockResolvedValue(undefined);
const mockTrackOpportunityApplication = jest.fn().mockResolvedValue(undefined);
const mockRecordOpportunitySignal = jest.fn();
const mockCreateGoal = jest.fn().mockResolvedValue(undefined);
const mockUpdateGoal = jest.fn().mockResolvedValue(undefined);
const mockSpendCredits = jest.fn().mockResolvedValue(true);
const mockIsPro = false;
const mockCredits = 12;
const mockGenerateRoadmap = jest.fn();

let mockOpportunity: any = null;
let mockUserState: { user: { id: string } | null };
let mockIsSignedIn = false;
let mockIsGuest = false;
const mockPromptAuth = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'opp-1' }),
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => ({ getToken: mockGetToken, isSignedIn: mockIsSignedIn }),
  useUser: () => mockUserState,
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
  File: {
    downloadFileAsync: jest.fn(),
  },
  Paths: {
    cache: '/tmp',
  },
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
  registerForPushNotificationsAsync: jest.fn().mockResolvedValue(null),
}));

jest.mock('../lib/supabase', () => ({
  supabase: require('../test-utils/supabaseMock').createSupabaseMock(),
}));

jest.mock('@edutu/core/src/services/opportunities', () => ({
  getOpportunity: (...args: unknown[]) => mockGetOpportunity(...args),
  // The detail screen calls getOpportunityWithStatus; delegate to the same mock
  // so existing mockGetOpportunity.mockResolvedValue(...) setups keep working.
  getOpportunityWithStatus: async (...args: unknown[]) => {
    const opportunity = await mockGetOpportunity(...args);
    return { opportunity, status: opportunity ? 'ok' : 'not_found' };
  },
  fetchOpportunityRanking: (...args: unknown[]) => mockFetchOpportunityRanking(...args),
}), { virtual: true });

jest.mock('../packages/core/src/services/bookmarks', () => ({
  isOpportunitySaved: (...args: unknown[]) => mockIsOpportunitySaved(...args),
  saveOpportunity: (...args: unknown[]) => mockSaveOpportunity(...args),
  unsaveOpportunity: (...args: unknown[]) => mockUnsaveOpportunity(...args),
}), { virtual: true });

jest.mock('../packages/core/src/services/applications', () => ({
  trackOpportunityApplication: (...args: unknown[]) => mockTrackOpportunityApplication(...args),
}), { virtual: true });

jest.mock('@edutu/core/src/services/opportunitySignals', () => ({
  recordOpportunitySignal: (...args: unknown[]) => mockRecordOpportunitySignal(...args),
}), { virtual: true });

jest.mock('@edutu/core/src/services/aiRoadmapGenerator', () => ({
  generateRoadmapFromOpportunity: (...args: unknown[]) => mockGenerateRoadmap(...args),
  generateRoadmap: (...args: unknown[]) => Promise.resolve(mockGenerateRoadmap(...args)),
}), { virtual: true });

jest.mock('@edutu/core/src/hooks/useGoals', () => ({
  useGoals: () => ({
    createGoal: (...args: unknown[]) => mockCreateGoal(...args),
    updateGoal: (...args: unknown[]) => mockUpdateGoal(...args),
  }),
}), { virtual: true });

jest.mock('@edutu/core/src/hooks/useCredits', () => ({
  useCredits: () => ({
    credits: mockCredits,
    isLoading: false,
    spendCredits: (...args: unknown[]) => mockSpendCredits(...args),
  }),
}), { virtual: true });

jest.mock('@edutu/core/src/hooks/useProStatus', () => ({
  useProStatus: () => ({
    isPro: mockIsPro,
    isLoading: false,
  }),
}), { virtual: true });

jest.mock('@edutu/core/src/utils/auth', () => ({
  toSafeUUID: (value: string) => `safe-${value}`,
}), { virtual: true });

const OpportunityDetailScreen = require('../app/(app)/opportunities/[id]').default;
const alertSpy = jest.spyOn(Alert, 'alert');
const openUrlSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
const shareSpy = jest.spyOn(Share, 'share').mockResolvedValue(undefined as never);

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

describe('mobile opportunity detail route', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockBack.mockClear();
    mockGetToken.mockClear();
    mockGetOpportunity.mockReset();
    mockIsOpportunitySaved.mockReset();
    mockSaveOpportunity.mockClear();
    mockUnsaveOpportunity.mockClear();
    mockTrackOpportunityApplication.mockClear();
    mockRecordOpportunitySignal.mockClear();
    mockCreateGoal.mockClear();
    mockUpdateGoal.mockClear();
    mockSpendCredits.mockClear();
    mockGenerateRoadmap.mockReset();
    alertSpy.mockClear();
    openUrlSpy.mockClear();
    shareSpy.mockClear();
    mockUserState = { user: { id: 'user-1' } };
    mockIsSignedIn = false;
    mockIsGuest = false;
    mockPromptAuth.mockClear();
    mockOpportunity = null;
    mockGetOpportunity.mockResolvedValue(mockOpportunity);
    mockFetchOpportunityRanking.mockReset();
    mockFetchOpportunityRanking.mockResolvedValue(null);
    mockIsOpportunitySaved.mockResolvedValue(false);
    mockSpendCredits.mockResolvedValue(true);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the not-found state and routes back', async () => {
    mockGetOpportunity.mockResolvedValue(null);

    const { getByText } = render(<OpportunityDetailScreen />);

    await waitFor(() => expect(getByText('Opportunity not found')).toBeTruthy());
    fireEvent.press(getByText('Go Back'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('sends the user to chat with the question prefilled, never auto-sent', async () => {
    mockIsSignedIn = true;
    mockOpportunity = makeOpportunity();
    mockGetOpportunity.mockResolvedValue(mockOpportunity);

    const { getByText } = render(<OpportunityDetailScreen />);
    await waitFor(() => expect(getByText('Global Fellowship')).toBeTruthy());

    fireEvent.press(getByText('Ask Edutu more…'));

    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/chat',
        params: expect.objectContaining({
          prefill: expect.stringContaining('Global Fellowship'),
        }),
      }),
    );
    // `voiceMsg` auto-sends and would spend a credit without the user ever
    // tapping send. It must never come back on this screen — in EITHER the
    // object-params form or a regression written as a raw query string
    // (e.g. `router.push('/chat?voiceMsg=…')`, the form _layout.tsx uses).
    const params = mockPush.mock.calls
      .map(([arg]) => (typeof arg === 'object' && arg ? arg.params : undefined))
      .filter(Boolean);
    params.forEach((p: Record<string, unknown>) => {
      expect(p.voiceMsg).toBeUndefined();
    });
    mockPush.mock.calls.forEach(([arg]) => {
      if (typeof arg === 'string') {
        expect(arg).not.toMatch(/voiceMsg/);
      }
    });
  });

  it('shows the "Ask Edutu more…" chip to guests and raises the auth wall instead of navigating', async () => {
    mockIsSignedIn = false;
    mockIsGuest = true;
    mockOpportunity = makeOpportunity();
    mockGetOpportunity.mockResolvedValue(mockOpportunity);

    const { getByText } = render(<OpportunityDetailScreen />);
    await waitFor(() => expect(getByText('Global Fellowship')).toBeTruthy());

    // The chip renders for guests too — this is the whole point of the fix:
    // it used to be nested inside an `isSignedIn &&` block and disappeared.
    const chip = getByText('Ask Edutu more…');
    expect(chip).toBeTruthy();

    fireEvent.press(chip);

    // Guests get the auth wall, never a navigation to chat — the previously
    // unreachable guest branch in `askEdutuMore` is now live.
    expect(mockPromptAuth).toHaveBeenCalledWith('ai');
    expect(mockPush).not.toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/chat' }),
    );
  });

  it('keeps a single AI affordance system — the old Ask-AI chip card is gone', async () => {
    mockIsSignedIn = true;
    mockOpportunity = makeOpportunity();
    mockGetOpportunity.mockResolvedValue(mockOpportunity);

    const { getByText, queryByText } = render(<OpportunityDetailScreen />);
    await waitFor(() => expect(getByText('Global Fellowship')).toBeTruthy());

    expect(queryByText('Ask Edutu AI about this opportunity')).toBeNull();
    expect(queryByText('Check eligibility')).toBeNull();
    expect(queryByText('Explain fit')).toBeNull();
    expect(queryByText('Tailor CV')).toBeNull();
    expect(queryByText('Plan prep')).toBeNull();
    // The win-coach pills stay: they answer in place.
    expect(getByText('Am I a fit?')).toBeTruthy();
    expect(getByText('Next move')).toBeTruthy();
    expect(getByText('Upload your CV for a sharper fit check')).toBeTruthy();
  });

  it('never invents an applicant count when the data is missing', async () => {
    mockOpportunity = makeOpportunity();
    mockGetOpportunity.mockResolvedValue(mockOpportunity);

    const { getByText, queryByText } = render(<OpportunityDetailScreen />);
    await waitFor(() => expect(getByText('Global Fellowship')).toBeTruthy());

    expect(queryByText('500+ applied')).toBeNull();
    expect(queryByText(/applied$/)).toBeNull();
  });

  it('shows the applicant count only when it is real', async () => {
    mockOpportunity = { ...makeOpportunity(), applicants: 42 };
    mockGetOpportunity.mockResolvedValue(mockOpportunity);

    const { getByText } = render(<OpportunityDetailScreen />);
    await waitFor(() => expect(getByText('Global Fellowship')).toBeTruthy());

    expect(getByText('42 applied')).toBeTruthy();
  });

  // GET /opportunities/:id is public, so the record the detail screen loads is
  // always unranked (match 0). Before the hydration call, that made "Not
  // ranked yet" permanent for every signed-in user with a complete profile.
  describe('fit ranking', () => {
    it('hydrates the fit verdict from the authenticated scorer', async () => {
      mockIsSignedIn = true;
      mockOpportunity = { ...makeOpportunity(), match: 0, matchReasons: [], matchRisks: [] };
      mockGetOpportunity.mockResolvedValue(mockOpportunity);
      mockFetchOpportunityRanking.mockResolvedValue({
        match: 84,
        matchFit: 84,
        matchReasons: ['Matches your interest in Climate'],
        matchRisks: [],
      });

      const { getByText, queryByText } = render(<OpportunityDetailScreen />);
      await waitFor(() => expect(getByText('Global Fellowship')).toBeTruthy());

      await waitFor(() => expect(getByText('Strong fit')).toBeTruthy());
      expect(getByText('Matches your interest in Climate')).toBeTruthy();
      expect(queryByText('Not ranked yet')).toBeNull();
    });

    it('says "Not ranked yet" exactly once when there is genuinely no verdict', async () => {
      mockIsSignedIn = true;
      mockOpportunity = { ...makeOpportunity(), match: 0 };
      mockGetOpportunity.mockResolvedValue(mockOpportunity);
      mockFetchOpportunityRanking.mockResolvedValue(null);

      const { getByText, queryAllByText } = render(<OpportunityDetailScreen />);
      await waitFor(() => expect(getByText('Global Fellowship')).toBeTruthy());

      // Was rendered twice: the decision strip's fit cell AND the fit panel.
      expect(queryAllByText('Not ranked yet')).toHaveLength(1);
    });
  });

  it('renders a loaded opportunity and supports save/apply actions', async () => {
    mockOpportunity = makeOpportunity();
    mockGetOpportunity.mockResolvedValue(mockOpportunity);

    const { getByText, getByLabelText, queryAllByLabelText } = render(<OpportunityDetailScreen />);

    await waitFor(() => expect(getByText('Global Fellowship')).toBeTruthy());
    expect(getByText('Edutu')).toBeTruthy();
    expect(getByText('Apply Now')).toBeTruthy();
    // Exactly ONE save control on the page — the header's. It used to be
    // repeated in the quiet footer and again in the sticky bar.
    expect(queryAllByLabelText('Save')).toHaveLength(1);

    fireEvent.press(getByLabelText('Save'));
    await waitFor(() => expect(mockSaveOpportunity).toHaveBeenCalledWith(
      expect.any(Object),
      'user-1',
      'opp-1',
      mockGetToken,
    ));
    expect(alertSpy).toHaveBeenCalledWith('Saved', 'Opportunity saved to your list');

    fireEvent.press(getByText('Apply Now'));
    await waitFor(() => expect(mockTrackOpportunityApplication).toHaveBeenCalledWith(
      expect.any(Object),
      'user-1',
      expect.objectContaining({
        opportunityId: 'opp-1',
        status: 'submitted',
      }),
      mockGetToken,
    ));
    expect(openUrlSpy).toHaveBeenCalledWith('https://example.com/apply');
  });

  it('shares the opportunity and can launch AI roadmap generation', async () => {
    mockOpportunity = {
      ...makeOpportunity(),
      shareImageUrl: 'https://example.com/share.png',
    };
    mockGetOpportunity.mockResolvedValue(mockOpportunity);
    mockGenerateRoadmap.mockReturnValue({
      milestones: [
        {
          id: 'milestone-1',
          title: 'Prepare application',
          description: 'Gather materials',
          date: '2026-07-01',
        },
      ],
      checklist: [
        {
          id: 'check-1',
          title: 'Submit transcript',
          category: 'document',
          completed: false,
        },
      ],
      resources: [
        {
          title: 'Official page',
          id: 'resource-1',
          type: 'official',
          description: 'Official opportunity page',
          url: 'https://example.com/resource',
        },
      ],
      weeklyGoals: [
        {
          week: 1,
          title: 'Foundation week',
          tasks: ['Review requirements'],
          deadline: '2026-07-03',
        },
      ],
      reminders: [
        {
          id: 'reminder-1',
          title: 'Prepare documents',
          date: '2026-07-02',
          type: 'deadline',
        },
      ],
      supportActions: ['Reach out to mentor'],
      deadline: '2026-07-20',
      winningStrategy: 'Lead with a strong fit narrative.',
      summary: 'A short roadmap summary',
      submissionTargetDate: '2026-07-10',
      daysUntilDeadline: 12,
      daysUntilSubmissionTarget: 10,
      totalWeeks: 2,
      dailyPlan: [
        {
          id: 'day-1',
          day: 1,
          date: '2026-07-01',
          title: 'Day 1: Review requirements',
          description: 'Review requirements',
          focus: 'research',
          durationMinutes: 45,
        },
      ],
      requirementActions: [],
      bestPractices: [],
      profileGaps: [],
      personalized: true,
    });

    const originalRequestAnimationFrame = (global as any).requestAnimationFrame;
    (global as any).requestAnimationFrame = (callback: FrameRequestCallback) => {
      callback(0);
      return 1 as never;
    };

    try {
      const { getByText, getAllByText } = render(<OpportunityDetailScreen />);

      await waitFor(() => expect(getByText('Global Fellowship')).toBeTruthy());

      // Share now has two entry points — the header icon and the quiet
      // footer action row. The header one is first in tree order.
      fireEvent.press(getAllByText('Share2')[0]);
      await waitFor(() => expect(shareSpy).toHaveBeenCalledWith({
        title: 'Global Fellowship',
        message: expect.any(String),
      }));

      jest.useFakeTimers();
      await act(async () => {
        pressNearestTouchTarget(getByText('Generate ROADMAP using AI'));
      });
      await act(async () => {
        jest.advanceTimersByTime(1600);
        await Promise.resolve();
      });
      // Roadmap AI is credit-metered server-side now (no client spendCredits).
      expect(mockGenerateRoadmap).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'opp-1', title: 'Global Fellowship' }),
        expect.any(Object),
      );
    } finally {
      (global as any).requestAnimationFrame = originalRequestAnimationFrame;
      jest.useRealTimers();
    }
  });
});
