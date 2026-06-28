-- Create testimonials table for landing page reviews
CREATE TABLE IF NOT EXISTS public.testimonials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    country TEXT,
    avatar_url TEXT,
    rating INTEGER NOT NULL DEFAULT 5 CHECK (rating >= 1 AND rating <= 5),
    review_text TEXT NOT NULL,
    video_url TEXT,
    youtube_id TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Testimonials are publicly viewable when active" ON public.testimonials;
CREATE POLICY "Testimonials are publicly viewable when active"
    ON public.testimonials FOR SELECT
    USING (is_active = true);

DROP POLICY IF EXISTS "Admins can insert testimonials" ON public.testimonials;
CREATE POLICY "Admins can insert testimonials"
    ON public.testimonials FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.user_id = auth.uid()::text
            AND profiles.role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Admins can update testimonials" ON public.testimonials;
CREATE POLICY "Admins can update testimonials"
    ON public.testimonials FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.user_id = auth.uid()::text
            AND profiles.role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Admins can delete testimonials" ON public.testimonials;
CREATE POLICY "Admins can delete testimonials"
    ON public.testimonials FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.user_id = auth.uid()::text
            AND profiles.role = 'admin'
        )
    );

DROP INDEX IF EXISTS idx_testimonials_active_sort;
CREATE INDEX idx_testimonials_active_sort ON public.testimonials (is_active, sort_order, created_at DESC);

-- Seed initial testimonials
INSERT INTO public.testimonials (name, role, country, rating, review_text, is_active, sort_order) VALUES
('Amara Okafor', 'Chevening Scholar', '🇳🇬 Nigeria', 5, 'Edutu helped me find the Chevening Scholarship and build a clear roadmap. The personalized matches saved me weeks of research.', true, 1),
('David Mensah', 'MSc Student, UCL', '🇬🇭 Ghana', 5, 'I was overwhelmed with options until Edutu filtered them down. Got admitted to my top choice with a structured plan.', true, 2),
('Fatima Hassan', 'Fulbright Recipient', '🇰🇪 Kenya', 5, 'The mentor guidance and AI roadmap features are incredible. I knew exactly what to do at every step of my application.', true, 3),
('Tendai Moyo', 'Software Engineer', '🇿🇼 Zimbabwe', 4, 'Found my first tech job through the opportunities feed. The deadline reminders kept me on track throughout the process.', true, 4);
