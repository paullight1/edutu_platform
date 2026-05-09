// Mock hook to replace Firebase support tickets functionality
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SupportTicketMessage, SupportTicketRecord, SupportTicketStatus } from '../types/support';

// Mock data for demonstration
const mockTickets: SupportTicketRecord[] = [
  {
    id: '1',
    userId: 'user1',
    userEmail: 'user@example.com',
    subject: 'Help with roadmap',
    status: 'open',
    lastUpdated: new Date()
  },
  {
    id: '2',
    userId: 'user2',
    userEmail: 'user2@example.com',
    subject: 'Feature request',
    status: 'resolved',
    lastUpdated: new Date(Date.now() - 24 * 60 * 60 * 1000) // 1 day ago
  }
];

interface SupportTicketsState {
  tickets: SupportTicketRecord[];
  loading: boolean;
  error: string | null;
}

export function useSupportTickets() {
  const [state, setState] = useState<SupportTicketsState>({
    tickets: [],
    loading: true,
    error: null
  });
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    // Simulate loading data
    setTimeout(() => {
      setState({
        tickets: mockTickets,
        loading: false,
        error: null
      });
    }, 500);
  }, []);

  const refresh = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true }));
    // Simulate refreshing data
    setTimeout(() => {
      setState({
        tickets: mockTickets,
        loading: false,
        error: null
      });
    }, 300);
  }, []);

  const getMessages = useCallback(async (ticketId: string): Promise<SupportTicketMessage[]> => {
    // Return mock messages
    if (ticketId === '1') {
      return [
        {
          id: 'msg1',
          sender: 'user',
          text: 'I need help with creating a roadmap',
          timestamp: new Date()
        },
        {
          id: 'msg2',
          sender: 'admin',
          text: 'Sure, I can help with that. What specific area are you interested in?',
          timestamp: new Date()
        }
      ];
    }
    return [];
  }, []);

  const sendReply = useCallback(async (ticketId: string, message: string) => {
    if (!message.trim()) {
      throw new Error('Message cannot be empty.');
    }
    console.log(`Sending reply to ticket ${ticketId}:`, message);
    // Simulate sending reply
    return { success: true };
  }, []);

  const setStatus = useCallback(async (ticketId: string, status: SupportTicketStatus) => {
    console.log(`Setting status for ticket ${ticketId}:`, status);
    // Simulate updating status
    return { success: true };
  }, []);

  const openTickets = useMemo(
    () => state.tickets.filter((ticket) => ticket.status === 'open').length,
    [state.tickets]
  );

  return {
    tickets: state.tickets,
    loading: state.loading,
    error: state.error,
    refresh,
    getMessages,
    sendReply,
    setStatus,
    actionLoading,
    openTickets
  };
}

export default useSupportTickets;