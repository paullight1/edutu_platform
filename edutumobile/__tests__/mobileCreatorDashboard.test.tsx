import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => false);
const mockGetToken = jest.fn();
const mockFetch = jest.fn();
const mockUploadCommunityAsset = jest.fn().mockResolvedValue({ url: 'https://files.example.com/uploaded.jpg', error: null });

let mockCreatorStatus: 'none' | 'pending' | 'approved' | 'rejected' = 'none';
let mockUserState = {
  user: {
    id: 'creator-user-1',
    firstName: 'Amina',
    fullName: 'Amina Creator',
    imageUrl: null,
    primaryEmailAddress: { emailAddress: 'amina.creator@example.com' },
  },
};
// The roadmaps this user owns, as returned by GET /roadmaps/mine (serialized snake_case).
let mockMine: Array<Record<string, unknown>> = [];
let mockAlertSpy: jest.SpyInstance | null = null;
let originalFetch: typeof global.fetch | undefined;

const mockUseCreatorAccess = jest.fn();

const mockSupabase = {
  from: jest.fn((table: string) => {
    if (table === 'profiles') {
      return {
        select: () => ({
          eq: (..._args: unknown[]) => ({
            single: () => Promise.resolve({ data: { credits: 420 }, error: null }),
          }),
        }),
      };
    }
    return {};
  }),
};

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: mockCanGoBack,
  }),
}));

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => ({ getToken: mockGetToken }),
  useUser: () => mockUserState,
}));

jest.mock('../components/context/ThemeContext', () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      background: '#FFFFFF',
      foreground: '#111827',
      card: '#FFFFFF',
      border: '#E5E7EB',
      accent: '#146ef5',
      primary: '#146ef5',
      textSecondary: '#64748B',
      error: '#DC2626',
    },
  }),
}));

jest.mock('../components/ui/ScreenHeader', () => ({
  ScreenHeader: ({ title, subtitle, showBack }: { title: string; subtitle?: string; showBack?: boolean }) => {
    const React = require('react');
    const { Text, View } = require('react-native');
    return (
      <View>
        {showBack ? <Text>Back</Text> : null}
        <Text>{title}</Text>
        {subtitle ? <Text>{subtitle}</Text> : null}
      </View>
    );
  },
}));

// LoadState renders a BrandedLoader internally; stub it to just show its label.
jest.mock('../components/ui/LoadState', () => ({
  LoadState: ({ label }: { label?: string }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return <Text>{label ?? 'Loading'}</Text>;
  },
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(),
}));

