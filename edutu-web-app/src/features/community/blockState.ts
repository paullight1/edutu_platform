const LOCAL_BLOCKS_KEY = "edutu:web:community:blocked-authors:v1";

export function readLocalBlockedAuthors(): string[] {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(LOCAL_BLOCKS_KEY) ?? "[]",
    ) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter(
          (value): value is string =>
            typeof value === "string" && Boolean(value.trim()),
        )
      : [];
  } catch {
    return [];
  }
}

export function persistLocalBlockedAuthors(ids: Iterable<string>): void {
  try {
    window.localStorage.setItem(
      LOCAL_BLOCKS_KEY,
      JSON.stringify([...new Set(ids)]),
    );
  } catch {
    // Server-side blocks remain authoritative. Local persistence only closes
    // the Supabase Realtime gap on this browser.
  }
}

export function addLocalBlockedAuthor(userId: string): void {
  const next = new Set(readLocalBlockedAuthors());
  next.add(userId);
  persistLocalBlockedAuthors(next);
}

export function removeLocalBlockedAuthor(userId: string): void {
  const next = new Set(readLocalBlockedAuthors());
  next.delete(userId);
  persistLocalBlockedAuthors(next);
}
