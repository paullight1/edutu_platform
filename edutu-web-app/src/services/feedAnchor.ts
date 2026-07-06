/**
 * Anchored feed merge for background revalidates.
 *
 * When fresh recommendation data arrives over an already-rendered feed we
 * don't want cards jumping around under the user's cursor. Items present in
 * both lists keep their CURRENT relative order but adopt the INCOMING data
 * (fresh scores/reasons); genuinely new items slot in at their incoming rank;
 * items the server dropped disappear.
 */
export function anchorFeedOrder<T>(
  current: T[],
  incoming: T[],
  getId: (item: T) => string,
): T[] {
  if (current.length === 0) return [...incoming];

  const incomingById = new Map<string, T>();
  incoming.forEach((item) => {
    const id = getId(item);
    if (!incomingById.has(id)) incomingById.set(id, item);
  });

  const currentIds = new Set(current.map(getId));

  // Kept items: current order, incoming (fresh) data.
  const result: T[] = [];
  const seen = new Set<string>();
  current.forEach((item) => {
    const id = getId(item);
    if (seen.has(id)) return;
    const fresh = incomingById.get(id);
    if (fresh !== undefined) {
      seen.add(id);
      result.push(fresh);
    }
  });

  // New items insert at their incoming rank.
  incoming.forEach((item, index) => {
    const id = getId(item);
    if (currentIds.has(id) || seen.has(id)) return;
    seen.add(id);
    result.splice(Math.min(index, result.length), 0, item);
  });

  return result;
}
