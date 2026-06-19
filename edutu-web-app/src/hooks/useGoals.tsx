import React,
{
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer
} from 'react';
import { syncUserGoalSummary } from '../services/analyticsAggregator';
import { productApiRequest } from '../services/productApi';
import { taskTrackingService } from '../services/taskTrackingService';
import { useAuth } from '@clerk/clerk-react';

export type GoalStatus = 'active' | 'completed' | 'archived';

export interface Goal {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  category?: string;
  deadline?: string; // date string in ISO format
  progress: number;
  status: GoalStatus;
  created_at: string; // timestamp in ISO format
  updated_at: string; // timestamp in ISO format
  completed_at?: string | null; // timestamp in ISO format
  priority?: 'low' | 'medium' | 'high';
  source?: 'template' | 'custom' | 'imported';
  template_id?: string;
}

export interface GoalInput {
  title: string;
  description?: string;
  category?: string;
  deadline?: string;
  progress?: number;
  priority?: 'low' | 'medium' | 'high';
  source?: 'template' | 'custom' | 'imported';
  templateId?: string;
}

export type GoalUpdate = Partial<Omit<Goal, 'id' | 'user_id' | 'created_at'>>;

interface GoalsContextValue {
  goals: Goal[];
  isLoading: boolean;
  refreshGoals: () => Promise<void>;
  createGoal: (goal: GoalInput) => Promise<Goal>;
  updateGoal: (id: string, updates: GoalUpdate) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
  clearGoals: () => void; // This will only clear local state, not database
}

type GoalsAction =
  | { type: 'SET_GOALS'; payload: Goal[] }
  | { type: 'ADD_GOAL'; payload: Goal }
  | { type: 'UPDATE_GOAL'; payload: { id: string; updates: GoalUpdate } }
  | { type: 'DELETE_GOAL'; payload: { id: string } }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'CLEAR_GOALS' };

const GoalsContext = createContext<GoalsContextValue | undefined>(undefined);

type ApiGoal = {
  id: string;
  userId?: string;
  user_id?: string;
  title: string;
  description?: string | null;
  category?: string | null;
  deadline?: string | null;
  targetDate?: string | null;
  target_date?: string | null;
  progress?: number | null;
  status?: string | null;
  createdAt?: string | null;
  created_at?: string | null;
  updatedAt?: string | null;
  updated_at?: string | null;
  completedAt?: string | null;
  completed_at?: string | null;
  priority?: 'low' | 'medium' | 'high' | null;
  source?: 'template' | 'custom' | 'imported' | null;
  templateId?: string | null;
  template_id?: string | null;
};

function normalizeGoal(row: ApiGoal, fallbackUserId: string): Goal {
  const status = row.status === 'completed' || row.status === 'archived' ? row.status : 'active';
  const createdAt = row.createdAt ?? row.created_at ?? new Date().toISOString();
  const updatedAt = row.updatedAt ?? row.updated_at ?? createdAt;
  const targetDate = row.deadline ?? row.targetDate ?? row.target_date ?? undefined;

  return {
    id: row.id,
    user_id: row.user_id ?? row.userId ?? fallbackUserId,
    title: row.title,
    description: row.description || undefined,
    category: row.category || undefined,
    deadline: targetDate || undefined,
    progress: Math.min(Math.max(Number(row.progress ?? 0), 0), 100),
    status,
    created_at: createdAt,
    updated_at: updatedAt,
    completed_at: row.completed_at ?? row.completedAt ?? (status === 'completed' ? updatedAt : null),
    priority: row.priority || undefined,
    source: row.source || undefined,
    template_id: row.template_id ?? row.templateId ?? undefined
  };
}

function toApiGoalInput(input: GoalInput) {
  return {
    title: input.title.trim(),
    description: input.description?.trim() || undefined,
    category: input.category || undefined,
    deadline: input.deadline || undefined,
    targetDate: input.deadline || undefined,
    progress: Math.min(Math.max(input.progress ?? 0, 0), 100),
    status: input.progress && input.progress >= 100 ? 'completed' : 'active',
    priority: input.priority,
    source: input.source,
    templateId: input.templateId
  };
}

