-- =====================================================
-- WEBHOOK IDEMPOTENCY
--
-- The RevenueCat webhook was not idempotent: it never recorded the
-- provider event id, and the one-time credit grant (admin_add_credits +
-- credit_purchases INSERT) was unconditional. RevenueCat retries on any
-- 5xx (and the handler returns 500 on error), so a redelivery double-
-- granted credits and duplicated ledger rows.
--
-- This adds a claim table keyed on the provider event id. The webhook
-- claims the event id up front; a duplicate delivery hits the PK and is
-- skipped. A partial unique index on credit_purchases.transaction_id is a
-- second line of defense against duplicate one-time-purchase grants.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.processed_webhook_events (
    event_id     TEXT PRIMARY KEY,
    provider     TEXT NOT NULL DEFAULT 'revenuecat',
    event_type   TEXT,
    user_id      TEXT,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only the service role (webhooks) may touch this table. RLS on with no
-- policies denies all client access; the service role bypasses RLS.
ALTER TABLE public.processed_webhook_events ENABLE ROW LEVEL SECURITY;

-- Defense in depth: a one-time purchase maps to exactly one store
-- transaction, so its transaction_id must be unique. NULLs (subscription
-- ledger rows, etc.) are excluded so they are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS ux_credit_purchases_transaction_id
    ON public.credit_purchases (transaction_id)
    WHERE transaction_id IS NOT NULL;
