import type { Opportunity } from '../types/opportunity';
import type { UserActivity } from '../types/analytics';
import logger from '../lib/logger';

export interface OpportunityInventorySnapshot {
  id: string;
  categories: Record<string, number>;
  totalOpportunities: number;
  updatedAt: Date;
}

export const ANALYTICS_UNAVAILABLE_REASON =
  'Legacy client analytics aggregation is disabled until a durable server telemetry sink is configured.';

type AnalyticsWriteResult = {
  success: false;
  available: false;
  reason: string;
  timestamp?: Date;
};

function unavailableWrite(timestamp = false): AnalyticsWriteResult {
  return {
    success: false,
    available: false,
    reason: ANALYTICS_UNAVAILABLE_REASON,
    ...(timestamp ? { timestamp: new Date() } : {}),
  };
}

export async function syncOpportunityInventorySnapshot(opportunities: Opportunity[]) {
  if (import.meta.env.DEV) {
    logger.debug('Analytics inventory snapshot unavailable', { count: opportunities.length });
  }
  return unavailableWrite(true);
}

export async function recordOpportunityExploreAggregate(details: {
  id: string;
  title: string;
  category?: string;
}) {
  if (import.meta.env.DEV) {
    logger.debug('Analytics opportunity aggregate unavailable', details);
  }
  return unavailableWrite();
}

export async function recordUserActivity(activity: UserActivity) {
  if (import.meta.env.DEV) {
    logger.debug('Analytics user activity unavailable', activity);
  }
  return unavailableWrite();
}

export async function syncUserGoalSummary(userId: string, goalData: unknown) {
  if (import.meta.env.DEV) {
    logger.debug('Analytics goal summary unavailable', { userId, goalData });
  }
  return unavailableWrite(true);
}

export async function recordChatSessionAggregate(userId: string, sessionData: unknown) {
  if (import.meta.env.DEV) {
    logger.debug('Analytics chat aggregate unavailable', { userId, sessionData });
  }
  return unavailableWrite();
}

export async function recordUserActivityAggregate(activityData: unknown) {
  if (import.meta.env.DEV) {
    logger.debug('Analytics activity aggregate unavailable', activityData);
  }
  return unavailableWrite();
}

export async function getAnalyticsData(
  userId: string,
  dateRange: { start: Date; end: Date },
) {
  if (import.meta.env.DEV) {
    logger.debug('Analytics data unavailable; returning explicitly unavailable aggregate', {
      userId,
      dateRange,
    });
  }
  return {
    available: false as const,
    reason: ANALYTICS_UNAVAILABLE_REASON,
    userEngagement: {
      daysActive: 0,
      totalSessions: 0,
      avgSessionDuration: 0,
    },
    opportunityInteractions: {
      explored: 0,
      saved: 0,
      applied: 0,
    },
    goalProgress: {
      created: 0,
      completed: 0,
      inProgress: 0,
    },
  };
}
