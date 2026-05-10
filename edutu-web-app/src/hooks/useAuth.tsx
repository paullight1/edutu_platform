import { useState, useEffect, useContext, createContext, useCallback } from 'react';
import { useAuth as useClerkAuth, useUser, useSignIn, useSignUp, useClerk } from '@clerk/clerk-react';
import type { AppUser } from '../types/user';
import { setClerkTokenGetter } from '../lib/supabaseClient';

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, firstName: string, lastName: string) => Promise<void>;
  signOut: () => Promise<void>;
  setUser: React.Dispatch<React.SetStateAction<AppUser | null>>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isLoaded, isSignedIn, getToken } = useClerkAuth();
  const { user: clerkUser } = useUser();
  const { signIn: clerkSignIn, isLoaded: isSignInLoaded } = useSignIn();
  const { signUp: clerkSignUp, isLoaded: isSignUpLoaded } = useSignUp();
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Bridge Clerk JWT → Supabase RLS
  useEffect(() => {
    if (!isLoaded) return;
    setClerkTokenGetter(async () => {
      try {
        return await getToken();
      } catch {
        return null;
      }
    });
  }, [isLoaded, getToken]);

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn && clerkUser) {
      const email = clerkUser.primaryEmailAddress?.emailAddress;
      const fullName = clerkUser.fullName || clerkUser.username || (email ? email.split('@')[0] : 'New Edutu member');
      const metadata = clerkUser.unsafeMetadata as Record<string, unknown> | undefined;
      const rawAge = metadata?.age;
      const parsedAge =
        typeof rawAge === 'number' && Number.isFinite(rawAge)
          ? rawAge
          : typeof rawAge === 'string' && rawAge.trim()
            ? Number.parseInt(rawAge, 10)
            : null;

      setUser({
        id: clerkUser.id,
        name: fullName,
        email: email ?? undefined,
        ...(Number.isFinite(parsedAge) && parsedAge !== null ? { age: parsedAge as number } : {}),
      });
    } else {
      setUser(null);
    }
    setLoading(false);
  }, [isLoaded, isSignedIn, clerkUser]);

  const signInWithGoogle = useCallback(async () => {
    if (!clerkSignIn) throw new Error('Clerk not ready');
    await clerkSignIn.authenticateWithRedirect({
      strategy: 'oauth_google',
      redirectUrl: '/auth/callback',
      redirectUrlComplete: '/app/home',
    });
  }, [clerkSignIn]);

  const signInWithApple = useCallback(async () => {
    if (!clerkSignIn) throw new Error('Clerk not ready');
    await clerkSignIn.authenticateWithRedirect({
      strategy: 'oauth_apple',
      redirectUrl: '/auth/callback',
      redirectUrlComplete: '/app/home',
    });
  }, [clerkSignIn]);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    if (!clerkSignIn) throw new Error('Clerk not ready');
    const result = await clerkSignIn.create({
      identifier: email,
      password,
    });
    if (result.status === 'complete') {
      // Clerk will auto-redirect
    }
  }, [clerkSignIn]);

  const signUpWithEmail = useCallback(async (email: string, password: string, firstName: string, lastName: string) => {
    if (!clerkSignUp) throw new Error('Clerk not ready');
    const result = await clerkSignUp.create({
      emailAddress: email,
      password,
      firstName,
      lastName,
    });
    if (result.status === 'missing_requirements') {
      await clerkSignUp.prepareEmailAddressVerification({ strategy: 'email_code' });
    }
  }, [clerkSignUp]);

  const signOut = useCallback(async () => {
    await window.Clerk?.signOut();
    setUser(null);
  }, []);

  const value: AuthContextType = {
    user,
    loading,
    signInWithGoogle,
    signInWithApple,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    setUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export { useClerkAuth as useClerk, useUser, useSignIn, useSignUp };
