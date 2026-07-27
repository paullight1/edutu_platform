/**
 * Single source of truth for public-page SEO / Open Graph metadata.
 *
 * Three consumers read this file, which is why it lives in plain ESM rather
 * than TypeScript:
 *
 *   1. `scripts/generate-og-images.mjs` — screenshots each page's hero in light
 *      mode and writes `public/og/<slug>.jpg`.
 *   2. `scripts/inject-route-meta.mjs` — post-build, emits a prerendered
 *      `dist/<path>/index.html` per route with these tags baked into the HTML
 *      so non-JS crawlers (WhatsApp, Facebook, Slack, LinkedIn, iMessage) see
 *      a real title/description/image instead of the generic SPA shell.
 *   3. `scripts/gen-page-seo-ts.mjs` — codegens `src/lib/pageSeo.generated.ts`
 *      so the runtime <Seo> component resolves the same image for the same
 *      path. Never hand-edit the generated file; edit this one and rebuild.
 *
 * Keep `title`/`description` in sync with the page's own <Seo> props — the
 * prerendered HTML is what social crawlers read, the <Seo> tags are what
 * Google reads after hydration, and a mismatch between them is a ranking smell.
 */

export const SITE_URL = "https://www.edutu.org";

/** Open Graph canonical size. Captured at 2x for retina-sharp unfurls. */
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

/**
 * JPEG rather than PNG: these are dense, photographic hero frames, and the PNG
 * of a 2400x1260 landing hero runs 2-4 MB. Facebook accepts it but the unfurl
 * visibly lags, and every megabyte also lands in the PWA precache. q90 JPEG is
 * ~250 KB with no visible loss at unfurl scale.
 */
export const OG_FORMAT = "jpeg";
export const OG_EXTENSION = "jpg";
export const OG_MIME = "image/jpeg";
export const OG_QUALITY = 90;

/**
 * @typedef {object} PageSeoEntry
 * @property {string}  path        Route path as served (leading slash, no trailing slash except "/").
 * @property {string}  slug        Output filename stem under `public/og/`.
 * @property {string}  title       <title> + og:title.
 * @property {string}  description meta description + og:description.
 * @property {string}  imageAlt    og:image:alt.
 * @property {string} [capturePath] Path to visit when screenshotting, if it
 *                                 differs from `path` (e.g. a route that
 *                                 redirects, so we capture the destination).
 * @property {number} [settleMs]   Extra wait before capture for pages whose
 *                                 hero animates or fetches live content.
 * @property {boolean} [noindex]   Emit `noindex, nofollow` instead of index.
 */

