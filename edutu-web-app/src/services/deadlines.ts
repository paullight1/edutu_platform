import { productApiRequest } from './productApi';

export type DeadlineType = 'bookmark' | 'application' | 'goal';
export type DeadlineUrgency = 'overdue' | 'critical' | 'urgent' | 'soon' | 'upcoming' | 'later';
export type DeadlineGroup = 'Overdue' | 'This Week' | 'Next Week' | 'This Month' | 'Later';

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
  overdue: number;
  urgent: number;
  soon: number;
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
  if (daysUntil < 0) return 'overdue';
  if (daysUntil <= 3) return 'critical';
  if (daysUntil <= 7) return 'urgent';
  if (daysUntil <= 30) return 'upcoming';
  return 'later';
}

function getGroup(daysUntil: number): DeadlineGroup {
  if (daysUntil < 0) return 'Overdue';
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
  targetDate?: string;
  target_date?: string;
};

interface BackendDeadlinesResponse {
  summary?: {
    total?: number;
    overdue?: number;
    urgent?: number;
    soon?: number;
    thisWeek?: number;
    critical?: number;
  };
  groups?: Partial<Record<'overdue' | 'urgent' | 'soon' | 'later', ApiDeadline[]>> | GroupedDeadlines[];
  items?: ApiDeadline[];
  data?: ApiDeadline[];
  deadlines?: ApiDeadline[];
}

function normalizeDeadline(row: ApiDeadline): Deadline | null {
  const deadline = row.deadline ?? row.targetDate ?? row.target_date;
  if (!deadline) return null;

  const daysUntil = row.daysUntil ?? row.days_until ?? calculateDaysUntil(deadline);
  const normalizedUrgency = row.urgency === 'soon' && daysUntil <= 7
    ? 'urgent'
    : row.urgency ?? getUrgency(daysUntil);

  return {
    id: row.id ?? `${row.type ?? 'deadline'}:${row.source_id ?? row.sourceId ?? deadline}`,
    title: row.title ?? 'Deadline',
    type: row.type ?? 'goal',
    deadline,
    daysUntil,
    urgency: normalizedUrgency,
    category: row.category ?? 'General',
    sourceId: row.sourceId ?? row.source_id ?? row.id ?? ''
  };
}

function groupDeadlines(deadlines: Deadline[]): DeadlinesResponse {
  deadlines.sort((a, b) => a.daysUntil - b.daysUntil);

  const groupOrder: DeadlineGroup[] = ['Overdue', 'This Week', 'Next Week', 'This Month', 'Later'];
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
    overdue: groupsMap.get('Overdue')!.length,
    urgent: deadlines.filter(d => d.urgency === 'critical' || d.urgency === 'urgent').length,
    soon: deadlines.filter(d => d.urgency === 'soon' || d.urgency === 'upcoming').length,
    thisWeek: groupsMap.get('This Week')!.length,
    critical: deadlines.filter(d => d.urgency === 'critical' || d.urgency === 'urgent' || d.urgency === 'overdue').length
  };

  return { summary, groups };
}

function flattenBackendGroups(
  groups: BackendDeadlinesResponse['groups']
): ApiDeadline[] {
  if (!groups) return [];
  if (Array.isArray(groups)) {
    return groups.flatMap((group) => group.deadlines ?? []);
  }

  return [
    ...(groups.overdue ?? []),
    ...(groups.urgent ?? []),
    ...(groups.soon ?? []),
    ...(groups.later ?? []),
  ];
}

function normalizeDeadlinesResponse(response: BackendDeadlinesResponse | Deadline[] | null | undefined): DeadlinesResponse {
  if (!response) return groupDeadlines([]);
  if (Array.isArray(response)) {
    return groupDeadlines(response.map(normalizeDeadline).filter((deadline): deadline is Deadline => Boolean(deadline)));
  }

  if ('groups' in response && 'summary' in response) {
    const rows = response.items ?? flattenBackendGroups(response.groups);
    return groupDeadlines(rows.map(normalizeDeadline).filter((deadline): deadline is Deadline => Boolean(deadline)));
  }

  const rows = response.items ?? response.deadlines ?? response.data ?? [];
  return groupDeadlines(rows.map(normalizeDeadline).filter((deadline): deadline is Deadline => Boolean(deadline)));
}

export async function getDeadlines(userId: string, token?: string | null): Promise<DeadlinesResponse> {
  if (!userId) return groupDeadlines([]);
  if (!token) throw new Error('Sign in again to load deadlines.');

  const response = await productApiRequest<BackendDeadlinesResponse | Deadline[]>(
    '/me/deadlines',
    token
  );
  return normalizeDeadlinesResponse(response);
}
