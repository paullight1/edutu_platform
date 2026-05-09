import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Archive,
  ArrowLeft,
  Bot,
  ExternalLink,
  Lightbulb,
  Loader2,
  Mic,
  MicOff,
  MoreHorizontal,
  Plus,
  Paperclip,
  RefreshCw,
  Send,
  Trash2,
  User,
  Zap,
  Brain,
  Sparkles,
  Users,
  ChevronRight,
  X
} from 'lucide-react';
import Button from './ui/Button';
import { useDarkMode } from '../hooks/useDarkMode';
import { useAnalytics } from '../hooks/useAnalytics';
import { supabase } from '../lib/supabaseClient';
import type { AppUser } from '../types/user';
import {
  archiveChatThread as archiveChatThreadService,
  fetchChatMessages as fetchChatMessagesService,
  fetchChatThreads as fetchChatThreadsService,
  sendChatMessage as sendChatMessageService,
} from '../services/chat';

import type {
  ChatMessage as SupabaseChatMessage,
  ChatThread as SupabaseChatThread,
} from '../services/chat';

type MessageActionType = 'scholarship' | 'community' | 'expert' | 'link';

interface Message {
  id: string;
  type: 'user' | 'bot';
  content: string;
  timestamp: Date;
  isTyping?: boolean;
  buttons?: Array<{
    text: string;
    type: MessageActionType;
    data?: Record<string, unknown>;
  }>;
}

interface ChatInterfaceProps {
  user: AppUser | null;
  onBack?: () => void;
}

type IconType = React.ComponentType<{ size?: number; className?: string }>;

interface ChatThread {
  id: string;
  title: string;
  updatedAt: string;
  lastMessageAt?: string | null;
  metadata: Record<string, unknown> | null;
}

const DEFAULT_THREAD_TITLE = 'New conversation';

const welcomeMessage = (name?: string): Message => ({
  id: 'welcome',
  type: 'bot',
  content: `Hi ${name || 'there'}! I am Edutu, your AI opportunity coach. I am here to help you uncover scholarships, build skills, and plan your career. What would you like to explore today?`,
  timestamp: new Date(),
});

