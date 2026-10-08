import * as cheerio from "cheerio";

/** Restrict facts to the article, excluding other opportunities and site chrome. */
export function articleText(html: string, selector?: string): string {
  const $ = cheerio.load(html);
  const published = $(
    "meta[property='article:published_time'], meta[itemprop='datePublished']",
  )
    .first()
    .attr("content");
  const publishedDate = published?.match(/^20\d{2}-\d{2}-\d{2}/)?.[0];
  const heading = $("h1")
    .first()
    .text()
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const jobDeadlines: string[] = [];
  for (const script of $("script[type='application/ld+json']").toArray()) {
    try {
      const data = JSON.parse($(script).html() || "null");
      const nodes = Array.isArray(data)
        ? data
        : Array.isArray(data?.["@graph"])
          ? data["@graph"]
          : [data];
      for (const node of nodes) {
        const types = Array.isArray(node?.["@type"])
          ? node["@type"]
          : [node?.["@type"]];
        const name = String(node?.title || node?.name || "")
          .trim()
          .toLowerCase();
        const date =
          typeof node?.validThrough === "string"
            ? node.validThrough.match(/^20\d{2}-\d{2}-\d{2}/)?.[0]
            : null;
        if (
          types.includes("JobPosting") &&
          date &&
          name &&
          heading &&
          (name.includes(heading) || heading.includes(name))
        )
          jobDeadlines.push(date);
      }
    } catch {
      /* Invalid page metadata is not deadline evidence. */
    }
  }
  const structuredDeadline =
    new Set(jobDeadlines).size === 1 ? jobDeadlines[0] : null;

  $(
    "script, style, noscript, nav, footer, aside, iframe, .related, .related-posts, [class*=related], .comments, .newsletter, .sidebar, .share, .social, [class*=advert]",
  ).remove();
  const selectors = selector
    ? [selector]
    : [
        ".entry-content",
        ".post-content",
        "[itemprop=articleBody]",
        "article",
        "main",
        "body",
      ];
  for (const candidate of selectors) {
    const root = $(candidate).first();
    const blocks = root
      .find("h1,h2,h3,h4,p,li,blockquote,th,td,time,label")
      .toArray()
      .map((el) => $(el).text().replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const text =
      [...new Set(blocks)].join("\n") ||
      root.text().replace(/\s+/g, " ").trim();
    if (text.length >= 80) {
      const title = $("article h1, main h1, h1.entry-title")
        .first()
        .text()
        .replace(/\s+/g, " ")
        .trim();
      const body =
        title && !text.startsWith(title) ? `${title}\n${text}` : text;
      return [
        body,
        structuredDeadline
          ? `Application deadline: ${structuredDeadline} (JobPosting validThrough)`
          : "",
        publishedDate ? `Published: ${publishedDate}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    }
  }
  return "";
}

export function opportunityUrlIdentity(value: string): string {
  try {
    const url = new URL(value.trim());
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$)/i.test(key))
        url.searchParams.delete(key);
    }
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString().replace(/\/$/, "");
  } catch {
    return value.trim();
  }
}

/** Keep closing-date sections even when they occur beyond the page introduction. */
export function deadlineExcerpt(text: string, maxChars = 12000): string {
  if (text.length <= maxChars) return text;
  const matches = [
    ...text.matchAll(
      /deadline|closing|nominations?|applications? must|no later than|open until filled|rolling/gi,
    ),
  ];
  if (!matches.length)
    return text.slice(0, maxChars / 2) + "\n" + text.slice(-maxChars / 2);
  const intervals: Array<[number, number]> = [];
  for (const match of matches) {
    const start = Math.max(0, (match.index ?? 0) - 350);
    const end = Math.min(text.length, (match.index ?? 0) + 850);
    const previous = intervals[intervals.length - 1];
    if (previous && start <= previous[1])
      previous[1] = Math.max(previous[1], end);
    else intervals.push([start, end]);
  }
  return intervals
    .map(([start, end]) => text.slice(start, end))
    .join("\n…\n")
    .slice(0, maxChars);
}
