import AsyncStorage from '@react-native-async-storage/async-storage';
import { isCampaignActive, selectCampaign, type MobileCampaign } from '../lib/mobileControl';
import {
  buildOpportunityWidgetSnapshot,
  OPPORTUNITY_WIDGET_SNAPSHOT_KEY,
  syncOpportunityWidgetSnapshot,
} from '../lib/mobileControl';
import { DEFAULT_PAYWALL_CONTENT, normalisePaywallContent } from '../lib/pricing';

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

const baseCampaign: MobileCampaign = {
  id: 'campaign-1',
  key: 'welcome',
  title: 'Welcome',
  campaign_type: 'popup',
  placement: 'global',
  status: 'active',
  priority: 1,
};

describe('paywall content normalisation', () => {
  it('returns defaults for a missing or malformed payload', () => {
    expect(normalisePaywallContent(undefined)).toEqual(DEFAULT_PAYWALL_CONTENT);
    expect(normalisePaywallContent('nope')).toEqual(DEFAULT_PAYWALL_CONTENT);
    expect(normalisePaywallContent({ heroLine1: 42, features: 'x', defaultPlan: 'daily' })).toEqual(
      DEFAULT_PAYWALL_CONTENT,
    );
  });

  it('keeps valid admin overrides and trims text', () => {
    const content = normalisePaywallContent({
      heroLine1: '  Big January Bonanza  ',
      subtitle: 'Everything unlocked',
      ctaLabel: 'Join now',
      badgeMonthly: 'Hot',
      features: ['  Unlimited AI  ', '', 'Premium CVs'],
      accentColor: '#FF6600',
      heroStyle: 'gradient',
      defaultPlan: 'yearly',
    });

    expect(content.heroLine1).toBe('Big January Bonanza');
    expect(content.subtitle).toBe('Everything unlocked');
    expect(content.ctaLabel).toBe('Join now');
    expect(content.badgeMonthly).toBe('Hot');
    expect(content.features).toEqual(['Unlimited AI', 'Premium CVs']);
    expect(content.accentColor).toBe('#FF6600');
    expect(content.heroStyle).toBe('gradient');
    expect(content.defaultPlan).toBe('yearly');
    // Untouched fields stay empty so the app's translated copy is used.
    expect(content.heroLine2).toBe('');
  });

  it('drops invalid accent colors and caps the feature list', () => {
    const content = normalisePaywallContent({
      accentColor: 'red',
      features: ['1', '2', '3', '4', '5', '6', '7', '8'],
    });
    expect(content.accentColor).toBe('');
    expect(content.features).toHaveLength(6);
  });
});

describe('mobile control campaign selection', () => {
  it('rejects inactive and expired campaigns', () => {
    expect(isCampaignActive({ ...baseCampaign, status: 'paused' })).toBe(false);
    expect(isCampaignActive({ ...baseCampaign, ends_at: '2020-01-01T00:00:00.000Z' })).toBe(false);
  });

  it('selects the highest priority active campaign for a placement', () => {
    const campaign = selectCampaign([
      { ...baseCampaign, id: 'low', key: 'low', priority: 1, placement: 'home' },
      { ...baseCampaign, id: 'wrong-placement', key: 'wrong', priority: 100, placement: 'goals' },
      { ...baseCampaign, id: 'high', key: 'high', priority: 5, placement: 'global' },
    ], 'home');

    expect(campaign?.id).toBe('high');
  });
});