const ChatInterface: React.FC<ChatInterfaceProps> = ({ user, onBack }) => {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([welcomeMessage(user?.name)]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isThreadsLoading, setIsThreadsLoading] = useState(false);
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { isDarkMode } = useDarkMode();
  const { recordChatSession } = useAnalytics();
  const hasRecordedSessionRef = useRef(false);

  const quickPrompts = useMemo<Array<{ text: string; icon: IconType; topic: string }>>(
    () => [
      { text: 'Help me find scholarships', icon: Sparkles, topic: 'Scholarships' },
      { text: 'Career guidance', icon: Brain, topic: 'Career growth' },
      { text: 'Skills to develop', icon: Zap, topic: 'Skill development' },
      { text: 'Networking tips', icon: Users, topic: 'Networking' },
    ],
    [],
  );

  const isThreadArchived = useCallback(
    (metadata: Record<string, unknown> | null) =>
      Boolean((metadata as { archived?: boolean } | null)?.archived),
    [],
  );

  const mapThreadRow = useCallback(
    (row: SupabaseChatThread): ChatThread => ({
      id: row.id,
      title: row.title && row.title.trim().length > 0 ? row.title : DEFAULT_THREAD_TITLE,
      updatedAt: row.updated_at,
      lastMessageAt: row.last_message_at,
      metadata: row.metadata ?? null,
    }),
    [],
  );

  const mapMessageRow = useCallback(
    (row: SupabaseChatMessage): Message => ({
      id: row.id,
      type: row.role === 'user' ? 'user' : 'bot',
      content: row.content,
      timestamp: new Date(row.created_at),
    }),
    [],
  );

  const formatThreadTimestamp = useCallback((iso?: string | null) => {
    if (!iso) return 'Just now';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return 'Just now';
    return date.toLocaleString(undefined, { month: 'short', day: 'numeric' });
  }, []);

  const startNewConversation = useCallback(() => {
    setSelectedThreadId(null);
    setMessages([welcomeMessage(user?.name)]);
    hasRecordedSessionRef.current = false;
  }, [user?.name]);

  const loadMessages = useCallback(
    async (threadId: string) => {
      setIsMessagesLoading(true);
      try {
        const rows = await fetchChatMessagesService(threadId);
        if (!rows || rows.length === 0) {
          setMessages([welcomeMessage(user?.name)]);
          hasRecordedSessionRef.current = false;
          return;
        }
        setMessages(rows.map(mapMessageRow));
        hasRecordedSessionRef.current = true;
      } catch (error) {
        console.error('Failed to load chat messages:', error);
        setMessages([welcomeMessage(user?.name)]);
        hasRecordedSessionRef.current = false;
      } finally {
        setIsMessagesLoading(false);
      }
    },
    [mapMessageRow, user?.name],
  );

  const loadThreads = useCallback(async () => {
    if (!user?.id) {
      setThreads([]);
      startNewConversation();
      return;
    }
    setIsThreadsLoading(true);
    try {
      const rows = await fetchChatThreadsService();
      const mapped = rows
        .filter((row) => !isThreadArchived(row.metadata ?? null))
        .map(mapThreadRow);
      setThreads(mapped);
      if (mapped.length === 0) {
        startNewConversation();
        return;
      }
      setSelectedThreadId((current) => {
        if (current && mapped.some((thread) => thread.id === current)) {
          void loadMessages(current);
          return current;
        }
        const firstId = mapped[0].id;
        void loadMessages(firstId);
        return firstId;
      });
    } catch (error) {
      console.error('Failed to load chat threads:', error);
      setThreads([]);
      startNewConversation();
    } finally {
      setIsThreadsLoading(false);
    }
  }, [user?.id, isThreadArchived, mapThreadRow, startNewConversation, loadMessages]);

  const handleSelectThread = useCallback(
    (threadId: string) => {
      setSelectedThreadId(threadId);
      void loadMessages(threadId);
    },
    [loadMessages],
  );

  const handleArchiveThread = useCallback(
    async (threadId: string) => {
      try {
        await archiveChatThreadService(threadId);
        await loadThreads();
        if (selectedThreadId === threadId) {
          startNewConversation();
        }
      } catch (error) {
        console.error('Failed to archive chat thread:', error);
      }
    },
    [loadThreads, selectedThreadId, startNewConversation],
  );

  const handleDeleteThread = useCallback(
    async (threadId: string) => {
      try {
        const { error } = await supabase.from('chat_threads').delete().eq('id', threadId);
        if (error) throw error;
        await loadThreads();
        if (selectedThreadId === threadId) {
          startNewConversation();
        }
      } catch (error) {
        console.error('Failed to delete chat thread:', error);
      }
    },
    [loadThreads, selectedThreadId, startNewConversation],
  );

  const handleSend = useCallback(
    async (overrideText?: string, topic?: string) => {
      const text = (overrideText ?? input).trim();
      if (!text) return;

      if (!user?.id) {
        setMessages((prev) =>
          prev.concat({
            id: `notice-${Date.now()}`,
            type: 'bot',
            content: 'Please sign in with Google to chat with Edutu.',
            timestamp: new Date(),
          }),
        );
        return;
      }

      const sessionTopic = topic ?? 'Custom question';
      if (!hasRecordedSessionRef.current) {
        void recordChatSession(sessionTopic);
        hasRecordedSessionRef.current = true;
      }

      const pendingUserId = `pending-user-${Date.now()}`;
      const pendingBotId = `pending-bot-${Date.now()}`;

      setMessages((prev) => {
        const withoutTyping = prev.filter((message) => !message.isTyping);
        return [
          ...withoutTyping.filter((message) => message.id !== 'welcome'),
          { id: pendingUserId, type: 'user', content: text, timestamp: new Date() },
          { id: pendingBotId, type: 'bot', content: '', timestamp: new Date(), isTyping: true },
        ];
      });

      setInput('');
      setIsTyping(true);

      try {
        const response = await sendChatMessageService({
          threadId: selectedThreadId,
          message: text,
        });
        const nextThreadId = response.threadId;
        setSelectedThreadId(nextThreadId);
        await Promise.all([loadMessages(nextThreadId), loadThreads()]);
      } catch (error) {
        console.error('Failed to send chat message:', error);
        setMessages((prev) =>
          prev
            .filter((message) => message.id !== pendingBotId)
            .concat({
              id: `error-${Date.now()}`,
              type: 'bot',
              content:
                error instanceof Error
                  ? `Sorry, your message could not be sent: ${error.message}`
                  : 'Sorry, your message could not be sent due to an unexpected issue.',
              timestamp: new Date(),
            }),
        );
      } finally {
        setIsTyping(false);
      }
    },
    [input, loadMessages, loadThreads, recordChatSession, selectedThreadId, user?.id],
  );

  const toggleRecording = useCallback(() => {
    setIsRecording((prev) => !prev);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (user?.id) {
      void loadThreads();
    } else {
      setThreads([]);
      startNewConversation();
    }
  }, [user?.id, loadThreads, startNewConversation]);

  const selectedThread = useMemo(
    () => (selectedThreadId ? threads.find((thread) => thread.id === selectedThreadId) ?? null : null),
    [selectedThreadId, threads],
  );

  const showWelcomePrompts = useMemo(
    () =>
      !isMessagesLoading &&
      messages.length === 1 &&
      messages[0].id === 'welcome' &&
      !selectedThreadId,
    [isMessagesLoading, messages, selectedThreadId],
  );

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-gray-950 text-white' : 'bg-slate-50 text-slate-900'} font-body transition-colors duration-500 overflow-hidden flex flex-col`}>
      {/* Background Mesh */}
      <div className="fixed inset-0 pointer-events-none opacity-20 dark:opacity-10 mesh-gradient" />

      <div className="flex-1 flex overflow-hidden relative z-10">
        {/* Sidebar - Desktop */}
        <aside className={`hidden lg:flex lg:w-80 flex-col backdrop-blur-3xl border-r transition-all ${isDarkMode ? 'bg-gray-950/60 border-white/5' : 'bg-white/60 border-slate-200'
          }`}>
          <div className="p-6 border-b border-transparent">
            <h2 className="text-xl font-display font-bold mb-6">Discovery Log</h2>
            <Button onClick={startNewConversation} className="w-full justify-center gap-2 rounded-2xl h-12 shadow-lg shadow-brand-500/20">
              <Plus size={18} />
              New session
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-4 space-y-2">
            {threads.map((thread) => {
              const isActive = selectedThreadId === thread.id;
              return (
                <div
                  key={thread.id}
                  onClick={() => handleSelectThread(thread.id)}
                  className={`group p-4 rounded-2xl cursor-pointer transition-all border ${isActive
                    ? 'bg-brand-500 text-white border-brand-500 shadow-xl shadow-brand-500/20 translate-x-1'
                    : isDarkMode
                      ? 'bg-white/5 border-transparent hover:bg-white/10 text-slate-300'
                      : 'bg-slate-100 border-transparent hover:bg-slate-200 text-slate-600'
                    }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate mb-1">{thread.title}</p>
                      <p className={`text-[10px] font-bold tracking-wider ${isActive ? 'text-brand-100' : 'text-slate-500'}`}>
                        {formatThreadTimestamp(thread.lastMessageAt ?? thread.updatedAt)}
                      </p>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); handleArchiveThread(thread.id); }} className="p-1.5 hover:bg-black/10 rounded-lg">
                        <Archive size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col relative h-full">
          {/* Header with Back Button */}
          <header className={`p-4 md:p-6 backdrop-blur-3xl border-b ${isDarkMode ? 'bg-gray-950/40 border-white/5' : 'bg-white/40 border-slate-200'
            }`}>
            <div className="max-w-4xl mx-auto flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Back Button */}
                {onBack && (
                  <button
                    onClick={onBack}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl font-bold text-sm transition-all ${isDarkMode
                        ? 'bg-white/10 text-white hover:bg-white/20'
                        : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                      }`}
                  >
                    <ArrowLeft size={20} strokeWidth={2.5} />
                    <span className="hidden sm:inline">Back</span>
                  </button>
                )}
                <div className="relative">
                  <div className="h-12 w-12 rounded-2xl gradient-accent flex items-center justify-center shadow-xl shadow-brand-500/20">
                    <Bot size={28} className="text-white" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 h-4 w-4 bg-success rounded-full border-2 border-white dark:border-gray-950" />
                </div>
                <div>
                  <h1 className="text-lg font-display font-bold flex items-center gap-2">
                    Edutu AI Coach
                    <Sparkles size={16} className="text-brand-500 animate-pulse" />
                  </h1>
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400 tracking-widest">
                    {selectedThread ? selectedThread.title : 'Ready to strategize • Online'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 md:hidden">
                <Button variant="secondary" onClick={startNewConversation} className="p-2.5 rounded-xl">
                  <Plus size={20} />
                </Button>
              </div>
            </div>
          </header>

          {/* Messages Feed */}
          <div className="flex-1 overflow-y-auto px-4 md:px-8 py-8 space-y-8 scroll-smooth pb-48">
            <div className="max-w-4xl mx-auto space-y-8">
              {messages.map((message) => (
                <div key={message.id} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'} animate-slide-up`}>
                  <div className={`flex gap-4 max-w-[85%] ${message.type === 'user' ? 'flex-row-reverse' : ''}`}>
                    <div className={`h-10 w-10 shrink-0 rounded-xl flex items-center justify-center shadow-md ${message.type === 'user'
                      ? isDarkMode ? 'bg-white/10' : 'bg-slate-200'
                      : 'gradient-accent'
                      }`}>
                      {message.type === 'user' ? <User size={20} /> : <Bot size={20} className="text-white" />}
                    </div>
                    <div className="space-y-2">
                      <div className={`p-4 md:p-5 rounded-2xl border transition-all ${message.type === 'user'
                        ? 'bg-brand-600 text-white border-brand-500 shadow-xl shadow-brand-500/10'
                        : isDarkMode
                          ? 'bg-white/5 border-white/5 text-slate-200'
                          : 'bg-white border-slate-200 text-slate-800 shadow-sm'
                        }`}>
                        {message.isTyping ? (
                          <div className="flex gap-1.5 py-2">
                            <span className="h-1.5 w-1.5 bg-brand-400 rounded-full animate-bounce" />
                            <span className="h-1.5 w-1.5 bg-brand-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                            <span className="h-1.5 w-1.5 bg-brand-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                          </div>
                        ) : (
                          <p className="text-sm md:text-base leading-relaxed whitespace-pre-line font-medium">{message.content}</p>
                        )}
                      </div>
                      <p className={`text-[10px] font-bold tracking-widest text-slate-500 ${message.type === 'user' ? 'text-right' : ''}`}>
                        {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}

              {showWelcomePrompts && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-10 animate-slide-up">
                  {quickPrompts.map((prompt) => (
                    <button
                      key={prompt.text}
                      onClick={() => handleSend(prompt.text, prompt.topic)}
                      className="premium-card p-5 text-left group hover:bg-brand-500 hover:border-brand-500 transition-all duration-300"
                    >
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-xl bg-brand-500/10 text-brand-500 flex items-center justify-center group-hover:bg-white/20 group-hover:text-white transition-colors">
                          <prompt.icon size={24} />
                        </div>
                        <span className="font-bold text-sm md:text-base group-hover:text-white transition-colors">{prompt.text}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input Bar */}
          <div className="absolute bottom-0 left-0 right-0 p-4 md:p-8 bg-gradient-to-t from-surface-body/90 to-transparent pointer-events-none">
            <div className="max-w-4xl mx-auto pointer-events-auto">
              <div className="premium-card p-2 shadow-2xl backdrop-blur-3xl flex items-center gap-2">
                <button className="p-4 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 text-slate-500 transition-colors">
                  <Paperclip size={20} />
                </button>
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Tell me your career goals..."
                  className="flex-1 bg-transparent border-none focus:ring-0 text-sm md:text-base px-2 py-4 placeholder-slate-500"
                />
                <button
                  onClick={toggleRecording}
                  className={`p-4 rounded-xl transition-all ${isRecording ? 'bg-rose-500 text-white animate-pulse' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5'
                    }`}
                >
                  {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
                </button>
                <Button
                  onClick={() => handleSend()}
                  disabled={!input.trim() || isTyping}
                  className="p-4 rounded-xl h-14 w-14 flex items-center justify-center shrink-0 shadow-lg shadow-brand-500/20"
                >
                  <Send size={20} className={isTyping ? 'animate-pulse' : ''} />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;