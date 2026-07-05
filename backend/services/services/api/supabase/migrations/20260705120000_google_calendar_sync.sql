-- Two-way Google Calendar sync: per-user OAuth connection + goal↔event links.

CREATE TABLE IF NOT EXISTS public.google_calendar_connections (
  user_id uuid PRIMARY KEY,
  access_token text,
  refresh_token text NOT NULL,
  expiry_date timestamptz,
  calendar_id text NOT NULL DEFAULT 'primary',
  sync_token text,
  status text NOT NULL DEFAULT 'active',
  connected_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.calendar_event_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  goal_id uuid NOT NULL,
  google_event_id text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS calendar_event_links_user_idx
  ON public.calendar_event_links (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS calendar_event_links_goal_idx
  ON public.calendar_event_links (goal_id);

-- Server-only tables (accessed via the API service role); block anon/authenticated.
ALTER TABLE public.google_calendar_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_event_links ENABLE ROW LEVEL SECURITY;
