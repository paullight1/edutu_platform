/**
 * Messages launched from an opportunity ("Ask Edutu") carry the full opportunity
 * context (title, org, deadline, description) so the AI can answer accurately, but
 * the user should only see the short intent — not the raw templated dump. The
 * context is joined onto the intent with this invisible sentinel; the chat UI
 * strips everything from the sentinel onward when rendering the user's bubble.
 */
export const CHAT_CONTEXT_SENTINEL = '⁣⁣EDUTU_CTX⁣⁣';

/** Returns the user-facing portion of a chat message, dropping any hidden context block. */
export function stripChatContext(content: string): string {
  if (!content) return content;
  const idx = content.indexOf(CHAT_CONTEXT_SENTINEL);
  return idx === -1 ? content : content.slice(0, idx).trimEnd();
}

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
