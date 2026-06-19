import { authService, type Profile } from '../lib/auth';
import type { OnboardingProfileData, OnboardingState } from '../types/onboarding';
import { productApiRequest } from './productApi';

export interface BackendProfileCompleteness {
  percent: number;
  completed: number;
  total: number;
  missing: Array<{ key: string; label: string }>;
}

export type BackendProfile = Profile & {
  userId?: string;
  fullName?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  completeness?: BackendProfileCompleteness;
};

export interface ProfileUpdateInput {
  fullName?: string | null;
  email?: string | null;
  country?: string | null;
  skills?: string[] | null;
}

function buildOnboardingState(data: OnboardingProfileData): OnboardingState {
  return {
    completed: true,
    completedAt: new Date().toISOString(),
    data,
  };
}

export function hasCompletedOnboarding(profile: Profile | null | undefined): boolean {
  const onboarding = profile?.preferences?.onboarding as OnboardingState | undefined;
  return Boolean(onboarding?.completed);
}

export async function saveOnboardingProfile(userId: string, data: OnboardingProfileData): Promise<OnboardingState> {
  const onboardingState = buildOnboardingState(data);
  const sanitizedName = data.fullName.trim();
  const sanitizedCourse = data.courseOfStudy.trim();

  await authService.updateUserProfile({
    name: sanitizedName,
    full_name: sanitizedName,
    ...(typeof data.age === 'number' && Number.isFinite(data.age) ? { age: data.age } : {}),
    ...(sanitizedCourse ? { course_of_study: sanitizedCourse } : {}),
  });

  const existingProfile = await authService.getProfile(userId);
  const preferences = {
    ...(existingProfile?.preferences ?? {}),
    onboarding: onboardingState,
  };

  const timestamp = new Date().toISOString();

  if (existingProfile) {
    const updates: Partial<Profile> = {
      name: sanitizedName,
      full_name: sanitizedName,
      preferences,
      updated_at: timestamp,
    };

    if (typeof data.age === 'number' && Number.isFinite(data.age)) {
      updates.age = data.age;
    }

    await authService.updateProfile(userId, updates);
    return onboardingState;
  }

  const profileToCreate: Profile = {
    user_id: userId,
    name: sanitizedName,
    full_name: sanitizedName,
    preferences,
    created_at: timestamp,
    updated_at: timestamp,
  };

  if (typeof data.age === 'number' && Number.isFinite(data.age)) {
    profileToCreate.age = data.age;
  }

  await authService.upsertProfile(profileToCreate);
  return onboardingState;
}

export async function fetchUserProfile(userId: string): Promise<Profile | null> {
  return authService.getProfile(userId);
}

export async function fetchBackendProfile(token: string): Promise<BackendProfile> {
  return productApiRequest<BackendProfile>('/profile', token);
}

export async function updateBackendProfile(
  token: string,
  updates: ProfileUpdateInput,
): Promise<BackendProfile> {
  return productApiRequest<BackendProfile>('/profile', token, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export function extractOnboardingState(profile: Profile | null | undefined): OnboardingState | null {
  const onboarding = profile?.preferences?.onboarding as OnboardingState | undefined;
  return onboarding ?? null;
}

