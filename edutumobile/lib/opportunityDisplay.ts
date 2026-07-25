/**
 * Display-layer helpers for opportunity content.
 *
 * Two jobs:
 *  1. Express fit as a TIER, never a raw percentage. A percentage reads as
 *     win-odds ("I have a 91% chance") which we cannot honestly claim — the
 *     score is a relevance ranking, not a prediction. See DESIGN.md §1/§4.
 *  2. Clean scraped strings before they reach a user: HTML entities and
 *     deadline fragments smuggled into the `location` column.
 */

export type MatchTier = 'strong' | 'solid' | 'possible' | 'stretch';

/**
 * i18n keys (in the `opps` namespace) for every tier. Consumers translate —
 * this module never returns English so the 9 locales stay in charge.
 */
export const MATCH_TIER_KEY: Record<
  MatchTier,
  { label: string; blurb: string }
> = {
  strong: { label: 'detail.fit.tiers.strong', blurb: 'detail.fit.tiers.strongBlurb' },
  solid: { label: 'detail.fit.tiers.solid', blurb: 'detail.fit.tiers.solidBlurb' },
  possible: { label: 'detail.fit.tiers.possible', blurb: 'detail.fit.tiers.possibleBlurb' },
  stretch: { label: 'detail.fit.tiers.stretch', blurb: 'detail.fit.tiers.stretchBlurb' },
};

/**
 * Bucket a raw match score into a tier. Returns null when there is no score at
 * all — an unranked opportunity must show nothing rather than "Stretch",
 * which would read as a judgement we never made.
 */
export function getMatchTier(match?: number | null): MatchTier | null {
  if (typeof match !== 'number' || !Number.isFinite(match) || match <= 0) {
    return null;
  }
  if (match >= 80) return 'strong';
  if (match >= 60) return 'solid';
  if (match >= 40) return 'possible';
  return 'stretch';
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  lt: '<',
  gt: '>',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
};

/**
 * Decode the HTML entities that survive scraping (`&#038;`, `&#8211;`, `&amp;`)
 * so titles and prose never render raw markup at the user.
 */
export function decodeHtmlEntities(text: string): string {
  if (!text) return '';
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) =>
      String.fromCodePoint(parseInt(dec, 10)),
    )
    .replace(/&([a-zA-Z]+);/g, (match, name: string) => NAMED_ENTITIES[name] ?? match);
}

/** Same, but tolerant of null/undefined columns. */
export function decodeMaybe(text?: string | null): string {
  return typeof text === 'string' ? decodeHtmlEntities(text) : '';
}

// Scrapers routinely fold whole label runs into the location cell, e.g.
// "Abuja Deadline: 3rd August", "Borno Duration: 6 months Deadline: 29th",
// "Abuja Work Mode: Full Time (8am to 4:30p". Each of these fields has (or
// deserves) its own slot, so strip the trailing fragment rather than showing
// it once, badly, inside the location line. Anchored to the tail and limited
// to a known label set so a legitimate place name is never truncated.
const TRAILING_LABEL_RE =
  /[\s,;|·–—-]*\(?\b(?:application\s+deadline|deadline|work\s*mode|job\s*type|employment\s*type|duration|salary|stipend)s?\b\s*[:\-–—]?.*$/i;

/**
 * Clean a scraped location string: decode entities, drop a trailing
 * "Deadline…" fragment, and collapse whitespace. Returns '' when nothing
 * usable is left so callers can fall back to their own copy.
 */
export function cleanLocation(location?: string | null): string {
  const decoded = decodeMaybe(location);
  if (!decoded) return '';
  const stripped = decoded.replace(TRAILING_LABEL_RE, '');
  const cleaned = stripped.replace(/\s+/g, ' ').replace(/[\s,;|·-]+$/, '').trim();
  // If the whole value was a deadline sentence, there is no location to show.
  return cleaned;
}

/**
 * Split a prose blob into paragraphs for progressive disclosure, and expose a
 * short preview so a collapsed section still shows its substance instead of a
 * bare accordion header.
 */
export function previewText(value: string, maxChars = 140): string {
  const flat = value.replace(/\s+/g, ' ').trim();
  if (flat.length <= maxChars) return flat;
  const cut = flat.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 60 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}
