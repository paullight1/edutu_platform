# Edutu social metadata and route preview design

## Goal

Make links shared from `https://www.edutu.org` show the relevant public page
preview rather than the square Edutu app icon. The homepage should show a
captured frame of its hero section, and each registered public marketing route
should show its own captured above-the-fold section.

## Scope

In scope:

- The Vite web app in `edutu-web-app/` served at `www.edutu.org`.
- Static homepage metadata in `index.html`.
- Hydrated metadata emitted by the shared `Seo` component.
- Post-build route metadata emitted by `scripts/inject-route-meta.mjs`.
- Screenshot assets and their registry in `scripts/page-seo.mjs`.
- Verification of canonical URLs, social image URLs, and generated output.

Out of scope:

- Dynamic opportunity and blog-detail pages, which keep their existing
  backend-generated OG preview routes.
- Reworking the visual design of any page hero.
- Changes to unrelated apps or the existing uncommitted billing work.

## Chosen approach

Use the existing screenshot-based OG pipeline as the single visual source of
truth. `scripts/page-seo.mjs` remains the registry for public routes, titles,
descriptions, slugs, image alt text, and capture behavior. The existing
`generate-og-images.mjs` script captures each route at the Open Graph viewport
and writes `public/og/<slug>.jpg`.

The three metadata consumers must resolve the same values:

1. `index.html` provides the crawler-visible homepage fallback before the SPA
   loads.
2. `Seo.tsx` updates metadata for hydrated navigation and Google-rendered
   pages.
3. `inject-route-meta.mjs` writes crawler-visible route HTML during the build.

This avoids divergent titles, canonical URLs, or images between social
crawlers, JavaScript-capable crawlers, and normal users.

## Metadata contract

The homepage shell and generated route pages will include:

- A self-referencing canonical URL using `https://www.edutu.org`.
- `og:type`, `og:site_name`, `og:url`, `og:title`, and `og:description`.
- `og:image` and `og:image:secure_url` pointing to the route screenshot.
- `og:image:type`, `og:image:width`, and `og:image:height` matching the
  registry constants (`image/jpeg`, `1200`, `630` logical pixels).
- `og:image:alt` describing the captured page section.
- `twitter:card=summary_large_image` and matching Twitter title, description,
  image, and image alt tags.
- Indexable pages use `index, follow, max-image-preview:large`.

The existing root icon remains the favicon/PWA icon only; it is not used as a
social preview fallback when a registered route screenshot exists.

## Route behavior

- `/` uses `public/og/home.jpg`, a screenshot of the homepage hero.
- Other routes in `PAGE_SEO` use their own `public/og/<slug>.jpg` screenshot.
- The static build writes route-specific `dist/<route>/index.html` files and
  Vercel rewrites registered paths to those files.
- Dynamic `/opportunity/:id`, `/share/opportunity/:id`, and `/blog/:slug`
  routes retain their backend-generated preview behavior.

## Error handling and freshness

- The build continues to fail if a registered route lacks Vercel routing
  coverage, preventing a silently incorrect SPA-shell unfurl.
- Screenshot generation remains an explicit `npm run seo:og` operation because
  it requires a browser and may depend on live content.
- When a hero changes, the corresponding route screenshot must be regenerated
  and committed alongside the registry change.

## Verification

Run the focused SEO tests, typecheck, lint, and production build. Inspect the
generated root and route HTML to confirm that titles, canonical URLs, OG image
URLs, image dimensions, and the prerender marker are present without duplicate
conflicting tags. Confirm that the checked-in homepage and representative
section screenshots are 2400x1260 JPEGs (2x captures of a 1200x630 OG card).
