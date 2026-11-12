import { selectNextSteps } from '../lib/nextStepWidget';
import type { OpportunityJourneyView } from '../packages/core/src/types/opportunityJourney';
const now = new Date('2026-11-12T10:00:00Z');
function journey(id: string, overrides: Record<string, unknown> = {}): OpportunityJourneyView {
  return { journey: { id, opportunityId: id, state: 'preparing', priority: 'primary', ...overrides },
    opportunity: { title: 'Global scholarship', deadline: '2026-12-01' },
    progress: { completedRequired: 1, totalRequired: 3, percent: 33 },
    tasks: [ { id: 'done', title: 'Done', status: 'completed', position: 0 }, { id: 'todo', title: 'Review your statement', status: 'pending', position: 1, dueAt: '2026-11-13' } ],
  } as unknown as OpportunityJourneyView;
}
it('uses actual unfinished task titles and navigates to the owning journey', () => {
  const [step] = selectNextSteps([journey('plan/a')], now);
  expect(step.title).toBe('Review your statement');
  expect(step.deepLink).toBe('edutu://my-plan/plan%2Fa');
  expect(step.completed).toBe(1);
});
it('ignores ended pursuits and expired opportunities', () => {
  const expired = journey('expired'); expired.opportunity.deadline = '2026-10-01';
  expect(selectNextSteps([journey('closed', { state: 'applied' }), expired], now)).toEqual([]);
});
it('ranks primary pursuits ahead of secondary and earliest task due dates first', () => {
  const secondary = journey('secondary', { priority: 'secondary' });
  const later = journey('later'); later.tasks[1].dueAt = '2026-11-20';
  expect(selectNextSteps([secondary, later, journey('first')], now).map(s => s.journeyId)).toEqual(['first', 'later', 'secondary']);
});
it('does not fabricate tasks or show skipped/completed steps', () => {
  const item = journey('none'); item.tasks[1].status = 'skipped';
  expect(selectNextSteps([item], now)).toEqual([]);
});
