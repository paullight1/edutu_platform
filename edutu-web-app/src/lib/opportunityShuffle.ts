// Seeded shuffle helpers shared by every surface that shows opportunity
// feeds (dashboard, browse page, rails). A fresh seed per visit keeps the
// catalogue feeling alive; the seed staying fixed while the user browses
// keeps pagination and infinite scroll stable underneath them.

export function createOpportunityShuffleSeed(): number {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    return crypto.getRandomValues(new Uint32Array(1))[0] || Date.now();
  }

  return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
}

/** Deterministic PRNG (Park–Miller) so a given seed always yields the same order. */
export function seededRandom(seed: number): () => number {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;

  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

/** Fisher–Yates shuffle driven by the seeded PRNG; never mutates the input. */
export function shuffleOpportunityFeed<T>(items: T[], seed: number): T[] {
  const nextItems = [...items];
  const random = seededRandom(seed);

  for (let index = nextItems.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [nextItems[index], nextItems[swapIndex]] = [
      nextItems[swapIndex],
      nextItems[index],
    ];
  }

  return nextItems;
}

const RECENCY_SHUFFLE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Shuffle recent listings within rolling seven-day bands. The newest band is
 * always first, older bands follow in order, and undated records stay at the
 * end. A stable seed keeps pagination consistent for the current visit.
 */
export function shuffleLatestOpportunityFeed<T>(
  items: T[],
  seed: number,
  getTimestamp: (item: T) => number | null | undefined,
): T[] {
  const dated: Array<{ item: T; timestamp: number }> = [];
  const undated: T[] = [];

  for (const item of items) {
    const timestamp = getTimestamp(item);
    if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
      undated.push(item);
      continue;
    }
    dated.push({ item, timestamp });
  }

  dated.sort((a, b) => b.timestamp - a.timestamp);

  const latestTimestamp = dated[0]?.timestamp;
  if (latestTimestamp === undefined) return undated;

  const bands = new Map<number, T[]>();
  for (const { item, timestamp } of dated) {
    const band = Math.floor(
      (latestTimestamp - timestamp) / RECENCY_SHUFFLE_WINDOW_MS,
    );
    const group = bands.get(band);
    if (group) group.push(item);
    else bands.set(band, [item]);
  }

  return [
    ...[...bands.keys()].sort((a, b) => a - b).flatMap((band) =>
      shuffleOpportunityFeed(bands.get(band) ?? [], seed ^ band),
    ),
    ...undated,
  ];
}
