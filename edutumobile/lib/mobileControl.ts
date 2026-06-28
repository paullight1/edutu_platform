import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCachedOpportunitiesSnapshot } from '../packages/core/src/services/opportunities';
import type { Opportunity } from '../packages/core/src/types/opportunity';
import { getConfig } from './config';

export type CampaignType = 'popup' | 'banner' | 'notification' | 'interstitial' | 'announcement';
export type CampaignPlacement = 'global' | 'home' | 'opportunities' | 'goals' | 'notifications';

export interface MobileCampaign {
  id: string;
  key: string;
  title: string;
  body?: string | null;
  campaign_type: CampaignType;
  placement: CampaignPlacement;
  status: 'draft' | 'scheduled' | 'active' | 'paused' | 'archived';
  priority: number;
  starts_at?: string | null;
  ends_at?: string | null;
  audience?: Record<string, unknown>;
  creative?: {
    ctaLabel?: string;
    ctaRoute?: string;
    imageUrl?: string;
    accentColor?: string;
  } & Record<string, unknown>;
  frequency?: {
    mode?: 'once' | 'everySession';
    cooldownHours?: number;
  } & Record<string, unknown>;
}

export interface MobileFeatureFlag {
  id: string;
  key: string;
  label: string;
  description?: string | null;
  enabled: boolean;
  default_value: unknown;
  rollout?: Record<string, unknown>;
  requires_pro: boolean;
  sort_order: number;
}

export interface WidgetFeed {
  id: string;
  key: string;
  title: string;
  feed_type: string;
  placement: string;
  status: string;
  items: Array<Record<string, unknown>>;
  audience?: Record<string, unknown>;
  priority: number;
  starts_at?: string | null;
  ends_at?: string | null;
}

export interface MobileControlConfig {
  campaigns: MobileCampaign[];
  featureFlags: MobileFeatureFlag[];
  widgetFeeds: WidgetFeed[];
  serverTime: string;
}

export type CampaignEventType = 'impression' | 'click' | 'dismiss' | 'conversion';

const DISMISSAL_PREFIX = '@edutu_mobile_campaign_dismissed:';
export const OPPORTUNITY_WIDGET_SNAPSHOT_KEY = '@edutu_opportunity_widget_snapshot:v1';
const OPPORTUNITY_WIDGET_ITEM_LIMIT = 8;
const MAX_WIDGET_TEXT_LENGTH = 80;
const EMPTY_MOBILE_CONTROL_CONFIG: MobileControlConfig = {
  campaigns: [],
  featureFlags: [],
  widgetFeeds: [],
  serverTime: new Date(0).toISOString(),
};
let hasLoggedMobileControlNetworkError = false;

function emptyMobileControlConfig(): MobileControlConfig {
  return { ...EMPTY_MOBILE_CONTROL_CONFIG, serverTime: new Date().toISOString() };
}

function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError && error.message === 'Network request failed';
}

export type OpportunityWidgetSnapshotSource = 'mobile-control' | 'opportunities-cache' | 'opportunities';

export interface OpportunityWidgetItem {
  id: string;
  title: string;
  organization: string;
  category?: string;
  deadline?: string | null;
  location?: string;
  match?: number;
  image?: string | null;
  deepLink: string;
}

export interface OpportunityWidgetSnapshot {
  schemaVersion: 1;
  kind: 'opportunity-widget';
  generatedAt: string;
  title: string;
  source: OpportunityWidgetSnapshotSource;
  itemCount: number;
  items: OpportunityWidgetItem[];
  emptyText: string;
}

interface BuildOpportunityWidgetSnapshotOptions {
  source: OpportunityWidgetSnapshotSource;
  title?: string;
  opportunities?: Opportunity[];
  feedItems?: Array<Record<string, unknown>>;
  userId?: string;
  now?: () => number;
}

interface SyncOpportunityWidgetSnapshotOptions {
  userId?: string;
  opportunities?: Opportunity[];
  now?: () => number;
  fetchConfig?: () => Promise<MobileControlConfig>;
  readCachedOpportunities?: (userId?: string) => Promise<Opportunity[]>;
  writeSnapshot?: (snapshot: OpportunityWidgetSnapshot) => Promise<void>;
}

export async function fetchMobileControlConfig(): Promise<MobileControlConfig> {
  try {
    const response = await fetch(`${getConfig().apiBaseUrl}/mobile-control/config`);
    if (!response.ok) {
      if (response.status === 400 || response.status === 404 || response.status === 500) {
        return emptyMobileControlConfig();
      }
      throw new Error(`Mobile control config failed with ${response.status}`);
    }

    const payload = await response.json().catch(() => null);
    hasLoggedMobileControlNetworkError = false;
    return normaliseMobileControlConfig(payload);
  } catch (error) {
    if (isNetworkError(error)) {
      if (__DEV__ && !hasLoggedMobileControlNetworkError) {
        console.warn('Mobile campaign config skipped: API is not reachable');
        hasLoggedMobileControlNetworkError = true;
      }
      return emptyMobileControlConfig();
    }
    throw error;
  }
}