describe('opportunity widget snapshot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('prefers active opportunity widget feed items from mobile control config', async () => {
    const snapshot = await syncOpportunityWidgetSnapshot({
      fetchConfig: jest.fn().mockResolvedValue({
        campaigns: [],
        featureFlags: [],
        serverTime: '2026-05-19T10:00:00.000Z',
        widgetFeeds: [
          {
            id: 'feed-1',
            key: 'today',
            title: 'Today for you',
            feed_type: 'opportunities',
            placement: 'android_home',
            status: 'active',
            priority: 10,
            items: [
              {
                id: 'opp-1',
                title: 'Global Scholarship',
                organization: 'Edutu',
                deadline: '2026-06-30',
                location: 'Remote',
                match: 91,
              },
            ],
          },
        ],
      }),
      readCachedOpportunities: jest.fn(),
      now: () => 1770000000000,
    });

    expect(snapshot.source).toBe('mobile-control');
    expect(snapshot.title).toBe('Today for you');
    expect(snapshot.items).toEqual([
      expect.objectContaining({
        id: 'opp-1',
        title: 'Global Scholarship',
        organization: 'Edutu',
        match: 91,
      }),
    ]);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      OPPORTUNITY_WIDGET_SNAPSHOT_KEY,
      JSON.stringify(snapshot),
    );
  });

  it('falls back to cached opportunities and keeps the payload small', async () => {
    const snapshot = await syncOpportunityWidgetSnapshot({
      fetchConfig: jest.fn().mockRejectedValue(new Error('offline')),
      readCachedOpportunities: jest.fn().mockResolvedValue([
        {
          id: 'opp-1',
          title: 'A'.repeat(120),
          organization: 'Provider',
          category: 'Scholarship',
          deadline: null,
          location: 'Worldwide',
          description: 'Long description',
          requirements: [],
          benefits: [],
          applicationProcess: [],
          match: 88,
          applyUrl: 'https://example.com/apply',
        },
        {
          id: 'opp-2',
          title: 'Second',
          organization: 'Provider',
          category: 'Internship',
          deadline: '2026-07-01',
          location: 'Lagos',
          description: 'Second description',
          requirements: [],
          benefits: [],
          applicationProcess: [],
          match: 70,
        },
      ]),
      now: () => 1770000000000,
    });

    expect(snapshot.source).toBe('opportunities-cache');
    expect(snapshot.items).toHaveLength(2);
    expect(snapshot.items[0]).toEqual({
      id: 'opp-1',
      title: `${'A'.repeat(77)}...`,
      organization: 'Provider',
      category: 'Scholarship',
      deadline: null,
      location: 'Worldwide',
      match: 88,
      deepLink: 'edutu://opportunity/opp-1',
    });
  });

  it('can build a snapshot directly from fresh opportunities', () => {
    const snapshot = buildOpportunityWidgetSnapshot({
      source: 'opportunities',
      opportunities: [
        {
          id: 'opp-1',
          title: 'Fresh opportunity',
          organization: 'Provider',
          category: 'Grant',
          deadline: null,
          location: 'Remote',
          description: '',
          requirements: [],
          benefits: [],
          applicationProcess: [],
          match: 95,
        },
      ],
      now: () => 1770000000000,
    });

    expect(snapshot).toMatchObject({
      source: 'opportunities',
      itemCount: 1,
      items: [expect.objectContaining({ deepLink: 'edutu://opportunity/opp-1' })],
    });
  });

  it('prioritizes strong matches and urgent deadlines before filling the widget', () => {
    const snapshot = buildOpportunityWidgetSnapshot({
      source: 'opportunities',
      userId: 'user-1',
      opportunities: [
        {
          id: 'generic',
          title: 'Generic listing',
          organization: 'Provider',
          category: 'Other',
          deadline: '2026-12-01',
          location: 'Remote',
          description: '',
          requirements: [],
          benefits: [],
          applicationProcess: [],
          match: 45,
        },
        {
          id: 'urgent',
          title: 'Urgent scholarship',
          organization: 'Provider',
          category: 'Scholarship',
          deadline: '2026-02-03T00:00:00.000Z',
          location: 'Remote',
          description: '',
          requirements: [],
          benefits: [],
          applicationProcess: [],
          match: 80,
        },
      ],
      now: () => Date.parse('2026-02-02T00:00:00.000Z'),
    });

    expect(snapshot.items[0].id).toBe('urgent');
  });
});
