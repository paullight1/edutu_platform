# Edutu SEO Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Edutu's public blog and opportunity surfaces reliably discoverable and indexable with live sitemaps, crawler-visible HTML, crawlable pagination, authoritative category hubs, correct HTTP status codes, responsive fallbacks, and enforceable CI contracts.

**Architecture:** Add a focused `SeoModule` to the canonical NestJS API. It consumes the existing exported Blog and Opportunities services, renders escaped public HTML through pure helpers, injects crawler fallbacks into the current SPA shell for existing React routes, and serves standalone category hubs. Root Vercel routing becomes the production source of truth and the app-level configuration mirrors it. Small frontend pagination helpers keep the hydrated blog archive URL-addressable.

**Tech Stack:** NestJS 11, TypeScript 5.7, Jest 30, React 18, React Router, Vitest 4, Vite 8, Vercel multi-service routing.

**Spec:** `docs/seo/edutu-search-foundation.md`

## Global Constraints

- Do not alter recommendation, ranking, personalization, billing, community, mobile, or admin behavior.
- Do not expose internal or paid opportunity fields.
- Do not fabricate eligibility, funding, deadlines, verification, authorship, or application facts.
- Escape all database-derived HTML and JSON-LD values.
- Keep current public detail URLs working.
- Return `404` for unknown or unpublished detail records and `503` for temporary content-service failures.
- Add `noindex` directives to error responses.
- Preserve SPA scripts and assets on routes that already exist in React.
- Category hubs must remain useful without JavaScript.
- All production changes require regression tests and the existing repository CI gates.

---

### Task 1: Pure SEO HTML and XML renderer

**Files:**
- Create: `backend/services/services/api/src/seo/seo-page.render.ts`
- Test: `backend/services/services/api/src/seo/seo-page.render.spec.ts`

**Interfaces:**
- Produces: `renderSeoPage(input: SeoPageInput): string`
- Produces: `renderPagination(input: PaginationInput): string`
- Produces: `renderBlogArchiveBody(input: BlogArchiveInput): string`
- Produces: `renderBlogPostBody(post: PublicBlogPost): string`
- Produces: `renderOpportunityArchiveBody(input: OpportunityArchiveInput): string`
- Produces: `renderOpportunityBody(opportunity: PublicOpportunity): string`
- Produces: `renderSitemap(entries: SitemapEntry[]): string`
- Produces: `renderRobots(siteUrl: string): string`
- Consumes: `injectIntoShell` and `OgPageMeta` from `src/og/`.

- [ ] **Step 1: Write failing renderer tests**

Add Jest tests proving:

```ts
expect(renderPagination({ basePath: "/blog", page: 2, totalPages: 4 }))
  .toContain('href="/blog?page=3"');
expect(renderSeoPage({ shell: SPA_SHELL, meta, bodyHtml: "<main>Real copy</main>" }))
  .toContain("Real copy");
expect(renderSeoPage({ shell: SPA_SHELL, meta, bodyHtml: "<main>Real copy</main>" }))
  .toContain('/assets/index.js');
expect(renderOpportunityBody(maliciousOpportunity)).not.toContain("<script>");
expect(renderSitemap(entries)).toContain("&amp;");
```

Also assert semantic `main`, `article`, `nav`, responsive viewport/CSS, canonical metadata, valid JSON-LD escaping, omitted empty sections, and `aria-current="page"`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `cd backend/services/services/api && npm test -- --runInBand src/seo/seo-page.render.spec.ts`

Expected: FAIL because `seo-page.render.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure renderer**

Implement all exported interfaces with these rules:

```ts
export interface SeoPageInput {
  shell: string | null;
  meta: OgPageMeta;
  bodyHtml: string;
  robots?: "index, follow, max-image-preview:large" | "noindex, follow";
}
```

- Escape every database value through existing `attr`, `textContent`, `clean`, and `toPlainText` helpers.
- Call `injectIntoShell()` for metadata, then replace only the empty `#root` with escaped fallback markup.
- Preserve scripts/assets when a valid shell is available.
- Render a standalone responsive document when no shell is available.
- Build pagination from actual `<a href>` elements.
- Render XML with escaped absolute URLs and ISO date-only `lastmod` values.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `cd backend/services/services/api && npm test -- --runInBand src/seo/seo-page.render.spec.ts`

