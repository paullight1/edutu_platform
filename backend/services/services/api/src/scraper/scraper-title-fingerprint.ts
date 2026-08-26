/**
 * Build the source-independent deduplication key used by the scraper.
 *
 * Keep this byte-for-byte reproducible by the SQL backfill migration:
 * lower(regexp_replace(btrim(title), '\s+', ' ', 'g')) || '|' ||
 * coalesce(close_date::text, '')
 */
export function createTitleFingerprint(
  title: string | null | undefined,
  closeDate: string | null,
): string {
  const normalizedTitle = (title ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return `${normalizedTitle}|${closeDate ?? ""}`;
}
