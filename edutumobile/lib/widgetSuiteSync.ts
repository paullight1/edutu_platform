import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import type { DeadlineItem } from '../packages/core/src/services/deadlines';
import { getDeadlineBadge } from '../packages/core/src/utils/deadline';
import {
  updateDeadlineWidgetTimeline,
  type DeadlineWidgetItem,
  type DeadlineWidgetProps,
  type DeadlineWidgetTimelineEntry,
} from '../widgets/DeadlineWidget';
import {
  updateTrendingWidgetTimeline,
  type TrendingWidgetItem,
  type TrendingWidgetProps,
  type TrendingWidgetTimelineEntry,
} from '../widgets/TrendingWidget';
import { updateChatWidget } from '../widgets/ChatWidget';
import {
  updateTrendingSpotlightWidgetTimeline,
  type TrendingPosterItem,
  type TrendingPosterProps,
} from '../widgets/TrendingSpotlightWidget';
import { updateTrendingGridWidgetTimeline } from '../widgets/TrendingGridWidget';
import { updateTrendingTickerWidgetTimeline } from '../widgets/TrendingTickerWidget';
import { updateTrendingThumbListWidgetTimeline } from '../widgets/TrendingThumbListWidget';
import { getConfig } from './config';
import {
  syncAndUpdateOpportunityWidgetSnapshot,
  urgencyTone,
} from './opportunityWidgetSync';
import { updateOpportunityWidgetTimeline } from '../widgets/OpportunityWidget';
import { getWidgetImageUri } from './widgetImageCache';
import { getWidgetLogoUri } from './widgetLogo';

/**
 * One entry point that refreshes the whole home-screen widget suite:
 *   - Top Matches (personalised opportunities — existing pipeline)
 *   - Deadlines   (the user's applied + saved deadlines, calendar-style)
 *   - Trending    (what's hot on Edutu, from the public feed)
 *   - Ask Edutu   (chat launcher; static apart from the rotating prompt)
 *
 * Everything is best-effort and independent: one widget failing to sync never
 * blocks the others, and nothing here may block app startup.
 */

const ANDROID_DEADLINES_FILE = 'edutu_widget_deadlines.json';
const ANDROID_TRENDING_FILE = 'edutu_widget_trending.json';
const ANDROID_NEWS_FILE = 'edutu_widget_news.json';
const DEADLINES_CACHE_KEY = 'edutu-widget-deadlines-cache-v1';

// Matches the opportunity widget: enough midnights that every relative label
// ("Closes today" … "14 days left") ticks over before the next sync.
const TIMELINE_DAYS = 14;

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const CHAT_PROMPTS = [
  'Ask me anything…',
  'Which scholarships fit me?',
  'Help me plan an application',
  'What should I do this week?',
  'Find internships near me',
];

/** Remove personalized widget state before a different account uses the device. */
export async function clearWidgetSuiteData(): Promise<void> {
  await Promise.all([
    AsyncStorage.removeItem(DEADLINES_CACHE_KEY),
    AsyncStorage.removeItem('@edutu_opportunity_widget_snapshot:v1'),
  ]);
  try {
    if (Platform.OS === 'android') {
      const { File, Paths } = require('expo-file-system') as typeof import('expo-file-system');
      for (const fileName of [ANDROID_DEADLINES_FILE, ANDROID_TRENDING_FILE, ANDROID_NEWS_FILE]) {
        const file = new File(Paths.document, fileName);
        if (file.exists) file.delete();
      }
    }
  } catch {
    // Best effort; the next timeline refresh replaces stale data.
  }
  updateOpportunityWidgetTimeline([]);
  updateDeadlineWidgetTimeline([]);
  updateTrendingWidgetTimeline([]);
  updateTrendingSpotlightWidgetTimeline([]);
  updateTrendingGridWidgetTimeline([]);
  updateTrendingTickerWidgetTimeline([]);
  updateTrendingThumbListWidgetTimeline([]);
}

