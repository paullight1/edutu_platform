-- CV Builder Database Schema
-- Run this in Supabase SQL Editor

-- 1. Add Pro/Trial columns to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cv_trial_used BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_pro BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pro_since TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_id TEXT;

-- 2. CV Templates table (pre-built templates)
CREATE TABLE IF NOT EXISTS cv_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general',
    description TEXT,
    structure_json JSONB NOT NULL DEFAULT '{}',
    is_premium BOOLEAN DEFAULT false,
    thumbnail_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. User CVs table
CREATE TABLE IF NOT EXISTS user_cvs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    template_id UUID REFERENCES cv_templates(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    data_json JSONB NOT NULL DEFAULT '{}',
    is_primary BOOLEAN DEFAULT false,
    match_score INTEGER DEFAULT 0,
    target_opportunity_id UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Enable RLS
ALTER TABLE cv_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_cvs ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for cv_templates
CREATE POLICY "Templates are viewable by everyone" ON cv_templates
    FOR SELECT USING (true);

-- 6. RLS Policies for user_cvs
CREATE POLICY "Users can view own CVs" ON user_cvs
    FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own CVs" ON user_cvs
    FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update own CVs" ON user_cvs
    FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY "Users can delete own CVs" ON user_cvs
    FOR DELETE USING (auth.uid()::text = user_id);

-- 7. Insert default CV templates
INSERT INTO cv_templates (name, category, description, structure_json, is_premium) VALUES
('Professional', 'general', 'Classic professional resume layout', 
 '{"sections":[{"id":"header","type":"header","label":"Personal Info"},{"id":"summary","type":"summary","label":"Professional Summary"},{"id":"experience","type":"experience","label":"Work Experience","repeatable":true},{"id":"education","type":"education","label":"Education","repeatable":true},{"id":"skills","type":"skills","label":"Skills"},{"id":"projects","type":"projects","label":"Projects","repeatable":true}]}', 
false),
('Modern', 'modern', 'Sleek modern design with accent colors', 
 '{"sections":[{"id":"header","type":"header","label":"Personal Info"},{"id":"summary","type":"summary","label":"About Me"},{"id":"experience","type":"experience","label":"Experience","repeatable":true},{"id":"education","type":"education","label":"Education","repeatable":true},{"id":"skills","type":"skills","label":"Skills & Expertise"},{"id":"achievements","type":"achievements","label":"Key Achievements","repeatable":true}]}', 
false),
('Academic', 'academic', 'Perfect for academic and research positions', 
 '{"sections":[{"id":"header","type":"header","label":"Personal Info"},{"id":"summary","type":"summary","label":"Research Interests"},{"id":"education","type":"education","label":"Education","repeatable":true},{"id":"research","type":"research","label":"Research Experience","repeatable":true},{"id":"publications","type":"publications","label":"Publications","repeatable":true},{"id":"skills","type":"skills","label":"Technical Skills"},{"id":"references","type":"references","label":"References"}]}', 
false),
('Tech Executive', 'tech', 'Premium template for tech leadership roles', 
 '{"sections":[{"id":"header","type":"header","label":"Personal Info"},{"id":"summary","type":"summary","label":"Executive Summary"},{"id":"experience","type":"experience","label":"Leadership Experience","repeatable":true},{"id":"achievements","type":"achievements","label":"Key Achievements","repeatable":true},{"id":"skills","type":"skills","label":"Technical Skills"},{"id":"education","type":"education","label":"Education","repeatable":true}]}', 
true),
('Investment Banking', 'finance', 'Premium template for finance professionals', 
 '{"sections":[{"id":"header","type":"header","label":"Personal Info"},{"id":"summary","type":"summary","label":"Professional Summary"},{"id":"experience","type":"experience","label":"Professional Experience","repeatable":true},{"id":"education","type":"education","label":"Education & Credentials"},{"id":"skills","type":"skills","label":"Technical Skills"},{"id":"transactions","type":"transactions","label":"Notable Transactions","repeatable":true}]}', 
true);

-- 8. Create indexes
CREATE INDEX IF NOT EXISTS idx_user_cvs_user_id ON user_cvs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_cvs_target_opp ON user_cvs(target_opportunity_id);
CREATE INDEX IF NOT EXISTS idx_cv_templates_category ON cv_templates(category);
CREATE INDEX IF NOT EXISTS idx_cv_templates_premium ON cv_templates(is_premium);
