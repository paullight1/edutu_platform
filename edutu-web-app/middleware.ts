/**
 * Vercel Edge Middleware — crawler-time Open Graph / SEO injection.
 *
 * The web app is a Vite SPA served statically on Vercel (vercel.json rewrites
 * every route to index.html), so social crawlers (WhatsApp, X/Twitter,
 * Facebook, LinkedIn, iMessage, Slack, Telegram, Discord) and search engines
 * only ever saw the generic default <head> baked into index.html.
 *
 * This middleware runs on `/opportunity/:id` and `/opportunities`, and — for
 * crawler/bot user-agents ONLY (real users fall straight through to the fast
 * static SPA, zero added latency) — fetches the opportunity + its branded
 * share card from the backend and rewrites <title>, description, canonical,
 * OG/Twitter tags + JSON-LD, so a shared link unfurls with the real title,
 * summary and the source flyer / share image.
 *
 * It ports `netlify/edge-functions/opportunity-og.ts` +
 * `opportunities-og.ts`, which stopped running once the site moved from
 * Netlify to Vercel hosting. Unlike Netlify's `context.next()`, Vercel Edge
 * Middleware can't read the origin response body, so we fetch the static
 * index.html shell ourselves and rewrite it, then return it directly.
 */

export const config = {
  matcher: ["/opportunity/:path*", "/opportunities"],
};

const ENV = ((globalThis as { process?: { env?: Record<string, string | undefined> } })
  .process?.env ?? {}) as Record<string, string | undefined>;
const BACKEND = (
  ENV.BACKEND_URL ||
  ENV.VITE_API_URL ||
  "https://edutu-platform.onrender.com"
).replace(/\/$/, "");

const SITE = "https://www.edutu.org";
const DEFAULT_IMAGE = `${SITE}/icons/icon-512x512.png`;

// Link-unfurl bots + search crawlers. Real users (whose UAs never contain any
// of these tokens) fall through to the static SPA, so this adds zero latency
// to normal page loads; only these agents pay for the backend round-trip.
const CRAWLER_RE =
  /(facebookexternalhit|facebot|whatsapp|twitterbot|linkedinbot|slackbot|slack-imgproxy|telegrambot|discordbot|pinterest|redditbot|applebot|googlebot|google-inspectiontool|bingbot|yandex|baiduspider|duckduckbot|embedly|quora link preview|outbrain|vkshare|w3c_validator|skypeuripreview|nuzzel|bitlybot|flipboard|tumblr|mastodon|petalbot|\bbot\b|crawler|spider|preview|scraper)/i;

// Keep in sync with `categoryFilters` / COLLECTIONS in
// src/components/OpportunitiesPage.tsx.
const CATEGORY_META: Record<string, { title: string; description: string }> = {
  scholarships: {
    title: "Scholarships for Students | Edutu",
    description:
      "Browse active scholarships worldwide — funding for undergraduate, graduate and doctoral study, with deadlines, eligibility and AI-guided application roadmaps on Edutu.",
  },
  internships: {
    title: "Internships & Graduate Trainee Roles | Edutu",
    description:
      "Discover internships and trainee opportunities from global organizations. See eligibility, deadlines and apply links, with AI-guided application help on Edutu.",
  },
  fellowships: {
    title: "Fellowships & Residencies | Edutu",
    description:
      "Explore fellowships and residencies to advance your research, leadership and career — deadlines, eligibility and AI-guided roadmaps on Edutu.",
  },
  programs: {
    title: "Programs, Bootcamps & Accelerators | Edutu",
    description:
      "Find training programs, bootcamps, accelerators and academies worldwide, with deadlines, eligibility and AI-guided application roadmaps on Edutu.",
  },
};

