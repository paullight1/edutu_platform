import { groupPlanDeadlines } from '../lib/deadlinePresentation';
import type { DeadlineItem } from '../packages/core/src/services/deadlines';
const now = Date.parse('2026-09-09T12:00:00Z');
const row = (id: string, deadline: string, type: DeadlineItem['type'] = 'bookmarked'): DeadlineItem => ({ id: `${type}-${id}`, opportunityId: id, title: id, organization: 'Org', deadline, type, daysRemaining: 999 });
it('separates past dates and sorts upcoming deadlines instead of presenting expired work as this week', () => {
  const groups = groupPlanDeadlines([row('later', '2026-09-14T12:00:00Z'), row('past', '2026-09-01T12:00:00Z'), row('soon', '2026-09-10T12:00:00Z')], now);
  expect(groups.thisWeek.map(item => item.opportunityId)).toEqual(['soon', 'later']);
  expect(groups.pastDue[0].daysRemaining).toBe(-8);
});
it('shows one deadline for a saved and applied opportunity, keeping applied status', () => {
  const date = '2026-09-10T12:00:00Z';
  const groups = groupPlanDeadlines([row('one', date, 'applied'), row('one', date)], now);
  expect(groups.thisWeek).toHaveLength(1);
  expect(groups.thisWeek[0].type).toBe('applied');
});
