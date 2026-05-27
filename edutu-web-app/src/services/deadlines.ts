import { supabase } from '../lib/supabaseClient';
import { isProductApiUnavailableError, productApiRequest } from './productApi';

export type DeadlineType = 'bookmark' | 'application' | 'goal';
export type DeadlineUrgency = 'critical' | 'soon' | 'upcoming' | 'later';
export type DeadlineGroup = 'This Week' | 'Next Week' | 'This Month' | 'Later';

export interface Deadline {
  id: string;
  title: string;
  type: DeadlineType;
  deadline: string;
  daysUntil: number;
  urgency: DeadlineUrgency;
  category: string;
  sourceId: string;
}

export interface GroupedDeadlines {
  group: DeadlineGroup;
  deadlines: Deadline[];
}

export interface DeadlinesSummary {
  total: number;
  thisWeek: number;
  critical: number;
}

export interface DeadlinesResponse {
  summary: DeadlinesSummary;
  groups: GroupedDeadlines[];
}

function calculateDaysUntil(deadline: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(deadline);
  target.setHours(0, 0, 0, 0);
  const diff = target.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function getUrgency(daysUntil: number): DeadlineUrgency {
  if (daysUntil <= 3) return 'critical';
  if (daysUntil <= 7) return 'soon';
  if (daysUntil <= 30) return 'upcoming';
  return 'later';
}

function getGroup(daysUntil: number): DeadlineGroup {
  if (daysUntil <= 7) return 'This Week';
  if (daysUntil <= 14) return 'Next Week';
  if (daysUntil <= 30) return 'This Month';
  return 'Later';
}

type ApiDeadline = Partial<Deadline> & {
  source_id?: string;
  sourceId?: string;
  days_until?: number;
  daysUntil?: number;
};

function normalizeDeadline(row: ApiDeadline): Deadline | null {
  const deadline = row.deadline;
  if (!deadline) return null;

  const daysUntil = row.daysUntil ?? row.days_until ?? calculateDaysUntil(deadline);

  return {
    id: row.id ?? `${row.type ?? 'deadline'}:${row.source_id ?? row.sourceId ?? deadline}`,
    title: row.title ?? 'Deadline',
    type: row.type ?? 'goal',
    deadline,
    daysUntil,
    urgency: row.urgency ?? getUrgency(daysUntil),
    category: row.category ?? 'General',
    sourceId: row.sourceId ?? row.source_id ?? row.id ?? ''
  };
}

function groupDeadlines(deadlines: Deadline[]): DeadlinesResponse {
  deadlines.sort((a, b) => a.daysUntil - b.daysUntil);

  const groupOrder: DeadlineGroup[] = ['This Week', 'Next Week', 'This Month', 'Later'];
  const groupsMap = new Map<DeadlineGroup, Deadline[]>();
  groupOrder.forEach(g => groupsMap.set(g, []));

  deadlines.forEach(deadline => {
    const group = getGroup(deadline.daysUntil);
    groupsMap.get(group)!.push(deadline);
  });

  const groups: GroupedDeadlines[] = groupOrder.map(group => ({
    group,
    deadlines: groupsMap.get(group) || []
  }));

  const summary: DeadlinesSummary = {
    total: deadlines.length,
    thisWeek: groupsMap.get('This Week')!.length,
    critical: deadlines.filter(d => d.urgency === 'critical').length
  };

  return { summary, groups };
}

function normalizeDeadlinesResponse(response: DeadlinesResponse | Deadline[] | { data?: Deadline[]; deadlines?: Deadline[] } | null | undefined): DeadlinesResponse {
  if (!response) return groupDeadlines([]);
  if (Array.isArray(response)) {
    return groupDeadlines(response.map(normalizeDeadline).filter((deadline): deadline is Deadline => Boolean(deadline)));
  }

  if ('groups' in response && 'summary' in response) {
    return {
      summary: response.summary,
      groups: response.groups.map((group) => ({
        group: group.group,
        deadlines: group.deadlines
          .map(normalizeDeadline)
          .filter((deadline): deadline is Deadline => Boolean(deadline))
      }))
    };
  }

  const rows = response.deadlines ?? response.data ?? [];
  return groupDeadlines(rows.map(normalizeDeadline).filter((deadline): deadline is Deadline => Boolean(deadline)));
}

async function tryProductApi<T>(operation: () => Promise<T>): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    if (isProductApiUnavailableError(error)) return null;
    throw error;
  }
}

