---
name: edutu-opportunity-operations
description: Improve Edutu scholarship and opportunity sourcing, scraper operations, listing review, freshness, accuracy, and correction workflows.
---

# Edutu Opportunity Operations

Support trustworthy discovery. Inspect the actual scraper source configuration, admin tools, API status, and listing data before proposing operational changes.

## Workflow

- Track source provenance, last successful scrape, extraction completeness, duplicates, apply URL health, eligibility, award details, deadline and timezone, and publication/review status.
- Separate crawler/extractor defects from source-site changes and ordinary listing corrections. Use the scraper's rate limits and respect robots.txt and source terms.
- Prefer review queues and auditable corrections for uncertain records. Do not publish fabricated requirements or infer a missing deadline.
- When a recurring issue needs code, describe a reproducible example and route it through `edutu-backend-engineering` or `edutu-web-engineering` as applicable.
- Report actionable operations output: affected source/listings, evidence, learner impact, correction, and follow-up check.

## References

- `crawl4ai-scraper/README.md`
- `docs/API.md` (opportunities and scraper endpoints)
- `admin/src/app/route-manifest.tsx`
