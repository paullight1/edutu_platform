# Edutu SEO Production Runbook

## Purpose

This runbook covers release verification and ongoing search monitoring for Edutu's public opportunity and blog surfaces.

The software release is complete only when the repository gates pass. Search Console indexing, rankings and field Core Web Vitals are external production evidence and must be tracked after deployment rather than claimed from CI.

## Public route ownership

The root `vercel.json` is the single production routing owner.

| Public route | Backend SEO endpoint | Expected behaviour |
| --- | --- | --- |
| `/sitemap.xml` | `/seo/sitemap.xml` | Sitemap index, HTTP 200, XML |
| `/sitemaps/pages.xml` | `/seo/sitemaps/pages.xml` | Static pages and category hubs |
| `/sitemaps/blog.xml` | `/seo/sitemaps/blog.xml` | Published blog posts only |
| `/sitemaps/opportunities.xml` | `/seo/sitemaps/opportunities.xml` | Active verified opportunities only |
| `/sitemaps/events.xml` | `/seo/sitemaps/events.xml` | Published events only |
| `/robots.txt` | `/seo/robots.txt` | Root sitemap reference and private-area exclusions |
| `/blog` | `/seo/blog` | SPA shell plus semantic server-rendered archive |
| `/blog/:slug` | `/seo/blog/:slug` | SPA shell plus article copy, or real 404 |
| `/opportunities` | `/seo/opportunities` | SPA shell plus semantic server-rendered archive |
| `/opportunities/:category` | `/seo/opportunities/:category` | Canonical category landing page |
| `/opportunity/:id` | `/seo/opportunity/:id` | SPA shell plus meaningful detail copy, or real 404 |

Do not add a second static or framework-specific owner for these routes. Modify the consolidated SEO controller and the root route contract together.

## Release gates

Before merge, the exact pull-request head must pass:

1. `SEO Routing Contract`
2. `SEO Backend Contract`
3. `Static Sitemap Fallback Contract`
4. The repository-wide backend tests, production E2E, build and lint jobs
5. The web typecheck, build, tests and lint jobs
6. Vercel configuration validation

The following behaviours are release blocking:

- The sitemap index does not reference all four child sitemaps.
- A configured content API fails but the build still emits a successful empty dynamic sitemap.
- A published blog post or active opportunity cannot appear in its content sitemap.
- Initial archive HTML contains no item links.
- Initial detail HTML contains only metadata and no meaningful page copy.
- Page 2 is reachable only through a JavaScript button.
- Unknown blog or opportunity URLs return HTTP 200.
- Category query URLs appear as sitemap canonicals.
- The SPA bundle disappears from server-injected interactive pages.

## Environment gates

These variables control minimum sitemap inventory:

- `SEO_MIN_BLOG_URLS`
- `SEO_MIN_OPPORTUNITY_URLS`
- `SEO_MIN_EVENT_URLS`

Recommended production values should be set from a known healthy baseline, not guessed. Start with counts below the current inventory, deploy, then increase them deliberately as the catalogue grows.

`SEO_STRICT_REMOTE=1` forces the static build to fail when its configured API cannot be read. `SEO_STRICT_REMOTE=0` is reserved for offline development and the explicit CI fallback test; it should not be used to conceal a production API outage.

## Deployment smoke checks

Run these checks against the deployed public hostname after every SEO-sensitive release:

```bash
curl -fsSI https://www.edutu.org/sitemap.xml
curl -fsS https://www.edutu.org/sitemap.xml | grep sitemapindex
curl -fsS https://www.edutu.org/sitemaps/opportunities.xml | grep '/opportunity/'
curl -fsS https://www.edutu.org/sitemaps/blog.xml | grep '/blog/'
curl -fsS https://www.edutu.org/robots.txt | grep 'Sitemap: https://www.edutu.org/sitemap.xml'
curl -fsS https://www.edutu.org/opportunities | grep 'href="/opportunity/'
curl -fsS 'https://www.edutu.org/blog?page=2' | grep 'rel="prev"'
curl -fsS https://www.edutu.org/opportunities/scholarships | grep '<h1>Scholarships'
curl -fsSI https://www.edutu.org/opportunity/definitely-not-a-real-id | grep '404'
```

Also inspect response headers:

- `Content-Type` matches HTML, XML or text as appropriate.
- `X-Seo-Source` is `backend/seo-shell` for interactive archive/detail pages or `backend/seo-document` for standalone category/not-found pages.
- Missing resources include `X-Robots-Tag: noindex, follow`.
- Public indexable pages do not include `noindex`.

## Google Search Console procedure

After deployment:

1. Submit `https://www.edutu.org/sitemap.xml`.
2. Confirm all four child sitemaps are fetched successfully.
3. Use URL Inspection for at least:
   - the opportunities hub;
   - one category hub;
   - one recent opportunity;
   - the blog hub;
   - one recent blog article;
   - page 2 of either archive.
4. Compare Google's rendered HTML with the user-visible page. The important title, body copy and internal links must be present before relying on JavaScript.
5. Request indexing only for representative or strategically important URLs. Do not use repeated manual requests as a substitute for crawlable architecture.
6. Record coverage reasons, crawl dates and indexing outcomes in the SEO operating log.

## Content publishing checklist

An opportunity is ready for search only when the stored source supports the claims shown. Populate these fields when available:

- Accurate title and provider
- Concise original summary
- Factual description without advert or navigation copy
- Canonical category
- Deadline and timezone where relevant
- Eligible countries, regions or applicant groups
- Funding or stipend details
- Benefits
- Requirements and required documents
- Application steps
- Official source URL
- Official application URL
- Last reviewed or updated date

Do not invent exact funding, eligibility, nationality, deadline or application facts. When a fact is absent, omit it and direct the applicant to the official provider.

A blog article should have:

- One clear search intent
- A descriptive title and excerpt
- An identifiable author or editorial owner
- Published and updated dates
- Original, useful guidance rather than copied opportunity text
- Links to relevant category hubs and current opportunities
- Links to authoritative external sources where claims require them

## Core Web Vitals and mobile review

CI proves build correctness, not field performance. Review Search Console Core Web Vitals and production real-user monitoring for:

- Largest Contentful Paint
- Interaction to Next Paint
- Cumulative Layout Shift
- Image dimensions and transfer size
- Font loading
- Backend archive response latency
- JavaScript execution on the interactive SPA

Test at 320px, 375px, 768px and desktop widths. The server-rendered fallback must not create horizontal overflow, tiny tap targets or layout shifts before React replaces it.

## Incident and rollback rules

Rollback or hotfix when any of the following occurs:

- Root sitemap or robots returns 5xx for more than one monitoring interval.
- A child sitemap loses a material share of known healthy URLs without an intentional content lifecycle change.
- Public archive/detail routes return the generic SPA shell without semantic fallback content.
- Valid opportunity or article URLs become 404.
- Missing URLs become 200 soft 404s.
- Canonicals point to a different host, a query-filter duplicate or the wrong content item.
- The SEO backend rewrite prevents the SPA bundle from loading on supported interactive routes.

When a content source is unavailable, return a failure and alert rather than replacing the sitemap with a successful empty inventory. Preserve the last known healthy deployment until the source is restored.

## External evidence log

For each release, record:

- Merge commit
- Deployment identifier
- Smoke-check date and operator
- Sitemap URL counts by child sitemap
- Search Console submission date
- Representative URL Inspection results
- Core Web Vitals status
- Any indexing exclusions and their cause
- Follow-up owner and target date

Rankings are outcomes influenced by competition, authority, content usefulness and time. Report them separately from software readiness and never describe a CI pass as proof of ranking improvement.
