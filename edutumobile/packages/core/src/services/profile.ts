import { GetAuthToken, requestProductApi } from './productApi';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Shape returned by the backend `GET /profile` endpoint. It is the profile row
 * (camelCased drizzle columns) plus a `completeness` summary. Only the fields
 * the edit screen consumes are typed explicitly; the rest are passed through.
 */
export interface BackendProfile {
  userId?: string;
  fullName?: string | null;
  email?: string | null;
  country?: string | null;
  school?: string | null;
  major?: string | null;
  degree?: string | null;
  cgpa?: number | string | null;
  gradYear?: number | null;
  dateOfBirth?: string | null;
  interests?: string[] | null;
  skills?: string[] | null;
  [key: string]: unknown;
}

const profileNameCache = new Map<string, string>();

/** Return the profile name saved during this app session, if available. */
export function getCachedProfileName(userId: string): string | null {
  return profileNameCache.get(userId) ?? null;
}

/** Keep profile-dependent headers in sync immediately after an edit. */
export function cacheProfileName(
  userId: string,
  fullName: string | null | undefined,
): void {
  const normalized = fullName?.trim();
  if (normalized) profileNameCache.set(userId, normalized);
  else profileNameCache.delete(userId);
}

export function isPlaceholderProfileName(value: string | null | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return !normalized || normalized === 'edutu' || normalized === 'edutu user' || normalized === 'edutu test';
}

/**
 * Accepted by the backend `PATCH /profile` endpoint (UpdateProfileSchema).
 * Empty strings are rejected server-side (fields are `min(1).nullable()`), so
 * callers must send `null` for cleared values — see `toNullable` in edit.tsx.
 * NOTE: `bio` is intentionally absent — the backend profile contract does not
 * support it.
 */
export interface ProfileUpdateInput {
  fullName?: string | null;
  email?: string | null;
  country?: string | null;
  school?: string | null;
  courseOfStudy?: string | null;
  major?: string | null;
  degree?: string | null;
  cgpa?: number | null;
  gradYear?: number | null;
  dateOfBirth?: string | null;
  interests?: string[] | null;
  skills?: string[] | null;
  age?: number | null;
  interestedCountries?: string[] | null;
  /** IANA name like 'Africa/Lagos' — drives local-time quiet hours for alerts. */
  timezone?: string | null;
}

export interface HomeCategoryLayoutSnapshot {
  tiles: Array<{ id: string; size: 'icon' | 'card' | 'long' }>;
  updatedAt: string | null;
}

/**
 * Load the signed-in user's profile via the backend product API. The backend
 * keys profiles by `toDatabaseUserId(clerkId)` under service_role, so this is
 * the only path that returns the canonical row (a direct Supabase read is
 * blocked by RLS unless the Clerk token is accepted as a third-party JWT).
 * Returns null when unauthenticated or the request fails.
 */
export async function fetchProfile(
  getAuthToken: GetAuthToken,
): Promise<BackendProfile | null> {
  return requestProductApi<BackendProfile>('/profile', { method: 'GET' }, getAuthToken);
}

/**
 * Persist profile edits via the backend product API. Returns the updated
 * profile on success, or null on failure (network error, 4xx/5xx, or missing
 * auth) — callers should treat null as a failed save.
 */
export async function updateProfile(
  getAuthToken: GetAuthToken,
  updates: ProfileUpdateInput,
): Promise<BackendProfile | null> {
  return requestProductApi<BackendProfile>(
    '/profile',
    { method: 'PATCH', body: JSON.stringify(updates) },
    getAuthToken,
  );
}

/**
 * Read the profile row used by the mobile edit flow. The mobile client writes
 * profiles under the raw Clerk subject, while older rows may still use the
 * deterministic UUID representation, so prefer the raw row when both exist.
 */
export async function fetchSupabaseProfile(
  client: SupabaseClient,
  userIds: string[],
): Promise<BackendProfile | null> {
  const lookupIds = Array.from(new Set(userIds.filter(Boolean)));
  if (lookupIds.length === 0) return null;

  const { data, error } = await client
    .from('profiles')
    .select('user_id, full_name, email, country, school, major, degree, cgpa, grad_year, date_of_birth, interests, skills')
    .in('user_id', lookupIds);

  if (error || !data?.length) return null;

  const row = (data as Array<Record<string, unknown>>).find(
    (candidate) => candidate.user_id === lookupIds[0],
  ) ?? (data as Array<Record<string, unknown>>)[0];
  const fullName = typeof row.full_name === 'string' ? row.full_name : null;
  cacheProfileName(lookupIds[0], fullName);

  return {
    userId: typeof row.user_id === 'string' ? row.user_id : undefined,
    fullName,
    email: typeof row.email === 'string' ? row.email : null,
    country: typeof row.country === 'string' ? row.country : null,
    school: typeof row.school === 'string' ? row.school : null,
    major: typeof row.major === 'string' ? row.major : null,
    degree: typeof row.degree === 'string' ? row.degree : null,
    cgpa: typeof row.cgpa === 'number' || typeof row.cgpa === 'string' ? row.cgpa : null,
    gradYear: typeof row.grad_year === 'number' ? row.grad_year : null,
    dateOfBirth: typeof row.date_of_birth === 'string' ? row.date_of_birth : null,
    interests: Array.isArray(row.interests) ? row.interests.filter((value): value is string => typeof value === 'string') : null,
    skills: Array.isArray(row.skills) ? row.skills.filter((value): value is string => typeof value === 'string') : null,
  };
}

export async function fetchHomeCategoryLayout(
  getAuthToken: GetAuthToken,
): Promise<HomeCategoryLayoutSnapshot | null> {
  return requestProductApi<HomeCategoryLayoutSnapshot>(
    '/profile/preferences/home-categories',
    { method: 'GET' },
    getAuthToken,
  );
}

export async function updateHomeCategoryLayout(
  getAuthToken: GetAuthToken,
  snapshot: { tiles: HomeCategoryLayoutSnapshot['tiles']; updatedAt: string },
): Promise<HomeCategoryLayoutSnapshot | null> {
  return requestProductApi<HomeCategoryLayoutSnapshot>(
    '/profile/preferences/home-categories',
    { method: 'PATCH', body: JSON.stringify(snapshot) },
    getAuthToken,
  );
}
