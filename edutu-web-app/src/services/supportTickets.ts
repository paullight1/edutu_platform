import { supabase } from '../lib/supabaseClient';

export interface SupportTicketInput {
  userId: string;
  subject: string;
  message: string;
  userEmail?: string;
  category?: string;
  priority?: 'low' | 'normal' | 'high';
  metadata?: Record<string, unknown>;
}

export interface SupportTicketReplyInput {
  ticketId: string;
  message: string;
  sender: 'user' | 'admin';
}

const mapPriority = (priority: SupportTicketInput['priority']) => {
  if (priority === 'normal' || !priority) return 'medium';
  return priority;
};

const mapSender = (sender: SupportTicketReplyInput['sender']) => {
  return sender === 'admin' ? 'agent' : 'user';
};

export async function createSupportTicket(payload: SupportTicketInput) {
  const subject = payload.subject.trim();
  const message = payload.message.trim();

  if (!payload.userId) {
    throw new Error('Please sign in to submit a support ticket.');
  }

  if (!subject) {
    throw new Error('Subject is required.');
  }

  if (!message) {
    throw new Error('Message cannot be empty.');
  }

  const { data, error } = await supabase
    .from('support_tickets')
    .insert({
      user_id: payload.userId,
      subject,
      description: message,
      category: payload.category || 'General',
      priority: mapPriority(payload.priority),
      metadata: {
        user_email: payload.userEmail,
        ...payload.metadata,
      },
    })
    .select('id')
    .single();

  if (error) {
    throw error;
  }

  const { error: messageError } = await supabase
    .from('support_messages')
    .insert({
      ticket_id: data.id,
      author_id: payload.userId,
      role: 'user',
      message,
    });

  if (messageError) {
    throw messageError;
  }

  return data.id;
}

export async function appendSupportTicketMessage(payload: SupportTicketReplyInput) {
  const message = payload.message.trim();

  if (!message) {
    throw new Error('Message cannot be empty.');
  }

  const { error } = await supabase
    .from('support_messages')
    .insert({
      ticket_id: payload.ticketId,
      role: mapSender(payload.sender),
      message,
    });

  if (error) {
    throw error;
  }

  return { success: true };
}
