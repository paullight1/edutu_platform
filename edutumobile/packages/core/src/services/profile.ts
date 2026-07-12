import { GetAuthToken, requestProductApi } from './productApi';

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
