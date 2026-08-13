import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth as useClerkAuth } from '@clerk/clerk-react';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Coins,
  Inbox,
  Loader2,
  MessageCircle,
  Send,
  XCircle,
} from 'lucide-react';
import { useAuth as useAppAuth } from '../hooks/useAuth';
import {
  fetchMySubmissions,
  respondToSubmission,
  submitOpportunity,
  type OpportunitySubmission,
  type OpportunitySubmissionStatus,
  type SubmitOpportunityInput,
} from '../services/opportunitySubmissions';
import { isUpgradeRequiredError } from '../services/productApi';
import {
  fetchSubmissionsPolicy,
  type SubmissionsPolicy,
} from '../services/webConfig';

const CATEGORIES = ['scholarship', 'fellowship', 'internship', 'job', 'grant', 'competition', 'program', 'other'];

const STATUS_META: Record<
  OpportunitySubmissionStatus,
  { label: string; icon: typeof Clock; className: string }
> = {
  pending: { label: 'In review', icon: Clock, className: 'text-amber-500' },
  needs_info: { label: 'Info needed', icon: MessageCircle, className: 'text-brand' },
  approved: { label: 'Approved', icon: CheckCircle2, className: 'text-emerald-500' },
  rejected: { label: 'Not accepted', icon: XCircle, className: 'text-red-500' },
};

const EMPTY_FORM: SubmitOpportunityInput = {
  title: '',
  organization: '',
  category: '',
  summary: '',
  description: '',
  location: '',
  isRemote: false,
  eligibility: '',
  benefits: '',
  deadline: '',
  applyUrl: '',
  sourceUrl: '',
};

