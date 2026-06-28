import { useState, useCallback, useEffect, useMemo, useReducer } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { toSafeUUID } from '../utils/auth';

export type GoalStatus = 'active' | 'completed' | 'archived';

export interface Goal {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  category?: string;
  deadline?: string;
  progress: number;
  status: GoalStatus;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
  priority?: 'low' | 'medium' | 'high';
  source?: 'template' | 'custom' | 'imported';
  template_id?: string;
  // New fields for roadmap integration
  roadmap_id?: string;
  opportunity_title?: string;
  reminder_enabled?: boolean;
  reminder_date?: string;
  reminder_sent?: boolean;
  notification_id?: string;
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
  roadmap_id?: string;
  opportunity_title?: string;
  reminder_enabled?: boolean;
  reminder_date?: string;
}

interface GoalRoadmapMilestone {
  id: string;
  title: string;
  date: string;
  description?: string;
}

export type GoalUpdate = Partial<Omit<Goal, 'id' | 'user_id' | 'created_at'>>;

interface GoalsState {
  goals: Goal[];
  isLoading: boolean;
}

type GoalsAction =
  | { type: 'SET_GOALS'; payload: Goal[] }
  | { type: 'ADD_GOAL'; payload: Goal }
  | { type: 'UPDATE_GOAL'; payload: { id: string; updates: GoalUpdate } }
  | { type: 'DELETE_GOAL'; payload: { id: string } }
  | { type: 'SET_LOADING'; payload: boolean };

function goalsReducer(state: GoalsState, action: GoalsAction): GoalsState {
  switch (action.type) {
    case 'SET_GOALS':
      return { ...state, goals: action.payload };
    case 'ADD_GOAL':
      return { ...state, goals: [action.payload, ...state.goals] };
    case 'UPDATE_GOAL':
      return {
        ...state,
        goals: state.goals.map((goal) => {
          if (goal.id !== action.payload.id) return goal;
          return { ...goal, ...action.payload.updates, updated_at: new Date().toISOString() };
        })
      };
    case 'DELETE_GOAL':
      return { ...state, goals: state.goals.filter((goal) => goal.id !== action.payload.id) };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    default:
      return state;
  }
}

interface UseGoalsOptions {
  onGoalCreated?: (goal: Goal) => void;
  onGoalUpdated?: (goal: Goal) => void;
  onGoalDeleted?: (id: string) => void;
}

function getUserLookupIds(userId: string): string[] {
  return Array.from(new Set([userId, toSafeUUID(userId)]));
}

