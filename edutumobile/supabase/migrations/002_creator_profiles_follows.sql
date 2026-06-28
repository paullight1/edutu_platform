-- =====================================================
-- EDUTU: Creator Profiles & Follow System
-- Date: 2026-04-20
-- Description: 
--   1. Fix community_stories table structure
--   2. Add creator profiles with public view
--   3. Add follow/unfollow system
--   4. Add RLS policies for security
-- =====================================================

-- ─────────────────────────────────────────────────────
-- 1. FIX COMMUNITY_STORIES TABLE
-- ─────────────────────────────────────────────────────

-- Add missing columns if they don't exist
DO $$ 
BEGIN
    -- Add 'content' column for full story/description
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'community_stories' AND column_name = 'content') THEN
        ALTER TABLE community_stories ADD COLUMN content TEXT;
    END IF;

    -- Add 'experiences' column for creator background
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'community_stories' AND column_name = 'experiences') THEN
        ALTER TABLE community_stories ADD COLUMN experiences TEXT;
    END IF;

    -- Ensure 'resources' column exists (JSONB array)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'community_stories' AND column_name = 'resources') THEN
        ALTER TABLE community_stories ADD COLUMN resources JSONB DEFAULT '[]'::jsonb;
    END IF;

    -- Ensure 'roadmap' column exists (JSONB array for stages)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'community_stories' AND column_name = 'roadmap') THEN
        ALTER TABLE community_stories ADD COLUMN roadmap JSONB DEFAULT '[]'::jsonb;
    END IF;

    -- Ensure 'checklist' column exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'community_stories' AND column_name = 'checklist') THEN
        ALTER TABLE community_stories ADD COLUMN checklist JSONB DEFAULT '[]'::jsonb;
    END IF;

    -- Add contact_methods for creator contact info
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'community_stories' AND column_name = 'contact_methods') THEN
        ALTER TABLE community_stories ADD COLUMN contact_methods JSONB DEFAULT '[]'::jsonb;
    END IF;

    -- Add social_links for creator social media
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'community_stories' AND column_name = 'social_links') THEN
        ALTER TABLE community_stories ADD COLUMN social_links JSONB DEFAULT '{}'::jsonb;
    END IF;
END $$;

-- Create index on type for faster filtering
CREATE INDEX IF NOT EXISTS idx_community_stories_type 
ON community_stories(type);

-- Create index on creator user_id
CREATE INDEX IF NOT EXISTS idx_community_stories_creator_user_id 
ON community_stories((creator->>'user_id'));

-- ─────────────────────────────────────────────────────
-- 2. CREATE CREATOR PROFILES TABLE
-- ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS creator_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    
    -- Basic Info
    display_name TEXT NOT NULL,
    bio TEXT,
    tagline TEXT,
    avatar_url TEXT,
    cover_image_url TEXT,
    
    -- Professional Info
    expertise TEXT[],  -- Array of expertise areas
    skills TEXT[],     -- Array of skills
    experience_years INTEGER DEFAULT 0,
    occupation TEXT,
    company TEXT,
    education TEXT,
    
    -- Social Links
    website_url TEXT,
    linkedin_url TEXT,
    twitter_url TEXT,
    instagram_url TEXT,
    github_url TEXT,
    youtube_url TEXT,
    
    -- Stats (cached for performance)
    followers_count INTEGER DEFAULT 0,
    following_count INTEGER DEFAULT 0,
    roadmaps_count INTEGER DEFAULT 0,
    total_students INTEGER DEFAULT 0,
    avg_rating DECIMAL(3,2) DEFAULT 0,
    
    -- Status
    is_verified BOOLEAN DEFAULT FALSE,
    is_featured BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for creator_profiles
CREATE INDEX IF NOT EXISTS idx_creator_profiles_user_id ON creator_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_creator_profiles_display_name ON creator_profiles(display_name);
CREATE INDEX IF NOT EXISTS idx_creator_profiles_expertise ON creator_profiles USING GIN(expertise);
CREATE INDEX IF NOT EXISTS idx_creator_profiles_is_verified ON creator_profiles(is_verified);
CREATE INDEX IF NOT EXISTS idx_creator_profiles_is_active ON creator_profiles(is_active);

-- ─────────────────────────────────────────────────────
-- 3. CREATE FOLLOWS TABLE
-- ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS creator_follows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    follower_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    creator_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    
    -- Notification preferences
    notify_on_new_roadmap BOOLEAN DEFAULT TRUE,
    notify_on_updates BOOLEAN DEFAULT FALSE,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure unique follows
    UNIQUE(follower_user_id, creator_user_id)
);

