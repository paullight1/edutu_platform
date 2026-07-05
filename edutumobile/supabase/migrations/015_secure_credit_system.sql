-- =====================================================
-- SECURE CREDIT & SUBSCRIPTION SYSTEM
--
-- Fixes:
--  1. Payment tables still keyed by UUID/auth.users after the Clerk
--     migration (005) — converts them to TEXT Clerk IDs.
--  2. profiles UPDATE policy allowed users to write privileged columns
--     (credits, is_pro, role, ...) — adds a column-protection trigger.
--  3. Money RPCs (deduct_credits / add_credits / sync_subscription_status)
--     were SECURITY DEFINER, keyed on a client-supplied user id, and
--     callable by any authenticated client — replaced with auth.uid()-scoped
--     functions plus service-role-only admin functions.
--  4. Credit spend was a non-atomic SELECT-then-UPDATE — replaced with an
--     atomic conditional UPDATE.
--  5. Credit earning (daily login / engagement) was client-asserted —
--     moved server-side with dedup rules.
-- =====================================================

-- ─── 1. Convert payment tables to TEXT Clerk user ids ─────────────────

ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_user_id_fkey;
ALTER TABLE public.payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_user_id_fkey;
ALTER TABLE public.credit_purchases DROP CONSTRAINT IF EXISTS credit_purchases_user_id_fkey;

-- Only convert if still non-text. ALTER TYPE is blocked when a policy
-- references the column, and it's a pointless no-op once already text.
DO $$
DECLARE t text; c text;
BEGIN
  FOREACH t IN ARRAY ARRAY['subscriptions','payment_transactions','credit_purchases'] LOOP
    SELECT data_type INTO c FROM information_schema.columns
      WHERE table_schema='public' AND table_name=t AND column_name='user_id';
    IF c IS NOT NULL AND c <> 'text' THEN
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN user_id TYPE text', t);
    END IF;
  END LOOP;
END$$;

-- Rebuild the payment-table policies for TEXT ids. The old "System can
-- manage" policies queried auth.users metadata (never true for Clerk
-- users); the service role bypasses RLS, so user-facing SELECT is all
-- that's needed.
DROP POLICY IF EXISTS "Users can view own subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "System can manage subscriptions" ON public.subscriptions;
CREATE POLICY "Users can view own subscriptions"
    ON public.subscriptions FOR SELECT
    USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Users can view own transactions" ON public.payment_transactions;
DROP POLICY IF EXISTS "System can manage transactions" ON public.payment_transactions;
CREATE POLICY "Users can view own transactions"
    ON public.payment_transactions FOR SELECT
    USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Users can view own credit purchases" ON public.credit_purchases;
DROP POLICY IF EXISTS "System can manage credit purchases" ON public.credit_purchases;
CREATE POLICY "Users can view own credit purchases"
    ON public.credit_purchases FOR SELECT
    USING (auth.uid()::text = user_id);

-- Widen the transaction type list to cover credit earning.
ALTER TABLE public.payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_type_check;
ALTER TABLE public.payment_transactions ADD CONSTRAINT payment_transactions_type_check
    CHECK (type IN ('subscription_purchase', 'credit_purchase', 'credit_spend', 'refund', 'payout', 'reward', 'credit'));

-- ─── 2. Ensure privileged profile columns exist ───────────────────────

