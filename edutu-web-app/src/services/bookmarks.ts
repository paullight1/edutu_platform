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

type PendingBookmarkOperation =
  | { type: 'add'; opportunity: BookmarkOpportunity }
  | { type: 'remove'; opportunityId: string };

const BOOKMARK_CACHE_PREFIX = 'edutu:bookmarks:cache:';
const BOOKMARK_PENDING_PREFIX = 'edutu:bookmarks:pending:';
const BOOKMARK_CIRCUIT_PREFIX = 'edutu:bookmarks:unavailable-until:';
const BOOKMARK_RETRY_DELAY_MS = 5 * 60 * 1000;

function storageKey(prefix: string, userId: string): string {
  return `${prefix}${encodeURIComponent(userId)}`;
}

function readStoredArray<T>(storage: Storage, key: string): T[] {
  try {
    const value = JSON.parse(storage.getItem(key) ?? '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function readCachedBookmarks(userId: string): BookmarkRecord[] {
  if (typeof localStorage === 'undefined') return [];
  return readStoredArray<BookmarkRecord>(
    localStorage,
    storageKey(BOOKMARK_CACHE_PREFIX, userId),
  );
}

function writeCachedBookmarks(userId: string, bookmarks: BookmarkRecord[]): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(
    storageKey(BOOKMARK_CACHE_PREFIX, userId),
    JSON.stringify(bookmarks),
  );
}

function readPendingOperations(userId: string): PendingBookmarkOperation[] {
  if (typeof localStorage === 'undefined') return [];
  return readStoredArray<PendingBookmarkOperation>(
    localStorage,
    storageKey(BOOKMARK_PENDING_PREFIX, userId),
  );
}

function writePendingOperations(userId: string, operations: PendingBookmarkOperation[]): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(
    storageKey(BOOKMARK_PENDING_PREFIX, userId),
    JSON.stringify(operations),
  );
}

function operationOpportunityId(operation: PendingBookmarkOperation): string {
  return operation.type === 'add' ? operation.opportunity.id : operation.opportunityId;
}

function queueOperation(userId: string, operation: PendingBookmarkOperation): void {
  const opportunityId = operationOpportunityId(operation);
  const operations = readPendingOperations(userId).filter(
    (entry) => operationOpportunityId(entry) !== opportunityId,
  );
  operations.push(operation);
  writePendingOperations(userId, operations);
}

function isTemporaryBookmarkFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /exceed_storage_size_quota|project is restricted|service .* restricted|product api is (?:unavailable|unreachable)|failed to fetch|network/i.test(
    error.message,
  );
}

function markBookmarkApiUnavailable(userId: string): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(
    storageKey(BOOKMARK_CIRCUIT_PREFIX, userId),
    String(Date.now() + BOOKMARK_RETRY_DELAY_MS),
  );
}

function clearBookmarkApiUnavailable(userId: string): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(storageKey(BOOKMARK_CIRCUIT_PREFIX, userId));
}

function isBookmarkApiUnavailable(userId: string): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  const retryAt = Number(
    sessionStorage.getItem(storageKey(BOOKMARK_CIRCUIT_PREFIX, userId)) ?? 0,
  );
  return Number.isFinite(retryAt) && retryAt > Date.now();
}

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

async function flushPendingOperations(userId: string, token: string): Promise<boolean> {
  const pending = readPendingOperations(userId);
  for (let index = 0; index < pending.length; index += 1) {
    const operation = pending[index];
    try {
      if (operation.type === 'add') {
        const response = await productApiRequest<ApiBookmarkRecord | null>(
          `/me/opportunities/${encodeURIComponent(operation.opportunity.id)}/bookmark`,
          token,
          { method: 'POST', body: JSON.stringify({}) },
        );
        if (response) {
          const synced = mapApiBookmark(response, userId, operation.opportunity);
          const cache = readCachedBookmarks(userId).filter(
            (bookmark) => bookmark.opportunity_id !== synced.opportunity_id,
          );
          writeCachedBookmarks(userId, [synced, ...cache]);
        }
      } else {
        await productApiRequest<void>(
          `/me/opportunities/${encodeURIComponent(operation.opportunityId)}/bookmark`,
          token,
          { method: 'DELETE' },
        );
      }
      writePendingOperations(userId, pending.slice(index + 1));
    } catch (error) {
      if (isTemporaryBookmarkFailure(error)) {
        markBookmarkApiUnavailable(userId);
        return false;
      }
      throw error;
    }
  }
  clearBookmarkApiUnavailable(userId);
  return true;
}

