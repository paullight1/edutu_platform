# Edutu SEO Operations Runbook

**Scope:** Public blog, opportunity archives, opportunity category hubs, public detail pages, sitemap, robots, status integrity, and post-release search verification.

**Production site:** `https://www.edutu.org`  
**SEO API origin:** `https://edutu-platform.onrender.com`  
**Owner:** Web + API operations

## Release prerequisites

A release is eligible for merge only when all repository checks pass on the current pull-request head:

- Repository Governance, including Vercel schema and SEO route-contract tests.
- Backend unit tests, end-to-end tests, production end-to-end subset, lint, and build.
- Web unit tests, lint, typecheck, build, and PWA validation.
- Security audit jobs.
- No unresolved P0 or P1 review findings.

Do not treat a successful deployment as evidence of indexing or ranking. Those outcomes require Google Search Console and post-release search data.

## Immediate production verification

Run these checks against the public URL after deployment. Preserve status, content type, cache headers, crawler directives, canonical tags, inventory counts, and representative body text as release evidence.

### 1. Sitemap

```bash
curl -fsS -D /tmp/edutu-sitemap.headers \
  https://www.edutu.org/sitemap.xml \
  -o /tmp/edutu-sitemap.xml

grep -iE '^(HTTP/|content-type:|cache-control:|x-edutu-seo-inventory:)' \
  /tmp/edutu-sitemap.headers

grep -E '<loc>https://www\.edutu\.org/(blog/|opportunity/|opportunities/scholarships)' \
  /tmp/edutu-sitemap.xml | head
```

Expected:

- HTTP `200`.
- `Content-Type` contains `application/xml`.
- `X-Edutu-Seo-Inventory` reports non-zero blog and opportunity counts when the live catalog contains published content.
- Individual `/blog/{slug}` and `/opportunity/{id}` URLs are present.
- Category hubs use paths such as `/opportunities/scholarships`, not query-string category URLs.
- No duplicate `<loc>` entries.

Treat HTTP `503`, zero dynamic inventory, malformed XML, or missing expected content types as a release blocker.

### 2. Robots

```bash
curl -fsS -D /tmp/edutu-robots.headers \
  https://www.edutu.org/robots.txt \
  -o /tmp/edutu-robots.txt

cat /tmp/edutu-robots.txt
```

Expected:

- HTTP `200`.
- `Content-Type` contains `text/plain`.
- `Sitemap: https://www.edutu.org/sitemap.xml` appears exactly once.
- Public pages are allowed.
- Authenticated `/app/`, `/admin/`, and auth paths remain disallowed.

### 3. Blog archive pagination

```bash
curl -fsS -D /tmp/edutu-blog.headers \
  'https://www.edutu.org/blog?page=2' \
  -o /tmp/edutu-blog.html

grep -iE '^(HTTP/|content-type:|cache-control:|x-edutu-seo-route:)' \
  /tmp/edutu-blog.headers

grep -E '<link rel="canonical" href="https://www\.edutu\.org/blog\?page=2"' \
  /tmp/edutu-blog.html

grep -E '<a href="/blog/[^" ]+"' /tmp/edutu-blog.html | head

grep -E 'href="/blog\?page=(1|3)"|href="/blog"' \
  /tmp/edutu-blog.html | head
```

Expected:

- HTTP `200`.
- Self-referencing canonical for page 2.
- Article links exist in the initial HTML without executing JavaScript.
- Previous/next or numbered archive links are real anchors.
- The SPA asset script is still present so normal user interaction hydrates.

### 4. Opportunity archive and category hubs

```bash
curl -fsS 'https://www.edutu.org/opportunities?page=2' \
  -o /tmp/edutu-opportunities.html

curl -fsS -D /tmp/edutu-scholarships.headers \
  'https://www.edutu.org/opportunities/scholarships' \
  -o /tmp/edutu-scholarships.html

grep -E '<h1[^>]*>Scholarships for African students</h1>' \
  /tmp/edutu-scholarships.html

grep -E '<link rel="canonical" href="https://www\.edutu\.org/opportunities/scholarships"' \
  /tmp/edutu-scholarships.html

grep -E '<a href="/opportunity/[^" ]+"' \
  /tmp/edutu-scholarships.html | head
```

Expected:

- Generic archive and category pages return HTTP `200`.
- Category hub has a category-specific H1, title, description, canonical, breadcrumbs, and opportunity anchors.
- Category hub remains usable without JavaScript.

Repeat for:

- `/opportunities/internships`
- `/opportunities/fellowships`
- `/opportunities/programs`

### 5. Blog and opportunity details

Choose one published blog slug and one active opportunity ID from the live sitemap.

```bash
curl -fsS 'https://www.edutu.org/blog/REPLACE_WITH_SLUG' \
  -o /tmp/edutu-blog-detail.html

curl -fsS 'https://www.edutu.org/opportunity/REPLACE_WITH_ID' \
  -o /tmp/edutu-opportunity-detail.html

grep -E '<h1[^>]*>[^<]+' /tmp/edutu-blog-detail.html | head -1
grep -E '<h1[^>]*>[^<]+' /tmp/edutu-opportunity-detail.html | head -1
grep -E 'Eligibility|Benefits|How to apply|About this opportunity' \
  /tmp/edutu-opportunity-detail.html
grep -E 'application/ld\+json' /tmp/edutu-blog-detail.html
grep -E 'application/ld\+json' /tmp/edutu-opportunity-detail.html
```

