/**
 * Crawler-time Open Graph / SEO endpoint (Vercel Edge Function).
 *
 * The web app is a Vite SPA served statically on Vercel, so social crawlers
 * (WhatsApp, X/Twitter, Facebook, LinkedIn, iMessage, Slack, Telegram,
 * Discord) and search engines only ever saw the generic <head> in index.html.
 *
 * `vercel.json` rewrites `/opportunity/:id` and `/opportunities` to this
 * function ONLY when the request's `user-agent` matches a crawler (a `has`
 * header condition). Real users never reach here — they fall through to the
 * static SPA. Crawlers get a tiny self-contained HTML document carrying the
 * real title, description, canonical URL, OG/Twitter tags and JSON-LD, with
 * the opportunity's source flyer as the image.
 *
 * This is the Vercel-native replacement for the Netlify edge functions in
 * netlify/edge-functions/ (which never ran once the site moved to Vercel).
 * Unlike a middleware rewrite of index.html, it builds the HTML purely from
 * backend data, so it needs no same-origin fetch of the SPA shell.
 */

export const config = { runtime: "edge" };

const ENV = ((globalThis as { process?: { env?: Record<string, string | undefined> } })
  .process?.env ?? {}) as Record<string, string | undefined>;
const BACKEND = (
  ENV.BACKEND_URL ||
  ENV.VITE_API_URL ||
  "https://edutu-platform.onrender.com"
).replace(/\/$/, "");

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

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

/** Escape for use inside a double-quoted HTML attribute. */
function attr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Escape for HTML text content. */
function text(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

interface PageMeta {
  title: string; // full <title> / og:title
  description: string;
  image: string;
  imageAlt: string;
  url: string;
  ogType: "article" | "website";
  imageDims?: string;
  jsonLd?: Record<string, unknown>;
}

function renderPage(meta: PageMeta): string {
  const jsonLdTag = meta.jsonLd
    ? `\n  <script type="application/ld+json">${JSON.stringify(meta.jsonLd).replace(/</g, "\\u003c")}</script>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${attr(meta.title)}</title>
  <meta name="description" content="${attr(meta.description)}">
  <link rel="canonical" href="${attr(meta.url)}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <meta property="og:site_name" content="Edutu">
  <meta property="og:type" content="${meta.ogType}">
  <meta property="og:title" content="${attr(meta.title)}">
  <meta property="og:description" content="${attr(meta.description)}">
  <meta property="og:image" content="${attr(meta.image)}">
  <meta property="og:image:alt" content="${attr(meta.imageAlt)}">
  <meta property="og:url" content="${attr(meta.url)}">${meta.imageDims ? `\n  ${meta.imageDims}` : ""}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${attr(meta.title)}">
  <meta name="twitter:description" content="${attr(meta.description)}">
  <meta name="twitter:image" content="${attr(meta.image)}">
  <meta name="twitter:image:alt" content="${attr(meta.imageAlt)}">${jsonLdTag}
</head>
<body>
  <main style="font-family:system-ui,-apple-system,sans-serif;max-width:640px;margin:48px auto;padding:0 20px;line-height:1.5">
    <h1>${text(meta.title)}</h1>
    <p>${text(meta.description)}</p>
    <p><a href="${attr(meta.url)}">View this opportunity on Edutu →</a></p>
  </main>
</body>
</html>`;
}

function htmlResponse(html: string, cacheControl: string): Response {
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": cacheControl,
      "x-og-source": "api/og", // marker so prod behaviour is verifiable via headers
    },
  });
}

async function renderOpportunity(id: string): Promise<Response> {
  const [oppRes, cardRes] = await Promise.all([
    fetch(`${BACKEND}/opportunities/${encodeURIComponent(id)}`),
    fetch(`${BACKEND}/opportunities/${encodeURIComponent(id)}/share-card`, {
      method: "POST",
    }),
  ]);

  const pageUrl = `${SITE}/opportunity/${encodeURIComponent(id)}`;
  const opp = oppRes.ok ? await oppRes.json().catch(() => null) : null;
  if (!opp || !opp.id) {
    return htmlResponse(
      renderPage({
        title: "Opportunity on Edutu",
        description:
          "Discover scholarships, fellowships and programs with AI-guided roadmaps on Edutu.",
        image: DEFAULT_IMAGE,
        imageAlt: "Edutu",
        url: pageUrl,
        ogType: "article",
      }),
      "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
    );
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

  // Image priority: the scraped source page's own flyer/poster → the
  // opportunity's own image → our branded share card → generic Edutu icon.
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

  const deadlineRaw = clean(opp.deadline || opp.close_date || opp.deadline_date);
  const deadlineIso = /^\d{4}-\d{2}-\d{2}/.test(deadlineRaw) ? deadlineRaw : "";
  const organization =
    clean(opp.organization || opp.provider || opp.company) || "Edutu";
  const category = clean(opp.category) || "Opportunity";

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "EducationalOccupationalProgram",
    name: fullTitle,
    description,
    url: pageUrl,
    image,
    category,
    provider: { "@type": "Organization", name: organization },
    ...(deadlineIso
      ? { applicationDeadline: deadlineIso, validThrough: deadlineIso }
      : {}),
    publisher: {
      "@type": "Organization",
      name: "Edutu",
      url: `${SITE}/opportunities`,
      logo: { "@type": "ImageObject", url: DEFAULT_IMAGE },
    },
  };

  return htmlResponse(
    renderPage({
      title: fullTitle,
      description,
      image,
      imageAlt: title,
      url: pageUrl,
      ogType: "article",
      imageDims: usingBrandedCard
        ? `<meta property="og:image:width" content="1080">\n  <meta property="og:image:height" content="1350">`
        : undefined,
      jsonLd,
    }),
    "public, max-age=0, s-maxage=300, stale-while-revalidate=600",
  );
}

function renderList(categoryRaw: string): Response {
  const category = (categoryRaw || "").toLowerCase();
  const meta = CATEGORY_META[category] || LIST_META;
  const pageUrl = CATEGORY_META[category]
    ? `${SITE}/opportunities?category=${encodeURIComponent(category)}`
    : `${SITE}/opportunities`;

  return htmlResponse(
    renderPage({
      title: meta.title,
      description: meta.description,
      image: DEFAULT_IMAGE,
      imageAlt: "Edutu",
      url: pageUrl,
      ogType: "website",
    }),
    "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
  );
}

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const isList = url.searchParams.get("list") === "1";

  try {
    if (id) return await renderOpportunity(id);
    if (isList) return renderList(url.searchParams.get("category") || "");
  } catch {
    // fall through to a safe default below
  }

  // Unexpected direct hit — return generic Edutu meta rather than error.
  return htmlResponse(
    renderPage({
      title: "Edutu — AI-powered global opportunities",
      description:
        "Discover scholarships, fellowships and programs with AI-guided roadmaps on Edutu.",
      image: DEFAULT_IMAGE,
      imageAlt: "Edutu",
      url: `${SITE}/opportunities`,
      ogType: "website",
    }),
    "public, max-age=0, s-maxage=60",
  );
}
