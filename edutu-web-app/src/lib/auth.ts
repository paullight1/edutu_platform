import { supabase } from './supabaseClient';
import type { AppUser } from '../types/user';
import type { OnboardingState } from '../types/onboarding';

export interface ProfilePreferences {
  onboarding?: OnboardingState;
  [key: string]: unknown;
}

export interface Profile {
  user_id: string;
  full_name?: string;
  name?: string;
  age?: number;
  email?: string;
  bio?: string;
  avatar_url?: string;
  preferences?: ProfilePreferences;
  last_seen_at?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export const authService = {
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
    const { data, error } = await supabase
      .from('profiles')
      .upsert([{ ...profile }], { onConflict: 'user_id' })
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
