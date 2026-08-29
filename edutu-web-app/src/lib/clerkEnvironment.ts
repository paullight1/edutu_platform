export function validateLocalClerkPublishableKey(
  publishableKey: string | undefined,
  isLocalDevelopment: boolean,
): string | null {
  if (!isLocalDevelopment) return null;

  const key = publishableKey?.trim();
  if (!key) {
    return (
      "Local authentication is not configured. Set " +
      "VITE_CLERK_PUBLISHABLE_KEY to the pk_test_ key from the Clerk " +
      "development instance (prefer edutu-web-app/.env.local)."
    );
  }

  if (key.startsWith("pk_live_")) {
    return (
      "Local authentication cannot use a Clerk pk_live_ key: production " +
      "keys are restricted to edutu.org and Clerk rejects localhost. Put " +
      "the development instance's pk_test_ key in edutu-web-app/.env.local."
    );
  }

  if (!key.startsWith("pk_test_")) {
    return (
      "VITE_CLERK_PUBLISHABLE_KEY is not a valid local Clerk key. " +
      "Use the pk_test_ key from the Clerk development instance."
    );
  }

  return null;
}
