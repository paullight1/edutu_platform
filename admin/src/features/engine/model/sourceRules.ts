import type { ScrapeSource } from "./types";

export function sourceChildren(
  source: ScrapeSource,
  allSources: readonly ScrapeSource[],
): ScrapeSource[] {
  return allSources.filter(
    (candidate) => candidate.parent_id === source.id && !candidate.is_group,
  );
}

export function isSourceRunnable(
  source: ScrapeSource,
  allSources: readonly ScrapeSource[],
): boolean {
  if (!source.enabled) return false;
  if (!source.is_group) return true;
  return sourceChildren(source, allSources).some((child) => child.enabled);
}
