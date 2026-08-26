# Edutu SEO Verification Matrix

This matrix defines the evidence required before merging SEO hardening work.
Current-head checks are the source of truth; this file must not be used to
claim a gate passed without fresh successful evidence.

## P0 — Discovery and server-visible content

| Requirement | Automated evidence | Production evidence |
| --- | --- | --- |
| Live sitemap contains published blog and active opportunity URLs | SEO controller tests and web sitemap generator tests | `/sitemap.xml` returns valid XML and non-zero dynamic inventory when content exists |
| Production cannot silently publish an incomplete sitemap | `generate-sitemap.test.mjs`; strict prebuild inventory assertions | Failed inventory returns an error rather than an empty successful sitemap |
| Public HTML contains meaningful copy before JavaScript | SEO renderer and hydration tests | JavaScript-disabled archive and detail inspection |
| Existing SPA behavior remains available | Hydration tests and web build | Browser hydration smoke test |

## P1 — Crawl paths and status integrity

| Requirement | Automated evidence | Production evidence |
| --- | --- | --- |
| Archive pagination uses crawlable URLs | `seoPagination`, pagination, and hydration tests | Page-two archives contain adjacent-page anchors and self canonicals |
| Unknown details return real 404 responses | Backend SEO tests | Invalid public detail URLs return `404`, `noindex`, and `no-store` |
| Temporary dependency failures are retryable | Backend SEO tests | Approved staging failure returns `503` with `Retry-After` |
| Root and standalone web routing cannot diverge | `validate-seo-routes.test.mjs` and Repository Governance | Deployed routes resolve without loops or crawler-only conditions |

## P2 — Category authority and structured content

| Requirement | Automated evidence | Production evidence |
| --- | --- | --- |
| First-class opportunity category hubs | Route, hydration, and sitemap tests | Each category path has unique metadata, canonical, breadcrumbs, and opportunity links |
| Empty source fields are not fabricated | Renderer tests | Representative detail comparison with source records |
| Structured data remains parseable and scoped | Renderer/controller tests | Rich Results Test and rendered HTML sampling |

## P3 — Responsive, accessible, and performant fallbacks

| Requirement | Automated evidence | Production evidence |
| --- | --- | --- |
| Responsive semantic fallback markup | Renderer tests and web typecheck/build | No-JavaScript inspection at mobile, tablet, and desktop widths |
| Keyboard-usable pagination and actions | Component tests | Keyboard and focus-visible browser inspection |
| Bounded public caching | Controller tests | Response-header sampling |
| Existing application quality gates remain intact | Web tests, lint, typecheck, build, and PWA validation | Post-deploy browser smoke test |

## P4 — Governance and release safety

| Requirement | Automated evidence | Production evidence |
| --- | --- | --- |
| Backend behavior and compilation | Backend tests, lint, and build | API route smoke tests |
| Public routing contract | Repository Governance and SEO Quality Gate | Vercel deployment inspection |
| Security baseline | Security checks and public-field projection tests | Public HTML leakage review |
| Operational response | `docs/seo/production-runbook.md` review | Monitoring and rollback rehearsal |

## Merge rule

Merge only when required checks pass on the exact current head and final review
finds no unresolved P0 or P1 issue. Search Console submission, indexing, and
ranking changes are post-deployment evidence and cannot be claimed by a source
merge alone.
