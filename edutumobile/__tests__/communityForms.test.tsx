/* eslint-disable import/first -- the jest.mock factories below close over the
   `mock*` consts, so those consts must be initialised before the modules under
   test are required. Imports therefore follow the mocks. */
/**
 * Group Discussions — create form, group settings, question builder.
 *
 * These assert the rules a user would hit, not that render() returned
 * something: creating a group puts you INSIDE it, the name floor blocks submit
 * before the server has to, an opportunity you arrived from cannot be detached,
 * the 5-question cap explains itself instead of silently doing nothing, a
 * one-option dropdown is refused, both destinations are screens rather than
 * modals, and a refusal shows the sentence the server wrote.
 */
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Modal, Text } from 'react-native';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockGetToken = jest.fn().mockResolvedValue('token');
const mockSubmitCommunityCreationRequest = jest.fn();
const mockUpdateGroup = jest.fn();
const mockArchiveGroup = jest.fn();
const mockFetchGroup = jest.fn();
const mockFetchGroupForm = jest.fn();
const mockSaveGroupForm = jest.fn();
const mockGetCachedOpportunity = jest.fn();
const mockGetCachedOpportunitiesSnapshot = jest.fn();
const mockFetchOpportunities = jest.fn();

/** Route params are per-test, so the mock reads a mutable object. */
let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack, canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: () => undefined,
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

// The façade, not expo-haptics: every tappable in these screens routes through
// it, and the Settings toggle is what makes that worth enforcing.
jest.mock('../lib/haptics', () => ({
  haptics: {
    light: jest.fn(),
    medium: jest.fn(),
    heavy: jest.fn(),
    selection: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
  },
}));

// requireActual keeps the real CommunityApiError so the refusal test exercises
// the shape the service actually throws.
jest.mock('@edutu/core/src/services/communities', () => {
  const actual = jest.requireActual('@edutu/core/src/services/communities');
  return {
    ...actual,
    submitCommunityCreationRequest: (...args: unknown[]) =>
      mockSubmitCommunityCreationRequest(...args),
    updateGroup: (...args: unknown[]) => mockUpdateGroup(...args),
    archiveGroup: (...args: unknown[]) => mockArchiveGroup(...args),
    fetchGroup: (...args: unknown[]) => mockFetchGroup(...args),
    fetchGroupForm: (...args: unknown[]) => mockFetchGroupForm(...args),
    saveGroupForm: (...args: unknown[]) => mockSaveGroupForm(...args),
  };
});
jest.mock('@edutu/core/src/services/opportunities', () => ({
  getCachedOpportunity: (...args: unknown[]) => mockGetCachedOpportunity(...args),
  getCachedOpportunitiesSnapshot: (...args: unknown[]) =>
    mockGetCachedOpportunitiesSnapshot(...args),
  fetchOpportunities: (...args: unknown[]) => mockFetchOpportunities(...args),
}));

import CreateGroupScreen from '../app/(app)/discussions/new';
import GroupSettingsScreen from '../app/(app)/discussions/[id]/settings';
import {
  MAX_QUESTIONS,
  QuestionBuilder,
  draftsAreValid,
  toGroupQuestions,
  type DraftQuestion,
} from '../components/community/QuestionBuilder';
import { CommunityApiError } from '@edutu/core/src/services/communities';
import type { CommunityGroup } from '@edutu/core/src/services/communities';

function makeGroup(overrides: Partial<CommunityGroup> = {}): CommunityGroup {
  return {
    id: 'g1',
    slug: 'g1',
    name: 'Chevening 2027',
    description: 'Applicants helping each other',
    opportunityId: null,
    ownerId: 'user_1',
    visibility: 'public',
    joinPolicy: 'open',
    coverEmoji: '🎓',
    accent: null,
    expiresAt: null,
    archivedAt: null,
    memberCount: 4,
    messageCount: 2,
    lastMessageAt: null,
    createdAt: '2026-07-01T10:00:00.000Z',
    ...overrides,
  };
}

