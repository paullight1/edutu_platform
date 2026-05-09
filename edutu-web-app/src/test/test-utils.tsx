import React, { ReactElement, ReactNode } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from '../hooks/useTheme';
import { AuthProvider } from '../hooks/useAuth';
import { ToastProvider } from '../components/ui/ToastProvider';

/**
 * Custom render function that wraps components with necessary providers
 */
interface WrapperProps {
    children: ReactNode;
}

const AllTheProviders = ({ children }: WrapperProps) => {
    return (
        <BrowserRouter>
            <ThemeProvider>
                <ToastProvider>
                    <AuthProvider initialUser={null}>
                        {children}
                    </AuthProvider>
                </ToastProvider>
            </ThemeProvider>
        </BrowserRouter>
    );
};

const customRender = (
    ui: ReactElement,
    options?: Omit<RenderOptions, 'wrapper'>
) => render(ui, { wrapper: AllTheProviders, ...options });

// Re-export everything from testing-library
export * from '@testing-library/react';
export { customRender as render };

/**
 * Helper to create mock user
 */
export const createMockUser = (overrides = {}) => ({
    id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User',
    ...overrides,
});

/**
 * Helper to create mock session
 */
export const createMockSession = (overrides = {}) => ({
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    expires_at: Date.now() + 3600000,
    user: createMockUser(),
    ...overrides,
});

/**
 * Wait for async operations to complete
 */
export const waitForAsync = (ms = 0) =>
    new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Mock Supabase client for testing
 */
export const createMockSupabaseClient = () => ({
    auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
        signInWithOAuth: vi.fn().mockResolvedValue({ data: {}, error: null }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
        onAuthStateChange: vi.fn().mockReturnValue({
            data: { subscription: { unsubscribe: vi.fn() } },
        }),
    },
    from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
});

// Import vi from vitest for mocking
import { vi } from 'vitest';
