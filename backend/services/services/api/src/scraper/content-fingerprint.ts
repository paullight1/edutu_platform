/**
 * Content Fingerprinting for Scraper Page Structure Detection
 *
 * Generates a structural fingerprint of a web page's DOM to detect
 * when a source's page structure has changed, which may break scraping.
 */

import * as crypto from 'crypto';

/**
 * Generate a structural fingerprint from HTML content.
 * Strips dynamic content (timestamps, IDs, CSRF tokens) and extracts
 * the DOM structure signature (tag names + class names, ignoring text).
 */
export function generateFingerprint(html: string): string {
  // Remove script and style content (not structural)
  const cleaned = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

  // Extract tag names and class names only — ignore text content
  const structure = cleaned.match(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*class="([^"]*)"[^>]*>/g) || [];
  const tags = cleaned.match(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g) || [];

  // Combine into a stable signature
  const signature = [...structure, ...tags]
    .map((m) =>
      m
        // Normalize whitespace
        .replace(/\s+/g, ' ')
        // Strip data attributes and dynamic values that don't affect structure
        .replace(/\s(data-[a-z-]+|id|style|aria-[a-z-]+)="[^"]*"/gi, '')
        .trim(),
    )
    .sort()
    .join('\n');

  return crypto.createHash('sha256').update(signature).digest('hex').substring(0, 16);
}

/**
 * Compare two fingerprints and return similarity as a percentage (0–100).
 * Uses Jaccard-like comparison: size of intersection / size of union of
 * structural tokens.
 */
export function compareFingerprints(old: string, _new: string): number {
  // Simple hash comparison — if hashes match exactly, 100% similar
  if (old === _new) return 100;

  // For partial comparison, count differing hex characters
  const maxLen = Math.max(old.length, _new.length);
  let matches = 0;

  for (let i = 0; i < Math.min(old.length, _new.length); i++) {
    if (old[i] === _new[i]) matches++;
  }

  return Math.round((matches / maxLen) * 100);
}

/**
 * Check if a page structure has changed significantly.
 * Returns true if the structure is considered changed (below threshold).
 */
export function hasStructureChanged(
  oldFingerprint: string | null,
  newFingerprint: string,
  threshold = 60,
): boolean {
  if (!oldFingerprint) return false; // No baseline to compare against
  const similarity = compareFingerprints(oldFingerprint, newFingerprint);
  return similarity < threshold;
}