Expected: PASS with zero warnings.

- [ ] **Step 5: Commit**

```bash
git add backend/services/services/api/src/seo/seo-page.render.ts \
  backend/services/services/api/src/seo/seo-page.render.spec.ts
git commit -m "feat(seo): add safe public page renderer"
```

### Task 2: SEO catalog service and live sitemap inventory

**Files:**
- Create: `backend/services/services/api/src/seo/seo-catalog.service.ts`
- Test: `backend/services/services/api/src/seo/seo-catalog.service.spec.ts`

**Interfaces:**
- Consumes: `BlogService.findAll`, `BlogService.peekBySlug`, `OpportunitiesService.findAll`, `OpportunitiesService.findOne`, `OpportunitiesService.getPublicAppBaseUrl`.
- Produces: `getBlogPage(page: number, pageSize: number): Promise<PagedBlogPosts>`
- Produces: `getBlogPost(slug: string): Promise<PublicBlogPost | null>`
- Produces: `getOpportunityPage(page: number, pageSize: number, category?: SeoCategory): Promise<PagedOpportunities>`
- Produces: `getOpportunity(id: string): Promise<PublicOpportunity | null>`
- Produces: `getSitemapInventory(): Promise<SeoInventory>`
- Produces: `getSiteUrl(): string`

- [ ] **Step 1: Write failing service tests**

Mock the existing services and prove:

```ts
expect(await service.getBlogPage(2, 12)).toMatchObject({ page: 2, hasNext: true });
expect(blog.findAll).toHaveBeenCalledWith(expect.objectContaining({ limit: 13, offset: 12 }));
expect(await service.getOpportunityPage(1, 24, "scholarships"))
  .toMatchObject({ page: 1, category: "scholarships" });
expect(inventory.blogPosts).toHaveLength(2);
expect(inventory.opportunities).toHaveLength(3);
```

Add tests for page clamping, one-extra-row next-page detection, category mapping, duplicate IDs/slugs, unpublished blog filtering, a 5,000-opportunity inventory ceiling, and propagation of real service failures.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `cd backend/services/services/api && npm test -- --runInBand src/seo/seo-catalog.service.spec.ts`

Expected: FAIL because `SeoCatalogService` does not exist.

- [ ] **Step 3: Implement the minimal catalog adapter**

- Request one extra row for archive next-page detection.
- Project only fields needed for public rendering.
- Map SEO categories to the existing service category vocabulary.
- Paginate sitemap inventory in bounded batches.
- Do not catch database/service failures inside inventory methods; the controller must distinguish a temporary failure from a legitimately empty catalog.
- Canonicalize `edutu.org` to `www.edutu.org`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `cd backend/services/services/api && npm test -- --runInBand src/seo/seo-catalog.service.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/services/services/api/src/seo/seo-catalog.service.ts \
  backend/services/services/api/src/seo/seo-catalog.service.spec.ts
git commit -m "feat(seo): add bounded public catalog adapter"
```

### Task 3: Public SEO controller and module

**Files:**
- Create: `backend/services/services/api/src/seo/seo.controller.ts`
- Create: `backend/services/services/api/src/seo/seo.controller.spec.ts`
- Create: `backend/services/services/api/src/seo/seo.module.ts`
- Modify: `backend/services/services/api/src/app.module.ts`

