-- Credit Transactions Table
-- This table tracks all credit movements: purchases, spending, admin awards, refunds, etc.

CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  type text NOT NULL CHECK (type IN ('purchase', 'spend', 'reward', 'refund', 'admin_grant', 'creator_earning')),
  amount integer NOT NULL,
  description text,
  related_id text,
  related_type text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON public.credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created_at ON public.credit_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_type ON public.credit_transactions(type);

-- Enable Row Level Security
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own transactions" ON public.credit_transactions;
DROP POLICY IF EXISTS "System inserts transactions" ON public.credit_transactions;
DROP POLICY IF EXISTS "Admins can view all transactions" ON public.credit_transactions;
DROP POLICY IF EXISTS "Admins can manage transactions" ON public.credit_transactions;

-- Users can only see their own transactions (auth.uid() is uuid, user_id is text)
CREATE POLICY "Users can view own transactions"
  ON public.credit_transactions FOR SELECT
  USING (auth.uid()::text = user_id);

-- System (service role) can insert transactions
CREATE POLICY "System inserts transactions"
  ON public.credit_transactions FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR auth.uid()::text = user_id);

-- Admins (users with admin role in profiles) can view all transactions
CREATE POLICY "Admins can view all transactions"
  ON public.credit_transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()::text
        AND p.role IN ('admin', 'super_admin')
    )
  );

-- Admins can insert/update transactions (for granting credits)
CREATE POLICY "Admins can manage transactions"
  ON public.credit_transactions
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()::text
        AND p.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()::text
        AND p.role IN ('admin', 'super_admin')
    )
  );

-- Admin Grant Credits Function
-- Allows admins to grant credits to any user atomically
CREATE OR REPLACE FUNCTION admin_grant_credits(
  p_user_id text,
  p_amount INTEGER,
  p_description TEXT,
  p_related_id TEXT DEFAULT NULL,
  p_related_type TEXT DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, balance INTEGER, error_message TEXT) AS $$
DECLARE
  v_current_balance INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- Check if admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE user_id = auth.uid()::text AND role IN ('admin', 'super_admin')
  ) THEN
    RETURN QUERY SELECT FALSE, 0, 'Unauthorized: admin access required';
    RETURN;
  END IF;

  -- Get current balance with row lock
  SELECT credits INTO v_current_balance
  FROM public.profiles
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_current_balance IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'User not found';
    RETURN;
  END IF;

  v_new_balance := v_current_balance + p_amount;

  -- Update credits
  UPDATE public.profiles SET credits = v_new_balance
  WHERE user_id = p_user_id;

  -- Record transaction
  INSERT INTO public.credit_transactions (user_id, amount, type, description, related_id, related_type)
  VALUES (p_user_id, p_amount, 'admin_grant', p_description, p_related_id, p_related_type);

  RETURN QUERY SELECT TRUE, v_new_balance, ''::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Admin Set Pro Status Function
CREATE OR REPLACE FUNCTION admin_set_pro_status(
  p_user_id text,
  p_is_pro BOOLEAN,
  p_pro_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, error_message TEXT) AS $$
BEGIN
  -- Check if admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE user_id = auth.uid()::text AND role IN ('admin', 'super_admin')
  ) THEN
    RETURN QUERY SELECT FALSE, 'Unauthorized: admin access required';
    RETURN;
  END IF;

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
$$ LANGUAGE plpgsql SECURITY DEFINER;
