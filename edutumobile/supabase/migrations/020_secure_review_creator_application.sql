-- =====================================================
-- SECURE review_creator_application
--
-- The original RPC (006) is SECURITY DEFINER, so it bypasses RLS, but it
-- had NO caller check — any client able to invoke it could approve/reject
-- ANY application (including approving themselves as a creator).
--
-- This recreates it with:
--  1. An explicit admin caller check (role in admin/super_admin).
--  2. app.credit_op set before touching profiles.creator_status, which
--     migration 015's column-protection trigger otherwise blocks (the
--     caller is an authenticated admin, not the service role).
--  3. A pinned search_path.
-- =====================================================

CREATE OR REPLACE FUNCTION public.review_creator_application(
    p_application_id UUID,
    p_status TEXT,
    p_notes TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_app_user_id TEXT;
    v_current_status TEXT;
BEGIN
    -- Only admins may review applications. Uses the hardened Clerk-aware
    -- admin helper (016) rather than auth.uid(), which is unreliable under
    -- Clerk third-party auth.
    IF NOT private.current_app_is_admin() THEN
        RETURN jsonb_build_object('error', 'Unauthorized: admin access required.');
    END IF;

    -- Validate status
    IF p_status NOT IN ('approved', 'rejected') THEN
        RETURN jsonb_build_object('error', 'Invalid status. Must be approved or rejected.');
    END IF;

    -- Get current application
    SELECT user_id, status INTO v_app_user_id, v_current_status
    FROM public.creator_applications
    WHERE id = p_application_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Application not found.');
    END IF;

    IF v_current_status != 'pending' THEN
        RETURN jsonb_build_object('error', 'Application already reviewed.');
    END IF;

    -- Update application
    UPDATE public.creator_applications
    SET status = p_status,
        reviewed_at = NOW(),
        reviewer_notes = p_notes
    WHERE id = p_application_id;

    -- creator_status is a protected profile column (migration 015); flip the
    -- credit-op flag so this admin-initiated update is allowed through.
    PERFORM set_config('app.credit_op', 'on', true);

    UPDATE public.profiles
    SET creator_status = p_status
    WHERE user_id = v_app_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'status', p_status,
        'user_id', v_app_user_id
    );
END;
$$;

-- Only authenticated users may invoke it (the body enforces admin-only).
REVOKE ALL ON FUNCTION public.review_creator_application(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_creator_application(UUID, TEXT, TEXT) TO authenticated;
