import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import { Alert, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

let mockRouteParams: Record<string, string> = {};

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: () => ({ push: mockPush, back: mockBack }),
    useLocalSearchParams: () => mockRouteParams,
    useFocusEffect: (callback: () => void | (() => void)) => {
      React.useEffect(() => {
        const cleanup = callback?.();
        return cleanup;
      }, [callback]);
    },
  };
});

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
const RoadmapTemplatesScreen = require('../app/(app)/roadmap-templates/index').default;
const RoadmapTemplateDetailScreen = require('../app/(app)/roadmap-templates/[id]').default;

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
    mockRouteParams = {};
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

  it('renders the templates gallery and navigates to the detail route', async () => {
    const { getByText } = render(<RoadmapTemplatesScreen />);

    await waitFor(() => expect(getByText('Explore Templates')).toBeTruthy());
    // Curated fallback set renders offline, with author metadata.
    expect(getByText('Land Your First Remote Tech Job')).toBeTruthy();
    expect(getByText('Kwame Osei')).toBeTruthy();

    await act(async () => {
      pressNearestTouchTarget(getByText('Land Your First Remote Tech Job'));
    });

    expect(mockPush).toHaveBeenCalledWith('/roadmap-templates/fallback-remote-tech-job');
  });

  it('renders backend-authored templates when the templates endpoint returns data', async () => {
    mockFetch.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/roadmaps/templates')) {
        return {
          ok: true,
          json: async () => [
            {
              id: 'db-roadmap-1',
              title: 'Chevening Scholarship Prep',
              description: 'A backend-authored roadmap.',
              category: 'scholarship',
              difficulty: 'intermediate',
              estimated_duration: '6 weeks',
              creator_name: 'Edutu Team',
              steps: [
                { id: 's1', title: 'Draft your SOP', description: 'Write the first draft.', relativeDueDays: 7 },
              ],
              resources: [],
            },
          ],
        } as Response;
      }
      return { ok: false, json: async () => ({}) } as Response;
    });

    const { getByText, queryByText } = render(<RoadmapTemplatesScreen />);

    // Backend template replaces the curated fallback set.
    await waitFor(() => expect(getByText('Chevening Scholarship Prep')).toBeTruthy());
    expect(queryByText('Land Your First Remote Tech Job')).toBeNull();
  });

  it('shows the template journey and exports calendar reminders from the detail screen', async () => {
    mockRouteParams = { id: 'fallback-remote-tech-job' };
    const { getByText, getAllByText } = render(<RoadmapTemplateDetailScreen />);

    await waitFor(() => expect(getByText('Start roadmap')).toBeTruthy());
    // Hero + author + sequence render from the curated fallback template.
    expect(getByText('Curated by Kwame Osei')).toBeTruthy();
    expect(getByText('Your journey')).toBeTruthy();
    // First step is auto-expanded and exposes its typed resources (also in the library).
    expect(getAllByText('Developer Roadmaps').length).toBeGreaterThan(0);

    await act(async () => {
      pressNearestTouchTarget(getByText('Calendar'));
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

  it('loads a backend template with comments on the detail screen', async () => {
    mockFetch.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/roadmaps/db-roadmap-1/comments')) {
        return {
          ok: true,
          json: async () => [
            {
              id: 'c1',
              author_name: 'Grace Achieng',
              body: 'This roadmap got me shortlisted!',
              rating: 5,
              created_at: '2026-07-01T00:00:00.000Z',
            },
          ],
        } as Response;
      }
      if (url.endsWith('/roadmaps/db-roadmap-1')) {
        return {
          ok: true,
          json: async () => ({
            id: 'db-roadmap-1',
            title: 'Chevening Scholarship Prep',
            description: 'A backend-authored roadmap.',
            category: 'scholarship',
            difficulty: 'intermediate',
            estimated_duration: '6 weeks',
            creator_name: 'Edutu Team',
            author_role: 'Scholarship Guidance',
            steps: [
              { id: 's1', title: 'Draft your SOP', description: 'Write the first draft.', relativeDueDays: 7, phase: 'writing', resources: ['res-1'] },
              { id: 's2', title: 'Secure references', description: 'Ask referees early.', relativeDueDays: 21 },
            ],
            resources: [{ id: 'res-1', title: 'SOP Guide', url: 'https://example.com/sop', type: 'guide' }],
          }),
        } as Response;
      }
      return { ok: false, json: async () => ({}) } as Response;
    });

    mockRouteParams = { id: 'db-roadmap-1' };
    const { getByText, getAllByText } = render(<RoadmapTemplateDetailScreen />);

    // relativeDueDays (7) → Week 1; the first step auto-expands with its resource.
    await waitFor(() => expect(getByText('Week 1')).toBeTruthy());
    expect(getByText('Draft your SOP')).toBeTruthy();
    expect(getAllByText('SOP Guide').length).toBeGreaterThan(0);
    // Learner comments load from the comments endpoint.
    await waitFor(() => expect(getByText('Grace Achieng')).toBeTruthy());
    expect(getByText('This roadmap got me shortlisted!')).toBeTruthy();
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

  describe('roadmap intent intake', () => {
    beforeEach(async () => {
      await AsyncStorage.clear();
    });

    // Routes the intent endpoints on top of the catalog route. /roadmaps/ai/assist
    // stays on the ok:false default, which exercises the built-in-questions fallback.
    function routeIntentFetch({
      intent,
      recommended = [],
    }: {
      intent: unknown;
      recommended?: unknown[];
    }) {
      const calls: { url: string; method: string; body?: string }[] = [];
      mockFetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        calls.push({ url, method, body: init?.body as string | undefined });
        if (url.includes('/roadmaps?')) {
          return { ok: true, json: async () => [makeRoadmap()] } as Response;
        }
        if (url.includes('/roadmaps/intent')) {
          return {
            ok: true,
            json: async () => (method === 'POST' ? {} : intent),
          } as Response;
        }
        if (url.includes('/roadmaps/recommended')) {
          return { ok: true, json: async () => recommended } as Response;
        }
        return { ok: false, status: 402, json: async () => ({}) } as Response;
      });
      global.fetch = mockFetch as never;
      return calls;
    }

    it('asks the intake questions when no intent is stored and saves the answers', async () => {
      const calls = routeIntentFetch({
        intent: null,
        recommended: [{ ...makeRoadmap(), id: 'rec-1', title: 'Recommended Roadmap' }],
      });

      const { getByText, queryByText } = render(<RoadmapsScreen />);
      await waitFor(() => expect(getByText('Frontend Roadmap')).toBeTruthy());
      await waitFor(() => expect(getByText('Help Us Find Your Perfect Roadmap')).toBeTruthy());

      await act(async () => {
        pressNearestTouchTarget(getByText('Beginner'));
      });
      await act(async () => {
        pressNearestTouchTarget(getByText('Find My Roadmaps'));
      });

      await waitFor(() => {
        const post = calls.find(
          (call) => call.url.includes('/roadmaps/intent') && call.method === 'POST',
        );
        expect(post).toBeTruthy();
        // The DTO's English enum, mapped from the tapped option's position —
        // not the (translated) label itself.
        expect(JSON.parse(post!.body!)).toEqual(
          expect.objectContaining({ currentLevel: 'beginner' }),
        );
      });

      // Modal closes and the list is seeded with the personalized picks.
      await waitFor(() => expect(getByText('Recommended Roadmap')).toBeTruthy());
      expect(queryByText('Find My Roadmaps')).toBeNull();
    });

    it('seeds the list with personalized picks when intent already exists', async () => {
      routeIntentFetch({
        intent: { id: 'intent-1', currentLevel: 'beginner' },
        recommended: [{ ...makeRoadmap(), id: 'rec-1', title: 'Recommended Roadmap' }],
      });

      const { getByText, queryByText } = render(<RoadmapsScreen />);
      await waitFor(() => expect(getByText('Recommended Roadmap')).toBeTruthy());
      expect(queryByText('Help Us Find Your Perfect Roadmap')).toBeNull();
    });

    it('remembers a skip and never re-prompts', async () => {
      routeIntentFetch({ intent: null });

      const first = render(<RoadmapsScreen />);
      await waitFor(() =>
        expect(first.getByText('Help Us Find Your Perfect Roadmap')).toBeTruthy(),
      );
      await act(async () => {
        pressNearestTouchTarget(first.getByText('Skip for now'));
      });
      await waitFor(() =>
        expect(first.queryByText('Help Us Find Your Perfect Roadmap')).toBeNull(),
      );
      expect(await AsyncStorage.getItem('edutu_roadmaps_intent_prompt_dismissed')).toBe('1');
      first.unmount();

      routeIntentFetch({ intent: null });
      const second = render(<RoadmapsScreen />);
      await waitFor(() => expect(second.getByText('Frontend Roadmap')).toBeTruthy());
      // Give the intent check a beat to run — the modal must stay away.
      await act(async () => {});
      expect(second.queryByText('Help Us Find Your Perfect Roadmap')).toBeNull();
    });
  });
});
