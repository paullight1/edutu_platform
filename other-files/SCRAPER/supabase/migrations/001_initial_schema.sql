-- Edutu Scraper Engine - Initial Schema Migration
-- Run this in Supabase SQL Editor to set up the scraper tables

-- ============================================
-- SCRAPING SOURCES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS scraping_sources (
    id SERIAL PRIMARY KEY,
    url TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    tier INT DEFAULT 1 CHECK (tier IN (1, 2, 3)), -- 1=aggregator, 2=direct, 3=hidden
    category TEXT DEFAULT 'general',
    enabled BOOLEAN DEFAULT true,
    priority INT DEFAULT 1,
    config JSONB DEFAULT '{}',
    rate_limit_requests INT DEFAULT 10, -- requests per minute
    rate_limit_delay_ms INT DEFAULT 2000, -- delay between requests
    max_concurrent INT DEFAULT 3,
    timeout_ms INT DEFAULT 30000,
    last_scraped TIMESTAMP WITH TIME ZONE,
    last_success TIMESTAMP WITH TIME ZONE,
    last_error TEXT,
    consecutive_failures INT DEFAULT 0,
    total_scraped INT DEFAULT 0,
    total_failed INT DEFAULT 0,
    total_urls_discovered INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for scraping_sources
CREATE INDEX IF NOT EXISTS idx_scraping_sources_enabled ON scraping_sources(enabled);
CREATE INDEX IF NOT EXISTS idx_scraping_sources_priority ON scraping_sources(priority ASC);
CREATE INDEX IF NOT EXISTS idx_scraping_sources_tier ON scraping_sources(tier);

-- ============================================
-- SCRAPED URLS CACHE (Deduplication)
-- ============================================

CREATE TABLE IF NOT EXISTS scraped_urls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url TEXT NOT NULL UNIQUE,
    source_id INT REFERENCES scraping_sources(id) ON DELETE SET NULL,
    opportunity_id UUID, -- Will reference opportunities table after it's created
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed', 'skipped')),
    http_status INT,
    content_hash TEXT,
    first_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_checked TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for scraped_urls
CREATE INDEX IF NOT EXISTS idx_scraped_urls_url ON scraped_urls(url);
CREATE INDEX IF NOT EXISTS idx_scraped_urls_status ON scraped_urls(status);
CREATE INDEX IF NOT EXISTS idx_scraped_urls_source_id ON scraped_urls(source_id);

-- ============================================
-- SCRAPE LOGS (Audit Trail)
-- ============================================

CREATE TABLE IF NOT EXISTS scrape_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id INT REFERENCES scraping_sources(id) ON DELETE SET NULL,
    run_type TEXT NOT NULL CHECK (run_type IN ('manual', 'scheduled', 'continuous', 'bulk')),
    status TEXT NOT NULL CHECK (status IN ('started', 'running', 'completed', 'failed', 'partial')),
    urls_discovered INT DEFAULT 0,
    urls_scraped INT DEFAULT 0,
    urls_saved INT DEFAULT 0,
    urls_skipped INT DEFAULT 0,
    urls_failed INT DEFAULT 0,
    errors JSONB DEFAULT '[]',
    warnings JSONB DEFAULT '[]',
    duration_seconds INT,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for scrape_logs
CREATE INDEX IF NOT EXISTS idx_scrape_logs_source_id ON scrape_logs(source_id);
CREATE INDEX IF NOT EXISTS idx_scrape_logs_status ON scrape_logs(status);
CREATE INDEX IF NOT EXISTS idx_scrape_logs_created_at ON scrape_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scrape_logs_run_type ON scrape_logs(run_type);

-- ============================================
-- OPPORTUNITIES TABLE EXTENSIONS (Source Tracking)
-- ============================================

-- Add source tracking columns to opportunities if they don't exist
ALTER TABLE opportunities 
    ADD COLUMN IF NOT EXISTS source_url TEXT,
    ADD COLUMN IF NOT EXISTS source_name TEXT,
    ADD COLUMN IF NOT EXISTS source_id INT REFERENCES scraping_sources(id),
    ADD COLUMN IF NOT EXISTS scraped_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS confidence_score INT CHECK (confidence_score >= 0 AND confidence_score <= 100),
    ADD COLUMN IF NOT EXISTS scrape_errors JSONB;

-- Add indexes for opportunities source tracking
CREATE INDEX IF NOT EXISTS idx_opportunities_source_url ON opportunities(source_url);
CREATE INDEX IF NOT EXISTS idx_opportunities_source_id ON opportunities(source_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_scraped_at ON opportunities(scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_opportunities_confidence ON opportunities(confidence_score);

-- ============================================
-- SCRAPER CONFIG TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS scraper_config (
    id SERIAL PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    value JSONB NOT NULL,
    description TEXT,
    is_secret BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Default configuration
INSERT INTO scraper_config (key, value, description, is_secret) VALUES
    ('global_rate_limit', '{"requests_per_minute": 10, "delay_between_ms": 2000}', 'Global rate limiting configuration', false),
    ('global_concurrency', '{"max_concurrent": 3, "max_retries": 3, "retry_delay_ms": 1000}', 'Global concurrency settings', false),
    ('confidence_threshold', '{"min_acceptance": 50, "auto_approve": 80}', 'Confidence score thresholds', false),
    ('feature_flags', '{"screenshot_on_failure": true, "parallel_sources": false, "auto_disable_source": true}', 'Feature toggles', false)
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- ROW LEVEL SECURITY (Optional - for production)
-- ============================================

-- Enable RLS on scraper tables
ALTER TABLE scraping_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraped_urls ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraper_config ENABLE ROW LEVEL SECURITY;

-- Service role policy (allows all operations)
CREATE POLICY "Service role can manage scraping_sources" ON scraping_sources
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role can manage scraped_urls" ON scraped_urls
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role can manage scrape_logs" ON scrape_logs
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role can manage scraper_config" ON scraper_config
    FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- SEED DATA: Tier 1 Aggregator Sources
-- ============================================

INSERT INTO scraping_sources (url, name, description, tier, category, priority, rate_limit_requests, rate_limit_delay_ms, config) VALUES
    ('https://opportunitiescircle.com', 'Opportunities Circle', 'Premier aggregator for scholarships, internships, and fellowships', 1, 'aggregator', 1, 10, 2000,
     '{"selectors": {"list": ".post-item, .opportunity-card, article", "title": "h2, h3, .entry-title", "link": "a[href*=\"/scholarship/\"], a[href*=\"/opportunity/\"]"}, "patterns": ["scholarship", "fellowship", "internship", "grant"]}'),
    
    ('https://oyaopportunities.com', 'OYA Opportunities', 'Youth-focused opportunity aggregator', 1, 'aggregator', 2, 8, 2500,
     '{"selectors": {"list": ".listing-item, .opportunity", "title": ".title, h3", "link": "a.button, a[href*=\"/apply\"]"}, "patterns": ["scholarship", "internship", "fellowship"]}'),
    
    ('https://globalscholardesk.com', 'Global Scholar Desk', 'International scholarship database', 1, 'scholarship', 3, 8, 2500,
     '{"selectors": {"list": ".scholarship-card, .post", "title": "h2, .scholarship-title", "link": "a[href*=\"/scholarship/\"]"}, "patterns": ["scholarship", "grant"]}'),
    
    ('https://scholars4dev.com', 'Scholars4Dev', 'Scholarship opportunities for international students', 1, 'scholarship', 4, 10, 2000,
     '{"selectors": {"list": ".td-module-image-wrap, .wpb_text_column", "title": "h3, .entry-title", "link": "a[href*=\"/\"]"}, "patterns": ["scholarship"]}'),
    
    ('https://www.scholarshipportal.com', 'Scholarship Portal', 'Comprehensive scholarship search engine', 1, 'scholarship', 5, 6, 3000,
     '{"selectors": {"list": ".scholarship-item, .program-card", "title": ".scholarship-title, h3", "link": "a[href*=\"/scholarship/\"]"}, "patterns": ["scholarship"]}'),
    
    ('https://www.scholarship-positions.com', 'Scholarship Positions', 'Latest scholarship listings', 1, 'scholarship', 6, 6, 3000,
     '{"selectors": {"list": ".post, .scholarship-listing", "title": "h2, .entry-title", "link": "a[href*=\"/202\"]"}, "patterns": ["scholarship", "fellowship"]}'),
    
    ('https://www.internationalscholarships.com', 'International Scholarships', 'Global scholarship opportunities', 1, 'scholarship', 7, 5, 3500,
     '{"selectors": {"list": ".listing, .scholarship", "title": "h3, .title", "link": "a[href*=\"/details\"]"}, "patterns": ["scholarship"]}')
ON CONFLICT (url) DO NOTHING;

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_scraping_sources_updated_at BEFORE UPDATE ON scraping_sources
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_scraper_config_updated_at BEFORE UPDATE ON scraper_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to record scrape log
CREATE OR REPLACE FUNCTION record_scrape_log(
    p_source_id INT,
    p_run_type TEXT,
    p_status TEXT,
    p_urls_discovered INT DEFAULT 0,
    p_urls_scraped INT DEFAULT 0,
    p_urls_saved INT DEFAULT 0,
    p_urls_skipped INT DEFAULT 0,
    p_urls_failed INT DEFAULT 0,
    p_errors JSONB DEFAULT '[]'::JSONB
)
RETURNS UUID AS $$
DECLARE
    v_log_id UUID;
    v_duration INT;
BEGIN
    v_duration := EXTRACT(EPOCH FROM (NOW() - started_at))::INT;
    
    INSERT INTO scrape_logs (source_id, run_type, status, urls_discovered, urls_scraped, urls_saved, urls_skipped, urls_failed, errors, duration_seconds, completed_at)
    VALUES (p_source_id, p_run_type, p_status, p_urls_discovered, p_urls_scraped, p_urls_saved, p_urls_skipped, p_urls_failed, p_errors, v_duration, NOW())
    RETURNING id INTO v_log_id;
    
    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

-- Function to check URL exists
CREATE OR REPLACE FUNCTION url_exists_in_cache(p_url TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_exists BOOLEAN;
BEGIN
    SELECT EXISTS(SELECT 1 FROM scraped_urls WHERE url = p_url) INTO v_exists;
    RETURN v_exists;
END;
$$ LANGUAGE plpgsql;

-- Function to add URL to cache
CREATE OR REPLACE FUNCTION add_url_to_cache(
    p_url TEXT,
    p_source_id INT,
    p_status TEXT DEFAULT 'pending'
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO scraped_urls (url, source_id, status, last_checked)
    VALUES (p_url, p_source_id, p_status, NOW())
    ON CONFLICT (url) DO UPDATE SET
        last_checked = NOW(),
        status = p_status;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- VIEWS
-- ============================================

-- Source performance view
CREATE OR REPLACE VIEW source_performance AS
SELECT 
    s.id,
    s.name,
    s.url,
    s.tier,
    s.category,
    s.enabled,
    s.last_scraped,
    s.last_success,
    s.last_error,
    s.total_scraped,
    s.total_failed,
    s.total_urls_discovered,
    CASE 
        WHEN s.total_scraped + s.total_failed > 0 
        THEN ROUND((s.total_scraped::NUMERIC / (s.total_scraped + s.total_failed)) * 100, 2)
        ELSE 0 
    END AS success_rate,
    sl.status AS last_run_status,
    sl.duration_seconds AS last_run_duration,
    sl.urls_discovered AS last_urls_discovered,
    sl.urls_scraped AS last_urls_scraped,
    sl.urls_saved AS last_urls_saved
FROM scraping_sources s
LEFT JOIN LATERAL (
    SELECT status, duration_seconds, urls_discovered, urls_scraped, urls_saved
    FROM scrape_logs 
    WHERE source_id = s.id 
    ORDER BY created_at DESC 
    LIMIT 1
) sl ON true;

-- Recent scrape activity view
CREATE OR REPLACE VIEW recent_scrape_activity AS
SELECT 
    sl.id,
    sl.source_id,
    s.name AS source_name,
    sl.run_type,
    sl.status,
    sl.urls_discovered,
    sl.urls_scraped,
    sl.urls_saved,
    sl.urls_skipped,
    sl.errors,
    sl.duration_seconds,
    sl.started_at,
    sl.completed_at
FROM scrape_logs sl
LEFT JOIN scraping_sources s ON sl.source_id = s.id
ORDER BY sl.created_at DESC
LIMIT 50;

-- ============================================
-- COMPLETE MIGRATION
-- ============================================

SELECT 'Scraper schema migration complete!' AS status;
