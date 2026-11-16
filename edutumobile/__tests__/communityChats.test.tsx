/* eslint-disable import/first -- mocks are declared before the screen import. */
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

const mockGetToken = jest.fn().mockResolvedValue('token');
const mockFetchDmConversations = jest.fn();
const mockHideDmConversation = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => {
  const ReactModule = require('react');
  return {
    useRouter: () => ({ push: mockPush }),
    useFocusEffect: (callback: () => (() => void) | void) => {
      ReactModule.useEffect(callback, [callback]);
    },
  };
});

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => ({ getToken: mockGetToken, isSignedIn: true }),
}));

jest.mock('../components/context/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#FFFFFF',
      foreground: '#0F172A',
      card: '#F8FAFC',
      border: '#E2E8F0',
      accent: '#4F46E5',
      primary: '#4F46E5',
      accentLight: '#6366F1',
      muted: '#F1F5F9',
      mutedForeground: '#64748B',
      textSecondary: '#64748B',
      success: '#059669',
      warning: '#D97706',
      error: '#DC2626',
    },
  }),
}));

jest.mock('@edutu/core/src/services/communityDms', () => {
  const actual = jest.requireActual('@edutu/core/src/services/communityDms');
  return {
    ...actual,
    fetchDmConversations: (...args: unknown[]) => mockFetchDmConversations(...args),
    hideDmConversation: (...args: unknown[]) => mockHideDmConversation(...args),
  };
});

import CommunityChatsScreen from '../app/(app)/discussions/chats';

beforeEach(async () => {
  jest.clearAllMocks();
  mockFetchDmConversations.mockResolvedValue([]);
  mockHideDmConversation.mockResolvedValue({ success: true });
});

describe('Community chats inbox', () => {
  it('does not render community rooms in the direct-message inbox', async () => {
    const screen = render(<CommunityChatsScreen />);

    await waitFor(() => screen.getByText('No conversations yet'));
    expect(screen.queryByTestId('group-conversations')).toBeNull();
    expect(screen.queryByText('Group conversations')).toBeNull();
  });

  it('uses a real empty state instead of inventing local personal chats', async () => {
    const screen = render(<CommunityChatsScreen />);

    await waitFor(() => screen.getByText('No conversations yet'));
    expect(screen.queryByText('Message requests')).toBeNull();

    fireEvent.press(screen.getByText('Explore communities'));
    expect(mockPush).toHaveBeenCalledWith('/discussions/explore');
  });

  it('lists accepted direct conversations and does not show message requests', async () => {
    mockFetchDmConversations.mockResolvedValue([
      {
        id: 'dm-1',
        status: 'accepted',
        requestedBy: 'other-1',
        createdAt: '2026-08-01T09:00:00.000Z',
        acceptedAt: '2026-08-01T09:02:00.000Z',
        lastMessageAt: '2026-08-01T10:00:00.000Z',
        otherUser: { userId: 'other-1', displayName: 'Amina', avatarUrl: null },
        blocked: false,
        lastMessage: { body: 'How is your application?', senderId: 'other-1', createdAt: '2026-08-01T10:00:00.000Z' },
        unreadCount: 2,
      },
    ]);
    const screen = render(<CommunityChatsScreen />);

    await waitFor(() => screen.getByTestId('dm-row-dm-1'));
    expect(screen.queryByTestId('dm-requests')).toBeNull();
    fireEvent.press(screen.getByTestId('dm-row-dm-1'));
    expect(mockPush).toHaveBeenCalledWith('/discussions/dm/dm-1');
  });

  it('shows the unavailable state when direct conversations fail', async () => {
    mockFetchDmConversations.mockRejectedValue(new Error('temporary DM outage'));

    const screen = render(<CommunityChatsScreen />);

    await waitFor(() => screen.getByText('Conversations unavailable'));
    expect(screen.queryByTestId('group-conversations')).toBeNull();
  });

  it('exposes the swipe-remove action to assistive technology and hides only this inbox row', async () => {
    mockFetchDmConversations.mockResolvedValue([
      {
        id: 'dm-1',
        status: 'accepted',
        requestedBy: 'other-1',
        createdAt: '2026-08-01T09:00:00.000Z',
        acceptedAt: '2026-08-01T09:02:00.000Z',
        lastMessageAt: '2026-08-01T10:00:00.000Z',
        otherUser: { userId: 'other-1', displayName: 'Amina', avatarUrl: null },
        blocked: false,
        lastMessage: { body: 'How is your application?', senderId: 'other-1', createdAt: '2026-08-01T10:00:00.000Z' },
        unreadCount: 0,
      },
    ]);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _body, buttons) => {
      buttons?.find((button) => button.style === 'destructive')?.onPress?.();
    });

    const screen = render(<CommunityChatsScreen />);
    const row = await waitFor(() => screen.getByTestId('dm-row-dm-1'));
    fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'delete' } });

    await waitFor(() => expect(mockHideDmConversation).toHaveBeenCalledWith('dm-1', mockGetToken));
    await waitFor(() => expect(screen.queryByTestId('dm-row-dm-1')).toBeNull());
    alert.mockRestore();
  });
});
