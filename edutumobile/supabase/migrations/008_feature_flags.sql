CREATE TABLE IF NOT EXISTS public.feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    description TEXT,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    pro_required BOOLEAN NOT NULL DEFAULT false,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Feature flags are publicly readable" ON public.feature_flags;
CREATE POLICY "Feature flags are publicly readable"
    ON public.feature_flags FOR SELECT
    USING (is_enabled = true);

DROP POLICY IF EXISTS "Admins can insert feature flags" ON public.feature_flags;
CREATE POLICY "Admins can insert feature flags"
    ON public.feature_flags FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.user_id = auth.uid()::text
            AND profiles.role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Admins can update feature flags" ON public.feature_flags;
CREATE POLICY "Admins can update feature flags"
    ON public.feature_flags FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.user_id = auth.uid()::text
            AND profiles.role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Admins can delete feature flags" ON public.feature_flags;
CREATE POLICY "Admins can delete feature flags"
    ON public.feature_flags FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.user_id = auth.uid()::text
            AND profiles.role = 'admin'
        )
    );

CREATE INDEX idx_feature_flags_enabled_sort ON public.feature_flags (is_enabled, sort_order, key);

INSERT INTO public.feature_flags (key, label, description, is_enabled, pro_required, sort_order) VALUES
('ai_cv_tailoring', 'AI CV Tailoring', 'AI-powered CV customization and optimization', true, true, 1),
('premium_templates', 'Premium CV Templates', 'Access to premium professionally designed CV templates', true, true, 2),
('unlimited_roadmaps', 'Unlimited AI Roadmaps', 'Create unlimited personalized career roadmaps', true, true, 3),
('priority_listing', 'Priority Creator Listing', 'Get prioritized visibility in creator listings', true, true, 4),
('advanced_filters', 'Advanced Opportunity Filters', 'Filter opportunities with advanced criteria', true, true, 5),
('pdf_export', 'PDF Export & Downloads', 'Export CVs and documents as PDF', true, true, 6),
('ai_coach', 'AI Coach Unlimited', 'Unlimited access to AI career coaching', true, true, 7),
('chat_support', 'Priority Support', 'Access to priority customer support', true, false, 8);
