import { CATEGORY_PATTERNS } from "./scraper.config";

/**
 * Infer a display field-of-study from title text only. Descriptions mention
 * fields incidentally and are intentionally excluded from this signal.
 */
export function categorizeOpportunityTitle(title = ""): string | null {
  for (const [category, pattern] of CATEGORY_PATTERNS) {
    if (pattern.test(title)) return category;
  }

  return null;
}
