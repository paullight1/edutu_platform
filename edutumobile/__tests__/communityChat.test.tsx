/* eslint-disable import/first -- the jest.mock factories below close over the
   `mock*` consts, so those consts must be initialised before the modules under
   test are required. Imports therefore follow the mocks. */
/**
 * Group Discussions — the chat screen, its join gate, and the message hook.
 *
 * These are written against the failures that would actually hurt somebody:
 * a websocket left open behind a backgrounded screen, an unapproved applicant
 * reading a private room, a member losing what they typed because the screener
 * disagreed with it, a deleted message quietly vanishing instead of leaving a
 * tombstone, every group stuck permanently unread, and a keyset page that drops
 * rows because it forgot the id tiebreak.
 *
 * The focus/blur mock below is the load-bearing part of the first group. It
 * models what a navigator does — run the effect on focus, run its cleanup on
 * BLUR while the component stays mounted — so a component that used a bare
 * `useEffect` cleanup would never satisfy it.
 */
import React from 'react';
import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_READ_KEY = 'edutu:discussions:lastRead';

const mockGetToken = jest.fn().mockResolvedValue('token');
const mockFetchGroup = jest.fn();
const mockFetchMessages = jest.fn();
const mockSendMessage = jest.fn();
const mockJoinGroup = jest.fn();
const mockFetchGroupForm = jest.fn();
const mockDeleteMessage = jest.fn();
const mockReportTarget = jest.fn();
const mockUnsubscribe = jest.fn();
const mockSubscribe = jest.fn();

/** Params for the screen under test; reassigned per test. */
let mockRouteParams: Record<string, string> = { id: 'g1' };

/**
 * Cleanups registered by currently-focused effects. `blur()` drains and runs
 * them without unmounting anything — which is precisely the state an
 * unmount-only teardown gets wrong.
 */
const mockFocusCleanups: (() => void)[] = [];

function blur() {
  const pending = mockFocusCleanups.splice(0, mockFocusCleanups.length);
  act(() => {
    for (const cleanup of pending) cleanup();
  });
}

jest.mock('expo-router', () => {
  const ReactModule = require('react');
  return {
    useRouter: () => ({
      push: jest.fn(),
      replace: jest.fn(),
      back: jest.fn(),
      canGoBack: () => true,
    }),
    useLocalSearchParams: () => mockRouteParams,
    // A navigator's focus lifecycle, not a bare effect: the returned cleanup is
    // the BLUR handler and may run long before unmount.
    useFocusEffect: (callback: () => (() => void) | void) => {
      ReactModule.useEffect(() => {
        const cleanup = callback();
        if (typeof cleanup !== 'function') return undefined;
        mockFocusCleanups.push(cleanup);
        return () => {
          const index = mockFocusCleanups.indexOf(cleanup);
          if (index === -1) return; // already run by blur()
          mockFocusCleanups.splice(index, 1);
          cleanup();
        };
      }, [callback]);
    },
  };
});

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => ({ getToken: mockGetToken, userId: 'user_1', isSignedIn: true }),
  useUser: () => ({ user: { id: 'user_1' }, isLoaded: true }),
}));

