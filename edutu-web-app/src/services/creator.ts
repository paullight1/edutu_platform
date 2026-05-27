import { supabase } from '../lib/supabaseClient';
import { authService } from '../lib/auth';

export interface CreatorApplicationData {
  full_name: string;
  email: string;
  motivation: string;
  opportunity_type: string;
  opportunity_name: string;
  linkedin_url: string;
  portfolio_url: string;
  bio: string;
  kyc_image_url: string;
  social_links: Record<string, string>;
}

export interface CreatorApplication {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  motivation: string;
  opportunity_type: string;
  opportunity_name: string;
  linkedin_url: string;
  portfolio_url: string;
  bio: string;
  kyc_image_url: string;
  social_links: Record<string, string>;
  status: 'pending' | 'approved' | 'rejected';
  reviewer_notes: string | null;
  applied_at: string;
  reviewed_at: string | null;
}

export async function submitCreatorApplication(
  userId: string,
  application: CreatorApplicationData,
): Promise<CreatorApplication> {
  const { data, error } = await supabase
    .from('creator_applications')
    .insert([
      {
        user_id: userId,
        full_name: application.full_name,
        email: application.email,
        motivation: application.motivation,
        opportunity_type: application.opportunity_type,
        opportunity_name: application.opportunity_name,
        linkedin_url: application.linkedin_url,
        portfolio_url: application.portfolio_url,
        bio: application.bio,
        kyc_image_url: application.kyc_image_url,
        social_links: application.social_links,
        status: 'pending',
        applied_at: new Date().toISOString(),
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return data as CreatorApplication;
}

export async function getCreatorApplication(
  userId: string,
): Promise<CreatorApplication | null> {
  const { data, error } = await supabase
    .from('creator_applications')
    .select('*')
    .eq('user_id', userId)
    .order('applied_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as CreatorApplication | null;
}

export async function getCreatorStatus(
  userId: string,
): Promise<string> {
  const profile = await authService.getProfile(userId);
  return (profile?.creator_status as string) || 'none';
}

export async function updateCreatorStatus(
  userId: string,
  status: 'pending' | 'approved' | 'rejected',
  reviewerNotes?: string,
): Promise<void> {
  await authService.updateProfile(userId, {
    creator_status: status,
    ...(reviewerNotes ? { reviewer_notes: reviewerNotes } : {}),
  });

  await supabase
    .from('creator_applications')
    .update({
      status,
      reviewer_notes: reviewerNotes || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('user_id', userId);
}
