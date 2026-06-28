import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, Text, TouchableOpacity, View } from 'react-native';

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
let mockPosts: Array<{
  id: string;
  title: string;
  metadata?: { category?: string; price?: string; users?: number };
  visibility?: 'public' | 'private';
}> = [];
let mockAlertSpy: jest.SpyInstance | null = null;
let originalFetch: typeof global.fetch | undefined;

const mockUseCreatorAccess = jest.fn();

const mockSupabase = {
  from: jest.fn((table: string) => {
    if (table === 'community_posts') {
      return {
        select: () => ({
          eq: (..._args: unknown[]) => Promise.resolve({ data: mockPosts, error: null }),
        }),
      };
    }

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

jest.mock('../components/ui/BrandedLoader', () => ({
  BrandedLoader: ({ label }: { label: string }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return <Text>{label}</Text>;
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
    checkAccess: jest.fn(),
  }));
}

function renderDashboard(status: 'none' | 'pending' | 'approved' | 'rejected' = 'none') {
  setCreatorStatus(status);
  return render(<CreatorDashboardScreen />);
}

function fillApprovedRoadmapWizard(getByText: any, getByPlaceholderText: any) {
  fireEvent.changeText(getByPlaceholderText('e.g. Complete Web Development Roadmap'), 'Complete Web Development Roadmap');
  fireEvent.changeText(getByPlaceholderText('What will students learn? What outcomes can they expect?'), 'A guided path for new developers.');
  fireEvent.changeText(getByPlaceholderText('0 for free roadmap'), '75');
  fireEvent.changeText(getByPlaceholderText('Why are you qualified to create this roadmap?'), 'I have shipped several production apps.');
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
    mockPosts = [];
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
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    mockPosts = [
      {
        id: 'roadmap-1',
        title: 'Intro to Web Dev',
        visibility: 'public',
        metadata: { category: 'course', price: 'Premium', users: 12 },
      },
      {
        id: 'roadmap-2',
        title: 'Mentor Sprint',
        visibility: 'private',
        metadata: { category: 'mentorship', price: 'Free', users: 3 },
      },
    ];
    setCreatorStatus('none');
  });

  afterEach(() => {
    mockAlertSpy?.mockRestore();
    mockAlertSpy = null;
    if (originalFetch) {
      (global as any).fetch = originalFetch;
    }
  });

  it('shows the none access state and routes to the creator application', async () => {
    const { getByText } = renderDashboard('none');

    await waitFor(() => expect(getByText('Apply to Become a Creator')).toBeTruthy());
    expect(getByText('85% Revenue Share')).toBeTruthy();

    await pressNearestTouchTarget(getByText('Apply to Become a Creator'));
    expect(mockPush).toHaveBeenCalledWith('/creator-apply');
  });

  it('shows the pending and rejected access states with the correct actions', async () => {
    const pending = renderDashboard('pending');
    await waitFor(() => expect(pending.getByText('Application Pending')).toBeTruthy());
    expect(pending.getByText('Browse Roadmaps')).toBeTruthy();

    await pressNearestTouchTarget(pending.getByText('Browse Roadmaps'));
    expect(mockPush).toHaveBeenCalledWith('/roadmaps');

    pending.unmount();

    const rejected = renderDashboard('rejected');
    await waitFor(() => expect(rejected.getByText('Application Not Approved')).toBeTruthy());
    expect(rejected.getByText('Reapply')).toBeTruthy();

    await pressNearestTouchTarget(rejected.getByText('Reapply'));
    expect(mockPush).toHaveBeenCalledWith('/creator-apply');
  });

  it('publishes a roadmap from the approved dashboard after validating wizard steps', async () => {
    const { getByText, getByPlaceholderText, queryByText } = renderDashboard('approved');

    await waitFor(() => expect(getByText('My Roadmaps')).toBeTruthy());
    expect(getByText('Intro to Web Dev')).toBeTruthy();
    expect(getByText('Mentor Sprint')).toBeTruthy();
    expect(getByText('420')).toBeTruthy();
    expect(getByText('15')).toBeTruthy();
    expect(getByText('2')).toBeTruthy();

    await pressNearestTouchTarget(getByText('Create Roadmap'));
    await waitFor(() => expect(getByText('Roadmap Basics')).toBeTruthy());
    expect(findNearestTouchTarget(getByText('Continue')).props.disabled).toBe(true);

    await pressNearestTouchTarget(getByText('template'));
    fillApprovedRoadmapWizard(getByText, getByPlaceholderText);
    await waitFor(() => expect(findNearestTouchTarget(getByText('Continue')).props.disabled).toBe(false));
    await pressNearestTouchTarget(getByText('Continue'));

    await waitFor(() => expect(getByText('Curriculum Stages')).toBeTruthy());
    expect(findNearestTouchTarget(getByText('Continue')).props.disabled).toBe(true);

    await pressNearestTouchTarget(getByText('Add Stage'));
    fireEvent.changeText(getByPlaceholderText('Stage title (e.g. Fundamentals)'), 'Foundations');
    fireEvent.changeText(getByPlaceholderText('Brief description of this stage'), 'Start here.');
    fireEvent.changeText(getByPlaceholderText('Duration (e.g. Week 1-2)'), 'Week 1-2');
    await waitFor(() => expect(findNearestTouchTarget(getByText('Continue')).props.disabled).toBe(false));
    await pressNearestTouchTarget(getByText('Continue'));

    await waitFor(() => expect(getByText('Resources & Files')).toBeTruthy());
    await pressNearestTouchTarget(getByText('Continue'));

    await waitFor(() => expect(getByText('Review & Submit')).toBeTruthy());
    expect(getByText('Complete Web Development Roadmap')).toBeTruthy();
    expect(getByText('template')).toBeTruthy();
    expect(getByText('75 credits')).toBeTruthy();
    expect(getByText('Foundations')).toBeTruthy();

    await pressNearestTouchTarget(getByText('Submit for Review'));

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(mockGetToken).toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/roadmaps/creator'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer token-123',
        }),
      }),
    );

    const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(requestBody).toEqual(expect.objectContaining({
      title: 'Complete Web Development Roadmap',
      description: 'A guided path for new developers.\n\nI have shipped several production apps.',
      category: 'skills',
      difficulty: 'intermediate',
      estimatedDuration: 'Varies',
      outcomes: '',
      coverImage: '',
      creatorProof: expect.objectContaining({
        name: 'Amina Creator',
        email: 'amina.creator@example.com',
        price: '75',
        verified: true,
      }),
      steps: [
        expect.objectContaining({
          id: expect.any(String),
          title: 'Foundations',
          description: 'Start here.',
          duration: 'Week 1-2',
          phase: 'Stage 1',
          taskType: 'task',
        }),
      ],
      resources: [],
      relatedOpportunities: [],
    }));

    await waitFor(() => expect(mockAlertSpy).toHaveBeenCalledWith(
      'Success!',
      'Your roadmap is published and visible to learners.',
    ));
    expect(queryByText('Review & Submit')).toBeNull();
  });
});
