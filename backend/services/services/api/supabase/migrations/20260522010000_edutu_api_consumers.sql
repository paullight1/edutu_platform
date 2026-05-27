CREATE TABLE IF NOT EXISTS public.api_consumers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_email text,
  api_key_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active',
  plan text NOT NULL DEFAULT 'starter',
  allowed_scopes text[] NOT NULL DEFAULT ARRAY['opportunities:read', 'recommendations:read', 'events:write'],
  monthly_quota integer DEFAULT 1000,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_consumers_status
  ON public.api_consumers (status);

CREATE INDEX IF NOT EXISTS idx_api_consumers_key_hash
  ON public.api_consumers (api_key_hash);

CREATE TABLE IF NOT EXISTS public.api_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_id uuid NOT NULL REFERENCES public.api_consumers(id) ON DELETE CASCADE,
  request_id text,
  method text NOT NULL,
  endpoint text NOT NULL,
  status_code integer DEFAULT 200,
  latency_ms integer,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.api_usage_events
  ADD COLUMN IF NOT EXISTS request_id text,
  ADD COLUMN IF NOT EXISTS latency_ms integer;

CREATE INDEX IF NOT EXISTS idx_api_usage_consumer_created
  ON public.api_usage_events (consumer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.api_usage_buckets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_id uuid NOT NULL REFERENCES public.api_consumers(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  request_count integer NOT NULL DEFAULT 0,
  monthly_quota integer,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT api_usage_buckets_consumer_period_unique UNIQUE (consumer_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_api_usage_buckets_consumer_period
  ON public.api_usage_buckets (consumer_id, period_start);

CREATE TABLE IF NOT EXISTS public.api_partner_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_id uuid NOT NULL REFERENCES public.api_consumers(id) ON DELETE CASCADE,
  request_id text,
  event_type text NOT NULL,
  opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  external_user_id text,
  session_id text,
  source text NOT NULL DEFAULT 'partner',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_partner_events_consumer_created
  ON public.api_partner_events (consumer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_api_partner_events_opportunity
  ON public.api_partner_events (opportunity_id);

CREATE INDEX IF NOT EXISTS idx_api_partner_events_type
  ON public.api_partner_events (event_type);

CREATE INDEX IF NOT EXISTS idx_opportunities_public_updated
  ON public.opportunities (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_opportunities_public_deadline
  ON public.opportunities (status, deadline);

CREATE INDEX IF NOT EXISTS idx_opportunities_public_category_deadline
  ON public.opportunities (status, category, deadline);

ALTER TABLE public.api_consumers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_usage_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_partner_events ENABLE ROW LEVEL SECURITY;
