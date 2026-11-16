-- =====================================================
-- REFERRAL SYSTEM
--
-- Builds on the secure credit rail (015 → 023). Canonical ledger is
-- public.credit_transactions; auth subject is public.current_app_user_id()
-- (the raw Clerk sub — auth.uid() is NULL for non-UUID Clerk ids).
--
-- Model:
--  * profiles.referral_code — each user's shareable code (lazy-generated).
--  * public.referrals — one row per (referee), source of truth for who
--    referred whom. referee_id is UNIQUE ⇒ a user can be attributed once.
--  * redeem_referral(code) records a PENDING referral at signup.
--  * award_engagement_credit('PROFILE_COMPLETE') settles it: on the FIRST
--    profile completion of a referred user, credit the referrer +10 (once
--    per friend) and the referee +5 bonus, atomically.
-- =====================================================

-- ─── 1. Schema ────────────────────────────────────────────────────────

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS referral_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_referral_code_key
    ON public.profiles (referral_code)
    WHERE referral_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.referrals (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_id    TEXT NOT NULL,
    referee_id     TEXT NOT NULL UNIQUE,
    code           TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'completed')),
    reward_referrer INTEGER NOT NULL DEFAULT 0,
    reward_referee  INTEGER NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS referrals_referrer_id_idx
    ON public.referrals (referrer_id);

-- ─── 2. RLS: a user may read referrals they're party to; no client writes ─

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own referrals" ON public.referrals;
CREATE POLICY "Users can view own referrals"
    ON public.referrals FOR SELECT
    USING (
        public.current_app_user_id() IS NOT NULL
        AND (
            referrer_id = public.current_app_user_id()
            OR referee_id = public.current_app_user_id()
        )
    );
-- No INSERT/UPDATE/DELETE policies: all writes go through the SECURITY
-- DEFINER functions below, which bypass RLS as the table owner.

-- ─── 3. get_or_create_my_referral_code() ──────────────────────────────
--
-- Returns the caller's code, generating one on first call. 8 uppercase
-- hex chars (~4.3B space); collisions retried against the unique index.

CREATE OR REPLACE FUNCTION public.get_or_create_my_referral_code()
RETURNS TEXT AS $$
DECLARE
    v_user TEXT := public.current_app_user_id();
    v_code TEXT;
    v_try  INTEGER := 0;
