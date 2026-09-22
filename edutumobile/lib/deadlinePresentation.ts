import type { DeadlineItem } from '../packages/core/src/services/deadlines';

/** One opportunity per date, with past deadlines separated from upcoming work. */
export function groupPlanDeadlines(items: DeadlineItem[], now: number) {
  const unique = new Map<string, DeadlineItem>();
  for (const item of items) {
    const key = `${item.opportunityId}:${item.deadline}`;
    if (!unique.has(key) || item.type === 'applied') unique.set(key, item);
  }
  const groups = { thisWeek: [] as DeadlineItem[], nextWeek: [] as DeadlineItem[], thisMonth: [] as DeadlineItem[], later: [] as DeadlineItem[], pastDue: [] as DeadlineItem[] };
  const day = 86400000;
  [...unique.values()].sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime()).forEach(item => {
    const diff = new Date(item.deadline).getTime() - now;
    const daysRemaining = Math.ceil(diff / day);
    const bucket = daysRemaining < 0 ? 'pastDue' : diff <= 7 * day ? 'thisWeek' : diff <= 14 * day ? 'nextWeek' : diff <= 30 * day ? 'thisMonth' : 'later';
    groups[bucket].push({ ...item, daysRemaining });
  });
  return groups;
}
