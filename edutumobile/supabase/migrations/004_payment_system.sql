-- =====================================================
-- PAYMENT SYSTEM TABLES
-- =====================================================

-- 1. SUBSCRIPTIONS TABLE
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    
    -- RevenueCat / Store info
    revenuecat_id TEXT UNIQUE,
    product_id TEXT NOT NULL,
    store TEXT CHECK (store IN ('app_store', 'play_store', 'stripe')),
    
    -- Subscription status
    status TEXT CHECK (status IN ('active', 'cancelled', 'expired', 'billing_retry', 'paused')) DEFAULT 'active',
    
    -- Dates
    purchased_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    billing_issues_detected_at TIMESTAMPTZ,
    unsubscribe_detected_at TIMESTAMPTZ,
    
    -- Auto-renewal
    auto_renewing BOOLEAN DEFAULT TRUE,
    will_renew BOOLEAN DEFAULT TRUE,
    
    -- Trial info
    is_trial_period BOOLEAN DEFAULT FALSE,
    trial_started_at TIMESTAMPTZ,
    trial_ended_at TIMESTAMPTZ,
    
    -- Metadata
    original_transaction_id TEXT,
    latest_transaction_id TEXT,
    environment TEXT CHECK (environment IN ('sandbox', 'production')) DEFAULT 'sandbox',
    raw_data JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_revenuecat_id ON public.subscriptions(revenuecat_id);

-- 2. PAYMENT TRANSACTIONS TABLE (ledger)
CREATE TABLE IF NOT EXISTS public.payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    
    -- Transaction info
    type TEXT CHECK (type IN ('subscription_purchase', 'credit_purchase', 'credit_spend', 'refund', 'payout', 'reward')) NOT NULL,
    amount INTEGER NOT NULL,
    currency TEXT DEFAULT 'USD',
    
    -- RevenueCat / Store info
    transaction_id TEXT,
    product_id TEXT,
    store TEXT,
    
    -- Status
    status TEXT CHECK (status IN ('pending', 'completed', 'failed', 'refunded')) DEFAULT 'pending',
    
    -- Description
    description TEXT,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_user_id ON public.payment_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_type ON public.payment_transactions(type);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON public.payment_transactions(status);

-- 3. CREDIT PURCHASES TABLE
CREATE TABLE IF NOT EXISTS public.credit_purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    
    -- Purchase info
    credits_purchased INTEGER NOT NULL,
    credits_granted INTEGER NOT NULL,
    amount_paid INTEGER NOT NULL, -- in cents
    currency TEXT DEFAULT 'USD',
    
    -- Store info
    product_id TEXT NOT NULL,
    store TEXT CHECK (store IN ('app_store', 'play_store', 'stripe')),
    transaction_id TEXT,
    
    -- Status
    status TEXT CHECK (status IN ('pending', 'completed', 'failed', 'refunded')) DEFAULT 'pending',
    
    -- Timestamps
    purchased_at TIMESTAMPTZ DEFAULT NOW(),
    granted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_purchases_user_id ON public.credit_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_purchases_status ON public.credit_purchases(status);

-- 4. ADD DEDUCT_CREDITS FUNCTION
CREATE OR REPLACE FUNCTION public.deduct_credits(
    user_uuid UUID,
    amount INTEGER,
    reason TEXT DEFAULT ''
)
RETURNS BOOLEAN AS $$
DECLARE
    current_credits INTEGER;
BEGIN
    -- Get current credits
    SELECT credits INTO current_credits
    FROM public.profiles
    WHERE id = user_uuid;
    
    -- Check if user has enough credits
    IF current_credits < amount THEN
        RETURN FALSE;
    END IF;
    
    -- Deduct credits
    UPDATE public.profiles
    SET credits = credits - amount,
        updated_at = NOW()
    WHERE id = user_uuid;
    
    -- Log the transaction
    INSERT INTO public.payment_transactions (
        user_id, type, amount, status, description
    ) VALUES (
        user_uuid, 'credit_spend', -amount, 'completed', reason
    );
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. ADD CREDITS FUNCTION (existing, enhanced)
CREATE OR REPLACE FUNCTION public.add_credits(
    user_uuid UUID,
    amount INTEGER,
    reason TEXT DEFAULT ''
)
RETURNS VOID AS $$
BEGIN
    -- Add credits to user profile
    UPDATE public.profiles
    SET credits = credits + amount,
        updated_at = NOW()
    WHERE id = user_uuid;
    
    -- Log the transaction
    INSERT INTO public.payment_transactions (
        user_id, type, amount, status, description
    ) VALUES (
        user_uuid, 'credit', amount, 'completed', reason
    );
    
    -- Create notification
    INSERT INTO public.notifications (
        user_id, kind, severity, title, body
    ) VALUES (
        user_uuid, 'credit-earned', 'success',
        'Credits Added',
        amount || ' credits have been added to your account.'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. CHECK SUBSCRIPTION STATUS FUNCTION
CREATE OR REPLACE FUNCTION public.check_pro_status(user_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
    is_pro BOOLEAN;
BEGIN
    SELECT is_pro INTO is_pro
    FROM public.profiles
    WHERE id = user_uuid;
    
    RETURN COALESCE(is_pro, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. SYNC SUBSCRIPTION STATUS FUNCTION
-- Called when RevenueCat webhook updates subscription status
CREATE OR REPLACE FUNCTION public.sync_subscription_status(
    p_user_id UUID,
    p_is_pro BOOLEAN,
    p_pro_since TIMESTAMPTZ DEFAULT NULL,
    p_subscription_id TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    UPDATE public.profiles
    SET 
        is_pro = p_is_pro,
        pro_since = COALESCE(p_pro_since, CASE WHEN p_is_pro THEN NOW() ELSE NULL END),
        subscription_id = p_subscription_id,
        updated_at = NOW()
    WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. ENABLE ROW LEVEL SECURITY
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_purchases ENABLE ROW LEVEL SECURITY;

-- 9. RLS POLICIES
-- Subscriptions
CREATE POLICY "Users can view own subscriptions"
    ON public.subscriptions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "System can manage subscriptions"
    ON public.subscriptions FOR ALL
    USING (auth.uid() IN (SELECT id FROM auth.users WHERE raw_user_meta_data->>'role' = 'admin'));

-- Payment Transactions
CREATE POLICY "Users can view own transactions"
    ON public.payment_transactions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "System can manage transactions"
    ON public.payment_transactions FOR ALL
    USING (auth.uid() IN (SELECT id FROM auth.users WHERE raw_user_meta_data->>'role' = 'admin'));

-- Credit Purchases
CREATE POLICY "Users can view own credit purchases"
    ON public.credit_purchases FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "System can manage credit purchases"
    ON public.credit_purchases FOR ALL
    USING (auth.uid() IN (SELECT id FROM auth.users WHERE raw_user_meta_data->>'role' = 'admin'));

-- 10. TRIGGER FOR UPDATED_AT
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER subscriptions_updated_at
    BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();
