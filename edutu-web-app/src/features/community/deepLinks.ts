const GROUP_ID_SEGMENT = "([^/]+)";
const RESERVED_DISCUSSION_SEGMENTS = new Set(["dm", "explore", "chats"]);

function normalizePath(pathname: string): string {
  const path = (pathname || "").trim().split(/[?#]/, 1)[0] || "/";
  if (path === "/") return path;
  return path.replace(/\/+$/, "") || "/";
}

function safeSegment(value: string): string | null {
  const decoded = (() => {
    try {
      return decodeURIComponent(value);
    } catch {
      return "";
    }
  })();
  if (
    !decoded ||
    decoded === "." ||
    decoded === ".." ||
    decoded.includes("/") ||
    RESERVED_DISCUSSION_SEGMENTS.has(decoded.toLowerCase())
  ) {
    return null;
  }
  return encodeURIComponent(decoded);
}

/**
 * Convert the mobile Community paths already persisted in notifications into
 * the authenticated web workspace. Unknown paths deliberately return null so
 * the caller can use the normal 404/fallback rather than guessing at a target.
 */
export function resolveCommunityWebDeepLink(pathname: string): string | null {
  const path = normalizePath(pathname);
  if (path === "/discussions") return "/app/community/groups";
  if (path === "/discussions/explore") return "/app/community/explore";
  if (path === "/discussions/chats") return "/app/community/chats";

  const dmMatch = path.match(
    new RegExp(`^/discussions/dm/${GROUP_ID_SEGMENT}$`),
  );
  if (dmMatch) {
    const id = safeSegment(dmMatch[1]);
    return id ? `/app/community/dm/${id}` : null;
  }

  const groupMatch = path.match(
    new RegExp(`^/discussions/${GROUP_ID_SEGMENT}$`),
  );
  if (groupMatch) {
    const id = safeSegment(groupMatch[1]);
    return id ? `/app/community/groups/${id}` : null;
  }

  return null;
}
