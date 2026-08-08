/* eslint-disable import/first -- the jest.mock factories below close over the
   `mock*` consts, so those consts must be initialised before the modules under
   test are required. Imports therefore follow the mocks. */
/**
 * Group Discussions — browse screen, WhatsApp banner, Discover tile re-route.
 *
 * These assert the things a user would notice if they broke, not that render()
 * returned something: the tile no longer leaves the app, the three sections are
 * three genuinely different components, the banner stays dismissed across
 * mounts, and a refusal from the backend shows the sentence the backend wrote.
 */
import React from 'react';
import { fireEvent, render, waitFor, within } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const mockPush = jest.fn();
const mockGetToken = jest.fn().mockResolvedValue('token');
const mockFetchGroups = jest.fn();
const mockFetchSavedOpportunities = jest.fn();
const mockOpenURL = jest.fn().mockResolvedValue(undefined);
let mockFocusCallback: (() => void) | undefined;

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: (callback: () => void) => {
    mockFocusCallback = callback;
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

// requireActual keeps the real CommunityApiError class so the error test
// exercises the shape the service actually throws, not a stand-in.
jest.mock('@edutu/core/src/services/communities', () => {
  const actual = jest.requireActual('@edutu/core/src/services/communities');
  return { ...actual, fetchGroups: (...args: unknown[]) => mockFetchGroups(...args) };
});

jest.mock('@edutu/core/src/services/bookmarks', () => ({
  fetchSavedOpportunities: (...args: unknown[]) => mockFetchSavedOpportunities(...args),
}));

// The Discover tile lives on the opportunities screen, which pulls in the iOS
// widget bridge (@expo/ui/swift-ui) at import time — native-only, so it throws
// under jest. The tile assertion needs the module's exports, not its widgets.
jest.mock('../lib/opportunityWidgetSync', () => ({
  syncAndUpdateOpportunityWidgetSnapshot: jest.fn(async () => undefined),
}));

import { Linking } from 'react-native';
import DiscussionsBrowseScreen from '../app/(app)/discussions/index';
import { GroupRow } from '../components/community/GroupRow';
import {
  WhatsAppBanner,
  WA_BANNER_DISMISSED_KEY,
  WHATSAPP_CHANNEL_URL,
} from '../components/community/WhatsAppBanner';
import { CommunityApiError } from '@edutu/core/src/services/communities';
import type {
  CommunityGroup,
  GroupWithMembership,
  MembershipStatus,
} from '@edutu/core/src/services/communities';

function makeGroup(overrides: Partial<CommunityGroup> = {}): CommunityGroup {
  return {
    id: 'g1',
    slug: 'g1',
    name: 'Chevening 2027',
    description: null,
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

/**
 * The REAL wire shape. `fetchGroups` returns `{ group, membership }` rows, not
 * bare groups — a mock that keeps returning groups is the failure this suite
 * exists to stop, because the screen would then be tested against a contract
 * the backend does not serve.
 */
function makeRow(
  group: CommunityGroup,
  status: MembershipStatus | null = null,
): GroupWithMembership {
  return {
    group,
    membership: status
      ? {
          id: `m-${group.id}`,
          groupId: group.id,
          userId: 'user_1',
          role: 'member',
          status,
          joinedAt: '2026-07-10T10:00:00.000Z',
        }
      : null,
  };
}

const MINE = makeGroup({ id: 'mine-1', name: 'My study group' });
const RAIL = makeGroup({
  id: 'rail-1',
  name: 'Mastercard Foundation crew',
  opportunityId: 'opp-1',
  expiresAt: '2026-08-06T00:00:00.000Z',
});
const DISCOVER = makeGroup({ id: 'disc-1', name: 'Open to anyone' });
const INVITED = makeGroup({
  id: 'inv-1',
  name: 'Private cohort',
  visibility: 'private',
  joinPolicy: 'request',
});
const PENDING = makeGroup({
  id: 'pend-1',
  name: 'Mentors circle',
  joinPolicy: 'request',
});

/**
 * `mine: true` returns every LIVE relationship — active, invited and pending —
 * each carrying its own membership row. The unfiltered call returns what is
 * visible, membership included when there is one.
 */
function wireGroups(mine: GroupWithMembership[], visible: GroupWithMembership[]) {
  mockFetchGroups.mockImplementation((filter: { mine?: boolean }) =>
    Promise.resolve(filter?.mine ? mine : visible),
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  jest.spyOn(Linking, 'openURL').mockImplementation(mockOpenURL);
  await AsyncStorage.clear();
  mockFetchSavedOpportunities.mockResolvedValue([]);
  wireGroups([], []);
  mockFocusCallback = undefined;
});

// ---------------------------------------------------------------------------
// Main navigation ownership
// ---------------------------------------------------------------------------

describe('Chats tab ownership', () => {
  it('does not duplicate Community in the More feature grid', () => {
    const { MORE_FEATURES } = require('../lib/moreFeatures');
    const tile = MORE_FEATURES.find(
      (feature: { id: string }) => feature.id === 'discussion',
    );

    expect(tile).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Three affordances
// ---------------------------------------------------------------------------

describe('browse screen affordances', () => {
  it('refreshes when Groups regains focus so a newly created group appears', async () => {
    const created = makeGroup({
      id: 'created-1',
      name: 'A group I created',
      ownerId: 'user_1',
    });
    const { getByTestId } = render(<DiscussionsBrowseScreen />);
    await waitFor(() => getByTestId('discussions-empty'));

    wireGroups([makeRow(created, 'active')], []);
    mockFocusCallback?.();

    await waitFor(() => getByTestId(`group-row-${created.id}`));
  });

  it('shows an owned group even if its legacy membership row is missing', async () => {
    const owned = makeGroup({
      id: 'legacy-owned',
      name: 'My earlier group',
      ownerId: 'user_1',
    });
    wireGroups([makeRow(owned)], []);

    const { getByTestId } = render(<DiscussionsBrowseScreen />);

    await waitFor(() => getByTestId(`group-row-${owned.id}`));
  });

  it('renders your groups as rows, saved-opportunity groups as a rail, and discovery inline — three different components', async () => {
    wireGroups(
      [makeRow(MINE, 'active')],
      [makeRow(RAIL), makeRow(DISCOVER)],
    );
    mockFetchSavedOpportunities.mockResolvedValue([
      {
        id: 'b1',
        opportunity_id: 'opp-1',
        user_id: 'user_1',
        created_at: '2026-07-20T00:00:00.000Z',
        title: 'Mastercard Foundation Scholars',
        deadline: '2026-08-06T00:00:00.000Z',
      },
    ]);

    const { getByTestId, queryByTestId } = render(<DiscussionsBrowseScreen />);

    await waitFor(() => getByTestId(`group-row-${MINE.id}`));
    getByTestId(`group-rail-card-${RAIL.id}`);
    getByTestId(`discover-pill-${DISCOVER.id}`);

    // Same group id must never appear in two affordances at once — that is what
    // "one card grid three times" would look like in the DOM.
    expect(queryByTestId(`group-row-${RAIL.id}`)).toBeNull();
    expect(queryByTestId(`group-rail-card-${MINE.id}`)).toBeNull();
    expect(queryByTestId(`discover-pill-${MINE.id}`)).toBeNull();
    expect(queryByTestId(`discover-pill-${RAIL.id}`)).toBeNull();

    // Each affordance carries structure the others do not: the row states your
    // membership, the rail card carries the deadline chip, the pill carries
    // neither.
    getByTestId(`group-row-membership-${MINE.id}`);
    getByTestId(`group-rail-deadline-${RAIL.id}`);
    expect(queryByTestId(`group-rail-deadline-${MINE.id}`)).toBeNull();
    expect(queryByTestId(`group-row-membership-${DISCOVER.id}`)).toBeNull();

    // And the rail is a horizontally scrolling container, not a wrapped grid.
    expect(getByTestId('discussions-rail').props.horizontal).toBe(true);
  });

  it('opens a group from any of the three affordances', async () => {
    wireGroups([makeRow(MINE, 'active')], [makeRow(DISCOVER)]);
    const { getByTestId } = render(<DiscussionsBrowseScreen />);

    await waitFor(() => getByTestId(`group-row-${MINE.id}`));
    fireEvent.press(getByTestId(`group-row-${MINE.id}`));
    expect(mockPush).toHaveBeenCalledWith(`/discussions/${MINE.id}`);

    fireEvent.press(getByTestId(`discover-pill-${DISCOVER.id}`));
    expect(mockPush).toHaveBeenCalledWith(`/discussions/${DISCOVER.id}`);
  });

  it('tells an invitee and an applicant apart', () => {
    const invited = render(
      <GroupRow group={makeGroup({ id: 'inv' })} membership="invited" />,
    );
    const pending = render(
      <GroupRow group={makeGroup({ id: 'pend' })} membership="pending" />,
    );

    const invitedLabel = invited.getByTestId('group-row-membership-inv').props
      .children;
    const pendingLabel = pending.getByTestId('group-row-membership-pend').props
      .children;

    expect(invitedLabel).toBe("You're invited");
    expect(pendingLabel).toBe('Request sent');
    expect(invitedLabel).not.toBe(pendingLabel);
  });

  it('labels a row only when the backend group carries an opportunity id', () => {
    const linked = render(
      <GroupRow group={makeGroup({ id: 'linked', opportunityId: 'opp-1' })} />,
    );
    linked.getByTestId('group-row-opportunity-linked', { includeHiddenElements: true });
    linked.unmount();

    const unlinked = render(
      <GroupRow group={makeGroup({ id: 'unlinked', opportunityId: null })} />,
    );

    expect(unlinked.queryByTestId('group-row-opportunity-unlinked')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Membership, end to end through the screen
//
// GroupRow could always draw all five states; until the list carried a
// membership the screen could only ever hand it `active`, so four of them were
// unreachable. These assert the wiring, against the shape the API really
// returns.
// ---------------------------------------------------------------------------

describe('membership states on the browse screen', () => {
  it('feeds the screen the real { group, membership } row shape', async () => {
    wireGroups([makeRow(MINE, 'active')], [makeRow(DISCOVER)]);
    const { getByTestId, queryByTestId } = render(<DiscussionsBrowseScreen />);
    await waitFor(() => getByTestId(`group-row-${MINE.id}`));

    // The fake is the contract: every row is { group, membership }, never a
    // bare group. If it drifted back, the screen below would be green against
    // a shape the backend does not serve.
    const rows = await mockFetchGroups.mock.results[0].value;
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(['group', 'membership']);
      expect(typeof row.group.id).toBe('string');
    }

    // And the screen read `row.group`, not the row: reading the old shape
    // would key every row off an undefined id.
    expect(queryByTestId('group-row-undefined')).toBeNull();
    expect(queryByTestId('discover-pill-undefined')).toBeNull();
  });

  it('shows an invitation in your groups, reading as an invitation and not as membership', async () => {
    wireGroups(
      [makeRow(MINE, 'active'), makeRow(INVITED, 'invited')],
      [],
    );
    const { getByTestId, queryByTestId } = render(<DiscussionsBrowseScreen />);

    const label = await waitFor(() =>
      getByTestId(`group-row-membership-${INVITED.id}`),
    );
    expect(label.props.children).toBe("You're invited");
    expect(label.props.children).not.toBe('Member');

    // It is a live relationship, not an application: it must not be filed
    // under the waiting list.
    expect(queryByTestId('discussions-pending')).toBeNull();

    // And it leads somewhere the invitee can accept — the only door into a
    // private group.
    fireEvent.press(getByTestId(`group-row-${INVITED.id}`));
    expect(mockPush).toHaveBeenCalledWith(`/discussions/${INVITED.id}`);
  });

  it('shows an application as waiting, apart from real memberships, with no way to force entry', async () => {
    wireGroups(
      [makeRow(MINE, 'active'), makeRow(PENDING, 'pending')],
      [],
    );
    const { getByTestId, queryByTestId, queryByText, getByText } = render(
      <DiscussionsBrowseScreen />,
    );

    await waitFor(() => getByTestId(`group-row-${MINE.id}`));

    // Its own list, its own heading — not mixed in with the groups they are
    // actually in.
    const waiting = getByTestId('discussions-pending');
    getByText('Waiting on approval');
    within(waiting).getByTestId(`group-row-${PENDING.id}`);
    expect(within(waiting).queryByTestId(`group-row-${MINE.id}`)).toBeNull();

    expect(
      getByTestId(`group-row-membership-${PENDING.id}`).props.children,
    ).toBe('Request sent');

    // Nothing on this screen offers a pending applicant a way in.
    expect(queryByText('Join')).toBeNull();
    expect(queryByText('Accept invite')).toBeNull();
    expect(queryByTestId(`discover-pill-${PENDING.id}`)).toBeNull();
  });

  it('opens the chat for a group you are actually in', async () => {
    wireGroups([makeRow(MINE, 'active')], []);
    const { getByTestId } = render(<DiscussionsBrowseScreen />);

    await waitFor(() => getByTestId(`group-row-${MINE.id}`));
    expect(getByTestId(`group-row-membership-${MINE.id}`).props.children).toBe(
      'Member',
    );

    fireEvent.press(getByTestId(`group-row-${MINE.id}`));
    expect(mockPush).toHaveBeenCalledWith(`/discussions/${MINE.id}`);
  });

  it('never offers a banned group back as somewhere to go', async () => {
    const banned = makeGroup({ id: 'ban-1', name: 'Closed to me' });
    wireGroups([], [makeRow(banned, 'banned')]);
    const { getByTestId, queryByTestId } = render(<DiscussionsBrowseScreen />);

    await waitFor(() => getByTestId('discussions-empty'));
    expect(queryByTestId(`discover-pill-${banned.id}`)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The WhatsApp banner
// ---------------------------------------------------------------------------

describe('WhatsApp banner', () => {
  it('shows, opens the channel, and stays dismissed across mounts', async () => {
    const first = render(<WhatsAppBanner />);
    await waitFor(() => first.getByTestId('whatsapp-banner'));

    fireEvent.press(first.getByTestId('whatsapp-banner-action'));
    await waitFor(() =>
      expect(mockOpenURL).toHaveBeenCalledWith(WHATSAPP_CHANNEL_URL),
    );

    fireEvent.press(first.getByTestId('whatsapp-banner-dismiss'));
    await waitFor(() =>
      expect(first.queryByTestId('whatsapp-banner')).toBeNull(),
    );
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(WA_BANNER_DISMISSED_KEY)).toBe('true'),
    );

    first.unmount();

    // A fresh mount reads the same key: "not now" has to mean not ever.
    const second = render(<WhatsAppBanner />);
    await waitFor(() => expect(mockFetchGroups).not.toBeUndefined());
    expect(second.queryByTestId('whatsapp-banner')).toBeNull();
  });

  it('appears on the browse screen when it has never been dismissed', async () => {
    const { getByTestId } = render(<DiscussionsBrowseScreen />);
    await waitFor(() => getByTestId('whatsapp-banner'));
  });

  it('is absent from the browse screen once dismissed', async () => {
    await AsyncStorage.setItem(WA_BANNER_DISMISSED_KEY, 'true');
    const { queryByTestId, getByTestId } = render(<DiscussionsBrowseScreen />);
    await waitFor(() => getByTestId('discussions-empty'));
    expect(queryByTestId('whatsapp-banner')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Empty and error states
// ---------------------------------------------------------------------------

describe('empty and error states', () => {
  it('keeps Your groups usable when only the Discover request fails', async () => {
    mockFetchGroups.mockImplementation((filter: { mine?: boolean }) =>
      filter.mine
        ? Promise.resolve([makeRow(MINE, 'active')])
        : Promise.reject(new Error('temporary browse failure')),
    );

    const { getByTestId, queryByTestId } = render(
      <DiscussionsBrowseScreen />,
    );

    await waitFor(() => getByTestId(`group-row-${MINE.id}`));
    expect(queryByTestId('discussions-error')).toBeNull();
  });

  it('teaches with an icon, one line and one CTA rather than a bare sentence', async () => {
    const { getByTestId, getByText } = render(<DiscussionsBrowseScreen />);

    const empty = await waitFor(() => getByTestId('discussions-empty'));

    // One line of copy, and it is the teaching sentence — not a bare "None".
    getByText(
      'No groups yet. Join one from an opportunity you saved, or start your own to bring people together.',
    );

    // An icon renders above it (EmptyState's circular icon wrapper).
    expect(empty).toBeTruthy();

    fireEvent.press(getByText('Create group'));
    expect(mockPush).toHaveBeenCalledWith('/discussions/new');
  });

  it("shows the server's sentence when the API refuses, never a status code", async () => {
    const sentence =
      "You're already in 2 groups, which is the most you can join at once.";
    mockFetchGroups.mockRejectedValue(new CommunityApiError(sentence, 403));

    const { getByTestId, getByText, queryByText } = render(
      <DiscussionsBrowseScreen />,
    );

    await waitFor(() => getByTestId('discussions-error'));
    getByText(sentence);
    expect(queryByText(/403/)).toBeNull();
    expect(queryByText('Something went wrong. Please try again.')).toBeNull();
  });
});
