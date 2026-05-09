import { useState, useCallback } from 'react';

export interface ErrorState {
    message: string;
    code?: string;
    details?: string;
}

/**
 * Standardized error handler for Supabase and API errors
 */
export function handleError(error: any): ErrorState {
    // Supabase errors
    if (error?.code) {
        switch (error.code) {
            case 'PGRST116':
                return { message: 'Record not found', code: error.code };
            case '23505':
                return { message: 'This record already exists', code: error.code };
            case '23503':
                return { message: 'Related record not found', code: error.code };
            case '42501':
                return { message: 'Permission denied', code: error.code };
            case '42P01':
                return { message: 'Database table not found', code: error.code };
            default:
                return { 
                    message: error.message || 'Database error occurred', 
                    code: error.code,
                    details: error.details
                };
        }
    }

    // Network errors
    if (error?.name === 'TypeError' && error?.message?.includes('fetch')) {
        return { message: 'Network error. Please check your connection.', code: 'NETWORK_ERROR' };
    }

    // Timeout errors
    if (error?.name === 'AbortError') {
        return { message: 'Request timed out. Please try again.', code: 'TIMEOUT' };
    }

    // Generic errors
    return {
        message: error?.message || 'An unexpected error occurred',
        code: error?.code || 'UNKNOWN_ERROR',
        details: error?.stack
    };
}

/**
 * Hook for managing async operations with error handling
 */
export function useAsyncAction<T extends (...args: any[]) => Promise<any>>(
    action: T,
    options?: {
        onSuccess?: (result: Awaited<ReturnType<T>>) => void;
        onError?: (error: ErrorState) => void;
        successMessage?: string;
        errorMessage?: string;
    }
) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<ErrorState | null>(null);
    const [success, setSuccess] = useState(false);

    const execute = useCallback(async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>> | null> => {
        setLoading(true);
        setError(null);
        setSuccess(false);

        try {
            const result = await action(...args);
            setSuccess(true);
            
            if (options?.successMessage) {
                // Could integrate with toast system here
                console.log(options.successMessage);
            }
            
            options?.onSuccess?.(result);
            return result;
        } catch (err: any) {
            const errorState = handleError(err);
            setError(errorState);
            
            if (options?.errorMessage) {
                console.error(options.errorMessage, errorState);
            }
            
            options?.onError?.(errorState);
            return null;
        } finally {
            setLoading(false);
        }
    }, [action, options]);

    const reset = useCallback(() => {
        setLoading(false);
        setError(null);
        setSuccess(false);
    }, []);

    return {
        execute,
        loading,
        error,
        success,
        reset
    };
}

/**
 * Error boundary fallback component
 */
export function ErrorFallback({ 
    error, 
    resetError 
}: { 
    error: ErrorState; 
    resetError: () => void;
}) {
    return (
        <div style={{
            padding: '40px',
            textAlign: 'center',
            background: 'var(--bg-secondary)',
            borderRadius: '16px',
            border: '1px solid var(--border-light)'
        }}>
            <h2 style={{ color: 'var(--danger)', marginBottom: '16px' }}>
                Something went wrong
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
                {error.message}
            </p>
            {error.code && (
                <p style={{ 
                    fontSize: '12px', 
                    color: 'var(--text-tertiary)',
                    marginBottom: '24px'
                }}>
                    Error code: {error.code}
                </p>
            )}
            <button 
                onClick={resetError}
                className="btn btn-primary"
            >
                Try Again
            </button>
        </div>
    );
}

/**
 * Safe async wrapper that catches all errors
 */
export async function safeAsync<T>(
    fn: () => Promise<T>,
    fallback?: T
): Promise<{ data: T | null; error: ErrorState | null }> {
    try {
        const data = await fn();
        return { data, error: null };
    } catch (err: any) {
        return { data: fallback || null, error: handleError(err) };
    }
}

/**
 * Retry wrapper for flaky operations
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    options: {
        maxRetries?: number;
        delay?: number;
        backoff?: number;
    } = {}
): Promise<T> {
    const { maxRetries = 3, delay = 1000, backoff = 2 } = options;
    let lastError: any;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            
            if (attempt < maxRetries - 1) {
                const waitTime = delay * Math.pow(backoff, attempt);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
    }

    throw lastError;
}

/**
 * Validate required fields in an object
 */
export function validateRequired<T extends Record<string, any>>(
    data: T,
    requiredFields: (keyof T)[]
): { valid: boolean; missing: string[] } {
    const missing = requiredFields.filter(field => {
        const value = data[field];
        return value === undefined || value === null || value === '';
    });

    return {
        valid: missing.length === 0,
        missing: missing as string[]
    };
}
