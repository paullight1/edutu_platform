-- Add creator_status column to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS creator_status TEXT DEFAULT 'none' CHECK (creator_status IN ('none', 'pending', 'approved', 'rejected'));

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_creator_status ON public.profiles(creator_status);

-- Update existing creator_applications trigger to set creator_status
CREATE OR REPLACE FUNCTION public.handle_creator_application()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.profiles 
    SET creator_status = 'pending'
    WHERE user_id = NEW.user_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if exists and recreate
DROP TRIGGER IF EXISTS trg_creator_application_insert ON public.creator_applications;
CREATE TRIGGER trg_creator_application_insert
    AFTER INSERT ON public.creator_applications
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_creator_application();
