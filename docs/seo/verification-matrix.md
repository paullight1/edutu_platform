# Edutu SEO Verification Matrix

This matrix defines the evidence required before merging the P0–P4 SEO hardening work. The pull request checks for the current head SHA are the source of truth; this file must not be used to claim a gate passed without a successful current run.

## P0 — Discovery and server-visible content

| Requirement | Automated evidence | Production evidence |
| --- | --- | --- |
| Live sitemap contains published blog and active opportunity URLs | `SeoController` and `SeoCatalogService` tests; web sitemap generator tests | `GET /sitemap.xml` returns `200`, valid XML, dynamic URLs, and non-zero inventory headers when content exists |
| Production cannot silently publish an incomplete sitemap | `generate-sitemap.test.mjs`; strict Vercel prebuild inventory assertion | Failed inventory returns `503` rather than an empty successful sitemap |
| Blog and opportunity HTML contains meaningful copy before JavaScript | SEO renderer/controller tests | JavaScript-disabled archive and detail inspection |
| SPA functionality remains available on existing React routes | Renderer tests preserve the asset script; web build | Browser hydration smoke test |

## P1 — Crawl paths and status integrity

| Requirement | Automated evidence | Production evidence |
| --- | --- | --- |
| Archive pagination uses crawlable URLs | `seoPagination` and `Pagination` tests; renderer tests | `/blog?page=2` and `/opportunities?page=2` contain adjacent-page anchors and self canonicals |
| Unknown details return real 404 responses | Controller tests | Invalid blog and opportunity URLs return `404`, `noindex`, and `no-store` |
| Temporary dependency failures return retryable errors | Controller tests | Approved staging failure returns `503` and `Retry-After: 300` |
| Root and app routing cannot diverge | `validate-seo-routes.test.mjs` and Repository Governance | Vercel deployment routes resolve without loops or crawler-only conditions |

## P2 — Category authority and structured content

| Requirement | Automated evidence | Production evidence |
| --- | --- | --- |
| First-class scholarship, internship, fellowship, and program hubs | Controller and route-contract tests; sitemap tests | Each category path returns unique H1, title, description, canonical, breadcrumbs, and opportunity anchors |
| Empty source fields are not fabricated | Renderer tests | Representative detail comparison with source records |
| Structured data remains parseable and appropriately scoped | Renderer/controller tests | Rich Results Test and rendered HTML sampling |

## P3 — Responsive, accessible, and performant fallbacks

| Requirement | Automated evidence | Production evidence |
| --- | --- | --- |
| Responsive semantic fallback markup | Renderer tests and web typecheck/build | 320px, 375px, 768px, and desktop no-JavaScript inspection |
| Keyboard-usable pagination and actions | Component tests | Keyboard and focus-visible browser inspection |
| Bounded public caching | Controller tests | Response-header sampling |
| Existing application quality gates remain intact | Web tests, lint, typecheck, build, and PWA validation | Post-deploy browser smoke test |

## P4 — Governance and release safety

| Requirement | Automated evidence | Production evidence |
| --- | --- | --- |
| Backend behavior and compilation | Backend unit tests, E2E, production E2E, lint, and build | API route smoke tests |
| Public routing contract | Repository Governance | Vercel deployment inspection |
| Security baseline | Security audit jobs and public-field projection tests | Public HTML leakage review |
| Operational response | Documentation review | Follow `docs/seo/operations.md` for monitoring and rollback |

## Merge rule

Merge only when all required pull-request checks are successful on the exact current head, the pull request is mergeable against the latest `main`, and final review finds no unresolved P0 or P1 issue. Google Search Console submission, indexing, and ranking improvement are post-deployment external evidence and must not be claimed by the repository merge alone.
