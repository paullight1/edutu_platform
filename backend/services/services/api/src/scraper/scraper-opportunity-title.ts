import * as cheerio from "cheerio";
import { ROUNDUP_TITLE_RE, SOURCE_BRAND_RE } from "./scraper.config";

const GENERIC_OPPORTUNITY_TITLE_RE =
  /^(?:(?:browse|find|discover|latest)\s+)?(?:(?:all|latest|new)\s+)?(?:scholarships?|internships?|fellowships?|grants?|opportunities|programs?|programmes?|jobs?|careers?)(?:\s+(?:and|&|or)\s+(?:(?:all|latest|new)\s+)?(?:scholarships?|internships?|fellowships?|grants?|opportunities|programs?|programmes?|jobs?|careers?))*$/i;

export function cleanOpportunityTitle(raw: string | null | undefined): string {
  if (!raw) return "";
  let title = String(raw).replace(/\s+/g, " ").trim();

  title = title
    .replace(/^(?:hot|new|urgent)\s*[:\-–—]\s*/i, "")
    .replace(/^apply\s+now\s*[:\-–—]\s*/i, "")
    .replace(
      /\s*[-–—|:]\s*(?:apply\s+(?:now|here|today)|applications?\s+(?:are\s+)?(?:now\s+)?open|register\s+now|read\s+more|check\s+details).*$/i,
      "",
    )
    .replace(/\s*\((?:apply\s+now|now\s+open|open|ongoing)\)\s*$/i, "")
    .replace(/\s*[-–—|]\s*(?:deadline|closing\s+date|closes)\b.*$/i, "");

  // Remove a trailing source-site or aggregator label from the title.
  title = title.replace(
    new RegExp(`\\s*[-–—|:]\\s*(?:${SOURCE_BRAND_RE.source})\\s*$`, "i"),
    "",
  );

  return title
    .replace(/^[\s\-–—|:]+/, "")
    .replace(/[\s\-–—|:]+$/, "")
    .slice(0, 200)
    .trim();
}

export function isGenericOpportunityTitle(
  title: string | null | undefined,
): boolean {
  return GENERIC_OPPORTUNITY_TITLE_RE.test((title ?? "").trim());
}

export function extractOpportunityPageTitle(html: string): string | null {
  if (!html) return null;
  const $ = cheerio.load(html);
  const candidates = [
    $("article h1").first().text(),
    $(".entry-title").first().text(),
    $("h1").first().text(),
    $('meta[property="og:title"]').attr("content"),
    $('meta[name="twitter:title"]').attr("content"),
    $("title").first().text(),
  ];

  for (const candidate of candidates) {
    const title = cleanOpportunityTitle(candidate);
    if (
      title.length >= 8 &&
      !isGenericOpportunityTitle(title) &&
      !ROUNDUP_TITLE_RE.test(title)
    ) {
      return title;
    }
  }
  return null;
}

export function selectOpportunityTitle(
  aiTitle: string | null | undefined,
  itemTitle: string,
  sourceHtml: string,
): string {
  const cleanedAiTitle = cleanOpportunityTitle(aiTitle);
  const cleanedItemTitle = cleanOpportunityTitle(itemTitle);
  if (cleanedAiTitle && !isGenericOpportunityTitle(cleanedAiTitle)) {
    return cleanedAiTitle;
  }
  if (isGenericOpportunityTitle(cleanedItemTitle)) {
    return extractOpportunityPageTitle(sourceHtml) || itemTitle;
  }
  return itemTitle;
}
