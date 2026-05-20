export type SupportTicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export interface SupportTicketRecord {
  id: string;
  userId: string;
  userEmail: string;
  subject: string;
  status: SupportTicketStatus;
  lastUpdated: Date;
}

export interface SupportTicketMessage {
  id: string;
  sender: 'user' | 'admin' | 'system';
  text: string;
  timestamp: Date;
}
