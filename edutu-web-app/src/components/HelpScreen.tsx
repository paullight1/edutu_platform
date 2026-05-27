import React, { useMemo, useState } from 'react';
import { ArrowLeft, HelpCircle, MessageCircle, Mail, Phone, Book, Search, ChevronDown, ChevronRight, SendHorizonal, X } from 'lucide-react';
import Button from './ui/Button';
import Card from './ui/Card';
import Input from './ui/Input';
import Textarea from './ui/Textarea';
import Select from './ui/Select';
import { useDarkMode } from '../hooks/useDarkMode';
import type { AppUser } from '../types/user';
import { createSupportTicket } from '../services/supportTickets';

interface HelpScreenProps {
  onBack: () => void;
  user: AppUser | null;
}

type ChatMessage = {
  id: number;
  from: 'support' | 'user';
  text: string;
};

const INITIAL_CHAT: ChatMessage[] = [
  {
    id: 1,
    from: 'support',
    text: 'Hi! Welcome to Edutu support. How can we assist you today?'
  }
];

const HelpScreen: React.FC<HelpScreenProps> = ({ onBack, user }) => {
  const { isDarkMode } = useDarkMode();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(INITIAL_CHAT);
  const [chatInput, setChatInput] = useState('');
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketCategory, setTicketCategory] = useState('General');
  const [ticketMessage, setTicketMessage] = useState('');
  const [ticketSubmitting, setTicketSubmitting] = useState(false);
  const [ticketFeedback, setTicketFeedback] = useState<string | null>(null);
  const [ticketFeedbackTone, setTicketFeedbackTone] = useState<'success' | 'error'>('success');

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBack = () => {
    scrollToTop();
    onBack();
  };

  const pushStatusMessage = (message: string) => {
    setStatusMessage(message);
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const openChat = () => {
    setIsChatOpen(true);
    setChatMessages((prev) =>
      prev.length === 0 ? INITIAL_CHAT : prev
    );
    pushStatusMessage('Connected to a support specialist.');
  };

  const handleSendChat = () => {
    if (!chatInput.trim()) {
      return;
    }

    const userMessage: ChatMessage = {
      id: Date.now(),
      from: 'user',
      text: chatInput.trim()
    };

    setChatMessages((prev) => [...prev, userMessage]);
    setChatInput('');

    setTimeout(() => {
      setChatMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          from: 'support',
          text: "Thanks for sharing! We'll review your question and respond shortly."
        }
      ]);
    }, 1200);
  };

  const resetTicketForm = () => {
    setTicketSubject('');
    setTicketCategory('General');
    setTicketMessage('');
  };

  const handleSubmitTicket: React.FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    if (ticketSubmitting) {
      return;
    }

    if (!user) {
      setTicketFeedbackTone('error');
      setTicketFeedback('Please sign in to submit a support ticket.');
      return;
    }

    if (!ticketSubject.trim() || !ticketMessage.trim()) {
      setTicketFeedbackTone('error');
      setTicketFeedback('Add a subject and describe the issue so we can help.');
      return;
    }

    setTicketSubmitting(true);
    setTicketFeedback(null);

    try {
      await createSupportTicket({
        userId: user.id,
        userEmail: user.email,
        subject: ticketSubject,
        category: ticketCategory,
        message: ticketMessage
      });
      resetTicketForm();
      setTicketFeedbackTone('success');
      setTicketFeedback('Support ticket submitted. Our team will respond shortly.');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unable to submit your ticket. Please try again.';
      setTicketFeedbackTone('error');
      setTicketFeedback(errorMessage);
    } finally {
      setTicketSubmitting(false);
      setTimeout(() => setTicketFeedback(null), 6000);
    }
  };

  const triggerEmail = () => {
    if (typeof window !== 'undefined') {
      window.location.href = 'mailto:support@edutu.org?subject=Support%20request%20from%20app';
    }
    pushStatusMessage('Opening your email client...');
  };

  const triggerCall = () => {
    if (typeof window !== 'undefined') {
      window.location.href = 'tel:+2341234567890';
    }
    pushStatusMessage('Dialing the support line...');
  };

  const openResource = (url: string) => {
    if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const contactOptions = [
    {
      id: 'chat',
      title: 'Live Chat',
      description: 'Chat with our support team',
      icon: <MessageCircle size={20} className="text-primary" />,
      actionLabel: 'Start Chat',
      handler: openChat
    },
    {
      id: 'email',
      title: 'Email Support',
      description: 'Send us an email',
      icon: <Mail size={20} className="text-blue-600" />,
      actionLabel: 'Send Email',
      handler: triggerEmail
    },
    {
      id: 'phone',
      title: 'Phone Support',
      description: 'Call our support line',
      icon: <Phone size={20} className="text-green-600" />,
      actionLabel: 'Call Now',
      handler: triggerCall
    }
  ] as const;

  const ticketCategories = useMemo(
    () => ['General', 'Billing', 'Technical', 'Community'],
    []
  );

  const faqItems = [
    {
      id: 'getting-started',
      question: 'How do I get started with Edutu?',
      answer:
        'Simply create an account, complete your profile, and start exploring opportunities. Our AI will begin recommending personalized opportunities based on your goals and interests.'
    },
    {
      id: 'opportunities',
      question: 'How does Edutu find opportunities for me?',
      answer:
        'Our AI analyzes your profile, goals, skills, and preferences to match you with relevant scholarships, jobs, internships, and other opportunities from our curated database.'
    },
    {
      id: 'roadmaps',
      question: 'What are personalized roadmaps?',
      answer:
        'Roadmaps are step-by-step plans created specifically for your goals. They include tasks, deadlines, resources, and milestones to help you achieve your objectives systematically.'
    },
    {
      id: 'notifications',
      question: 'How do I manage my notifications?',
      answer:
        'Go to Settings > Notifications to customize what notifications you receive and when. You can set quiet hours and choose between push notifications and email alerts.'
    },
    {
      id: 'privacy',
      question: 'Is my data safe with Edutu?',
      answer:
        'Yes, we take privacy seriously. Your data is encrypted and we never share personal information without your consent. You can review our privacy policy for more details.'
    },
    {
      id: 'account',
      question: 'How do I delete my account?',
      answer:
        'Go to Settings > Privacy & Security > Data Management > Delete Account. Note that this action is permanent and cannot be undone.'
    }
  ] as const;

  const filteredFaqs = useMemo(
    () =>
      faqItems.filter(
        (faq) =>
          faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
          faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [faqItems, searchQuery]
  );

  const toggleFaq = (id: string) => {
    setExpandedFaq(expandedFaq === id ? null : id);
  };

  const renderChatModal = () => {
    if (!isChatOpen) {
      return null;
    }

    return (
      <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 px-4">
        <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-xl border border-gray-200 dark:border-gray-700 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Live Support Chat</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Average response time: under 2 minutes</p>
            </div>
            <button
              onClick={() => setIsChatOpen(false)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              aria-label="Close chat"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-4 space-y-3">
            {chatMessages.map((message) => (
              <div
                key={message.id}
                className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                  message.from === 'user'
                    ? 'ml-auto bg-primary text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 border border-gray-100 dark:border-gray-600'
                }`}
              >
                {message.text}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleSendChat();
                }
              }}
              placeholder="Type your message..."
              className="flex-1 px-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
            />
            <Button type="button" onClick={handleSendChat} disabled={!chatInput.trim()}>
              <SendHorizonal size={18} />
              Send
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={`min-h-screen bg-white dark:bg-gray-900 animate-fade-in ${isDarkMode ? 'dark' : ''}`}>
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="p-4">
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              onClick={handleBack}
              className="p-2 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            >
              <ArrowLeft size={20} />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-gray-800 dark:text-white">Help &amp; Support</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">Get help and find answers</p>
            </div>
            <HelpCircle size={24} className="text-primary" />
          </div>
          {statusMessage && (
            <p className="mt-3 text-sm text-primary">{statusMessage}</p>
          )}
        </div>
      </div>

      <div className="p-4 space-y-6">
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <div className="relative">
            <Search size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search for help..."
              className="w-full pl-12 pr-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
            />
          </div>
        </Card>

        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-2">Submit a support ticket</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Send us a detailed message and the Edutu team will follow up by email.
          </p>
          {!user && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              Sign in to your account so we can connect your request to your profile.
            </div>
          )}
          <form onSubmit={handleSubmitTicket} className="mt-4 space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold tracking-wide text-gray-500 dark:text-gray-400">
                Subject
              </label>
              <Input
                value={ticketSubject}
                onChange={(event) => setTicketSubject(event.target.value)}
                placeholder="Brief summary of the issue"
                disabled={ticketSubmitting || !user}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold tracking-wide text-gray-500 dark:text-gray-400">
                Category
              </label>
              <Select
                value={ticketCategory}
                onChange={(event) => setTicketCategory(event.target.value)}
                disabled={ticketSubmitting || !user}
              >
                {ticketCategories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold tracking-wide text-gray-500 dark:text-gray-400">
                How can we help?
              </label>
              <Textarea
                rows={5}
                value={ticketMessage}
                onChange={(event) => setTicketMessage(event.target.value)}
                placeholder="Describe what you need help with. Include relevant deadlines or links."
                disabled={ticketSubmitting || !user}
              />
            </div>
            {ticketFeedback && (
              <div
                className={`rounded-2xl border px-4 py-3 text-sm ${
                  ticketFeedbackTone === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-amber-200 bg-amber-50 text-amber-700'
                }`}
              >
                {ticketFeedback}
              </div>
            )}
            <div className="flex justify-end">
              <Button type="submit" disabled={ticketSubmitting || !user}>
                {ticketSubmitting ? 'Submitting...' : 'Submit ticket'}
              </Button>
            </div>
          </form>
        </Card>

        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Contact Support</h3>
          <div className="space-y-3">
            {contactOptions.map((option, index) => (
              <div
                key={option.id}
                className="flex items-center gap-3 p-3 rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-all animate-slide-up"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-2xl flex items-center justify-center">
                  {option.icon}
                </div>
                <div className="flex-1">
                  <h4 className="font-medium text-gray-800 dark:text-white">{option.title}</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{option.description}</p>
                </div>
                <Button variant="secondary" className="px-4 py-2 text-sm" onClick={option.handler}>
                  {option.actionLabel}
                </Button>
              </div>
            ))}
          </div>
        </Card>

        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Frequently Asked Questions</h3>
          <div className="space-y-3">
            {filteredFaqs.map((faq, index) => (
              <div
                key={faq.id}
                className="border border-gray-200 dark:border-gray-600 rounded-2xl animate-slide-up"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <button
                  onClick={() => toggleFaq(faq.id)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-all rounded-2xl"
                >
                  <h4 className="font-medium text-gray-800 dark:text-white pr-4">{faq.question}</h4>
                  {expandedFaq === faq.id ? (
                    <ChevronDown size={20} className="text-gray-400 flex-shrink-0" />
                  ) : (
                    <ChevronRight size={20} className="text-gray-400 flex-shrink-0" />
                  )}
                </button>
                {expandedFaq === faq.id && (
                  <div className="px-4 pb-4 animate-slide-up">
                    <p className="text-gray-600 dark:text-gray-300 leading-relaxed">{faq.answer}</p>
                  </div>
                )}
              </div>
            ))}
          </div>

          {filteredFaqs.length === 0 && searchQuery && (
            <div className="text-center py-8">
              <div className="text-4xl mb-4">🤔</div>
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-2">No results found</h3>
              <p className="text-gray-600 dark:text-gray-400">Try searching with different keywords</p>
            </div>
          )}
        </Card>

        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Additional Resources</h3>
          <div className="space-y-3">
            <button
              onClick={() => openResource('https://docs.edutu.org/user-guide')}
              className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-all text-left"
            >
              <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-2xl flex items-center justify-center">
                <Book size={20} className="text-purple-600" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium text-gray-800 dark:text-white">User Guide</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">Complete guide to using Edutu</p>
              </div>
            </button>

            <button
              onClick={() => openResource('https://community.edutu.org')}
              className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-all text-left"
            >
              <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-2xl flex items-center justify-center">
                <MessageCircle size={20} className="text-blue-600" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium text-gray-800 dark:text-white">Community Forum</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">Connect with other users</p>
              </div>
            </button>
          </div>
        </Card>

        <div className="text-center text-gray-500 dark:text-gray-400 text-sm space-y-1">
          <p>Edutu v1.0</p>
          <p>Need more help? Contact us at support@edutu.org</p>
        </div>
      </div>

      {renderChatModal()}
    </div>
  );
};

export default HelpScreen;

