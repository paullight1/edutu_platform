-- Performance: composite indexes so hot filter+sort queries use an index scan
-- instead of scanning + sorting in memory.

-- Opportunities feed: WHERE status [+ category] ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS opportunities_status_created_idx
  ON public.opportunities (status, created_at DESC);
CREATE INDEX IF NOT EXISTS opportunities_status_category_created_idx
  ON public.opportunities (status, category, created_at DESC);

-- Recommendation candidate fetch filters/sorts on close_date / updated_at.
CREATE INDEX IF NOT EXISTS opportunities_close_date_idx
  ON public.opportunities (close_date);
CREATE INDEX IF NOT EXISTS opportunities_status_updated_idx
  ON public.opportunities (status, updated_at DESC);

-- Roadmaps listing: WHERE status ORDER BY is_featured DESC, rating_avg DESC, created_at DESC
CREATE INDEX IF NOT EXISTS roadmaps_status_featured_rating_idx
  ON public.roadmaps (status, is_featured DESC, rating_avg DESC, created_at DESC);

-- Roadmap title search uses ILIKE '%term%' → trigram GIN for index-assisted search.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS roadmaps_title_trgm_idx
  ON public.roadmaps USING gin (title gin_trgm_ops);
