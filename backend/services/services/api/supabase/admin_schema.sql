-- Additional Admin Tables for Edutu Admin Dashboard
-- Run this after the main schema.sql

-- ------------------------------------------------------------------
-- Storage Buckets for User Files
-- ------------------------------------------------------------------
-- Create avatars bucket for profile images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- RLS Policies for avatar storage
CREATE POLICY "Users can upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Avatars are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- ------------------------------------------------------------------
-- Admin Users & Roles Enhancement
-- ------------------------------------------------------------------
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS role text DEFAULT 'user' 
  CHECK (role IN ('user', 'moderator', 'support_agent', 'admin', 'super_admin'));

CREATE INDEX IF NOT EXISTS profiles_role_idx ON public.profiles (role);

-- Policy for admins to view all profiles
CREATE POLICY IF NOT EXISTS "Admins can view all profiles"
  ON public.profiles
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'super_admin')
    )
  );

-- ------------------------------------------------------------------
-- Notification Queue for Scheduled Broadcasts
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payload jsonb NOT NULL,
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  processed_at timestamptz,
  result jsonb,
  created_by uuid REFERENCES auth.users ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_queue_status_idx ON public.notification_queue (status, scheduled_for);

ALTER TABLE public.notification_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages notification queue"
  ON public.notification_queue
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Admins can view notification queue"
  ON public.notification_queue
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'super_admin')
    )
  );

-- ------------------------------------------------------------------
-- Webhook API Keys for n8n Integration
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.webhook_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  permissions text[] NOT NULL DEFAULT ARRAY['opportunities:write'],
  rate_limit integer DEFAULT 100, -- requests per minute
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  created_by uuid REFERENCES auth.users ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

ALTER TABLE public.webhook_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages webhook keys"
  ON public.webhook_api_keys
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ------------------------------------------------------------------
-- User Activity Tracking for Analytics
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  session_start timestamptz NOT NULL DEFAULT now(),
  session_end timestamptz,
  device_info jsonb NOT NULL DEFAULT '{}',
  pages_viewed text[] NOT NULL DEFAULT ARRAY[]::text[],
  actions_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_sessions_user_idx ON public.user_sessions (user_id, session_start DESC);
CREATE INDEX IF NOT EXISTS user_sessions_date_idx ON public.user_sessions (session_start DESC);

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sessions"
  ON public.user_sessions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages sessions"
  ON public.user_sessions
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ------------------------------------------------------------------
-- Opportunity Click Tracking
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.opportunity_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users ON DELETE SET NULL,
  opportunity_id uuid NOT NULL REFERENCES public.opportunities ON DELETE CASCADE,
  click_type text NOT NULL DEFAULT 'view' CHECK (click_type IN ('view', 'apply', 'bookmark', 'share')),
  referrer text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS opportunity_clicks_opp_idx ON public.opportunity_clicks (opportunity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS opportunity_clicks_user_idx ON public.opportunity_clicks (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS opportunity_clicks_type_idx ON public.opportunity_clicks (click_type, created_at DESC);

ALTER TABLE public.opportunity_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can insert opportunity clicks"
  ON public.opportunity_clicks
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can view opportunity clicks"
  ON public.opportunity_clicks
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'super_admin', 'moderator')
    )
  );

-- ------------------------------------------------------------------
-- Admin Dashboard Snapshots (Cached Analytics)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_dashboard_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_type text NOT NULL CHECK (snapshot_type IN ('daily', 'weekly', 'monthly')),
  snapshot_date date NOT NULL,
  metrics jsonb NOT NULL DEFAULT '{}',
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (snapshot_type, snapshot_date)
);

CREATE INDEX IF NOT EXISTS admin_snapshots_lookup_idx 
  ON public.admin_dashboard_snapshots (snapshot_type, snapshot_date DESC);

ALTER TABLE public.admin_dashboard_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view dashboard snapshots"
  ON public.admin_dashboard_snapshots
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Service role manages dashboard snapshots"
  ON public.admin_dashboard_snapshots
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ------------------------------------------------------------------
-- Personalization Profiles (For AI Recommendations)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_personalization (
  user_id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  interests text[] NOT NULL DEFAULT ARRAY[]::text[],
  career_goals text[] NOT NULL DEFAULT ARRAY[]::text[],
  experience_level text DEFAULT 'intermediate' 
    CHECK (experience_level IN ('beginner', 'intermediate', 'advanced')),
  preferred_categories text[] NOT NULL DEFAULT ARRAY[]::text[],
  preferred_locations text[] NOT NULL DEFAULT ARRAY[]::text[],
  availability text DEFAULT 'flexible'
    CHECK (availability IN ('full-time', 'part-time', 'remote', 'flexible')),
  recommendation_weights jsonb NOT NULL DEFAULT '{"category": 1, "location": 0.8, "skills": 1.2}',
  last_updated timestamptz NOT NULL DEFAULT now(),
  onboarding_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_timestamp_user_personalization
BEFORE UPDATE ON public.user_personalization
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.user_personalization ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own personalization"
  ON public.user_personalization
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view personalization data"
  ON public.user_personalization
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'super_admin')
    )
  );

-- ------------------------------------------------------------------
-- Opportunity Recommendations Cache
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_opportunity_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES public.opportunities ON DELETE CASCADE,
  match_score numeric(5,2) NOT NULL DEFAULT 0,
  match_reasons jsonb NOT NULL DEFAULT '[]',
  is_dismissed boolean NOT NULL DEFAULT false,
  is_saved boolean NOT NULL DEFAULT false,
  generated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '7 days'),
  UNIQUE (user_id, opportunity_id)
);

