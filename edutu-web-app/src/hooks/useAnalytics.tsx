import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';
import { supabase } from '../lib/supabaseClient';
import { useGoals } from './useGoals';
import {
  recordChatSessionAggregate,
  recordOpportunityExploreAggregate,
  recordUserActivityAggregate
} from '../services/analyticsAggregator';
import { useAuth } from '@clerk/clerk-react';

interface AnalyticsRecord {
  id: string;
  user_id: string;
  opportunities_explored: number;
  chat_sessions: number;
  goals_created: number;
  goals_completed: number;
  active_goals: number;
  total_progress: number;
  current_streak: number;
  longest_streak: number;
  active_dates: string[]; // This will be a date array stored in the database
  last_active_on?: string | null;
  last_event_at?: string | null;
  last_goal_completed_at?: string | null;
  last_opportunity_explored_at?: string | null;
  last_chat_session_at?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface AnalyticsStats {
  opportunitiesExplored: number;
  goalsAchieved: number;
  daysActive: number;
  chatSessions: number;
}

interface AnalyticsContextValue {
  stats: AnalyticsStats;
  isLoading: boolean;
  recordOpportunityExplored: (details?: { id: string; title: string; category?: string | null }) => Promise<void>;
  recordChatSession: (topic?: string) => Promise<void>;
  recordActivity: () => Promise<void>;
}

const AnalyticsContext = createContext<AnalyticsContextValue | undefined>(undefined);

const getTodayKey = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.toISOString().slice(0, 10);
};

export const AnalyticsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { goals } = useGoals();
  const { isSignedIn, userId } = useAuth();
  const [analytics, setAnalytics] = useState<AnalyticsRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadAnalytics = useCallback(async (uid: string) => {
    setIsLoading(true);

    try {
      let { data, error } = await supabase
        .from('analytics')
        .select('*')
        .eq('user_id', uid)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          const newAnalytics = {
            user_id: uid,
            opportunities_explored: 0,
            chat_sessions: 0,
            goals_created: 0,
            goals_completed: 0,
            active_goals: 0,
            total_progress: 0,
            current_streak: 0,
            longest_streak: 0,
            active_dates: [getTodayKey()],
            metadata: {}
          };

          const insertResult = await supabase
            .from('analytics')
            .insert([newAnalytics])
            .select()
            .single();

          if (insertResult.error) throw insertResult.error;

          data = insertResult.data;
        } else {
          throw error;
        }
      }

      if (data) {
        setAnalytics(data);
      }
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isSignedIn || !userId) {
      setAnalytics(null);
      setIsLoading(false);
      return;
    }
    void loadAnalytics(userId);
  }, [isSignedIn, userId, loadAnalytics]);

  const updateAnalytics = useCallback(async (updates: Partial<AnalyticsRecord>) => {
    if (!userId || !analytics) return;

    const { error } = await supabase
      .from('analytics')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);

    if (error) {
      console.error('Error updating analytics:', error);
      throw error;
    }

    setAnalytics(prev =>
      prev ? {
        ...prev,
        ...updates,
        updated_at: new Date().toISOString()
      } : null
    );
  }, [userId, analytics]);

  const recordActivity = useCallback(async () => {
    if (!userId) return;

    const todayKey = getTodayKey();
    const alreadyTrackedToday = analytics?.active_dates.includes(todayKey) ?? false;

    if (!alreadyTrackedToday) {
      const updatedDates = analytics
        ? [...analytics.active_dates, todayKey].sort()
        : [todayKey];

      try {
        await updateAnalytics({ active_dates: updatedDates });
      } catch (error) {
        console.error('Failed to persist daily activity analytics', error);
      }
    }

    try {
      await recordUserActivityAggregate(userId);
    } catch (error) {
      console.error('Failed to update aggregate user activity', error);
    }
  }, [userId, analytics, updateAnalytics]);

  const recordOpportunityExplored = useCallback(
    async (details?: { id: string; title: string; category?: string | null }) => {
      if (analytics) {
        try {
          await updateAnalytics({
            opportunities_explored: analytics.opportunities_explored + 1
          });
        } catch (error) {
          console.error('Failed to persist opportunity analytics', error);
        }
      }

      if (details) {
        try {
          await recordOpportunityExploreAggregate({
            id: details.id,
            title: details.title,
            category: details.category ?? undefined
          });
        } catch (error) {
          console.error('Failed to update opportunity aggregate analytics', error);
        }
      }

      await recordActivity();
    },
    [analytics, updateAnalytics, recordActivity]
  );

  const recordChatSession = useCallback(
    async (topic?: string) => {
      if (analytics) {
        try {
          await updateAnalytics({
            chat_sessions: analytics.chat_sessions + 1
          });
        } catch (error) {
          console.error('Failed to persist chat analytics', error);
        }
      }

      await recordActivity();

      if (userId) {
        try {
          await recordChatSessionAggregate(userId, topic);
        } catch (error) {
          console.error('Failed to update AI aggregate analytics', error);
        }
      }
    },
    [analytics, updateAnalytics, recordActivity, userId]
  );

  useEffect(() => {
    if (userId) {
      void recordActivity();
    }
  }, [userId, recordActivity]);

  const goalsAchieved = useMemo(
    () => goals.filter((goal) => goal.status === 'completed').length,
    [goals]
  );

  const daysActive = useMemo(() => {
    return analytics ? new Set(analytics.active_dates).size : 0;
  }, [analytics]);

  const stats = useMemo<AnalyticsStats>(
    () => ({
      opportunitiesExplored: analytics?.opportunities_explored || 0,
      goalsAchieved,
      daysActive,
      chatSessions: analytics?.chat_sessions || 0
    }),
    [daysActive, goalsAchieved, analytics]
  );

  const value = useMemo<AnalyticsContextValue>(
    () => ({
      stats,
      isLoading,
      recordActivity: recordActivity,
      recordOpportunityExplored,
      recordChatSession
    }),
    [stats, isLoading, recordActivity, recordOpportunityExplored, recordChatSession]
  );

  return <AnalyticsContext.Provider value={value}>{children}</AnalyticsContext.Provider>;
};

export function useAnalytics() {
  const context = useContext(AnalyticsContext);
  if (!context) {
    throw new Error('useAnalytics must be used within an AnalyticsProvider');
  }
  return context;
}
