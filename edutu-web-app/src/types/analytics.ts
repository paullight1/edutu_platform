export interface AnalyticsData {
  userEngagement: {
    daysActive: number;
    totalSessions: number;
    avgSessionDuration: number;
  };
  opportunityInteractions: {
    explored: number;
    saved: number;
    applied: number;
  };
  goalProgress: {
    created: number;
    completed: number;
    inProgress: number;
  };
  skillDevelopment?: {
    skillsTracked: number;
    avgProgress: number;
    completedMilestones: number;
  };
}

export interface UserActivity {
  userId: string;
  action: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}