**Interfaces:**
- Consumes: `SeoCatalogService`, `SpaShellService`, renderer functions from Task 1.
- Produces routes:
  - `GET /seo/sitemap.xml`
  - `GET /seo/robots.txt`
  - `GET /seo/blog`
  - `GET /seo/blog/:slug`
  - `GET /seo/opportunities`
  - `GET /seo/opportunities/:category`
  - `GET /seo/opportunity/:id`
  - `GET /seo/share/opportunity/:id`
  - `GET /seo/inventory`

- [ ] **Step 1: Write failing controller tests**

Instantiate the controller with mocked catalog/shell services and assert:

```ts
expect(res.statusCode).toBe(200);
expect(html).toContain('<a href="/blog?page=2"');
expect(html).toContain("Eligibility");
expect(html).toContain("application/ld+json");
```

Add explicit tests for:

```ts
expect(missingRes.statusCode).toBe(404);
expect(missingRes.headers["x-robots-tag"]).toContain("noindex");
expect(failedRes.statusCode).toBe(503);
expect(failedRes.headers["retry-after"]).toBe("300");
```

Verify `Content-Type`, cache policy, canonical URLs including `page`, category-specific titles, standalone category pages, sitemap counts, robots sitemap reference, and preservation of SPA assets on existing React routes.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `cd backend/services/services/api && npm test -- --runInBand src/seo/seo.controller.spec.ts`

Expected: FAIL because the controller and module do not exist.

- [ ] **Step 3: Implement routes and response policy**

- Decorate all routes with `@Public()` and bounded throttles.
- Parse positive page numbers only; invalid values become page 1.
- Use `200` for valid pages, `404` for unknown/unpublished detail records, and `503` for service failures.
- Set `X-Robots-Tag: noindex, follow` on error responses.
- Set `Retry-After: 300` on `503`.
- Use `public, max-age=0, s-maxage=300, stale-while-revalidate=900` for detail/archive HTML and a shorter cache for inventory diagnostics.
- Include `X-Edutu-Seo-Inventory` with non-sensitive counts on successful sitemap responses.
- Register `SeoModule` in `AppModule`.

- [ ] **Step 4: Run controller, module, backend tests, and build**

Run:

```bash
cd backend/services/services/api
npm test -- --runInBand src/seo/seo.controller.spec.ts
npm test -- --runInBand src/seo
npm run build
npm run lint
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add backend/services/services/api/src/seo \
  backend/services/services/api/src/app.module.ts
git commit -m "feat(seo): serve crawlable public archives and details"
```

### Task 4: Production routing contract

**Files:**
- Modify: `vercel.json`
- Modify: `edutu-web-app/vercel.json`
- Create: `scripts/validate-seo-routes.mjs`
- Create: `scripts/validate-seo-routes.test.mjs`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Routes public URLs to the API SEO endpoints without changing canonical user-facing URLs.
- Produces: `validateSeoRoutes(rootConfig, appConfig): string[]`.

- [ ] **Step 1: Write the failing repository contract test**

Assert both configurations include the same ordered public contract:

```js
[
  ["/sitemap.xml", "/seo/sitemap.xml"],
  ["/robots.txt", "/seo/robots.txt"],
  ["/blog", "/seo/blog"],
  ["/blog/:slug", "/seo/blog/:slug"],
  ["/opportunities", "/seo/opportunities"],
  ["/opportunities/:category", "/seo/opportunities/:category"],
  ["/opportunity/:id", "/seo/opportunity/:id"],
  ["/share/opportunity/:id", "/seo/share/opportunity/:id"],
]
```

