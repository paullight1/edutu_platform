-- Migration 012: Performance Indexes
-- Adds missing database indexes based on common query patterns.

-- ============================================================
-- 1. Opportunities — filtered browsing + full-text search
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_opportunities_category_status_deadline
    ON public.opportunities (category, status, deadline);

CREATE INDEX IF NOT EXISTS idx_opportunities_organization
    ON public.opportunities (organization);

CREATE INDEX IF NOT EXISTS idx_opportunities_cat_status
    ON public.opportunities (category, status)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_opportunities_created_at_desc
    ON public.opportunities (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_opportunities_deadline_asc
    ON public.opportunities (deadline ASC)
    WHERE status = 'active';

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_opportunities_fts
    ON public.opportunities
    USING gin (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,'') || ' ' || coalesce(organization,'')));

-- ============================================================
-- 2. Goals — user filtered lists + calendar view
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_goals_user_status_deadline
    ON public.goals (user_id, status, deadline);

CREATE INDEX IF NOT EXISTS idx_goals_deadline
    ON public.goals (deadline)
    WHERE status = 'active';

-- ============================================================
-- 3. Bookmarks — fast lookup for save/unsave
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_opp_covering
    ON public.bookmarks (user_id, opportunity_id);

-- ============================================================
-- 4. Notifications — unread + sorted
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created
    ON public.user_notifications (user_id, read_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created_desc
    ON public.user_notifications (user_id, created_at DESC);

-- ============================================================
-- 5. Chat messages — thread chronology
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_created
    ON public.chat_messages (thread_id, created_at);

-- ============================================================
-- 6. Roadmaps — browsing by category, creator dashboard
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_community_stories_type_status
    ON public.community_stories (type, visibility)
    WHERE type = 'roadmap';

CREATE INDEX IF NOT EXISTS idx_community_stories_creator
    ON public.community_stories (creator_id);

-- ============================================================
-- 7. Scraping sources — enabled sources by priority
-- ============================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'scraping_sources') THEN
        CREATE INDEX IF NOT EXISTS idx_scraping_sources_enabled_tier
            ON public.scraping_sources (enabled, tier);
    END IF;
END $$;

-- ============================================================
-- 8. Opportunity applications — user dashboard + opportunity stats
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_applications_user_status
    ON public.opportunity_applications (user_id, status);

CREATE INDEX IF NOT EXISTS idx_applications_opportunity
    ON public.opportunity_applications (opportunity_id);

-- ============================================================
-- 9. Full-Text Search Function
-- ============================================================
CREATE OR REPLACE FUNCTION public.search_opportunities(search_query text)
RETURNS SETOF public.opportunities
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT *
    FROM public.opportunities
    WHERE to_tsvector('english',
        coalesce(title, '') || ' ' ||
        coalesce(description, '') || ' ' ||
        coalesce(organization, '')
    ) @@ plainto_tsquery('english', search_query)
    AND status = 'active'
    ORDER BY ts_rank(
        to_tsvector('english',
            coalesce(title, '') || ' ' ||
            coalesce(description, '') || ' ' ||
            coalesce(organization, '')
        ),
        plainto_tsquery('english', search_query)
    ) DESC;
END;
$$;
