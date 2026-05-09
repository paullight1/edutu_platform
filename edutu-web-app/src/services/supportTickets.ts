// TODO: Implement with Supabase (see src/lib/supabaseClient.ts)
// Currently returns mock data

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

export async function createSupportTicket(payload: SupportTicketInput) {
  // Using mock implementation for now
  console.log('Creating support ticket (using mock implementation)');
  const subject = payload.subject.trim();
  const message = payload.message.trim();

  if (!subject) {
    throw new Error('Subject is required.');
  }

  if (!message) {
    throw new Error('Message cannot be empty.');
  }

  // Mock implementation - return a mock ticket ID
  return `mock-ticket-${Date.now()}`;
}

export async function appendSupportTicketMessage(payload: SupportTicketReplyInput) {
  // Using mock implementation for now
  console.log('Appending support ticket message (using mock implementation)');
  const trimmed = payload.message.trim();
  if (!trimmed) {
    throw new Error('Message cannot be empty.');
  }

  // Mock implementation - just return success
  return { success: true };
}