CREATE INDEX IF NOT EXISTS user_recs_user_score_idx 
  ON public.user_opportunity_recommendations (user_id, match_score DESC)
  WHERE NOT is_dismissed;

ALTER TABLE public.user_opportunity_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own recommendations"
  ON public.user_opportunity_recommendations
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ------------------------------------------------------------------
-- Functions for Admin Analytics
-- ------------------------------------------------------------------

-- Get signup trends
CREATE OR REPLACE FUNCTION public.get_signup_trends(days_back integer DEFAULT 30)
RETURNS TABLE (
  signup_date date,
  signup_count bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    DATE(created_at) AS signup_date,
    COUNT(*) AS signup_count
  FROM public.profiles
  WHERE created_at >= CURRENT_DATE - days_back
  GROUP BY DATE(created_at)
  ORDER BY signup_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get opportunity performance
CREATE OR REPLACE FUNCTION public.get_opportunity_performance(days_back integer DEFAULT 30)
RETURNS TABLE (
  opportunity_id uuid,
  title text,
  category text,
  view_count bigint,
  apply_count bigint,
  bookmark_count bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    o.id AS opportunity_id,
    o.title,
    o.category,
    COUNT(*) FILTER (WHERE oc.click_type = 'view') AS view_count,
    COUNT(*) FILTER (WHERE oc.click_type = 'apply') AS apply_count,
    COUNT(*) FILTER (WHERE oc.click_type = 'bookmark') AS bookmark_count
  FROM public.opportunities o
  LEFT JOIN public.opportunity_clicks oc ON o.id = oc.opportunity_id
    AND oc.created_at >= CURRENT_DATE - days_back
  GROUP BY o.id, o.title, o.category
  ORDER BY view_count DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get support ticket response times
CREATE OR REPLACE FUNCTION public.get_support_metrics(days_back integer DEFAULT 30)
RETURNS jsonb AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_tickets', COUNT(*),
    'open_tickets', COUNT(*) FILTER (WHERE status IN ('open', 'in_progress')),
    'resolved_tickets', COUNT(*) FILTER (WHERE status = 'resolved'),
    'avg_resolution_hours', COALESCE(
      AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600) 
      FILTER (WHERE status = 'resolved'), 0
    ),
    'by_category', (
      SELECT jsonb_object_agg(category, cnt)
      FROM (
        SELECT category, COUNT(*) as cnt
        FROM public.support_tickets
        WHERE created_at >= CURRENT_DATE - days_back
        GROUP BY category
      ) sub
    ),
    'by_priority', (
      SELECT jsonb_object_agg(priority, cnt)
      FROM (
        SELECT priority, COUNT(*) as cnt
        FROM public.support_tickets
        WHERE created_at >= CURRENT_DATE - days_back
        GROUP BY priority
      ) sub
    )
  ) INTO result
  FROM public.support_tickets
  WHERE created_at >= CURRENT_DATE - days_back;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Generate personalized recommendations
CREATE OR REPLACE FUNCTION public.generate_user_recommendations(p_user_id uuid)
RETURNS void AS $$
DECLARE
  user_prefs public.user_personalization%ROWTYPE;
  opp RECORD;
  match_score numeric;
  reasons jsonb;
BEGIN
  -- Get user preferences
  SELECT * INTO user_prefs
  FROM public.user_personalization
  WHERE user_id = p_user_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Clear expired recommendations
  DELETE FROM public.user_opportunity_recommendations
  WHERE user_id = p_user_id AND expires_at < now();
  
  -- Generate new recommendations
  FOR opp IN 
    SELECT * FROM public.opportunities
    WHERE close_date IS NULL OR close_date > CURRENT_DATE
  LOOP
    match_score := 0;
    reasons := '[]'::jsonb;
    
    -- Category match
    IF opp.category = ANY(user_prefs.preferred_categories) THEN
      match_score := match_score + 30;
      reasons := reasons || jsonb_build_object('type', 'category', 'weight', 30);
    END IF;
    
    -- Tag match
    IF opp.tags && user_prefs.interests THEN
      match_score := match_score + 25;
      reasons := reasons || jsonb_build_object('type', 'interests', 'weight', 25);
    END IF;
    
    -- Location match
    IF opp.is_remote OR opp.location = ANY(user_prefs.preferred_locations) THEN
      match_score := match_score + 15;
      reasons := reasons || jsonb_build_object('type', 'location', 'weight', 15);
    END IF;
    
    -- Only save if score is above threshold
    IF match_score >= 20 THEN
      INSERT INTO public.user_opportunity_recommendations 
        (user_id, opportunity_id, match_score, match_reasons)
      VALUES (p_user_id, opp.id, match_score, reasons)
      ON CONFLICT (user_id, opportunity_id) DO UPDATE
        SET match_score = EXCLUDED.match_score,
            match_reasons = EXCLUDED.match_reasons,
            generated_at = now(),
            expires_at = now() + interval '7 days';
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------------
-- Grant execute permissions
-- ------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.get_signup_trends TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_opportunity_performance TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_support_metrics TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_user_recommendations TO authenticated;

COMMENT ON TABLE public.notification_queue IS 'Queue for scheduled broadcast notifications';
COMMENT ON TABLE public.webhook_api_keys IS 'API keys for external integrations like n8n';
COMMENT ON TABLE public.user_personalization IS 'User preferences for personalized recommendations';
COMMENT ON TABLE public.user_opportunity_recommendations IS 'Cached personalized opportunity recommendations';