function formatCountdown(deadline?: string | null, now?: Date): string {
  const badge = getDeadlineBadge(deadline, now);
  if (badge.level === 'none') return 'Open now';
  if (badge.level === 'normal' && badge.date) return badge.date;
  return badge.label;
}

/** "22" / "May" pieces for the calendar rail; empty when the deadline isn't a date. */
function dateRailParts(deadline?: string | null): { dateDay: string; dateMonth: string } {
  if (!deadline) return { dateDay: '', dateMonth: '' };
  const parsed = new Date(deadline);
  if (Number.isNaN(parsed.getTime())) return { dateDay: '', dateMonth: '' };
  return { dateDay: String(parsed.getDate()), dateMonth: MONTHS_SHORT[parsed.getMonth()] };
}

/**
 * Persist a widget data file where the native Android providers read it
 * (app documents dir = filesDir). Same {syncedAt, items} envelope as the
 * opportunity widget so every provider shares the staleness rules.
 */
function writeAndroidWidgetFile(fileName: string, items: unknown[]): void {
  if (Platform.OS !== 'android') return;
  try {
    const { File, Paths } =
      require('expo-file-system') as typeof import('expo-file-system');
    const file = new File(Paths.document, fileName);
    if (file.exists) {
      file.delete();
    }
    file.create();
    file.write(JSON.stringify({ syncedAt: Date.now(), items }));
  } catch {
    // Best effort — the native widget falls back to its own cache/fetch.
  }
}

// ---------------------------------------------------------------------------
// Deadlines widget
// ---------------------------------------------------------------------------

export interface SyncDeadlineWidgetOptions {
  userId?: string;
  getToken?: () => Promise<string | null>;
  /** Injectable for tests / callers that already have the data. */
  fetchDeadlines?: () => Promise<DeadlineItem[]>;
  logoUri?: string;
  now?: Date;
}

