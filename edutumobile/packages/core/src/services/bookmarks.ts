import { SupabaseClient } from '@supabase/supabase-js';
import { GetAuthToken, requestProductApi } from './productApi';
import { toSafeUUID } from '../utils/auth';

export interface SavedOpportunity {
  id: string;
  opportunity_id: string;
  user_id: string;
  created_at: string;
  title?: string;
  organization?: string;
  deadline?: string;
  category?: string;
  location?: string;
  image?: string;
  match_score?: number;
}

function getUserLookupIds(userId: string): string[] {
  return Array.from(new Set([userId, toSafeUUID(userId)]));
}

function getApiRows(payload: any): any[] | null {
  if (!payload) return null;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.bookmarks)) return payload.bookmarks;
  if (Array.isArray(payload.savedOpportunities)) return payload.savedOpportunities;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.data)) return payload.data;
  return null;
}

function normaliseApiBookmark(row: any): SavedOpportunity {
  // Only the nested row is a real opportunity. Never fall back to `row` itself:
  // a bookmark row has no title/organization, so doing so yields silent
  // `undefined`s that render as "Opportunity"/"Unknown" placeholders instead of
  // signalling that hydration failed. Leaving these undefined lets
  // hydrateMissingDetails() below repair them from Supabase.
  const opportunity = row.opportunity || row.opportunities || null;
  const opportunityId =
    row.opportunityId || row.opportunity_id || opportunity?.id;

  return {
    id: row.bookmarkId || row.bookmark_id || row.id || opportunityId,
    opportunity_id: opportunityId,
    user_id: row.userId || row.user_id || '',
    created_at: row.createdAt || row.created_at || new Date().toISOString(),
    title: opportunity?.title,
    organization: opportunity?.organization,
    deadline: opportunity?.deadline || opportunity?.close_date,
    category: opportunity?.category,
    location: opportunity?.location,
    image:
      opportunity?.imageUrl || opportunity?.image_url || opportunity?.image,
    match_score:
      opportunity?.matchScore ??
      opportunity?.match_score ??
      opportunity?.quality_score,
  };
}

/**
 * Fill in details for bookmarks the API returned without a hydrated
 * opportunity. The API stays the source of truth for *which* opportunities are
 * saved; this only repairs missing display fields. Uses select('*') so a
 * missing/renamed column can never error the whole query.
 */
async function hydrateMissingDetails(
  supabase: SupabaseClient,
  bookmarks: SavedOpportunity[],
): Promise<SavedOpportunity[]> {
  const missingIds = bookmarks
    .filter((bookmark) => !bookmark.title)
    .map((bookmark) => bookmark.opportunity_id)
    .filter(Boolean);

  if (missingIds.length === 0) return bookmarks;

  const { data } = await supabase
    .from('opportunities')
    .select('*')
    .in('id', missingIds);

  if (!data?.length) return bookmarks;

  const byId = new Map(data.map((opp: any) => [opp.id, opp]));

  return bookmarks.map((bookmark) => {
    if (bookmark.title) return bookmark;
    const opp = byId.get(bookmark.opportunity_id);
    if (!opp) return bookmark;

    return {
      ...bookmark,
      title: opp.title,
      organization: opp.organization,
      deadline: opp.deadline || opp.close_date,
      category: opp.category,
      location: opp.location,
      image: opp.image_url || opp.image,
      match_score: opp.match_score ?? opp.quality_score,
    };
  });
}

async function fetchSavedOpportunitiesFromApi(
  getAuthToken?: GetAuthToken,
): Promise<SavedOpportunity[] | null> {
  const payload = await requestProductApi<any>('/me/opportunities/bookmarks', undefined, getAuthToken);
  const rows = getApiRows(payload);
  if (!rows) return payload ? [] : null;

  return rows.map(normaliseApiBookmark).filter((bookmark) => bookmark.opportunity_id);
}

