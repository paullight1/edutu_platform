-- Rehearsal snapshot only. The legacy analytics tables still use UUID keys.
DO $$ BEGIN
  IF current_database() <> 'edutu_stage_rehearsal' THEN
    RAISE EXCEPTION 'These compatibility definitions require the staging rehearsal database';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.ensure_analytics_profile(p_user_id text)
RETURNS public.analytics LANGUAGE sql SET search_path = '' AS $$
  SELECT public.ensure_analytics_profile(public.clerk_id_to_uuid(p_user_id)::uuid)
$$;

CREATE OR REPLACE FUNCTION public.touch_analytics_activity(
  p_user_id text, p_event text, p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS void LANGUAGE sql SET search_path = '' AS $$
  SELECT public.touch_analytics_activity(public.clerk_id_to_uuid(p_user_id)::uuid, p_event, p_payload)
$$;

CREATE OR REPLACE FUNCTION public.increment_goal_daily_metric(
  p_user_id text, p_metric_date date, p_goals_created integer DEFAULT 0,
  p_goals_completed integer DEFAULT 0, p_goals_archived integer DEFAULT 0,
  p_active_goal_delta integer DEFAULT 0, p_progress_updates integer DEFAULT 0,
  p_progress_delta numeric DEFAULT 0, p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void LANGUAGE sql SET search_path = '' AS $$
  SELECT public.increment_goal_daily_metric(
    public.clerk_id_to_uuid(p_user_id)::uuid, p_metric_date, p_goals_created,
    p_goals_completed, p_goals_archived, p_active_goal_delta, p_progress_updates,
    p_progress_delta, p_metadata
  )
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_analytics_profile(text),
  public.touch_analytics_activity(text,text,jsonb),
  public.increment_goal_daily_metric(text,date,integer,integer,integer,integer,integer,numeric,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_analytics_profile(text),
  public.touch_analytics_activity(text,text,jsonb),
  public.increment_goal_daily_metric(text,date,integer,integer,integer,integer,integer,numeric,jsonb)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_recommended_roadmaps(uuid,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_recommended_roadmaps(uuid,integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_recommended_roadmaps(text,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_recommended_roadmaps(text,integer) TO authenticated, service_role;

-- Keep the legacy client-callable reward routine unavailable in rehearsal.
REVOKE EXECUTE ON FUNCTION public.award_engagement_credit(text) FROM PUBLIC, anon, authenticated;
