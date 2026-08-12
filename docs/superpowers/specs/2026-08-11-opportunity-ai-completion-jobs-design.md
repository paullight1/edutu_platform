# Opportunity AI Completion Jobs Design

## Goal

Replace the fragile browser-owned bulk “AI Complete” loop with a durable backend job and a progress dialog that makes token-consuming work explicit, observable, and recoverable after navigation or refresh.

## User experience

Clicking “AI Complete” opens a confirmation dialog before any AI request is made. The dialog states how many opportunities will be queued and explains that records already completed recently are skipped to avoid unnecessary AI spend.

After confirmation, the dialog moves through starting, running, and finished states. While running it shows a determinate progress bar, the current opportunity title, and completed, skipped, and failed counts. The admin may close the dialog and keep working; the toolbar continues to show background progress. Returning to the page reconnects to the same job. The finished state remains available until acknowledged and refreshes the opportunity list.

## Backend architecture

`opportunity_ai_completion_jobs` is the persistent source of truth. A row stores the selected opportunity IDs, the next array index, counters, current item, errors, timestamps, and a worker lease. A partial unique index permits only one queued or running job, preventing overlapping bulk jobs and duplicate provider spend.

`OpportunityEnrichmentJobService` creates or returns the active job, exposes job status, and runs the worker. Work is sequential to respect provider limits. Progress and a heartbeat are persisted after every item. On application start and on a short interval, a worker claims queued jobs or stale leases and resumes from `next_index`. A crash after a successful enhancement is safe because bulk enhancement skips a recently completed, high-quality opportunity when it is encountered again.

## Token controls

- No AI call occurs until the confirmation button is pressed.
- Only one bulk completion job may run at a time.
- A record with `metadata.ai_improved_at` within 30 days and quality score at least 70 is skipped.
- The explicit single-row improve action remains forceful; the bulk background worker uses skip-if-fresh behavior.
- Progress distinguishes skipped records from AI-completed records.

## API

- `POST /opportunities/admin/enrichment/jobs` with `{ ids: string[] }` creates a job or returns the active job.
- `GET /opportunities/admin/enrichment/jobs/active` returns the queued/running job or `null`.
- `GET /opportunities/admin/enrichment/jobs/:id` returns a job by ID so the browser can reconnect to a completed job stored locally.

All routes use the existing `AdminGuard`. The selection remains capped by the existing bulk UUID schema.

## Failure handling

An individual opportunity failure is recorded and processing continues. A job finishes as `completed_with_errors` when any item fails. A fatal worker error marks the job `failed`. A stale worker lease can be claimed by another instance; the job resumes at its persisted index.

## Testing

Backend tests cover freshness decisions, job creation/idempotency, sequential progress, per-item failure continuation, and resume behavior. Admin component tests cover confirmation-before-start, running progress, background dismissal, and the completed summary. Existing backend tests, admin tests, lint/type checks, and builds remain green.

