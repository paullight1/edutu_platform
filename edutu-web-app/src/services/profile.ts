import { authService, type Profile } from "../lib/auth";
import type {
  OnboardingProfileData,
  OnboardingState,
} from "../types/onboarding";
import { productApiRequest } from "./productApi";

export interface BackendProfileCompleteness {
  percent: number;
  completed: number;
  total: number;
  missing: Array<{ key: string; label: string }>;
}

export type BackendProfile = Profile & {
  userId?: string;
  fullName?: string | null;
  school?: string | null;
  courseOfStudy?: string | null;
  major?: string | null;
  degree?: string | null;
  cgpa?: number | string | null;
  gradYear?: number | null;
  dateOfBirth?: string | null;
  interestedCountries?: string[] | null;
  interests?: string[] | null;
  skills?: string[] | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  completeness?: BackendProfileCompleteness;
};

export interface ProfileUpdateInput {
  fullName?: string | null;
  email?: string | null;
  country?: string | null;
  school?: string | null;
  courseOfStudy?: string | null;
  degree?: string | null;
  age?: number | null;
  cgpa?: number | null;
  gradYear?: number | null;
  dateOfBirth?: string | null;
  interestedCountries?: string[] | null;
  interests?: string[] | null;
  skills?: string[] | null;
}

function buildOnboardingState(data: OnboardingProfileData): OnboardingState {
  return {
    completed: true,
    completedAt: new Date().toISOString(),
    data,
  };
}

export function hasCompletedOnboarding(
  profile: Profile | null | undefined,
): boolean {
  const onboarding = profile?.preferences?.onboarding as
    | OnboardingState
    | undefined;
  return Boolean(onboarding?.completed);
}

/**
 * Persist onboarding profile details.
 *
 * All database writes go through the backend `/profile` endpoint — direct
 * Supabase writes from the browser silently matched zero rows under RLS
 * (raw Clerk id vs the derived-UUID keying) and dropped the data. Clerk
 * metadata is still mirrored so the client can read name/age/course without
 * a round trip.
 */
export async function saveOnboardingProfile(
  token: string | null,
  data: OnboardingProfileData,
): Promise<OnboardingState> {
  const onboardingState = buildOnboardingState(data);
  const sanitizedName = data.fullName.trim();
  const sanitizedCourse = data.courseOfStudy.trim();
  const age =
    typeof data.age === "number" && Number.isFinite(data.age)
      ? data.age
      : null;

  if (!token) {
    throw new Error("Onboarding save requires a backend session token.");
  }

  await updateBackendProfile(token, {
    ...(sanitizedName ? { fullName: sanitizedName } : {}),
    ...(sanitizedCourse ? { courseOfStudy: sanitizedCourse } : {}),
    ...(age !== null ? { age } : {}),
  });

  // The backend profile is the durable source of truth. Clerk metadata is a
  // convenience mirror for fast client hydration, so an unavailable Clerk
  // global must not turn a successful profile save into a failed onboarding
  // flow.
  try {
    await authService.updateUserProfile({
      name: sanitizedName,
      full_name: sanitizedName,
      ...(age !== null ? { age } : {}),
      ...(sanitizedCourse ? { course_of_study: sanitizedCourse } : {}),
    });
  } catch (error) {
    console.warn("Onboarding: could not mirror profile to Clerk", error);
  }

  return onboardingState;
}

export async function fetchUserProfile(
  userId: string,
): Promise<Profile | null> {
  return authService.getProfile(userId);
}

export async function fetchBackendProfile(
  token: string,
): Promise<BackendProfile> {
  return productApiRequest<BackendProfile>("/profile", token);
}

export async function updateBackendProfile(
  token: string,
  updates: ProfileUpdateInput,
): Promise<BackendProfile> {
  return productApiRequest<BackendProfile>("/profile", token, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

export function extractOnboardingState(
  profile: Profile | null | undefined,
): OnboardingState | null {
  const onboarding = profile?.preferences?.onboarding as
    | OnboardingState
    | undefined;
  return onboarding ?? null;
}
