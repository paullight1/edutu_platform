// Service to handle support tickets with Supabase
import { supabase } from '../lib/supabaseClient';

export interface SupportTicketInput {
  userId: string;
  subject: string;
  message: string;
  userEmail?: string;
  category?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  metadata?: Record<string, unknown>;
}

export interface SupportTicketReplyInput {
  ticketId: string;
  message: string;
  sender: 'user' | 'agent' | 'system';
}

export async function createSupportTicket(payload: SupportTicketInput) {
  const { data, error } = await supabase
    .from('support_tickets')
    .insert({
      user_id: payload.userId,
      subject: payload.subject,
      description: payload.message,
      category: payload.category || 'General',
      priority: payload.priority || 'medium',
      metadata: {
        user_email: payload.userEmail,
        ...payload.metadata
      }
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating support ticket:', error);
    throw error;
  }

  // Create initial message
  const { error: messageError } = await supabase
    .from('support_messages')
    .insert({
      ticket_id: data.id,
      author_id: payload.userId,
      role: 'user',
      message: payload.message
    });

  if (messageError) {
    console.error('Error creating initial ticket message:', messageError);
  }

  return data.id;
}

export async function appendSupportTicketMessage(userId: string, payload: SupportTicketReplyInput) {
  if (!userId) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('support_messages')
    .insert({
      ticket_id: payload.ticketId,
      author_id: userId,
      role: payload.sender,
      message: payload.message
    });

  if (error) {
    console.error('Error appending message to ticket:', error);
    throw error;
  }

  return { success: true };
}

export async function fetchUserTickets(userId: string) {
  if (!userId) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('support_tickets')
    .select('*, support_messages(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching tickets:', error);
    throw error;
  }

  return data;
}