BEGIN
    IF v_user IS NULL OR v_user = '' THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;

    SELECT referral_code INTO v_code FROM public.profiles WHERE user_id = v_user;
    IF v_code IS NOT NULL THEN
        RETURN v_code;
    END IF;

    LOOP
        v_try := v_try + 1;
        v_code := upper(substr(md5(v_user || clock_timestamp()::text || v_try::text), 1, 8));

        BEGIN
            -- credit_op flag not needed (referral_code isn't a protected
            -- column), but harmless and keeps intent explicit.
            PERFORM set_config('app.credit_op', 'on', true);

            UPDATE public.profiles
                SET referral_code = v_code, updated_at = now()
                WHERE user_id = v_user;

            IF NOT FOUND THEN
                -- No profile row yet (user hasn't saved a profile). Seed a
                -- minimal row; the INSERT protection trigger zeroes any
                -- privileged columns, leaving referral_code intact.
                INSERT INTO public.profiles (user_id, referral_code, updated_at)
                    VALUES (v_user, v_code, now())
                    ON CONFLICT (user_id)
                    DO UPDATE SET referral_code = EXCLUDED.referral_code, updated_at = now()
                    WHERE public.profiles.referral_code IS NULL;
            END IF;

            RETURN v_code;
        EXCEPTION WHEN unique_violation THEN
            IF v_try >= 6 THEN
                RAISE EXCEPTION 'Could not allocate a unique referral code';
            END IF;
            -- retry with a new candidate
        END;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.get_or_create_my_referral_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_my_referral_code() TO authenticated;

-- ─── 4. redeem_referral(code) ─────────────────────────────────────────
--
-- Records the caller as a referee of the code's owner. Returns {status}.
-- Reward is NOT granted here — it settles at first profile completion.

CREATE OR REPLACE FUNCTION public.redeem_referral(p_code TEXT)
RETURNS JSONB AS $$
DECLARE
    v_referee  TEXT := public.current_app_user_id();
    v_code     TEXT := upper(trim(COALESCE(p_code, '')));
    v_referrer TEXT;
BEGIN
    IF v_referee IS NULL OR v_referee = '' THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;
    IF v_code = '' THEN
        RETURN jsonb_build_object('status', 'invalid_code');
    END IF;

    SELECT user_id INTO v_referrer
        FROM public.profiles WHERE referral_code = v_code;

    IF v_referrer IS NULL THEN
        RETURN jsonb_build_object('status', 'invalid_code');
    END IF;
    IF v_referrer = v_referee THEN
        RETURN jsonb_build_object('status', 'self');
    END IF;

    -- Already attributed to someone (or self-redeemed before)?
    IF EXISTS (SELECT 1 FROM public.referrals WHERE referee_id = v_referee) THEN
        RETURN jsonb_build_object('status', 'already_redeemed');
    END IF;

    -- Can't attribute an already-established account. First profile
    -- completion is the settlement gate, so a user who has already claimed
    -- it is not a genuinely new referral.
    IF EXISTS (
        SELECT 1 FROM public.credit_transactions
        WHERE user_id = v_referee AND type = 'reward'
          AND description = 'engagement:PROFILE_COMPLETE'
    ) THEN
        RETURN jsonb_build_object('status', 'too_late');
    END IF;

    BEGIN
        INSERT INTO public.referrals (referrer_id, referee_id, code, status)
            VALUES (v_referrer, v_referee, v_code, 'pending');
    EXCEPTION WHEN unique_violation THEN
        -- Lost a race for this referee row.
        RETURN jsonb_build_object('status', 'already_redeemed');
    END;

    RETURN jsonb_build_object('status', 'pending');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.redeem_referral(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_referral(TEXT) TO authenticated;

-- ─── 5. award_engagement_credit — re-asserted with referral settlement ─
--
-- Identical to migration 023 EXCEPT: after granting a first-time
-- PROFILE_COMPLETE, settle any pending referral where this user is the
-- referee — crediting the referrer (+10, once per friend) and the referee
-- (+5 bonus) in the same transaction. All amounts server-fixed.

CREATE OR REPLACE FUNCTION public.award_engagement_credit(p_reason text)
RETURNS integer AS $$
DECLARE
    v_user     text := public.current_app_user_id();
    v_amount   integer;
    v_once     boolean;
    v_tag      text;
    v_ref_id   uuid;
    v_referrer text;
    c_reward_referrer CONSTANT integer := 10;
    c_reward_referee  CONSTANT integer := 5;
BEGIN
    IF v_user IS NULL OR v_user='' THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
    CASE p_reason
        WHEN 'PROFILE_COMPLETE'  THEN v_amount:=5;  v_once:=true;
        WHEN 'REFER_FRIEND'      THEN v_amount:=10; v_once:=true;
        WHEN 'APPLY_OPPORTUNITY' THEN v_amount:=3;  v_once:=false;
        WHEN 'COMPLETE_GOAL'     THEN v_amount:=5;  v_once:=false;
        WHEN 'WRITE_REVIEW'      THEN v_amount:=2;  v_once:=false;
        ELSE RAISE EXCEPTION 'Unknown reward reason: %', p_reason;
    END CASE;
    v_tag := 'engagement:'||p_reason;
    PERFORM set_config('app.credit_op','on',true);
    PERFORM 1 FROM public.profiles WHERE user_id=v_user FOR UPDATE;
    IF NOT FOUND THEN RETURN 0; END IF;
    IF v_once THEN
        IF EXISTS (SELECT 1 FROM public.credit_transactions WHERE user_id=v_user AND type='reward' AND description=v_tag) THEN RETURN 0; END IF;
    ELSE
        IF EXISTS (SELECT 1 FROM public.credit_transactions WHERE user_id=v_user AND type='reward' AND description=v_tag AND created_at > now()-interval '24 hours') THEN RETURN 0; END IF;
    END IF;
    UPDATE public.profiles SET credits=credits+v_amount, updated_at=now() WHERE user_id=v_user;
    INSERT INTO public.credit_transactions(user_id,amount,type,description)
        VALUES (v_user, v_amount, 'reward', v_tag);

    -- ── Referral settlement (only on the first PROFILE_COMPLETE) ──
    IF p_reason = 'PROFILE_COMPLETE' THEN
        UPDATE public.referrals
            SET status = 'completed',
                completed_at = now(),
                reward_referrer = c_reward_referrer,
                reward_referee  = c_reward_referee
            WHERE referee_id = v_user AND status = 'pending'
            RETURNING id, referrer_id INTO v_ref_id, v_referrer;

        IF v_referrer IS NOT NULL THEN
            -- Referrer: +10, deduped by the per-referee ledger tag.
            UPDATE public.profiles SET credits=credits+c_reward_referrer, updated_at=now()
                WHERE user_id=v_referrer;
            INSERT INTO public.credit_transactions(user_id,amount,type,description,related_id,related_type)
                VALUES (v_referrer, c_reward_referrer, 'reward', 'referral:'||v_user, v_ref_id::text, 'referral');

            -- Referee: +5 signup bonus (on top of the +5 PROFILE_COMPLETE above).
            UPDATE public.profiles SET credits=credits+c_reward_referee, updated_at=now()
                WHERE user_id=v_user;
            INSERT INTO public.credit_transactions(user_id,amount,type,description,related_id,related_type)
                VALUES (v_user, c_reward_referee, 'reward', 'referral_bonus', v_ref_id::text, 'referral');
        END IF;
    END IF;

    RETURN v_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public;
REVOKE ALL ON FUNCTION public.award_engagement_credit(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_engagement_credit(text) TO authenticated;

-- ─── 6. get_my_referral_stats() ───────────────────────────────────────
--
-- Convenience aggregate for the invite screen. (The referrals RLS also
-- allows a direct SELECT, but this keeps the client query trivial.)

CREATE OR REPLACE FUNCTION public.get_my_referral_stats()
RETURNS JSONB AS $$
DECLARE
    v_user TEXT := public.current_app_user_id();
    v_total INTEGER;
    v_completed INTEGER;
    v_pending INTEGER;
    v_credits INTEGER;
BEGIN
    IF v_user IS NULL OR v_user = '' THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;

    SELECT
        count(*),
        count(*) FILTER (WHERE status = 'completed'),
        count(*) FILTER (WHERE status = 'pending'),
        COALESCE(sum(reward_referrer) FILTER (WHERE status = 'completed'), 0)
    INTO v_total, v_completed, v_pending, v_credits
    FROM public.referrals
    WHERE referrer_id = v_user;

    RETURN jsonb_build_object(
        'total', v_total,
        'completed', v_completed,
        'pending', v_pending,
        'creditsEarned', v_credits
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.get_my_referral_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_referral_stats() TO authenticated;
