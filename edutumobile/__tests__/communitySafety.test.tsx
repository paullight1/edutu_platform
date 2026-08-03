/* eslint-disable import/first -- the jest.mock factories below close over the
   `mock*` consts, so those consts must be initialised before the modules under
   test are required. Imports therefore follow the mocks. */
/**
 * Group Discussions — the owner/mod join queue and the UGC safety kit.
 *
 * WHAT THESE TESTS REFUSE TO DO is assert the shape of a mock. Every group
 * below drives a fake server that holds real state — a membership table the
 * queue mutates, a notification log the report writes to — so a screen that
 * called the right function with the wrong argument, or called it and then
 * failed to act on the result, fails here.
 *
 * The behaviours under test are the ones that decide whether this feature can
 * ship at all:
 *   · an owner OR a mod can read the queue, and each row carries the
 *     applicant's answers — an approve/reject with the answers hidden is a coin
 *     flip, and a mod who cannot work the one queue that exists is cosmetic.
 *   · a report hides the message from the reporter AT ONCE and notifies the
 *     group's owner, because there is no admin console behind it in this
 *     release and those two effects are the entire product of the button.
 *   · a block hides that person's whole transcript.
 *   · the no-tolerance notice is shown once and never again.
 *   · nothing destructive fires on one tap.
 */
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const mockGetToken = jest.fn().mockResolvedValue('token');
const mockFetchGroup = jest.fn();
const mockFetchGroupForm = jest.fn();
const mockFetchJoinRequests = jest.fn();
const mockDecideJoinRequest = jest.fn();
const mockFetchMessages = jest.fn();
const mockReportTarget = jest.fn();
const mockDeleteMessage = jest.fn();
const mockRemoveMember = jest.fn();
const mockSubscribe = jest.fn();
const mockUnsubscribe = jest.fn();
const mockPush = jest.fn();

const mockBlockUser = jest.fn();

let mockRouteParams: Record<string, string> = { id: 'g1' };

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => mockRouteParams,
  useFocusEffect: (callback: () => (() => void) | void) => {
    const ReactModule = require('react');
    ReactModule.useEffect(() => callback(), [callback]);
  },
}));

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

jest.mock('@edutu/core/src/services/communities', () => {
  const actual = jest.requireActual('@edutu/core/src/services/communities');
  const mocked = {
    ...actual,
    fetchGroup: (...args: unknown[]) => mockFetchGroup(...args),
    fetchGroupForm: (...args: unknown[]) => mockFetchGroupForm(...args),
    fetchJoinRequests: (...args: unknown[]) => mockFetchJoinRequests(...args),
    decideJoinRequest: (...args: unknown[]) => mockDecideJoinRequest(...args),
    fetchMessages: (...args: unknown[]) => mockFetchMessages(...args),
    reportTarget: (...args: unknown[]) => mockReportTarget(...args),
    deleteMessage: (...args: unknown[]) => mockDeleteMessage(...args),
    removeMember: (...args: unknown[]) => mockRemoveMember(...args),
    blockUser: (...args: unknown[]) => mockBlockUser(...args),
    sendMessage: jest.fn(),
    joinGroup: jest.fn(),
  };
  return mocked;
});

jest.mock('@edutu/core/src/services/communityRealtime', () => ({
  subscribeToGroupMessages: (...args: unknown[]) => mockSubscribe(...args),
}));

import JoinRequestsScreen from '../app/(app)/discussions/[id]/requests';
import GroupChatScreen from '../app/(app)/discussions/[id]';
import { MessageBubble } from '../components/community/MessageBubble';
import {
  FIRST_POST_NOTICE_KEY,
  FirstPostNotice,
} from '../components/community/FirstPostNotice';
import en from '../lib/i18n/locales/en/community.json';
import type {
  CommunityGroup,
  CommunityGroupMember,
  CommunityMessage,
  GroupQuestion,
  JoinRequest,
  MemberRole,
} from '@edutu/core/src/services/communities';

// ---------------------------------------------------------------------------
// A fake server with state, so "it called the endpoint" is never the assertion
// ---------------------------------------------------------------------------

/** The membership table. The queue's job is to move rows in it to `active`. */
let members: Record<string, { status: string; role: MemberRole }>;
/** Everything the backend pushed to a group owner. */
let ownerNotifications: { ownerId: string; targetType: string; targetId: string }[];
/** The server-side `user_blocks` rows written by this caller. */
let serverBlocks: string[];

