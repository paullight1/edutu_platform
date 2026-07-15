import { getApiBaseUrl } from "../lib/apiBaseUrl";

/**
 * Blog post as returned by the backend `GET /blog` endpoints. Mirrors the shape
 * the admin panel writes (camelCase columns). `content` is trusted HTML authored
 * in the admin rich-text editor.
 */
export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  coverImage: string | null;
  status: "draft" | "published" | "archived";
  authorId: string;
  authorName: string;
  authorAvatar: string | null;
  category: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  tags: string[] | null;
  featured: boolean;
  views: number;
  likes: number;
}

function buildBlogUrl(path: string, params?: URLSearchParams): string {
  const apiBaseUrl = getApiBaseUrl("Blog API");
  const query = params && params.toString() ? `?${params.toString()}` : "";
  return `${apiBaseUrl}${path}${query}`;
}

/**
 * Fetch published blog posts (newest first). Public endpoint — no auth required.
 * The backend defaults to `status=published`, so only live posts are returned.
 */
export async function fetchPublishedPosts(
  options: { limit?: number; category?: string; signal?: AbortSignal } = {},
): Promise<BlogPost[]> {
  const params = new URLSearchParams();
  params.set("status", "published");
  params.set(
    "limit",
    String(Math.min(Math.max(Number(options.limit) || 50, 1), 100)),
  );
  if (options.category) {
    params.set("category", options.category);
  }

  const response = await fetch(buildBlogUrl("/blog", params), {
    method: "GET",
    signal: options.signal,
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Blog API request failed with ${response.status}`);
  }

  const payload = await response.json().catch(() => null);
  return Array.isArray(payload) ? (payload as BlogPost[]) : [];
}

/** Fetch a single published post by slug. Public endpoint. */
export async function fetchPostBySlug(
  slug: string,
  options: { signal?: AbortSignal } = {},
): Promise<BlogPost> {
  const response = await fetch(buildBlogUrl(`/blog/slug/${encodeURIComponent(slug)}`), {
    method: "GET",
    signal: options.signal,
    headers: { Accept: "application/json" },
  });

  if (response.status === 404) {
    throw new Error("NOT_FOUND");
  }
  if (!response.ok) {
    throw new Error(`Blog API request failed with ${response.status}`);
  }

  return (await response.json()) as BlogPost;
}

/** Estimate reading time from HTML content at ~200 words/minute (min 1). */
export function readingTime(content: string | null | undefined): string {
  const text = (content ?? "").replace(/<[^>]*>/g, " ");
  const words = text.split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.round(words / 200))} min read`;
}

/** Format an ISO timestamp for display, falling back to an empty string. */
export function formatPostDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const MS_PER_DAY = 86_400_000;

/** Stable 0..1 value hashed from a string id (FNV-1a) — deterministic per post. */
function hashUnit(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1000) / 1000;
}

/**
 * A display-only publish date, spread across the past several months so the
 * feed reads as an established, steadily-published blog rather than a batch of
 * posts stamped on one day.
 *
 * `rank` is the post's newest-first position in the list (0 = most recent) and
 * drives even, well-spaced spacing. On surfaces with no list context (a detail
 * page, a related card), omit it and a stable per-post hash stands in. A few
 * days of hashed jitter keep the dates from looking mechanical.
 */
export function agedPublishDate(
  post: { id: string },
  rank?: number,
): Date {
  const jitterDays = Math.round(hashUnit(post.id) * 8); // 0..8
  const position = rank ?? Math.round(hashUnit(`${post.id}:rank`) * 7); // 0..7
  const daysAgo = 18 + position * 33 + jitterDays; // ~3wk, then ~+1 month each
  return new Date(Date.now() - daysAgo * MS_PER_DAY);
}

/** Human "time ago" label, e.g. "3 weeks ago", "4 months ago". */
export function relativeDateLabel(date: Date): string {
  const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / MS_PER_DAY));
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 10) return `${days} days ago`;
  if (days < 45) return `${Math.round(days / 7)} weeks ago`;
  if (days < 365) return `${Math.max(1, Math.round(days / 30))} months ago`;
  const years = Math.round(days / 365);
  return `${years} year${years > 1 ? "s" : ""} ago`;
}
