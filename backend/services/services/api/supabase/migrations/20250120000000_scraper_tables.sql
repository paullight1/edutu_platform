-- Migration: Create scraping tables for Crawl4ai integration
-- Run this in Supabase SQL Editor

-- Scraping sources table
CREATE TABLE IF NOT EXISTS scraping_sources (
    id SERIAL PRIMARY KEY,
    url TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    tier INT DEFAULT 1 CHECK (tier IN (1, 2, 3)),
    category TEXT DEFAULT 'general',
    enabled BOOLEAN DEFAULT true,
    priority INT DEFAULT 1,
    config JSONB DEFAULT '{}',
    rate_limit_requests INT DEFAULT 10,
    rate_limit_delay_ms INT DEFAULT 2000,
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

-- Scraped URLs cache
CREATE TABLE IF NOT EXISTS scraped_urls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url TEXT NOT NULL UNIQUE,
    source_id INT REFERENCES scraping_sources(id) ON DELETE SET NULL,
    opportunity_id UUID,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed', 'skipped')),
    http_status INT,
    content_hash TEXT,
    first_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_checked TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Scrape logs
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

-- Scraper config
CREATE TABLE IF NOT EXISTS scraper_config (
    id SERIAL PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    value JSONB NOT NULL,
    description TEXT,
    is_secret BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed default sources
INSERT INTO scraping_sources (url, name, description, tier, category, priority, config) VALUES
    ('https://opportunitiescircle.com', 'Opportunities Circle', 'Scholarship aggregator', 1, 'scholarship', 1, '{"selectors": {"list": ".post-item", "title": "h2"}}'),
    ('https://scholars4dev.com', 'Scholars4Dev', 'International scholarships', 1, 'scholarship', 2, '{}')
ON CONFLICT (url) DO NOTHING;

-- Enable RLS
ALTER TABLE scraping_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraped_urls ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraper_config ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users
CREATE POLICY "Enable read access for authenticated users" ON scraping_sources
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable read access for authenticated users" ON scrape_logs
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable all for service role" ON scraping_sources
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Enable all for service role" ON scrape_logs
    FOR ALL USING (true) WITH CHECK (true);