jest.mock('expo-image-picker', () => ({
  MediaTypeOptions: { Images: 'Images' },
  launchImageLibraryAsync: jest.fn(),
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

jest.mock('../lib/supabase', () => ({
  supabase: mockSupabase,
}));

jest.mock('@edutu/core/src/hooks/useCreatorAccess', () => ({
  useCreatorAccess: (...args: unknown[]) => mockUseCreatorAccess(...args),
}), { virtual: true });

jest.mock('@edutu/core/src/services/storage', () => ({
  uploadCommunityAsset: (...args: unknown[]) => mockUploadCommunityAsset(...args),
}), { virtual: true });

jest.mock('@edutu/core/src/utils/auth', () => ({
  toSafeUUID: (value: string) => `safe-${value}`,
}), { virtual: true });

const CreatorDashboardScreen = require('../app/(app)/creator-dashboard').default;

function findNearestTouchTarget(node: any) {
  let current = node;
  while (current && !current.props?.onPress) {
    current = current.parent;
  }
  if (!current) {
    throw new Error('Could not find a pressable ancestor');
  }
  return current;
}

async function pressNearestTouchTarget(node: any) {
  const current = findNearestTouchTarget(node);
  await act(async () => {
    await current.props.onPress?.();
  });
}

function setCreatorStatus(status: 'none' | 'pending' | 'approved' | 'rejected') {
  mockCreatorStatus = status;
  mockUseCreatorAccess.mockImplementation(() => ({
    status: mockCreatorStatus,
    isLoading: false,
    isApproved: mockCreatorStatus === 'approved',
    isPending: mockCreatorStatus === 'pending',
    isRejected: mockCreatorStatus === 'rejected',
    error: null,
    checkAccess: jest.fn(),
  }));
}

function renderDashboard(status: 'none' | 'pending' | 'approved' | 'rejected' = 'none') {
  setCreatorStatus(status);
  return render(<CreatorDashboardScreen />);
}

async function fillWizardThroughReview(getByText: any, getByPlaceholderText: any) {
  await pressNearestTouchTarget(getByText('Create Roadmap'));
  await waitFor(() => expect(getByText('Roadmap Basics')).toBeTruthy());

  await pressNearestTouchTarget(getByText('template'));
  fireEvent.changeText(getByPlaceholderText('e.g. Complete Web Development Roadmap'), 'Complete Web Development Roadmap');
  fireEvent.changeText(getByPlaceholderText('What will students learn? What outcomes can they expect?'), 'A guided path for new developers.');
  fireEvent.changeText(getByPlaceholderText('Why are you qualified to create this roadmap?'), 'I have shipped several production apps.');
  await waitFor(() => expect(findNearestTouchTarget(getByText('Continue')).props.disabled).toBe(false));
  await pressNearestTouchTarget(getByText('Continue'));

  await waitFor(() => expect(getByText('Curriculum Stages')).toBeTruthy());
  await pressNearestTouchTarget(getByText('Add Stage'));
  fireEvent.changeText(getByPlaceholderText('Stage title (e.g. Fundamentals)'), 'Foundations');
  fireEvent.changeText(getByPlaceholderText('Brief description of this stage'), 'Start here.');
  fireEvent.changeText(getByPlaceholderText('Duration (e.g. Week 1-2)'), 'Week 1-2');
  await waitFor(() => expect(findNearestTouchTarget(getByText('Continue')).props.disabled).toBe(false));
  await pressNearestTouchTarget(getByText('Continue'));

  await waitFor(() => expect(getByText('Resources & Files')).toBeTruthy());
  await pressNearestTouchTarget(getByText('Continue'));

  await waitFor(() => expect(getByText('Review & Submit')).toBeTruthy());
}

describe('mobile creator dashboard flow', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockReplace.mockClear();
    mockBack.mockClear();
    mockGetToken.mockReset();
    mockFetch.mockReset();
    mockUploadCommunityAsset.mockClear();
    mockUseCreatorAccess.mockReset();
    mockSupabase.from.mockClear();
    mockCreatorStatus = 'none';
    mockUserState = {
      user: {
        id: 'creator-user-1',
        firstName: 'Amina',
        fullName: 'Amina Creator',
        imageUrl: null,
        primaryEmailAddress: { emailAddress: 'amina.creator@example.com' },
      },
    };
    mockAlertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined as never);
    originalFetch = global.fetch;
    (global as any).fetch = mockFetch;
    mockGetToken.mockResolvedValue('token-123');
    mockMine = [
      { id: 'r1', title: 'Intro to Web Dev', category: 'education', status: 'published', enrollment_count: 12, steps: [{ id: 's1', title: 'Basics', description: 'Learn the basics.' }] },
      { id: 'r2', title: 'Mentor Sprint', category: 'career', status: 'personal', enrollment_count: 0, steps: [] },
    ];
    // Route the fetch mock by URL: GET /roadmaps/mine returns the list; all
    // writes (POST/PUT/DELETE) succeed.
    mockFetch.mockImplementation((url: string, init: any = {}) => {
      const method = init.method || 'GET';
      if (url.includes('/roadmaps/mine') && method === 'GET') {
        return Promise.resolve({ ok: true, status: 200, json: async () => mockMine });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true }) });
    });
    setCreatorStatus('none');
  });

  afterEach(() => {
    mockAlertSpy?.mockRestore();
    mockAlertSpy = null;
    if (originalFetch) {
      (global as any).fetch = originalFetch;
    }
  });

  it('opens for any signed-in user and lists their roadmaps from /roadmaps/mine', async () => {
    const { getByText, getAllByText } = renderDashboard('none');

    await waitFor(() => expect(getByText('My Roadmaps')).toBeTruthy());
    expect(getByText('Intro to Web Dev')).toBeTruthy();
    expect(getByText('Mentor Sprint')).toBeTruthy();
    // Stats: credits (420), total enrollments (12 — also on the published card), total roadmaps (2).
    expect(getByText('420')).toBeTruthy();
    expect(getAllByText('12').length).toBeGreaterThan(0);
    expect(getByText('2')).toBeTruthy();

    // Non-creators see a publish upsell that routes to the application.
    await pressNearestTouchTarget(getByText('Become a verified creator'));
    expect(mockPush).toHaveBeenCalledWith('/creator-apply');
  });

  it('saves a personal roadmap (POST /roadmaps/mine) for a non-creator', async () => {
    const { getByText, getByPlaceholderText, queryByText } = renderDashboard('none');
    await waitFor(() => expect(getByText('My Roadmaps')).toBeTruthy());

    await fillWizardThroughReview(getByText, getByPlaceholderText);
    // No public toggle for non-creators — the primary action saves privately.
    await pressNearestTouchTarget(getByText('Save Roadmap'));

    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/roadmaps/mine'),
      expect.objectContaining({ method: 'POST' }),
    ));
    const postCall = mockFetch.mock.calls.find((c: any[]) => (c[1]?.method === 'POST'));
    expect(postCall[0]).toContain('/roadmaps/mine');
    expect(postCall[0]).not.toContain('/roadmaps/creator');
    const body = JSON.parse(postCall[1].body as string);
    expect(body).toEqual(expect.objectContaining({
      title: 'Complete Web Development Roadmap',
      category: 'skills',
      steps: [expect.objectContaining({ title: 'Foundations', phase: 'Stage 1' })],
    }));

    await waitFor(() => expect(mockAlertSpy).toHaveBeenCalledWith(
      'Roadmap saved',
      'It’s now in your Roadmaps → My Roadmaps.',
    ));
    expect(queryByText('Review & Submit')).toBeNull();
  });

  it('lets an approved creator publish publicly (POST /roadmaps/creator)', async () => {
    const { getByText, getByPlaceholderText } = renderDashboard('approved');
    await waitFor(() => expect(getByText('My Roadmaps')).toBeTruthy());

    await fillWizardThroughReview(getByText, getByPlaceholderText);
    // Flip the visibility toggle to publish into the public catalog.
    await pressNearestTouchTarget(getByText('Save to My Roadmaps'));
    await waitFor(() => expect(getByText('Publish Now')).toBeTruthy());
    await pressNearestTouchTarget(getByText('Publish Now'));

    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/roadmaps/creator'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer token-123' }),
      }),
    ));
  });
});
