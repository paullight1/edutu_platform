/* eslint-disable import/first -- mocks must be installed before screen imports. */
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockGetToken = jest.fn().mockResolvedValue('token');
const mockReplace = jest.fn();
const mockFetchConversation = jest.fn();
const mockFetchMessages = jest.fn();
const mockMarkRead = jest.fn();
const mockSendMessage = jest.fn();
const mockHideConversation = jest.fn();
const mockBlockUser = jest.fn();
const mockFetchRelationship = jest.fn();
const mockCreateRequest = jest.fn();
let mockParams: Record<string, string> = {};
const mockRouter = {
  push: jest.fn(),
  replace: mockReplace,
  back: jest.fn(),
  canGoBack: () => true,
};

jest.mock('expo-router', () => {
  const ReactModule = require('react');
  return {
    useRouter: () => mockRouter,
    useLocalSearchParams: () => mockParams,
    useFocusEffect: (callback: () => (() => void) | void) => {
      ReactModule.useEffect(callback, [callback]);
    },
  };
});

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => ({ getToken: mockGetToken, userId: 'user-1', isSignedIn: true }),
}));

jest.mock('../components/context/ThemeContext', () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      background: '#FFFFFF',
      foreground: '#0F172A',
      card: '#F8FAFC',
      border: '#E2E8F0',
      accent: '#4F46E5',
      textSecondary: '#64748B',
      muted: '#F1F5F9',
      error: '#DC2626',
    },
  }),
}));

jest.mock('@edutu/core/src/services/communityDms', () => {
  const actual = jest.requireActual('@edutu/core/src/services/communityDms');
  return {
    ...actual,
    fetchDmConversation: (...args: unknown[]) => mockFetchConversation(...args),
    fetchDmMessages: (...args: unknown[]) => mockFetchMessages(...args),
    markDmConversationRead: (...args: unknown[]) => mockMarkRead(...args),
    sendDmMessage: (...args: unknown[]) => mockSendMessage(...args),
    hideDmConversation: (...args: unknown[]) => mockHideConversation(...args),
    blockDmUser: (...args: unknown[]) => mockBlockUser(...args),
    fetchDmRelationship: (...args: unknown[]) => mockFetchRelationship(...args),
    createDmRequest: (...args: unknown[]) => mockCreateRequest(...args),
  };
});

import DirectMessageScreen from '../app/(app)/discussions/dm/[id]';
import NewDirectMessageScreen from '../app/(app)/discussions/dm/new';

const conversation = {
  id: 'dm-1',
  status: 'accepted',
  requestedBy: 'user-2',
  createdAt: '2026-08-01T09:00:00.000Z',
  acceptedAt: '2026-08-01T09:02:00.000Z',
  lastMessageAt: '2026-08-01T09:02:00.000Z',
  otherUser: { userId: 'user-2', displayName: 'Amina', avatarUrl: null },
  blocked: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { id: 'dm-1' };
  mockFetchConversation.mockResolvedValue(conversation);
  mockFetchMessages.mockResolvedValue([]);
  mockMarkRead.mockResolvedValue({ success: true });
  mockSendMessage.mockResolvedValue(null);
  mockHideConversation.mockResolvedValue({ success: true });
  mockBlockUser.mockResolvedValue({ success: true });
  mockFetchRelationship.mockResolvedValue(null);
  mockCreateRequest.mockResolvedValue({});
});

