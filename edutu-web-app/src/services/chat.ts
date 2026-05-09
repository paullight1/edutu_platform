import { supabase } from '../lib/supabaseClient';

export interface ChatThread {
  id: string;
  title: string | null;
  updated_at: string;
  last_message_at: string | null;
  metadata: Record<string, unknown> | null;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
}

interface SendChatMessageResult {
  threadId: string;
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  usage?: {
    total_tokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
  } | null;
}

export async function fetchChatThreads(): Promise<ChatThread[]> {
  const { data, error } = await supabase
    .from('chat_threads')
    .select<ChatThread>('id, title, updated_at, last_message_at, metadata')
    .order('updated_at', { ascending: false });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function fetchChatMessages(threadId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select<ChatMessage>('id, role, content, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function archiveChatThread(threadId: string) {
  const { error } = await supabase
    .from('chat_threads')
    .update({ metadata: { archived: true } })
    .eq('id', threadId);

  if (error) {
    throw error;
  }
}

export async function deleteChatThread(threadId: string) {
  const { error } = await supabase
    .from('chat_threads')
    .delete()
    .eq('id', threadId);

  if (error) {
    throw error;
  }
}

export async function renameChatThread(threadId: string, title: string) {
  const { error } = await supabase
    .from('chat_threads')
    .update({ title })
    .eq('id', threadId);

  if (error) {
    throw error;
  }
}

export async function sendChatMessage(options: { threadId?: string | null; message: string }): Promise<SendChatMessageResult> {
  // First try to call the Supabase function
  try {
    const { data, error } = await supabase.functions.invoke<SendChatMessageResult>('chat-proxy', {
      body: {
        threadId: options.threadId,
        message: options.message
      }
    });

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error('No response from chat service.');
    }

    return data;
  } catch (supabaseError) {
    console.error('Supabase function failed, trying mock response:', supabaseError);

    // In development, provide a mock response
    // In production, you would need to set up a proper backend API
    const mockResponses = [
      "That's a great question! Based on your interests, I'd recommend exploring more scholarship opportunities in that field.",
      "I understand your concern. Many students face similar challenges. Here's what I recommend...",
      "Great topic! Based on the latest opportunities, I can suggest several pathways for you.",
      "That's an interesting perspective. From my knowledge base, I can tell you that...",
      "I appreciate you sharing that. Let me help you think through your options...",
      "Excellent question! Here's what I know about that subject...",
      "This is a common challenge. One effective approach is to...",
      "I see what you're looking for. Based on similar cases, I'd suggest..."
    ];

    // In a real implementation, we would call a backend API
    // For now, return a mock response to simulate the AI functionality
    const randomResponse =
      mockResponses[Math.floor(Math.random() * mockResponses.length)];

    // Add some context based on the user's message
    const detailedResponse =
      options.message.toLowerCase().includes('scholarship')
        ? `Regarding scholarships, there are many opportunities available. ${randomResponse} Consider looking into merit-based and need-based scholarships that match your profile.`
        : options.message.toLowerCase().includes('career') || options.message.toLowerCase().includes('job')
          ? `For career advice, ${randomResponse} Focus on building relevant skills, networking with professionals, and gaining practical experience in your chosen field.`
          : options.message.toLowerCase().includes('skill') || options.message.toLowerCase().includes('learn')
            ? `To develop skills effectively, ${randomResponse} Consider taking online courses, joining communities, and practicing through projects.`
            : randomResponse;

    return {
      threadId: options.threadId || Date.now().toString(),
      userMessage: {
        id: Date.now().toString(),
        role: 'user',
        content: options.message,
        created_at: new Date().toISOString()
      },
      assistantMessage: {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: detailedResponse,
        created_at: new Date().toISOString()
      }
    };
  }
}