-- xp_points/level are referenced by the trigger below; this project's
-- profiles may not have them (they're not universally present), and a
-- trigger referencing a missing column fails at runtime on every UPDATE.
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS is_pro BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS role TEXT,
    ADD COLUMN IF NOT EXISTS xp_points INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS last_daily_credit_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS login_streak INTEGER DEFAULT 0;

-- ─── 3. Protect privileged profile columns from client writes ─────────
--
-- The row-level UPDATE policy stays (users may edit their own profile),
-- but privileged columns can only change via service role, direct SQL,
-- or the SECURITY DEFINER functions below (which set app.credit_op).

CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS TRIGGER AS $$
BEGIN
    -- auth.role() is 'authenticated'/'anon' for client JWTs, 'service_role'
    -- for the service key, and NULL for direct SQL. NULL IN (...) is not
    -- true, so only client requests are restricted.
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
            OR NEW.last_daily_credit_at IS DISTINCT FROM OLD.last_daily_credit_at
            OR NEW.login_streak IS DISTINCT FROM OLD.login_streak
        THEN
            RAISE EXCEPTION 'Cannot modify protected profile fields'
                USING ERRCODE = '42501';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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
        NEW.xp_points := 0;
        NEW.level := 1;
        NEW.is_pro := FALSE;
        NEW.pro_since := NULL;
        NEW.pro_expires_at := NULL;
        NEW.subscription_id := NULL;
        NEW.role := NULL;
        NEW.creator_status := 'none';
        NEW.last_daily_credit_at := NULL;
        NEW.login_streak := 0;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_profile_privileged_insert ON public.profiles;
CREATE TRIGGER trg_protect_profile_privileged_insert
    BEFORE INSERT ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_profile_privileged_insert();

-- ─── 4. Drop the insecure money functions ─────────────────────────────
--
-- NOTE: the live database created these with TEXT (Clerk id) arguments,
-- NOT the original UUID signatures. Dropping only the UUID versions left
-- the insecure, anon-executable TEXT overloads in place. Drop BOTH.

-- Live TEXT signatures (the actually-deployed, insecure versions)
DROP FUNCTION IF EXISTS public.deduct_credits(TEXT, INTEGER, TEXT);
DROP FUNCTION IF EXISTS public.add_credits(TEXT, INTEGER, TEXT);
DROP FUNCTION IF EXISTS public.add_credits(TEXT, INTEGER, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.spend_credits(TEXT, INTEGER, TEXT, TEXT, TEXT);

-- Legacy UUID signatures (harmless no-ops if they don't exist)
DROP FUNCTION IF EXISTS public.deduct_credits(UUID, INTEGER, TEXT);
DROP FUNCTION IF EXISTS public.add_credits(UUID, INTEGER, TEXT);
DROP FUNCTION IF EXISTS public.add_credits(UUID, INTEGER);
DROP FUNCTION IF EXISTS public.check_pro_status(UUID);
DROP FUNCTION IF EXISTS public.sync_subscription_status(UUID, BOOLEAN, TIMESTAMPTZ, TEXT);
DROP FUNCTION IF EXISTS public.add_xp(UUID, INTEGER);

-- ─── 5. Caller-scoped credit functions (for the app) ──────────────────

-- Atomic spend for the authenticated user. Returns true when the balance
-- covered the amount, false otherwise.
CREATE OR REPLACE FUNCTION public.spend_credits(
    p_amount INTEGER,
    p_reason TEXT DEFAULT ''
)
RETURNS BOOLEAN AS $$
DECLARE
    v_user TEXT := auth.uid()::text;
    v_remaining INTEGER;
BEGIN
    IF v_user IS NULL THEN
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

    INSERT INTO public.payment_transactions (user_id, type, amount, status, description)
    VALUES (v_user, 'credit_spend', -p_amount, 'completed', LEFT(COALESCE(p_reason, ''), 200));

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.spend_credits(INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spend_credits(INTEGER, TEXT) TO authenticated;

-- Daily login credit with server-side streak tracking. The claim gate is
-- the row-lock + timestamp check, so it cannot be replayed or reset from
-- the client. Returns { earned, streak }.
CREATE OR REPLACE FUNCTION public.claim_daily_credit()
RETURNS JSONB AS $$
DECLARE
    v_user TEXT := auth.uid()::text;
    v_last TIMESTAMPTZ;
    v_streak INTEGER;
    v_earned INTEGER;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;

    PERFORM set_config('app.credit_op', 'on', true);

    SELECT last_daily_credit_at, COALESCE(login_streak, 0)
    INTO v_last, v_streak
    FROM public.profiles
    WHERE user_id = v_user
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('earned', 0, 'streak', 0);
    END IF;

    IF v_last IS NOT NULL AND v_last > NOW() - INTERVAL '24 hours' THEN
        RETURN jsonb_build_object('earned', 0, 'streak', v_streak);
    END IF;

    IF v_last IS NOT NULL AND v_last > NOW() - INTERVAL '48 hours' THEN
        v_streak := v_streak + 1;
    ELSE
        v_streak := 1;
    END IF;

    v_earned := 1 + CASE WHEN v_streak % 7 = 0 THEN 2 ELSE 0 END;

    UPDATE public.profiles
    SET credits = credits + v_earned,
        login_streak = v_streak,
        last_daily_credit_at = NOW(),
        updated_at = NOW()
    WHERE user_id = v_user;

    INSERT INTO public.payment_transactions (user_id, type, amount, status, description)
    VALUES (v_user, 'reward', v_earned, 'completed',
            CASE WHEN v_streak % 7 = 0
                 THEN 'Daily login + ' || v_streak || '-day streak bonus'
                 ELSE 'Daily login' END);

    RETURN jsonb_build_object('earned', v_earned, 'streak', v_streak);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.claim_daily_credit() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_daily_credit() TO authenticated;

-- Engagement rewards with server-fixed amounts and dedup rules.
-- Amounts live here, not in the client; one-time reasons can only ever be
-- claimed once, recurring reasons at most once per day.
CREATE OR REPLACE FUNCTION public.award_engagement_credit(p_reason TEXT)
RETURNS INTEGER AS $$
DECLARE
    v_user TEXT := auth.uid()::text;
    v_amount INTEGER;
    v_once BOOLEAN;
    v_tag TEXT;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;

    CASE p_reason
        WHEN 'PROFILE_COMPLETE'   THEN v_amount := 5;  v_once := TRUE;
        WHEN 'REFER_FRIEND'       THEN v_amount := 10; v_once := TRUE;
        WHEN 'APPLY_OPPORTUNITY'  THEN v_amount := 3;  v_once := FALSE;
        WHEN 'COMPLETE_GOAL'      THEN v_amount := 5;  v_once := FALSE;
        WHEN 'WRITE_REVIEW'       THEN v_amount := 2;  v_once := FALSE;
        ELSE RAISE EXCEPTION 'Unknown reward reason: %', p_reason;
    END CASE;

    v_tag := 'engagement:' || p_reason;

    -- Serialize concurrent claims for this user through the profile row.
    PERFORM set_config('app.credit_op', 'on', true);
    PERFORM 1 FROM public.profiles WHERE user_id = v_user FOR UPDATE;
    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    IF v_once THEN
        IF EXISTS (
            SELECT 1 FROM public.payment_transactions
            WHERE user_id = v_user AND type = 'reward' AND description = v_tag
        ) THEN
            RETURN 0;
        END IF;
    ELSE
        IF EXISTS (
            SELECT 1 FROM public.payment_transactions
            WHERE user_id = v_user AND type = 'reward' AND description = v_tag
              AND created_at > NOW() - INTERVAL '24 hours'
        ) THEN
            RETURN 0;
        END IF;
    END IF;

    UPDATE public.profiles
    SET credits = credits + v_amount,
        updated_at = NOW()
    WHERE user_id = v_user;

    INSERT INTO public.payment_transactions (user_id, type, amount, status, description)
    VALUES (v_user, 'reward', v_amount, 'completed', v_tag);

    RETURN v_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.award_engagement_credit(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_engagement_credit(TEXT) TO authenticated;

-- ─── 6. Service-role-only admin functions (for webhooks) ──────────────

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

    UPDATE public.profiles
    SET credits = credits + p_amount,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    INSERT INTO public.payment_transactions (user_id, type, amount, status, description)
    VALUES (p_user_id, 'credit_purchase', p_amount, 'completed', LEFT(COALESCE(p_reason, ''), 200));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.admin_add_credits(TEXT, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_credits(TEXT, INTEGER, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.sync_subscription_status(
    p_user_id TEXT,
    p_is_pro BOOLEAN,
    p_pro_since TIMESTAMPTZ DEFAULT NULL,
    p_subscription_id TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    UPDATE public.profiles
    SET is_pro = p_is_pro,
        pro_since = COALESCE(p_pro_since, CASE WHEN p_is_pro THEN NOW() ELSE NULL END),
        subscription_id = p_subscription_id,
        updated_at = NOW()
    WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.sync_subscription_status(TEXT, BOOLEAN, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_subscription_status(TEXT, BOOLEAN, TIMESTAMPTZ, TEXT) TO service_role;
