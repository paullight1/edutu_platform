/**
 * Decides whether an opportunity's `organization` is worth showing next to its
 * title.
 *
 * The scraper derives `organization` by cutting the title at a keyword
 * ("Scholarship", "Internship", "Programme"...), so at the time of writing 140
 * of 282 active rows store an org that is literally a prefix of their own
 * title — "Fully" from "Fully Funded Masters Scholarship...", "2027 RAVE" from
 * "2027 RAVE Scholarship in Germany". Rendering both puts the same words on
 * screen twice.
 *
 * Correct data trips this too: "Mastercard Foundation" is a real organisation,
 * and "Mastercard Foundation Scholarship Program at the University of Pretoria"
 * still repeats it. So this is a presentation rule, not a data-quality patch —
 * the org line only earns its space when it says something the title doesn't.
 */

/**
 * Lowercase, strip accents, drop punctuation *without* splitting words, and
 * collapse whitespace.
 *
 * Punctuation is deleted rather than replaced with a space so that an
 * initialism written with stops ("D.A.A.D.") collapses to the same token as the
 * bare form ("DAAD"), while "Product Hub Africa (PHA)" still yields clean
 * word boundaries.
 */
function normalise(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Strings that occupy the organization field without naming anyone.
 *
 * "the official organizer" is generated, not scraped: `cleanOpportunityText`
 * rewrites competitor/aggregator brand names to that phrase so they don't get
 * advertised. Inside a sentence it reads fine ("...offered by the official
 * organizer"); as a standalone field label it says nothing. 33 active rows
 * carry it, plus 22 more with the scraper's own "Program Organizer" filler.
 */
const PLACEHOLDER_ORGANIZATIONS = new Set([
  "the official organizer",
  "official organizer",
  "program organizer",
  "the organizer",
  "organizer",
  "organiser",
  "the official organiser",
  "program organiser",
  "n/a",
  "na",
  "unknown",
  "not specified",
  "not listed",
  "tbd",
]);

/** True when the org names no one — generated filler rather than a real body. */
export function isPlaceholderOrganization(
  organization: string | null | undefined,
): boolean {
  return PLACEHOLDER_ORGANIZATIONS.has(normalise(organization ?? ""));
}

/**
 * True when `organization` adds nothing the title doesn't already say, and so
 * should not be rendered alongside it.
 *
 * Matching is whole-token, never a raw substring: a two-letter org like "AI"
 * must not be swallowed by the "ai" inside "Trainee".
 */
export function isRedundantOrganization(
  organization: string | null | undefined,
  title: string | null | undefined,
): boolean {
  const org = normalise(organization ?? "");
  // Nothing to show is trivially not worth showing.
  if (!org) return true;

  const name = normalise(title ?? "");
  if (!name) return false;

  return (
    ` ${name} `.includes(` ${org} `) || ` ${org} `.includes(` ${name} `)
  );
}

/**
 * The organisation string to render beside a title, or `""` when it would only
 * repeat the title or name no one. Callers already omit empty strings.
 *
 * This is a *view* rule and deliberately not applied in the service mapper:
 * `Opportunity.organization` still feeds JSON-LD `hiringOrganization` /
 * `provider`, and those must keep whatever the source actually claimed.
 */
export function organizationLabel(
  organization: string | null | undefined,
  title: string | null | undefined,
): string {
  if (isPlaceholderOrganization(organization)) return "";
  if (isRedundantOrganization(organization, title)) return "";
  return (organization ?? "").trim();
}
