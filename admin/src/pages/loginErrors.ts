export function getLoginErrorMessage(error: unknown): string {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string'
      ? error.message
      : String(error ?? '');
  const normalized = message.toLowerCase();

  if (/invalid login credentials|invalid email or password|email or password is incorrect/.test(normalized)) {
    return 'Invalid email or password. Check your details and try again.';
  }
  if (/email not confirmed|email address.*not verified/.test(normalized)) {
    return 'Please verify your email address before signing in.';
  }
  if (/too many requests|rate limit/.test(normalized)) {
    return 'Too many sign-in attempts. Please wait a moment and try again.';
  }
  if (/database error querying schema|network|fetch|timeout|timed out|service unavailable|\b5\d\d\b/.test(normalized)) {
    return 'Sign-in is temporarily unavailable. Please try again shortly.';
  }
  return 'We couldn’t sign you in. Check your details and try again.';
}