-- Create indexes for follows
CREATE INDEX IF NOT EXISTS idx_creator_follows_follower ON creator_follows(follower_user_id);
CREATE INDEX IF NOT EXISTS idx_creator_follows_creator ON creator_follows(creator_user_id);
CREATE INDEX IF NOT EXISTS idx_creator_follows_created ON creator_follows(created_at DESC);

-- ─────────────────────────────────────────────────────
-- 4. CREATE CREATOR ACHIEVEMENTS TABLE
-- ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS creator_achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    
    -- Achievement Info
    achievement_type TEXT NOT NULL, -- 'badge', 'milestone', 'award'
    title TEXT NOT NULL,
    description TEXT,
    icon_url TEXT,
    
    -- Criteria
    criteria JSONB DEFAULT '{}'::jsonb,
    achieved_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creator_achievements_user ON creator_achievements(creator_user_id);
CREATE INDEX IF NOT EXISTS idx_creator_achievements_type ON creator_achievements(achievement_type);

-- ─────────────────────────────────────────────────────
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ─────────────────────────────────────────────────────

-- Enable RLS on all tables
ALTER TABLE creator_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_achievements ENABLE ROW LEVEL SECURITY;

-- Creator Profiles Policies
CREATE POLICY "Public profiles are viewable by everyone"
    ON creator_profiles FOR SELECT
    USING (is_active = TRUE);

CREATE POLICY "Users can update their own profile"
    ON creator_profiles FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile"
    ON creator_profiles FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Creator Follows Policies
CREATE POLICY "Follows are viewable by everyone"
    ON creator_follows FOR SELECT
    USING (TRUE);

CREATE POLICY "Users can follow creators"
    ON creator_follows FOR INSERT
    WITH CHECK (auth.uid() = follower_user_id);

CREATE POLICY "Users can unfollow"
    ON creator_follows FOR DELETE
    USING (auth.uid() = follower_user_id);

-- Creator Achievements Policies
CREATE POLICY "Achievements are viewable by everyone"
    ON creator_achievements FOR SELECT
    USING (TRUE);

-- ─────────────────────────────────────────────────────
-- 6. FUNCTIONS & TRIGGERS
-- ─────────────────────────────────────────────────────

-- Function to update follower counts
CREATE OR REPLACE FUNCTION update_creator_follower_counts()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Increment follower count for creator
        UPDATE creator_profiles 
        SET followers_count = followers_count + 1,
            updated_at = NOW()
        WHERE user_id = NEW.creator_user_id;
        
        -- Increment following count for follower
        UPDATE creator_profiles 
        SET following_count = following_count + 1,
            updated_at = NOW()
        WHERE user_id = NEW.follower_user_id;
        
    ELSIF TG_OP = 'DELETE' THEN
        -- Decrement follower count for creator
        UPDATE creator_profiles 
        SET followers_count = GREATEST(followers_count - 1, 0),
            updated_at = NOW()
        WHERE user_id = OLD.creator_user_id;
        
        -- Decrement following count for follower
        UPDATE creator_profiles 
        SET following_count = GREATEST(following_count - 1, 0),
            updated_at = NOW()
        WHERE user_id = OLD.follower_user_id;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for follower count updates
DROP TRIGGER IF EXISTS on_follow_change ON creator_follows;
CREATE TRIGGER on_follow_change
    AFTER INSERT OR DELETE ON creator_follows
    FOR EACH ROW
    EXECUTE FUNCTION update_creator_follower_counts();

