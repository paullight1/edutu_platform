/**
 * API Retry Utility
 * 
 * Provides retry logic for failed API requests with exponential backoff.
 */

interface RetryOptions {
    maxAttempts?: number;
    baseDelay?: number;
    maxDelay?: number;
    shouldRetry?: (error: unknown, attempt: number) => boolean;
    onRetry?: (error: unknown, attempt: number) => void;
}

const defaultOptions: Required<RetryOptions> = {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    shouldRetry: (error: unknown) => {
        // Retry on network errors and 5xx server errors
        if (error instanceof Error) {
            if (error.message.includes('network') || error.message.includes('fetch')) {
                return true;
            }
        }
        if (typeof error === 'object' && error !== null && 'status' in error) {
            const status = (error as { status: number }).status;
            return status >= 500 && status < 600;
        }
        return true; // Default to retry
    },
    onRetry: () => { }
};

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(attempt: number, baseDelay: number, maxDelay: number): number {
    const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 0.3 * exponentialDelay; // Add up to 30% jitter
    return Math.min(exponentialDelay + jitter, maxDelay);
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 * 
 * @param fn - The async function to retry
 * @param options - Retry configuration options
 * @returns The result of the function
 * @throws The last error if all retries fail
 * 
 * @example
 * const data = await retry(
 *   () => fetchUserData(userId),
 *   { maxAttempts: 3, baseDelay: 1000 }
 * );
 */
export async function retry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
): Promise<T> {
    const opts = { ...defaultOptions, ...options };
    let lastError: unknown;

    for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            if (attempt === opts.maxAttempts) {
                throw error;
            }

            if (!opts.shouldRetry(error, attempt)) {
                throw error;
            }

            opts.onRetry(error, attempt);
            const delay = calculateDelay(attempt, opts.baseDelay, opts.maxDelay);
            await sleep(delay);
        }
    }

    throw lastError;
}

/**
 * Create a retriable version of a function
 * 
 * @example
 * const retryableFetch = withRetry(fetchUserData, { maxAttempts: 3 });
 * const data = await retryableFetch(userId);
 */
export function withRetry<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => Promise<TResult>,
    options: RetryOptions = {}
): (...args: TArgs) => Promise<TResult> {
    return (...args: TArgs) => retry(() => fn(...args), options);
}

/**
 * Retry configuration presets for common use cases
 */
export const retryPresets = {
    /** Quick retry for fast operations */
    quick: {
        maxAttempts: 2,
        baseDelay: 500,
        maxDelay: 2000
    },

    /** Standard retry for most API calls */
    standard: {
        maxAttempts: 3,
        baseDelay: 1000,
        maxDelay: 10000
    },

    /** Aggressive retry for critical operations */
    aggressive: {
        maxAttempts: 5,
        baseDelay: 1000,
        maxDelay: 30000
    },

    /** No retry - just attempt once */
    none: {
        maxAttempts: 1,
        baseDelay: 0,
        maxDelay: 0
    }
} as const;

/**
 * Check if an error is a network error
 */
export function isNetworkError(error: unknown): boolean {
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
        return true;
    }
    if (error instanceof Error && error.message.includes('network')) {
        return true;
    }
    return false;
}

/**
 * Check if an error is a timeout error
 */
export function isTimeoutError(error: unknown): boolean {
    if (error instanceof Error) {
        return error.name === 'AbortError' || error.message.includes('timeout');
    }
    return false;
}

/**
 * Create a fetch request with timeout
 */
export async function fetchWithTimeout(
    input: RequestInfo | URL,
    init?: RequestInit & { timeout?: number }
): Promise<Response> {
    const { timeout = 30000, ...fetchInit } = init || {};

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(input, {
            ...fetchInit,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}

/**
 * Fetch with retry and timeout
 */
export async function fetchWithRetry(
    input: RequestInfo | URL,
    init?: RequestInit & { timeout?: number; retryOptions?: RetryOptions }
): Promise<Response> {
    const { retryOptions, ...fetchInit } = init || {};

    return retry(
        () => fetchWithTimeout(input, fetchInit),
        retryOptions || retryPresets.standard
    );
}

export default retry;
