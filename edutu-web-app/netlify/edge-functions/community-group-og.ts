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

function setValue(
  html: string,
  matcher: RegExp,
  fallbackTag: string,
  value: string,
): string {
  const safe = escapeAttr(value);
  if (matcher.test(html)) {
    return html.replace(matcher, (_match, open: string, close: string) => `${open}${safe}${close}`);
  }
  return html.replace(/<\/head>/i, `  ${fallbackTag.replace("__VALUE__", safe)}\n</head>`);
}

function metaName(name: string) {
  return new RegExp(`(<meta\\s+name="${name}"\\s+content=")[\\s\\S]*?(")`, "i");
}

function ogProperty(property: string) {
  return new RegExp(`(<meta\\s+property="${property}"\\s+content=")[\\s\\S]*?(")`, "i");
}

export default async function handler(request: Request, context: Context) {
  const response = await context.next();
  if (!(response.headers.get("content-type") || "").includes("text/html")) return response;

  const match = new URL(request.url).pathname.match(/^\/community\/groups\/([^/]+)\/?$/);
  if (!match) return response;
  const slug = decodeURIComponent(match[1]);
  let html = await response.text();

  try {
    const groupResponse = await fetch(`${BACKEND}/public/communities/groups/${encodeURIComponent(slug)}`, {
      headers: { Accept: "application/json" },
    });
    if (!groupResponse.ok) {
      // Keep the SPA shell but explicitly prevent indexing unavailable/private
      // slugs. The public API intentionally returns the same 404 for every case.
      html = setValue(html, metaName("robots"), `<meta name="robots" content="__VALUE__" />`, "noindex, nofollow");
      return new Response(html, response);
    }
    const group = await groupResponse.json();
    const name = truncate(clean(group?.name) || "Edutu Community", 90);
    const title = `${name} Community | Edutu`;
    const description = truncate(
      clean(group?.description) ||
        `Join ${name} on Edutu to discuss applications, opportunities and practical next steps with other learners.`,
      180,
    );
    const pageUrl = `${SITE}/community/groups/${encodeURIComponent(slug)}`;

    html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeAttr(title)}</title>`);
    html = setValue(html, metaName("description"), `<meta name="description" content="__VALUE__" />`, description);
    html = setValue(html, metaName("robots"), `<meta name="robots" content="__VALUE__" />`, "index, follow, max-image-preview:large");
    html = setValue(html, /(<link\s+rel="canonical"\s+href=")[^"]*(")/i, `<link rel="canonical" href="__VALUE__" />`, pageUrl);
    html = setValue(html, ogProperty("og:title"), `<meta property="og:title" content="__VALUE__" />`, title);
    html = setValue(html, ogProperty("og:description"), `<meta property="og:description" content="__VALUE__" />`, description);
    html = setValue(html, ogProperty("og:url"), `<meta property="og:url" content="__VALUE__" />`, pageUrl);
    html = setValue(html, ogProperty("og:type"), `<meta property="og:type" content="__VALUE__" />`, "website");
    html = setValue(html, ogProperty("og:image"), `<meta property="og:image" content="__VALUE__" />`, DEFAULT_IMAGE);
    html = setValue(html, metaName("twitter:title"), `<meta name="twitter:title" content="__VALUE__" />`, title);
    html = setValue(html, metaName("twitter:description"), `<meta name="twitter:description" content="__VALUE__" />`, description);
    html = setValue(html, metaName("twitter:image"), `<meta name="twitter:image" content="__VALUE__" />`, DEFAULT_IMAGE);

    const structured = {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: `${name} Community`,
      description,
      url: pageUrl,
      isPartOf: { "@type": "WebPage", name: "Edutu Community", url: `${SITE}/community` },
    };
    const jsonLd = `<script type="application/ld+json">${JSON.stringify(structured).replace(/</g, "\\u003c")}</script>`;
    html = html.replace(/<\/head>/i, `  ${jsonLd}\n</head>`);
  } catch {
    // Metadata failure must never break the SPA route. Keep generic HTML.
  }

  const headers = new Headers(response.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", "public, max-age=0, s-maxage=300, stale-while-revalidate=600");
  return new Response(html, { status: response.status, headers });
}