-- Function to create creator profile on user creation
CREATE OR REPLACE FUNCTION create_creator_profile_on_signup()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO creator_profiles (user_id, display_name, is_active)
    VALUES (
        NEW.id,
        COALESCE(
            NEW.raw_user_meta_data->>'full_name',
            NEW.email,
            'Creator'
        ),
        TRUE
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for auto-creating profile (optional - can be enabled if needed)
-- DROP TRIGGER IF EXISTS on_user_signup ON auth.users;
-- CREATE TRIGGER on_user_signup
--     AFTER INSERT ON auth.users
--     FOR EACH ROW
--     EXECUTE FUNCTION create_creator_profile_on_signup();

-- Function to update roadmap counts
CREATE OR REPLACE FUNCTION update_creator_roadmap_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.visibility = 'public' AND NEW.type = 'roadmap' THEN
        UPDATE creator_profiles 
        SET roadmaps_count = roadmaps_count + 1,
            updated_at = NOW()
        WHERE user_id = (NEW.creator->>'user_id')::UUID;
        
    ELSIF TG_OP = 'UPDATE' THEN
        -- Handle visibility changes
        IF OLD.visibility = 'public' AND NEW.visibility != 'public' AND OLD.type = 'roadmap' THEN
            UPDATE creator_profiles 
            SET roadmaps_count = GREATEST(roadmaps_count - 1, 0),
                updated_at = NOW()
            WHERE user_id = (OLD.creator->>'user_id')::UUID;
        ELSIF OLD.visibility != 'public' AND NEW.visibility = 'public' AND NEW.type = 'roadmap' THEN
            UPDATE creator_profiles 
            SET roadmaps_count = roadmaps_count + 1,
                updated_at = NOW()
            WHERE user_id = (NEW.creator->>'user_id')::UUID;
        END IF;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for roadmap count updates
DROP TRIGGER IF EXISTS on_roadmap_change ON community_stories;
CREATE TRIGGER on_roadmap_change
    AFTER INSERT OR UPDATE ON community_stories
    FOR EACH ROW
    WHEN (NEW.type = 'roadmap')
    EXECUTE FUNCTION update_creator_roadmap_count();

-- ─────────────────────────────────────────────────────
-- 7. HELPER FUNCTIONS FOR API
-- ─────────────────────────────────────────────────────

-- Function to get creator profile with stats
CREATE OR REPLACE FUNCTION get_creator_profile(p_user_id UUID)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    display_name TEXT,
    bio TEXT,
    tagline TEXT,
    avatar_url TEXT,
    cover_image_url TEXT,
    expertise TEXT[],
    skills TEXT[],
    experience_years INTEGER,
    occupation TEXT,
    followers_count INTEGER,
    following_count INTEGER,
    roadmaps_count INTEGER,
    total_students INTEGER,
    avg_rating DECIMAL,
    is_verified BOOLEAN,
    website_url TEXT,
    linkedin_url TEXT,
    twitter_url TEXT,
    instagram_url TEXT,
    github_url TEXT,
    is_following BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cp.id,
        cp.user_id,
        cp.display_name,
        cp.bio,
        cp.tagline,
        cp.avatar_url,
        cp.cover_image_url,
        cp.expertise,
        cp.skills,
        cp.experience_years,
        cp.occupation,
        cp.followers_count,
        cp.following_count,
        cp.roadmaps_count,
        cp.total_students,
        cp.avg_rating,
        cp.is_verified,
        cp.website_url,
        cp.linkedin_url,
        cp.twitter_url,
        cp.instagram_url,
        cp.github_url,
        EXISTS (
            SELECT 1 FROM creator_follows cf 
            WHERE cf.follower_user_id = auth.uid() 
            AND cf.creator_user_id = cp.user_id
        ) as is_following
    FROM creator_profiles cp
    WHERE cp.user_id = p_user_id
    AND cp.is_active = TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to follow/unfollow creator
CREATE OR REPLACE FUNCTION toggle_follow_creator(p_creator_user_id UUID)
RETURNS TABLE (is_following BOOLEAN, followers_count INTEGER) AS $$
DECLARE
    v_following BOOLEAN;
    v_count INTEGER;
BEGIN
    -- Check if already following
    SELECT EXISTS (
        SELECT 1 FROM creator_follows 
        WHERE follower_user_id = auth.uid() 
        AND creator_user_id = p_creator_user_id
    ) INTO v_following;
    
    IF v_following THEN
        -- Unfollow
        DELETE FROM creator_follows 
        WHERE follower_user_id = auth.uid() 
        AND creator_user_id = p_creator_user_id;
        
        SELECT followers_count INTO v_count
        FROM creator_profiles WHERE user_id = p_creator_user_id;
        
        RETURN QUERY SELECT FALSE, v_count;
    ELSE
        -- Follow
        INSERT INTO creator_follows (follower_user_id, creator_user_id)
        VALUES (auth.uid(), p_creator_user_id);
        
        SELECT followers_count INTO v_count
        FROM creator_profiles WHERE user_id = p_creator_user_id;
        
        RETURN QUERY SELECT TRUE, v_count;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────
-- 8. SEED DATA (Optional - for testing)
-- ─────────────────────────────────────────────────────

-- Uncomment to add test data
-- INSERT INTO creator_profiles (user_id, display_name, bio, expertise, is_verified)
-- VALUES 
--     ('test-user-id-1', 'John Doe', 'Experienced software engineer', ARRAY['Programming', 'Career'], TRUE),
--     ('test-user-id-2', 'Jane Smith', 'Marketing expert', ARRAY['Business', 'Marketing'], FALSE);

-- ─────────────────────────────────────────────────────
-- MIGRATION COMPLETE
-- ─────────────────────────────────────────────────────

-- Print confirmation
DO $$
BEGIN
    RAISE NOTICE '✅ Creator profiles and follow system migration completed successfully!';
    RAISE NOTICE '📊 Tables created: creator_profiles, creator_follows, creator_achievements';
    RAISE NOTICE '🔐 RLS policies enabled for all tables';
    RAISE NOTICE '⚡ Triggers added for automatic count updates';
    RAISE NOTICE '🔧 Helper functions: get_creator_profile(), toggle_follow_creator()';
END $$;
