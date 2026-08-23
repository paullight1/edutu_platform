type ClerkEnvironment = Record<string, string | undefined>;

export function resolveConfiguredClerkIssuer(
  env: ClerkEnvironment = process.env,
): string | null {
  const explicit = env.CLERK_ISSUER_URL?.trim();
  if (explicit) {
    try {
      const url = new URL(explicit);
      if (url.protocol !== "https:") return null;
      return url.origin;
    } catch {
      return null;
    }
  }

  const publishableKey =
    env.CLERK_PUBLISHABLE_KEY ||
    env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
    env.VITE_CLERK_PUBLISHABLE_KEY ||
    env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const match = publishableKey?.match(/^pk_(?:test|live)_(.+)$/);
  if (!match) return null;

  try {
    const decoded = Buffer.from(match[1], "base64").toString("utf8");
    const host = decoded.replace(/\$+$/, "").trim();
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) return null;
    return `https://${host}`;
  } catch {
    return null;
  }
}

export function assertProductionClerkIssuerLock(
  env: ClerkEnvironment = process.env,
): void {
  const issuer = resolveConfiguredClerkIssuer(env);
  if (!issuer) {
    throw new Error(
      "Production Clerk verification requires CLERK_ISSUER_URL or a valid Clerk publishable key so tokens are pinned to one issuer.",
    );
  }

  const publishableKey =
    env.CLERK_PUBLISHABLE_KEY ||
    env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
    env.VITE_CLERK_PUBLISHABLE_KEY ||
    env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (
    publishableKey?.startsWith("pk_test_") &&
    env.CLERK_ALLOW_TEST_INSTANCE !== "true"
  ) {
    throw new Error(
      "Production must not trust a Clerk test instance. Configure a live issuer/key, or set CLERK_ALLOW_TEST_INSTANCE=true only for an explicitly isolated non-production environment.",
    );
  }
}
