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
  $(
    "script, style, noscript, nav, footer, aside, iframe, form, .related, .related-posts, [class*=related], .comments, .newsletter, .sidebar, .share, .social, [class*=advert]",
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
      .find("h1,h2,h3,h4,p,li,blockquote,th,td,time")
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
      return publishedDate ? `${body}\nPublished: ${publishedDate}` : body;
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
