import type { Opportunity } from '@edutu/core/src/types/opportunity';
import { getDeadlineBadge } from '@edutu/core/src/utils/deadline';

type LooseOpportunity = Opportunity & Record<string, unknown>;

const RECOMMENDED_PATTERN = [
  'recommended',
  'new',
  'discovery',
  'recommended',
  'discovery',
  'recommended',
] as const;

function mix(value: number): number {
  let result = value | 0;
  result = Math.imul(result ^ (result >>> 16), 0x45d9f3b);
  result = Math.imul(result ^ (result >>> 16), 0x45d9f3b);
  return (result ^ (result >>> 16)) >>> 0;
}

function hashId(id: string, seed: number): number {
  let hash = mix(seed);
  for (let index = 0; index < id.length; index += 1) {
    hash = Math.imul(hash ^ id.charCodeAt(index), 16777619) >>> 0;
  }
  return mix(hash);
}

function seededOrder(items: Opportunity[], seed: number): Opportunity[] {
  return [...items].sort((left, right) => {
    const difference = hashId(left.id, seed) - hashId(right.id, seed);
    return difference || left.id.localeCompare(right.id);
  });
}

function freshnessTime(opportunity: LooseOpportunity): number {
  const raw =
    opportunity.createdAt ??
    opportunity.created_at ??
    opportunity.lastUpdated ??
    opportunity.last_updated ??
    opportunity.updatedAt ??
    opportunity.updated_at;
  const timestamp = typeof raw === 'string' || raw instanceof Date
    ? new Date(raw).getTime()
    : NaN;
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function isOpenOpportunity(opportunity: Opportunity): boolean {
  const daysLeft = getDeadlineBadge(opportunity.deadline).daysLeft;
  return daysLeft === null || daysLeft >= 0;
}

/**
 * Produces a stable discovery order for one screen session.
 *
 * Every currently-open opportunity appears exactly once. Six-card windows mix
 * strong recommendations with newly-published and long-tail listings so the
 * same handful cannot permanently monopolize the top of a 400+ item catalog.
 */
export function rotateOpportunityFeed(
  items: Opportunity[],
  seed: number,
): Opportunity[] {
  const open = items.filter(isOpenOpportunity);
  if (open.length <= 1) return open;

  const ranked = [...open].sort((left, right) => {
    const matchDifference = (right.match || 0) - (left.match || 0);
    return matchDifference || freshnessTime(right as LooseOpportunity) - freshnessTime(left as LooseOpportunity);
  });
  const recommendedCount = Math.min(40, Math.max(12, Math.ceil(open.length * 0.1)));
  const newestCount = Math.min(40, Math.max(12, Math.ceil(open.length * 0.1)));
  const newestCandidates = [...open]
    .filter((item) => freshnessTime(item as LooseOpportunity) > 0)
    .sort((left, right) => freshnessTime(right as LooseOpportunity) - freshnessTime(left as LooseOpportunity))
    .slice(0, newestCount);

  const pools = {
    recommended: seededOrder(ranked.slice(0, recommendedCount), seed ^ 0x51f15e),
    new: seededOrder(newestCandidates, seed ^ 0x9e3779),
    discovery: seededOrder(open, seed ^ 0x7f4a7c),
  };
  const cursors = { recommended: 0, new: 0, discovery: 0 };
  const used = new Set<string>();
  const result: Opportunity[] = [];

  const take = (poolName: keyof typeof pools): boolean => {
    const pool = pools[poolName];
    while (cursors[poolName] < pool.length) {
      const candidate = pool[cursors[poolName]++];
      if (used.has(candidate.id)) continue;
      used.add(candidate.id);
      result.push(candidate);
      return true;
    }
    return false;
  };

  let patternIndex = 0;
  while (result.length < open.length) {
    const preferredPool = RECOMMENDED_PATTERN[patternIndex % RECOMMENDED_PATTERN.length];
    patternIndex += 1;
    if (take(preferredPool)) continue;
    if (take('discovery')) continue;
    if (take('recommended')) continue;
    if (!take('new')) break;
  }

  return result;
}

export function createOpportunityRotationSeed(now = Date.now()): number {
  return mix(Math.floor(now % 0x7fffffff));
}
