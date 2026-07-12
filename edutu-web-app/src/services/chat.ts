import { productApiRequest } from './productApi';

export interface OpportunityCard {
  id: string;
  title: string;
  organization: string | null;
  category: string | null;
  location: string | null;
  deadline: string | null;
  summary: string | null;
  imageUrl: string | null;
  applyUrl: string | null;
  matchScore: number | null;
  matchReason: string | null;
}

export interface SmartAction {
  id: string;
  type:
    | 'view_opportunity'
    | 'apply_opportunity'
    | 'add_deadline'
    | 'generate_roadmap'
    | 'find_roadmap';
  label: string;
  opportunityId?: string;
  title?: string;
  deadline?: string | null;
  route?: string;
}

/** One-tap follow-up produced by an agent tool (rendered as chips under the reply). */
export interface ChatActionButton {
  id: string;
  kind:
    | 'view_opportunity'
    | 'create_roadmap'
    | 'create_goals'
    | 'spin_again'
    | 'open_route';
  label: string;
  payload: Record<string, unknown>;
}

/** Device-side effect for the mobile app (calendar/notifications) — ignored on web. */
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
  intent?: string;
  opportunities?: OpportunityCard[];
  smartActions?: SmartAction[];
  actionButtons?: ChatActionButton[];
  deviceActions?: ChatDeviceAction[];
  documents?: ChatDocumentCard[];
  images?: ChatImageCard[];
  [key: string]: unknown;
}

export interface ChatThread {
  id: string;
  title: string | null;
  updated_at: string;
  last_message_at?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
  metadata?: ChatMessageMetadata | null;
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

export async function fetchChatThreads(token: string): Promise<ChatThread[]> {
  const response = await productApiRequest<{ threads?: ChatThread[] }>(
    '/chat/threads',
    token,
  );

  return response.threads ?? [];
}

export async function fetchChatMessages(
  threadId: string,
  token: string,
): Promise<ChatMessage[]> {
  const response = await productApiRequest<{ messages?: ChatMessage[] }>(
    `/chat/threads/${encodeURIComponent(threadId)}/messages`,
    token,
  );

  return response.messages ?? [];
}

export async function deleteChatThread(threadId: string, token: string) {
  await productApiRequest<{ success: true }>(
    `/chat/threads/${encodeURIComponent(threadId)}`,
    token,
    { method: 'DELETE' },
  );
}

export async function sendChatMessage(
  options: { threadId?: string | null; message: string },
  token: string,
): Promise<SendChatMessageResult> {
  return productApiRequest<SendChatMessageResult>('/chat/messages', token, {
    method: 'POST',
    body: JSON.stringify({
      threadId: options.threadId,
      message: options.message,
    }),
  });
}

export interface DocumentExportResult {
  fileName: string;
  url: string;
  format: 'pdf' | 'docx';
}

export async function exportChatDocument(
  docId: string,
  format: 'pdf' | 'docx',
  token: string,
): Promise<DocumentExportResult> {
  return productApiRequest<DocumentExportResult>(
    `/documents/${encodeURIComponent(docId)}/export`,
    token,
    { method: 'POST', body: JSON.stringify({ format }) },
  );
}
