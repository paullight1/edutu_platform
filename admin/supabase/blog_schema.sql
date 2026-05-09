-- Blog Posts Table Schema for Edutu Admin
-- Run this in your Supabase SQL Editor

-- Create blog_posts table
CREATE TABLE IF NOT EXISTS blog_posts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    excerpt TEXT,
    cover_image TEXT,
    status TEXT CHECK (status IN ('draft', 'published')) DEFAULT 'draft',
    author_id TEXT NOT NULL,
    author_name TEXT DEFAULT 'Admin',
    tags TEXT[] DEFAULT '{}',
    views INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    published_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all operations for authenticated users (admin)
CREATE POLICY "Allow full access for authenticated users" ON blog_posts
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Policy: Allow public read access for published posts
CREATE POLICY "Allow public read for published posts" ON blog_posts
    FOR SELECT
    TO anon
    USING (status = 'published');

-- Create index on status for faster queries
CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON blog_posts(status);

-- Create index on slug for faster lookups
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts(slug);

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_blog_posts_created_at ON blog_posts(created_at DESC);

-- Create storage bucket for blog images
-- Note: Run this in your Supabase dashboard or use the API
-- INSERT INTO storage.buckets (id, name, public) VALUES ('blog-images', 'blog-images', true);

-- Enable realtime for blog_posts
ALTER PUBLICATION supabase_realtime ADD TABLE blog_posts;
