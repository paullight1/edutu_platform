-- Migration: Add RLS policies and admin functions for creator applications
-- Created: 2026-05-06

-- Enable RLS on creator_applications if not already enabled
ALTER TABLE public.creator_applications ENABLE ROW LEVEL SECURITY;

-- Users can view their own applications
CREATE POLICY "Users can view own applications"
    ON public.creator_applications
    FOR SELECT
    USING (auth.uid()::text = user_id OR auth.jwt()->>'email' = ANY (
        SELECT email FROM auth.users WHERE id::text = user_id
    ));

-- Users can insert their own applications
CREATE POLICY "Users can insert own applications"
    ON public.creator_applications
    FOR INSERT
    WITH CHECK (auth.uid()::text = user_id);

-- Users can update their own applications (only if pending)
CREATE POLICY "Users can update own pending applications"
    ON public.creator_applications
    FOR UPDATE
    USING (auth.uid()::text = user_id AND status = 'pending');

-- Admins can view all applications (check if user has admin role in profiles)
CREATE POLICY "Admins can view all applications"
    ON public.creator_applications
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.user_id = auth.uid()::text 
            AND profiles.role = 'admin'
        )
    );

-- Admins can update any application
CREATE POLICY "Admins can update all applications"
    ON public.creator_applications
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.user_id = auth.uid()::text 
            AND profiles.role = 'admin'
        )
    );

-- Admins can delete applications
CREATE POLICY "Admins can delete applications"
    ON public.creator_applications
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.user_id = auth.uid()::text 
            AND profiles.role = 'admin'
        )
    );

-- Function for admins to approve/reject applications
CREATE OR REPLACE FUNCTION public.review_creator_application(
    p_application_id UUID,
    p_status TEXT,
    p_notes TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_app_user_id TEXT;
    v_current_status TEXT;
    v_result JSONB;
BEGIN
    -- Validate status
    IF p_status NOT IN ('approved', 'rejected') THEN
        RETURN jsonb_build_object('error', 'Invalid status. Must be approved or rejected.');
    END IF;

    -- Get current application
    SELECT user_id, status INTO v_app_user_id, v_current_status
    FROM public.creator_applications
    WHERE id = p_application_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Application not found.');
    END IF;

    IF v_current_status != 'pending' THEN
        RETURN jsonb_build_object('error', 'Application already reviewed.');
    END IF;

    -- Update application
    UPDATE public.creator_applications
    SET status = p_status,
        reviewed_at = NOW(),
        reviewer_notes = p_notes
    WHERE id = p_application_id;

    -- Update profile creator_status
    UPDATE public.profiles
    SET creator_status = p_status
    WHERE user_id = v_app_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'status', p_status,
        'user_id', v_app_user_id
    );
END;
$$;

-- Add reviewed_at and reviewer_notes columns if they don't exist
ALTER TABLE public.creator_applications ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE public.creator_applications ADD COLUMN IF NOT EXISTS reviewer_notes TEXT DEFAULT '';

-- Add status check constraint if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'creator_applications_status_check'
    ) THEN
        ALTER TABLE public.creator_applications ADD CONSTRAINT creator_applications_status_check 
            CHECK (status IN ('pending', 'approved', 'rejected'));
    END IF;
END $$;
