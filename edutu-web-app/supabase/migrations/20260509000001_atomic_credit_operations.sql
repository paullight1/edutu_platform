-- Atomic Spend Credits Function
-- Replaces the read-then-write pattern with a single atomic operation
CREATE OR REPLACE FUNCTION spend_credits(
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
  -- Lock the row and read current balance
  SELECT credits INTO v_current_balance
  FROM profiles
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_current_balance IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'Profile not found';
    RETURN;
  END IF;

  IF v_current_balance < p_amount THEN
    RETURN QUERY SELECT FALSE, v_current_balance, 'Insufficient credits';
    RETURN;
  END IF;

  v_new_balance := v_current_balance - p_amount;

  -- Deduct credits atomically
  UPDATE profiles SET credits = v_new_balance
  WHERE user_id = p_user_id;

  -- Record transaction
  INSERT INTO credit_transactions (user_id, amount, type, description, related_id, related_type)
  VALUES (p_user_id, -p_amount, 'spend', p_description, p_related_id, p_related_type);

  RETURN QUERY SELECT TRUE, v_new_balance, ''::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atomic Add Credits Function
CREATE OR REPLACE FUNCTION add_credits(
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
  UPDATE profiles SET credits = credits + p_amount
  WHERE user_id = p_user_id
  RETURNING credits INTO v_new_balance;

  INSERT INTO credit_transactions (user_id, amount, type, description, related_id, related_type)
  VALUES (p_user_id, p_amount, 'add', p_description, p_related_id, p_related_type);

  RETURN QUERY SELECT TRUE, v_new_balance, ''::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
