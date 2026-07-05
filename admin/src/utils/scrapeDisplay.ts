// Display helpers for the live scrape-progress UI.
//
// The scraper stores source names as raw slugs, URLs, or free text
// (e.g. "scholarships-in-uk", "Training-and-conferences/",
// "https://www.opportunitiesforafricans.com/category/scholarships/",
// "CALL FOR APPLICATIONS"). These read as a jumble in the progress panel,
// so we normalise them to friendly labels for DISPLAY ONLY — the raw value
// is still what the SSE stream matches against.

import type { ScrapeSourceStatus } from '../types/scraper';

// Short words that stay lowercase in the middle of a title.
const LOWER_WORDS = new Set([
    'a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'of', 'on',
    'or', 'the', 'to', 'via', 'with',
]);

// Tokens that should render fully upper-cased (country codes, common acronyms).
const UPPER_WORDS = new Set([
    'uk', 'us', 'usa', 'uae', 'eu', 'un', 'ai', 'it', 'ict', 'stem', 'phd',
    'mba', 'ngo', 'api', 'faq',
]);

function titleCaseToken(token: string, isFirst: boolean): string {
    const lower = token.toLowerCase();
    if (UPPER_WORDS.has(lower)) return lower.toUpperCase();
    if (!isFirst && LOWER_WORDS.has(lower)) return lower;
    return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Turn a raw scrape-source identifier into a readable label.
 * Never used as a key — purely cosmetic.
 */
export function prettifySourceName(raw: string): string {
    if (!raw) return 'Unknown source';
    let value = raw.trim();

    // URLs → hostname + last meaningful path segment.
    if (/^https?:\/\//i.test(value) || /^www\./i.test(value)) {
        try {
            const url = new URL(value.startsWith('http') ? value : `https://${value}`);
            const host = url.hostname.replace(/^www\./i, '');
            const segments = url.pathname.split('/').filter(Boolean);
            const lastSegment = segments[segments.length - 1] || '';
            const label = lastSegment ? `${host} · ${lastSegment}` : host;
            value = label;
        } catch {
            // fall through to generic cleanup
        }
    }

    // Generic cleanup: drop trailing slashes, split on separators, collapse space.
    const words = value
        .replace(/^\/+|\/+$/g, '')
        .replace(/[-_/.]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .filter(Boolean);

    if (words.length === 0) return raw;

    return words.map((word, i) => titleCaseToken(word, i === 0)).join(' ');
}

/** Human label for a per-source status pill. */
export function sourceStatusLabel(status: ScrapeSourceStatus): string {
    switch (status) {
        case 'scraping': return 'Scraping…';
        case 'completed': return 'Done';
        case 'failed': return 'Failed';
        case 'pending':
        default: return 'Queued';
    }
}
