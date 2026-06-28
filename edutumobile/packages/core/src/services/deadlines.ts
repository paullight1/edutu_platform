import { SupabaseClient } from '@supabase/supabase-js';
import { GetAuthToken, requestProductApi } from './productApi';
import { toSafeUUID } from '../utils/auth';

export interface DeadlineItem {
  id: string;
  title: string;
  organization: string;
  deadline: string;
  type: 'applied' | 'bookmarked';
  opportunityId: string;
  daysRemaining: number;
  status?: string;
}

function getUserLookupIds(userId: string): string[] {
  return Array.from(new Set([userId, toSafeUUID(userId)]));
}

function getDaysRemaining(deadline?: string | null): number {
  return deadline
    ? Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : 999;
}

function getApiRows(payload: any): any[] | null {
  if (!payload) return null;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.deadlines)) return payload.deadlines;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.data)) return payload.data;
  return null;
}

function normaliseApiDeadline(row: any): DeadlineItem | null {
  if (row.type === 'goal') return null;

  const opportunity = row.opportunity || row.opportunities || row;
  const deadline = row.deadline || opportunity.deadline || opportunity.close_date || '';
  const type = row.type === 'bookmark' || row.type === 'bookmarked' || row.source === 'bookmark' || row.source === 'bookmarked'
    ? 'bookmarked'
    : 'applied';
  const opportunityId = row.opportunityId || row.opportunity_id || row.sourceId || opportunity.id || '';

  if (!opportunityId) return null;

  return {
    id: row.id || `${type}-${opportunityId}`,
    title: row.title || opportunity.title || 'Opportunity',
    organization: row.organization || opportunity.organization || 'Unknown',
    deadline,
    type,
    opportunityId,
    daysRemaining: typeof row.daysUntil === 'number'
      ? row.daysUntil
      : typeof row.daysRemaining === 'number'
        ? row.daysRemaining
        : getDaysRemaining(deadline),
    status: row.status,
  };
}

export async function fetchOpportunityDeadlines(
  supabase: SupabaseClient,
  userId: string,
  getAuthToken?: GetAuthToken,
): Promise<DeadlineItem[]> {
  const payload = await requestProductApi<any>('/me/deadlines', undefined, getAuthToken);
  const apiRows = getApiRows(payload);
  if (apiRows) {
    return apiRows
      .map(normaliseApiDeadline)
      .filter((deadline): deadline is DeadlineItem => Boolean(deadline?.deadline))
      .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());
  }

  const { data: appliedData, error: appliedError } = await supabase
    .from('goals')
    .select(`
      id,
      target_date,
      status,
      opportunities:opportunity_id (
        id,
        title,
        organization,
        deadline
      )
    `)
    .eq('user_id', toSafeUUID(userId))
    .eq('type', 'opportunity');

  if (appliedError) throw appliedError;

  const { data: bookmarkData, error: bookmarkError } = await supabase
    .from('bookmarks')
    .select(`
      id,
      created_at,
      opportunity_id
    `)
    .in('user_id', getUserLookupIds(userId));

  if (bookmarkError) throw bookmarkError;

  const appliedDeadlines: DeadlineItem[] = (appliedData || []).map((goal: any) => {
    const opp = goal.opportunities;
    const deadline = opp?.deadline || goal.target_date || '';

    return {
      id: goal.id,
      title: opp?.title || 'Opportunity',
      organization: opp?.organization || 'Unknown',
      deadline,
      type: 'applied',
      opportunityId: opp?.id || '',
      daysRemaining: getDaysRemaining(deadline),
      status: goal.status,
    };
  });

  let bookmarkDeadlines: DeadlineItem[] = [];
  if (bookmarkData && bookmarkData.length > 0) {
    const oppIds = bookmarkData.map((bookmark: any) => bookmark.opportunity_id);
    const { data: oppDetails } = await supabase
      .from('opportunities')
      .select('id, title, organization, deadline')
      .in('id', oppIds);

    bookmarkDeadlines = (oppDetails || []).map((opp: any) => ({
      id: `bookmark-${opp.id}`,
      title: opp.title || 'Opportunity',
      organization: opp.organization || 'Unknown',
      deadline: opp.deadline || '',
      type: 'bookmarked',
      opportunityId: opp.id,
      daysRemaining: getDaysRemaining(opp.deadline),
    }));
  }

  return [...appliedDeadlines, ...bookmarkDeadlines]
    .filter((deadline) => deadline.deadline)
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());
}
