import type { OpportunityJourneyView } from '../packages/core/src/types/opportunityJourney';
import type { NextStepItem } from '../widgets/NextStepWidget';

const ACTIVE = new Set(['pursuing', 'preparing', 'ready_to_apply']);
function stamp(value: unknown): number {
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : Infinity;
}

/** Real unfinished preparation tasks only; never infer that an application was submitted. */
export function selectNextSteps(journeys: OpportunityJourneyView[], now = new Date()): NextStepItem[] {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  return journeys.flatMap(view => {
    if (!ACTIVE.has(view.journey.state)) return [];
    const deadline = typeof view.opportunity.deadline === 'string' ? view.opportunity.deadline : null;
    if (stamp(deadline) < today.getTime()) return [];
    return view.tasks.filter(task => task.status === 'pending' || task.status === 'in_progress').map(task => ({
      journeyId: view.journey.id, taskId: task.id, title: task.title,
      opportunity: typeof view.opportunity.title === 'string' ? view.opportunity.title : 'Your application',
      dueAt: task.dueAt ?? null, deadline,
      completed: view.progress.completedRequired, total: view.progress.totalRequired,
      deepLink: `edutu://my-plan/${encodeURIComponent(view.journey.id)}`,
      priority: view.journey.priority === 'primary' ? 0 : view.journey.priority === 'secondary' ? 1 : 2,
      position: task.position,
    }));
  }).filter(task => Boolean(task.title?.trim())).sort((a, b) =>
    a.priority - b.priority || stamp(a.dueAt) - stamp(b.dueAt) || stamp(a.deadline) - stamp(b.deadline) || a.position - b.position || a.taskId.localeCompare(b.taskId),
  ).slice(0, 3).map(({ priority: _priority, position: _position, ...task }) => task);
}