const LIST_META = {
  title: "Browse Opportunities — Scholarships, Fellowships & More | Edutu",
  description:
    "Explore live scholarships, fellowships, internships and programs curated daily. Filter by category, check deadlines and get AI-guided application roadmaps on Edutu.",
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Replace the `content`/`href` value of a specific tag, tolerating the
 * multi-line meta formatting used in index.html. Injects the tag before
 * </head> if it isn't already present. */
function setValue(
  html: string,
  matcher: RegExp,
  fallbackTag: string,
  value: string,
): string {
  const safe = escapeAttr(value);
  if (matcher.test(html)) {
    return html.replace(
      matcher,
      (_m, open: string, close: string) => `${open}${safe}${close}`,
    );
  }
  return html.replace(
    /<\/head>/i,
    `  ${fallbackTag.replace("__VALUE__", safe)}\n</head>`,
  );
}

function ogProperty(prop: string): RegExp {
  return new RegExp(
    `(<meta\\s+property="${prop}"\\s+content=")[\\s\\S]*?(")`,
    "i",
  );
}

function metaName(name: string): RegExp {
  return new RegExp(`(<meta\\s+name="${name}"\\s+content=")[\\s\\S]*?(")`, "i");
}

/** Fetch the static SPA shell (index.html) from the same deployment. The
 * custom UA guarantees this subrequest is never treated as a crawler, so it
 * can never recurse back into this middleware. */
async function fetchShell(origin: string): Promise<string | null> {
  try {
    const res = await fetch(`${origin}/index.html`, {
      headers: { "user-agent": "edutu-og-shell" },
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function handleOpportunity(
  origin: string,
  rawId: string,
): Promise<Response | undefined> {
  const id = decodeURIComponent(rawId);

  const [shell, oppRes, cardRes] = await Promise.all([
    fetchShell(origin),
    fetch(`${BACKEND}/opportunities/${encodeURIComponent(id)}`),
    fetch(`${BACKEND}/opportunities/${encodeURIComponent(id)}/share-card`, {
      method: "POST",
    }),
  ]);

  if (!shell) return undefined;
  let html = shell;

  const opp = oppRes.ok ? await oppRes.json().catch(() => null) : null;
  if (!opp || !opp.id) {
    // Unknown opportunity — serve the generic shell unchanged.
    return htmlResponse(html, "public, max-age=0, s-maxage=300, stale-while-revalidate=600");
  }
  const card = cardRes.ok ? await cardRes.json().catch(() => null) : null;

  const title = clean(opp.title) || "Opportunity on Edutu";
  const fullTitle = `${title} | Edutu`;
  const description =
    truncate(
      clean(
        opp.aiSummary ||
          opp.ai_summary ||
          opp.refined_summary ||
          opp.summary ||
          opp.description,
      ),
      200,
    ) ||
    "Discover scholarships, fellowships and programs with AI-guided roadmaps on Edutu.";

  // Image priority: the scraped source page's own flyer/poster (its OG image)
  // → the opportunity's own image → our branded share card → generic Edutu
  // icon. The real source flyer leads so a shared link unfurls with the bold,
  // recognisable poster; the branded card is only a fallback.
  const brandedCard = clean(card?.shareCard?.url);
  const sourceImage =
    clean(opp.metadata?.source_image_url) ||
    clean(opp.source_image_url || opp.sourceImageUrl);
  const image =
    sourceImage ||
    clean(opp.image_url || opp.imageUrl) ||
    clean(opp.share_image_url || opp.shareImageUrl) ||
    brandedCard ||
    DEFAULT_IMAGE;
  const usingBrandedCard = Boolean(brandedCard) && image === brandedCard;
  const pageUrl = `${SITE}/opportunity/${encodeURIComponent(id)}`;

  html = html.replace(
    /<title>[\s\S]*?<\/title>/i,
    `<title>${escapeAttr(fullTitle)}</title>`,
  );
  html = setValue(html, metaName("description"), `<meta name="description" content="__VALUE__" />`, description);
  html = setValue(html, /(<link\s+rel="canonical"\s+href=")[^"]*(")/i, `<link rel="canonical" href="__VALUE__" />`, pageUrl);
  html = setValue(html, metaName("robots"), `<meta name="robots" content="__VALUE__" />`, "index, follow, max-image-preview:large");

  html = setValue(html, ogProperty("og:title"), `<meta property="og:title" content="__VALUE__" />`, fullTitle);
  html = setValue(html, ogProperty("og:description"), `<meta property="og:description" content="__VALUE__" />`, description);
  html = setValue(html, ogProperty("og:image"), `<meta property="og:image" content="__VALUE__" />`, image);
  html = setValue(html, ogProperty("og:url"), `<meta property="og:url" content="__VALUE__" />`, pageUrl);
  html = setValue(html, ogProperty("og:type"), `<meta property="og:type" content="__VALUE__" />`, "article");
  html = setValue(html, ogProperty("og:image:alt"), `<meta property="og:image:alt" content="__VALUE__" />`, title);

  html = setValue(html, metaName("twitter:title"), `<meta name="twitter:title" content="__VALUE__" />`, fullTitle);
  html = setValue(html, metaName("twitter:description"), `<meta name="twitter:description" content="__VALUE__" />`, description);
  html = setValue(html, metaName("twitter:image"), `<meta name="twitter:image" content="__VALUE__" />`, image);
  html = setValue(html, metaName("twitter:image:alt"), `<meta name="twitter:image:alt" content="__VALUE__" />`, title);

  // Only declare the 4:5 (1080x1350) dimensions when we actually serve the
  // branded share card — a source/fallback image has its own aspect ratio and
  // lying about it makes unfurlers crop it badly.
  if (usingBrandedCard && !/property="og:image:width"/i.test(html)) {
    html = html.replace(
      /<\/head>/i,
      `  <meta property="og:image:width" content="1080" />\n  <meta property="og:image:height" content="1350" />\n</head>`,
    );
  }

  const deadlineRaw = clean(opp.deadline || opp.close_date || opp.deadline_date);
  const deadlineIso = /^\d{4}-\d{2}-\d{2}/.test(deadlineRaw) ? deadlineRaw : "";
  const organization = clean(opp.organization || opp.provider || opp.company) || "Edutu";
  const category = clean(opp.category) || "Opportunity";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "EducationalOccupationalProgram",
    name: fullTitle,
    description,
    url: pageUrl,
    image,
    category,
    provider: { "@type": "Organization", name: organization },
    ...(deadlineIso ? { applicationDeadline: deadlineIso, validThrough: deadlineIso } : {}),
    publisher: {
      "@type": "Organization",
      name: "Edutu",
      url: `${SITE}/opportunities`,
      logo: { "@type": "ImageObject", url: DEFAULT_IMAGE },
    },
  };
  const jsonLdTag = `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>`;
  if (!/application\/ld\+json/i.test(html)) {
    html = html.replace(/<\/head>/i, `  ${jsonLdTag}\n</head>`);
  }

  return htmlResponse(html, "public, max-age=0, s-maxage=300, stale-while-revalidate=600");
}

async function handleList(url: URL, origin: string): Promise<Response | undefined> {
  const shell = await fetchShell(origin);
  if (!shell) return undefined;
  let html = shell;

  const category = (url.searchParams.get("category") || "").toLowerCase();
  const meta = CATEGORY_META[category] || LIST_META;
  const pageUrl = CATEGORY_META[category]
    ? `${SITE}/opportunities?category=${encodeURIComponent(category)}`
    : `${SITE}/opportunities`;

  html = html.replace(
    /<title>[\s\S]*?<\/title>/i,
    `<title>${escapeAttr(meta.title)}</title>`,
  );
  html = setValue(html, metaName("description"), `<meta name="description" content="__VALUE__" />`, meta.description);
  html = setValue(html, /(<link\s+rel="canonical"\s+href=")[^"]*(")/i, `<link rel="canonical" href="__VALUE__" />`, pageUrl);

  html = setValue(html, ogProperty("og:title"), `<meta property="og:title" content="__VALUE__" />`, meta.title);
  html = setValue(html, ogProperty("og:description"), `<meta property="og:description" content="__VALUE__" />`, meta.description);
  html = setValue(html, ogProperty("og:image"), `<meta property="og:image" content="__VALUE__" />`, DEFAULT_IMAGE);
  html = setValue(html, ogProperty("og:url"), `<meta property="og:url" content="__VALUE__" />`, pageUrl);
  html = setValue(html, ogProperty("og:type"), `<meta property="og:type" content="__VALUE__" />`, "website");

  html = setValue(html, metaName("twitter:title"), `<meta name="twitter:title" content="__VALUE__" />`, meta.title);
  html = setValue(html, metaName("twitter:description"), `<meta name="twitter:description" content="__VALUE__" />`, meta.description);
  html = setValue(html, metaName("twitter:image"), `<meta name="twitter:image" content="__VALUE__" />`, DEFAULT_IMAGE);

  return htmlResponse(html, "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400");
}

function htmlResponse(html: string, cacheControl: string): Response {
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": cacheControl,
    },
  });
}

export default async function middleware(
  request: Request,
): Promise<Response | undefined> {
  // Real users (and any UA without a crawler token) get the untouched, fast
  // static path — the SPA still boots and client routing takes over.
  const ua = request.headers.get("user-agent") || "";
  if (!CRAWLER_RE.test(ua)) return undefined;

  const url = new URL(request.url);
  const origin = url.origin;

  try {
    const oppMatch = url.pathname.match(/^\/opportunity\/([^/]+)/);
    if (oppMatch) {
      return await handleOpportunity(origin, oppMatch[1]);
    }
    if (/^\/opportunities\/?$/.test(url.pathname)) {
      return await handleList(url, origin);
    }
  } catch {
    // On any failure, fall through to the normal static path — never break the
    // page for a crawler.
    return undefined;
  }

  return undefined;
}