/** Controlled harness — the builder is a controlled component, like its screen. */
function BuilderHarness({ initial = [] as DraftQuestion[] }) {
  const [questions, setQuestions] = React.useState<DraftQuestion[]>(initial);
  return (
    <>
      <QuestionBuilder questions={questions} onChange={setQuestions} />
      <Text testID="harness-count">{String(questions.length)}</Text>
      <Text testID="harness-valid">{draftsAreValid(questions) ? 'valid' : 'invalid'}</Text>
      <Text testID="harness-payload">{JSON.stringify(toGroupQuestions(questions))}</Text>
    </>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockGetCachedOpportunity.mockResolvedValue(null);
  mockGetCachedOpportunitiesSnapshot.mockResolvedValue([]);
  mockFetchOpportunities.mockResolvedValue([]);
  mockSubmitCommunityCreationRequest.mockResolvedValue({
    request: {
      id: 'request-new',
      name: 'Chevening 2027',
      status: 'pending',
    },
    slots: { used: 1, limit: 2 },
  });
  mockUpdateGroup.mockResolvedValue(makeGroup());
  mockArchiveGroup.mockResolvedValue(makeGroup({ archivedAt: '2026-08-03T00:00:00.000Z' }));
  mockFetchGroup.mockResolvedValue({
    group: makeGroup(),
    membership: {
      id: 'm1',
      groupId: 'g1',
      userId: 'user_1',
      role: 'owner',
      status: 'active',
      joinedAt: '2026-07-01T10:00:00.000Z',
    },
  });
  mockFetchGroupForm.mockResolvedValue({ questions: [] });
  mockSaveGroupForm.mockResolvedValue({ questions: [] });
});

// ---------------------------------------------------------------------------
// Creating a group
// ---------------------------------------------------------------------------

