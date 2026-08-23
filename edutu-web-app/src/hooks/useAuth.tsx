import { useEffect, useState, useCallback } from 'react';
import { useAuth as useClerkAuth, useUser } from '@clerk/clerk-react';
import type { User } from '../types';
import { setClerkTokenGetter } from '../lib/supabaseClient';
import { fetchCurrentProfile } from '../services/profile';
import {
  hydrateSession,
  isSessionExpired,
  readSession,
  type SessionData,
} from '../lib/session';

interface UseAuthReturn {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  signOut: () => Promise<void>;
  updateUser: (user: User) => void;
}

/**
 * Auth hook powered by Clerk.
 * Provides user profile from Clerk metadata + Supabase profiles table.
 */
export function useAuth(): UseAuthReturn {
  const { isLoaded, isSignedIn, signOut: clerkSignOut, getToken } = useClerkAuth();
  const { user: clerkUser } = useUser();
  const [user, setUser] = useState<User | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // Bridge Clerk JWT to Supabase PostgREST and Realtime. Supabase's websocket
  // transport does not use the custom HTTP fetch wrapper, so it also consumes
  // the client-level accessToken callback installed by supabaseClient.ts.
  useEffect(() => {
    if (!isLoaded) return;
    setClerkTokenGetter(async () => {
      const supabaseToken = await getToken({ template: 'supabase' }).catch(
        () => null,
      );
      return supabaseToken || await getToken().catch(() => null);
    });
  }, [isLoaded, getToken]);

  // Map Clerk user to app User type and fetch extended profile
  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn || !clerkUser) {
      setUser(null);
      return;
    }

    const normalizedEmail = clerkUser.primaryEmailAddress?.emailAddress || '';
    const session = readSession();
    const canUseSession = Boolean(
      session &&
        !isSessionExpired(session) &&
        session.user.id === clerkUser.id &&
        (!normalizedEmail || session.user.email === normalizedEmail),
    );
    const sessionUser = canUseSession ? session!.user : null;

    // Start with Clerk data (fast, immediate)
    const baseUser: User = {
      id: clerkUser.id,
      email: normalizedEmail,
      full_name:
        clerkUser.fullName ||
        [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') ||
        sessionUser?.full_name ||
        '',
      profile_image: clerkUser.imageUrl || sessionUser?.profile_image,
      created_at:
        clerkUser.createdAt?.toISOString() ||
        sessionUser?.created_at ||
        new Date().toISOString(),
      country: (clerkUser.publicMetadata?.country as string) || sessionUser?.country,
      education_level:
        (clerkUser.publicMetadata?.educationLevel as string) ||
        sessionUser?.education_level,
      academic_field:
        (clerkUser.publicMetadata?.academicField as string) ||
        sessionUser?.academic_field,
      career_interests:
        (clerkUser.publicMetadata?.careerInterests as string[]) ||
        sessionUser?.career_interests,
      preferred_opportunity_types:
        (clerkUser.publicMetadata?.preferredOpportunityTypes as string[]) ||
        sessionUser?.preferred_opportunity_types,
      preferred_locations:
        (clerkUser.publicMetadata?.preferredLocations as string[]) ||
        sessionUser?.preferred_locations,
      onboarding_completed:
        clerkUser.publicMetadata?.onboardingCompleted !== undefined
          ? (clerkUser.publicMetadata.onboardingCompleted as boolean)
          : sessionUser?.onboarding_completed || false,
    };

    setUser(baseUser);

    // Then enrich from Supabase profile (non-blocking)
    setProfileLoading(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    getToken()
      .then((token) => {
        if (!token) return null;
        return fetchCurrentProfile(token, { signal: controller.signal });
      })
      .then((profile) => {
        if (!profile) return;
        setUser((current) =>
          current
            ? {
                ...current,
                full_name: profile.full_name || current.full_name,
                profile_image: profile.avatar_url || current.profile_image,
                country: profile.country || current.country,
                education_level: profile.education_level || current.education_level,
                academic_field: profile.academic_field || current.academic_field,
                career_interests:
                  profile.interests?.length > 0
                    ? profile.interests
                    : current.career_interests,
                preferred_opportunity_types:
                  profile.opportunity_types?.length > 0
                    ? profile.opportunity_types
                    : current.preferred_opportunity_types,
                preferred_locations:
                  profile.preferred_locations?.length > 0
                    ? profile.preferred_locations
                    : current.preferred_locations,
                onboarding_completed:
                  profile.onboarding_completed ?? current.onboarding_completed,
              }
            : current,
        );
      })
      .catch(() => {
        // Base Clerk data is sufficient; profile fetch can fail silently
      })
      .finally(() => {
        clearTimeout(timeout);
        setProfileLoading(false);
      });

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [isLoaded, isSignedIn, clerkUser, getToken]);

  const signOut = useCallback(async () => {
    try {
      await clerkSignOut();
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  }, [clerkSignOut]);

  const updateUser = useCallback(
    (updatedUser: User) => {
      setUser(updatedUser);

      const session = readSession();
      if (session) {
        const nextSession: SessionData = {
          ...session,
          user: updatedUser,
        };
        hydrateSession(nextSession);
      }
    },
    [],
  );

  return {
    user,
    loading: !isLoaded || profileLoading,
    isAuthenticated: isSignedIn ?? false,
    signOut,
    updateUser,
  };
}
