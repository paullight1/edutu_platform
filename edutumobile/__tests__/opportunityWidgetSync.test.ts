import { updateOpportunityWidgetTimeline } from '../widgets/OpportunityWidget';
import {
  getOpportunityWidgetProps,
  getOpportunityWidgetTimeline,
  updateOpportunityWidgetFromSnapshot,
} from '../lib/opportunityWidgetSync';
import type { OpportunityWidgetSnapshot } from '../lib/mobileControl';

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

const baseSnapshot: OpportunityWidgetSnapshot = {
  schemaVersion: 1,
  kind: 'opportunity-widget',
  generatedAt: '2026-05-19T00:00:00.000Z',
  title: 'Opportunities for you',
  source: 'opportunities',
  itemCount: 1,
  emptyText: 'No opportunities available right now.',
  items: [
    {
      id: 'opp-1',
      title: 'Global Fellowship',
      organization: 'Edutu',
      category: 'Scholarship',
      deadline: '2099-06-01',
      location: 'Remote',
      deepLink: 'edutu://opportunity/opp-1',
    },
  ],
};

describe('opportunity widget sync bridge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('maps the top snapshot item into iOS widget props', () => {
    expect(getOpportunityWidgetProps(baseSnapshot)).toEqual({
      title: 'Global Fellowship',
      provider: 'Edutu',
      // Far-future deadline → show the date, not a giant "N days left".
      deadline: '1 Jun 2099',
      category: 'Scholarship',
      location: 'Remote',
      match: undefined,
      urgent: false,
      tone: 'green',
      daysLeft: expect.any(Number),
      logoUri: undefined,
      deepLink: 'edutu://opportunity/opp-1',
      items: [
        {
          title: 'Global Fellowship',
          provider: 'Edutu',
          deadline: '1 Jun 2099',
          category: 'Scholarship',
          location: 'Remote',
          match: undefined,
          urgent: false,
          tone: 'green',
          daysLeft: expect.any(Number),
          deepLink: 'edutu://opportunity/opp-1',
        },
      ],
    });
  });

  it('drops items whose deadline has already passed', () => {
    const snapshot: OpportunityWidgetSnapshot = {
      ...baseSnapshot,
      items: [
        { ...baseSnapshot.items[0], id: 'gone', title: 'Closed Grant', deadline: '2020-01-01' },
        baseSnapshot.items[0],
      ],
    };

    const props = getOpportunityWidgetProps(snapshot, new Date('2026-05-19T12:00:00Z'));
    expect(props.title).toBe('Global Fellowship');
    expect(props.items).toHaveLength(1);
  });

  it('updates the platform widget with a timeline from a snapshot', async () => {
    await updateOpportunityWidgetFromSnapshot(baseSnapshot);

    expect(updateOpportunityWidgetTimeline).toHaveBeenCalledTimes(1);
    const entries = (updateOpportunityWidgetTimeline as jest.Mock).mock.calls[0][0];
    expect(entries[0].props).toEqual(
      expect.objectContaining({ title: 'Global Fellowship', provider: 'Edutu' }),
    );
  });
});

describe('getOpportunityWidgetTimeline', () => {
  // Noon local time, so "today" is unambiguous regardless of the test TZ.
  const now = new Date(2026, 4, 19, 12, 0, 0);

  it('recomputes countdown labels for each upcoming midnight', () => {
    const snapshot: OpportunityWidgetSnapshot = {
      ...baseSnapshot,
      // 3 days out from `now`.
      items: [{ ...baseSnapshot.items[0], deadline: '2026-05-22' }],
    };

    const entries = getOpportunityWidgetTimeline(snapshot, now);

    // One entry for now + one per future midnight.
    expect(entries.length).toBe(15);
    expect(entries[0].date).toBe(now);
    expect(entries[0].props.deadline).toBe('3 days left');
    expect(entries[0].props.urgent).toBe(true);
    expect(entries[1].props.deadline).toBe('2 days left');
    expect(entries[2].props.deadline).toBe('Closes tomorrow');
    expect(entries[3].props.deadline).toBe('Closes today');
    // The day after the deadline the item is expired and falls off.
    expect(entries[4].props.items).toHaveLength(0);
    expect(entries[4].props.title).toBe(snapshot.title);

    // Each future entry lands exactly on a local midnight.
    const firstMidnight = entries[1].date;
    expect(firstMidnight.getHours()).toBe(0);
    expect(firstMidnight.getDate()).toBe(20);
  });

  it('returns a single entry when no item has a dated deadline', () => {
    const snapshot: OpportunityWidgetSnapshot = {
      ...baseSnapshot,
      items: [{ ...baseSnapshot.items[0], deadline: 'Rolling' }],
    };

    const entries = getOpportunityWidgetTimeline(snapshot, now);
    expect(entries).toHaveLength(1);
    expect(entries[0].props.deadline).toBe('Rolling deadline');
  });
});