async function loadDeadlines(options: SyncDeadlineWidgetOptions): Promise<DeadlineItem[]> {
  if (options.fetchDeadlines) {
    return options.fetchDeadlines();
  }

  if (options.userId) {
    try {
      // Lazily required: pulls in supabase + the product API client, neither of
      // which should load (or crash) in headless/background contexts.
      const { fetchOpportunityDeadlines } =
        require('../packages/core/src/services/deadlines') as typeof import('../packages/core/src/services/deadlines');
      const { supabase } = require('./supabase') as typeof import('./supabase');
      const fresh = await fetchOpportunityDeadlines(supabase, options.userId, options.getToken);
      await AsyncStorage.setItem(DEADLINES_CACHE_KEY, JSON.stringify(fresh)).catch(() => undefined);
      return fresh;
    } catch {
      // fall through to cache
    }
  }

  // Headless (background task) or fetch failure: reuse the last synced list —
  // deadline labels still recompute correctly from raw dates.
  try {
    const cached = await AsyncStorage.getItem(DEADLINES_CACHE_KEY);
    const parsed = cached ? JSON.parse(cached) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mapDeadlineItem(item: DeadlineItem, now?: Date): DeadlineWidgetItem {
  const badge = getDeadlineBadge(item.deadline, now);
  return {
    title: item.title,
    organization: item.organization || 'Edutu',
    deadline: formatCountdown(item.deadline, now),
    ...dateRailParts(item.deadline),
    tone: urgencyTone(badge.level),
    daysLeft: badge.daysLeft,
    kind: item.type === 'applied' ? 'applied' : 'saved',
    deepLink: item.opportunityId
      ? `edutu://opportunity/${encodeURIComponent(item.opportunityId)}`
      : 'edutu://deadlines',
  };
}

export function getDeadlineWidgetProps(
  deadlines: DeadlineItem[],
  now: Date = new Date(),
  extras: { logoUri?: string } = {},
): DeadlineWidgetProps {
  const upcoming = deadlines
    .filter((item) => Boolean(item.title))
    .filter((item) => getDeadlineBadge(item.deadline, now).level !== 'expired')
    .slice(0, 6)
    .map((item) => mapDeadlineItem(item, now));

  return {
    items: upcoming,
    logoUri: extras.logoUri,
    emptyText: 'No deadlines yet',
  };
}

export function getDeadlineWidgetTimeline(
  deadlines: DeadlineItem[],
  now: Date = new Date(),
  extras: { logoUri?: string } = {},
): DeadlineWidgetTimelineEntry[] {
  const entries: DeadlineWidgetTimelineEntry[] = [
    { date: now, props: getDeadlineWidgetProps(deadlines, now, extras) },
  ];
  const hasDated = deadlines.some((item) => getDeadlineBadge(item.deadline, now).daysLeft !== null);
  if (!hasDated) return entries;

  for (let day = 1; day <= TIMELINE_DAYS; day += 1) {
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + day);
    entries.push({ date: midnight, props: getDeadlineWidgetProps(deadlines, midnight, extras) });
  }
  return entries;
}

export async function syncDeadlineWidget(options: SyncDeadlineWidgetOptions = {}): Promise<void> {
  try {
    const deadlines = await loadDeadlines(options);
    const now = options.now ?? new Date();

    writeAndroidWidgetFile(
      ANDROID_DEADLINES_FILE,
      deadlines
        .filter((item) => Boolean(item.title))
        .slice(0, 8)
        .map((item) => ({
          title: item.title,
          organization: item.organization || 'Edutu',
          deadline: item.deadline || '',
          kind: item.type === 'applied' ? 'applied' : 'saved',
          opportunityId: item.opportunityId || '',
        })),
    );
    updateDeadlineWidgetTimeline(getDeadlineWidgetTimeline(deadlines, now, { logoUri: options.logoUri }));
  } catch {
    // Best effort.
  }
}

// ---------------------------------------------------------------------------
// Trending widget
// ---------------------------------------------------------------------------

export interface TrendingSourceItem {
  id: string;
  title: string;
  organization?: string;
  category?: string;
  deadline?: string | null;
  /** Poster/background image for the image-led trending widgets. */
  imageUrl?: string | null;
}

export interface SyncTrendingWidgetOptions {
  /** Injectable for tests. */
  fetchTrending?: () => Promise<TrendingSourceItem[]>;
  logoUri?: string;
  now?: Date;
}

function pickRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    for (const key of ['data', 'items', 'opportunities']) {
      if (Array.isArray(record[key])) return record[key] as unknown[];
    }
  }
  return [];
}

async function defaultFetchTrending(): Promise<TrendingSourceItem[]> {
  const response = await fetch(`${getConfig().apiBaseUrl}/opportunities?limit=12&status=active`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) return [];
  const payload = await response.json().catch(() => null);

  return pickRows(payload)
    .map((row): TrendingSourceItem | null => {
      const record = (row ?? {}) as Record<string, unknown>;
      const id = String(record.id ?? record.opportunityId ?? record.opportunity_id ?? '');
      const title = typeof record.title === 'string' ? record.title.trim() : '';
      if (!id || !title) return null;
      const imageUrl =
        typeof record.imageUrl === 'string'
          ? record.imageUrl
          : typeof record.image_url === 'string'
            ? record.image_url
            : typeof record.image === 'string'
              ? record.image
              : null;

      return {
        id,
        title,
        organization:
          typeof record.organization === 'string' ? record.organization : String(record.provider ?? ''),
        category: typeof record.category === 'string' ? record.category : '',
        deadline:
          typeof record.deadline === 'string'
            ? record.deadline
            : typeof record.close_date === 'string'
              ? record.close_date
              : null,
        imageUrl,
      };
    })
    .filter((item): item is TrendingSourceItem => Boolean(item));
}