jest.mock('../components/context/ThemeContext', () => ({
  useTheme: () => ({
    isDark: false,
    reducedMotion: false,
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

jest.mock('../lib/supabase', () => ({ supabase: {} }));

// requireActual keeps the real CommunityApiError so the screener test throws
// the shape the service really throws.
jest.mock('@edutu/core/src/services/communities', () => {
  const actual = jest.requireActual('@edutu/core/src/services/communities');
  return {
    ...actual,
    fetchGroup: (...args: unknown[]) => mockFetchGroup(...args),
    fetchMessages: (...args: unknown[]) => mockFetchMessages(...args),
    sendMessage: (...args: unknown[]) => mockSendMessage(...args),
    joinGroup: (...args: unknown[]) => mockJoinGroup(...args),
    fetchGroupForm: (...args: unknown[]) => mockFetchGroupForm(...args),
    deleteMessage: (...args: unknown[]) => mockDeleteMessage(...args),
    reportTarget: (...args: unknown[]) => mockReportTarget(...args),
  };
});

jest.mock('@edutu/core/src/services/communityRealtime', () => ({
  subscribeToGroupMessages: (...args: unknown[]) => mockSubscribe(...args),
}));

import GroupChatScreen from '../app/(app)/discussions/[id]';
import {
  MESSAGE_PAGE_SIZE,
  mergeMessages,
  useGroupMessages,
} from '../hooks/useGroupMessages';
import { CommunityApiError } from '@edutu/core/src/services/communities';
import type {
  CommunityGroup,
  CommunityGroupMember,
  CommunityMessage,
  MembershipStatus,
} from '@edutu/core/src/services/communities';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeGroup(overrides: Partial<CommunityGroup> = {}): CommunityGroup {
  return {
    id: 'g1',
    slug: 'g1',
    name: 'Chevening 2027',
    description: 'Applicants helping each other',
    opportunityId: null,
    ownerId: 'user_9',
    visibility: 'public',
    joinPolicy: 'open',
    coverEmoji: '🎓',
    accent: null,
    expiresAt: null,
    archivedAt: null,
    memberCount: 4,
    messageCount: 2,
    lastMessageAt: '2026-08-01T10:00:00.000Z',
    createdAt: '2026-07-01T10:00:00.000Z',
    ...overrides,
  };
}

function makeMembership(status: MembershipStatus): CommunityGroupMember {
  return {
    id: 'mem-1',
    groupId: 'g1',
    userId: 'user_1',
    role: 'member',
    status,
    joinedAt: '2026-07-10T10:00:00.000Z',
  };
}

function makeMessage(overrides: Partial<CommunityMessage> = {}): CommunityMessage {
  return {
    id: 'm1',
    groupId: 'g1',
    userId: 'user_9',
    body: 'Has anyone started the essay?',
    kind: 'text',
    opportunityId: null,
    createdAt: '2026-08-01T09:00:00.000Z',
    deletedAt: null,
    deletedBy: null,
    ...overrides,
  };
}

/** Wire `fetchGroup` for one membership state. */
function wireDetail(
  status: MembershipStatus | null,
  group: Partial<CommunityGroup> = {},
) {
  mockFetchGroup.mockResolvedValue({
    group: makeGroup(group),
    membership: status ? makeMembership(status) : null,
  });
}

/** The Realtime handler the screen registered, so a test can push a row. */
function realtimeHandler(): (message: CommunityMessage) => void {
  const call = mockSubscribe.mock.calls[mockSubscribe.mock.calls.length - 1];
  return call[1] as (message: CommunityMessage) => void;
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockFocusCleanups.length = 0;
  mockRouteParams = { id: 'g1' };
  await AsyncStorage.clear();
  mockSubscribe.mockReturnValue(mockUnsubscribe);
  mockFetchMessages.mockResolvedValue([]);
  mockFetchGroupForm.mockResolvedValue({ questions: [] });
  wireDetail('active');
});

// ---------------------------------------------------------------------------
// 1. The Realtime lifecycle
// ---------------------------------------------------------------------------

describe('realtime lifecycle', () => {
  it('subscribes on focus and unsubscribes on BLUR, while the screen is still mounted', async () => {
    const screen = render(<GroupChatScreen />);

    await waitFor(() => expect(mockSubscribe).toHaveBeenCalledTimes(1));
    expect(mockSubscribe.mock.calls[0][0]).toBe('g1');
    expect(mockUnsubscribe).not.toHaveBeenCalled();

    // Blur, NOT unmount. A screen pushed behind another stays mounted, and this
    // is the moment the socket has to go.
    blur();

    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    // Still mounted — proving the teardown was the blur cleanup and not an
    // unmount side effect.
    expect(screen.queryByTestId('chat-composer')).not.toBeNull();
  });

  it('opens exactly one channel, for the group on screen', async () => {
    render(<GroupChatScreen />);
    await waitFor(() => expect(mockSubscribe).toHaveBeenCalledTimes(1));
    expect(mockSubscribe).toHaveBeenCalledTimes(1);
  });

  it('never opens a socket for someone who may not read the group', async () => {
    wireDetail('pending');
    const screen = render(<GroupChatScreen />);

    await waitFor(() => screen.getByTestId('chat-gate'));
    expect(mockSubscribe).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 2. The join gate
// ---------------------------------------------------------------------------

describe('join gate', () => {
  it('gives an active member the composer and no gate', async () => {
    const screen = render(<GroupChatScreen />);
    await waitFor(() => screen.getByTestId('chat-composer'));
    expect(screen.queryByTestId('chat-gate')).toBeNull();
  });

  it('lets an invitee preview the room and accept — the only way into a private group', async () => {
    wireDetail('invited', { visibility: 'private', joinPolicy: 'request' });
    mockFetchMessages.mockResolvedValue([makeMessage()]);
    mockJoinGroup.mockResolvedValue({
      status: 'active',
      groupId: 'g1',
      membership: makeMembership('active'),
      request: null,
    });

    const screen = render(<GroupChatScreen />);

    // Preview: an invitee sees the conversation, but posts nothing yet.
    await waitFor(() => screen.getByTestId('message-bubble-m1'));
    expect(screen.queryByTestId('chat-composer')).toBeNull();
    screen.getByTestId('chat-gate');

    // Accept.
    mockFetchGroup.mockResolvedValue({
      group: makeGroup({ visibility: 'private', joinPolicy: 'request' }),
      membership: makeMembership('active'),
    });
    fireEvent.press(screen.getByTestId('chat-gate-accept'));

    await waitFor(() => expect(mockJoinGroup).toHaveBeenCalledTimes(1));
    expect(mockJoinGroup.mock.calls[0][0]).toBe('g1');
    expect(mockJoinGroup.mock.calls[0][1]).toEqual([]);

    // And the gate becomes the composer.
    await waitFor(() => screen.getByTestId('chat-composer'));
    expect(screen.queryByTestId('chat-gate')).toBeNull();
  });

  it('leaves a pending applicant waiting: no messages, no composer, no way to force entry', async () => {
    wireDetail('pending', { joinPolicy: 'request' });
    mockFetchMessages.mockResolvedValue([makeMessage()]);

    const screen = render(<GroupChatScreen />);
    await waitFor(() => screen.getByTestId('chat-gate'));

    // The room is not shown, and it is not even requested.
    expect(mockFetchMessages).not.toHaveBeenCalled();
    expect(screen.queryByTestId('message-bubble-m1')).toBeNull();
    expect(screen.queryByTestId('chat-list')).toBeNull();
    expect(screen.queryByTestId('chat-composer')).toBeNull();

    // No affordance offers a shortcut past the approval queue.
    expect(screen.queryByTestId('chat-gate-join')).toBeNull();
    expect(screen.queryByTestId('chat-gate-request')).toBeNull();
    expect(screen.queryByTestId('chat-gate-accept')).toBeNull();

    // And it reads as waiting, not as a refusal.
    expect(screen.getByTestId('chat-gate-explanation').props.children).toBe(
      "You applied to join. You'll get in as soon as the owner approves.",
    );
  });

  it('is terminal for a banned member — no retry, no invitation to try again', async () => {
    wireDetail('banned');
    const screen = render(<GroupChatScreen />);

    await waitFor(() => screen.getByTestId('chat-gate'));
    expect(screen.getByTestId('chat-gate-explanation').props.children).toBe(
      "You were banned from this group and can't rejoin.",
    );
    expect(screen.queryByTestId('chat-gate-join')).toBeNull();
    expect(screen.queryByTestId('chat-gate-request')).toBeNull();
    expect(screen.queryByTestId('chat-gate-accept')).toBeNull();
    expect(screen.queryByTestId('chat-composer')).toBeNull();
  });

  it('offers a removed member a way back in, unlike a banned one', async () => {
    wireDetail('removed');
    const screen = render(<GroupChatScreen />);
    await waitFor(() => screen.getByTestId('chat-gate-join'));
  });

  it('joins an open group in one tap', async () => {
    wireDetail(null);
    mockJoinGroup.mockResolvedValue({
      status: 'active',
      groupId: 'g1',
      membership: makeMembership('active'),
      request: null,
    });

    const screen = render(<GroupChatScreen />);
    await waitFor(() => screen.getByTestId('chat-gate-join'));

    wireDetail('active');
    fireEvent.press(screen.getByTestId('chat-gate-join'));
    await waitFor(() => screen.getByTestId('chat-composer'));
  });

  it('expands the request form INLINE on the gate rather than opening a screen or modal', async () => {
    wireDetail(null, { joinPolicy: 'request' });
    mockJoinGroup.mockResolvedValue({
      status: 'pending',
      groupId: 'g1',
      membership: makeMembership('pending'),
      request: null,
    });

    const screen = render(<GroupChatScreen />);
    await waitFor(() => screen.getByTestId('chat-gate-request'));
    expect(screen.queryByTestId('chat-request-form')).toBeNull();

    fireEvent.press(screen.getByTestId('chat-gate-request'));

    // Inline: the form appears INSIDE the gate that was already on screen.
    const form = await waitFor(() => screen.getByTestId('chat-request-form'));
    expect(form).not.toBeNull();
    screen.getByTestId('chat-gate');

    fireEvent.changeText(
      screen.getByTestId('chat-request-note'),
      'I am applying this cycle too.',
    );
    // The row the server will have written by the time the screen re-reads it.
    wireDetail('pending', { joinPolicy: 'request' });
    fireEvent.press(screen.getByTestId('chat-request-submit'));

    await waitFor(() => expect(mockJoinGroup).toHaveBeenCalledTimes(1));
    expect(mockJoinGroup.mock.calls[0][1]).toEqual([
      { id: 'message', value: 'I am applying this cycle too.' },
    ]);

    // Filing an application is not entry: the applicant now waits.
    await waitFor(() =>
      expect(screen.getByTestId('chat-gate-explanation').props.children).toBe(
        "You applied to join. You'll get in as soon as the owner approves.",
      ),
    );
  });

  it("renders the owner's screening questions in the inline form", async () => {
    wireDetail(null, { joinPolicy: 'request' });
    mockFetchGroupForm.mockResolvedValue({
      questions: [
        { id: 'q1', type: 'short_text', label: 'Which country are you in?', required: true },
        {
          id: 'q2',
          type: 'single_select',
          label: 'Have you applied before?',
          required: true,
          options: ['Yes', 'No'],
        },
      ],
    });
    mockJoinGroup.mockResolvedValue({
      status: 'pending',
      groupId: 'g1',
      membership: makeMembership('pending'),
      request: null,
    });

    const screen = render(<GroupChatScreen />);
    await waitFor(() => screen.getByTestId('chat-gate-request'));
    fireEvent.press(screen.getByTestId('chat-gate-request'));

    await waitFor(() => screen.getByTestId('chat-request-answer-q1'));
    fireEvent.changeText(screen.getByTestId('chat-request-answer-q1'), 'Nigeria');
    fireEvent.press(screen.getByTestId('chat-request-option-q2-No'));
    fireEvent.press(screen.getByTestId('chat-request-submit'));

    await waitFor(() => expect(mockJoinGroup).toHaveBeenCalledTimes(1));
    expect(mockJoinGroup.mock.calls[0][1]).toEqual([
      { id: 'q1', value: 'Nigeria' },
      { id: 'q2', value: 'No' },
    ]);
  });

  it("shows the server's sentence when a join is refused", async () => {
    wireDetail(null);
    const sentence =
      "You're already in 2 groups, which is the most you can join at once. Leave one to join another.";
    mockJoinGroup.mockRejectedValue(new CommunityApiError(sentence, 403));

    const screen = render(<GroupChatScreen />);
    await waitFor(() => screen.getByTestId('chat-gate-join'));
    fireEvent.press(screen.getByTestId('chat-gate-join'));

    await waitFor(() => screen.getByTestId('chat-gate-error'));
    expect(screen.getByTestId('chat-gate-error').props.children).toBe(sentence);
    expect(screen.queryByText(/403/)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. The screener
// ---------------------------------------------------------------------------

describe('screened send', () => {
  it("shows the server's sentence and KEEPS the text in the composer", async () => {
    const sentence =
      "That message can't be sent as written — it reads like it's asking for money.";
    mockSendMessage.mockRejectedValue(new CommunityApiError(sentence, 400));

    const screen = render(<GroupChatScreen />);
    await waitFor(() => screen.getByTestId('chat-composer-input'));

    const typed = 'Send me 5000 naira and I will share the essay';
    fireEvent.changeText(screen.getByTestId('chat-composer-input'), typed);
    fireEvent.press(screen.getByTestId('chat-composer-send'));

    await waitFor(() => screen.getByTestId('chat-composer-error'));

    // The sentence the backend wrote, verbatim — not a status, not a generic.
    expect(screen.getByTestId('chat-composer-error').props.children).toBe(sentence);
    expect(screen.queryByText(/400/)).toBeNull();
    expect(screen.queryByText('Something went wrong. Please try again.')).toBeNull();

    // And every character the user typed is still there to edit and resend.
    expect(screen.getByTestId('chat-composer-input').props.value).toBe(typed);

    // The optimistic bubble is rolled back so the room does not show a post
    // that never landed.
    expect(screen.queryByText(typed)).toBeNull();
  });

  it('clears the composer only when the post actually lands', async () => {
    const saved = makeMessage({ id: 'm-new', userId: 'user_1', body: 'Morning all' });
    mockSendMessage.mockResolvedValue(saved);

    const screen = render(<GroupChatScreen />);
    await waitFor(() => screen.getByTestId('chat-composer-input'));

    fireEvent.changeText(screen.getByTestId('chat-composer-input'), 'Morning all');
    fireEvent.press(screen.getByTestId('chat-composer-send'));

    await waitFor(() =>
      expect(screen.getByTestId('chat-composer-input').props.value).toBe(''),
    );
    screen.getByTestId('message-bubble-m-new');
  });
});

// ---------------------------------------------------------------------------
// 4. Tombstones
// ---------------------------------------------------------------------------

describe('soft deletes', () => {
  it('turns a deleted message into a tombstone IN PLACE, not a disappearing row', async () => {
    const older = makeMessage({ id: 'm1', createdAt: '2026-08-01T09:00:00.000Z' });
    const newer = makeMessage({
      id: 'm2',
      body: 'I start tonight',
      createdAt: '2026-08-01T09:30:00.000Z',
    });
    mockFetchMessages.mockResolvedValue([newer, older]);

    const screen = render(<GroupChatScreen />);
    await waitFor(() => screen.getByTestId('message-bubble-m1'));

    const rowIds = () =>
      screen
        .getAllByTestId(/^message-(bubble|tombstone)-m\d$/)
        .map((node) => node.props.testID);

    expect(rowIds()).toEqual(['message-bubble-m2', 'message-bubble-m1']);

    // A moderator soft-deletes m1: the server keeps the row, blanks the body and
    // stamps deletedAt, and Realtime delivers it as an UPDATE.
    act(() => {
      realtimeHandler()({ ...older, body: '', deletedAt: '2026-08-01T10:00:00.000Z' });
    });

    await waitFor(() => screen.getByTestId('message-tombstone-m1'));

    // Same position, same row count — the conversation does not reflow, and the
    // reader is told something was removed instead of silently losing it.
    expect(rowIds()).toEqual(['message-bubble-m2', 'message-tombstone-m1']);
    expect(screen.queryByTestId('message-bubble-m1')).toBeNull();
    expect(screen.queryByText('Has anyone started the essay?')).toBeNull();
    screen.getByText('This message was deleted');
  });
});

// ---------------------------------------------------------------------------
// 5. Unread
// ---------------------------------------------------------------------------

describe('unread bookkeeping', () => {
  it('writes edutu:discussions:lastRead on view, so the browse screen can clear the dot', async () => {
    const message = makeMessage({ createdAt: '2026-08-01T09:00:00.000Z' });
    mockFetchMessages.mockResolvedValue([message]);

    const screen = render(<GroupChatScreen />);
    await waitFor(() => screen.getByTestId('message-bubble-m1'));

    await waitFor(async () => {
      const raw = await AsyncStorage.getItem(LAST_READ_KEY);
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw as string).g1).toBe(message.createdAt);
    });
  });

  it('preserves other groups\' marks rather than overwriting the whole map', async () => {
    await AsyncStorage.setItem(
      LAST_READ_KEY,
      JSON.stringify({ 'other-group': '2026-07-01T00:00:00.000Z' }),
    );
    mockFetchMessages.mockResolvedValue([makeMessage()]);

    const screen = render(<GroupChatScreen />);
    await waitFor(() => screen.getByTestId('message-bubble-m1'));

    await waitFor(async () => {
      const parsed = JSON.parse((await AsyncStorage.getItem(LAST_READ_KEY)) as string);
      expect(parsed['other-group']).toBe('2026-07-01T00:00:00.000Z');
      expect(parsed.g1).toBe('2026-08-01T09:00:00.000Z');
    });
  });

  it('does not mark a group read for someone who cannot read it', async () => {
    wireDetail('pending');
    const screen = render(<GroupChatScreen />);
    await waitFor(() => screen.getByTestId('chat-gate'));
    expect(await AsyncStorage.getItem(LAST_READ_KEY)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6. The hook: keyset paging and the merge
// ---------------------------------------------------------------------------

describe('useGroupMessages', () => {
  function page(count: number, startIndex = 0): CommunityMessage[] {
    return Array.from({ length: count }, (_, offset) => {
      const index = startIndex + offset;
      return makeMessage({
        id: `p${index}`,
        // Descending: index 0 is the newest.
        createdAt: new Date(Date.UTC(2026, 7, 1, 12, 0, 0) - index * 60000).toISOString(),
      });
    });
  }

  it('forwards beforeId alongside before when paging — the (created_at, id) tiebreak', async () => {
    const first = page(MESSAGE_PAGE_SIZE);
    mockFetchMessages.mockResolvedValueOnce(first).mockResolvedValueOnce([]);

    const { result } = renderHook(() =>
      useGroupMessages({ groupId: 'g1', getAuthToken: mockGetToken }),
    );

    await waitFor(() => expect(result.current.messages.length).toBe(MESSAGE_PAGE_SIZE));

    await act(async () => {
      await result.current.loadOlder();
    });

    expect(mockFetchMessages).toHaveBeenCalledTimes(2);
    const [, options] = mockFetchMessages.mock.calls[1];
    const oldest = first[first.length - 1];
    expect(options).toEqual({
      before: oldest.createdAt,
      beforeId: oldest.id,
      limit: MESSAGE_PAGE_SIZE,
    });
    // The boundary id is not optional: without it the server skips every row
    // sharing the boundary instant.
    expect(options.beforeId).toBeTruthy();
  });

  it('does not page past the end', async () => {
    mockFetchMessages.mockResolvedValue([makeMessage()]);

    const { result } = renderHook(() =>
      useGroupMessages({ groupId: 'g1', getAuthToken: mockGetToken }),
    );

    await waitFor(() => expect(result.current.messages.length).toBe(1));
    expect(result.current.hasMore).toBe(false);

    await act(async () => {
      await result.current.loadOlder();
    });
    expect(mockFetchMessages).toHaveBeenCalledTimes(1);
  });

  it('merges REST pages and Realtime rows by id, newest first, tombstones kept', () => {
    const a = makeMessage({ id: 'a', createdAt: '2026-08-01T09:00:00.000Z' });
    const b = makeMessage({ id: 'b', createdAt: '2026-08-01T10:00:00.000Z' });

    // Upsert, not append: the same row arriving twice stays one row.
    const merged = mergeMessages(mergeMessages([], [a, b]), [a]);
    expect(merged.map((m) => m.id)).toEqual(['b', 'a']);

    // An UPDATE replaces in place and the tombstone survives the merge.
    const deleted = mergeMessages(merged, [
      { ...a, body: '', deletedAt: '2026-08-01T11:00:00.000Z' },
    ]);
    expect(deleted.map((m) => m.id)).toEqual(['b', 'a']);
    expect(deleted[1].deletedAt).toBe('2026-08-01T11:00:00.000Z');
    expect(deleted[1].body).toBe('');
  });

  it('breaks a tie on id when two rows share an exact created_at', () => {
    const at = '2026-08-01T09:00:00.000Z';
    const one = makeMessage({ id: 'aaa', createdAt: at });
    const two = makeMessage({ id: 'bbb', createdAt: at });

    // Same instant, both orders in — one deterministic result.
    expect(mergeMessages([], [one, two]).map((m) => m.id)).toEqual(['bbb', 'aaa']);
    expect(mergeMessages([], [two, one]).map((m) => m.id)).toEqual(['bbb', 'aaa']);
  });
});