const GROUP_OWNER = 'user_9';

function makeGroup(overrides: Partial<CommunityGroup> = {}): CommunityGroup {
  return {
    id: 'g1',
    slug: 'g1',
    name: 'Chevening 2027',
    description: 'Applicants helping each other',
    opportunityId: null,
    ownerId: GROUP_OWNER,
    visibility: 'public',
    joinPolicy: 'request',
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

function makeMembership(role: MemberRole): CommunityGroupMember {
  return {
    id: 'mem-1',
    groupId: 'g1',
    userId: 'user_1',
    role,
    status: 'active',
    joinedAt: '2026-07-10T10:00:00.000Z',
  };
}

function makeMessage(overrides: Partial<CommunityMessage> = {}): CommunityMessage {
  return {
    id: 'm1',
    groupId: 'g1',
    userId: 'user_7',
    body: 'Has anyone started the essay?',
    kind: 'text',
    opportunityId: null,
    createdAt: '2026-08-01T09:00:00.000Z',
    deletedAt: null,
    deletedBy: null,
    ...overrides,
  };
}

const QUESTIONS: GroupQuestion[] = [
  { id: 'q1', type: 'short_text', label: 'Which scholarship are you applying to?', required: true },
  {
    id: 'q2',
    type: 'single_select',
    label: 'How far along are you?',
    required: true,
    options: ['Just starting', 'Drafting', 'Submitted'],
  },
  { id: 'q3', type: 'long_text', label: 'What do you want from the group?', required: false },
];

function makeRequest(overrides: Partial<JoinRequest> = {}): JoinRequest {
  return {
    id: 'req-1',
    groupId: 'g1',
    userId: 'user_77777777',
    answers: [
      { id: 'q1', value: 'Chevening 2027' },
      { id: 'q2', value: 'Drafting' },
    ],
    status: 'pending',
    decidedBy: null,
    decidedAt: null,
    createdAt: '2026-08-01T08:00:00.000Z',
    ...overrides,
  };
}

/** Wire the queue for one caller role. */
function wireQueue(role: MemberRole, requests: JoinRequest[] = [makeRequest()]) {
  mockFetchGroup.mockResolvedValue({ group: makeGroup(), membership: makeMembership(role) });
  mockFetchGroupForm.mockResolvedValue({ questions: QUESTIONS });
  mockFetchJoinRequests.mockResolvedValue(requests);
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockRouteParams = { id: 'g1' };
  serverBlocks = [];
  members = {
    user_77777777: { status: 'pending', role: 'member' },
    user_7: { status: 'active', role: 'member' },
  };
  ownerNotifications = [];
  mockSubscribe.mockReturnValue(mockUnsubscribe);
  mockFetchMessages.mockResolvedValue([]);
  mockFetchGroupForm.mockResolvedValue({ questions: [] });

  // The real decision endpoint: it flips the applicant's membership row.
  mockDecideJoinRequest.mockImplementation(
    async (_groupId: string, requestId: string, decision: 'approved' | 'rejected') => {
      const request = makeRequest({ id: requestId });
      if (decision === 'approved') members[request.userId] = { status: 'active', role: 'member' };
      else members[request.userId] = { status: 'pending', role: 'member' };
      return { ...request, status: decision, decidedBy: 'user_1', decidedAt: 'now' };
    },
  );

  // The real report endpoint: it notifies the group's OWNER (moderation.service
  // notifyOwner) and never names the reporter.
  mockReportTarget.mockImplementation(
    async (input: { targetType: string; targetId: string; reason: string }) => {
      ownerNotifications.push({
        ownerId: GROUP_OWNER,
        targetType: input.targetType,
        targetId: input.targetId,
      });
      return {
        id: 'rep-1',
        targetType: input.targetType,
        targetId: input.targetId,
        reporterId: 'user_1',
        reason: input.reason,
        status: 'open',
        createdAt: 'now',
      };
    },
  );

  mockDeleteMessage.mockImplementation(async (messageId: string) =>
    makeMessage({ id: messageId, body: '', deletedAt: 'now', deletedBy: 'user_1' }),
  );
  // The real block endpoint: it writes the shared `user_blocks` table.
  mockBlockUser.mockImplementation(async (userId: string) => {
    serverBlocks.push(userId);
    return { success: true, blockedUserId: userId };
  });
  mockRemoveMember.mockImplementation(async (_groupId: string, userId: string) => {
    delete members[userId];
    return { success: true };
  });
});

// ---------------------------------------------------------------------------
// 1. The queue
// ---------------------------------------------------------------------------

describe('join request queue', () => {
  it("shows each requester's answers to the group's custom questions", async () => {
    wireQueue('owner', [
      makeRequest({
        answers: [
          { id: 'q1', value: 'Chevening 2027' },
          { id: 'q2', value: 'Drafting' },
        ],
      }),
    ]);

    const screen = render(<JoinRequestsScreen />);
    await waitFor(() => expect(screen.getByTestId('requests-list')).toBeTruthy());

    // The question, and the answer THIS applicant gave to it — not a count, not
    // a uuid, not a generic "answered".
    expect(screen.getByTestId('request-question-req-1-q1').props.children).toBe(
      'Which scholarship are you applying to?',
    );
    expect(screen.getByTestId('request-answer-req-1-q1').props.children).toBe('Chevening 2027');
    expect(screen.getByTestId('request-question-req-1-q2').props.children).toBe(
      'How far along are you?',
    );
    expect(screen.getByTestId('request-answer-req-1-q2').props.children).toBe('Drafting');

    // A question they skipped still appears, marked as skipped: an unanswered
    // required question is the single most useful thing on this screen.
    expect(screen.getByTestId('request-question-req-1-q3').props.children).toBe(
      'What do you want from the group?',
    );
    expect(screen.getByTestId('request-answer-req-1-q3').props.children).toBe(
      en.requests.noAnswer,
    );
  });

  it('approving admits the member and removes the row', async () => {
    wireQueue('owner');
    const screen = render(<JoinRequestsScreen />);
    await waitFor(() => expect(screen.getByTestId('request-row-req-1')).toBeTruthy());

    expect(members.user_77777777.status).toBe('pending');

    await act(async () => {
      fireEvent.press(screen.getByTestId('request-approve-req-1'));
    });

    // Admitted: the membership row the applicant was waiting on is now active.
    await waitFor(() => expect(members.user_77777777.status).toBe('active'));
    expect(mockDecideJoinRequest).toHaveBeenCalledWith('g1', 'req-1', 'approved', mockGetToken);
    // …and the queue no longer offers the same decision twice.
    await waitFor(() => expect(screen.queryByTestId('request-row-req-1')).toBeNull());
  });

  it('lets a MOD, not only the owner, open and action the queue', async () => {
    wireQueue('mod');
    const screen = render(<JoinRequestsScreen />);

    await waitFor(() => expect(screen.getByTestId('request-row-req-1')).toBeTruthy());
    expect(mockFetchJoinRequests).toHaveBeenCalledWith('g1', mockGetToken);

    await act(async () => {
      fireEvent.press(screen.getByTestId('request-approve-req-1'));
    });

    await waitFor(() => expect(members.user_77777777.status).toBe('active'));
  });

  it('refuses a plain member and never reads the queue for them', async () => {
    wireQueue('member');
    const screen = render(<JoinRequestsScreen />);

    await waitFor(() => expect(screen.getByTestId('requests-forbidden')).toBeTruthy());
    expect(mockFetchJoinRequests).not.toHaveBeenCalled();
  });

  it('confirms a decline before firing it, and does not call it a ban', async () => {
    wireQueue('owner');
    const screen = render(<JoinRequestsScreen />);
    await waitFor(() => expect(screen.getByTestId('request-row-req-1')).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByTestId('request-decline-req-1'));
    });

    // One tap decided nothing.
    expect(mockDecideJoinRequest).not.toHaveBeenCalled();
    expect(screen.getByTestId('request-decline-confirm-req-1')).toBeTruthy();
    // The copy has to leave the door open, because the backend upserts and the
    // applicant really can ask again.
    expect(en.requests.declineConfirmBody).toMatch(/again/i);

    await act(async () => {
      fireEvent.press(screen.getByTestId('request-decline-confirm-accept-req-1'));
    });

    await waitFor(() =>
      expect(mockDecideJoinRequest).toHaveBeenCalledWith('g1', 'req-1', 'rejected', mockGetToken),
    );
    // Declined is not admitted.
    expect(members.user_77777777.status).toBe('pending');
    await waitFor(() => expect(screen.queryByTestId('request-row-req-1')).toBeNull());
  });

  it('teaches, rather than blanks, when there is nothing to review', async () => {
    wireQueue('owner', []);
    const screen = render(<JoinRequestsScreen />);

    await waitFor(() => expect(screen.getByTestId('requests-empty')).toBeTruthy());
    expect(screen.getByText(en.empty.noPendingRequests)).toBeTruthy();

    fireEvent.press(screen.getByTestId('requests-empty-cta'));
    expect(mockPush).toHaveBeenCalledWith('/discussions/g1');
  });

  it('shows the server sentence when the queue cannot be read', async () => {
    const { CommunityApiError } = jest.requireActual('@edutu/core/src/services/communities');
    mockFetchGroup.mockRejectedValue(
      new CommunityApiError('This group is private. Ask an owner for an invite.', 403),
    );

    const screen = render(<JoinRequestsScreen />);
    await waitFor(() => expect(screen.getByTestId('requests-error')).toBeTruthy());
    expect(
      screen.getByText('This group is private. Ask an owner for an invite.'),
    ).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 2. Reporting
// ---------------------------------------------------------------------------

/** Open the long-press menu on a foreign message and return the screen. */
function renderForeignBubble(props: Partial<React.ComponentProps<typeof MessageBubble>> = {}) {
  const message = makeMessage();
  const screen = render(<MessageBubble message={message} own={false} {...props} />);
  fireEvent(screen.getByTestId('message-bubble-m1'), 'longPress');
  return screen;
}

describe('reporting', () => {
  it('hides the reported message from the reporter immediately', async () => {
    const screen = renderForeignBubble();

    // Present before the report.
    expect(screen.queryByText('Has anyone started the essay?')).toBeTruthy();

    fireEvent.press(screen.getByTestId('message-report-m1'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('message-confirm-accept-m1'));
    });

    // Gone — this local disappearance IS the product of the button, because
    // nobody at Edutu reviews the queue in this release.
    await waitFor(() => expect(screen.queryByText('Has anyone started the essay?')).toBeNull());
    expect(screen.getByTestId('message-reported-m1')).toBeTruthy();
    expect(screen.queryByTestId('message-bubble-m1')).toBeNull();
  });

  it('notifies the group owner about the reported message', async () => {
    const screen = renderForeignBubble();

    fireEvent.press(screen.getByTestId('message-report-m1'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('message-confirm-accept-m1'));
    });

    // The backend resolves the group from the target and pushes to its owner
    // (moderation.service `notifyOwner`), so the client's whole contribution is
    // filing the right target — and it did.
    await waitFor(() => expect(ownerNotifications).toHaveLength(1));
    expect(ownerNotifications[0]).toEqual({
      ownerId: GROUP_OWNER,
      targetType: 'message',
      targetId: 'm1',
    });
    expect(mockReportTarget).toHaveBeenCalledWith(
      { targetType: 'message', targetId: 'm1', reason: 'member_report' },
      mockGetToken,
    );
  });

  it('confirms a report first, and promises the owner rather than an Edutu review', () => {
    const screen = renderForeignBubble();

    fireEvent.press(screen.getByTestId('message-report-m1'));
    expect(mockReportTarget).not.toHaveBeenCalled();

    expect(screen.getByText(en.moderation.reportConfirmTitle)).toBeTruthy();
    expect(screen.getByText(en.moderation.reportConfirmBody)).toBeTruthy();
    // Says what actually happens: hidden here, owner told, nobody reviews it.
    expect(en.moderation.reportConfirmBody).toMatch(/owner/i);
    expect(en.moderation.reportConfirmBody).not.toMatch(/we('| wi)ll review|Edutu will review/i);
  });

  it('reports the whole group from the transcript', async () => {
    const screen = renderForeignBubble();

    fireEvent.press(screen.getByTestId('message-report-group-m1'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('message-confirm-accept-m1'));
    });

    await waitFor(() =>
      expect(mockReportTarget).toHaveBeenCalledWith(
        { targetType: 'group', targetId: 'g1', reason: 'member_report' },
        mockGetToken,
      ),
    );
    expect(ownerNotifications[0].targetType).toBe('group');
  });

  it('keeps the message and shows the server sentence when the report fails', async () => {
    const { CommunityApiError } = jest.requireActual('@edutu/core/src/services/communities');
    mockReportTarget.mockRejectedValue(new CommunityApiError("That message was not found.", 404));

    const screen = renderForeignBubble();
    fireEvent.press(screen.getByTestId('message-report-m1'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('message-confirm-accept-m1'));
    });

    await waitFor(() => expect(screen.getByTestId('message-action-error-m1')).toBeTruthy());
    expect(screen.getByText('That message was not found.')).toBeTruthy();
    // A failed report must NOT hide the message: that would be a silent lie.
    expect(screen.queryByText('Has anyone started the essay?')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 3. Blocking
// ---------------------------------------------------------------------------

describe('blocking', () => {
  it("hides every message from the blocked user in the reader's transcript", async () => {
    mockFetchGroup.mockResolvedValue({
      group: makeGroup({ joinPolicy: 'open' }),
      membership: makeMembership('member'),
    });
    mockFetchMessages.mockResolvedValue([
      makeMessage({ id: 'm1', userId: 'user_7', body: 'First from the noisy one' }),
      makeMessage({ id: 'm2', userId: 'user_7', body: 'Second from the noisy one' }),
      makeMessage({ id: 'm3', userId: 'user_5', body: 'Message from somebody else' }),
    ]);

    const screen = render(<GroupChatScreen />);
    await waitFor(() => expect(screen.getByTestId('chat-list')).toBeTruthy());
    expect(screen.getByText('Second from the noisy one')).toBeTruthy();

    fireEvent(screen.getByTestId('message-bubble-m1'), 'longPress');
    fireEvent.press(screen.getByTestId('message-block-m1'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('message-confirm-accept-m1'));
    });

    // Both of theirs go, including the one the reader never touched…
    await waitFor(() => expect(screen.queryByText('First from the noisy one')).toBeNull());
    expect(screen.queryByText('Second from the noisy one')).toBeNull();
    // …and nobody else's transcript is disturbed.
    expect(screen.getByText('Message from somebody else')).toBeTruthy();
  });

  it('writes the block to the SERVER, not just to this phone', async () => {
    const onBlock = jest.fn();

    const screen = renderForeignBubble({ onBlock });
    fireEvent.press(screen.getByTestId('message-block-m1'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('message-confirm-accept-m1'));
    });

    // `user_blocks`, so it survives a reinstall and reaches the other device —
    // the AsyncStorage list this replaced did neither.
    await waitFor(() => expect(serverBlocks).toEqual(['user_7']));
    expect(mockBlockUser).toHaveBeenCalledWith('user_7', mockGetToken);
    // …and the local mute still runs, so the transcript updates this frame.
    expect(onBlock).toHaveBeenCalledTimes(1);
  });

  it('does not mute locally when the server refuses the block', async () => {
    const { CommunityApiError } = jest.requireActual('@edutu/core/src/services/communities');
    mockBlockUser.mockRejectedValue(new CommunityApiError("You can't block yourself.", 400));
    const onBlock = jest.fn();

    const screen = renderForeignBubble({ onBlock });
    fireEvent.press(screen.getByTestId('message-block-m1'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('message-confirm-accept-m1'));
    });

    // A local mute over a failed server write is a block that silently
    // evaporates on the next device.
    await waitFor(() => expect(screen.getByTestId('message-action-error-m1')).toBeTruthy());
    expect(screen.getByText("You can't block yourself.")).toBeTruthy();
    expect(onBlock).not.toHaveBeenCalled();
  });

  it('confirms before blocking and says the block cannot be undone in the app', () => {
    const onBlock = jest.fn();
    const screen = renderForeignBubble({ onBlock });

    fireEvent.press(screen.getByTestId('message-block-m1'));
    expect(onBlock).not.toHaveBeenCalled();
    expect(screen.getByText(en.moderation.blockConfirmTitle)).toBeTruthy();
    expect(screen.getByText(en.moderation.blockConfirmBody)).toBeTruthy();
    expect(en.moderation.blockConfirmBody).toMatch(/undo/i);

    // Cancelling is a real way out, not decoration.
    fireEvent.press(screen.getByTestId('message-confirm-cancel-m1'));
    expect(screen.queryByTestId('message-confirm-m1')).toBeNull();
    expect(onBlock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 4. Owner / mod tools on a message
// ---------------------------------------------------------------------------

describe('owner and mod tools', () => {
  it('confirms, then deletes a message, warning that the text does not come back', async () => {
    const onDelete = jest.fn();
    const screen = renderForeignBubble({ canDelete: true, onDelete });

    fireEvent.press(screen.getByTestId('message-delete-m1'));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText(en.moderation.deleteConfirmTitle)).toBeTruthy();
    expect(en.moderation.deleteConfirmBody).toMatch(/permanent/i);

    await act(async () => {
      fireEvent.press(screen.getByTestId('message-confirm-accept-m1'));
    });
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
  });

  it('leaves a tombstone rather than a hole when a message is deleted', async () => {
    mockFetchGroup.mockResolvedValue({
      group: makeGroup(),
      membership: { ...makeMembership('owner') },
    });
    mockFetchMessages.mockResolvedValue([
      makeMessage({ id: 'm1', userId: 'user_7', body: 'Send me your bank details' }),
    ]);

    const screen = render(<GroupChatScreen />);
    await waitFor(() => expect(screen.getByTestId('message-bubble-m1')).toBeTruthy());

    fireEvent(screen.getByTestId('message-bubble-m1'), 'longPress');
    fireEvent.press(screen.getByTestId('message-delete-m1'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('message-confirm-accept-m1'));
    });

    // The row survives with its text blanked, so every reader learns something
    // was removed instead of watching the conversation silently reflow.
    await waitFor(() => expect(screen.getByTestId('message-tombstone-m1')).toBeTruthy());
    expect(screen.queryByText('Send me your bank details')).toBeNull();
  });

  it('offers remove-from-group only to a moderator, and confirms it', async () => {
    // A plain member never sees it: they cannot delete somebody else's message.
    const asMember = renderForeignBubble();
    expect(asMember.queryByTestId('message-remove-member-m1')).toBeNull();

    const screen = renderForeignBubble({ canDelete: true });
    fireEvent.press(screen.getByTestId('message-remove-member-m1'));
    expect(mockRemoveMember).not.toHaveBeenCalled();
    expect(screen.getByText(en.moderation.removeConfirmTitle)).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('message-confirm-accept-m1'));
    });

    await waitFor(() =>
      expect(mockRemoveMember).toHaveBeenCalledWith('g1', 'user_7', mockGetToken),
    );
    expect(members.user_7).toBeUndefined();
  });

  it('never offers report, block or remove on your own message', () => {
    const screen = render(
      <MessageBubble message={makeMessage({ userId: 'user_1' })} own canDelete />,
    );
    fireEvent(screen.getByTestId('message-bubble-m1'), 'longPress');

    expect(screen.queryByTestId('message-report-m1')).toBeNull();
    expect(screen.queryByTestId('message-block-m1')).toBeNull();
    expect(screen.queryByTestId('message-remove-member-m1')).toBeNull();
    // Deleting your own is still yours to do.
    expect(screen.getByTestId('message-delete-m1')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 5. The first-post notice
// ---------------------------------------------------------------------------

describe('first-post notice', () => {
  it('shows the house rules once and never again after acknowledgement', async () => {
    const first = render(<FirstPostNotice />);
    await waitFor(() => expect(first.getByTestId('first-post-notice')).toBeTruthy());
    expect(first.getByText(en.moderation.noToleranceBody)).toBeTruthy();

    await act(async () => {
      fireEvent.press(first.getByTestId('first-post-notice-acknowledge'));
    });

    // Gone now…
    await waitFor(() => expect(first.queryByTestId('first-post-notice')).toBeNull());
    // …and persisted, so it is once EVER and not once per launch.
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(FIRST_POST_NOTICE_KEY)).toBe('true'),
    );

    // A completely fresh mount — the next session — stays quiet.
    const second = render(<FirstPostNotice />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(second.queryByTestId('first-post-notice')).toBeNull();
  });

  it('tells the acknowledging caller, so a composer can carry on', async () => {
    const onAcknowledge = jest.fn();
    const screen = render(<FirstPostNotice onAcknowledge={onAcknowledge} />);
    await waitFor(() => expect(screen.getByTestId('first-post-notice')).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByTestId('first-post-notice-acknowledge'));
    });

    await waitFor(() => expect(onAcknowledge).toHaveBeenCalledTimes(1));
  });
});