function mapTrendingItem(item: TrendingSourceItem, now?: Date): TrendingWidgetItem {
  const badge = getDeadlineBadge(item.deadline, now);
  return {
    title: item.title,
    organization: item.organization || 'Edutu',
    category: item.category || 'Opportunity',
    deadline: formatCountdown(item.deadline, now),
    tone: urgencyTone(badge.level),
    deepLink: `edutu://opportunity/${encodeURIComponent(item.id)}`,
  };
}

export function getTrendingWidgetProps(
  rows: TrendingSourceItem[],
  now: Date = new Date(),
  extras: { logoUri?: string } = {},
): TrendingWidgetProps {
  const items = rows
    .filter((item) => getDeadlineBadge(item.deadline, now).level !== 'expired')
    .slice(0, 6)
    .map((item) => mapTrendingItem(item, now));
  return { items, logoUri: extras.logoUri };
}

export function getTrendingWidgetTimeline(
  rows: TrendingSourceItem[],
  now: Date = new Date(),
  extras: { logoUri?: string } = {},
): TrendingWidgetTimelineEntry[] {
  const entries: TrendingWidgetTimelineEntry[] = [
    { date: now, props: getTrendingWidgetProps(rows, now, extras) },
  ];
  const hasDated = rows.some((item) => getDeadlineBadge(item.deadline, now).daysLeft !== null);
  if (!hasDated) return entries;

  for (let day = 1; day <= TIMELINE_DAYS; day += 1) {
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + day);
    entries.push({ date: midnight, props: getTrendingWidgetProps(rows, midnight, extras) });
  }
  return entries;
}

export async function syncTrendingWidget(options: SyncTrendingWidgetOptions = {}): Promise<void> {
  try {
    const rows = await (options.fetchTrending ?? defaultFetchTrending)();
    if (!rows.length) return; // keep whatever the widget last showed
    const now = options.now ?? new Date();

    writeAndroidWidgetFile(
      ANDROID_TRENDING_FILE,
      rows.slice(0, 8).map((item) => ({
        id: item.id,
        title: item.title,
        organization: item.organization || 'Edutu',
        category: item.category || '',
        deadline: item.deadline || '',
        imageUrl: item.imageUrl || '',
      })),
    );
    updateTrendingWidgetTimeline(getTrendingWidgetTimeline(rows, now, { logoUri: options.logoUri }));

    // Image-led trending widgets (Spotlight + Grid). No-ops on Android (native
    // ViewFlipper providers own them); on iOS this downloads poster photos into
    // the widget shared container and pushes their timelines.
    await syncTrendingImageWidgets(rows, now, options.logoUri);
  } catch {
    // Best effort.
  }
}

// The single-hero photo widgets (Spotlight, Ticker) can't flip on-device the way
// the Android ViewFlipper does, so we fake rotation through the WidgetKit
// timeline: a fresh entry every few hours promotes the next opportunity to hero.
const HERO_ROTATE_STEP_MS = 3 * 60 * 60 * 1000; // 3 hours
const HERO_ROTATE_STEPS = 16; // ~2 days of rotation before the next app sync

/**
 * Drive the iOS photo trending widgets. Poster images are downloaded once, then
 * reused across every timeline entry so deadline labels recompute (and the hero
 * rotates) without re-fetching the images.
 */
