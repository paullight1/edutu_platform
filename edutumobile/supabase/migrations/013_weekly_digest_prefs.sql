-- Migration 013: Weekly Digest Preferences + Delivery Status
-- Adds preference table for weekly digest and delivery tracking columns.

-- ============================================================
-- 1. Notification preferences table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notification_preferences (
    user_id TEXT PRIMARY KEY REFERENCES public.profiles(user_id) ON DELETE CASCADE,
    push_enabled BOOLEAN DEFAULT true,
    email_enabled BOOLEAN DEFAULT false,
    haptics_enabled BOOLEAN DEFAULT true,
    quiet_hours_enabled BOOLEAN DEFAULT false,
    quiet_hours_start TEXT DEFAULT '22:00',
    quiet_hours_end TEXT DEFAULT '08:00',
    weekly_digest_enabled BOOLEAN DEFAULT true,
    weekly_digest_day INTEGER DEFAULT 6 CHECK (weekly_digest_day >= 1 AND weekly_digest_day <= 7),
    weekly_digest_email TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own notification preferences"
    ON public.notification_preferences FOR SELECT
    USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own notification preferences"
    ON public.notification_preferences FOR INSERT
    WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update own notification preferences"
    ON public.notification_preferences FOR UPDATE
    USING (auth.uid()::text = user_id)
    WITH CHECK (auth.uid()::text = user_id);

-- ============================================================
-- 2. Delivery tracking columns on user_notifications
-- ============================================================
ALTER TABLE public.user_notifications
    ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS priority TEXT CHECK (priority IN ('high', 'normal', 'low')),
    ADD COLUMN IF NOT EXISTS image_url TEXT,
    ADD COLUMN IF NOT EXISTS action_label TEXT,
    ADD COLUMN IF NOT EXISTS action_route TEXT;

CREATE INDEX IF NOT EXISTS idx_notif_delivered_at
    ON public.user_notifications(delivered_at) WHERE delivered_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notif_opened_at
    ON public.user_notifications(opened_at) WHERE opened_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notif_prefs_digest
    ON public.notification_preferences(weekly_digest_enabled, weekly_digest_day)
    WHERE weekly_digest_enabled = true;

-- ============================================================
-- 3. Auto-update trigger for preferences
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_notif_prefs_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notif_prefs_updated ON public.notification_preferences;
CREATE TRIGGER trg_notif_prefs_updated
    BEFORE UPDATE ON public.notification_preferences
    FOR EACH ROW EXECUTE FUNCTION public.update_notif_prefs_timestamp();
