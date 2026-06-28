-- =====================================================
-- UNIFIED BOOKMARKS TABLE
-- Consolidates bookmark functionality into a single table
-- =====================================================

-- Create the unified bookmarks table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.bookmarks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    opportunity_id UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, opportunity_id)
);

-- Enable RLS
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own bookmarks" ON public.bookmarks;
DROP POLICY IF EXISTS "Users can insert own bookmarks" ON public.bookmarks;
DROP POLICY IF EXISTS "Users can delete own bookmarks" ON public.bookmarks;

-- RLS Policies
CREATE POLICY "Users can view own bookmarks"
    ON public.bookmarks FOR SELECT
    USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own bookmarks"
    ON public.bookmarks FOR INSERT
    WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can delete own bookmarks"
    ON public.bookmarks FOR DELETE
    USING (auth.uid()::text = user_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON public.bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_opportunity ON public.bookmarks(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_opportunity ON public.bookmarks(user_id, opportunity_id);

-- =====================================================
-- NOTE: This table replaces the fragmented bookmark system:
-- - `opportunity_bookmarks` (used by goals page)
-- - `user_opportunity_bookmarks` (used by opportunity detail for roadmap tracking)
-- 
-- The `bookmarks` table is now the single source of truth for saving/bookmarking
-- opportunities across the app.
-- 
-- `user_opportunity_bookmarks` is kept for roadmap tracking only (different schema
-- with roadmap_id, status, etc.)
-- =====================================================
