import { requestProductApi, type GetAuthToken } from '@edutu/core/src/services/productApi';
import type { OpportunityPublicStage } from '@edutu/core/src/types/opportunityJourney';

export interface PlanEntry {
  opportunityId: string;
  title: string;
  stage: OpportunityPublicStage;
  status: string;
  deadline: string | null;
}

type Row = Record<string, any>;
function rows(payload: unknown, keys: string[]): Row[] | null {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return null;
  for (const key of keys) {
    const value = (payload as Row)[key];
    if (Array.isArray(value)) return value;
  }
  return null;
}
function entry(row: Row, stage: OpportunityPublicStage, status: string): PlanEntry {
  const opportunity = row.opportunity || row.opportunities || row;
  return {
    opportunityId: row.opportunityId || row.opportunity_id || opportunity.id,
    title: opportunity.title || 'Opportunity',
    stage, status,
    deadline: opportunity.deadline || opportunity.close_date || null,
  };
}

/** Use existing backend records until the journey pipeline is enabled. */
export async function loadLegacyPlan(getAuthToken: GetAuthToken): Promise<PlanEntry[]> {
  const [applications, bookmarks] = await Promise.all([
    requestProductApi('/me/applications', {}, getAuthToken),
    requestProductApi('/me/opportunities/bookmarks', {}, getAuthToken),
  ]);
  const applied = rows(applications, ['applications', 'items', 'data']);
  const saved = rows(bookmarks, ['bookmarks', 'savedOpportunities', 'items', 'data']);
  if (!applied || !saved) throw new Error('Unable to load your plan. Please try again.');
  const items = new Map<string, PlanEntry>();
  for (const application of applied) {
    const status = application.status || 'draft';
    const stage = ['offer', 'accepted', 'rejected', 'withdrawn', 'no_response', 'ghosted', 'expired', 'archived'].includes(status)
      ? 'outcome' : ['submitted', 'applied', 'interview', 'interviewing'].includes(status)
        ? 'applied' : 'pursuing';
    const item = entry(application, stage, status);
    if (item.opportunityId) items.set(item.opportunityId, item);
  }
  for (const bookmark of saved) {
    const item = entry(bookmark, 'discover', 'shortlisted');
    if (item.opportunityId && !items.has(item.opportunityId)) items.set(item.opportunityId, item);
  }
  return [...items.values()];
}
