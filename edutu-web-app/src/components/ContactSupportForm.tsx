import React, { useEffect, useState } from 'react';
import { useAuth as useClerkAuth, useUser } from '@clerk/clerk-react';
import { Bug, CheckCircle2, LifeBuoy, Loader2, Send } from 'lucide-react';
import Input from './ui/Input';
import Textarea from './ui/Textarea';
import Label from './ui/Label';
import Button from './ui/Button';
import { useToast } from './ui/ToastProvider';
import {
  submitSupportRequest,
  type SupportRequestType,
} from '../services/support';

const SUPPORT_EMAIL = 'my.edutu@gmail.com';
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Contact / bug-report form for the Help Center. Emails the submission to the
 * support inbox via the backend. Prefills name + email for signed-in users and
 * works for signed-out visitors too.
 */
const ContactSupportForm: React.FC = () => {
  const { user } = useUser();
  const { getToken } = useClerkAuth();
  const { success, error: toastError } = useToast();

  const [type, setType] = useState<SupportRequestType>('support');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  // Prefill from the signed-in user once Clerk resolves, without clobbering
  // anything the user has already typed.
  useEffect(() => {
    if (!user) return;
    setName((prev) => prev || user.fullName || '');
    setEmail(
      (prev) => prev || user.primaryEmailAddress?.emailAddress || ''
    );
  }, [user]);

  const isBug = type === 'bug';

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    const trimmedEmail = email.trim();
    const trimmedSubject = subject.trim();
    const trimmedMessage = message.trim();

    if (!EMAIL_RE.test(trimmedEmail)) {
      toastError('Enter a valid email', 'We need a way to reply to you.');
      return;
    }
    if (!trimmedSubject) {
      toastError('Add a subject', 'A short summary helps us route your message.');
      return;
    }
    if (trimmedMessage.length < 10) {
      toastError('Tell us a bit more', 'Please add at least a sentence.');
      return;
    }

    setSubmitting(true);
    try {
      const token = await getToken().catch(() => null);
      await submitSupportRequest(
        {
          type,
          name: name.trim() || undefined,
          email: trimmedEmail,
          subject: trimmedSubject,
          message: trimmedMessage,
          context: {
            app: 'web',
            url: window.location.href,
            userAgent: navigator.userAgent,
            ...(user?.id ? { userId: user.id } : {}),
          },
        },
        token
      );
      setSent(true);
      setSubject('');
      setMessage('');
      success(
        isBug ? 'Bug report sent' : 'Message sent',
        "Thanks — we'll get back to you by email soon."
      );
    } catch {
      toastError(
        'Could not send',
        `Please try again, or email us directly at ${SUPPORT_EMAIL}.`
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-3xl border border-subtle bg-surface-layer p-6 shadow-soft sm:p-8"
    >
      {/* Type toggle */}
      <div className="mb-6 inline-flex rounded-xl border border-subtle bg-surface-body p-1">
        {(['support', 'bug'] as const).map((option) => {
          const active = type === option;
          const Icon = option === 'bug' ? Bug : LifeBuoy;
          return (
            <button
              key={option}
              type="button"
              onClick={() => setType(option)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition ${
                active
                  ? 'bg-brand text-white shadow-soft'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <Icon size={15} />
              {option === 'bug' ? 'Report a bug' : 'Ask a question'}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="support-name">Name</Label>
          <Input
            id="support-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            autoComplete="name"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="support-email">
            Email <span className="text-brand">*</span>
          </Label>
          <Input
            id="support-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </div>
      </div>

      <div className="mt-4 space-y-1.5">
        <Label htmlFor="support-subject">
          Subject <span className="text-brand">*</span>
        </Label>
        <Input
          id="support-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={
            isBug ? 'e.g. Save button does nothing' : 'e.g. Question about matching'
          }
          maxLength={200}
          required
        />
      </div>

      <div className="mt-4 space-y-1.5">
        <Label htmlFor="support-message">
          {isBug ? 'What happened?' : 'How can we help?'}{' '}
          <span className="text-brand">*</span>
        </Label>
        <Textarea
          id="support-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={6}
          maxLength={5000}
          placeholder={
            isBug
              ? 'Describe the bug, the steps to reproduce it, and what you expected to happen.'
              : 'Tell us what you need a hand with.'
          }
          required
        />
      </div>

      <div className="mt-6 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-relaxed text-text-muted">
          Prefer email? Reach us any time at{' '}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="font-medium text-brand hover:underline"
          >
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
        <Button
          type="submit"
          disabled={submitting}
          className="shrink-0 rounded-xl"
        >
          {submitting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Sending…
            </>
          ) : (
            <>
              <Send size={16} />
              {isBug ? 'Send bug report' : 'Send message'}
            </>
          )}
        </Button>
      </div>

      {sent ? (
        <p className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-success">
          <CheckCircle2 size={16} />
          Sent! We'll reply to your email soon.
        </p>
      ) : null}
    </form>
  );
};

export default ContactSupportForm;
