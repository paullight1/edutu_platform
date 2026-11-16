-- Deployed to live prod via MCP as `scope_get_recommended_roadmaps_to_caller`.
--
-- IDOR fix: get_recommended_roadmaps joined user_roadmap_intents on a
-- CLIENT-SUPPLIED p_user_id (SECURITY DEFINER), so any caller could retrieve
-- roadmaps matched to another user's private intents/goals. The intent match
-- is now scoped to the authenticated caller via current_app_user_id();
-- p_user_id is kept only for signature/API compatibility and is ignored.
-- Anon callers (null identity) fall through to the public featured roadmaps.
CREATE OR REPLACE FUNCTION public.get_recommended_roadmaps(p_user_id text, p_limit integer DEFAULT 10)
RETURNS SETOF roadmaps
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    SELECT r.*
    FROM public.roadmaps r
    LEFT JOIN public.user_roadmap_intents i ON i.user_id = public.current_app_user_id()
    WHERE r.status = 'published'
    AND (
        (i.target_category IS NOT NULL AND r.category = i.target_category)
        OR
        (i.goals IS NOT NULL AND r.ai_intent_tags && i.goals)
        OR
        r.is_featured = true
    )
    ORDER BY
        r.is_featured DESC,
        r.rating_avg DESC,
        r.enrollment_count DESC,
        r.created_at DESC
    LIMIT p_limit;
$function$;