export default function SubmitOpportunityPage() {
  const navigate = useNavigate();
  const { getToken } = useClerkAuth();
  const { user } = useAppAuth();

  const [tab, setTab] = useState<'submit' | 'mine'>('submit');
  const [form, setForm] = useState<SubmitOpportunityInput>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  // Out-of-credits (HTTP 402) gets its own inline error with a wallet link.
  const [creditsError, setCreditsError] = useState<{ required?: number } | null>(null);
  // Admin-controlled submission policy (fee + review). null while loading.
  const [policy, setPolicy] = useState<SubmissionsPolicy | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchSubmissionsPolicy().then((p) => {
      if (!cancelled) setPolicy(p);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const feeCredits = policy?.paidSubmissions ? policy.costCredits : 0;

  const [items, setItems] = useState<OpportunitySubmission[]>([]);
  const [loadingMine, setLoadingMine] = useState(false);
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const resolveToken = useCallback(async () => {
    const token = await getToken().catch(() => null);
    if (!token) throw new Error('Your session has expired. Sign in again.');
    return token;
  }, [getToken]);

  const loadMine = useCallback(async () => {
    if (!user?.id) return;
    setLoadingMine(true);
    setListError(null);
    try {
      const token = await resolveToken();
      setItems(await fetchMySubmissions(token));
    } catch (error) {
      setListError(error instanceof Error ? error.message : 'Unable to load submissions.');
    } finally {
      setLoadingMine(false);
    }
  }, [resolveToken, user?.id]);

  useEffect(() => {
    if (tab === 'mine') void loadMine();
  }, [tab, loadMine]);

  const set = <K extends keyof SubmitOpportunityInput>(key: K, value: SubmitOpportunityInput[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    setFormError(null);
    setFormSuccess(null);
    setCreditsError(null);
    if ((form.title || '').trim().length < 3) {
      setFormError('Give the opportunity a clear title (at least 3 characters).');
      return;
    }
    if (form.applyUrl && !/^https?:\/\//i.test(form.applyUrl.trim())) {
      setFormError('The apply link should start with http:// or https://');
      return;
    }
    setSubmitting(true);
    try {
      const token = await resolveToken();
      await submitOpportunity(
        {
          ...form,
          deadline: form.deadline ? new Date(form.deadline).toISOString() : undefined,
        },
        token,
      );
      setForm(EMPTY_FORM);
      // User submissions are always pending until an admin approves them.
      // Keep the copy aligned with the server state machine even if an older
      // backend responds with an unexpected status.
      setFormSuccess('Submitted for review! Our team will get back to you — track it under “My submissions”.');
    } catch (error) {
      if (isUpgradeRequiredError(error) && error.code === 'insufficient_credits') {
        setCreditsError({ required: error.required });
      } else {
        setFormError(error instanceof Error ? error.message : 'Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const sendReply = async (id: string) => {
    if (replyText.trim().length < 1) return;
    setReplying(true);
    try {
      const token = await resolveToken();
      await respondToSubmission(id, replyText.trim(), token);
      setReplyFor(null);
      setReplyText('');
      await loadMine();
    } catch (error) {
      setListError(error instanceof Error ? error.message : 'Could not send your reply.');
    } finally {
      setReplying(false);
    }
  };

  const pendingCount = useMemo(
    () => items.filter((i) => i.status === 'needs_info').length,
    [items],
  );

  return (
    <div className="min-h-[100dvh] bg-surface-body text-text-primary">
      <header className="sticky top-0 z-30 border-b border-subtle bg-surface-layer/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <button
            onClick={() => navigate(-1)}
            className="rounded-xl border border-subtle p-2 text-text-secondary hover:bg-surface-elevated"
            aria-label="Back"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-lg font-bold">Submit an opportunity</h1>
            <p className="text-sm text-text-secondary">Share a scholarship, job, or program with the community</p>
          </div>
        </div>
        <div className="mx-auto flex max-w-3xl gap-2 px-4 pb-3">
          <TabButton active={tab === 'submit'} onClick={() => setTab('submit')} label="Submit" />
          <TabButton
            active={tab === 'mine'}
            onClick={() => setTab('mine')}
            label={pendingCount > 0 ? `My submissions (${pendingCount})` : 'My submissions'}
          />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        {tab === 'submit' ? (
          <div className="space-y-4">
            <p className="rounded-2xl border border-subtle bg-surface-elevated p-4 text-sm text-text-secondary">
              Tell us about an opportunity you found. Our team reviews every submission before it goes live — the more detail you add, the faster it gets approved.
            </p>

            {feeCredits > 0 && (
              <div className="flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
                <Coins size={18} className="mt-0.5 shrink-0 text-amber-500" />
                <div className="text-text-primary">
                  <p className="font-semibold">
                    Submitting costs {feeCredits} {feeCredits === 1 ? 'credit' : 'credits'} — your balance is deducted
                    when you submit.
                  </p>
                  <p className="mt-1 text-text-secondary">
                    Your submission still goes through admin review before it appears in the catalog.
                  </p>
                </div>
              </div>
            )}

            {creditsError && (
              <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-500">
                You don’t have enough credits to submit
                {typeof creditsError.required === 'number'
                  ? ` — this costs ${creditsError.required} credits.`
                  : '.'}{' '}
                <Link to="/app/wallet" className="font-bold underline">
                  Top up your wallet
                </Link>{' '}
                and try again.
              </div>
            )}

            {formError && (
              <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-500">
                {formError}
              </div>
            )}
            {formSuccess && (
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-500">
                {formSuccess}{' '}
                <button className="font-bold underline" onClick={() => setTab('mine')}>
                  View my submissions
                </button>
              </div>
            )}

            <TextField label="Title" value={form.title || ''} onChange={(v) => set('title', v)} placeholder="e.g. Mastercard Foundation Scholars Program" />
            <TextField label="Organization" value={form.organization || ''} onChange={(v) => set('organization', v)} placeholder="Who's offering it?" />

            <div>
              <FieldLabel>Category</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((cat) => {
                  const active = form.category === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => set('category', active ? '' : cat)}
                      className={`rounded-full border px-3 py-1.5 text-sm font-semibold capitalize transition ${
                        active
                          ? 'border-brand bg-brand text-white'
                          : 'border-subtle text-text-secondary hover:bg-surface-elevated'
                      }`}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>

            <TextField label="Short summary" value={form.summary || ''} onChange={(v) => set('summary', v)} placeholder="One line about the opportunity" />
            <TextAreaField label="Description" value={form.description || ''} onChange={(v) => set('description', v)} placeholder="What is it, who is it for, and what does it offer?" />

            <label className="flex items-center justify-between rounded-xl border border-subtle bg-surface-layer px-4 py-3">
              <span className="text-sm font-semibold text-text-secondary">Remote / online</span>
              <input
                type="checkbox"
                checked={!!form.isRemote}
                onChange={(e) => set('isRemote', e.target.checked)}
                className="h-5 w-5 accent-brand"
              />
            </label>

            <TextField label="Location" value={form.location || ''} onChange={(v) => set('location', v)} placeholder="e.g. Nigeria, or Anywhere" />
            <TextAreaField label="Eligibility" value={form.eligibility || ''} onChange={(v) => set('eligibility', v)} placeholder="Who can apply?" />
            <TextAreaField label="Benefits" value={form.benefits || ''} onChange={(v) => set('benefits', v)} placeholder="Funding, stipend, mentorship, etc." />
            <TextField label="Application deadline" type="date" value={form.deadline || ''} onChange={(v) => set('deadline', v)} />
            <TextField label="Apply link" value={form.applyUrl || ''} onChange={(v) => set('applyUrl', v)} placeholder="https://" />
            <TextField label="Source link" value={form.sourceUrl || ''} onChange={(v) => set('sourceUrl', v)} placeholder="https://" />

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-3.5 font-bold text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {submitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              Submit for review
              {feeCredits > 0 ? ` (${feeCredits} ${feeCredits === 1 ? 'credit' : 'credits'})` : ''}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {listError && (
              <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-500">
                {listError}
              </div>
            )}
            {loadingMine ? (
              <div className="flex justify-center py-16">
                <Loader2 size={24} className="animate-spin text-brand" />
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center text-text-secondary">
                <Inbox size={34} />
                <p className="text-lg font-bold text-text-primary">No submissions yet</p>
                <p className="max-w-sm text-sm">Found a great opportunity? Submit it and help others discover it.</p>
                <button
                  onClick={() => setTab('submit')}
                  className="mt-2 rounded-xl bg-brand px-5 py-2.5 font-bold text-white"
                >
                  Submit an opportunity
                </button>
              </div>
            ) : (
              items.map((item) => {
                const meta = STATUS_META[item.status];
                const StatusIcon = meta.icon;
                const lastAdminNote =
                  item.admin_note ||
                  (item.thread || []).filter((e) => e.role === 'admin').slice(-1)[0]?.message;
                const isReplying = replyFor === item.id;
                return (
                  <div key={item.id} className="rounded-2xl border border-subtle bg-surface-layer p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-bold text-text-primary">{item.title}</h3>
                        {item.organization && (
                          <p className="text-sm text-text-secondary">{item.organization}</p>
                        )}
                      </div>
                      <span className={`flex shrink-0 items-center gap-1.5 text-sm font-bold ${meta.className}`}>
                        <StatusIcon size={15} />
                        {meta.label}
                      </span>
                    </div>

                    {lastAdminNote && (
                      <div className="mt-3 rounded-xl border border-subtle bg-surface-elevated p-3">
                        <p className={`text-xs font-semibold ${meta.className}`}>
                          {item.status === 'rejected' ? 'Why it wasn’t accepted' : 'Message from the Edutu team'}
                        </p>
                        <p className="mt-1 text-sm text-text-primary">{lastAdminNote}</p>
                      </div>
                    )}

                    {item.status === 'approved' && (
                      <p className="mt-2 text-sm text-text-secondary">
                        Approved and being published to the catalog. Thank you!
                      </p>
                    )}

                    {item.status === 'needs_info' && !isReplying && (
                      <button
                        onClick={() => {
                          setReplyFor(item.id);
                          setReplyText('');
                        }}
                        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-brand py-2.5 font-bold text-brand hover:bg-brand/5"
                      >
                        <MessageCircle size={16} />
                        Add the requested info
                      </button>
                    )}

                    {isReplying && (
                      <div className="mt-3">
                        <textarea
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          rows={3}
                          autoFocus
                          placeholder="Add the details the team asked for…"
                          className="w-full rounded-xl border border-subtle bg-surface-elevated p-3 text-sm text-text-primary outline-none focus:border-brand"
                        />
                        <div className="mt-2 flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              setReplyFor(null);
                              setReplyText('');
                            }}
                            className="px-3 py-2 text-sm font-semibold text-text-secondary"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => sendReply(item.id)}
                            disabled={replying || !replyText.trim()}
                            className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                          >
                            {replying ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                            Send
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl px-4 py-1.5 text-sm font-bold transition ${
        active ? 'bg-brand text-white' : 'border border-subtle text-text-secondary hover:bg-surface-elevated'
      }`}
    >
      {label}
    </button>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-sm font-semibold text-text-secondary">{children}</label>;
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-subtle bg-surface-layer px-3.5 py-2.5 text-text-primary outline-none focus:border-brand"
      />
    </div>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full rounded-xl border border-subtle bg-surface-layer px-3.5 py-2.5 text-text-primary outline-none focus:border-brand"
      />
    </div>
  );
}
