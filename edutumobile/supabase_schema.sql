-- =====================================================
-- EDUTU MOBILE APP - COMPLETE DATABASE SCHEMA
-- Run this in Supabase SQL Editor: 
-- https://app.supabase.com/project/sioxocmrjmdevsdlzjns
-- =====================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- 1. PROFILES TABLE (User profiles linked to auth.users)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    full_name TEXT,
    avatar_url TEXT,
    bio TEXT,
    location TEXT,
    country TEXT,
    institution TEXT,
    field_of_study TEXT,
    education_level TEXT,
    interests TEXT[] DEFAULT '{}',
    skills TEXT[] DEFAULT '{}',
    ai_persona TEXT DEFAULT 'professional',
    language TEXT DEFAULT 'en',
    theme_package TEXT DEFAULT 'default',
    onboarding_complete BOOLEAN DEFAULT FALSE,
    credits INTEGER DEFAULT 0,
    xp_points INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    streak_days INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Public profiles are viewable by everyone"
    ON public.profiles FOR SELECT
    USING (TRUE);

CREATE POLICY "Users can insert their own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

-- Trigger to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'avatar_url'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- 2. NOTIFICATIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    kind TEXT CHECK (kind IN ('goal-reminder', 'goal-weekly-digest', 'goal-progress', 'opportunity-highlight', 'admin-broadcast', 'system', 'achievement', 'credit-earned')),
    severity TEXT DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'success', 'error')),
    title TEXT NOT NULL,
    body TEXT,
    data JSONB DEFAULT '{}',
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own notifications"
    ON public.notifications FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
    ON public.notifications FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own notifications"
    ON public.notifications FOR DELETE
    USING (auth.uid() = user_id);

-- Function to get unread count
CREATE OR REPLACE FUNCTION public.get_unread_notification_count(user_uuid UUID)
RETURNS INTEGER
LANGUAGE SQL
SECURITY DEFINER
AS $$
    SELECT COUNT(*)::INTEGER FROM public.notifications
    WHERE user_id = user_uuid AND read_at IS NULL;
$$;