function toApiGoalUpdate(updates: GoalUpdate) {
  return {
    ...(updates.title !== undefined ? { title: updates.title } : {}),
    ...(updates.description !== undefined ? { description: updates.description } : {}),
    ...(updates.category !== undefined ? { category: updates.category } : {}),
    ...(updates.deadline !== undefined ? { deadline: updates.deadline, targetDate: updates.deadline } : {}),
    ...(updates.progress !== undefined ? { progress: Math.min(Math.max(updates.progress, 0), 100) } : {}),
    ...(updates.status !== undefined ? { status: updates.status } : {}),
    ...(updates.priority !== undefined ? { priority: updates.priority } : {}),
    ...(updates.source !== undefined ? { source: updates.source } : {}),
    ...(updates.template_id !== undefined ? { template_id: updates.template_id } : {})
  };
}

async function requireProductApiToken(getToken: () => Promise<string | null>): Promise<string> {
  const token = await getToken().catch(() => null);
  if (!token) {
    throw new Error('Sign in again to sync goals with Edutu.');
  }
  return token;
}

function goalsReducer(state: { goals: Goal[], isLoading: boolean }, action: GoalsAction): { goals: Goal[], isLoading: boolean } {
  switch (action.type) {
    case 'SET_GOALS':
      return { ...state, goals: action.payload };
    case 'ADD_GOAL':
      return { ...state, goals: [action.payload, ...state.goals] };
    case 'UPDATE_GOAL':
      return {
        ...state,
        goals: state.goals.map((goal) => {
          if (goal.id !== action.payload.id) {
            return goal;
          }

          const nextStatus = action.payload.updates.status ?? goal.status;
          let nextCompletedAt: string | null = goal.completed_at ?? null;

          if (action.payload.updates.completed_at !== undefined) {
            nextCompletedAt = action.payload.updates.completed_at as string | null;
          } else if (nextStatus === 'completed' && !goal.completed_at) {
            nextCompletedAt = new Date().toISOString();
          } else if (nextStatus !== 'completed') {
            nextCompletedAt = null;
          }

          return {
            ...goal,
            ...action.payload.updates,
            status: nextStatus as GoalStatus,
            updated_at: new Date().toISOString(),
            completed_at: nextCompletedAt
          };
        })
      };
    case 'DELETE_GOAL':
      return { ...state, goals: state.goals.filter((goal) => goal.id !== action.payload.id) };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'CLEAR_GOALS':
      return { ...state, goals: [] };
    default:
      return state;
  }
}

