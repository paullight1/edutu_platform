import { supabase } from '../lib/supabaseClient';
import type { Opportunity } from '../types/opportunity';

export type ApplicationStatus = 'draft' | 'submitted' | 'under_review' | 'accepted' | 'rejected';

export interface ApplicationRecord {
  id: string;
  user_id: string;
  opportunity_id: string;
  opportunity_title: string;
  opportunity_category: string;
  status: ApplicationStatus;
  applied_at: string;
  notes: string | null;
}

export async function getApplications(userId: string): Promise<ApplicationRecord[]> {
  const { data, error } = await supabase
    .from('opportunity_applications')
    .select('*')
    .eq('user_id', userId)
    .order('applied_at', { ascending: false });

  if (error) {
    console.error('Error fetching applications:', error);
    throw error;
  }

  return data as ApplicationRecord[];
}

export async function addApplication(
  userId: string,
  opportunity: Pick<Opportunity, 'id' | 'title' | 'category'>,
  notes?: string
): Promise<ApplicationRecord> {
  const { data, error } = await supabase
    .from('opportunity_applications')
    .insert({
      user_id: userId,
      opportunity_id: opportunity.id,
      opportunity_title: opportunity.title,
      opportunity_category: opportunity.category,
      status: 'submitted',
      notes: notes || null,
    })
    .select()
    .single();

  if (error) {
    console.error('Error adding application:', error);
    throw error;
  }

  return data as ApplicationRecord;
}

export async function updateApplicationStatus(
  id: string,
  status: ApplicationStatus
): Promise<ApplicationRecord> {
  const { data, error } = await supabase
    .from('opportunity_applications')
    .update({ status })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating application status:', error);
    throw error;
  }

  return data as ApplicationRecord;
}

export async function removeApplication(id: string): Promise<void> {
  const { error } = await supabase
    .from('opportunity_applications')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error removing application:', error);
    throw error;
  }
}
