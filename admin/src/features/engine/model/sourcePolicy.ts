import type { ScrapeSource } from "./types";

/**
 * A source is runnable only when it is enabled. A group also requires at least
 * one enabled, non-group child so the UI never starts an empty group run.
 */
export function canRunSource(
  source: ScrapeSource,
  allSources: readonly ScrapeSource[],
): boolean {
  if (!source.enabled) return false;
  if (!source.is_group) return true;

  return allSources.some(
    (candidate) =>
      candidate.parent_id === source.id &&
      !candidate.is_group &&
      candidate.enabled,
  );
}
