-- Multi-provider two-way calendar sync (google | outlook | apple_caldav)
-- plus a subscribable webcal (.ics) feed token per user.

CREATE TABLE IF NOT EXISTS public.calendar_connections (
  user_id uuid NOT NULL,
  provider text NOT NULL,
  access_token text,
  refresh_token text,
  expiry_date timestamptz,
  calendar_id text NOT NULL DEFAULT 'primary',
  sync_state text,
  caldav_url text,
  caldav_username text,
  caldav_password text,
  status text NOT NULL DEFAULT 'active',
  connected_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, provider)
);

CREATE TABLE IF NOT EXISTS public.calendar_event_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL,
  goal_id uuid NOT NULL,
  external_event_id text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS calendar_event_links_user_idx
  ON public.calendar_event_links (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS calendar_event_links_goal_provider_idx
  ON public.calendar_event_links (goal_id, provider);

CREATE TABLE IF NOT EXISTS public.calendar_feed_tokens (
  user_id uuid PRIMARY KEY,
  token text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

-- Server-only tables (accessed via the API service role); block anon/authenticated.
ALTER TABLE public.calendar_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_event_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_feed_tokens ENABLE ROW LEVEL SECURITY;