describe('create group', () => {
  it('submits the proposal for review and shows the two-slot receipt', async () => {
    const { getByTestId, getByText } = render(<CreateGroupScreen />);

    fireEvent.changeText(getByTestId('create-group-name'), 'Chevening 2027');
    fireEvent.changeText(getByTestId('create-group-description'), 'Applicants helping each other');
    fireEvent.press(getByTestId('create-group-join-request'));
    fireEvent.press(getByTestId('create-group-visibility-private'));
    fireEvent.press(getByTestId('create-group-submit'));

    await waitFor(() =>
      expect(mockSubmitCommunityCreationRequest).toHaveBeenCalledTimes(1),
    );
    expect(mockSubmitCommunityCreationRequest.mock.calls[0][0]).toMatchObject({
      name: 'Chevening 2027',
      description: 'Applicants helping each other',
      // Independent axes: private did not drag the join policy with it.
      visibility: 'private',
      joinPolicy: 'request',
    });

    await waitFor(() => getByTestId('create-group-receipt'));
    getByText('Pending admin review');
    getByText('1 of 2 community slots used');
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('validates the name inline and blocks submit below 3 characters', async () => {
    const { getByTestId, getByText, queryByText } = render(<CreateGroupScreen />);

    // Untouched: no wall of errors before the user has done anything.
    expect(queryByText('Group names need at least 3 characters.')).toBeNull();
    expect(getByTestId('create-group-submit').props.accessibilityState.disabled).toBe(true);

    fireEvent.changeText(getByTestId('create-group-name'), 'ab');
    getByText('Group names need at least 3 characters.');
    expect(getByTestId('create-group-submit').props.accessibilityState.disabled).toBe(true);

    fireEvent.press(getByTestId('create-group-submit'));
    expect(mockSubmitCommunityCreationRequest).not.toHaveBeenCalled();

    // The third character clears it live, without a submit round trip.
    fireEvent.changeText(getByTestId('create-group-name'), 'abc');
    expect(queryByText('Group names need at least 3 characters.')).toBeNull();
    expect(getByTestId('create-group-submit').props.accessibilityState.disabled).toBe(false);

    fireEvent.press(getByTestId('create-group-submit'));
    await waitFor(() => expect(mockSubmitCommunityCreationRequest).toHaveBeenCalledTimes(1));
    expect(mockSubmitCommunityCreationRequest.mock.calls[0][0].name).toBe('abc');
  });

  it('prefills and locks the opportunity when opened from one', async () => {
    mockParams = { opportunityId: 'opp-1' };
    mockGetCachedOpportunity.mockResolvedValue({ id: 'opp-1', title: 'Mastercard Scholars' });

    const { getByTestId, queryByTestId } = render(<CreateGroupScreen />);

    const locked = await waitFor(() => getByTestId('create-group-opportunity-locked'));
    expect(locked.props.accessibilityState.disabled).toBe(true);
    // Prefilled with the real title, and there is no field to type another one.
    expect(getByTestId('create-group-opportunity-title').props.children).toBe(
      'Mastercard Scholars',
    );
    expect(queryByTestId('create-group-opportunity-input')).toBeNull();

    fireEvent.changeText(getByTestId('create-group-name'), 'Mastercard crew');
    fireEvent.press(getByTestId('create-group-submit'));

    await waitFor(() => expect(mockSubmitCommunityCreationRequest).toHaveBeenCalledTimes(1));
    expect(mockSubmitCommunityCreationRequest.mock.calls[0][0].opportunityId).toBe('opp-1');
  });

  it('links only an existing opportunity selected from the real opportunity feed', async () => {
    const opportunity = {
      id: 'opp-chevening',
      title: 'Chevening Scholarship',
      organization: 'UK Government',
    };
    mockGetCachedOpportunitiesSnapshot.mockResolvedValue([opportunity]);
    mockFetchOpportunities.mockResolvedValue([opportunity]);

    const { getByTestId } = render(<CreateGroupScreen />);

    fireEvent.press(getByTestId('create-group-opportunity-toggle'));
    const result = await waitFor(() =>
      getByTestId('create-group-opportunity-opp-chevening'),
    );
    fireEvent.press(result);
    getByTestId('create-group-opportunity-selected');

    fireEvent.changeText(getByTestId('create-group-name'), 'Chevening applicants');
    fireEvent.press(getByTestId('create-group-submit'));

    await waitFor(() => expect(mockSubmitCommunityCreationRequest).toHaveBeenCalledTimes(1));
    expect(mockSubmitCommunityCreationRequest.mock.calls[0][0].opportunityId).toBe(
      'opp-chevening',
    );
  });

  it("shows the server's sentence when the group cap is hit, never a status code", async () => {
    const sentence =
      'You can run 2 active groups at a time. Archive one to start another — archiving is permanent.';
    mockSubmitCommunityCreationRequest.mockRejectedValue(new CommunityApiError(sentence, 409));

    const { getByTestId, getByText, queryByText } = render(<CreateGroupScreen />);

    fireEvent.changeText(getByTestId('create-group-name'), 'Third group');
    fireEvent.press(getByTestId('create-group-submit'));

    await waitFor(() => getByTestId('create-group-error'));
    getByText(sentence);
    expect(queryByText(/403/)).toBeNull();
    expect(queryByText('Something went wrong. Please try again.')).toBeNull();
    // The form stays usable so the user can act on what they were just told.
    expect(getByTestId('create-group-submit').props.accessibilityState.disabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The question builder
// ---------------------------------------------------------------------------

describe('question builder', () => {
  it('refuses a sixth question and says why', () => {
    const { getByTestId } = render(<BuilderHarness />);

    for (let i = 0; i < MAX_QUESTIONS; i += 1) {
      fireEvent.press(getByTestId('question-add'));
    }
    expect(getByTestId('harness-count').props.children).toBe('5');

    // The cap is not a silent no-op: the control is disabled AND says so.
    expect(getByTestId('question-add').props.accessibilityState.disabled).toBe(true);
    expect(getByTestId('question-limit-reason').props.children).toBe(
      "You've reached the 5-question limit.",
    );

    fireEvent.press(getByTestId('question-add'));
    expect(getByTestId('harness-count').props.children).toBe('5');
  });

  it('requires at least two options for a single-choice question', () => {
    const { getByTestId, queryByTestId } = render(<BuilderHarness />);

    fireEvent.press(getByTestId('question-add'));
    fireEvent.changeText(getByTestId('question-label-q1'), 'Which country are you applying from?');
    fireEvent.press(getByTestId('question-type-q1-single_select'));

    // Switching type seeds the two options the schema demands.
    fireEvent.changeText(getByTestId('question-option-q1-0'), 'Nigeria');
    fireEvent.changeText(getByTestId('question-option-q1-1'), 'Ghana');
    expect(getByTestId('harness-valid').props.children).toBe('valid');
    expect(queryByTestId('question-error-q1')).toBeNull();

    // Drop to one and it is no longer a choice.
    fireEvent.press(getByTestId('question-option-remove-q1-1'));
    expect(getByTestId('question-error-q1').props.children).toBe(
      'A single choice needs at least 2 options.',
    );
    expect(getByTestId('harness-valid').props.children).toBe('invalid');
  });

  it('never sends `options` on a text question', () => {
    const { getByTestId } = render(<BuilderHarness />);

    fireEvent.press(getByTestId('question-add'));
    fireEvent.changeText(getByTestId('question-label-q1'), 'Why do you want to join?');
    fireEvent.press(getByTestId('question-type-q1-single_select'));
    fireEvent.changeText(getByTestId('question-option-q1-0'), 'A');
    fireEvent.changeText(getByTestId('question-option-q1-1'), 'B');
    // Reconsider: back to a text answer. The wire payload must drop `options`
    // outright — the backend's text branch rejects the key, not just a value.
    fireEvent.press(getByTestId('question-type-q1-long_text'));

    const payload = JSON.parse(getByTestId('harness-payload').props.children as string);
    expect(payload).toEqual([
      { id: 'q1', type: 'long_text', label: 'Why do you want to join?', required: false },
    ]);
    expect('options' in payload[0]).toBe(false);
    // …and the typing the user did is still there if they switch back.
    fireEvent.press(getByTestId('question-type-q1-single_select'));
    expect(getByTestId('question-option-q1-0').props.value).toBe('A');
  });
});

// ---------------------------------------------------------------------------
// Group settings
// ---------------------------------------------------------------------------

describe('group settings', () => {
  it('blocks the save while a screening question is incomplete', async () => {
    mockParams = { id: 'g1' };
    mockFetchGroup.mockResolvedValue({
      group: makeGroup({ joinPolicy: 'request' }),
      membership: {
        id: 'm1',
        groupId: 'g1',
        userId: 'user_1',
        role: 'owner',
        status: 'active',
        joinedAt: '2026-07-01T10:00:00.000Z',
      },
    });

    const { getByTestId } = render(<GroupSettingsScreen />);
    await waitFor(() => getByTestId('group-settings-save'));

    fireEvent.press(getByTestId('question-add'));
    expect(getByTestId('group-settings-save').props.accessibilityState.disabled).toBe(true);

    fireEvent.changeText(getByTestId('question-label-q1'), 'Why do you want to join?');
    expect(getByTestId('group-settings-save').props.accessibilityState.disabled).toBe(false);

    fireEvent.press(getByTestId('group-settings-save'));
    await waitFor(() => expect(mockSaveGroupForm).toHaveBeenCalledTimes(1));
    expect(mockSaveGroupForm.mock.calls[0][1]).toEqual([
      { id: 'q1', type: 'short_text', label: 'Why do you want to join?', required: false },
    ]);
    // A group's opportunity is fixed at creation, so no update ever carries one.
    expect(mockUpdateGroup.mock.calls[0][1]).not.toHaveProperty('opportunityId');
  });

  it('warns that archiving cannot be undone before it archives', async () => {
    mockParams = { id: 'g1' };
    const { getByTestId, queryByTestId } = render(<GroupSettingsScreen />);
    await waitFor(() => getByTestId('group-settings-archive'));

    expect(queryByTestId('group-settings-archive-warning')).toBeNull();
    fireEvent.press(getByTestId('group-settings-archive'));

    expect(getByTestId('group-settings-archive-warning').props.children).toBe(
      'Archiving closes this group for good — no one, including you, can undo it.',
    );
    expect(mockArchiveGroup).not.toHaveBeenCalled();

    fireEvent.press(getByTestId('group-settings-archive-confirm'));
    await waitFor(() => expect(mockArchiveGroup).toHaveBeenCalledWith('g1', expect.anything()));
  });
});

// ---------------------------------------------------------------------------
// Screens, not modals — DESIGN.md §5.2
// ---------------------------------------------------------------------------

describe('screens, not modals', () => {
  it('renders the create form as a screen with no Modal in the tree', () => {
    const { UNSAFE_queryAllByType, getByTestId } = render(<CreateGroupScreen />);
    expect(UNSAFE_queryAllByType(Modal)).toHaveLength(0);
    getByTestId('create-group-scroll');
  });

  it('renders group settings as a screen with no Modal in the tree', async () => {
    mockParams = { id: 'g1' };
    const { UNSAFE_queryAllByType, getByTestId } = render(<GroupSettingsScreen />);
    await waitFor(() => getByTestId('group-settings-save'));
    // Including the irreversible archive confirmation, which is inline.
    fireEvent.press(getByTestId('group-settings-archive'));
    getByTestId('group-settings-archive-warning');
    expect(UNSAFE_queryAllByType(Modal)).toHaveLength(0);
  });
});