export async function getBookmarks(userId: string, token?: string | null): Promise<BookmarkRecord[]> {
  const cached = readCachedBookmarks(userId);
  if (!hasToken(token) || isBookmarkApiUnavailable(userId)) return cached;

  try {
    if (!(await flushPendingOperations(userId, token))) return readCachedBookmarks(userId);
    const response = await productApiRequest<ApiBookmarkRecord[] | { data?: ApiBookmarkRecord[]; bookmarks?: ApiBookmarkRecord[]; items?: ApiBookmarkRecord[] }>(
      '/me/opportunities/bookmarks',
      token
    );
    const bookmarks = extractApiRows(response).map((row) => mapApiBookmark(row, userId));
    writeCachedBookmarks(userId, bookmarks);
    clearBookmarkApiUnavailable(userId);
    return bookmarks;
  } catch (error) {
    if (isTemporaryBookmarkFailure(error)) {
      markBookmarkApiUnavailable(userId);
      return readCachedBookmarks(userId);
    }
    throw error;
  }
}

export async function addBookmark(
  userId: string,
  opportunity: BookmarkOpportunity,
  token?: string | null
): Promise<BookmarkRecord | null> {
  const previous = readCachedBookmarks(userId);
  const localBookmark = mapApiBookmark({}, userId, opportunity);
  writeCachedBookmarks(userId, [
    localBookmark,
    ...previous.filter((bookmark) => bookmark.opportunity_id !== opportunity.id),
  ]);
  queueOperation(userId, { type: 'add', opportunity });

  if (!hasToken(token) || isBookmarkApiUnavailable(userId)) return localBookmark;

  try {
    await flushPendingOperations(userId, token);
    return readCachedBookmarks(userId).find(
      (bookmark) => bookmark.opportunity_id === opportunity.id,
    ) ?? localBookmark;
  } catch (error) {
    writeCachedBookmarks(userId, previous);
    writePendingOperations(
      userId,
      readPendingOperations(userId).filter(
        (operation) => operationOpportunityId(operation) !== opportunity.id,
      ),
    );
    throw error;
  }
}

export async function removeBookmark(
  userId: string,
  opportunityId: string,
  token?: string | null
): Promise<boolean> {
  const previous = readCachedBookmarks(userId);
  writeCachedBookmarks(
    userId,
    previous.filter((bookmark) => bookmark.opportunity_id !== opportunityId),
  );
  queueOperation(userId, { type: 'remove', opportunityId });

  if (!hasToken(token) || isBookmarkApiUnavailable(userId)) return true;

  try {
    await flushPendingOperations(userId, token);
    return true;
  } catch (error) {
    writeCachedBookmarks(userId, previous);
    writePendingOperations(
      userId,
      readPendingOperations(userId).filter(
        (operation) => operationOpportunityId(operation) !== opportunityId,
      ),
    );
    throw error;
  }
}

export async function isBookmarked(
  userId: string,
  opportunityId: string,
  token?: string | null
): Promise<boolean> {
  const cached = readCachedBookmarks(userId).some(
    (bookmark) => bookmark.opportunity_id === opportunityId,
  );
  if (!hasToken(token) || isBookmarkApiUnavailable(userId)) return cached;

  try {
    if (!(await flushPendingOperations(userId, token))) return cached;
    const response = await productApiRequest<{ saved?: boolean } | null>(
      `/me/opportunities/${encodeURIComponent(opportunityId)}/bookmark`,
      token
    );
    clearBookmarkApiUnavailable(userId);
    return Boolean(response?.saved);
  } catch (error) {
    if (isTemporaryBookmarkFailure(error)) {
      markBookmarkApiUnavailable(userId);
      return cached;
    }
    throw error;
  }
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
