/**
 * Per-opportunity Open Graph injection.
 *
 * The web app is a Vite SPA — social crawlers (WhatsApp, X/Twitter, Facebook,
 * LinkedIn, iMessage, Slack) never run its JS, so a shared opportunity link only
 * ever saw the generic default OG image baked into index.html (an app icon), or
 * nothing. This edge function runs ONLY on `/opportunity/:id`, fetches that
 * opportunity + its branded share card from the backend, and rewrites the OG /
 * Twitter meta tags in the served HTML so the link unfurls with the real title,
 * summary and the branded share-card image.
 *
 * Real users are unaffected: the SPA still boots and its client-side routing
 * takes over; only the static <head> tags the crawler reads are swapped.
 */
import type { Context } from "https://edge.netlify.com";

const BACKEND = (
  Deno.env.get("BACKEND_URL") ||
  Deno.env.get("VITE_API_URL") ||
  "https://edutu-platform.onrender.com"
).replace(/\/$/, "");

const SITE = "https://www.edutu.org";
const DEFAULT_IMAGE = `${SITE}/icons/icon-512x512.png`;

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

  const match = new URL(request.url).pathname.match(/^\/opportunity\/([^/]+)/);
  if (!match) {
    return response;
  }
  const id = decodeURIComponent(match[1]);

  let html = await response.text();

  try {
    const [oppRes, cardRes] = await Promise.all([
      fetch(`${BACKEND}/opportunities/${encodeURIComponent(id)}`),
      fetch(`${BACKEND}/opportunities/${encodeURIComponent(id)}/share-card`, {
        method: "POST",
      }),
    ]);

    const opp = oppRes.ok ? await oppRes.json() : null;
    if (!opp || !opp.id) {
      return new Response(html, response);
    }
    const card = cardRes.ok ? await cardRes.json() : null;

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
    // recognisable poster (like the source site itself shows); the branded card
    // is only a fallback when the opportunity has no picture of its own.
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

    html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeAttr(fullTitle)}</title>`);
    html = setValue(html, metaName("description"), `<meta name="description" content="__VALUE__" />`, description);
    html = setValue(html, /(<link\s+rel="canonical"\s+href=")[^"]*(")/i, `<link rel="canonical" href="__VALUE__" />`, pageUrl);
    // Make the opportunity page explicitly indexable (some SPA shells ship a
    // conservative default) so Google ranks each opportunity URL.
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

    // Server-rendered structured data so crawlers that don't execute the SPA's
    // JS (and Google, for faster/robust indexing) get rich-result metadata for
    // every opportunity URL.
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
  } catch {
    // On any failure, serve the unmodified SPA HTML (generic OG) — never break the page.
    return new Response(html, response);
  }

  const headers = new Headers(response.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  // Let the CDN cache the unfurl response briefly without staling for users.
  headers.set("cache-control", "public, max-age=0, s-maxage=300, stale-while-revalidate=600");
  return new Response(html, { status: response.status, headers });
}
