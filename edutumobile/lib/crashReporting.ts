import * as Sentry from '@sentry/react-native';

/**
 * Crash + error reporting.
 *
 * Scope: JavaScript only — uncaught JS exceptions, unhandled promise
 * rejections, and React render errors funnelled in from `ErrorBoundary`. Native
 * (ObjC / Java) crashes are NOT captured, because this project commits its own
 * `android/` and `ios/` directories, so EAS skips `prebuild` and the Sentry
 * config plugin never runs. Wiring native capture means regenerating the native
 * projects — and those directories carry hand-edits (widget receivers, the
 * release-only manifest, status-bar Info.plist keys) that a regeneration would
 * drop. Until that is done deliberately, Play Vitals and Xcode Organizer remain
 * the source of truth for native crashes.
 *
 * Fully opt-in: with no `EXPO_PUBLIC_SENTRY_DSN` every function here is a
 * no-op, so local dev and any build without the secret behave exactly as
 * before. Set the DSN as an EAS environment variable to turn it on.
 */
const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN || '';

let initialized = false;

export function isCrashReportingEnabled(): boolean {
  return initialized;
}

export function initCrashReporting(): void {
  if (initialized || !DSN) return;

  try {
    Sentry.init({
      dsn: DSN,
      // Dev builds are noisy and already surface errors in the console; only
      // ship reports from real builds.
      enabled: !__DEV__,
      // Errors only. Performance tracing is a separate (and much larger) event
      // volume, and nothing here reads it yet.
      tracesSampleRate: 0,
      // Breadcrumbs shouldn't carry PII: the app handles CVs, profile data and
      // chat transcripts, and none of that belongs in an error report.
      sendDefaultPii: false,
      environment: __DEV__ ? 'development' : 'production',
    });
    initialized = true;
  } catch {
    // A build whose native side predates this dependency (an existing dev
    // client, say) can fail to link the module. Reporting must never be the
    // reason the app won't start.
    initialized = false;
  }
}

/** Report a caught error. No-op when reporting is off. */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  if (!initialized) return;

  try {
    Sentry.withScope((scope) => {
      if (context) scope.setContext('edutu', context);
      scope.setLevel('error');
      Sentry.captureException(error);
    });
  } catch {
    // Never let reporting throw into the caller — it is usually already
    // handling a failure.
  }
}

/** Tie reports to a user so a single account's crashes can be traced. */
export function setCrashReportingUser(userId: string | null): void {
  if (!initialized) return;

  try {
    Sentry.setUser(userId ? { id: userId } : null);
  } catch {
    // As above.
  }
}
