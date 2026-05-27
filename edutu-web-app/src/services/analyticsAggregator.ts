import type { Opportunity } from '../types/opportunity';
import type { UserActivity } from '../types/analytics';

export interface OpportunityInventorySnapshot {
  id: string;
  categories: Record<string, number>;
  totalOpportunities: number;
  updatedAt: Date;
}

export async function syncOpportunityInventorySnapshot(opportunities: Opportunity[]) {
  if (import.meta.env.DEV) {
    console.debug('Analytics inventory snapshot skipped in development', { count: opportunities.length });
  }
  return { success: true, timestamp: new Date() };
}

export async function recordOpportunityExploreAggregate(details: { id: string; title: string; category?: string }) {
  if (import.meta.env.DEV) {
    console.debug('Analytics opportunity aggregate skipped in development', details);
  }
  return { success: true };
}

export async function recordUserActivity(activity: UserActivity) {
  if (import.meta.env.DEV) {
    console.debug('Analytics user activity skipped in development', activity);
  }
  return { success: true };
}

export async function syncUserGoalSummary(userId: string, goalData: any) {
  if (import.meta.env.DEV) {
    console.debug('Analytics goal summary skipped in development', { userId, goalData });
  }
  return { success: true, timestamp: new Date() };
}

export async function recordChatSessionAggregate(userId: string, sessionData: any) {
  if (import.meta.env.DEV) {
    console.debug('Analytics chat aggregate skipped in development', { userId, sessionData });
  }
  return { success: true };
}

export async function recordUserActivityAggregate(activityData: any) {
  if (import.meta.env.DEV) {
    console.debug('Analytics activity aggregate skipped in development', activityData);
  }
  return { success: true };
}

export async function getAnalyticsData(userId: string, dateRange: { start: Date; end: Date }) {
  if (import.meta.env.DEV) {
    console.debug('Analytics data unavailable; returning empty aggregate', { userId, dateRange });
  }
  return {
    userEngagement: {
      daysActive: 0,
      totalSessions: 0,
      avgSessionDuration: 0
    },
    opportunityInteractions: {
      explored: 0,
      saved: 0,
      applied: 0
    },
    goalProgress: {
      created: 0,
      completed: 0,
      inProgress: 0
    }
  };
}
