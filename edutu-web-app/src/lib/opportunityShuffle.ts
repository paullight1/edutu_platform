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
