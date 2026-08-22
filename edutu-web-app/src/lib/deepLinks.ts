function normalizePath(pathname: string, search = "", hash = ""): string {
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${normalized}${search}${hash}`;
}

export function safeInternalAppPath(
  candidate: unknown,
  fallback = "/dashboard",
): string {
  if (
    typeof candidate !== "string" ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//")
  ) {
    return fallback;
  }

  try {
    const base = new URL(
      typeof window === "undefined"
        ? "https://app.edutu.invalid"
        : window.location.origin,
    );
    const parsed = new URL(candidate, base);
    if (parsed.origin !== base.origin) return fallback;
    return normalizePath(parsed.pathname, parsed.search, parsed.hash);
  } catch {
    return fallback;
  }
}

export function parseEdutuDeepLink(candidate: string): string | null {
  try {
    const parsed = new URL(candidate);

    if (parsed.protocol === "ai.edutu.app:") {
      if (parsed.hostname === "auth" || parsed.pathname === "/auth") {
        return `/auth/callback${parsed.search}${parsed.hash}`;
      }
      const customPath = normalizePath(
        [parsed.hostname, parsed.pathname.replace(/^\//, "")]
          .filter(Boolean)
          .join("/"),
        parsed.search,
        parsed.hash,
      );
      return safeInternalAppPath(customPath, "/dashboard");
    }

    if (
      parsed.protocol !== "https:" &&
      !(import.meta.env.DEV && parsed.protocol === "http:")
    ) {
      return null;
    }

    const trustedHosts = new Set([
      "edutu.org",
      "www.edutu.org",
      "app.edutu.org",
      typeof window === "undefined" ? "" : window.location.hostname,
    ]);
    if (!trustedHosts.has(parsed.hostname)) return null;

    return safeInternalAppPath(
      normalizePath(parsed.pathname, parsed.search, parsed.hash),
      "/dashboard",
    );
  } catch {
    return null;
  }
}
