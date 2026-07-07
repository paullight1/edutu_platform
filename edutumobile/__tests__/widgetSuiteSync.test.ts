jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

jest.mock('expo-constants', () => ({
  expoConfig: {
    extra: {
      clerkPublishableKey: 'test_clerk_key',
      supabaseUrl: 'https://example.supabase.co',
      supabaseAnonKey: 'test_supabase_key',
      apiBaseUrl: 'http://localhost:3000',
    },
  },
}));

jest.mock('../widgets/OpportunityWidget', () => ({
  updateOpportunityWidget: jest.fn(),
  updateOpportunityWidgetTimeline: jest.fn(),
}));
jest.mock('../widgets/DeadlineWidget', () => ({
  updateDeadlineWidget: jest.fn(),
  updateDeadlineWidgetTimeline: jest.fn(),
}));
jest.mock('../widgets/TrendingWidget', () => ({
  updateTrendingWidget: jest.fn(),
  updateTrendingWidgetTimeline: jest.fn(),
}));
jest.mock('../widgets/ChatWidget', () => ({
  updateChatWidget: jest.fn(),
}));
jest.mock('../lib/widgetLogo', () => ({
  getWidgetLogoUri: jest.fn().mockResolvedValue(undefined),
}));

import { updateDeadlineWidgetTimeline } from '../widgets/DeadlineWidget';
import { updateChatWidget } from '../widgets/ChatWidget';
import {
  getDeadlineWidgetProps,
  getDeadlineWidgetTimeline,
  getTrendingWidgetProps,
  getChatPrompt,
  syncDeadlineWidget,
  syncChatWidget,
} from '../lib/widgetSuiteSync';
import type { DeadlineItem } from '../packages/core/src/services/deadlines';

// Noon local time so "today" is unambiguous regardless of the test TZ.
const now = new Date(2026, 4, 19, 12, 0, 0);

const deadlines: DeadlineItem[] = [
  {
    id: 'applied-opp-1',
    title: 'Chevening Scholarship',
    organization: 'UK Government',
    deadline: '2026-05-21',
    type: 'applied',
    opportunityId: 'opp-1',
    daysRemaining: 2,
  },
  {
    id: 'bookmarked-opp-2',
    title: 'Google STEP Internship',
    organization: 'Google',
    deadline: '2026-06-30',
    type: 'bookmarked',
    opportunityId: 'opp-2',
    daysRemaining: 42,
  },
  {
    id: 'expired-opp-3',
    title: 'Closed Grant',
    organization: 'Gone',
    deadline: '2020-01-01',
    type: 'applied',
    opportunityId: 'opp-3',
    daysRemaining: -100,
  },
];

describe('deadline widget mapping', () => {
  beforeEach(() => jest.clearAllMocks());

  it('maps deadlines into agenda items with date rails and drops expired ones', () => {
    const props = getDeadlineWidgetProps(deadlines, now);

    expect(props.items).toHaveLength(2);
    expect(props.items[0]).toEqual(
      expect.objectContaining({
        title: 'Chevening Scholarship',
        deadline: '2 days left',
        dateDay: '21',
        dateMonth: 'May',
        tone: 'red',
        daysLeft: 2,
        kind: 'applied',
        deepLink: 'edutu://opportunity/opp-1',
      }),
    );
    expect(props.items[1].kind).toBe('saved');
  });

  it('recomputes countdowns per midnight and drops items as they close', () => {
    const entries = getDeadlineWidgetTimeline(deadlines, now);

    expect(entries).toHaveLength(15);
    expect(entries[0].props.items[0].deadline).toBe('2 days left');
    expect(entries[1].props.items[0].deadline).toBe('Closes tomorrow');
    expect(entries[2].props.items[0].deadline).toBe('Closes today');
    // The day after the first deadline passes, only the later one remains.
    expect(entries[3].props.items).toHaveLength(1);
    expect(entries[3].props.items[0].title).toBe('Google STEP Internship');
  });

  it('pushes a timeline via the injectable fetcher', async () => {
    await syncDeadlineWidget({ fetchDeadlines: async () => deadlines, now });

    expect(updateDeadlineWidgetTimeline).toHaveBeenCalledTimes(1);
    const entries = (updateDeadlineWidgetTimeline as jest.Mock).mock.calls[0][0];
    expect(entries[0].props.items[0].title).toBe('Chevening Scholarship');
  });
});

describe('trending widget mapping', () => {
  it('maps public rows and drops closed ones', () => {
    const props = getTrendingWidgetProps(
      [
        { id: 't1', title: 'AWS AI Hackathon', organization: 'AWS', category: 'Competition', deadline: '2026-05-25' },
        { id: 't2', title: 'Old Thing', deadline: '2020-01-01' },
      ],
      now,
    );

    expect(props.items).toHaveLength(1);
    expect(props.items[0]).toEqual(
      expect.objectContaining({
        title: 'AWS AI Hackathon',
        category: 'Competition',
        deadline: '6 days left',
        tone: 'amber',
        deepLink: 'edutu://opportunity/t1',
      }),
    );
  });
});

describe('chat widget', () => {
  it('rotates the prompt by day and updates the widget', () => {
    const promptA = getChatPrompt(new Date(2026, 4, 19));
    const promptB = getChatPrompt(new Date(2026, 4, 20));
    expect(promptA).not.toBe(promptB);

    syncChatWidget({ now: new Date(2026, 4, 19) });
    expect(updateChatWidget).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: promptA }),
    );
  });
});
