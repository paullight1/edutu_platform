-- CANONICAL CREDIT LEDGER = public.credit_transactions
--
-- Deployed to live prod via MCP as migration `reconcile_credit_ledger`.
--
-- Two concurrent hardening deploys (session 05c file-chain + 05d consolidated)
-- left the credit RPCs split across two ledger tables. This migration makes
-- credit_transactions the single canonical ledger: every credit-movement RPC
-- writes here (text user_id, clean type enum, read by both the web admin
-- dashboard and the mobile wallet after useCredits was pointed at it).
-- admin_grant_credits was the outlier still writing payment_transactions.
--
-- All five functions are (re)asserted together so a future concurrent redeploy
-- cannot split the ledger again.

CREATE OR REPLACE FUNCTION public.spend_credits(p_amount integer, p_reason text DEFAULT '')
RETURNS boolean AS $$
DECLARE v_user text := public.current_app_user_id(); v_remaining integer;
BEGIN
  IF v_user IS NULL OR v_user='' THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
  IF p_amount IS NULL OR p_amount<=0 THEN RAISE EXCEPTION 'Invalid amount'; END IF;
  PERFORM set_config('app.credit_op','on',true);
  UPDATE public.profiles SET credits=credits-p_amount, updated_at=now()
    WHERE user_id=v_user AND credits>=p_amount RETURNING credits INTO v_remaining;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public.credit_transactions(user_id,amount,type,description)
    VALUES (v_user,-p_amount,'spend',LEFT(COALESCE(p_reason,''),200));
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public;
REVOKE ALL ON FUNCTION public.spend_credits(integer,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spend_credits(integer,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_daily_credit()
RETURNS jsonb AS $$
DECLARE v_user text := public.current_app_user_id(); v_last timestamptz; v_streak integer; v_earned integer;
BEGIN
  IF v_user IS NULL OR v_user='' THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
  PERFORM set_config('app.credit_op','on',true);
  SELECT last_daily_credit_at, COALESCE(login_streak,0) INTO v_last, v_streak
    FROM public.profiles WHERE user_id=v_user FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('earned',0,'streak',0); END IF;
  IF v_last IS NOT NULL AND v_last > now()-interval '24 hours' THEN
    RETURN jsonb_build_object('earned',0,'streak',v_streak);
  END IF;
  IF v_last IS NOT NULL AND v_last > now()-interval '48 hours' THEN v_streak:=v_streak+1; ELSE v_streak:=1; END IF;
  v_earned := 1 + CASE WHEN v_streak % 7 = 0 THEN 2 ELSE 0 END;
  UPDATE public.profiles SET credits=credits+v_earned, login_streak=v_streak,
         last_daily_credit_at=now(), updated_at=now() WHERE user_id=v_user;
  INSERT INTO public.credit_transactions(user_id,amount,type,description)
    VALUES (v_user, v_earned, 'reward',
            CASE WHEN v_streak % 7 = 0 THEN 'Daily login + '||v_streak||'-day streak bonus' ELSE 'Daily login' END);
  RETURN jsonb_build_object('earned',v_earned,'streak',v_streak);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public;
REVOKE ALL ON FUNCTION public.claim_daily_credit() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_daily_credit() TO authenticated;

CREATE OR REPLACE FUNCTION public.award_engagement_credit(p_reason text)
RETURNS integer AS $$
DECLARE v_user text := public.current_app_user_id(); v_amount integer; v_once boolean; v_tag text;
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
  RETURN v_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public;
REVOKE ALL ON FUNCTION public.award_engagement_credit(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_engagement_credit(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_add_credits(p_user_id text, p_amount integer, p_reason text DEFAULT '')
RETURNS void AS $$
BEGIN
  IF p_amount IS NULL OR p_amount<=0 THEN RAISE EXCEPTION 'Invalid amount'; END IF;
  PERFORM set_config('app.credit_op','on',true);
  UPDATE public.profiles SET credits=credits+p_amount, updated_at=now() WHERE user_id=p_user_id;
  INSERT INTO public.credit_transactions(user_id,amount,type,description)
    VALUES (p_user_id, p_amount, 'purchase', LEFT(COALESCE(p_reason,''),200));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public;
REVOKE ALL ON FUNCTION public.admin_add_credits(text,integer,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_credits(text,integer,text) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_grant_credits(
  p_user_id text, p_amount integer, p_description text,
  p_related_id text DEFAULT NULL, p_related_type text DEFAULT NULL)
RETURNS TABLE(success boolean, balance integer, error_message text) AS $$
DECLARE v_new_balance integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles
                 WHERE user_id = public.current_app_user_id() AND role IN ('admin','super_admin')) THEN
    RETURN QUERY SELECT false, 0, 'Unauthorized: admin access required'; RETURN;
  END IF;
  PERFORM set_config('app.credit_op','on',true);
  UPDATE public.profiles SET credits=credits+p_amount, updated_at=now()
    WHERE user_id=p_user_id RETURNING credits INTO v_new_balance;
  IF v_new_balance IS NULL THEN RETURN QUERY SELECT false, 0, 'User not found'; RETURN; END IF;
  INSERT INTO public.credit_transactions(user_id,amount,type,description,related_id,related_type)
    VALUES (p_user_id, p_amount, 'admin_grant', p_description, p_related_id, p_related_type);
  RETURN QUERY SELECT true, v_new_balance, ''::text;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public;
REVOKE ALL ON FUNCTION public.admin_grant_credits(text,integer,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_credits(text,integer,text,text,text) TO authenticated;
