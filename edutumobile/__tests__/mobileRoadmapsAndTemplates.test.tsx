import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import { Alert, Linking, Platform, Text, View } from 'react-native';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockGetToken = jest.fn().mockResolvedValue('token');
let mockUserState: { user: { id: string } | null };
let mockFetch: jest.Mock;
const mockRequestPermissions = jest.fn();
const mockScheduleNotificationAsync = jest.fn();
const mockAlert = jest.spyOn(Alert, 'alert');
const mockOpenUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
const mockShareAsync = jest.fn().mockResolvedValue(undefined);

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

jest.mock('@clerk/clerk-expo', () => ({
  useUser: () => mockUserState,
  useAuth: () => ({ getToken: mockGetToken }),
}));

jest.mock('../components/context/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#FFFFFF',
      foreground: '#111827',
      primary: '#2563EB',
      accent: '#2563EB',
      card: '#FFFFFF',
      border: '#E5E7EB',
    },
    isDark: false,
  }),
}));

jest.mock('../components/ui/ScreenHeader', () => ({
  ScreenHeader: ({ title, subtitle }: { title: string; subtitle?: string }) => {
    const React = require('react');
    const { Text, View } = require('react-native');
    return (
      <View>
        <Text>{title}</Text>
        {subtitle ? <Text>{subtitle}</Text> : null}
      </View>
    );
  },
}));

jest.mock('../components/ui/BrandedLoader', () => ({
  BrandedLoader: ({ label }: { label?: string }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return <Text>{label || 'Loading'}</Text>;
  },
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

jest.mock('expo-file-system', () => ({
  File: class {
    uri: string;
    constructor(dir: string, name: string) {
      this.uri = `file://${dir}/${name}`;
    }
    write = jest.fn();
  },
  Paths: {
    cache: '/tmp',
  },
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(false),
  shareAsync: (...args: unknown[]) => mockShareAsync(...args),
}));

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: (...args: unknown[]) => mockScheduleNotificationAsync(...args),
}));

jest.mock('../lib/notifications', () => ({
  notificationService: {
    requestPermissions: (...args: unknown[]) => mockRequestPermissions(...args),
  },
}));

const RoadmapsScreen = require('../app/(app)/roadmaps').default;
const RoadmapTemplatesScreen = require('../app/(app)/roadmap-templates').default;

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

function makeRoadmap() {
  return {
    id: 'roadmap-1',
    title: 'Frontend Roadmap',
    slug: 'frontend-roadmap',
    description: 'Learn modern frontend workflows.',
    category: 'tech',
    difficulty: 'Intermediate',
    estimated_duration: '8 weeks',
    target_audience: 'Aspiring developers',
    prerequisites: 'Basic HTML and CSS',
    outcomes: 'Build and ship polished interfaces.',
    cover_image: '',
    status: 'published',
    creator_name: 'Edutu',
    is_featured: true,
    enrollment_count: 124,
    rating_avg: 48,
    rating_count: 18,
    steps: [
      {
        id: 'step-1',
        title: 'Set up the stack',
        description: 'Prepare your tools and workflow.',
        duration: '1 week',
      },
      {
        id: 'step-2',
        title: 'Ship a project',
        description: 'Build and deploy a polished project.',
        duration: '2 weeks',
      },
    ],
    resources: [
      {
        id: 'resource-1',
        title: 'Docs',
        url: 'https://example.com/docs',
        type: 'guide',
      },
    ],
    ai_intent_tags: ['frontend'],
    satisfaction_score: 4.8,
    created_at: '2026-06-22T00:00:00.000Z',
  };
}

describe('mobile roadmaps and templates routes', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockBack.mockClear();
    mockGetToken.mockClear();
    mockRequestPermissions.mockReset();
    mockScheduleNotificationAsync.mockReset();
    mockAlert.mockClear();
    mockOpenUrl.mockClear();
    mockShareAsync.mockClear();
    mockUserState = { user: { id: 'user-1' } };
    mockRequestPermissions.mockResolvedValue(true);
    mockScheduleNotificationAsync.mockResolvedValue('nid');
    mockFetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/roadmaps?')) {
        return {
          ok: true,
          json: async () => [makeRoadmap()],
        } as Response;
      }
      return {
        ok: false,
        json: async () => ({}),
      } as Response;
    });
    global.fetch = mockFetch as never;
  });

  it('loads roadmaps and opens the detail modal plus template route', async () => {
    const { getByText } = render(<RoadmapsScreen />);

    await waitFor(() => expect(getByText('Frontend Roadmap')).toBeTruthy());
    expect(getByText('Explore Roadmap Templates')).toBeTruthy();

    await act(async () => {
      pressNearestTouchTarget(getByText('Frontend Roadmap'));
    });

    await waitFor(() => expect(getByText('Start This Roadmap')).toBeTruthy());
    expect(getByText('For: Aspiring developers')).toBeTruthy();
    expect(getByText('8 weeks')).toBeTruthy();

    await act(async () => {
      pressNearestTouchTarget(getByText('Explore Roadmap Templates'));
    });

    expect(mockPush).toHaveBeenCalledWith('/roadmap-templates');
  });

  it('renders roadmap templates and exports calendar reminders', async () => {
    const { getByText, getAllByText } = render(<RoadmapTemplatesScreen />);

    await waitFor(() => expect(getByText('Explore Templates')).toBeTruthy());
    await act(async () => {
      pressNearestTouchTarget(getByText('Complete Python Programming Course'));
    });

    await waitFor(() => expect(getByText('Start roadmap')).toBeTruthy());

    await act(async () => {
      pressNearestTouchTarget(getAllByText('Calendar').pop());
    });

    expect(mockAlert).toHaveBeenCalledWith(
      expect.stringMatching(/Calendar ready|Calendar file created/),
      expect.any(String),
    );

    await act(async () => {
      pressNearestTouchTarget(getByText('Reminders'));
    });

    await waitFor(() => expect(mockRequestPermissions).toHaveBeenCalled());
    expect(mockScheduleNotificationAsync).toHaveBeenCalled();
    expect(mockAlert).toHaveBeenCalledWith(
      'Reminders scheduled',
      expect.stringContaining('roadmap reminders are now scheduled'),
    );
  });

  it('renders roadmap cards and their detail stats', async () => {
    const { getByText } = render(<RoadmapsScreen />);

    await waitFor(() => expect(getByText('Frontend Roadmap')).toBeTruthy());
    await act(async () => {
      pressNearestTouchTarget(getByText('Frontend Roadmap'));
    });

    await waitFor(() => expect(getByText('Start This Roadmap')).toBeTruthy());
    expect(getByText('8 weeks')).toBeTruthy();
    expect(getByText('For: Aspiring developers')).toBeTruthy();
  });
});
