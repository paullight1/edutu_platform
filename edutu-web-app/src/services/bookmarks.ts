import { supabase } from '../lib/supabaseClient';

export interface BookmarkOpportunity {
  id: string;
  title: string;
  category: string;
  deadline?: string | null;
  location: string;
  match_percentage?: number;
}

export interface BookmarkRecord {
  id: string;
  user_id: string;
  opportunity_id: string;
  opportunity_title: string;
  opportunity_category: string;
  opportunity_deadline: string | null;
  opportunity_location: string;
  match_percentage: number;
  created_at: string;
}

export async function getBookmarks(userId: string): Promise<BookmarkRecord[]> {
  const { data, error } = await supabase
    .from('opportunity_bookmarks')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching bookmarks:', error);
    return [];
  }

  return data || [];
}

export async function addBookmark(
  userId: string,
  opportunity: BookmarkOpportunity
): Promise<BookmarkRecord | null> {
  const { data, error } = await supabase
    .from('opportunity_bookmarks')
    .insert({
      user_id: userId,
      opportunity_id: opportunity.id,
      opportunity_title: opportunity.title,
      opportunity_category: opportunity.category,
      opportunity_deadline: opportunity.deadline || null,
      opportunity_location: opportunity.location,
      match_percentage: opportunity.match_percentage || 0
    })
    .select()
    .single();

  if (error) {
    console.error('Error adding bookmark:', error);
    return null;
  }

  return data;
}

export async function removeBookmark(
  userId: string,
  opportunityId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('opportunity_bookmarks')
    .delete()
    .eq('user_id', userId)
    .eq('opportunity_id', opportunityId);

  if (error) {
    console.error('Error removing bookmark:', error);
    return false;
  }

  return true;
}

export async function isBookmarked(
  userId: string,
  opportunityId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('opportunity_bookmarks')
    .select('id')
    .eq('user_id', userId)
    .eq('opportunity_id', opportunityId)
    .maybeSingle();

  if (error) {
    console.error('Error checking bookmark:', error);
    return false;
  }

  return !!data;
}

export function filterBookmarks(
  bookmarks: BookmarkRecord[],
  filter: 'all' | 'urgent' | 'upcoming'
): BookmarkRecord[] {
  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  switch (filter) {
    case 'urgent':
      return bookmarks.filter((b) => {
        if (!b.opportunity_deadline) return false;
        const deadline = new Date(b.opportunity_deadline);
        return deadline <= sevenDaysFromNow;
      });
    case 'upcoming':
      return bookmarks.filter((b) => {
        if (!b.opportunity_deadline) return false;
        const deadline = new Date(b.opportunity_deadline);
        return deadline > sevenDaysFromNow;
      });
    default:
      return bookmarks;
  }
}