-- =====================================================
-- 3. GOALS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.goals (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT,
    deadline TIMESTAMPTZ,
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    source TEXT DEFAULT 'custom' CHECK (source IN ('template', 'custom', 'imported')),
    template_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

-- Add roadmap/opportunity integration columns
ALTER TABLE public.goals 
ADD COLUMN IF NOT EXISTS roadmap_id UUID,
ADD COLUMN IF NOT EXISTS opportunity_title TEXT,
ADD COLUMN IF NOT EXISTS reminder_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS reminder_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS notification_id TEXT;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_goals_roadmap ON public.goals(roadmap_id) WHERE roadmap_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_goals_reminder ON public.goals(reminder_date) WHERE reminder_enabled = TRUE AND reminder_sent = FALSE;

-- =====================================================
-- USER OPPORTUNITY BOOKMARKS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.user_opportunity_bookmarks (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    roadmap_id UUID REFERENCES public.community_stories(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'bookmarked' CHECK (status IN ('bookmarked', 'applied', 'accepted', 'rejected')),
    applied_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.user_opportunity_bookmarks ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can CRUD own bookmarks"
    ON public.user_opportunity_bookmarks FOR ALL
    USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_bookmarks_user ON public.user_opportunity_bookmarks(user_id);

-- RLS Policies
CREATE POLICY "Users can CRUD own goals"
    ON public.goals FOR ALL
    USING (auth.uid() = user_id);

-- =====================================================
-- 4. CHAT THREADS & MESSAGES
-- =====================================================
CREATE TABLE IF NOT EXISTS public.chat_threads (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    thread_id UUID REFERENCES public.chat_threads(id) ON DELETE CASCADE,
    role TEXT CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    tokens_used INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for chat_threads
CREATE POLICY "Users can CRUD own chat threads"
    ON public.chat_threads FOR ALL
    USING (auth.uid() = user_id);

-- RLS Policies for chat_messages
CREATE POLICY "Users can view messages in own threads"
    ON public.chat_messages FOR SELECT
    USING (
        thread_id IN (
            SELECT id FROM public.chat_threads WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert messages in own threads"
    ON public.chat_messages FOR INSERT
    WITH CHECK (
        thread_id IN (
            SELECT id FROM public.chat_threads WHERE user_id = auth.uid()
        )
    );

-- =====================================================
-- 5. OPPORTUNITIES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.opportunities (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    title TEXT NOT NULL,
    organization TEXT,
    description TEXT,
    category TEXT,
    type TEXT CHECK (type IN ('internship', 'job', 'course', 'mentorship', 'competition', 'certification', 'fellowship', 'scholarship', 'bootcamp')),
    location TEXT DEFAULT 'Remote',
    deadline TIMESTAMPTZ,
    requirements TEXT[] DEFAULT '{}',
    skills TEXT[] DEFAULT '{}',
    benefits TEXT[] DEFAULT '{}',
    credits_reward INTEGER DEFAULT 0,
    external_url TEXT,
    difficulty TEXT DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
    featured BOOLEAN DEFAULT FALSE,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'closed', 'draft')),
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;

-- RLS Policies (public read, authenticated can create)
CREATE POLICY "Opportunities are viewable by everyone"
    ON public.opportunities FOR SELECT
    USING (status = 'active');

CREATE POLICY "Authenticated users can create opportunities"
    ON public.opportunities FOR INSERT
    WITH CHECK (auth.uid() = created_by);

-- =====================================================
-- 6. MARKETPLACE ITEMS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.marketplace_items (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    creator_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    type TEXT CHECK (type IN ('course', 'mentorship', 'template', 'resource')),
    category TEXT,
    price_credits INTEGER DEFAULT 0,
    image_url TEXT,
    content_url TEXT,
    rating DECIMAL(2,1) DEFAULT 0,
    review_count INTEGER DEFAULT 0,
    enrolled_count INTEGER DEFAULT 0,
    is_published BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.marketplace_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Published marketplace items are viewable by everyone"
    ON public.marketplace_items FOR SELECT
    USING (is_published = TRUE);

CREATE POLICY "Creators can manage own items"
    ON public.marketplace_items FOR ALL
    USING (auth.uid() = creator_id);

-- =====================================================
-- 7. USER PURCHASES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.user_purchases (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    item_id UUID REFERENCES public.marketplace_items(id) ON DELETE CASCADE,
    price_paid INTEGER NOT NULL,
    purchased_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, item_id)
);

-- Enable RLS
ALTER TABLE public.user_purchases ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own purchases"
    ON public.user_purchases FOR SELECT
    USING (auth.uid() = user_id);

-- =====================================================
-- 8. USER STORIES / COMMUNITY TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.community_stories (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    image_url TEXT,
    tags TEXT[] DEFAULT '{}',
    likes_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    is_featured BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.community_stories ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Community stories are viewable by everyone"
    ON public.community_stories FOR SELECT
    USING (TRUE);

CREATE POLICY "Users can create own stories"
    ON public.community_stories FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own stories"
    ON public.community_stories FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own stories"
    ON public.community_stories FOR DELETE
    USING (auth.uid() = user_id);

-- =====================================================
-- 9. STORAGE BUCKETS SETUP
-- =====================================================
-- Create storage buckets (run these separately in Storage section)
-- Note: These need to be done via Supabase Dashboard or API

/*
Buckets to create:
1. avatars - for user profile pictures
2. story-images - for community story images
3. marketplace-images - for course/product images
4. chat-attachments - for chat file attachments

RLS Policies for each bucket:
- Allow authenticated users to upload their own files
- Allow public read access
*/

-- =====================================================
-- 10. HELPER FUNCTIONS
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers to all tables
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_goals_updated_at
    BEFORE UPDATE ON public.goals
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_chat_threads_updated_at
    BEFORE UPDATE ON public.chat_threads
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_opportunities_updated_at
    BEFORE UPDATE ON public.opportunities
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_marketplace_items_updated_at
    BEFORE UPDATE ON public.marketplace_items
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_community_stories_updated_at
    BEFORE UPDATE ON public.community_stories
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to add credits to user
CREATE OR REPLACE FUNCTION public.add_credits(user_uuid UUID, amount INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_balance INTEGER;
BEGIN
    UPDATE public.profiles
    SET credits = credits + amount
    WHERE id = user_uuid
    RETURNING credits INTO new_balance;
    
    -- Create notification for credit earned
    INSERT INTO public.notifications (user_id, kind, severity, title, body, data)
    VALUES (
        user_uuid,
        'credit-earned',
        'success',
        'Credits Earned!',
        format('You earned %s credits', amount),
        jsonb_build_object('amount', amount, 'new_balance', new_balance)
    );
    
    RETURN new_balance;
END;
$$;

-- Function to add XP and handle level ups
CREATE OR REPLACE FUNCTION public.add_xp(user_uuid UUID, amount INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_xp INTEGER;
    current_level INTEGER;
    new_xp INTEGER;
    new_level INTEGER;
    leveled_up BOOLEAN := FALSE;
BEGIN
    -- Get current values
    SELECT xp_points, level INTO current_xp, current_level
    FROM public.profiles WHERE id = user_uuid;
    
    -- Calculate new XP
    new_xp := current_xp + amount;
    
    -- Simple level formula: level = floor(xp / 1000) + 1
    new_level := FLOOR(new_xp / 1000) + 1;
    
    -- Check if leveled up
    IF new_level > current_level THEN
        leveled_up := TRUE;
    END IF;
    
    -- Update profile
    UPDATE public.profiles
    SET xp_points = new_xp,
        level = new_level
    WHERE id = user_uuid;
    
    -- Create notification
    IF leveled_up THEN
        INSERT INTO public.notifications (user_id, kind, severity, title, body, data)
        VALUES (
            user_uuid,
            'achievement',
            'success',
            format('Level Up! You are now level %s', new_level),
            format('Congratulations! You reached level %s', new_level),
            jsonb_build_object('new_level', new_level, 'xp_gained', amount)
        );
    END IF;
    
    RETURN jsonb_build_object(
        'xp', new_xp,
        'level', new_level,
        'leveled_up', leveled_up,
        'xp_gained', amount
    );
END;
$$;

-- =====================================================
-- 11. INDEXES FOR PERFORMANCE
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read_at ON public.notifications(read_at);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_goals_user_id ON public.goals(user_id);
CREATE INDEX IF NOT EXISTS idx_goals_status ON public.goals(status);

CREATE INDEX IF NOT EXISTS idx_chat_threads_user_id ON public.chat_threads(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_id ON public.chat_messages(thread_id);

CREATE INDEX IF NOT EXISTS idx_opportunities_featured ON public.opportunities(featured);
CREATE INDEX IF NOT EXISTS idx_opportunities_category ON public.opportunities(category);
CREATE INDEX IF NOT EXISTS idx_opportunities_type ON public.opportunities(type);

CREATE INDEX IF NOT EXISTS idx_marketplace_items_creator ON public.marketplace_items(creator_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_items_published ON public.marketplace_items(is_published);

CREATE INDEX IF NOT EXISTS idx_community_stories_user ON public.community_stories(user_id);
CREATE INDEX IF NOT EXISTS idx_community_stories_featured ON public.community_stories(is_featured);

-- =====================================================
-- 12. SAMPLE DATA (Optional - for testing)
-- =====================================================

-- Sample opportunities
INSERT INTO public.opportunities (title, organization, description, category, type, location, credits_reward, featured, difficulty)
VALUES 
    ('Software Engineering Internship', 'Google', '12-week summer internship for CS students', 'Technology', 'internship', 'Remote', 500, TRUE, 'medium'),
    ('Full Stack Developer', 'Microsoft', 'Entry-level position for recent graduates', 'Technology', 'job', 'Hybrid', 1000, TRUE, 'hard'),
    ('Data Science Fellowship', 'DataCamp', '6-month program with mentorship', 'Data Science', 'fellowship', 'Remote', 300, FALSE, 'medium'),
    ('UX Design Bootcamp', 'Google', '3-month intensive design program', 'Design', 'bootcamp', 'Online', 200, TRUE, 'easy'),
    ('AI Research Scholarship', 'OpenAI', 'Research opportunity for graduate students', 'AI/ML', 'scholarship', 'Remote', 800, TRUE, 'hard')
ON CONFLICT DO NOTHING;

-- Sample marketplace items
INSERT INTO public.marketplace_items (creator_id, title, description, type, category, price_credits, is_published)
VALUES 
    ((SELECT id FROM public.profiles LIMIT 1), 'Resume Writing Masterclass', 'Learn to write ATS-friendly resumes', 'course', 'Career', 100, TRUE),
    ((SELECT id FROM public.profiles LIMIT 1), '1-on-1 Career Coaching', '30-minute session with industry expert', 'mentorship', 'Career', 200, TRUE)
ON CONFLICT DO NOTHING;

-- =====================================================
-- COMPLETE! Database is ready for the Edutu app.
-- =====================================================
