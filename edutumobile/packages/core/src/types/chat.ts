export interface ChatThread {
  id: string;
  title: string | null;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
  metadata?: ChatMessageMetadata | null;
}

export interface ChatOpportunityCard {
  id: string;
  title: string;
  organization?: string | null;
  category?: string | null;
  location?: string | null;
  deadline?: string | null;
  summary?: string | null;
  imageUrl?: string | null;
  applyUrl?: string | null;
  matchScore?: number | null;
  matchReason?: string | null;
}

export type ChatSmartActionType =
  | 'view_opportunity'
  | 'apply_opportunity'
  | 'add_deadline'
  | 'generate_roadmap'
  | 'find_roadmap';

export interface ChatSmartAction {
  id: string;
  type: ChatSmartActionType;
  label: string;
  opportunityId?: string;
  title?: string;
  deadline?: string | null;
  route?: string;
}

export interface ChatMessageMetadata {
  opportunities?: ChatOpportunityCard[];
  smartActions?: ChatSmartAction[];
  optimistic?: boolean;
  intent?: 'opportunity_search' | 'career_guidance' | 'study_help' | 'general';
}

export interface SendChatMessageResult {
  threadId: string;
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  usage?: {
    total_tokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
  } | null;
}