describe('direct-message screens', () => {
  it('finishes loading and explains an invalid conversation link', async () => {
    mockParams = { id: '' };
    const screen = render(<DirectMessageScreen />);

    await waitFor(() => screen.getByText('Conversation unavailable'));
    screen.getByText('This conversation link is invalid.');
    expect(mockFetchConversation).not.toHaveBeenCalled();
  });

  it('shows a useful empty state instead of a blank accepted conversation', async () => {
    const screen = render(<DirectMessageScreen />);

    await waitFor(() => screen.getByText('Start the conversation'));
    screen.getByText('Send a message below. Only you and Amina can see it.');
    screen.getByTestId('dm-composer-input');
  });

  it('never carries messages into a different conversation after a partial refresh failure', async () => {
    mockFetchMessages.mockResolvedValueOnce([
      {
        id: 'message-private-1',
        conversationId: 'dm-1',
        senderId: 'user-2',
        body: 'Private application detail',
        createdAt: '2026-08-01T09:03:00.000Z',
        sender: conversation.otherUser,
      },
    ]);
    const screen = render(<DirectMessageScreen />);
    await waitFor(() => screen.getByText('Private application detail'));

    mockParams = { id: 'dm-2' };
    mockFetchConversation.mockResolvedValueOnce({
      ...conversation,
      id: 'dm-2',
      otherUser: { userId: 'user-3', displayName: 'Tobi', avatarUrl: null },
    });
    mockFetchMessages.mockRejectedValueOnce(new Error('offline'));
    screen.rerender(<DirectMessageScreen />);

    await waitFor(() => screen.getByText('Tobi'));
    expect(screen.queryByText('Private application detail')).toBeNull();
  });

  it('discards an older-message page that resolves after the route changes', async () => {
    let resolveOlder: (messages: unknown[]) => void = () => undefined;
    const olderPage = new Promise<unknown[]>((resolve) => {
      resolveOlder = resolve;
    });
    mockFetchMessages
      .mockResolvedValueOnce(Array.from({ length: 40 }, (_, index) => ({
        id: `message-${index}`,
        conversationId: 'dm-1',
        senderId: 'user-2',
        body: `Current message ${index}`,
        createdAt: `2026-08-01T08:${String(59 - index).padStart(2, '0')}:00.000Z`,
        sender: conversation.otherUser,
      })))
      .mockImplementationOnce(() => olderPage)
      .mockResolvedValueOnce([]);

    const screen = render(<DirectMessageScreen />);
    const list = await waitFor(() => screen.getByTestId('dm-message-list'));
    act(() => list.props.onEndReached());

    mockParams = { id: 'dm-2' };
    mockFetchConversation.mockResolvedValueOnce({
      ...conversation,
      id: 'dm-2',
      otherUser: { userId: 'user-3', displayName: 'Tobi', avatarUrl: null },
    });
    screen.rerender(<DirectMessageScreen />);
    await waitFor(() => screen.getByText('Tobi'));

    await act(async () => {
      resolveOlder([{
        id: 'stale-older-message',
        conversationId: 'dm-1',
        senderId: 'user-2',
        body: 'Old private history',
        createdAt: '2026-07-30T08:00:00.000Z',
        sender: conversation.otherUser,
      }]);
      await olderPage;
    });

    expect(screen.queryByText('Old private history')).toBeNull();
  });

  it('finishes sending when a background refresh starts mid-request', async () => {
    jest.useFakeTimers();
    let resolveSend: (message: unknown) => void = () => undefined;
    const pendingSend = new Promise((resolve) => {
      resolveSend = resolve;
    });
    mockSendMessage.mockImplementationOnce(() => pendingSend);

    try {
      const screen = render(<DirectMessageScreen />);
      await act(async () => Promise.resolve());
      await act(async () => Promise.resolve());

      fireEvent.changeText(screen.getByTestId('dm-composer-input'), 'Hello Amina');
      fireEvent.press(screen.getByTestId('dm-send'));
      expect(screen.getByTestId('dm-send').props.accessibilityState.busy).toBe(true);

      await act(async () => {
        jest.advanceTimersByTime(10_000);
        await Promise.resolve();
        await Promise.resolve();
      });

      await act(async () => {
        resolveSend({
          id: 'sent-1',
          conversationId: 'dm-1',
          senderId: 'user-1',
          body: 'Hello Amina',
          createdAt: '2026-08-01T09:04:00.000Z',
          sender: { userId: 'user-1', displayName: 'Me', avatarUrl: null },
        });
        await pendingSend;
      });

      expect(screen.getByTestId('dm-send').props.accessibilityState.busy).toBe(false);
      screen.getByText('Hello Amina');
    } finally {
      jest.useRealTimers();
    }
  });

  it('finishes loading older messages when a background refresh starts mid-request', async () => {
    jest.useFakeTimers();
    let resolveOlder: (messages: unknown[]) => void = () => undefined;
    const pendingOlder = new Promise<unknown[]>((resolve) => {
      resolveOlder = resolve;
    });
    const firstPage = Array.from({ length: 40 }, (_, index) => ({
      id: `page-message-${index}`,
      conversationId: 'dm-1',
      senderId: 'user-2',
      body: `Page message ${index}`,
      createdAt: `2026-08-01T08:${String(59 - index).padStart(2, '0')}:00.000Z`,
      sender: conversation.otherUser,
    }));
    mockFetchMessages
      .mockResolvedValueOnce(firstPage)
      .mockImplementationOnce(() => pendingOlder)
      .mockResolvedValueOnce([]);

    try {
      const screen = render(<DirectMessageScreen />);
      await act(async () => Promise.resolve());
      await act(async () => Promise.resolve());
      act(() => screen.getByTestId('dm-message-list').props.onEndReached());
      expect(screen.getByTestId('dm-loading-older')).toBeTruthy();

      await act(async () => {
        jest.advanceTimersByTime(10_000);
        await Promise.resolve();
        await Promise.resolve();
      });
      await act(async () => {
        resolveOlder([{
          id: 'older-1',
          conversationId: 'dm-1',
          senderId: 'user-2',
          body: 'Earlier message',
          createdAt: '2026-07-31T08:00:00.000Z',
          sender: conversation.otherUser,
        }]);
        await pendingOlder;
      });

      expect(screen.queryByTestId('dm-loading-older')).toBeNull();
      expect(mockFetchMessages).toHaveBeenCalledWith(
        'dm-1',
        expect.objectContaining({ beforeId: expect.any(String), limit: 40 }),
        mockGetToken,
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not expose the request composer when the relationship check fails', async () => {
    mockParams = { userId: 'user-2', name: 'Amina' };
    mockFetchRelationship.mockRejectedValue(new Error('offline'));
    const screen = render(<NewDirectMessageScreen />);

    await waitFor(() => screen.getByText('Messages unavailable'));
    expect(screen.queryByTestId('dm-request-input')).toBeNull();
    fireEvent.press(screen.getByText('Try again'));
    await waitFor(() => expect(mockFetchRelationship).toHaveBeenCalledTimes(2));
  });
});
