import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Award,
  CheckCircle2,
  FileCheck2,
  Globe2,
  Loader2,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  Users,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useAuth, useUser } from '@clerk/clerk-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getMentorDashboard, submitMentorApplication } from '../services/mentor';
import { uploadMentorProof } from '../services/mentorProof';
import PageSeo from './PageSeo';
import PublicHeader from './PublicHeader';

const MAX_PROOF_BYTES = 8 * 1024 * 1024;
const ACCEPTED_PROOF_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
]);

const STEPS = ['Why mentor', 'Your story', 'Verification', 'Review'] as const;
type StepIndex = 0 | 1 | 2 | 3;

type MentorForm = {
  displayName: string;
  email: string;
  phoneNumber: string;
  country: string;
  bio: string;
  motivation: string;
  contentType: string;
  experience: string;
  linkedInUrl: string;
  portfolioUrl: string;
};

const initialForm: MentorForm = {
  displayName: '',
  email: '',
  phoneNumber: '',
  country: '',
  bio: '',
  motivation: '',
  contentType: 'mentorship',
  experience: '',
  linkedInUrl: '',
  portfolioUrl: '',
};

const countries = [
  'Nigeria',
  'Ghana',
  'Kenya',
  'South Africa',
  'Uganda',
  'Rwanda',
  'Egypt',
  'United Kingdom',
  'United States',
  'Canada',
  'Germany',
  'France',
  'India',
  'Other',
];

const motivations = [
  'I want to help others achieve what I achieved',
  'I enjoy mentoring and sharing practical knowledge',
  'I want to give back to the opportunity community',
  'I want to turn my experience into repeatable guidance',
];

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-semibold text-text-primary">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  'w-full rounded-xl border border-subtle bg-surface-layer px-4 py-3 text-sm text-text-primary outline-none transition focus:border-brand/50 focus-visible:ring-2 focus-visible:ring-brand/30';

