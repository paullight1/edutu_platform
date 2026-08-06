# Per-page Open Graph images

Every public page unfurls with a screenshot of **its own hero**, captured in
light mode, instead of the generic Edutu logo. Paste `www.edutu.org` into
WhatsApp and you get the homepage hero; paste `/community` and you get the
community hero.

## Why the React `<Seo>` component wasn't enough

`src/components/Seo.tsx` injects `<meta>` tags after hydration. Social crawlers
(WhatsApp, Facebook, Slack, LinkedIn, iMessage, Twitter) **do not run
JavaScript** — they read the raw HTML and leave. Only Google, which renders,
ever saw those tags. So the metadata has to exist in the HTML before any JS runs.

## The pieces

| File | Role |
|---|---|
| `scripts/page-seo.mjs` | **Single source of truth.** Route → title, description, slug, alt text. Plain ESM because Node scripts and the browser bundle both read it. |
| `scripts/generate-og-images.mjs` | Screenshots each hero → `public/og/<slug>.jpg`. Manual, committed output. |
| `scripts/gen-page-seo-ts.mjs` | Codegens `src/lib/pageSeo.generated.ts`. Runs on `prebuild`. |
| `scripts/inject-route-meta.mjs` | Post-build: writes `dist/<path>/index.html` per route with the tags baked in. Runs on `postbuild`. |
| `src/components/PageSeo.tsx` | `<Seo>` for a static route, sourced from the registry. |
| `vercel.json` | One rewrite per route → its prerendered HTML, above the SPA catch-all. |

Static pages never touch the backend — no proxy, no cold start, no crawler
user-agent sniffing (which this deployment's router silently drops anyway).

## Regenerating the images

Run this whenever a hero design changes. **Commit the output.**

```bash
npm run seo:og                  # all pages, captured against production
npm run seo:og -- home blog     # just these slugs
OG_BASE_URL=http://localhost:4173 npm run seo:og   # against a local preview
```

Defaults to production because the heroes pull live content (opportunity
counts, latest posts, impact stats) that a local build renders as skeletons.

Needs a Chrome on the machine. Tried in order: `$OG_CHROME_PATH`, a system
install, then Puppeteer's cache. On macOS the cached Puppeteer copy is often
quarantined and dies with a bare `Unknown system error -88` — the script falls
through to the next candidate automatically.

## Adding a page

1. Add an entry to `scripts/page-seo.mjs`.
2. Add `{ "source": "/x", "destination": "/x/index.html" }` to `vercel.json`
   above the catch-all. (`postbuild` fails the build if you forget.)
3. Render `<PageSeo path="/x" />` in the component.
4. `npm run seo:og -- <slug>` and commit the `.jpg`.

## Dynamic pages

`/blog/:slug` and `/events/:slug` can't be prerendered — a new post ships
without a rebuild. The root `vercel.json` rewrites them to the backend's
`/og/blog/:slug` and `/og/event/:slugOrId`, which use the item's own cover image
and fall back to that section's hero capture.

Those rewrites are **unconditional** — the platform's services router drops
`has` user-agent conditions, so real users hit them too. That's why the backend
returns the real SPA shell with metadata injected (`SpaShellService` +
`injectIntoShell`) rather than a standalone page: the app still boots normally.

## Gotchas

- **Images are JPEG, not PNG.** A 2400×1260 PNG of a dense hero is 2–4 MB;
  q90 JPEG is ~250 KB with no visible loss at unfurl scale.
- **`vite.config.ts` has `globIgnores: ['og/*']`.** Without it, ~3.5 MB of
  images no user ever sees would land in every PWA install's precache.
- **The cookie banner's localStorage key is `edutu_cookie_consent`** —
  underscores, unlike every other key in the app. The capture script pre-accepts
  it, or the banner sits across the hero.
- **Never hand-edit `src/lib/pageSeo.generated.ts`.** A test asserts it matches
  the generator.

## Health checks

```bash
curl -s https://www.edutu.org/blog | grep -E 'og:image|edutu-prerendered'
curl -sI https://www.edutu.org/blog/<slug> | grep -i x-og-source   # backend/og-shell
```

Re-scrape after deploying: [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/),
[LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/). Both cache
the old card until forced.
