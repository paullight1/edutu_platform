import { supabase } from '../lib/supabaseClient';
import { isProductApiUnavailableError, productApiRequest } from './productApi';

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

type ApiBookmarkRecord = Partial<BookmarkRecord> & {
  userId?: string;
  opportunityId?: string;
  opportunityTitle?: string;
  opportunityCategory?: string;
  opportunityDeadline?: string | null;
  opportunityLocation?: string;
  matchPercentage?: number;
  createdAt?: string;
  savedAt?: string;
  saved_at?: string;
  opportunity?: Partial<BookmarkOpportunity> & {
    close_date?: string | null;
    deadline?: string | null;
  };
};

function extractApiRows<T>(response: T[] | { data?: T[]; bookmarks?: T[]; items?: T[] } | null | undefined): T[] {
  if (Array.isArray(response)) return response;
  return response?.bookmarks ?? response?.items ?? response?.data ?? [];
}

function mapApiBookmark(row: ApiBookmarkRecord, fallbackUserId: string, fallbackOpportunity?: BookmarkOpportunity): BookmarkRecord {
  const opportunity = row.opportunity ?? fallbackOpportunity;
  const opportunityId = row.opportunity_id ?? row.opportunityId ?? opportunity?.id ?? fallbackOpportunity?.id ?? '';
  const opportunityCloseDate =
    opportunity && 'close_date' in opportunity
      ? opportunity.close_date
      : null;

  return {
    id: row.id ?? `${fallbackUserId}:${opportunityId}`,
    user_id: row.user_id ?? row.userId ?? fallbackUserId,
    opportunity_id: opportunityId,
    opportunity_title: row.opportunity_title ?? row.opportunityTitle ?? opportunity?.title ?? 'Opportunity',
    opportunity_category: row.opportunity_category ?? row.opportunityCategory ?? opportunity?.category ?? 'General',
    opportunity_deadline:
      row.opportunity_deadline ??
      row.opportunityDeadline ??
      opportunity?.deadline ??
      opportunityCloseDate ??
      null,
    opportunity_location: row.opportunity_location ?? row.opportunityLocation ?? opportunity?.location ?? 'Remote',
    match_percentage: row.match_percentage ?? row.matchPercentage ?? opportunity?.match_percentage ?? 0,
    created_at: row.created_at ?? row.createdAt ?? row.saved_at ?? row.savedAt ?? new Date().toISOString()
  };
}

async function tryProductApi<T>(operation: () => Promise<T>): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    if (isProductApiUnavailableError(error)) return null;
    throw error;
  }
}

export async function getBookmarks(userId: string, token?: string | null): Promise<BookmarkRecord[]> {
  if (token) {
    const apiBookmarks = await tryProductApi(async () => {
      const response = await productApiRequest<ApiBookmarkRecord[] | { data?: ApiBookmarkRecord[]; bookmarks?: ApiBookmarkRecord[]; items?: ApiBookmarkRecord[] }>(
        '/me/opportunities/bookmarks',
        token
      );
      return extractApiRows(response).map((row) => mapApiBookmark(row, userId));
    });

    if (apiBookmarks) return apiBookmarks;
  }

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
  opportunity: BookmarkOpportunity,
  token?: string | null
): Promise<BookmarkRecord | null> {
  if (token) {
    const apiBookmark = await tryProductApi(async () => {
      const response = await productApiRequest<ApiBookmarkRecord | null>(
        `/me/opportunities/${encodeURIComponent(opportunity.id)}/bookmark`,
        token,
        {
          method: 'POST',
          body: JSON.stringify({
            opportunityId: opportunity.id,
            opportunity
          })
        }
      );
      return response ? mapApiBookmark(response, userId, opportunity) : mapApiBookmark({}, userId, opportunity);
    });

    if (apiBookmark) return apiBookmark;
  }

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
  opportunityId: string,
  token?: string | null
): Promise<boolean> {
  if (token) {
    const apiRemoved = await tryProductApi(async () => {
      await productApiRequest<void>(
        `/me/opportunities/${encodeURIComponent(opportunityId)}/bookmark`,
        token,
        { method: 'DELETE' }
      );
      return true;
    });

    if (apiRemoved) return true;
  }

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
  opportunityId: string,
  token?: string | null
): Promise<boolean> {
  if (token) {
    const apiBookmarked = await tryProductApi(async () => {
      const bookmarks = await getBookmarks(userId, token);
      return bookmarks.some((bookmark) => bookmark.opportunity_id === opportunityId);
    });

    if (apiBookmarked !== null) return apiBookmarked;
  }

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
