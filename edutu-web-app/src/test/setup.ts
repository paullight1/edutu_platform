import '@testing-library/jest-dom';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Cleanup after each test
afterEach(() => {
    cleanup();
});

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    })),
});

// Mock IntersectionObserver
class MockIntersectionObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
}

Object.defineProperty(window, 'IntersectionObserver', {
    writable: true,
    value: MockIntersectionObserver,
});

// Mock ResizeObserver
class MockResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
}

Object.defineProperty(window, 'ResizeObserver', {
    writable: true,
    value: MockResizeObserver,
});

// Mock scrollTo
Object.defineProperty(window, 'scrollTo', {
    writable: true,
    value: vi.fn(),
});

// Mock URL.createObjectURL
Object.defineProperty(URL, 'createObjectURL', {
    writable: true,
    value: vi.fn(() => 'mock-url'),
});

Object.defineProperty(URL, 'revokeObjectURL', {
    writable: true,
    value: vi.fn(),
});

// Mock import.meta.env
vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');
vi.stubEnv('MODE', 'test');

// Console mocking to reduce test output noise
const originalError = console.error;
const originalWarn = console.warn;

beforeAll(() => {
    console.error = (...args: unknown[]) => {
        // Filter out specific React warnings in tests
        if (
            typeof args[0] === 'string' &&
            (args[0].includes('Warning: ReactDOM.render') ||
                args[0].includes('Warning: An update to') ||
                args[0].includes('Warning: Failed prop type'))
        ) {
            return;
        }
        originalError.call(console, ...args);
    };

    console.warn = (...args: unknown[]) => {
        // Filter out warnings we want to ignore
        if (
            typeof args[0] === 'string' &&
            args[0].includes('React Router Future Flag Warning')
        ) {
            return;
        }
        originalWarn.call(console, ...args);
    };
});

afterAll(() => {
    console.error = originalError;
    console.warn = originalWarn;
});