function normaliseMobileControlConfig(payload: unknown): MobileControlConfig {
  if (!payload || typeof payload !== 'object') {
    return emptyMobileControlConfig();
  }

  const record = payload as Partial<MobileControlConfig>;
  return {
    campaigns: Array.isArray(record.campaigns) ? record.campaigns : [],
    featureFlags: Array.isArray(record.featureFlags) ? record.featureFlags : [],
    widgetFeeds: Array.isArray(record.widgetFeeds) ? record.widgetFeeds : [],
    serverTime: typeof record.serverTime === 'string' ? record.serverTime : new Date().toISOString(),
  };
}

function truncateWidgetText(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length <= MAX_WIDGET_TEXT_LENGTH) {
    return text;
  }

  return `${text.slice(0, MAX_WIDGET_TEXT_LENGTH - 3)}...`;
}

function numberOrUndefined(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isFeedActive(feed: WidgetFeed, now = Date.now()): boolean {
  if (feed.status !== 'active') return false;

  const startsAt = feed.starts_at ? Date.parse(feed.starts_at) : null;
  const endsAt = feed.ends_at ? Date.parse(feed.ends_at) : null;

  return (startsAt === null || startsAt <= now) && (endsAt === null || endsAt >= now);
}

function normaliseWidgetFeedItem(item: Record<string, unknown>): OpportunityWidgetItem | null {
  const id = stringOrNull(item.id ?? item.opportunityId ?? item.opportunity_id);
  const title = truncateWidgetText(item.title);
  const image = stringOrNull(item.image ?? item.imageUrl ?? item.image_url);

  if (!id || !title) {
    return null;
  }

  const widgetItem: OpportunityWidgetItem = {
    id,
    title,
    organization: truncateWidgetText(item.organization ?? item.provider) || 'Edutu',
    category: truncateWidgetText(item.category) || undefined,
    deadline: stringOrNull(item.deadline ?? item.close_date),
    location: truncateWidgetText(item.location) || undefined,
    match: numberOrUndefined(item.match ?? item.matchScore ?? item.match_score),
    deepLink: `edutu://opportunity/${encodeURIComponent(id)}`,
  };

  if (image) {
    widgetItem.image = image;
  }

  return widgetItem;
}

function normaliseOpportunityWidgetItem(opportunity: Opportunity): OpportunityWidgetItem | null {
  if (!opportunity.id || !opportunity.title) {
    return null;
  }

  const widgetItem: OpportunityWidgetItem = {
    id: opportunity.id,
    title: truncateWidgetText(opportunity.title),
    organization: truncateWidgetText(opportunity.organization) || 'Edutu',
    category: truncateWidgetText(opportunity.category) || undefined,
    deadline: opportunity.deadline ?? null,
    location: truncateWidgetText(opportunity.location) || undefined,
    match: numberOrUndefined(opportunity.match),
    deepLink: `edutu://opportunity/${encodeURIComponent(opportunity.id)}`,
  };

  if (opportunity.image) {
    widgetItem.image = opportunity.image;
  }

  return widgetItem;
}

function hashSeed(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function getDeadlineDays(deadline: string | null | undefined, now: number): number | null {
  if (!deadline) return null;

  const time = Date.parse(deadline);
  if (!Number.isFinite(time)) return null;

  return Math.ceil((time - now) / (1000 * 60 * 60 * 24));
}

function getDeadlinePriority(deadline: string | null | undefined, now: number): number {
  const days = getDeadlineDays(deadline, now);
  if (days === null) return 8;
  if (days < 0) return -120;
  if (days <= 1) return 40;
  if (days <= 7) return 30;
  if (days <= 30) return 18;
  return 6;
}

function getCategoryPriority(category?: string): number {
  const normalized = category?.toLowerCase() || '';
  if (normalized.includes('scholar')) return 7;
  if (normalized.includes('intern')) return 6;
  if (normalized.includes('fellow')) return 5;
  if (normalized.includes('grant')) return 4;
  if (normalized.includes('job')) return 3;
  return 0;
}

function rankWidgetItems(items: OpportunityWidgetItem[], userId: string | undefined, now: number): OpportunityWidgetItem[] {
  if (items.length <= 1) {
    return items;
  }

  const sixHourWindow = Math.floor(now / (6 * 60 * 60 * 1000));
  return [...items].sort((a, b) => {
    const aJitter = hashSeed(`${userId || 'guest'}:${sixHourWindow}:${a.id}`) % 7;
    const bJitter = hashSeed(`${userId || 'guest'}:${sixHourWindow}:${b.id}`) % 7;
    const aScore = (a.match ?? 0) + getDeadlinePriority(a.deadline, now) + getCategoryPriority(a.category) + aJitter;
    const bScore = (b.match ?? 0) + getDeadlinePriority(b.deadline, now) + getCategoryPriority(b.category) + bJitter;

    return bScore - aScore;
  });
}

function selectOpportunityWidgetFeed(configPayload: MobileControlConfig, now: number): WidgetFeed | null {
  return [...(configPayload.widgetFeeds || [])]
    .filter((feed) => feed.feed_type === 'opportunities' && isFeedActive(feed, now) && feed.items?.length)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0] ?? null;
}

export function buildOpportunityWidgetSnapshot(options: BuildOpportunityWidgetSnapshotOptions): OpportunityWidgetSnapshot {
  const nowValue = options.now?.() ?? Date.now();
  const generatedAt = new Date(nowValue).toISOString();
  const normalisedItems = (options.feedItems
    ? options.feedItems.map(normaliseWidgetFeedItem)
    : (options.opportunities || []).map(normaliseOpportunityWidgetItem))
    .filter((item): item is OpportunityWidgetItem => Boolean(item));
  const items = rankWidgetItems(normalisedItems, options.userId, nowValue).slice(0, OPPORTUNITY_WIDGET_ITEM_LIMIT);

  return {
    schemaVersion: 1,
    kind: 'opportunity-widget',
    generatedAt,
    title: truncateWidgetText(options.title) || 'Opportunities for you',
    source: options.source,
    itemCount: items.length,
    items,
    emptyText: 'No opportunities available right now.',
  };
}

async function persistOpportunityWidgetSnapshot(snapshot: OpportunityWidgetSnapshot): Promise<void> {
  await AsyncStorage.setItem(OPPORTUNITY_WIDGET_SNAPSHOT_KEY, JSON.stringify(snapshot));
}

export async function syncOpportunityWidgetSnapshot(
  options: SyncOpportunityWidgetSnapshotOptions = {},
): Promise<OpportunityWidgetSnapshot> {
  const nowValue = options.now?.() ?? Date.now();
  const writeSnapshot = options.writeSnapshot ?? persistOpportunityWidgetSnapshot;
  let snapshot: OpportunityWidgetSnapshot | null = null;

  try {
    const configPayload = await (options.fetchConfig ?? fetchMobileControlConfig)();
    const feed = selectOpportunityWidgetFeed(configPayload, nowValue);

    if (feed) {
      snapshot = buildOpportunityWidgetSnapshot({
        source: 'mobile-control',
        title: feed.title,
        feedItems: feed.items,
        userId: options.userId,
        now: () => nowValue,
      });
    }
  } catch {
    // Mobile control is best-effort; cached opportunities keep widgets useful offline.
  }

  if (!snapshot) {
    const opportunities = options.opportunities
      ?? await (options.readCachedOpportunities ?? getCachedOpportunitiesSnapshot)(options.userId);

    snapshot = buildOpportunityWidgetSnapshot({
      source: options.opportunities ? 'opportunities' : 'opportunities-cache',
      opportunities,
      userId: options.userId,
      now: () => nowValue,
    });
  }

  await writeSnapshot(snapshot);
  return snapshot;
}

export function isCampaignActive(campaign: MobileCampaign, now = Date.now()): boolean {
  if (campaign.status !== 'active') return false;

  const startsAt = campaign.starts_at ? Date.parse(campaign.starts_at) : null;
  const endsAt = campaign.ends_at ? Date.parse(campaign.ends_at) : null;

  return (startsAt === null || startsAt <= now) && (endsAt === null || endsAt >= now);
}

export function sortCampaigns(campaigns: MobileCampaign[]): MobileCampaign[] {
  return [...campaigns].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}

export function selectCampaign(campaigns: MobileCampaign[], placement: CampaignPlacement = 'global'): MobileCampaign | null {
  return sortCampaigns(campaigns).find((campaign) => (
    isCampaignActive(campaign) &&
    (campaign.placement === 'global' || campaign.placement === placement)
  )) ?? null;
}

export async function canShowCampaign(campaign: MobileCampaign): Promise<boolean> {
  if (campaign.frequency?.mode === 'everySession') return true;

  const stored = await AsyncStorage.getItem(`${DISMISSAL_PREFIX}${campaign.id}`);
  if (!stored) return true;

  const cooldownHours = Number(campaign.frequency?.cooldownHours ?? 0);
  if (cooldownHours <= 0) return false;

  const dismissedAt = Number(stored);
  return Number.isFinite(dismissedAt) && Date.now() - dismissedAt > cooldownHours * 60 * 60 * 1000;
}

export async function dismissCampaign(campaignId: string): Promise<void> {
  await AsyncStorage.setItem(`${DISMISSAL_PREFIX}${campaignId}`, String(Date.now()));
}

export async function recordCampaignEvent(
  campaignId: string,
  eventType: CampaignEventType,
  token?: string | null,
): Promise<void> {
  if (!token) return;

  await fetch(`${getConfig().apiBaseUrl}/mobile-control/events`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ campaignId, eventType }),
  }).catch(() => {
    // Analytics should not block the app UI.
  });
}
