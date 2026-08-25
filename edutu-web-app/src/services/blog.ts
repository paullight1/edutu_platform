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
 * Fetch one published blog page (newest first). Public endpoint — no auth
 * required. Offset is explicit so the public archive can mirror the
 * server-rendered page boundaries after hydration.
 */
export async function fetchPublishedPosts(
  options: {
    limit?: number;
    offset?: number;
    category?: string;
    signal?: AbortSignal;
  } = {},
): Promise<BlogPost[]> {
  const params = new URLSearchParams();
  params.set("status", "published");
  params.set(
    "limit",
    String(Math.min(Math.max(Number(options.limit) || 50, 1), 100)),
  );

  const offset = Math.max(Math.floor(Number(options.offset) || 0), 0);
  if (offset > 0) {
    params.set("offset", String(offset));
  }
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

/**
 * Load the complete bounded public archive so React cannot replace a valid
 * server-rendered page with an arbitrary first-60-post client subset. The
 * backend caps each request at 100; this helper walks those pages and stops on
 * the first short response.
 */
export async function fetchAllPublishedPosts(
  options: {
    category?: string;
    signal?: AbortSignal;
    pageSize?: number;
    maximum?: number;
  } = {},
): Promise<BlogPost[]> {
  const pageSize = Math.min(
    Math.max(Math.floor(Number(options.pageSize) || 100), 1),
    100,
  );
  const maximum = Math.min(
    Math.max(Math.floor(Number(options.maximum) || 1000), 1),
    1000,
  );
  const posts = new Map<string, BlogPost>();

  for (let offset = 0; offset < maximum; offset += pageSize) {
    const limit = Math.min(pageSize, maximum - offset);
    const batch = await fetchPublishedPosts({
      category: options.category,
      signal: options.signal,
      limit,
      offset,
    });

    for (const post of batch) {
      if (post.id && !posts.has(post.id)) {
        posts.set(post.id, post);
      }
    }

    if (batch.length < limit) break;
  }

  return Array.from(posts.values()).slice(0, maximum);
}

/** Fetch a single published post by slug. Public endpoint. */
export async function fetchPostBySlug(
  slug: string,
  options: { signal?: AbortSignal } = {},
): Promise<BlogPost> {
  const response = await fetch(
    buildBlogUrl(`/blog/slug/${encodeURIComponent(slug)}`),
    {
      method: "GET",
      signal: options.signal,
      headers: { Accept: "application/json" },
    },
  );

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