export async function fetchSavedOpportunities(
  supabase: SupabaseClient,
  userId: string,
  getAuthToken?: GetAuthToken,
): Promise<SavedOpportunity[]> {
  const apiBookmarks = await fetchSavedOpportunitiesFromApi(getAuthToken);
  if (apiBookmarks) {
    // Don't blindly trust the API's hydration — if it returned bookmarks with
    // no opportunity details, repair them locally rather than rendering a
    // screen full of "Opportunity"/"Unknown" placeholders.
    return hydrateMissingDetails(supabase, apiBookmarks);
  }

  const lookupIds = getUserLookupIds(userId);

  const { data: bookmarks, error } = await supabase
    .from('bookmarks')
    .select('id, opportunity_id, user_id, created_at')
    .in('user_id', lookupIds)
    .order('created_at', { ascending: false });

  if (error || !bookmarks || bookmarks.length === 0) {
    return [];
  }

  const uniqueBookmarks = Array.from(
    new Map(bookmarks.map(bookmark => [bookmark.opportunity_id, bookmark])).values()
  );
  const oppIds = uniqueBookmarks.map(b => b.opportunity_id);

  // Hydrate opportunity details. Use select('*') so a missing column never
  // errors the whole query, and never drop the bookmarks if hydration fails —
  // show them with whatever data we have rather than an empty screen.
  const { data: opportunities } = await supabase
    .from('opportunities')
    .select('*')
    .in('id', oppIds);

  const opportunityList = opportunities ?? [];

  return uniqueBookmarks.map(bookmark => {
    const opp = opportunityList.find(o => o.id === bookmark.opportunity_id);
    return {
      id: bookmark.id,
      opportunity_id: bookmark.opportunity_id,
      user_id: bookmark.user_id,
      created_at: bookmark.created_at,
      title: opp?.title,
      organization: opp?.organization,
      deadline: opp?.deadline || opp?.close_date,
      category: opp?.category,
      location: opp?.location,
      image: opp?.image_url || opp?.image,
      match_score: opp?.match_score ?? opp?.quality_score,
    };
  });
}

export async function isOpportunitySaved(
  supabase: SupabaseClient,
  userId: string,
  opportunityId: string,
  getAuthToken?: GetAuthToken,
): Promise<boolean> {
  const apiBookmarks = await fetchSavedOpportunitiesFromApi(getAuthToken);
  if (apiBookmarks) {
    return apiBookmarks.some(bookmark => bookmark.opportunity_id === opportunityId);
  }

  const lookupIds = getUserLookupIds(userId);

  const { data, error } = await supabase
    .from('bookmarks')
    .select('id')
    .in('user_id', lookupIds)
    .eq('opportunity_id', opportunityId)
    .limit(1);

  return !!data?.length && !error;
}

export async function saveOpportunity(
  supabase: SupabaseClient,
  userId: string,
  opportunityId: string,
  getAuthToken?: GetAuthToken,
): Promise<boolean> {
  const apiResult = await requestProductApi<any>(
    `/me/opportunities/${encodeURIComponent(opportunityId)}/bookmark`,
    { method: 'POST' },
    getAuthToken,
  );
  if (apiResult !== null) {
    return true;
  }

  await supabase
    .from('bookmarks')
    .delete()
    .in('user_id', getUserLookupIds(userId))
    .eq('opportunity_id', opportunityId);

  const { error } = await supabase
    .from('bookmarks')
    .insert({ user_id: userId, opportunity_id: opportunityId });

  return !error;
}

export async function unsaveOpportunity(
  supabase: SupabaseClient,
  userId: string,
  opportunityId: string,
  getAuthToken?: GetAuthToken,
): Promise<boolean> {
  const apiResult = await requestProductApi<any>(
    `/me/opportunities/${encodeURIComponent(opportunityId)}/bookmark`,
    { method: 'DELETE' },
    getAuthToken,
  );
  if (apiResult !== null) {
    return true;
  }

  const { error } = await supabase
    .from('bookmarks')
    .delete()
    .in('user_id', getUserLookupIds(userId))
    .eq('opportunity_id', opportunityId);

  return !error;
}

export async function toggleSavedOpportunity(
  supabase: SupabaseClient,
  userId: string,
  opportunityId: string,
  getAuthToken?: GetAuthToken,
): Promise<{ saved: boolean; error: string | null }> {
  const isSaved = await isOpportunitySaved(supabase, userId, opportunityId, getAuthToken);

  if (isSaved) {
    const success = await unsaveOpportunity(supabase, userId, opportunityId, getAuthToken);
    return { saved: false, error: success ? null : 'Failed to unsave' };
  } else {
    const success = await saveOpportunity(supabase, userId, opportunityId, getAuthToken);
    return { saved: true, error: success ? null : 'Failed to save' };
  }
}

export async function getSavedCount(
  supabase: SupabaseClient,
  userId: string,
  getAuthToken?: GetAuthToken,
): Promise<number> {
  const apiBookmarks = await fetchSavedOpportunitiesFromApi(getAuthToken);
  if (apiBookmarks) {
    return new Set(apiBookmarks.map(row => row.opportunity_id)).size;
  }

  const { data, error } = await supabase
    .from('bookmarks')
    .select('opportunity_id')
    .in('user_id', getUserLookupIds(userId));

  return error ? 0 : new Set(data?.map(row => row.opportunity_id) || []).size;
}
