// src/types/supabase.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      analytics: {
        Row: {
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
          active_dates: string[]; // date array
          last_active_on: string | null; // date
          last_event_at: string | null; // timestamp
          last_goal_completed_at: string | null; // timestamp
          last_opportunity_explored_at: string | null; // timestamp
          last_chat_session_at: string | null; // timestamp
          metadata: Json;
          created_at: string; // timestamp
          updated_at: string; // timestamp
        };
        Insert: {
          id?: string;
          user_id: string;
          opportunities_explored?: number;
          chat_sessions?: number;
          active_dates?: string[];
          goals_created?: number;
          goals_completed?: number;
          active_goals?: number;
          total_progress?: number;
          current_streak?: number;
          longest_streak?: number;
          last_active_on?: string | null;
          last_event_at?: string | null;
          last_goal_completed_at?: string | null;
          last_opportunity_explored_at?: string | null;
          last_chat_session_at?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          opportunities_explored?: number;
          chat_sessions?: number;
          active_dates?: string[];
          goals_created?: number;
          goals_completed?: number;
          active_goals?: number;
          total_progress?: number;
          current_streak?: number;
          longest_streak?: number;
          last_active_on?: string | null;
          last_event_at?: string | null;
          last_goal_completed_at?: string | null;
          last_opportunity_explored_at?: string | null;
          last_chat_session_at?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
      analytics_events: {
        Row: {
          id: number;
          user_id: string | null;
          goal_id: string | null;
          event_name: string;
          source: 'system' | 'user' | 'automation' | 'import';
          context: string | null;
          session_id: string | null;
          event_properties: Json;
          occurred_at: string; // timestamp
          created_at: string; // timestamp
        };
        Insert: {
          id?: number;
          user_id?: string | null;
          goal_id?: string | null;
          event_name: string;
          source?: 'system' | 'user' | 'automation' | 'import';
          context?: string | null;
          session_id?: string | null;
          event_properties?: Json;
          occurred_at?: string;
          created_at?: string;
        };
        Update: {
          id?: number;
          user_id?: string | null;
          goal_id?: string | null;
          event_name?: string;
          source?: 'system' | 'user' | 'automation' | 'import';
          context?: string | null;
          session_id?: string | null;
          event_properties?: Json;
          occurred_at?: string;
          created_at?: string;
        };
      };
      analytics_snapshots: {
        Row: {
          id: string;
          snapshot_type: 'users' | 'opportunities' | 'ai' | 'goals' | 'engagement';
          timeframe: '1d' | '7d' | '14d' | '30d' | '90d' | 'all';
          metrics: Json;
          generated_at: string; // timestamp
          source: 'system' | 'user' | 'automation' | 'import';
          created_by: string | null;
          notes: string | null;
        };
        Insert: {
          id?: string;
          snapshot_type: 'users' | 'opportunities' | 'ai' | 'goals' | 'engagement';
          timeframe?: '1d' | '7d' | '14d' | '30d' | '90d' | 'all';
          metrics?: Json;
          generated_at?: string;
          source?: 'system' | 'user' | 'automation' | 'import';
          created_by?: string | null;
          notes?: string | null;
        };
        Update: {
          id?: string;
          snapshot_type?: 'users' | 'opportunities' | 'ai' | 'goals' | 'engagement';
          timeframe?: '1d' | '7d' | '14d' | '30d' | '90d' | 'all';
          metrics?: Json;
          generated_at?: string;
          source?: 'system' | 'user' | 'automation' | 'import';
          created_by?: string | null;
          notes?: string | null;
        };
      };
      cv_records: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          file_name: string;
          file_size: number;
          mime_type: string;
          uploaded_at: string; // timestamp
          text_content: string;
          stats: Json;
          job_target: string | null;
          job_description: string | null;
          analysis: Json | null;
          optimization: Json | null;
          generated: boolean;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          file_name: string;
          file_size?: number;
          mime_type?: string;
          uploaded_at?: string;
          text_content: string;
          stats: Json;
          job_target?: string | null;
          job_description?: string | null;
          analysis?: Json | null;
          optimization?: Json | null;
          generated?: boolean;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          file_name?: string;
          file_size?: number;
          mime_type?: string;
          uploaded_at?: string;
          text_content?: string;
          stats?: Json;
          job_target?: string | null;
          job_description?: string | null;
          analysis?: Json | null;
          optimization?: Json | null;
          generated?: boolean;
        };
      };
      goal_daily_metrics: {
        Row: {
          id: number;
          user_id: string;
          metric_date: string; // date
          goals_created: number;
          goals_completed: number;
          goals_archived: number;
          active_goal_delta: number;
          progress_updates: number;
          progress_delta: number;
          last_event_at: string | null; // timestamp
          metadata: Json;
          created_at: string; // timestamp
          updated_at: string; // timestamp
        };
        Insert: {
          id?: number;
          user_id: string;
          metric_date: string;
          goals_created?: number;
          goals_completed?: number;
          goals_archived?: number;
          active_goal_delta?: number;
          progress_updates?: number;
          progress_delta?: number;
          last_event_at?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          user_id?: string;
          metric_date?: string;
          goals_created?: number;
          goals_completed?: number;
          goals_archived?: number;
          active_goal_delta?: number;
          progress_updates?: number;
          progress_delta?: number;
          last_event_at?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
      goal_progress_entries: {
        Row: {
          id: string;
          goal_id: string;
          user_id: string;
          progress: number;
          progress_delta: number;
          note: string | null;
          source: 'system' | 'user' | 'automation' | 'import';
          context: Json;
          created_at: string; // timestamp
        };
        Insert: {
          id?: string;
          goal_id: string;
          user_id: string;
          progress: number;
          progress_delta?: number;
          note?: string | null;
          source?: 'system' | 'user' | 'automation' | 'import';
          context?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          goal_id?: string;
          user_id?: string;
          progress?: number;
          progress_delta?: number;
          note?: string | null;
          source?: 'system' | 'user' | 'automation' | 'import';
          context?: Json;
          created_at?: string;
        };
      };
      opportunity_applications: {
        Row: {
          id: string;
          user_id: string;
          opportunity_id: string;
          opportunity_title: string;
          opportunity_category: string;
          status: string;
          applied_at: string;
          notes: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          opportunity_id: string;
          opportunity_title: string;
          opportunity_category: string;
          status?: string;
          applied_at?: string;
          notes?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          opportunity_id?: string;
          opportunity_title?: string;
          opportunity_category?: string;
          status?: string;
          applied_at?: string;
          notes?: string | null;
        };
      };
      goals: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          description: string | null;
          category: string | null;
          deadline: string | null; // date
          progress: number;
          status: string; // 'active' | 'completed' | 'archived'
          created_at: string; // timestamp
          updated_at: string; // timestamp
          completed_at: string | null; // timestamp
          priority: string | null; // 'low' | 'medium' | 'high'
          source: string | null; // 'template' | 'custom' | 'imported'
          template_id: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          description?: string | null;
          category?: string | null;
          deadline?: string | null;
          progress?: number;
          status?: string;
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
          priority?: string | null;
          source?: string | null;
          template_id?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          description?: string | null;
          category?: string | null;
          deadline?: string | null;
          progress?: number;
          status?: string;
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
          priority?: string | null;
          source?: string | null;
          template_id?: string | null;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

// Define specific types for our application
export interface Goal {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  category?: string;
  deadline?: string; // date string
  progress: number;
  status: 'active' | 'completed' | 'archived';
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
  priority?: 'low' | 'medium' | 'high';
  source?: 'template' | 'custom' | 'imported';
  template_id?: string;
}

export interface Analytics {
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
  active_dates: string[]; // date array
  last_active_on: string | null;
  last_event_at: string | null;
  last_goal_completed_at: string | null;
  last_opportunity_explored_at: string | null;
  last_chat_session_at: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
}

export interface CvRecord {
  id: string;
  user_id: string;
  title: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  uploaded_at: string;
  text_content: string;
  stats: any; // This would be more specifically typed based on your CvStats interface
  job_target?: string;
  job_description?: string;
  analysis?: any; // This would be more specifically typed based on your AtsReport interface
  optimization?: any; // This would be more specifically typed based on your OptimizationResult interface
  generated: boolean;
}

export type AnalyticsSource = 'system' | 'user' | 'automation' | 'import';

export interface GoalProgressEntry {
  id: string;
  goal_id: string;
  user_id: string;
  progress: number;
  progress_delta: number;
  note?: string | null;
  source: AnalyticsSource;
  context: Json;
  created_at: string;
}

export interface GoalDailyMetric {
  id: number;
  user_id: string;
  metric_date: string;
  goals_created: number;
  goals_completed: number;
  goals_archived: number;
  active_goal_delta: number;
  progress_updates: number;
  progress_delta: number;
  last_event_at?: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
}

export interface AnalyticsEvent {
  id: number;
  user_id: string | null;
  goal_id: string | null;
  event_name: string;
  source: AnalyticsSource;
  context?: string | null;
  session_id?: string | null;
  event_properties: Json;
  occurred_at: string;
  created_at: string;
}

export interface AnalyticsSnapshot {
  id: string;
  snapshot_type: 'users' | 'opportunities' | 'ai' | 'goals' | 'engagement';
  timeframe: '1d' | '7d' | '14d' | '30d' | '90d' | 'all';
  metrics: Json;
  generated_at: string;
  source: AnalyticsSource;
  created_by?: string | null;
  notes?: string | null;
}
