-- Scraper scheduler + incremental scraping config.
--
-- The scheduler keys (auto_run_enabled, cron_schedule) were never seeded by
-- any migration, and updateSettings used a plain UPDATE — so the admin toggle
-- silently no-oped and the cron never ran. Seed them here (ON CONFLICT DO
-- NOTHING so an admin-tuned value is never overwritten by a redeploy), and
-- seed the incremental-mode recheck window alongside.
INSERT INTO scraper_config (key, value, description) VALUES
    ('auto_run_enabled', 'true'::jsonb,
     'Run the scraper automatically on the cron schedule'),
    ('cron_schedule', '"0 */6 * * *"'::jsonb,
     'Cron schedule for automatic scrape runs'),
    ('recheck_after_days', '3'::jsonb,
     'Incremental runs skip URLs processed within this many days, then re-check them for updates')
ON CONFLICT (key) DO NOTHING;

-- The incremental skip check and the per-item enrichment cache both look up
-- opportunities by apply_url; give them an index.
CREATE INDEX IF NOT EXISTS opportunities_apply_url_idx
    ON public.opportunities (apply_url);
