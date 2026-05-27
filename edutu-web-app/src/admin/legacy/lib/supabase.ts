import { supabase as appSupabase } from '../../../lib/supabaseClient';

type ClerkSessionPayload = {
  data: {
    session: {
      access_token: string;
      user: {
        id: string;
        email?: string;
        user_metadata?: Record<string, unknown>;
      } | null;
    } | null;
  };
  error: null;
};

function getClerkUser() {
  const clerkUser = window.Clerk?.user;
  if (!clerkUser) return null;
  const clerkUserWithImage = clerkUser as typeof clerkUser & { imageUrl?: string };

  return {
    id: clerkUser.id,
    email: clerkUser.primaryEmailAddress?.emailAddress ?? undefined,
    user_metadata: {
      full_name: clerkUser.fullName ?? clerkUser.username ?? undefined,
      avatar_url: clerkUserWithImage.imageUrl,
    },
  };
}

async function getClerkToken() {
  try {
    const clerk = window.Clerk as typeof window.Clerk & {
      session?: { getToken?: () => Promise<string | null> };
    };
    return await clerk?.session?.getToken?.();
  } catch {
    return null;
  }
}

const legacyAuth = {
  async getSession(): Promise<ClerkSessionPayload> {
    const token = await getClerkToken();
    const user = getClerkUser();

    return {
      data: {
        session: token
          ? {
              access_token: token,
              user,
            }
          : null,
      },
      error: null,
    };
  },
  async getUser() {
    return {
      data: {
        user: getClerkUser(),
      },
      error: null,
    };
  },
  onAuthStateChange(callback: (event: string, session: ClerkSessionPayload['data']['session']) => void) {
    void this.getSession().then(({ data }) => callback('SIGNED_IN', data.session));

    return {
      data: {
        subscription: {
          unsubscribe: () => {},
        },
      },
    };
  },
  async signOut() {
    await window.Clerk?.signOut?.();
    return { error: null };
  },
};

export const supabase = new Proxy(appSupabase, {
  get(target, prop, receiver) {
    if (prop === 'auth') return legacyAuth;
    return Reflect.get(target, prop, receiver);
  },
}) as typeof appSupabase & { auth: typeof legacyAuth };
