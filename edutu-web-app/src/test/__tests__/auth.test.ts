import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  authService,
  consumePostAuthRedirect,
  getProfileFromUser,
  rememberPostAuthRedirect,
  resolvePostAuthRedirectPath,
} from '../../lib/auth';

vi.mock('../../lib/supabaseClient', () => ({
  setClerkTokenGetter: vi.fn(),
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
    })),
  },
}));

describe('authService Clerk bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.Clerk = undefined;
    window.sessionStorage.clear();
  });

  it('returns null when Clerk has no current user', async () => {
    await expect(authService.getCurrentUser()).resolves.toBeNull();
  });

  it('maps the current Clerk user into the app user shape', async () => {
    window.Clerk = {
      user: {
        id: 'user_123',
        fullName: 'Test User',
        primaryEmailAddress: { emailAddress: 'test@example.com' },
        unsafeMetadata: { age: 25, course_of_study: 'Computer Science' },
      },
    };

    await expect(authService.getCurrentUser()).resolves.toEqual({
      id: 'user_123',
      name: 'Test User',
      email: 'test@example.com',
      age: 25,
      courseOfStudy: 'Computer Science',
    });
  });

  it('updates Clerk profile metadata without touching Supabase Auth', async () => {
    const update = vi.fn().mockResolvedValue({});
    window.Clerk = {
      user: {
        id: 'user_123',
        fullName: 'Test User',
        unsafeMetadata: { existing: true },
        update,
      },
    };

    await authService.updateUserProfile({
      full_name: 'Ada Lovelace',
      age: 28,
      course_of_study: 'Mathematics',
    });

    expect(update).toHaveBeenCalledWith({
      firstName: 'Ada',
      lastName: 'Lovelace',
      unsafeMetadata: {
        existing: true,
        full_name: 'Ada Lovelace',
        age: 28,
        course_of_study: 'Mathematics',
      },
    });
  });

  it('signs out through Clerk', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    window.Clerk = { signOut };

    await authService.signOut();

    expect(signOut).toHaveBeenCalled();
  });
});

describe('getProfileFromUser', () => {
  it('returns null for null user', () => {
    expect(getProfileFromUser(null)).toBeNull();
  });

  it('extracts profile from user metadata', () => {
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      user_metadata: {
        full_name: 'Test User',
        age: 25,
      },
    };

    expect(getProfileFromUser(mockUser as any)).toEqual({
      id: 'user-123',
      name: 'Test User',
      email: 'test@example.com',
      age: 25,
    });
  });

  it('uses email prefix when name is missing', () => {
    const profile = getProfileFromUser({
      id: 'user-123',
      email: 'john.doe@example.com',
      user_metadata: {},
    } as any);

    expect(profile?.name).toBe('john.doe');
  });
});

describe('post auth redirects', () => {
  it('maps public share pages to the authenticated opportunity route', () => {
    expect(
      resolvePostAuthRedirectPath({
        pathname: '/share/opportunity/opp-123',
        search: '?ref=whatsapp',
      }),
    ).toBe('/app/opportunity/opp-123');
  });

  it('remembers and consumes a mapped redirect target', () => {
    expect(
      rememberPostAuthRedirect({
        pathname: '/share/opportunity/opp-123',
        search: '?ref=whatsapp',
      }),
    ).toBe('/app/opportunity/opp-123');

    expect(window.sessionStorage.getItem('edutu_post_auth_from')).toBe('/app/opportunity/opp-123');
    expect(consumePostAuthRedirect()).toBe('/app/opportunity/opp-123');
    expect(window.sessionStorage.getItem('edutu_post_auth_from')).toBeNull();
  });

  it('clears stale redirect state when no source is provided', () => {
    window.sessionStorage.setItem('edutu_post_auth_from', '/app/home');

    expect(rememberPostAuthRedirect(null)).toBeNull();
    expect(window.sessionStorage.getItem('edutu_post_auth_from')).toBeNull();
  });
});