/** @type {PageSeoEntry[]} */
export const PAGE_SEO = [
  {
    path: "/",
    slug: "home",
    title: "Edutu | AI-powered global opportunities",
    description:
      "Find scholarships, fellowships, internships, grants, and global programs with AI-guided roadmaps, reminders, and application tracking.",
    imageAlt: "Edutu homepage — AI-powered global opportunities",
    // The landing hero cross-fades a rotating headline and pulls live
    // opportunity + blog data before it settles.
    settleMs: 2500,
  },
  {
    path: "/opportunities",
    slug: "opportunities",
    title: "Updated scholarships, internships and grants | Edutu",
    description:
      "Browse thousands of verified scholarships, fellowships, internships and grants from over 31 countries — refreshed daily, with deadlines you can trust.",
    imageAlt: "Edutu opportunities feed",
    settleMs: 2500,
  },
  {
    path: "/blog",
    slug: "blog",
    title: "Blog — Edutu",
    description:
      "Founder notes, success stories, and guides to help every young African discover and win life-changing opportunities.",
    imageAlt: "The Edutu blog",
    settleMs: 1500,
  },
  {
    path: "/community",
    slug: "community",
    title: "Community — Edutu",
    description:
      "Join a community of 50,000+ African learners, mentors, and future leaders discovering, applying for, and winning global opportunities together.",
    imageAlt: "The Edutu community",
  },
  {
    path: "/about",
    slug: "about",
    title: "About Edutu — talent is everywhere, opportunity isn't",
    description:
      "Edutu helps underprivileged African learners discover and reach scholarships, internships and fellowships. Our story, our belief, and the team closing the opportunity gap with responsible AI.",
    imageAlt: "About Edutu",
  },
  {
    path: "/impact",
    slug: "impact",
    title: "Our Impact — Edutu",
    description:
      "Proof, not promises. See how Edutu is closing Africa's opportunity gap with responsible AI — countries reached, young people served, scholarships shared, and the stories behind the numbers.",
    imageAlt: "Edutu impact — closing Africa's opportunity gap",
    settleMs: 1500,
  },
  {
    path: "/events",
    slug: "events",
    title: "Edutu events | Scholarships, mentorship and application support",
    description:
      "Live sessions, workshops and office hours from the Edutu team and our mentors — application clinics, scholarship walkthroughs, and Q&As you can join for free.",
    imageAlt: "Edutu events",
    settleMs: 1500,
  },
  {
    path: "/download",
    slug: "download",
    title: "Download Edutu — get the app on any device",
    description:
      "Download Edutu for Android today, or install it straight from your browser on iPhone and desktop. Deadline reminders, offline access, and your personalized opportunity feed.",
    imageAlt: "Download the Edutu app",
  },
  {
    path: "/what-we-believe",
    slug: "what-we-believe",
    title: "What we believe — Edutu",
    description:
      "Talent is everywhere; opportunity isn't. The beliefs that shape how Edutu builds — access first, responsible AI, and never charging a young person for the chance to try.",
    imageAlt: "What Edutu believes",
  },
  {
    path: "/upgrade",
    slug: "upgrade",
    title: "Edutu Pro — AI coaching, CV tools and smarter tracking",
    description:
      "Go Pro on Edutu for unlimited AI coaching and CV tools in the Edutu mobile app, plus closed-opportunity filters and calendar exports on the web. Pay by card, mobile money, or bank transfer via Paystack.",
    imageAlt: "Edutu Pro",
  },
  {
    path: "/mentor",
    slug: "mentor",
    title: "Become an Edutu mentor",
    description:
      "Guide young Africans through the applications that change their lives. Share an hour, review an essay, or answer the questions no one else will.",
    imageAlt: "Become an Edutu mentor",
  },

  /* ── Developer / API product ─────────────────────────────────────────── */
  {
    path: "/scholarship-engine",
    slug: "scholarship-engine",
    title:
      "Scholarship Engine — one API for scholarships & opportunities | Edutu",
    description:
      "A normalized API for scholarships, fellowships, internships and grants. One data contract powers Edutu's web app, mobile client and admin — ingested from thousands of sources, refreshed daily.",
    imageAlt: "The Edutu Scholarship Engine API",
    settleMs: 1500,
  },
  {
    path: "/scholarship-api",
    slug: "scholarship-api",
    title:
      "Scholarship Engine — one API for scholarships & opportunities | Edutu",
    description:
      "A normalized API for scholarships, fellowships, internships and grants. One data contract powers Edutu's web app, mobile client and admin — ingested from thousands of sources, refreshed daily.",
    imageAlt: "The Edutu Scholarship Engine API",
    // /scholarship-api resolves through MarketingRedirect; capture the page
    // that actually renders so we never screenshot a redirect flash.
    capturePath: "/scholarship-engine",
    settleMs: 1500,
  },
  {
    path: "/developers",
    slug: "developers",
    title: "Developers — build on the Edutu platform",
    description:
      "One API for scholarships, AI matching and ingestion — the platform behind Edutu's own apps. Get a key and ship your first opportunity-data integration in minutes.",
    imageAlt: "Build on the Edutu platform",
    settleMs: 1500,
  },
  {
    path: "/developers/docs",
    slug: "developers-docs",
    title: "API reference — Edutu Developer docs",
    description:
      "Reference for the Edutu opportunity API: authentication, endpoints, the normalized opportunity object, and copy-paste examples for web, mobile and admin.",
    imageAlt: "Edutu API reference",
  },

  /* ── Legal & support ─────────────────────────────────────────────────── */
  {
    path: "/help",
    slug: "help",
    title: "Help Centre — Edutu",
    description:
      "Answers to the questions we get most: accounts, deadlines, saved opportunities, Edutu Pro billing, and how to reach a human when you need one.",
    imageAlt: "Edutu Help Centre",
  },
  {
    path: "/careers",
    slug: "careers",
    title: "Careers at Edutu",
    description:
      "Help close Africa's opportunity gap. Open roles, how we work, and what we look for in the people who build Edutu.",
    imageAlt: "Careers at Edutu",
  },
  {
    path: "/privacy",
    slug: "privacy",
    title: "Privacy Policy — Edutu",
    description:
      "How Edutu collects, uses, stores and protects your data — plus how to contact us, export your information, or delete your account.",
    imageAlt: "Edutu privacy policy",
  },
  {
    path: "/terms",
    slug: "terms",
    title: "Terms of Service — Edutu",
    description:
      "The terms that govern your use of Edutu's website, mobile apps and API.",
    imageAlt: "Edutu terms of service",
  },
];

/** Absolute URL of the prerendered OG image for a page slug. */
export function ogImageUrl(slug) {
  return `${SITE_URL}/og/${slug}.${OG_EXTENSION}`;
}

/** Absolute canonical URL for a page path. */
export function canonicalUrl(path) {
  return path === "/" ? `${SITE_URL}/` : `${SITE_URL}${path}`;
}

/** Look up an entry by route path. */
export function findPageSeo(path) {
  const normalised =
    path !== "/" && path.endsWith("/") ? path.slice(0, -1) : path;
  return PAGE_SEO.find((entry) => entry.path === normalised) ?? null;
}
