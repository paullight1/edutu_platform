/* eslint-disable import/first -- mocks are declared before the screen import. */
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const mockGetToken = jest.fn().mockResolvedValue('token');
const mockFetchGroups = jest.fn();
const mockFetchDmConversations = jest.fn();
const mockFetchDmRequests = jest.fn();
const mockAcceptDmRequest = jest.fn();
const mockDeclineDmRequest = jest.fn();
const mockBlockDmUser = jest.fn();
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

jest.mock('@edutu/core/src/services/communities', () => {
  const actual = jest.requireActual('@edutu/core/src/services/communities');
  return {
    ...actual,
    fetchGroups: (...args: unknown[]) => mockFetchGroups(...args),
  };
});

jest.mock('@edutu/core/src/services/communityDms', () => {
  const actual = jest.requireActual('@edutu/core/src/services/communityDms');
  return {
    ...actual,
    fetchDmConversations: (...args: unknown[]) => mockFetchDmConversations(...args),
    fetchDmRequests: (...args: unknown[]) => mockFetchDmRequests(...args),
    acceptDmRequest: (...args: unknown[]) => mockAcceptDmRequest(...args),
    declineDmRequest: (...args: unknown[]) => mockDeclineDmRequest(...args),
    blockDmUser: (...args: unknown[]) => mockBlockDmUser(...args),
    hideDmConversation: (...args: unknown[]) => mockHideDmConversation(...args),
  };
});

import CommunityChatsScreen from '../app/(app)/discussions/chats';
import type {
  CommunityGroup,
  CommunityGroupMember,
  GroupWithMembership,
  MembershipStatus,
} from '@edutu/core/src/services/communities';

function group(id: string, name: string, lastMessageAt: string | null): CommunityGroup {
  return {
    id,
    slug: id,
    name,
    description: null,
    opportunityId: null,
    ownerId: 'owner_1',
    visibility: 'public',
    joinPolicy: 'open',
    coverEmoji: '🎓',
    accent: null,
    expiresAt: null,
    archivedAt: null,
    memberCount: 12,
    messageCount: lastMessageAt ? 8 : 0,
    lastMessageAt,
    createdAt: '2026-07-01T00:00:00.000Z',
  };
}

function membership(groupId: string, status: MembershipStatus): CommunityGroupMember {
  return {
    id: `membership-${groupId}`,
    groupId,
    userId: 'user_1',
    role: 'member',
    status,
    joinedAt: '2026-07-02T00:00:00.000Z',
  };
}

function row(
  id: string,
  name: string,
  status: MembershipStatus,
  lastMessageAt: string | null,
): GroupWithMembership {
  return {
    group: group(id, name, lastMessageAt),
    membership: membership(id, status),
  };
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockFetchGroups.mockResolvedValue([]);
  mockFetchDmConversations.mockResolvedValue([]);
  mockFetchDmRequests.mockResolvedValue([]);
  mockAcceptDmRequest.mockResolvedValue({ id: 'request-1', status: 'accepted' });
  mockDeclineDmRequest.mockResolvedValue({ success: true });
  mockBlockDmUser.mockResolvedValue({ success: true });
  mockHideDmConversation.mockResolvedValue({ success: true });
});

describe('Community chats inbox', () => {
  it('lists supported group rooms and separates invitations', async () => {
    await AsyncStorage.setItem(
      'edutu:discussions:lastRead',
      JSON.stringify({ active: '2026-08-01T08:00:00.000Z' }),
    );
    mockFetchGroups.mockResolvedValue([
      row('active', 'Scholarship circle', 'active', '2026-08-01T10:00:00.000Z'),
      row('invited', 'Design fellows', 'invited', '2026-08-01T09:00:00.000Z'),
      row('pending', 'Pending room', 'pending', null),
    ]);

    const screen = render(<CommunityChatsScreen />);

    await waitFor(() => screen.getByTestId('chat-row-active'));
    screen.getByTestId('chat-invitations');
    screen.getByTestId('chat-row-invited');
    screen.getByTestId('chat-unread-active');
    expect(screen.queryByText('Pending room')).toBeNull();

    fireEvent.press(screen.getByTestId('chat-row-active'));
    expect(mockPush).toHaveBeenCalledWith('/discussions/active');
  });

  it('uses a real empty state instead of inventing local personal chats', async () => {
    const screen = render(<CommunityChatsScreen />);

    await waitFor(() => screen.getByText('No conversations yet'));
    expect(screen.queryByText('Message requests')).toBeNull();

    fireEvent.press(screen.getByText('Explore communities'));
    expect(mockPush).toHaveBeenCalledWith('/discussions/explore');
  });

  it('combines accepted DMs and incoming requests with real actions', async () => {
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
    mockFetchDmRequests.mockImplementation((direction: string) => Promise.resolve(
      direction === 'incoming'
        ? [{
            id: 'request-1',
            direction: 'incoming',
            requestedBy: 'other-2',
            createdAt: '2026-08-01T11:00:00.000Z',
            otherUser: { userId: 'other-2', displayName: 'Tobi', avatarUrl: null },
            firstMessage: { body: 'Can we compare essays?', senderId: 'other-2', createdAt: '2026-08-01T11:00:00.000Z' },
          }]
        : [],
    ));

    const screen = render(<CommunityChatsScreen />);

    await waitFor(() => screen.getByTestId('dm-row-dm-1'));
    screen.getByTestId('dm-requests');
    screen.getByText('Can we compare essays?', { exact: false });
    fireEvent.press(screen.getByTestId('dm-row-dm-1'));
    expect(mockPush).toHaveBeenCalledWith('/discussions/dm/dm-1');

    fireEvent.press(screen.getByLabelText("Accept Tobi's message request"));
    await waitFor(() => expect(mockAcceptDmRequest).toHaveBeenCalledWith('request-1', mockGetToken));
    expect(mockPush).toHaveBeenCalledWith('/discussions/dm/request-1');
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
