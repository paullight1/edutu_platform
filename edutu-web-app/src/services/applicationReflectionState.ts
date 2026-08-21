import type { ApplicationHistoryRecord } from "./applications";

/**
 * Return the newest non-empty reflection from the durable application ledger.
 * History may contain status/note/interview events and is not assumed to arrive
 * in perfect order, so selection is explicit and deterministic.
 */
export function latestApplicationReflection(
  history: ApplicationHistoryRecord[],
): string {
  return history
    .filter(
      (entry) =>
        entry.event_type === "reflection" && Boolean(entry.note?.trim()),
    )
    .sort(
      (left, right) =>
        new Date(right.created_at).getTime() -
        new Date(left.created_at).getTime(),
    )[0]
    ?.note?.trim() ?? "";
}
