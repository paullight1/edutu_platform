import React, { FormEvent, useEffect, useState } from 'react';

export interface TicketMessage {
  sender: string;
  message: string;
  createdAt?: Date;
}

export interface SupportTicket {
  id: string;
  userEmail: string;
  subject: string;
  category?: string;
  status: 'open' | 'resolved';
  createdAt?: Date;
  messages: TicketMessage[];
}

interface TicketModalProps {
  isOpen: boolean;
  ticket: SupportTicket | null;
  onClose: () => void;
  onReply: (message: string) => Promise<void> | void;
  onMarkResolved: () => Promise<void> | void;
  loading?: boolean;
}

const TicketModal: React.FC<TicketModalProps> = ({
  isOpen,
  ticket,
  onClose,
  onReply,
  onMarkResolved,
  loading = false
}) => {
  const [reply, setReply] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setReply('');
      setLocalError(null);
    }
  }, [isOpen]);

  if (!isOpen || !ticket) {
    return null;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reply.trim()) {
      setLocalError('Please provide a response before sending.');
      return;
    }
    setLocalError(null);
    await onReply(reply.trim());
    setReply('');
  };

  const humanReadableDate = (value?: Date) => {
    if (!value) {
      return 'Unknown date';
    }
    return value.toLocaleString();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8">
      <div className="flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <header className="border-b border-gray-200 px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs tracking-wide text-gray-500">{ticket.category || 'General'}</p>
              <h2 className="mt-1 text-lg font-semibold text-gray-900">{ticket.subject}</h2>
              <p className="text-sm text-gray-500">
                {ticket.userEmail} • {humanReadableDate(ticket.createdAt)}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-gray-200 px-3 py-1 text-sm font-medium text-gray-600 transition hover:bg-gray-100"
            >
              Close
            </button>
          </div>
        </header>

        <section className="flex-1 overflow-y-auto px-6 py-4">
          <h3 className="text-sm font-semibold text-gray-800">Conversation</h3>
          <div className="mt-3 space-y-3">
            {ticket.messages.length === 0 && (
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                No messages yet. Reply to start the conversation.
              </div>
            )}
            {ticket.messages.map((message, index) => (
              <div
                key={`${ticket.id}-message-${index}`}
                className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-800">{message.sender}</span>
                  <span className="text-xs text-gray-500">{humanReadableDate(message.createdAt)}</span>
                </div>
                <p className="mt-2 text-gray-700">{message.message}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className="border-t border-gray-200 bg-gray-50 px-6 py-4">
          <form onSubmit={handleSubmit} className="space-y-3">
            {localError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{localError}</div>
            )}
            <textarea
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              placeholder="Write your response. Markdown is optional."
              rows={4}
              className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={async () => {
                  await onMarkResolved();
                }}
                className="rounded-xl border border-emerald-200 px-4 py-2 text-sm font-medium text-emerald-600 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={loading || ticket.status === 'resolved'}
              >
                Mark as resolved
              </button>

              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading && (
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                )}
                Send reply
              </button>
            </div>
          </form>
        </footer>
      </div>
    </div>
  );
};

export default TicketModal;
