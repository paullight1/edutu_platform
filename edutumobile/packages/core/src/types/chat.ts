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

/** One-tap follow-up produced by an agent tool (rendered as chips under the reply). */
export interface ChatActionButton {
  id: string;
  kind: 'view_opportunity' | 'create_roadmap' | 'create_goals' | 'spin_again' | 'open_route';
  label: string;
  payload: Record<string, unknown>;
}

/** Device-side effect the app executes after an agent action (server can't touch the phone). */
export interface ChatDeviceAction {
  type: 'calendar.sync' | 'notifications.schedule';
  payload: Record<string, unknown>;
}

/** AI document (CV/SOP/…) referenced by an assistant reply — rendered as a card. */
export interface ChatDocumentCard {
  docId: string;
  type: 'cv' | 'sop' | 'cover_letter' | 'essay';
  title: string;
  version: number;
  /** Present right after an export — signed download link (valid ~7 days). */
  url?: string;
  format?: 'pdf' | 'docx';
  fileName?: string;
}

/** Branded share-card image for an opportunity, rendered inline in chat. */
export interface ChatImageCard {
  opportunityId: string;
  title: string;
  url: string;
  format: 'png' | 'svg';
}

export interface ChatMessageMetadata {
  opportunities?: ChatOpportunityCard[];
  smartActions?: ChatSmartAction[];
  actionButtons?: ChatActionButton[];
  deviceActions?: ChatDeviceAction[];
  documents?: ChatDocumentCard[];
  images?: ChatImageCard[];
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
