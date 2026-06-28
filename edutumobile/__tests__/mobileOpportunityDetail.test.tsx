import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, Linking, Share, Text, View, TouchableOpacity } from 'react-native';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockGetToken = jest.fn().mockResolvedValue('token');
const mockGetOpportunity = jest.fn();
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

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'opp-1' }),
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

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
}));

jest.mock('../lib/supabase', () => ({
  supabase: {},
}));

jest.mock('@edutu/core/src/services/opportunities', () => ({
  getOpportunity: (...args: unknown[]) => mockGetOpportunity(...args),
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
    mockOpportunity = null;
    mockGetOpportunity.mockResolvedValue(mockOpportunity);
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

  it('renders a loaded opportunity and supports save/apply actions', async () => {
    mockOpportunity = makeOpportunity();
    mockGetOpportunity.mockResolvedValue(mockOpportunity);

    const { getByText } = render(<OpportunityDetailScreen />);

    await waitFor(() => expect(getByText('Global Fellowship')).toBeTruthy());
    expect(getByText('Edutu')).toBeTruthy();
    expect(getByText('Apply Now')).toBeTruthy();
    expect(getByText('Save')).toBeTruthy();

    fireEvent.press(getByText('Save'));
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
    });

    const originalRequestAnimationFrame = (global as any).requestAnimationFrame;
    (global as any).requestAnimationFrame = (callback: FrameRequestCallback) => {
      callback(0);
      return 1 as never;
    };

    try {
      const { getByText } = render(<OpportunityDetailScreen />);

      await waitFor(() => expect(getByText('Global Fellowship')).toBeTruthy());

      fireEvent.press(getByText('Share2'));
      await waitFor(() => expect(shareSpy).toHaveBeenCalledWith({
        title: 'Global Fellowship',
        message: expect.any(String),
        url: 'https://example.com/apply',
      }));

      jest.useFakeTimers();
      await act(async () => {
        pressNearestTouchTarget(getByText('Generate ROADMAP using AI'));
      });
      await act(async () => {
        jest.advanceTimersByTime(1600);
        await Promise.resolve();
      });
      expect(mockSpendCredits).toHaveBeenCalledWith(10, 'AI Roadmap: Global Fellowship');
      expect(mockGenerateRoadmap).toHaveBeenCalledWith(expect.objectContaining({
        id: 'opp-1',
        title: 'Global Fellowship',
      }));
    } finally {
      (global as any).requestAnimationFrame = originalRequestAnimationFrame;
      jest.useRealTimers();
    }
  });
});
