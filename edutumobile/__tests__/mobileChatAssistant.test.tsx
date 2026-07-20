import React from 'react';
import { AccessibilityInfo } from 'react-native';
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
// Mutable so individual specs can seed a conversation (the screen renders
// nothing message-related when this is empty).
let mockMessages: any[] = [];
let mockOpportunities: any[] = [];
let mockThreads: any[] = [];
let mockIsSending = false;
let mockIsStreaming = false;
let mockStreamingContent: string | null = null;
let mockStreamedMessageId: string | null = null;
const mockStopGeneration = jest.fn();

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
    threads: mockThreads,
    messages: mockMessages,
    selectedThreadId: null,
    isLoadingThreads: false,
    isLoadingMessages: false,
    isSending: mockIsSending,
    isStreaming: mockIsStreaming,
    streamingContent: mockStreamingContent,
    streamedMessageId: mockStreamedMessageId,
    stopGeneration: mockStopGeneration,
    selectThread: mockSelectThread,
    sendMessage: (...args: unknown[]) => mockSendMessage(...args),
    archiveThread: mockArchiveThread,
  }),
}), { virtual: true });

jest.mock('@edutu/core/src/hooks/useOpportunities', () => ({
  useOpportunities: () => ({
    data: mockOpportunities,
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
    mockMessages = [];
    mockOpportunities = [];
    mockThreads = [];
    mockIsSending = false;
    mockIsStreaming = false;
    mockStreamingContent = null;
    mockStreamedMessageId = null;
    mockStopGeneration.mockClear();
    // React Native's jest preset already mocks this, and the same jest.fn is
    // shared across the whole file — clear it so the announcement spec only
    // ever sees its own calls.
    (AccessibilityInfo.announceForAccessibility as unknown as jest.Mock).mockClear?.();
    mockSendMessage.mockResolvedValue({
      threadId: 'thread-1',
      userMessage: { id: 'u-1', role: 'user', content: 'Hello', created_at: '2026-06-22T00:00:00.000Z' },
      assistantMessage: { id: 'a-1', role: 'assistant', content: 'Hi there', created_at: '2026-06-22T00:01:00.000Z' },
    });
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

  // The assistant message under test is deliberately NOT the latest one: the
  // latest bubble runs the typewriter reveal, which would render it partially.
  function conversation(userText: string, assistantText: string, metadata?: unknown) {
    return [
      { id: 'u-1', role: 'user', content: userText, created_at: '2026-06-22T00:00:00.000Z' },
      { id: 'a-1', role: 'assistant', content: assistantText, created_at: '2026-06-22T00:00:01.000Z', metadata },
      { id: 'u-2', role: 'user', content: 'thanks', created_at: '2026-06-22T00:00:02.000Z' },
      { id: 'a-2', role: 'assistant', content: 'Anytime.', created_at: '2026-06-22T00:00:03.000Z' },
    ];
  }

  const localOpportunity = {
    id: 'local-1',
    title: 'Locally Ranked Scholarship',
    organization: 'Some Org',
    category: 'Scholarship',
    location: 'Nigeria',
    description: 'A scholarship for students',
    deadline: '2030-01-01T00:00:00.000Z',
    tags: ['scholarship'],
    aiTags: [],
    requirements: [],
    benefits: [],
    match: 90,
  };

  it('renders the agent reply verbatim and injects no cards when the server returned none', () => {
    // An English opportunity-search phrasing plus a loaded local catalogue is
    // exactly the situation that used to trigger client-side fabrication.
    mockOpportunities = [localOpportunity];
    mockMessages = conversation(
      'Show me scholarships I can apply for',
      "I couldn't find anything that fits you yet — tell me your field of study.",
    );

    const { getByText, queryByText } = render(<ChatScreen />);

    expect(getByText("I couldn't find anything that fits you yet — tell me your field of study.")).toBeTruthy();
    expect(queryByText('Recommended from Opportunities')).toBeNull();
    expect(queryByText('Locally Ranked Scholarship')).toBeNull();
    expect(queryByText(/I found \d+ matches/)).toBeNull();
    expect(queryByText('Checking Edutu opportunities for you.')).toBeNull();
  });

  it('renders opportunity cards only from server-provided metadata', () => {
    mockOpportunities = [localOpportunity];
    mockMessages = conversation('Any scholarships?', 'Here is one worth a look.', {
      opportunities: [
        {
          id: 'opp-1',
          title: 'Chevening Scholarship',
          organization: 'UK Government',
          category: 'Scholarship',
          location: 'United Kingdom',
          deadline: '2030-11-05T00:00:00.000Z',
          summary: 'Fully funded masters',
          imageUrl: null,
          applyUrl: null,
          matchScore: 82,
          matchReason: null,
        },
      ],
    });

    const { getByText, queryByText } = render(<ChatScreen />);

    expect(getByText('Recommended from Opportunities')).toBeTruthy();
    expect(getByText('Chevening Scholarship')).toBeTruthy();
    expect(getByText('Here is one worth a look.')).toBeTruthy();
    expect(queryByText('Locally Ranked Scholarship')).toBeNull();
  });

  // The "Build roadmap" offer used to be gated by English-only regexes over the
  // user's own words, so it never appeared in 8 of the 9 shipped locales. It is
  // now driven purely by the server's `metadata.roadmapIntent`.
  describe('roadmap offer', () => {
    it('shows the panel for a Swahili conversation when the server flags the turn', () => {
      mockOpportunities = [localOpportunity];
      mockMessages = conversation(
        'Nisaidie kujiandaa kwa maombi yangu ya ufadhili',
        'Tuanze na hatua ya kwanza.',
        { roadmapIntent: true },
      );

      const { getByText, queryByText } = render(<ChatScreen />);

      expect(getByText('Goals, deadlines, reminders')).toBeTruthy();
      expect(getByText('Build')).toBeTruthy();
      // No client-ranked cards: the panel names no opportunities of its own.
      expect(queryByText('Locally Ranked Scholarship')).toBeNull();
    });

    it('stays hidden for an English roadmap request the server did not flag', () => {
      mockOpportunities = [localOpportunity];
      mockMessages = conversation(
        'Build me a roadmap to apply for that scholarship',
        'Tell me which opportunity you mean.',
      );

      const { queryByText } = render(<ChatScreen />);

      // The old regexes matched this sentence; only the server decides now.
      expect(queryByText('Goals, deadlines, reminders')).toBeNull();
      expect(queryByText('Locally Ranked Scholarship')).toBeNull();
    });

    it('routes Build through the agent instead of creating goals on the device', async () => {
      mockMessages = conversation('Aide-moi à préparer ma candidature', 'On y va.', {
        roadmapIntent: true,
      });

      const { getByText } = render(<ChatScreen />);
      pressByText(getByText, 'Build');

      await waitFor(() =>
        expect(mockSendMessage).toHaveBeenCalledWith('Yes, build me that roadmap.'),
      );
      expect(mockCreateGoal).not.toHaveBeenCalled();
    });
  });

  it('keeps every row of a markdown table the model produced', () => {
    mockMessages = conversation(
      'Compare these scholarships',
      [
        'Here is the comparison:',
        '',
        '| Programme | Deadline |',
        '| --- | --- |',
        '| Mastercard Foundation | 1 March |',
        '| Chevening | 5 November |',
      ].join('\n'),
    );

    const { getByText } = render(<ChatScreen />);

    expect(getByText('Here is the comparison:')).toBeTruthy();
    expect(getByText('Programme')).toBeTruthy();
    expect(getByText('Mastercard Foundation')).toBeTruthy();
    expect(getByText('1 March')).toBeTruthy();
    expect(getByText('Chevening')).toBeTruthy();
    expect(getByText('5 November')).toBeTruthy();
  });

  it('renders a pipe-less GFM table (no leading/trailing pipes) as a real table', () => {
    mockMessages = conversation(
      'Compare these scholarships',
      [
        'Here is the comparison:',
        '',
        'Programme | Deadline',
        '--- | ---',
        'Chevening | Nov',
      ].join('\n'),
    );

    const { getByText, queryByText } = render(<ChatScreen />);

    expect(getByText('Here is the comparison:')).toBeTruthy();
    expect(getByText('Programme')).toBeTruthy();
    expect(getByText('Deadline')).toBeTruthy();
    expect(getByText('Chevening')).toBeTruthy();
    expect(getByText('Nov')).toBeTruthy();
    // The alignment row must not leak through as a literal text block.
    expect(queryByText('--- | ---')).toBeNull();
    expect(queryByText(/^-+\s*\|\s*-+$/)).toBeNull();
  });

  it('keeps an all-dash data row instead of mistaking it for the alignment row', () => {
    mockMessages = conversation(
      'Any results yet?',
      [
        '| Year | Note |',
        '|---|---|',
        '| - | - |',
        '| 2026 | ok |',
      ].join('\n'),
    );

    const { getByText, getAllByText } = render(<ChatScreen />);

    expect(getByText('Year')).toBeTruthy();
    expect(getByText('Note')).toBeTruthy();
    expect(getByText('2026')).toBeTruthy();
    expect(getByText('ok')).toBeTruthy();
    // The "- / -" data row (meaning "no data yet") must survive as its own
    // row rather than being swallowed as if it were the `|---|---|` separator.
    expect(getAllByText('-')).toHaveLength(2);
  });

  it('renders bold markers as emphasis instead of deleting them', () => {
    mockMessages = conversation('When is it due?', '**Deadline:** 1 March\n- Bring **two** referees');

    const { getByText, queryByText } = render(<ChatScreen />);

    expect(getByText('Deadline:')).toBeTruthy();
    expect(getByText('two')).toBeTruthy();
    expect(queryByText(/\*\*/)).toBeNull();
  });

  it('keeps the typed message and offers an explicit re-send after a limit hit', async () => {
    const { ChatRateLimitError } = require('@edutu/core/src/services/chat');
    mockSendMessage.mockRejectedValueOnce(new ChatRateLimitError());

    const { getByPlaceholderText, getByText } = render(<ChatScreen />);
    const composer = getByPlaceholderText('Message Edutu...');

    fireEvent.changeText(composer, 'Help me with my essay');
    pressByText(getByText, 'Send');

    await waitFor(() => expect(getByText("You've reached your AI limit")).toBeTruthy());
    // The composer is repopulated — the user does not lose what they typed.
    expect(getByPlaceholderText('Message Edutu...').props.value).toBe('Help me with my essay');

    pressByText(getByText, 'Upgrade to Pro');
    expect(mockPush).toHaveBeenCalledWith('/paywall');

    // Coming back from the paywall offers a tap — it never auto-sends.
    await waitFor(() => expect(getByText('Your message is saved')).toBeTruthy());
    expect(mockSendMessage).toHaveBeenCalledTimes(1);

    pressByText(getByText, 'Send it now');
    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(2));
    expect(mockSendMessage).toHaveBeenLastCalledWith('Help me with my essay');
  });

  it('renders streamed tokens live and drops the thinking dots once text arrives', () => {
    mockMessages = [
      { id: 'u-1', role: 'user', content: 'Any scholarships?', created_at: '2026-07-20T00:00:00.000Z' },
    ];
    mockIsSending = true;
    mockStreamingContent = 'I found 3 matches';

    const { getByText, queryByText } = render(<ChatScreen />);

    // The tokens the server actually sent are on screen, in full, immediately —
    // no fake typewriter gating them.
    expect(getByText('I found 3 matches')).toBeTruthy();
    expect(queryByText('Edutu is thinking…')).toBeNull();
  });

  it('keeps the thinking indicator for the gap before the first token', () => {
    mockIsSending = true;
    // '' is the state both before the first token and right after the discard
    // rule clears a pre-tool preamble.
    mockStreamingContent = '';

    const { getByText } = render(<ChatScreen />);

    expect(getByText('Edutu is thinking…')).toBeTruthy();
  });

  it('turns the composer into a labelled stop control while generating', () => {
    mockIsSending = true;
    mockIsStreaming = true;
    mockStreamingContent = 'Chevening op';

    const { getByLabelText, queryByLabelText } = render(<ChatScreen />);

    expect(queryByLabelText('Send')).toBeNull();
    const stopButton = getByLabelText('Stop generating');
    expect(stopButton.props.accessibilityRole).toBe('button');

    act(() => {
      findTouchable(stopButton).props.onPress?.();
    });
    expect(mockStopGeneration).toHaveBeenCalledTimes(1);
  });

  // REGRESSION: a second send mid-generation overwrote the abort controller,
  // orphaning the first stream (which then could not be stopped at all) and
  // running two metered turns at once.
  it('ignores a quick-prompt tap while a reply is already generating', async () => {
    mockIsSending = true;
    mockIsStreaming = true;
    mockStreamingContent = 'Chevening op';

    const { getAllByText } = render(<ChatScreen />);

    await waitFor(() => expect(getAllByText('Build roadmap').length).toBeGreaterThan(0));
    act(() => {
      findTouchable(getAllByText('Build roadmap')[0]).props.onPress?.();
    });

    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  // Stop only does something while the SSE transport is live; during the
  // non-streaming fallback send there is nothing to abort.
  it('does not offer Stop while the non-streaming fallback send is running', () => {
    mockIsSending = true;
    mockIsStreaming = false;

    const { queryByLabelText, getByLabelText } = render(<ChatScreen />);

    expect(queryByLabelText('Stop generating')).toBeNull();
    expect(getByLabelText('Sending…')).toBeTruthy();
  });

  it('says so when the user stops before Edutu managed a single word', () => {
    mockMessages = [
      { id: 'u-1', role: 'user', content: 'Any scholarships?', created_at: '2026-07-20T00:00:00.000Z' },
      {
        id: 'local-assistant-1',
        role: 'assistant',
        content: '',
        created_at: '2026-07-20T00:00:01.000Z',
        metadata: { stopped: true, stoppedBeforeReply: true },
      },
    ];

    const { getByText } = render(<ChatScreen />);

    expect(getByText('You stopped this before Edutu replied.')).toBeTruthy();
  });

  it('keeps a stopped reply on screen and labels it as incomplete', () => {
    mockMessages = [
      { id: 'u-1', role: 'user', content: 'Any scholarships?', created_at: '2026-07-20T00:00:00.000Z' },
      {
        id: 'local-assistant-1',
        role: 'assistant',
        content: 'Chevening opens in',
        created_at: '2026-07-20T00:00:01.000Z',
        metadata: { stopped: true },
      },
    ];
    // Not sending any more — the UI must not be stuck in a generating state.
    mockIsSending = false;
    mockStreamingContent = null;

    const { getByText, queryByLabelText } = render(<ChatScreen />);

    expect(getByText('Chevening opens in')).toBeTruthy();
    expect(getByText('You stopped this reply — it may be incomplete.')).toBeTruthy();
    expect(queryByLabelText('Stop generating')).toBeNull();
  });

  it('labels a reply the connection cut short and one the server flagged partial', () => {
    mockMessages = [
      {
        id: 'a-1',
        role: 'assistant',
        content: 'Half an answer',
        created_at: '2026-07-20T00:00:01.000Z',
        metadata: { interrupted: true },
      },
      {
        id: 'a-2',
        role: 'assistant',
        content: 'Another half',
        created_at: '2026-07-20T00:00:02.000Z',
        metadata: { truncated: true },
      },
    ];
    mockStreamedMessageId = 'a-2';

    const { getByText } = render(<ChatScreen />);

    expect(getByText('The connection dropped, so this reply is incomplete. Ask again to get the full answer.')).toBeTruthy();
    expect(getByText('This answer is partial — Edutu ran out of room to finish it.')).toBeTruthy();
  });

  it('does not replay the typewriter over text the user already watched stream in', () => {
    mockMessages = [
      { id: 'u-1', role: 'user', content: 'Any scholarships?', created_at: '2026-07-20T00:00:00.000Z' },
      { id: 'a-1', role: 'assistant', content: 'Chevening is open until 5 November.', created_at: '2026-07-20T00:00:01.000Z' },
    ];
    mockStreamedMessageId = 'a-1';

    const { getByText } = render(<ChatScreen />);

    // The reveal would render zero characters on the first frame; the streamed
    // message must appear whole.
    expect(getByText('Chevening is open until 5 November.')).toBeTruthy();
  });

  it('labels the history button and each thread row for a screen reader', () => {
    mockThreads = [
      { id: 'thread-1', title: 'Scholarship plan', updated_at: new Date().toISOString() },
    ];

    const { getByLabelText } = render(<ChatScreen />);

    // The icon-only History button in the header must describe what it does.
    const historyButton = getByLabelText('Conversation history');
    expect(historyButton.props.accessibilityRole).toBe('button');

    act(() => {
      findTouchable(historyButton).props.onPress?.();
    });

    // Thread rows need a role and a label carrying the thread and its date —
    // an icon/clock glyph alone tells a screen-reader user nothing.
    const expectedDate = new Date(mockThreads[0].updated_at).toLocaleDateString();
    const threadRow = getByLabelText(`Conversation: Scholarship plan, ${expectedDate}`);
    expect(threadRow.props.accessibilityRole).toBe('button');
  });

  it('announces once when the AI starts working and once when it finishes — never per token', () => {
    const announceSpy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});

    const { rerender } = render(<ChatScreen />);
    expect(announceSpy).not.toHaveBeenCalled();

    mockIsSending = true;
    rerender(<ChatScreen />);
    expect(announceSpy).toHaveBeenCalledTimes(1);
    expect(announceSpy).toHaveBeenLastCalledWith('Edutu is thinking');

    // Re-rendering while still sending (e.g. a streamed token arriving) must
    // not re-announce — that would make the screen unusable with a screen
    // reader.
    rerender(<ChatScreen />);
    expect(announceSpy).toHaveBeenCalledTimes(1);

    mockIsSending = false;
    rerender(<ChatScreen />);
    expect(announceSpy).toHaveBeenCalledTimes(2);
    expect(announceSpy).toHaveBeenLastCalledWith('Edutu replied');

    announceSpy.mockRestore();
  });
});
