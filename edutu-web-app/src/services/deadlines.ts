import { supabase } from '../lib/supabaseClient';

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

export async function getDeadlines(userId: string): Promise<DeadlinesResponse> {
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