export async function getDeadlines(userId: string, token?: string | null): Promise<DeadlinesResponse> {
  if (token) {
    const apiDeadlines = await tryProductApi(async () => {
      const response = await productApiRequest<DeadlinesResponse | Deadline[] | { data?: Deadline[]; deadlines?: Deadline[] }>(
        '/me/deadlines',
        token
      );
      return normalizeDeadlinesResponse(response);
    });

    if (apiDeadlines) return apiDeadlines;
  }

  const deadlines: Deadline[] = [];

  const [bookmarksResult, applicationsResult, goalsResult] = await Promise.all([
    supabase
      .from('opportunity_bookmarks')
      .select('id, opportunity_id, saved_at')
      .eq('user_id', userId),
    supabase
      .from('opportunity_applications')
      .select('id, opportunity_id, created_at')
      .eq('user_id', userId),
    supabase
      .from('goals')
      .select('id, title, category, deadline')
      .eq('user_id', userId)
      .eq('status', 'active')
      .not('deadline', 'is', null)
  ]);

  if (bookmarksResult.data && bookmarksResult.data.length > 0) {
    const opportunityIds = bookmarksResult.data.map(b => b.opportunity_id);
    const { data: opportunities } = await supabase
      .from('opportunities')
      .select('id, title, category, close_date')
      .in('id', opportunityIds);

    const oppMap = new Map(opportunities?.map(o => [o.id, o]) ?? []);

    bookmarksResult.data.forEach(bookmark => {
      const opp = oppMap.get(bookmark.opportunity_id);
      if (opp?.close_date) {
        const daysUntil = calculateDaysUntil(opp.close_date);
        deadlines.push({
          id: bookmark.id,
          title: opp.title,
          type: 'bookmark',
          deadline: opp.close_date,
          daysUntil,
          urgency: getUrgency(daysUntil),
          category: opp.category || 'General',
          sourceId: bookmark.opportunity_id
        });
      }
    });
  }

  if (applicationsResult.data && applicationsResult.data.length > 0) {
    const opportunityIds = applicationsResult.data.map(a => a.opportunity_id);
    const { data: opportunities } = await supabase
      .from('opportunities')
      .select('id, title, category, close_date')
      .in('id', opportunityIds);

    const oppMap = new Map(opportunities?.map(o => [o.id, o]) ?? []);

    applicationsResult.data.forEach(application => {
      const opp = oppMap.get(application.opportunity_id);
      if (opp?.close_date) {
        const daysUntil = calculateDaysUntil(opp.close_date);
        deadlines.push({
          id: application.id,
          title: opp.title,
          type: 'application',
          deadline: opp.close_date,
          daysUntil,
          urgency: getUrgency(daysUntil),
          category: opp.category || 'General',
          sourceId: application.opportunity_id
        });
      }
    });
  }

  if (goalsResult.data && goalsResult.data.length > 0) {
    goalsResult.data.forEach(goal => {
      if (goal.deadline) {
        const daysUntil = calculateDaysUntil(goal.deadline);
        deadlines.push({
          id: goal.id,
          title: goal.title,
          type: 'goal',
          deadline: goal.deadline,
          daysUntil,
          urgency: getUrgency(daysUntil),
          category: goal.category || 'General',
          sourceId: goal.id
        });
      }
    });
  }

  return groupDeadlines(deadlines);
}
