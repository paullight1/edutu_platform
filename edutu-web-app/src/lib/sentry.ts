/**
 * Sentry Error Tracking Configuration
 *
 * Error tracking is enabled only in production builds when a DSN is provided
 * via the VITE_SENTRY_DSN environment variable. In every other case these
 * helpers degrade to silent no-ops so callers never need to feature-detect.
 */

import * as Sentry from '@sentry/react';

interface SentryConfig {
  dsn?: string;
  environment?: string;
  release?: string;
  tracesSampleRate?: number;
}

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const SENTRY_RELEASE = import.meta.env.VITE_APP_VERSION as string | undefined;

let initialized = false;

/**
 * Initialize Sentry error tracking.
 *
 * Safe to call unconditionally and at any time: it only initializes when both
 * running in production and a DSN is configured, otherwise it no-ops silently.
 */
export function initSentry(config?: SentryConfig): boolean {
  const dsn = config?.dsn ?? SENTRY_DSN;

  if (!import.meta.env.PROD || !dsn) {
    if (import.meta.env.DEV) {
      console.info('[sentry] disabled — dev mode or missing DSN');
    }
    return false;
  }

  if (initialized) return true;

  try {
    Sentry.init({
      dsn,
      environment: config?.environment ?? import.meta.env.MODE ?? 'production',
      ...(SENTRY_RELEASE ? { release: config?.release ?? SENTRY_RELEASE } : {}),
      tracesSampleRate: config?.tracesSampleRate ?? 0.1,
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration({
          maskAllText: false,
          blockAllMedia: false,
        }),
      ],
      beforeSend(event, hint) {
        const error = hint?.originalException;
        if (error instanceof Error) {
          if (error.message.includes('ResizeObserver')) return null;
          if (error.message.includes('Loading chunk')) return null;
          if (error.message.includes('Failed to fetch')) return null;
        }
        return event;
      },
    });

    initialized = true;
    if (import.meta.env.DEV) {
      console.info('[sentry] initialized');
    }
    return true;
  } catch (error) {
    console.error('[sentry] failed to initialize:', error);
    return false;
  }
}

/**
 * Capture an exception with optional extra context.
 */
export function captureException(
  error: Error | unknown,
  context?: Record<string, unknown>,
): void {
  if (!initialized) return;

  if (context) {
    Sentry.withScope((scope) => {
      for (const [key, value] of Object.entries(context)) {
        scope.setExtra(key, value);
      }
      Sentry.captureException(error);
    });
  } else {
    Sentry.captureException(error);
  }
}

/**
 * Capture a message with optional level and context.
 */
export function captureMessage(
  message: string,
  level: 'fatal' | 'error' | 'warning' | 'info' | 'debug' = 'info',
  context?: Record<string, unknown>,
): void {
  if (!initialized) return;

  if (context) {
    Sentry.withScope((scope) => {
      for (const [key, value] of Object.entries(context)) {
        scope.setExtra(key, value);
      }
      Sentry.captureMessage(message, level);
    });
  } else {
    Sentry.captureMessage(message, level);
  }
}

/**
 * Set user information for error context.
 */
export function setUser(
  user: { id?: string; email?: string; username?: string } | null,
): void {
  if (!initialized) return;
  Sentry.setUser(user);
}

/**
 * Add a breadcrumb for debugging context.
 */
export function addBreadcrumb(
  message: string,
  category = 'app',
  level: 'fatal' | 'error' | 'warning' | 'info' | 'debug' = 'info',
  data?: Record<string, unknown>,
): void {
  if (!initialized) return;
  Sentry.addBreadcrumb({ message, category, level, data });
}

/**
 * Set a tag for filtering in Sentry.
 */
export function setTag(key: string, value: string): void {
  if (!initialized) return;
  Sentry.setTag(key, value);
}

/**
 * Get the Sentry ErrorBoundary component (when initialized).
 */
export function getSentryErrorBoundary(): typeof Sentry.ErrorBoundary | null {
  if (!initialized) return null;
  return Sentry.ErrorBoundary;
}

export { Sentry };
