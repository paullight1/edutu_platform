/**
 * Crawler-time meta for the opportunities LIST page (`/opportunities`) and its
 * `?category=` collection variants.
 *
 * Sibling of `opportunity-og.ts` (which handles `/opportunity/:id`). The web
 * app is a Vite SPA, so crawlers only ever saw the generic index.html <head>.
 * This function rewrites <title>, description, canonical and OG/Twitter tags
 * with copy specific to the list page or the requested category collection.
 * Everything here is static (no backend fetch), and on any failure the
 * unmodified SPA HTML is served — never break the page.
 */
import type { Context } from "https://edge.netlify.com";

const SITE = "https://www.edutu.org";
const DEFAULT_IMAGE = `${SITE}/icons/icon-512x512.png`;

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
    return html.replace(matcher, (_m, open: string, close: string) => `${open}${safe}${close}`);
  }
  return html.replace(/<\/head>/i, `  ${fallbackTag.replace("__VALUE__", safe)}\n</head>`);
}

function ogProperty(prop: string) {
  return new RegExp(
    `(<meta\\s+property="${prop}"\\s+content=")[\\s\\S]*?(")`,
    "i",
  );
}

function metaName(name: string) {
  return new RegExp(`(<meta\\s+name="${name}"\\s+content=")[\\s\\S]*?(")`, "i");
}

export default async function handler(request: Request, context: Context) {
  const response = await context.next();
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    return response;
  }

  const url = new URL(request.url);
  if (!/^\/opportunities\/?$/.test(url.pathname)) {
    return response;
  }

  let html = await response.text();

  try {
    const category = (url.searchParams.get("category") || "").toLowerCase();
    const meta = CATEGORY_META[category] || LIST_META;
    // Unknown category values canonicalise to the plain list page.
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
  } catch {
    // On any failure, serve the unmodified SPA HTML — never break the page.
    return new Response(html, response);
  }

  const headers = new Headers(response.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  // Static copy — safe to cache at the CDN for longer than the per-id function.
  headers.set("cache-control", "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400");
  return new Response(html, { status: response.status, headers });
}
