# Edutu Impact / Research Report (PDF source)

The downloadable **Research Report No.001 — "The Opportunity Gap"** shipped at
`public/reports/edutu-opportunity-gap-report.pdf` is generated from the
print-optimized HTML in this folder. A PDF isn't editable in place, so **edit
`report.html` and re-render** when the content or numbers change.

Files:
- `report.html` — the full report (cover, executive summary, findings, charts,
  regional table, recommendations, conclusion, sources). Self-contained; the
  only asset is `logo-sm.png`.
- `logo-sm.png` — small (140px) copy of the Edutu logo used on the cover, kept
  tiny so the PDF stays light.

## Regenerate the PDF

Uses headless Google Chrome (no extra dependencies):

```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"   # macOS
"$CHROME" --headless=new --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="../../public/reports/edutu-opportunity-gap-report.pdf" \
  "file://$PWD/report.html"
```

Then commit the updated `public/reports/edutu-opportunity-gap-report.pdf`.

## Where it's surfaced
- **Impact page** (`src/components/ImpactPage.tsx`) — the "Annual impact reports"
  section links to the PDF via `IMPACT_REPORT_PDF` (a `download` link).
- **Blog** — the post `the-opportunity-gap-report` (author *Edutu Research Team*,
  tag *research*) embeds the same download link. The post lives in the
  `blog_posts` table, not in the repo.

Keep the served path (`/reports/edutu-opportunity-gap-report.pdf`) stable, or
update both surfaces if you rename it.
