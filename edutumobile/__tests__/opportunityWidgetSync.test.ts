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
}));

import { updateOpportunityWidget } from '../widgets/OpportunityWidget';
import {
  getOpportunityWidgetProps,
  updateOpportunityWidgetFromSnapshot,
} from '../lib/opportunityWidgetSync';
import type { OpportunityWidgetSnapshot } from '../lib/mobileControl';

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
      deadline: 'Jun 1',
      category: 'Scholarship',
      location: 'Remote',
      match: undefined,
      deepLink: 'edutu://opportunity/opp-1',
      items: [
        {
          title: 'Global Fellowship',
          provider: 'Edutu',
          deadline: 'Jun 1',
          category: 'Scholarship',
          location: 'Remote',
          match: undefined,
          deepLink: 'edutu://opportunity/opp-1',
        },
      ],
    });
  });

  it('updates the platform widget from a snapshot', async () => {
    await updateOpportunityWidgetFromSnapshot(baseSnapshot);

    expect(updateOpportunityWidget).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Global Fellowship',
      provider: 'Edutu',
    }));
  });
});
