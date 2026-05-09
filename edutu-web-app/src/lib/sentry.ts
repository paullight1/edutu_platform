/**
 * Sentry Error Tracking Configuration
 * 
 * This module sets up Sentry for error tracking and performance monitoring.
 * 
 * IMPORTANT: Set your Sentry DSN in the environment variable VITE_SENTRY_DSN
 * Get your DSN from: https://sentry.io -> Project Settings -> Client Keys
 */

// Note: @sentry/react needs to be installed
// npm install @sentry/react

let Sentry: any = null;

// Lazy load Sentry to avoid errors if not installed
const loadSentry = async () => {
    try {
        Sentry = await import('@sentry/react');
        return true;
    } catch (e) {
        console.warn('Sentry not installed. Error tracking disabled.');
        return false;
    }
};

interface SentryConfig {
    dsn?: string;
    environment?: string;
    release?: string;
    tracesSampleRate?: number;
    replaysSessionSampleRate?: number;
    replaysOnErrorSampleRate?: number;
}

/**
 * Initialize Sentry error tracking
 * 
 * Call this function early in your app initialization (e.g., in main.tsx)
 */
export async function initSentry(config?: SentryConfig): Promise<boolean> {
    const dsn = config?.dsn || import.meta.env.VITE_SENTRY_DSN;

    if (!dsn) {
        console.info('Sentry DSN not configured. Error tracking disabled.');
        return false;
    }

    const loaded = await loadSentry();
    if (!loaded || !Sentry) return false;

    try {
        Sentry.init({
            dsn,
            environment: config?.environment || import.meta.env.MODE || 'development',
            release: config?.release || import.meta.env.VITE_APP_VERSION || '0.0.0',

            // Performance Monitoring
            tracesSampleRate: config?.tracesSampleRate ?? (import.meta.env.PROD ? 0.1 : 1.0),

            // Session Replay (optional, uncomment if using)
            // replaysSessionSampleRate: config?.replaysSessionSampleRate ?? 0.1,
            // replaysOnErrorSampleRate: config?.replaysOnErrorSampleRate ?? 1.0,

            // Integrations
            integrations: [
                Sentry.browserTracingIntegration(),
                Sentry.replayIntegration({
                    maskAllText: false,
                    blockAllMedia: false,
                }),
            ],

            // Filter out common non-actionable errors
            beforeSend(event: any, hint: any) {
                const error = hint?.originalException;

                // Ignore certain errors
                if (error instanceof Error) {
                    // Ignore ResizeObserver errors (common, non-critical)
                    if (error.message.includes('ResizeObserver')) {
                        return null;
                    }

                    // Ignore chunk load failures (usually due to deployments)
                    if (error.message.includes('Loading chunk')) {
                        return null;
                    }

                    // Ignore network errors in development
                    if (!import.meta.env.PROD && error.message.includes('NetworkError')) {
                        return null;
                    }
                }

                return event;
            },
        });

        console.info('Sentry initialized successfully');
        return true;
    } catch (error) {
        console.error('Failed to initialize Sentry:', error);
        return false;
    }
}

/**
 * Capture an exception with optional context
 */
export function captureException(
    error: Error | unknown,
    context?: Record<string, any>
): void {
    if (!Sentry) {
        console.error('Sentry not initialized. Error:', error);
        return;
    }

    if (context) {
        Sentry.withScope((scope: any) => {
            Object.entries(context).forEach(([key, value]) => {
                scope.setExtra(key, value);
            });
            Sentry.captureException(error);
        });
    } else {
        Sentry.captureException(error);
    }
}

/**
 * Capture a message with optional level and context
 */
export function captureMessage(
    message: string,
    level: 'fatal' | 'error' | 'warning' | 'info' | 'debug' = 'info',
    context?: Record<string, any>
): void {
    if (!Sentry) {
        console.log(`[${level}] ${message}`, context);
        return;
    }

    if (context) {
        Sentry.withScope((scope: any) => {
            Object.entries(context).forEach(([key, value]) => {
                scope.setExtra(key, value);
            });
            Sentry.captureMessage(message, level);
        });
    } else {
        Sentry.captureMessage(message, level);
    }
}

/**
 * Set user information for error context
 */
export function setUser(user: {
    id?: string;
    email?: string;
    username?: string;
} | null): void {
    if (!Sentry) return;
    Sentry.setUser(user);
}

/**
 * Add a breadcrumb for debugging context
 */
export function addBreadcrumb(
    message: string,
    category: string = 'app',
    level: 'fatal' | 'error' | 'warning' | 'info' | 'debug' = 'info',
    data?: Record<string, any>
): void {
    if (!Sentry) return;

    Sentry.addBreadcrumb({
        message,
        category,
        level,
        data,
        timestamp: Date.now() / 1000,
    });
}

/**
 * Set a tag for filtering in Sentry
 */
export function setTag(key: string, value: string): void {
    if (!Sentry) return;
    Sentry.setTag(key, value);
}

/**
 * Create a transaction for performance monitoring
 */
export function startTransaction(
    name: string,
    op: string = 'task'
): { finish: () => void } | null {
    if (!Sentry) return null;

    const transaction = Sentry.startTransaction({
        name,
        op,
    });

    return {
        finish: () => transaction.finish(),
    };
}

/**
 * Get Sentry ErrorBoundary component (if available)
 */
export function getSentryErrorBoundary(): React.ComponentType<any> | null {
    if (!Sentry) return null;
    return Sentry.ErrorBoundary;
}

// Re-export for convenience
export { Sentry };
