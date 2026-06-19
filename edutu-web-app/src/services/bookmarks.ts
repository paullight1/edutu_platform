import { productApiRequest } from './productApi';

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

function hasToken(token?: string | null): token is string {
  return Boolean(token?.trim());
}

export async function getBookmarks(userId: string, token?: string | null): Promise<BookmarkRecord[]> {
  if (!hasToken(token)) {
    return [];
  }

  const response = await productApiRequest<ApiBookmarkRecord[] | { data?: ApiBookmarkRecord[]; bookmarks?: ApiBookmarkRecord[]; items?: ApiBookmarkRecord[] }>(
    '/me/opportunities/bookmarks',
    token
  );
  return extractApiRows(response).map((row) => mapApiBookmark(row, userId));
}

export async function addBookmark(
  userId: string,
  opportunity: BookmarkOpportunity,
  token?: string | null
): Promise<BookmarkRecord | null> {
  if (!hasToken(token)) {
    return null;
  }

  const response = await productApiRequest<ApiBookmarkRecord | null>(
    `/me/opportunities/${encodeURIComponent(opportunity.id)}/bookmark`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({})
    }
  );
  return response ? mapApiBookmark(response, userId, opportunity) : mapApiBookmark({}, userId, opportunity);
}

export async function removeBookmark(
  userId: string,
  opportunityId: string,
  token?: string | null
): Promise<boolean> {
  if (!hasToken(token)) {
    return false;
  }

  await productApiRequest<void>(
    `/me/opportunities/${encodeURIComponent(opportunityId)}/bookmark`,
    token,
    { method: 'DELETE' }
  );
  return true;
}

export async function isBookmarked(
  userId: string,
  opportunityId: string,
  token?: string | null
): Promise<boolean> {
  if (!hasToken(token)) {
    return false;
  }

  const response = await productApiRequest<{ saved?: boolean } | null>(
    `/me/opportunities/${encodeURIComponent(opportunityId)}/bookmark`,
    token
  );
  return Boolean(response?.saved);
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
