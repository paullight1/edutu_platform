import { requestProductApi, type GetAuthToken } from './productApi';

// Mirrors backend src/saved-searches — a persisted Discover filter that the
// server matches against newly ingested/approved opportunities to fire alerts.
export interface SavedSearch {
  id: string;
  userId: string;
  name: string;
  query: string | null;
  category: string | null;
  fundingType: string | null;
  targetRegion: string | null;
  remoteOnly: boolean | null;
  notifyEnabled: boolean;
  matchCount: number;
  lastMatchedAt: string | null;
  lastNotifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SavedSearchCriteria {
  name: string;
  query?: string;
  category?: string;
  fundingType?: string;
  targetRegion?: string;
  remoteOnly?: boolean;
  notifyEnabled?: boolean;
}

export interface SavedSearchMatchPreview {
  id: string;
  title: string;
  summary: string | null;
  organization: string | null;
  category: string | null;
  canonicalCategory: string | null;
  deadline: string | null;
  imageUrl: string | null;
  createdAt: string | null;
}

export async function fetchSavedSearches(
  getAuthToken: GetAuthToken,
): Promise<SavedSearch[]> {
  const result = await requestProductApi<SavedSearch[]>(
    '/saved-searches',
    { method: 'GET' },
    getAuthToken,
  );
  return Array.isArray(result) ? result : [];
}

export async function createSavedSearch(
  criteria: SavedSearchCriteria,
  getAuthToken: GetAuthToken,
): Promise<SavedSearch | null> {
  return requestProductApi<SavedSearch>(
    '/saved-searches',
    { method: 'POST', body: JSON.stringify(criteria) },
    getAuthToken,
  );
}

export async function updateSavedSearch(
  id: string,
  patch: Partial<SavedSearchCriteria>,
  getAuthToken: GetAuthToken,
): Promise<SavedSearch | null> {
  return requestProductApi<SavedSearch>(
    `/saved-searches/${id}`,
    { method: 'PATCH', body: JSON.stringify(patch) },
    getAuthToken,
  );
}

export async function deleteSavedSearch(
  id: string,
  getAuthToken: GetAuthToken,
): Promise<boolean> {
  const result = await requestProductApi<{ success?: boolean }>(
    `/saved-searches/${id}`,
    { method: 'DELETE' },
    getAuthToken,
  );
  return Boolean(result?.success);
}

export async function fetchSavedSearchMatches(
  id: string,
  getAuthToken: GetAuthToken,
): Promise<{ search: SavedSearch; matches: SavedSearchMatchPreview[] } | null> {
  return requestProductApi<{ search: SavedSearch; matches: SavedSearchMatchPreview[] }>(
    `/saved-searches/${id}/matches`,
    { method: 'GET' },
    getAuthToken,
  );
}
