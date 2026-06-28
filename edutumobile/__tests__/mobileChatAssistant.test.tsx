import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockSetParams = jest.fn();
const mockGetToken = jest.fn().mockResolvedValue('token');
const mockSendMessage = jest.fn().mockResolvedValue({
  threadId: 'thread-1',
  userMessage: {
    id: 'u-1',
    role: 'user',
    content: 'Hello',
    created_at: '2026-06-22T00:00:00.000Z',
  },
  assistantMessage: {
    id: 'a-1',
    role: 'assistant',
    content: 'Hi there',
    created_at: '2026-06-22T00:01:00.000Z',
  },
});
const mockSelectThread = jest.fn();
const mockArchiveThread = jest.fn();
const mockUpdateGoal = jest.fn();
const mockCreateGoal = jest.fn();

let mockLocalParams: { voiceMsg?: string } = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, setParams: mockSetParams, canGoBack: () => false, back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => mockLocalParams,
}));

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => ({ getToken: mockGetToken }),
  useUser: () => ({
    user: { id: 'user-1', fullName: 'Amina Okafor', firstName: 'Amina', primaryEmailAddress: { emailAddress: 'amina@example.com' } },
  }),
}));

jest.mock('../components/context/ThemeContext', () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      background: '#FFFFFF',
      foreground: '#111827',
      card: '#FFFFFF',
      border: '#E5E7EB',
      primary: '#2563EB',
      accent: '#6366F1',
    },
  }),
}));

jest.mock('../components/ui/ScreenHeader', () => ({
  ScreenHeader: ({ title, right }: { title: string; right?: React.ReactNode }) => {
    const React = require('react');
    const { Text, View } = require('react-native');
    return (
      <View>
        <Text>{title}</Text>
        {right}
      </View>
    );
  },
}));

jest.mock('../components/branding/EdutuLogo', () => ({
  EdutuLogo: () => {
    const React = require('react');
    const { Text } = require('react-native');
    return <Text>EdutuLogo</Text>;
  },
}));

jest.mock('../components/ui/BrandedLoader', () => ({
  BrandedLoader: ({ label }: { label?: string }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return <Text>{label || 'Loading'}</Text>;
  },
}));

jest.mock('../lib/notifications', () => ({
  notificationService: {
    scheduleGoalReminder: jest.fn().mockResolvedValue('notification-1'),
    cancelNotification: jest.fn().mockResolvedValue(undefined),
    notify: jest.fn(),
    triggerHaptic: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../lib/supabase', () => ({
  supabase: {},
}));

jest.mock('@edutu/core/src/hooks/useGoals', () => ({
  useGoals: () => ({
    goals: [],
    createGoal: (...args: unknown[]) => mockCreateGoal(...args),
    updateGoal: (...args: unknown[]) => mockUpdateGoal(...args),
  }),
}), { virtual: true });

jest.mock('@edutu/core/src/hooks/useChat', () => ({
  useChat: () => ({
    threads: [],
    messages: [],
    selectedThreadId: null,
    isLoadingThreads: false,
    isLoadingMessages: false,
    isSending: false,
    selectThread: mockSelectThread,
    sendMessage: (...args: unknown[]) => mockSendMessage(...args),
    archiveThread: mockArchiveThread,
  }),
}), { virtual: true });

jest.mock('@edutu/core/src/hooks/useOpportunities', () => ({
  useOpportunities: () => ({
    data: [],
    loading: false,
  }),
}), { virtual: true });

jest.mock('@edutu/core/src/services/aiRoadmapGenerator', () => ({
  generateRoadmapFromOpportunity: jest.fn().mockReturnValue({
    winningStrategy: 'Focus on the core fit.',
    submissionTargetDate: '2030-04-01T00:00:00.000Z',
    resources: [],
    milestones: [],
    dailyPlan: [],
    checklist: [],
  }),
}), { virtual: true });

jest.mock('../hooks/useTextToSpeech', () => ({
  useTextToSpeech: () => ({
    isSpeaking: false,
    speak: jest.fn(),
    stop: jest.fn(),
  }),
}));

jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return new Proxy(
    { __esModule: true },
    {
      get: (_target, prop) => {
        if (prop === '__esModule') return true;
        if (typeof prop === 'string') {
          return () => <Text>{prop}</Text>;
        }
        return undefined;
      },
    },
  );
});

const ChatScreen = require('../app/(app)/chat').default;

function findTouchable(node: any) {
  let current = node;
  while (current && !current.props?.onPress) {
    current = current.parent;
  }
  if (!current) {
    throw new Error('Could not find a pressable ancestor');
  }
  return current;
}

function pressByText(getByText: (text: string) => any, label: string) {
  act(() => {
    findTouchable(getByText(label)).props.onPress?.();
  });
}

describe('mobile chat assistant', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockSetParams.mockClear();
    mockGetToken.mockClear();
    mockSendMessage.mockClear();
    mockSelectThread.mockClear();
    mockArchiveThread.mockClear();
    mockUpdateGoal.mockClear();
    mockCreateGoal.mockClear();
    mockLocalParams = {};
  });

  it('sends quick prompts and opens the conversation history modal', async () => {
    const { getAllByText, getByText, queryByText } = render(<ChatScreen />);

    await waitFor(() => expect(getAllByText('Find scholarships').length).toBeGreaterThan(0));
    act(() => {
      findTouchable(getAllByText('Build roadmap')[0]).props.onPress?.();
    });

    expect(mockSendMessage).toHaveBeenCalledWith('Build a roadmap for my next application');

    pressByText(getByText, 'History');
    expect(getByText('Conversations')).toBeTruthy();

    pressByText(getByText, 'New Conversation');
    expect(mockSelectThread).toHaveBeenCalledWith(null);
    await waitFor(() => expect(queryByText('Conversations')).toBeNull());
  });

  it('auto-sends voice message deep links and clears the route parameter', async () => {
    mockLocalParams = { voiceMsg: 'Find scholarships I can apply for this month' };

    render(<ChatScreen />);

    await waitFor(() =>
      expect(mockSendMessage).toHaveBeenCalledWith('Find scholarships I can apply for this month'),
    );
    expect(mockSetParams).toHaveBeenCalledWith({ voiceMsg: undefined });
  });

  it('sends a typed composer message and clears the input field', async () => {
    const { getByPlaceholderText, getByText } = render(<ChatScreen />);

    fireEvent.changeText(getByPlaceholderText('Message Edutu...'), 'Tell me about internships');
    pressByText(getByText, 'Send');

    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledWith('Tell me about internships'));
    expect(getByPlaceholderText('Message Edutu...').props.value).toBe('');
  });
});
