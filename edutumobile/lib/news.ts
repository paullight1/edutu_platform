import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Trending news = published Edutu blog posts (the same feed the website's
 * /blog page renders). Fetched unauthenticated from the public product API,
 * cached for offline/failed loads, and linked out to the web article.
 */

export interface NewsPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  category: string;
  coverImage: string;
  publishedAt: string;
  /** Canonical web article the app links to. */
  url: string;
}

const NEWS_CACHE_KEY = 'edutu-news-cache-v1';
const NEWS_CACHE_TTL_MS = 30 * 60 * 1000;
const FETCH_TIMEOUT_MS = 12000;

export const EDUTU_BLOG_BASE_URL = 'https://edutu.org/blog';

function getApiBaseUrl(): string {
  return (process.env.EXPO_PUBLIC_API_URL || 'https://edutu-platform.onrender.com').replace(/\/$/, '');
}

function normalisePost(row: any): NewsPost | null {
  const slug = typeof row?.slug === 'string' ? row.slug.trim() : '';
  const title = typeof row?.title === 'string' ? row.title.trim() : '';
  if (!slug || !title) return null;
  return {
    id: String(row.id || slug),
    title,
    slug,
    excerpt: typeof row.excerpt === 'string' ? row.excerpt : '',
    category: typeof row.category === 'string' ? row.category : '',
    coverImage: typeof row.coverImage === 'string' ? row.coverImage : (row.cover_image || ''),
    publishedAt: row.publishedAt || row.published_at || '',
    url: `${EDUTU_BLOG_BASE_URL}/${encodeURIComponent(slug)}`,
  };
}

async function readCache(maxAgeMs: number): Promise<NewsPost[] | null> {
  try {
    const raw = await AsyncStorage.getItem(NEWS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { fetchedAt: number; posts: NewsPost[] };
    if (!Array.isArray(parsed.posts) || !parsed.posts.length) return null;
    if (Date.now() - parsed.fetchedAt > maxAgeMs) return null;
    return parsed.posts;
  } catch {
    return null;
  }
}

/**
 * Latest published posts, newest first. Serves a fresh-enough cache first,
 * falls back to a stale cache when the network fails, and returns [] only
 * when there is truly nothing to show.
 */
export async function fetchNewsPosts(limit = 6): Promise<NewsPost[]> {
  const cached = await readCache(NEWS_CACHE_TTL_MS);
  if (cached) return cached.slice(0, limit);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const response = await fetch(
      `${getApiBaseUrl()}/blog?status=published&limit=${limit}`,
      { headers: { Accept: 'application/json' }, signal: controller.signal },
    ).finally(() => clearTimeout(timeout));
    if (!response.ok) throw new Error(`blog fetch ${response.status}`);

    const body = await response.json();
    const rows: any[] = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : [];
    const posts = rows
      .map(normalisePost)
      .filter((post): post is NewsPost => Boolean(post));

    if (posts.length) {
      void AsyncStorage.setItem(
        NEWS_CACHE_KEY,
        JSON.stringify({ fetchedAt: Date.now(), posts }),
      ).catch(() => undefined);
    }
    return posts;
  } catch {
    // Stale cache beats an empty section when offline.
    return (await readCache(Number.MAX_SAFE_INTEGER)) ?? [];
  }
}
