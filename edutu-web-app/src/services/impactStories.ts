import { getApiBaseUrl } from "../lib/apiBaseUrl";
import {
  STORIES as SEED_STORIES,
  type Story,
} from "../lib/edutuForYouStories";

/**
 * Edutu For You impact stories, served from `GET /impact-stories`.
 *
 * The backend row is the source of truth and is editable in the admin panel.
 * The nine stories bundled in `edutuForYouStories.ts` are the same rows the
 * migration seeds, kept in the bundle purely as a fallback: an impact page
 * that renders an empty stories section because the API blipped is worse than
 * one showing the seeded set, and this route is a marketing page where a stale
 * story costs nothing.
 *
 * Consequence to remember: if an admin *deletes* every story, the page falls
 * back to the seeds rather than showing nothing. That is deliberate.
 */

/** Wire shape — mirrors the Drizzle row, camelCased by the API. */
interface ImpactStoryRow {
  id: string;
  slug: string;
  name: string;
  age: number | null;
  place: string;
  outcome: string;
  portrait: string;
  portraitAlt: string;
  heroImage: string;
  heroAlt: string;
  quote: string;
  teaser: string;
  chapters: Story["chapters"] | null;
  stats: Story["stats"] | null;
  barrier: string | null;
  isComposite: boolean;
  status: string;
  sortOrder: number;
}

function toStory(row: ImpactStoryRow): Story {
  return {
    slug: row.slug,
    name: row.name,
    age: row.age ?? 0,
    place: row.place,
    outcome: row.outcome,
    portrait: row.portrait,
    portraitAlt: row.portraitAlt,
    heroImage: row.heroImage,
    heroAlt: row.heroAlt,
    quote: row.quote,
    teaser: row.teaser,
    chapters: row.chapters ?? [],
    stats: row.stats ?? [],
    barrier: row.barrier ?? "",
    isComposite: row.isComposite,
  };
}

/**
 * Published stories, newest admin ordering first. Never rejects — a failed
 * fetch resolves to the bundled seeds so the caller has no error branch.
 */
export async function fetchImpactStories(
  signal?: AbortSignal,
): Promise<Story[]> {
  try {
    const base = getApiBaseUrl("Impact stories API");
    const response = await fetch(`${base}/impact-stories`, { signal });
    if (!response.ok) return SEED_STORIES;

    const rows = (await response.json()) as ImpactStoryRow[];
    if (!Array.isArray(rows) || rows.length === 0) return SEED_STORIES;

    return rows.map(toStory);
  } catch {
    return SEED_STORIES;
  }
}

/**
 * One story by slug. Falls back to the bundled seed of the same slug, and
 * returns null only when the slug is unknown to both.
 */
export async function fetchImpactStory(
  slug: string,
  signal?: AbortSignal,
): Promise<Story | null> {
  const seed = SEED_STORIES.find((story) => story.slug === slug) ?? null;

  try {
    const base = getApiBaseUrl("Impact stories API");
    const response = await fetch(
      `${base}/impact-stories/${encodeURIComponent(slug)}`,
      { signal },
    );
    if (!response.ok) return seed;

    return toStory((await response.json()) as ImpactStoryRow);
  } catch {
    return seed;
  }
}