The destination origin is `https://edutu-platform.onrender.com`. Assert specific routes precede catch-alls and that no crawler-UA-only route remains.

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test scripts/validate-seo-routes.test.mjs`

Expected: FAIL because the current root and app-level rules diverge.

- [ ] **Step 3: Implement the route validator and update both configurations**

- Put sitemap, robots, archive, category, and detail rewrites before static/catch-all rules.
- Remove the app-only user-agent gate.
- Keep events and non-SEO service routing unchanged.
- Add `node --test scripts/validate-seo-routes.test.mjs` and `node scripts/validate-seo-routes.mjs` to Repository Governance.

- [ ] **Step 4: Verify route governance GREEN**

Run:

```bash
node --test scripts/validate-seo-routes.test.mjs
node scripts/validate-seo-routes.mjs
node scripts/validate-vercel-config.mjs
```

Expected: all exit 0.

- [ ] **Step 5: Commit**

```bash
git add vercel.json edutu-web-app/vercel.json scripts/validate-seo-routes* .github/workflows/ci.yml
git commit -m "fix(seo): unify crawler routes across deployments"
```

### Task 5: Fail-closed build sitemap and category URLs

**Files:**
- Modify: `edutu-web-app/scripts/generate-sitemap.mjs`
- Create: `edutu-web-app/scripts/generate-sitemap.test.mjs`
- Modify: `edutu-web-app/package.json`
- Modify: `edutu-web-app/public/sitemap.xml`
- Modify: `edutu-web-app/public/robots.txt`

**Interfaces:**
- Produces: exported pure helpers `assertInventory`, `buildSitemapEntries`, and `normaliseSiteUrl`.
- The generated files remain a static fallback; production `/sitemap.xml` is served dynamically by Task 3.

- [ ] **Step 1: Write failing sitemap tests**

Use Node's built-in test runner to assert:

```js
assert.throws(
  () => assertInventory({ opportunities: [], blogPosts: [] }, { strict: true }),
  /SEO sitemap inventory is incomplete/,
);
assert.equal(
  categoryEntry.loc,
  "https://www.edutu.org/opportunities/scholarships",
);
```

Also test duplicate removal, date normalization, XML escaping, environment-controlled minimum counts, and non-strict local fallback behavior.

- [ ] **Step 2: Run and verify RED**

Run: `cd edutu-web-app && node --test scripts/generate-sitemap.test.mjs`

Expected: FAIL because the generator is not importable and has no inventory assertion.

- [ ] **Step 3: Refactor and implement fail-closed deployment behavior**

- Export pure helpers without executing `main()` during imports.
- Default the API origin to the production API when no build env is present.
- Apply request timeouts and bounded retries.
- Enable strict inventory checks when `VERCEL=1` or `SEO_SITEMAP_STRICT=true`.
- Use `SEO_MIN_OPPORTUNITY_URLS` and `SEO_MIN_BLOG_URLS`, each defaulting to `1` in strict mode.
- Replace query-string category sitemap entries with first-class category paths.
- Add `seo:test` and run it before sitemap generation.

- [ ] **Step 4: Verify tests and build**

Run:

```bash
cd edutu-web-app
npm run seo:test
npm run seo:sitemap
npm run typecheck
npm run build
```

Expected: all commands exit 0 in non-strict CI/local mode; a dedicated test proves strict mode fails on an empty inventory.

- [ ] **Step 5: Commit**

```bash
git add edutu-web-app/scripts/generate-sitemap* edutu-web-app/package.json \
  edutu-web-app/public/sitemap.xml edutu-web-app/public/robots.txt
git commit -m "fix(seo): fail closed on empty deployment inventory"
```

### Task 6: Crawlable hydrated blog pagination

**Files:**
- Create: `edutu-web-app/src/lib/seoPagination.ts`
- Test: `edutu-web-app/src/lib/seoPagination.test.ts`
- Modify: `edutu-web-app/src/components/ui/Pagination.tsx`
- Test: `edutu-web-app/src/components/ui/Pagination.test.tsx`
- Modify: `edutu-web-app/src/components/BlogPage.tsx`

**Interfaces:**
- Produces: `parsePageParam(value: string | null, totalPages?: number): number`
- Produces: `buildPageHref(pathname: string, search: URLSearchParams, page: number): string`
- Extends `PaginationProps` with optional `getPageHref(page: number): string`.

- [ ] **Step 1: Write failing pagination tests**

Assert:

```ts
expect(parsePageParam("2")).toBe(2);
expect(parsePageParam("-4")).toBe(1);
expect(buildPageHref("/blog", new URLSearchParams("topic=ai"), 3))
  .toBe("/blog?topic=ai&page=3");