async function syncTrendingImageWidgets(
  rows: TrendingSourceItem[],
  now: Date,
  logoUri?: string,
): Promise<void> {
  if (Platform.OS !== 'ios') return; // Android uses the native providers.

  const top = rows.slice(0, 6);
  const base = await Promise.all(
    top.map(async (row, index) => ({
      row,
      imageUri: await getWidgetImageUri(row.imageUrl, `trend-${index}`),
    })),
  );
  if (!base.length) return;

  const toItem = (entry: (typeof base)[number], date: Date): TrendingPosterItem => ({
    title: entry.row.title,
    category: entry.row.category || 'Trending',
    organization: entry.row.organization || 'Edutu',
    deadline: formatCountdown(entry.row.deadline, date),
    tone: urgencyTone(getDeadlineBadge(entry.row.deadline, date).level),
    deepLink: `edutu://opportunity/${encodeURIComponent(entry.row.id)}`,
    imageUri: entry.imageUri,
  });

  const hasDated = top.some((row) => getDeadlineBadge(row.deadline, now).daysLeft !== null);

  // Grid + Thumbnail list keep a stable order; only countdown labels change, so a
  // present entry plus one per midnight (when any deadline is dated) is enough.
  const listEntries = [{ date: now, props: { logoUri, items: base.map((e) => toItem(e, now)) } }];
  if (hasDated) {
    for (let day = 1; day <= TIMELINE_DAYS; day += 1) {
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + day);
      listEntries.push({ date: midnight, props: { logoUri, items: base.map((e) => toItem(e, midnight)) } });
    }
  }

  // Spotlight + Ticker rotate the hero every few hours: entry i promotes item
  // (i % count) to the front so it renders as the poster hero.
  const heroEntries: { date: Date; props: TrendingPosterProps }[] = [];
  for (let step = 0; step < HERO_ROTATE_STEPS; step += 1) {
    const date = step === 0 ? now : new Date(now.getTime() + step * HERO_ROTATE_STEP_MS);
    const heroIndex = step % base.length;
    const rotated = [...base.slice(heroIndex), ...base.slice(0, heroIndex)];
    heroEntries.push({ date, props: { logoUri, items: rotated.map((e) => toItem(e, date)) } });
  }

  updateTrendingSpotlightWidgetTimeline(heroEntries);
  updateTrendingTickerWidgetTimeline(heroEntries);
  updateTrendingGridWidgetTimeline(listEntries);
  updateTrendingThumbListWidgetTimeline(listEntries);
}

// ---------------------------------------------------------------------------
// Chat widget
// ---------------------------------------------------------------------------

export function getChatPrompt(now: Date = new Date()): string {
  const dayOfYear = Math.floor(
    (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000,
  );
  return CHAT_PROMPTS[dayOfYear % CHAT_PROMPTS.length];
}

export function syncChatWidget(extras: { logoUri?: string; now?: Date } = {}): void {
  try {
    updateChatWidget({ prompt: getChatPrompt(extras.now), logoUri: extras.logoUri });
  } catch {
    // Best effort.
  }
}

// ---------------------------------------------------------------------------
// News widget (published blog posts — trending global-opportunity news)
// ---------------------------------------------------------------------------

export async function syncNewsWidget(): Promise<void> {
  try {
    // Lazily required so widget sync never adds to app-startup cost.
    const { fetchNewsPosts } = require('./news') as typeof import('./news');
    const posts = await fetchNewsPosts(6);
    if (!posts.length) return; // keep whatever the widget last showed

    writeAndroidWidgetFile(
      ANDROID_NEWS_FILE,
      posts.map((post) => ({
        id: post.id,
        title: post.title,
        category: post.category || 'News',
        excerpt: post.excerpt || '',
        imageUrl: post.coverImage || '',
        publishedAt: post.publishedAt || '',
        url: post.url,
      })),
    );
  } catch {
    // Best effort.
  }
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

export interface SyncWidgetSuiteOptions {
  userId?: string;
  getToken?: () => Promise<string | null>;
}

export async function syncWidgetSuite(options: SyncWidgetSuiteOptions = {}): Promise<void> {
  const logoUri = await getWidgetLogoUri();
  await Promise.all([
    syncAndUpdateOpportunityWidgetSnapshot({ userId: options.userId, logoUri }).catch(() => undefined),
    syncDeadlineWidget({ userId: options.userId, getToken: options.getToken, logoUri }),
    syncTrendingWidget({ logoUri }),
    syncNewsWidget(),
    Promise.resolve(syncChatWidget({ logoUri })),
  ]);
}