export const GoalsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(goalsReducer, { goals: [], isLoading: true });
  const { isSignedIn, userId, getToken } = useAuth();

  const syncGoalAggregate = useCallback(
    (goalsList: Goal[]) => {
      if (!userId) {
        return;
      }

      const completedCount = goalsList.filter((goal) => goal.status === 'completed').length;

      void (async () => {
        try {
          await syncUserGoalSummary(userId, completedCount);
        } catch (error) {
          console.error('Failed to sync aggregated goal analytics', error);
        }
      })();
    },
    [userId]
  );

  const loadGoals = useCallback(async (uid: string) => {
    dispatch({ type: 'SET_LOADING', payload: true });

    try {
      const token = await requireProductApiToken(getToken);
      const response = await productApiRequest<ApiGoal[]>('/goals', token);
      const goals = response.map((goal) => normalizeGoal(goal, uid));

      dispatch({ type: 'SET_GOALS', payload: goals });
      syncGoalAggregate(goals);
    } catch (error) {
      console.error('Error loading goals:', error);
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [getToken, syncGoalAggregate]);

  useEffect(() => {
    if (!isSignedIn || !userId) {
      dispatch({ type: 'SET_GOALS', payload: [] });
      dispatch({ type: 'SET_LOADING', payload: false });
      return;
    }
    void loadGoals(userId);
  }, [isSignedIn, userId, loadGoals]);

  const createGoal = useCallback(async (input: GoalInput): Promise<Goal> => {
    if (!userId) {
      throw new Error('User not authenticated');
    }

    const token = await requireProductApiToken(getToken);
    const createdGoal = normalizeGoal(
      await productApiRequest<ApiGoal>('/goals', token, {
        method: 'POST',
        body: JSON.stringify(toApiGoalInput(input))
      }),
      userId
    );

    dispatch({ type: 'ADD_GOAL', payload: createdGoal });
    const nextGoals = [createdGoal, ...state.goals];
    syncGoalAggregate(nextGoals);
    return createdGoal;
  }, [getToken, userId, state.goals, syncGoalAggregate]);

  const updateGoal = useCallback(async (id: string, updates: GoalUpdate): Promise<void> => {
    if (!userId) {
      throw new Error('User not authenticated');
    }

    const token = await requireProductApiToken(getToken);
    const updatedGoal = normalizeGoal(
      await productApiRequest<ApiGoal>(
        `/goals/${encodeURIComponent(id)}`,
        token,
        {
          method: 'PATCH',
          body: JSON.stringify(toApiGoalUpdate(updates))
        }
      ),
      userId
    );

    dispatch({
      type: 'UPDATE_GOAL',
      payload: {
        id,
        updates: updatedGoal
      }
    });
    const updatedAt = updatedGoal.updated_at;
    const nextGoals = state.goals.map((goal) => {
      if (goal.id !== id) {
        return goal;
      }

      const nextStatus = updatedGoal.status;
      let nextCompletedAt: string | null = goal.completed_at ?? null;

      if (nextStatus === 'completed' && !goal.completed_at) {
        nextCompletedAt = updatedGoal.completed_at ?? updatedAt;
        taskTrackingService.addCompletedTask({
          id: `goal-${id}`,
          title: `Completed goal: ${goal.title}`,
          source: 'goal',
          metadata: {
            goalId: goal.id,
            goalTitle: goal.title
          }
        });
      } else if (nextStatus !== 'completed') {
        nextCompletedAt = null;
      }

      return {
        ...updatedGoal,
        completed_at: nextCompletedAt
      };
    });
    syncGoalAggregate(nextGoals);
  }, [getToken, userId, state.goals, syncGoalAggregate]);

  const deleteGoal = useCallback(async (id: string): Promise<void> => {
    if (!userId) {
      throw new Error('User not authenticated');
    }

    const token = await requireProductApiToken(getToken);
    await productApiRequest<{ success: boolean }>(
      `/goals/${encodeURIComponent(id)}`,
      token,
      { method: 'DELETE' }
    );

    dispatch({ type: 'DELETE_GOAL', payload: { id } });
    const nextGoals = state.goals.filter((goal) => goal.id !== id);
    syncGoalAggregate(nextGoals);
  }, [getToken, userId, state.goals, syncGoalAggregate]);

  const refreshGoals = useCallback(async () => {
    if (!userId) {
      return;
    }
    await loadGoals(userId);
  }, [loadGoals, userId]);

  const clearGoals = useCallback(() => {
    // Only clear local state - don't delete from database as that would be destructive
    dispatch({ type: 'CLEAR_GOALS' });
    syncGoalAggregate([]);
  }, [syncGoalAggregate]);

  const contextValue = useMemo<GoalsContextValue>(
    () => ({
      goals: state.goals,
      isLoading: state.isLoading,
      refreshGoals,
      createGoal,
      updateGoal,
      deleteGoal,
      clearGoals
    }),
    [state.goals, state.isLoading, refreshGoals, createGoal, updateGoal, deleteGoal, clearGoals]
  );

  return <GoalsContext.Provider value={contextValue}>{children}</GoalsContext.Provider>;
};

export function useGoals() {
  const context = useContext(GoalsContext);
  if (!context) {
    throw new Error('useGoals must be used within a GoalsProvider');
  }
  return context;
}