Expected:

- Each returns HTTP `200`.
- Initial HTML contains a descriptive H1 and meaningful body text.
- Opportunity page renders only fields supported by source data; empty sections are omitted.
- Structured data is present and parseable.
- Canonical points to the primary public URL.
- SPA scripts remain present on routes owned by the React app.

### 6. Status integrity

```bash
curl -sS -D /tmp/edutu-missing-blog.headers \
  https://www.edutu.org/blog/seo-verification-missing-record \
  -o /tmp/edutu-missing-blog.html

curl -sS -D /tmp/edutu-missing-opportunity.headers \
  https://www.edutu.org/opportunity/seo-verification-missing-record \
  -o /tmp/edutu-missing-opportunity.html

grep -iE '^(HTTP/|x-robots-tag:|cache-control:)' \
  /tmp/edutu-missing-blog.headers

grep -iE '^(HTTP/|x-robots-tag:|cache-control:)' \
  /tmp/edutu-missing-opportunity.headers
```

Expected for both:

- HTTP `404`, never `200`.
- `X-Robots-Tag: noindex, follow`.
- `Cache-Control: no-store`.
- A useful link back to the appropriate collection.

A controlled content-service failure should return:

- HTTP `503`.
- `Retry-After: 300`.
- `X-Robots-Tag: noindex, follow`.
- No empty successful archive or detail page.

Do not cause a production outage solely to test the failure path. Use staging, a dependency-injection test, or an approved maintenance exercise.

### 7. Responsive and no-JavaScript inspection

For `/blog?page=2`, `/opportunities/scholarships`, a blog detail, and an opportunity detail:

- Disable JavaScript in browser developer tools and reload.
- Verify headings, copy, links, pagination, dates, and application/source links remain available.
- Test viewports at 320px, 375px, 768px, and 1440px.
- Confirm no horizontal page scrolling.
- Confirm keyboard focus reaches every pagination and primary action link.
- Confirm visible focus styles, logical heading order, descriptive link names, and usable touch targets.
- Confirm the hydrated app replaces or coexists with the fallback without a broken route or blank screen.

## Google Search Console follow-up

These steps require authorized Search Console access and are external to the repository merge:

1. Submit `https://www.edutu.org/sitemap.xml` in the Sitemaps report.
2. Confirm Google accepts the sitemap and reports the expected number of discovered URLs.
3. Use URL Inspection for representative pages:
   - `/blog`
   - `/blog?page=2`
   - one blog detail
   - `/opportunities`
   - one category hub
   - one opportunity detail
4. Compare the tested live HTML and screenshot with what Google reports as rendered.
5. Request indexing only for a small representative sample after validating canonical and status behavior.
6. Use Rich Results Test for blog structured data and inspect opportunity pages for valid generic WebPage/Breadcrumb data.
7. Record exact inspection dates and outcomes; do not describe a URL as indexed until Search Console reports it.

## Monitoring

### First 24 hours

- Check `/sitemap.xml` at least twice and compare `X-Edutu-Seo-Inventory` counts.
- Confirm public SEO routes do not produce elevated `404`, `5xx`, or latency rates.
- Verify Render and Vercel logs show no rewrite loop or shell-fetch recursion.
- Sample HTML as both a normal browser user agent and Googlebot-compatible user agent; important content should not depend on user-agent routing.
- Confirm no authenticated or internal fields appear in public opportunity HTML.

### First 7 days

- Review Search Console sitemap processing and Page Indexing reasons.
- Track discovered-versus-indexed counts by blog, opportunity, and category.
- Review crawl errors, duplicate canonicals, soft 404s, and blocked resources.
- Compare Core Web Vitals and mobile usability with the pre-release baseline.
- Check server logs for repeated 503s or inventory drops.

### Ongoing

Alert when:

- Dynamic sitemap blog or opportunity count falls below the configured minimum.
- Sitemap returns non-200 or invalid XML.
- A known published detail URL returns 404.
- A known missing detail URL returns 200.
- Archive response loses article/opportunity anchors.
- P95 response time for SEO HTML materially exceeds the API baseline.

## Rollback

Rollback is appropriate when public SEO routes produce widespread 5xx responses, incorrect status codes, private-field exposure, invalid XML, route loops, or unusable pages.

1. Identify the merge commit that introduced the SEO routing release.
2. Revert that merge through a reviewed pull request; do not force-push `main`.
3. If immediate routing containment is necessary, restore the previous root and app Vercel rewrite entries together so they do not diverge.
4. Keep the API deployment available while routing rollback propagates unless the API itself exposes unsafe content.
5. Re-run the repository Vercel and SEO route validators on the rollback commit.
6. Re-test sitemap, robots, representative details, and 404 behavior after rollback.
7. Record the root cause and add a failing regression test before reintroducing the change.

Do not roll back solely because rankings do not improve immediately. Ranking and indexing changes require crawl and evaluation time; rollback decisions should be based on demonstrable technical regressions or safety concerns.