const MentorPage: React.FC = () => {
  const reduceMotion = useReducedMotion();
  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showApplication, setShowApplication] = useState(searchParams.get('apply') === '1');
  const [step, setStep] = useState<StepIndex>(0);
  const [form, setForm] = useState<MentorForm>(initialForm);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [isApprovedMentor, setIsApprovedMentor] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get('apply') === '1') setShowApplication(true);
  }, [searchParams]);

  useEffect(() => {
    const email = user?.primaryEmailAddress?.emailAddress;
    if (email) {
      setForm((current) => (current.email ? current : { ...current, email }));
    }
  }, [user]);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!isSignedIn) {
        if (active) setIsApprovedMentor(false);
        return;
      }
      try {
        const token = await getToken();
        if (!token) return;
        await getMentorDashboard(token);
        if (active) setIsApprovedMentor(true);
      } catch {
        if (active) setIsApprovedMentor(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [getToken, isSignedIn]);

  const canContinue = useMemo(() => {
    if (step === 0) return Boolean(form.motivation);
    if (step === 1) {
      return Boolean(
        form.displayName.trim() &&
          form.email.trim() &&
          form.phoneNumber.trim() &&
          form.country.trim() &&
          form.bio.trim().length >= 80,
      );
    }
    if (step === 2) return Boolean(proofFile && consentAccepted);
    return true;
  }, [consentAccepted, form, proofFile, step]);

  const startApplication = () => {
    if (!isSignedIn) {
      navigate('/auth', {
        state: { from: { pathname: '/mentor', search: '?apply=1' } },
      });
      return;
    }
    setSearchParams({ apply: '1' });
    setShowApplication(true);
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  const update = (key: keyof MentorForm, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const chooseProof = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setError(null);
    if (!file) {
      setProofFile(null);
      return;
    }
    if (!ACCEPTED_PROOF_TYPES.has(file.type)) {
      setProofFile(null);
      setError('Use a PDF, PNG, JPEG, or WebP proof file.');
      return;
    }
    if (file.size > MAX_PROOF_BYTES) {
      setProofFile(null);
      setError('Proof files must be 8 MB or smaller.');
      return;
    }
    setProofFile(file);
  };

  const submit = async () => {
    if (!proofFile || !consentAccepted) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Your session expired. Sign in and try again.');

      // Proof bytes never go directly from the browser to Supabase. The API
      // validates magic bytes, derives the storage path and writes with the
      // server-owned service role.
      const proof = await uploadMentorProof(token, proofFile);

      await submitMentorApplication(token, {
        displayName: form.displayName.trim(),
        email: form.email.trim(),
        phoneNumber: form.phoneNumber.trim(),
        country: form.country,
        bio: form.bio.trim(),
        motivation: form.motivation,
        contentType: form.contentType,
        experience: form.experience.trim() || 'Not specified',
        linkedinUrl: form.linkedInUrl.trim() || undefined,
        portfolioUrl: form.portfolioUrl.trim() || undefined,
        sampleContentUrl: form.portfolioUrl.trim() || form.linkedInUrl.trim() || undefined,
        proofPath: proof.path,
        proofFileName: proof.fileName,
        proofFileType: proof.contentType,
        proofFileSize: proof.size,
        consentAccepted: true,
      });
      setIsSubmitted(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not submit your mentor application.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!showApplication) {
    return (
      <div className="min-h-[100dvh] bg-surface-body text-text-primary">
        <PageSeo path="/mentor" />
        <PublicHeader fixed darkAtTop />
        <main>
          <section className="relative overflow-hidden bg-slate-950 px-4 pb-20 pt-36 text-white sm:px-6 md:pb-28 md:pt-44">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(20,110,245,0.25),transparent_35%),radial-gradient(circle_at_10%_90%,rgba(124,58,237,0.2),transparent_35%)]" />
            <div className="relative mx-auto max-w-[1120px] text-center">
              <div className="mx-auto mb-7 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-brand-200 backdrop-blur">
                <Sparkles size={14} /> Mentor with Edutu
              </div>
              <h1 className="mx-auto max-w-4xl font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
                Turn lived experience into a clearer path for the next learner.
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-slate-300 md:text-lg">
                Mentor scholarship, internship and career applicants with practical guidance backed by a verified mentor profile and structured learner tools.
              </p>
              <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
                {isApprovedMentor ? (
                  <button type="button" onClick={() => navigate('/mentor/dashboard')} className="rounded-full bg-brand px-7 py-3.5 text-sm font-semibold text-white hover:bg-brand-700">
                    Open Mentor Studio
                  </button>
                ) : (
                  <button type="button" onClick={startApplication} className="inline-flex items-center justify-center gap-2 rounded-full bg-brand px-7 py-3.5 text-sm font-semibold text-white hover:bg-brand-700">
                    Apply to mentor <ArrowRight size={16} />
                  </button>
                )}
              </div>
            </div>
          </section>

          <section className="mx-auto grid max-w-[1120px] gap-4 px-4 py-14 sm:px-6 md:grid-cols-3">
            {[
              { icon: ShieldCheck, title: 'Verified guidance', body: 'Proof is reviewed before a mentor profile is approved.' },
              { icon: Users, title: 'Learner-first support', body: 'Focus on decisions, application quality and practical next actions.' },
              { icon: Globe2, title: 'Built for global opportunity', body: 'Support learners across scholarships, internships, fellowships and careers.' },
            ].map(({ icon: Icon, title, body }) => (
              <article key={title} className="rounded-3xl border border-subtle bg-surface-layer p-6 shadow-soft">
                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-brand/10 text-brand"><Icon size={20} /></div>
                <h2 className="font-display text-lg font-semibold">{title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">{body}</p>
              </article>
            ))}
          </section>
        </main>
      </div>
    );
  }

  if (isSubmitted) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-surface-body px-4 text-text-primary">
        <div className="w-full max-w-md rounded-3xl border border-subtle bg-surface-layer p-8 text-center shadow-elevated">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-success"><CheckCircle2 size={32} /></div>
          <h1 className="mt-6 font-display text-2xl font-semibold">Application received</h1>
          <p className="mt-3 text-sm leading-relaxed text-text-secondary">Your proof and application were submitted securely. You can return here to check your mentor status.</p>
          <button type="button" onClick={() => navigate('/dashboard')} className="mt-7 rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white">Back to Edutu</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-surface-body text-text-primary">
      <PageSeo path="/mentor" />
      <PublicHeader />
      <main className="mx-auto max-w-[820px] px-4 py-10 sm:px-6 md:py-14">
        <button type="button" onClick={() => step === 0 ? setShowApplication(false) : setStep((step - 1) as StepIndex)} className="mb-7 inline-flex items-center gap-2 text-sm font-medium text-text-secondary hover:text-brand">
          <ArrowLeft size={15} /> Back
        </button>

        <div className="mb-9 grid grid-cols-4 gap-2" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
          {STEPS.map((label, index) => (
            <div key={label}>
              <div className={`h-1.5 rounded-full ${index <= step ? 'bg-brand' : 'bg-surface-elevated'}`} />
              <span className={`mt-2 hidden text-[11px] font-semibold sm:block ${index === step ? 'text-brand' : 'text-text-muted'}`}>{label}</span>
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.section
            key={step}
            initial={reduceMotion ? undefined : { opacity: 0, y: 10 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
            className="rounded-3xl border border-subtle bg-surface-layer p-5 shadow-soft sm:p-8"
          >
            {step === 0 && (
              <>
                <Award className="mb-5 text-brand" size={28} />
                <h1 className="font-display text-2xl font-semibold">Why do you want to mentor?</h1>
                <p className="mt-2 text-sm text-text-secondary">Choose the reason closest to your motivation. This helps our review team understand your intent.</p>
                <div className="mt-6 space-y-3">
                  {motivations.map((motivation) => (
                    <button key={motivation} type="button" onClick={() => update('motivation', motivation)} className={`w-full rounded-2xl border p-4 text-left text-sm transition ${form.motivation === motivation ? 'border-brand bg-brand/5 text-brand' : 'border-subtle hover:border-brand/30'}`}>
                      {motivation}
                    </button>
                  ))}
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <h1 className="font-display text-2xl font-semibold">Your experience</h1>
                <p className="mt-2 text-sm text-text-secondary">Give reviewers enough context to understand your background and the guidance you can responsibly provide.</p>
                <div className="mt-6 grid gap-5 sm:grid-cols-2">
                  <Field label="Display name"><input className={inputClass} value={form.displayName} onChange={(event) => update('displayName', event.target.value)} /></Field>
                  <Field label="Email"><input type="email" className={inputClass} value={form.email} onChange={(event) => update('email', event.target.value)} /></Field>
                  <Field label="Phone"><input type="tel" className={inputClass} value={form.phoneNumber} onChange={(event) => update('phoneNumber', event.target.value)} /></Field>
                  <Field label="Country"><select className={inputClass} value={form.country} onChange={(event) => update('country', event.target.value)}><option value="">Select country</option>{countries.map((country) => <option key={country}>{country}</option>)}</select></Field>
                  <div className="sm:col-span-2"><Field label="Bio and relevant experience"><textarea rows={5} className={inputClass} value={form.bio} onChange={(event) => update('bio', event.target.value)} placeholder="What opportunity did you earn, what did you learn, and what can you help applicants do better?" /><div className="mt-1 text-right text-xs text-text-muted">{form.bio.trim().length}/80 minimum</div></Field></div>
                  <Field label="LinkedIn (optional)"><input type="url" className={inputClass} value={form.linkedInUrl} onChange={(event) => update('linkedInUrl', event.target.value)} /></Field>
                  <Field label="Portfolio (optional)"><input type="url" className={inputClass} value={form.portfolioUrl} onChange={(event) => update('portfolioUrl', event.target.value)} /></Field>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <ShieldCheck className="mb-5 text-brand" size={28} />
                <h1 className="font-display text-2xl font-semibold">Verify your experience</h1>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">Upload proof of the scholarship, fellowship, internship, admission, grant or award that supports your mentor profile. Files are validated by the Edutu API before private storage.</p>
                <label className="mt-6 block cursor-pointer rounded-2xl border border-dashed border-brand/35 bg-brand/5 p-6 text-center">
                  <input type="file" className="sr-only" accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp" onChange={chooseProof} />
                  {proofFile ? <FileCheck2 className="mx-auto text-success" size={30} /> : <UploadCloud className="mx-auto text-brand" size={30} />}
                  <div className="mt-3 text-sm font-semibold">{proofFile?.name ?? 'Choose verification file'}</div>
                  <div className="mt-1 text-xs text-text-muted">PDF, PNG, JPEG or WebP · max 8 MB</div>
                </label>
                <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-subtle p-4">
                  <input type="checkbox" checked={consentAccepted} onChange={(event) => setConsentAccepted(event.target.checked)} className="mt-1" />
                  <span className="text-sm leading-relaxed text-text-secondary">I consent to Edutu securely reviewing this proof and contacting me about my mentor application.</span>
                </label>
              </>
            )}

            {step === 3 && (
              <>
                <h1 className="font-display text-2xl font-semibold">Review and submit</h1>
                <p className="mt-2 text-sm text-text-secondary">Check the essentials before your application is sent for review.</p>
                <dl className="mt-6 divide-y divide-subtle rounded-2xl border border-subtle">
                  {[
                    ['Name', form.displayName],
                    ['Country', form.country],
                    ['Motivation', form.motivation],
                    ['Verification', proofFile?.name ?? 'Missing'],
                  ].map(([label, value]) => (
                    <div key={label} className="grid gap-1 p-4 sm:grid-cols-[150px_1fr]"><dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</dt><dd className="text-sm text-text-primary">{value}</dd></div>
                  ))}
                </dl>
                <div className="mt-5 rounded-2xl bg-success/10 p-4 text-sm text-text-secondary"><strong className="text-success">Private verification:</strong> your proof is stored under a server-derived path and is not submitted as a public URL.</div>
              </>
            )}

            {error && <div role="alert" className="mt-5 rounded-2xl border border-danger/25 bg-danger/10 p-4 text-sm text-danger">{error}</div>}

            <div className="mt-8 flex justify-end">
              {step < 3 ? (
                <button type="button" disabled={!canContinue} onClick={() => setStep((step + 1) as StepIndex)} className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Continue <ArrowRight size={15} /></button>
              ) : (
                <button type="button" disabled={isSubmitting || !canContinue} onClick={submit} className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
                  {isSubmitting ? <><Loader2 className="animate-spin" size={15} /> Submitting</> : <>Submit application <ArrowRight size={15} /></>}
                </button>
              )}
            </div>
          </motion.section>
        </AnimatePresence>
      </main>
    </div>
  );
};

export default MentorPage;
