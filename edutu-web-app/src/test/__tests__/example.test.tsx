import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '../test-utils';

// Mock Supabase client
vi.mock('../../lib/supabaseClient', () => ({
    supabase: {
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
    },
}));

// Import the component to test
import ErrorBoundary from '../../components/ErrorBoundary';

describe('ErrorBoundary Component', () => {
    const ThrowError = () => {
        throw new Error('Test error');
    };

    const NormalComponent = () => <div>Normal content</div>;

    it('renders children when there is no error', () => {
        render(
            <ErrorBoundary>
                <NormalComponent />
            </ErrorBoundary>
        );

        expect(screen.getByText('Normal content')).toBeInTheDocument();
    });

    it('renders error UI when a child component throws', () => {
        // Suppress console.error for this test
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        render(
            <ErrorBoundary>
                <ThrowError />
            </ErrorBoundary>
        );

        // Check for error message or fallback UI
        expect(screen.queryByText('Normal content')).not.toBeInTheDocument();

        consoleSpy.mockRestore();
    });
});

describe('Basic Rendering', () => {
    it('should render text content', () => {
        render(<div data-testid="test">Hello World</div>);
        expect(screen.getByTestId('test')).toHaveTextContent('Hello World');
    });

    it('should handle user interactions', () => {
        const handleClick = vi.fn();
        render(<button onClick={handleClick}>Click Me</button>);

        fireEvent.click(screen.getByText('Click Me'));
        expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('should support async operations', async () => {
        const AsyncComponent = () => {
            const [show, setShow] = React.useState(false);
            React.useEffect(() => {
                setTimeout(() => setShow(true), 100);
            }, []);
            return show ? <div>Loaded</div> : <div>Loading...</div>;
        };

        render(<AsyncComponent />);

        expect(screen.getByText('Loading...')).toBeInTheDocument();

        await waitFor(() => {
            expect(screen.getByText('Loaded')).toBeInTheDocument();
        });
    });
});

// Import React for the async test
import React from 'react';
