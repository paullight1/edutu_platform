import { supabase } from './supabaseClient';
import type { AppUser } from '../types/user';
import type { OnboardingState } from '../types/onboarding';

type ClerkLikeUser = {
  id: string;
  fullName?: string | null;
  username?: string | null;
  primaryEmailAddress?: { emailAddress?: string | null } | null;
  unsafeMetadata?: Record<string, unknown>;
  update?: (params: {
    firstName?: string;
    lastName?: string;
    unsafeMetadata?: Record<string, unknown>;
  }) => Promise<unknown>;
};

type ClerkLike = {
  user?: ClerkLikeUser | null;
  signOut?: () => Promise<void>;
  signUp?: {
    attemptEmailAddressVerification: (params: { code: string }) => Promise<{ status?: string; createdUserId?: string | null }>;
    prepareEmailAddressVerification: (params: { strategy: 'email_code' }) => Promise<unknown>;
  };
};

declare global {
  interface Window {
    Clerk?: ClerkLike;
  }
}

export interface ProfilePreferences {
  onboarding?: OnboardingState;
  [key: string]: unknown;
}

export interface Profile {
  user_id: string;
  full_name?: string | null;
  name?: string | null;
  age?: number | null;
  email?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  credits?: number | null;
  is_pro?: boolean | null;
  preferences?: ProfilePreferences;
  pro_since?: string | null;
  pro_expires_at?: string | null;
  subscription_id?: string | null;
  last_seen_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
}

export type UserProfileUpdate = {
  name?: string;
  full_name?: string;
  age?: number;
  course_of_study?: string;
  [key: string]: unknown;
};

function splitFullName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const firstName = parts.shift();
  const lastName = parts.length > 0 ? parts.join(' ') : undefined;
  return { firstName, lastName };
}

function appUserFromClerkUser(user: ClerkLikeUser): AppUser {
  const email = user.primaryEmailAddress?.emailAddress ?? undefined;
  const metadata = user.unsafeMetadata ?? {};
  const rawAge = metadata.age;
  const parsedAge =
    typeof rawAge === 'number' && Number.isFinite(rawAge)
      ? rawAge
      : typeof rawAge === 'string' && rawAge.trim()
        ? Number.parseInt(rawAge, 10)
        : null;

  const courseOfStudy =
    typeof metadata.course_of_study === 'string' && metadata.course_of_study.trim()
      ? metadata.course_of_study.trim()
      : undefined;

  return {
    id: user.id,
    name: user.fullName || user.username || (email ? email.split('@')[0] : 'New Edutu member'),
    email,
    ...(Number.isFinite(parsedAge) && parsedAge !== null ? { age: parsedAge as number } : {}),
    ...(courseOfStudy ? { courseOfStudy } : {}),
  };
}

export const authService = {
  async getCurrentUser(): Promise<AppUser | null> {
    const clerkUser = window.Clerk?.user;
    return clerkUser ? appUserFromClerkUser(clerkUser) : null;
  },

  async updateUserProfile(updates: UserProfileUpdate): Promise<void> {
    const clerkUser = window.Clerk?.user;
    if (!clerkUser?.update) {
      throw new Error('Clerk user profile is not available.');
    }

    const nextMetadata = {
      ...(clerkUser.unsafeMetadata ?? {}),
      ...updates,
    };

    const displayName = updates.full_name ?? updates.name;
    const nameParts = typeof displayName === 'string' ? splitFullName(displayName) : {};

    await clerkUser.update({
      ...nameParts,
      unsafeMetadata: nextMetadata,
    });
  },

  async signOut(): Promise<void> {
    await window.Clerk?.signOut?.();
  },

  async getProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single();
    if (error) {
      if ('code' in error && error.code === 'PGRST116') return null;
      throw error;
    }
    return data as Profile | null;
  },

  async upsertProfile(profile: Profile) {
    const payload = {
      ...profile,
      updated_at: profile.updated_at ?? new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('profiles')
      .upsert([payload], { onConflict: 'user_id' })
      .select()
      .single();
    if (error) throw error;
    return data as Profile;
  },

  async updateProfile(userId: string, updates: Partial<Profile>) {
    const rest: Partial<Profile> = { ...updates };
    delete rest.user_id;
    delete rest.created_at;
    delete rest.updated_at;
    const { data, error } = await supabase
      .from('profiles')
      .update({ ...rest, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .select()
      .single();
    if (error) throw error;
    return data as Profile;
  },
};

export function getProfileFromUser(user: any): AppUser | null {
  if (!user) return null;
  const metadata = user.user_metadata ?? {};
  const resolvedName =
    (typeof metadata.full_name === 'string' && metadata.full_name.trim()) ||
    (typeof metadata.name === 'string' && metadata.name.trim()) ||
    (user.email ? user.email.split('@')[0] : null) ||
    'New Edutu member';
  const rawAge = metadata.age;
  const parsedAge =
    typeof rawAge === 'number' && Number.isFinite(rawAge)
      ? rawAge
      : typeof rawAge === 'string' && rawAge.trim()
        ? Number.parseInt(rawAge, 10)
        : null;
  const rawCourse =
    typeof metadata.course_of_study === 'string' && metadata.course_of_study.trim()
      ? metadata.course_of_study.trim()
      : undefined;
  return {
    id: user.id,
    name: resolvedName,
    email: user.email ?? undefined,
    ...(Number.isFinite(parsedAge) && parsedAge !== null ? { age: parsedAge as number } : {}),
    ...(rawCourse ? { courseOfStudy: rawCourse } : {})
  };
}

export function isNewUser(profile: Profile | null, user: any): boolean {
  if (!user || !profile) return true;
  const userCreatedAt = new Date(user.created_at).getTime();
  const profileCreatedAt = profile.created_at ? new Date(profile.created_at).getTime() : null;
  if (!profileCreatedAt) return true;
  const timeDiff = Math.abs(userCreatedAt - profileCreatedAt);
  return timeDiff < 10000;
}
