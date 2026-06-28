-- Migration 014: Admin Audit Logs
-- Tracks all admin actions for security and compliance.

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
    id BIGSERIAL PRIMARY KEY,
    action TEXT NOT NULL,
    user_id TEXT NOT NULL,
    resource TEXT NOT NULL,
    resource_id TEXT,
    metadata JSONB DEFAULT '{}',
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_audit_user_id ON public.admin_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON public.admin_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON public.admin_audit_logs(resource, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON public.admin_audit_logs(created_at DESC);

-- RLS: only admins and service_role can read; service_role can insert
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read audit logs"
    ON public.admin_audit_logs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.user_id = auth.uid()::text
            AND profiles.role = 'admin'
        )
    );

CREATE POLICY "Service role can manage audit logs"
    ON public.admin_audit_logs FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
