-- Index the scrape-batch key.
--
-- A scrape batch is identified by opportunities.metadata->>'scrape_job_id'
-- (a JSONB key — there is no column and no FK). Every per-batch operation
-- filters on it with equality:
--   * scraper.service.ts getJobOpportunities()      → .eq("metadata->>scrape_job_id", jobId)
--   * scraper.service.ts deleteJobWithOpportunities() → same filter, then delete
--   * GET /api/scraper/sites                        → groups by the same expression
--
-- Unindexed, those were sequential scans. That costs far more than the row
-- count suggests, because `opportunities` rows are wide (they carry an
-- `embedding` vector plus full description text): measured at 1751 shared
-- buffers (~14MB) and ~54ms just to find 0 matching rows among 513.
--
-- Partial on IS NOT NULL: rows scraped before the key existed can never match
-- an equality lookup, so indexing them wastes space. The planner can prove
-- `expr = $1` implies `expr IS NOT NULL`, so the partial index is still used
-- for these queries. (A `metadata ? 'scrape_job_id'` predicate would NOT be
-- provable from a `->>` equality and the index would sit unused.)
--
-- Plain CREATE INDEX rather than CONCURRENTLY: this table is small, so the
-- brief write lock is negligible, and CONCURRENTLY cannot run inside the
-- transaction a migration executes in. Revisit if this table grows large.
create index if not exists opportunities_scrape_job_id_idx
  on public.opportunities ((metadata ->> 'scrape_job_id'))
  where (metadata ->> 'scrape_job_id') is not null;
