-- =====================================================
-- RECONCILE creator_applications (creator vs mentor)
--
-- creator_applications was shared by BOTH the creator and mentor flows with
-- no discriminator, so mentor rows were indistinguishable from creator rows
-- and approving a mentor granted creator-studio access. The mobile mentor
-- insert also used camelCase keys that don't exist as columns.
--
-- This adds:
--   • application_kind ('creator' | 'mentor') discriminator
--   • mentor-specific columns (display_name, content_type, experience,
--     sample_content_url)
--   • profiles.mentor_status, protected by the column-guard trigger
--   • review_creator_application branches on application_kind so approving a
--     mentor sets mentor_status, not creator_status.
-- =====================================================

-- ─── 1. Discriminator + mentor columns ────────────────────────────────
ALTER TABLE public.creator_applications
    ADD COLUMN IF NOT EXISTS application_kind TEXT NOT NULL DEFAULT 'creator',
    ADD COLUMN IF NOT EXISTS display_name TEXT,
    ADD COLUMN IF NOT EXISTS content_type TEXT,
    ADD COLUMN IF NOT EXISTS experience TEXT,
    ADD COLUMN IF NOT EXISTS sample_content_url TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'creator_applications_kind_check'
    ) THEN
        ALTER TABLE public.creator_applications ADD CONSTRAINT creator_applications_kind_check
            CHECK (application_kind IN ('creator', 'mentor'));
    END IF;
END $$;

-- ─── 2. profiles.mentor_status ────────────────────────────────────────
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS mentor_status TEXT DEFAULT 'none';

-- ─── 3. Extend the column-guard trigger to protect mentor_status ──────
-- Mirrors migration 015's protect_profile_privileged_columns, adding
-- mentor_status so clients cannot self-approve as a mentor.
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS TRIGGER AS $$
BEGIN
    IF auth.role() IN ('authenticated', 'anon')
       AND COALESCE(current_setting('app.credit_op', true), '') <> 'on' THEN
        IF NEW.credits IS DISTINCT FROM OLD.credits
            OR NEW.xp_points IS DISTINCT FROM OLD.xp_points
            OR NEW.level IS DISTINCT FROM OLD.level
            OR NEW.is_pro IS DISTINCT FROM OLD.is_pro
            OR NEW.pro_since IS DISTINCT FROM OLD.pro_since
            OR NEW.pro_expires_at IS DISTINCT FROM OLD.pro_expires_at
            OR NEW.subscription_id IS DISTINCT FROM OLD.subscription_id
            OR NEW.role IS DISTINCT FROM OLD.role
            OR NEW.creator_status IS DISTINCT FROM OLD.creator_status
            OR NEW.mentor_status IS DISTINCT FROM OLD.mentor_status
            OR NEW.last_daily_credit_at IS DISTINCT FROM OLD.last_daily_credit_at
            OR NEW.login_streak IS DISTINCT FROM OLD.login_streak
        THEN
            RAISE EXCEPTION 'Cannot modify protected profile fields'
                USING ERRCODE = '42501';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ─── 4. review_creator_application branches on application_kind ───────
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
    v_kind TEXT;
BEGIN
    IF NOT private.current_app_is_admin() THEN
        RETURN jsonb_build_object('error', 'Unauthorized: admin access required.');
    END IF;

    IF p_status NOT IN ('approved', 'rejected') THEN
        RETURN jsonb_build_object('error', 'Invalid status. Must be approved or rejected.');
    END IF;

    SELECT user_id, status, COALESCE(application_kind, 'creator')
    INTO v_app_user_id, v_current_status, v_kind
    FROM public.creator_applications
    WHERE id = p_application_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Application not found.');
    END IF;

    IF v_current_status != 'pending' THEN
        RETURN jsonb_build_object('error', 'Application already reviewed.');
    END IF;

    UPDATE public.creator_applications
    SET status = p_status,
        reviewed_at = NOW(),
        reviewer_notes = p_notes
    WHERE id = p_application_id;

    PERFORM set_config('app.credit_op', 'on', true);

    -- Route the approval to the correct role, so approving a mentor does NOT
    -- unlock the creator studio and vice-versa.
    IF v_kind = 'mentor' THEN
        UPDATE public.profiles SET mentor_status = p_status WHERE user_id = v_app_user_id;
    ELSE
        UPDATE public.profiles SET creator_status = p_status WHERE user_id = v_app_user_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'status', p_status,
        'kind', v_kind,
        'user_id', v_app_user_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.review_creator_application(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_creator_application(UUID, TEXT, TEXT) TO authenticated;
