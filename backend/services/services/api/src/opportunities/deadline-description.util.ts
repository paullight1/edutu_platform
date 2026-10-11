import {
  extractDeadlineText,
  hasConflictingDeadlines,
  parseDeadlineDetailed,
} from "./deadline.util";

const DEADLINE_CLAIM =
  /\b(?:deadline|closing date|closing deadline|applications?\s+(?:close|closes|closing)|nominations?\s+(?:close|closes|closing)|submissions?\s+(?:close|closes|closing)|apply\s+(?:before|by)|submit\s+(?:before|by))\b/i;

function toIsoDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value !== "string" || !value.trim()) return null;
  const isoDate = value.trim().match(/^(20\d{2}-\d{2}-\d{2})/);
  if (isoDate) return isoDate[1];
  return parseDeadlineDetailed(value.trim()).date;
}

/**
 * Remove deadline-bearing prose that contradicts the structured deadline.
 * This presentation safeguard leaves stored data untouched and keeps the
 * rest of the opportunity description intact.
 */
export function removeContradictoryDeadlineClaims(
  text: unknown,
  canonicalDeadline: unknown,
): unknown {
  if (typeof text !== "string" || !text.trim()) return text;

  const canonicalDate = toIsoDate(canonicalDeadline);
  if (!canonicalDate) return text;

  const sentences = text.match(/[^.!?]+(?:[.!?]+|$)/g);
  if (!sentences?.length) return text;

  const cleaned = sentences.filter((sentence) => {
    if (!DEADLINE_CLAIM.test(sentence)) return true;

    const evidence = extractDeadlineText(sentence);
    if (!evidence) return !hasConflictingDeadlines(sentence);

    const sentenceDate = toIsoDate(evidence);
    return !sentenceDate || sentenceDate === canonicalDate;
  });

  return cleaned
    .join("")
    .replace(/\s{2,}/g, " ")
    .trim();
}
