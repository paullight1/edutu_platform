-- =====================================================
-- SECURE CREDIT FUNCTIONS (web app)
--
-- Mirrors mobile migration 015 for the web-app Supabase project.
--
-- Fixes:
--  1. `add_credits(text,int,text,text,text)` and
--     `spend_credits(text,int,text,text,text)` were SECURITY DEFINER, keyed
--     on a CLIENT-SUPPLIED `p_user_id`, and had NO REVOKE — so any
--     authenticated (or anon) caller could mint credits for anyone or spend
--     from another user's balance. Dropped and replaced.
--  2. The `profiles` UPDATE path let clients write privileged columns
--     (credits, is_pro, pro_expires_at, role) — self-escalation. Added a
--     column-protection trigger; privileged columns can now only change via
--     the SECURITY DEFINER functions below (which set app.credit_op) or the
--     service role.
--  3. The client already calls the caller-scoped `spend_credits(p_amount,
--     p_reason)` signature (src/services/credits.ts) which never existed in
--     the DB — created here, scoped to current_app_user_id().
--
-- NOTE: creator_status is intentionally NOT locked here — the web mentor
-- flow still writes it client-side. Its transition is moved to an
-- admin-checked RPC in the creator-flow reconciliation migration.
-- =====================================================

-- ─── 1. Drop the insecure, client-id-keyed money functions ────────────
DROP FUNCTION IF EXISTS public.add_credits(text, integer, text, text, text);
DROP FUNCTION IF EXISTS public.spend_credits(text, integer, text, text, text);

-- ─── 2. Protect privileged profile columns from client writes ─────────
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS TRIGGER AS $$
BEGIN
    -- auth.role() is 'authenticated'/'anon' for client JWTs, 'service_role'
    -- for the service key, and NULL for direct SQL. Only client requests
    -- are restricted; the SECURITY DEFINER functions below flip app.credit_op.
    IF auth.role() IN ('authenticated', 'anon')
       AND COALESCE(current_setting('app.credit_op', true), '') <> 'on' THEN
        IF NEW.credits IS DISTINCT FROM OLD.credits
            OR NEW.is_pro IS DISTINCT FROM OLD.is_pro
            OR NEW.pro_expires_at IS DISTINCT FROM OLD.pro_expires_at
            OR NEW.role IS DISTINCT FROM OLD.role
        THEN
            RAISE EXCEPTION 'Cannot modify protected profile fields'
                USING ERRCODE = '42501';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_protect_profile_privileged_columns ON public.profiles;
CREATE TRIGGER trg_protect_profile_privileged_columns
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_profile_privileged_columns();

-- Also block clients from seeding privileged values at INSERT time.
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_insert()
RETURNS TRIGGER AS $$
BEGIN
    IF auth.role() IN ('authenticated', 'anon') THEN
        NEW.credits := 0;
        NEW.is_pro := FALSE;
        NEW.pro_expires_at := NULL;
        NEW.role := 'user';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_protect_profile_privileged_insert ON public.profiles;
CREATE TRIGGER trg_protect_profile_privileged_insert
    BEFORE INSERT ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_profile_privileged_insert();

-- ─── 3. Caller-scoped atomic spend (for the app) ──────────────────────
-- The user id comes from the verified Clerk JWT (current_app_user_id()),
-- NEVER from the client. Atomic conditional UPDATE — no read-then-write race.
CREATE OR REPLACE FUNCTION public.spend_credits(
    p_amount INTEGER,
    p_reason TEXT DEFAULT ''
)
RETURNS BOOLEAN AS $$
DECLARE
    v_user TEXT := public.current_app_user_id();
    v_remaining INTEGER;
BEGIN
    IF v_user IS NULL OR v_user = '' THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Invalid amount';
    END IF;

    PERFORM set_config('app.credit_op', 'on', true);

    UPDATE public.profiles
    SET credits = credits - p_amount,
        updated_at = NOW()
    WHERE user_id = v_user
      AND credits >= p_amount
    RETURNING credits INTO v_remaining;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    INSERT INTO public.credit_transactions (user_id, amount, type, description)
    VALUES (v_user, -p_amount, 'spend', LEFT(COALESCE(p_reason, ''), 200));

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.spend_credits(INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spend_credits(INTEGER, TEXT) TO authenticated;

-- ─── 4. Service-role-only credit grant (for webhooks) ─────────────────
CREATE OR REPLACE FUNCTION public.admin_add_credits(
    p_user_id TEXT,
    p_amount INTEGER,
    p_reason TEXT DEFAULT ''
)
RETURNS VOID AS $$
BEGIN
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Invalid amount';
    END IF;

    PERFORM set_config('app.credit_op', 'on', true);

    UPDATE public.profiles
    SET credits = credits + p_amount,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    INSERT INTO public.credit_transactions (user_id, amount, type, description)
    VALUES (p_user_id, p_amount, 'purchase', LEFT(COALESCE(p_reason, ''), 200));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.admin_add_credits(TEXT, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_credits(TEXT, INTEGER, TEXT) TO service_role;

-- ─── 5. Re-create the admin grant/pro RPCs so they pass the trigger ────
-- These run as SECURITY DEFINER but the *caller* is an authenticated admin,
-- so auth.role() = 'authenticated' and the column-protection trigger would
-- block them unless app.credit_op is set. They keep their internal admin
-- check AND now flip the flag + pin search_path.

CREATE OR REPLACE FUNCTION public.admin_grant_credits(
    p_user_id text,
    p_amount INTEGER,
    p_description TEXT,
    p_related_id TEXT DEFAULT NULL,
    p_related_type TEXT DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, balance INTEGER, error_message TEXT) AS $$
DECLARE
    v_new_balance INTEGER;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE user_id = public.current_app_user_id() AND role IN ('admin', 'super_admin')
    ) THEN
        RETURN QUERY SELECT FALSE, 0, 'Unauthorized: admin access required';
        RETURN;
    END IF;

    PERFORM set_config('app.credit_op', 'on', true);

    UPDATE public.profiles SET credits = credits + p_amount, updated_at = now()
    WHERE user_id = p_user_id
    RETURNING credits INTO v_new_balance;

    IF v_new_balance IS NULL THEN
        RETURN QUERY SELECT FALSE, 0, 'User not found';
        RETURN;
    END IF;

    INSERT INTO public.credit_transactions (user_id, amount, type, description, related_id, related_type)
    VALUES (p_user_id, p_amount, 'admin_grant', p_description, p_related_id, p_related_type);

    RETURN QUERY SELECT TRUE, v_new_balance, ''::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.admin_grant_credits(text, integer, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_credits(text, integer, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_pro_status(
    p_user_id text,
    p_is_pro BOOLEAN,
    p_pro_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, error_message TEXT) AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE user_id = public.current_app_user_id() AND role IN ('admin', 'super_admin')
    ) THEN
        RETURN QUERY SELECT FALSE, 'Unauthorized: admin access required';
        RETURN;
    END IF;

    PERFORM set_config('app.credit_op', 'on', true);

    UPDATE public.profiles
    SET is_pro = p_is_pro,
        pro_expires_at = p_pro_expires_at,
        updated_at = now()
    WHERE user_id = p_user_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'User not found';
        RETURN;
    END IF;

    RETURN QUERY SELECT TRUE, ''::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.admin_set_pro_status(text, boolean, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_pro_status(text, boolean, timestamptz) TO authenticated;