export function useGoals(supabase: SupabaseClient, userId: string | null, options?: UseGoalsOptions) {
  const [state, dispatch] = useReducer(goalsReducer, { goals: [], isLoading: true });

  const loadGoals = useCallback(async () => {
    if (!userId) return;

    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const { data, error } = await supabase
        .from('goals')
        .select('*')
        .in('user_id', getUserLookupIds(userId))
        .order('created_at', { ascending: false });

      if (error) throw error;
      dispatch({ type: 'SET_GOALS', payload: data as Goal[] });
    } catch (error: any) {
      console.error('Error loading goals:', error);
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [supabase, userId]);

  const createGoal = useCallback(async (input: GoalInput): Promise<Goal> => {
    if (!userId) throw new Error('User not authenticated');

    const now = new Date().toISOString();
    const newGoalData = {
      user_id: userId,
      title: input.title.trim(),
      description: input.description?.trim(),
      category: input.category,
      deadline: input.deadline,
      progress: input.progress ?? 0,
      status: (input.progress ?? 0) >= 100 ? 'completed' : 'active',
      created_at: now,
      updated_at: now,
      completed_at: (input.progress ?? 0) >= 100 ? now : null,
      priority: input.priority,
      source: input.source,
      template_id: input.templateId,
      roadmap_id: input.roadmap_id,
      opportunity_title: input.opportunity_title,
      reminder_enabled: input.reminder_enabled ?? false,
      reminder_date: input.reminder_date,
      reminder_sent: false,
    };

    const { data, error } = await supabase
      .from('goals')
      .insert([newGoalData])
      .select()
      .single();

    if (error) throw error;

    const createdGoal = data as Goal;
    dispatch({ type: 'ADD_GOAL', payload: createdGoal });
    options?.onGoalCreated?.(createdGoal);
    return createdGoal;
  }, [supabase, userId]);

  const updateGoal = useCallback(async (id: string, updates: GoalUpdate): Promise<void> => {
    if (!userId) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('goals')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .in('user_id', getUserLookupIds(userId));

    if (error) throw error;

    const updatedGoal = state.goals.find(g => g.id === id);
    if (updatedGoal) {
      const g = { ...updatedGoal, ...updates };
      dispatch({ type: 'UPDATE_GOAL', payload: { id, updates } });
      options?.onGoalUpdated?.(g);
    }
  }, [supabase, userId]);

  const deleteGoal = useCallback(async (id: string): Promise<void> => {
    if (!userId) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('goals')
      .delete()
      .eq('id', id)
      .in('user_id', getUserLookupIds(userId));

    if (error) throw error;

    dispatch({ type: 'DELETE_GOAL', payload: { id } });
    options?.onGoalDeleted?.(id);
  }, [supabase, userId]);

  // Import goals from a roadmap
  const importFromRoadmap = useCallback(async (
    roadmapId: string,
    roadmapTitle: string,
    milestones: GoalRoadmapMilestone[]
  ): Promise<Goal[]> => {
    if (!userId) throw new Error('User not authenticated');

    const now = new Date().toISOString();
    const goalsToCreate = milestones.map((milestone, index) => ({
      user_id: userId,
      title: milestone.title,
      description: milestone.description || '',
      category: roadmapTitle,
      deadline: milestone.date || null,
      progress: 0,
      status: 'active' as GoalStatus,
      created_at: now,
      updated_at: now,
      completed_at: null,
      priority: index === 0 ? 'high' : 'medium',
      source: 'imported' as const,
      template_id: roadmapId,
      reminder_enabled: !!milestone.date,
      reminder_date: milestone.date || null,
      reminder_sent: false,
    }));

    const { data, error } = await supabase
      .from('goals')
      .insert(goalsToCreate)
      .select();

    if (error) throw error;

    const createdGoals = data as Goal[];
    createdGoals.forEach(goal => dispatch({ type: 'ADD_GOAL', payload: goal }));
    return createdGoals;
  }, [supabase, userId]);

  // Enable/disable reminder for a goal
  const toggleReminder = useCallback(async (goalId: string, enabled: boolean, reminderDate?: string): Promise<void> => {
    if (!userId) throw new Error('User not authenticated');

    const updates = {
      reminder_enabled: enabled,
      reminder_date: enabled ? reminderDate : null,
      reminder_sent: false,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('goals')
      .update(updates)
      .eq('id', goalId)
      .in('user_id', getUserLookupIds(userId));

    if (error) throw error;
    dispatch({ type: 'UPDATE_GOAL', payload: { id: goalId, updates } as any });
  }, [supabase, userId]);

  // Get goals that need reminders (for notification system)
  const getGoalsWithReminders = useCallback(async (): Promise<Goal[]> => {
    if (!userId) return [];

    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .in('user_id', getUserLookupIds(userId))
      .eq('reminder_enabled', true)
      .eq('reminder_sent', false)
      .lte('reminder_date', new Date().toISOString())
      .eq('status', 'active');

    if (error) throw error;
    return data as Goal[];
  }, [supabase, userId]);

  // Mark reminder as sent
  const markReminderSent = useCallback(async (goalId: string): Promise<void> => {
    if (!userId) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('goals')
      .update({ reminder_sent: true, updated_at: new Date().toISOString() })
      .eq('id', goalId)
      .in('user_id', getUserLookupIds(userId));

    if (error) throw error;
    dispatch({ type: 'UPDATE_GOAL', payload: { id: goalId, updates: { reminder_sent: true } } });
  }, [supabase, userId]);

  // Get goals from a specific roadmap
  const getGoalsFromRoadmap = useCallback(async (roadmapId: string): Promise<Goal[]> => {
    if (!userId) return [];

    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .in('user_id', getUserLookupIds(userId))
      .eq('template_id', roadmapId);

    if (error) throw error;
    return data as Goal[];
  }, [supabase, userId]);

  // Get all imported goals (from roadmaps)
  const getImportedGoals = useCallback(async (): Promise<Goal[]> => {
    if (!userId) return [];

    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .in('user_id', getUserLookupIds(userId))
      .eq('source', 'imported')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data as Goal[];
  }, [supabase, userId]);

  // Get custom goals (not from roadmaps)
  const getCustomGoals = useCallback(async (): Promise<Goal[]> => {
    if (!userId) return [];

    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .in('user_id', getUserLookupIds(userId))
      .eq('source', 'custom')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data as Goal[];
  }, [supabase, userId]);

  useEffect(() => {
    if (userId) {
      loadGoals();
    } else {
      dispatch({ type: 'SET_GOALS', payload: [] });
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [userId, loadGoals]);

  return {
    goals: state.goals,
    isLoading: state.isLoading,
    loadGoals,
    createGoal,
    updateGoal,
    deleteGoal,
    importFromRoadmap,
    toggleReminder,
    getGoalsWithReminders,
    markReminderSent,
    getGoalsFromRoadmap,
    getImportedGoals,
    getCustomGoals,
  };
}
