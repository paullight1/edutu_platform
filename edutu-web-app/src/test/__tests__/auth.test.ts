import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authService, getProfileFromUser } from '../../lib/auth';

// Mock Supabase client
vi.mock('../../lib/supabaseClient', () => ({
    supabase: {
        auth: {
            getSession: vi.fn(),
            getUser: vi.fn(),
            signInWithOAuth: vi.fn(),
            signOut: vi.fn(),
            onAuthStateChange: vi.fn(),
            updateUser: vi.fn(),
            setSession: vi.fn(),
            exchangeCodeForSession: vi.fn(),
        },
        from: vi.fn(() => ({
            select: vi.fn().mockReturnThis(),
            insert: vi.fn().mockReturnThis(),
            update: vi.fn().mockReturnThis(),
            upsert: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn(),
        })),
    },
}));

// Mock Capacitor
vi.mock('@capacitor/core', () => ({
    Capacitor: {
        isNativePlatform: vi.fn().mockReturnValue(false),
    },
}));

describe('Auth Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('signInWithGoogle', () => {
        it('should initiate Google OAuth flow', async () => {
            const { supabase } = await import('../../lib/supabaseClient');

            vi.mocked(supabase.auth.signInWithOAuth).mockResolvedValue({
                data: { provider: 'google', url: 'https://google.com/auth' },
                error: null,
            });

            const result = await authService.signInWithGoogle();

            expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
                provider: 'google',
                options: expect.objectContaining({
                    queryParams: {
                        access_type: 'offline',
                        prompt: 'consent',
                    },
                }),
            });

            expect(result).toEqual({
                provider: 'google',
                url: 'https://google.com/auth',
            });
        });

        it('should throw error on OAuth failure', async () => {
            const { supabase } = await import('../../lib/supabaseClient');

            vi.mocked(supabase.auth.signInWithOAuth).mockResolvedValue({
                data: { provider: 'google', url: null },
                error: new Error('OAuth failed'),
            });

            await expect(authService.signInWithGoogle()).rejects.toThrow('OAuth failed');
        });
    });

    describe('signOut', () => {
        it('should sign out successfully', async () => {
            const { supabase } = await import('../../lib/supabaseClient');

            vi.mocked(supabase.auth.signOut).mockResolvedValue({ error: null });

            await expect(authService.signOut()).resolves.not.toThrow();
            expect(supabase.auth.signOut).toHaveBeenCalled();
        });
    });

    describe('getSession', () => {
        it('should return current session', async () => {
            const { supabase } = await import('../../lib/supabaseClient');

            const mockSession = {
                access_token: 'test-token',
                user: { id: 'user-123', email: 'test@example.com' },
            };

            vi.mocked(supabase.auth.getSession).mockResolvedValue({
                data: { session: mockSession },
                error: null,
            });

            const session = await authService.getSession();
            expect(session).toEqual(mockSession);
        });
    });
});

describe('getProfileFromUser', () => {
    it('should return null for null user', () => {
        expect(getProfileFromUser(null)).toBeNull();
    });

    it('should extract profile from user metadata', () => {
        const mockUser = {
            id: 'user-123',
            email: 'test@example.com',
            user_metadata: {
                full_name: 'Test User',
                age: 25,
            },
            created_at: '2024-01-01',
        };

        const profile = getProfileFromUser(mockUser as any);

        expect(profile).toEqual({
            id: 'user-123',
            name: 'Test User',
            email: 'test@example.com',
            age: 25,
        });
    });

    it('should use email prefix when name is missing', () => {
        const mockUser = {
            id: 'user-123',
            email: 'john.doe@example.com',
            user_metadata: {},
            created_at: '2024-01-01',
        };

        const profile = getProfileFromUser(mockUser as any);

        expect(profile?.name).toBe('john.doe');
    });

    it('should use default name when email and name are missing', () => {
        const mockUser = {
            id: 'user-123',
            email: undefined,
            user_metadata: {},
            created_at: '2024-01-01',
        };

        const profile = getProfileFromUser(mockUser as any);

        expect(profile?.name).toBe('New Edutu member');
    });
});
