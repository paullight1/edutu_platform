/**
 * Merges a fresh feed into the one currently on screen without reshuffling
 * items the user can already see:
 *
 * - ids present in BOTH keep their CURRENT relative order, but adopt the
 *   incoming item data (fresh match scores, reasons, etc.);
 * - ids only in `incoming` are inserted at their incoming rank;
 * - ids missing from `incoming` are dropped.
 *
 * Pure — never mutates its inputs.
 */
export function anchorFeedOrder<T>(
  current: T[],
  incoming: T[],
  getId: (item: T) => string,
): T[] {
  if (current.length === 0) {
    return [...incoming];
  }

  const incomingById = new Map<string, T>();
  for (const item of incoming) {
    if (!incomingById.has(getId(item))) {
      incomingById.set(getId(item), item);
    }
  }

  const currentIds = new Set(current.map(getId));

  // Kept items in their current order, refreshed with incoming data.
  const result: T[] = [];
  const seen = new Set<string>();
  for (const item of current) {
    const id = getId(item);
    if (!incomingById.has(id) || seen.has(id)) {
      continue;
    }
    seen.add(id);
    result.push(incomingById.get(id) as T);
  }

  // New items slot in at their incoming rank.
  incoming.forEach((item, index) => {
    const id = getId(item);
    if (currentIds.has(id) || seen.has(id)) {
      return;
    }
    seen.add(id);
    result.splice(Math.min(index, result.length), 0, item);
  });

  return result;
}