```

Render `Pagination` with `getPageHref` and verify previous, next, and numbered controls are anchors while the current page carries `aria-current="page"`.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
cd edutu-web-app
npm test -- --run src/lib/seoPagination.test.ts src/components/ui/Pagination.test.tsx
```

Expected: FAIL because helper and prop do not exist.

- [ ] **Step 3: Implement the minimal client behavior**

- Preserve button rendering for existing callers that do not provide `getPageHref`.
- For anchor mode, prevent default only to perform smooth in-app page state updates; keep a real `href` for crawlers and no-JS navigation.
- Initialize BlogPage from `page` query state.
- Update the query on page changes and remove `page` when returning to page 1.
- Reset to page 1 when search terms change.
- Pass a canonical page-specific `path` to `Seo` when page is greater than 1.

- [ ] **Step 4: Verify web tests and compile**

Run:

```bash
cd edutu-web-app
npm test -- --run src/lib/seoPagination.test.ts src/components/ui/Pagination.test.tsx
npm run typecheck
npm run lint
npm run build
```

Expected: all exit 0.

- [ ] **Step 5: Commit**

```bash
git add edutu-web-app/src/lib/seoPagination* \
  edutu-web-app/src/components/ui/Pagination* \
  edutu-web-app/src/components/BlogPage.tsx
git commit -m "feat(seo): make blog pagination addressable and crawlable"
```

### Task 7: Operations runbook and final release verification

**Files:**
- Create: `docs/seo/operations.md`
- Modify: `docs/superpowers/plans/2026-08-23-edutu-seo-hardening.md`

**Interfaces:**
- Documents production verification and external-only follow-up without claiming Search Console access.

- [ ] **Step 1: Write the runbook**

Include exact checks for:

```text
GET /sitemap.xml → 200 application/xml
GET /robots.txt → 200 text/plain
GET /blog?page=2 → 200 with article anchors and self canonical
GET /opportunities/scholarships → 200 with category-specific H1
GET invalid blog/opportunity → 404 + noindex
GET backend failure simulation → 503 + Retry-After
```

Document Google Search Console sitemap submission, URL Inspection sampling, Rich Results Test sampling, production inventory-count comparison, rollback to the previous root rewrite commit, and a post-deploy 24-hour/7-day monitoring checklist.

- [ ] **Step 2: Run full fresh verification**

Run through CI or equivalent clean commands:

```bash
node --test scripts/validate-seo-routes.test.mjs
node scripts/validate-seo-routes.mjs
cd backend/services/services/api && npm ci && npm test && npm run test:e2e && npm run test:e2e:production && npm run lint && npm run build
cd ../../../../.. && cd edutu-web-app && npm ci && npm run seo:test && npm run test && npm run lint && npm run typecheck && npm run build
```

Expected: zero failures.

- [ ] **Step 3: Review requirements line by line**

Verify every P0–P4 acceptance gate in `docs/seo/edutu-search-foundation.md`, record any genuinely external follow-up, and mark completed plan checkboxes only with evidence.

- [ ] **Step 4: Request code review**

Review the diff from the branch base to HEAD for security, public-data leakage, HTML escaping, route order, status correctness, caching, duplicate canonicals, and unrelated scope. Fix every Critical or Important finding before merge.

- [ ] **Step 5: Reconfirm latest main and merge**

- Fetch the current `main` SHA.
- Confirm the pull request is mergeable and all required checks are successful.
- Update/rebase safely if `main` moved.
- Merge without force and verify the resulting `main` SHA includes the SEO commits.
- Do not claim Search Console submission or ranking gains; those require post-deploy external evidence.
