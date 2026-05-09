import React, { useEffect, useState } from 'react';
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '../../ui/Drawer';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/Table';
import Badge from '../../ui/Badge';
import Textarea from '../../ui/Textarea';
import { useToast } from '../../ui/ToastProvider';
import useSupportTickets, {
  type SupportTicketMessage,
  type SupportTicketRecord,
  type SupportTicketStatus
} from '../../../hooks/useSupportTickets';

const formatDate = (date: Date | null) => {
  if (!date) {
    return 'Pending';
  }
  return date.toLocaleString();
};

interface SupportTicketsProps {
  onOpenCountChange?: (count: number) => void;
}

const SupportTickets: React.FC<SupportTicketsProps> = ({ onOpenCountChange }) => {
  const { toast } = useToast();
  const { tickets, loading, error, getMessages, sendReply, setStatus, actionLoading, openTickets } =
    useSupportTickets();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicketRecord | null>(null);
  const [messages, setMessages] = useState<SupportTicketMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [reply, setReply] = useState('');

  useEffect(() => {
    onOpenCountChange?.(openTickets);
  }, [openTickets, onOpenCountChange]);

  const openTicketDrawer = async (ticket: SupportTicketRecord) => {
    setSelectedTicket(ticket);
    setDrawerOpen(true);
    setMessagesLoading(true);
    try {
      const history = await getMessages(ticket.id);
      setMessages(history);
    } catch (err) {
      console.error('Failed to load ticket messages', err);
      toast({
        title: 'Unable to load messages',
        description: err instanceof Error ? err.message : 'Conversation history unavailable.',
        variant: 'error'
      });
    } finally {
      setMessagesLoading(false);
    }
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setSelectedTicket(null);
    setReply('');
    setMessages([]);
  };

  const handleReply = async () => {
    if (!selectedTicket) {
      return;
    }
    if (!reply.trim()) {
      toast({
        title: 'Add a reply',
        description: 'Please enter a message before sending.',
        variant: 'error'
      });
      return;
    }

    try {
      await sendReply(selectedTicket.id, reply);
      setReply('');
      const history = await getMessages(selectedTicket.id);
      setMessages(history);
      toast({
        title: 'Reply sent',
        description: 'Learner will be notified of your response.',
        variant: 'success'
      });
    } catch (err) {
      toast({
        title: 'Reply failed',
        description: err instanceof Error ? err.message : 'Unable to send reply at this time.',
        variant: 'error'
      });
    }
  };

  const handleStatusChange = async (status: SupportTicketStatus) => {
    if (!selectedTicket) {
      return;
    }

    try {
      await setStatus(selectedTicket.id, status);
      toast({
        title: status === 'resolved' ? 'Ticket resolved' : 'Ticket reopened',
        description: status === 'resolved' ? 'Marked as complete.' : 'Ticket moved back to the open queue.',
        variant: 'success'
      });
      setSelectedTicket((previous) => (previous ? { ...previous, status } : previous));
    } catch (err) {
      toast({
        title: 'Status update failed',
        description: err instanceof Error ? err.message : 'Unable to update ticket status.',
        variant: 'error'
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Support tickets</h3>
          <p className="text-sm text-gray-500">Respond to learners and keep the queue under 24 hours.</p>
        </div>
        <Badge variant="outline">
          {openTickets} open / {tickets.length} total
        </Badge>
      </div>
      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {error}
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-sm text-gray-500">
                Loading support tickets...
              </TableCell>
            </TableRow>
          )}
          {!loading && tickets.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-sm text-gray-500">
                Inbox is clear. Great job staying responsive!
              </TableCell>
            </TableRow>
          )}
          {!loading &&
            tickets.map((ticket) => (
              <TableRow key={ticket.id} onClick={() => void openTicketDrawer(ticket)} className="cursor-pointer">
                <TableCell>{ticket.userEmail ?? ticket.userId}</TableCell>
                <TableCell>{ticket.subject}</TableCell>
                <TableCell>
                  <Badge variant={ticket.status === 'resolved' ? 'success' : 'default'}>
                    {ticket.status === 'resolved' ? 'Resolved' : 'Open'}
                  </Badge>
                </TableCell>
                <TableCell>{formatDate(ticket.lastUpdated)}</TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>

      <Drawer open={drawerOpen} onOpenChange={(open) => (open ? undefined : closeDrawer())}>
        <DrawerContent>
          {selectedTicket && (
            <>
              <DrawerHeader>
                <DrawerTitle>{selectedTicket.subject}</DrawerTitle>
                <DrawerDescription>
                  Ticket opened by {selectedTicket.userEmail ?? selectedTicket.userId}. Last updated{' '}
                  {formatDate(selectedTicket.lastUpdated)}.
                </DrawerDescription>
              </DrawerHeader>

              <div className="mt-6 space-y-4">
                {messagesLoading && (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">
                    Loading conversation...
                  </div>
                )}
                {!messagesLoading && messages.length === 0 && (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">
                    No messages yet. Reply to start the conversation.
                  </div>
                )}
                <div className="space-y-3">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`rounded-xl border px-3 py-2 text-sm ${
                        message.sender === 'admin'
                          ? 'border-primary/30 bg-primary/5 text-gray-900'
                          : 'border-gray-200 bg-white text-gray-700'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>{message.sender === 'admin' ? 'Edutu Support' : 'Learner'}</span>
                        <span>{message.timestamp ? message.timestamp.toLocaleString() : 'Pending'}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-line text-sm">{message.text}</p>
                    </div>
                  ))}
                </div>
              </div>

              <DrawerFooter>
                <div className="space-y-3">
                  <Textarea
                    rows={4}
                    placeholder="Draft your reply..."
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void handleStatusChange('open')}
                        className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={actionLoading || selectedTicket.status === 'open'}
                      >
                        Reopen
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleStatusChange('resolved')}
                        className="rounded-xl border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-600 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={actionLoading || selectedTicket.status === 'resolved'}
                      >
                        Mark resolved
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setReply('')}
                        className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100"
                        disabled={actionLoading}
                      >
                        Clear
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleReply()}
                        className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={actionLoading}
                      >
                        {actionLoading ? 'Sending...' : 'Send reply'}
                      </button>
                    </div>
                  </div>
                </div>
              </DrawerFooter>
            </>
          )}
        </DrawerContent>
      </Drawer>
    </div>
  );
};

export default SupportTickets;
