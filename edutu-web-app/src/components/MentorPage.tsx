import React, { useState } from 'react';
import {
    ArrowLeft,
    ArrowRight,
    Sparkles,
    CheckCircle,
    Users,
    Award,
    Star,
    Loader2,
    Zap,
    Globe,
    Heart,
    BookOpen,
    ShieldCheck,
    MessageCircle,
    TrendingUp,
    PlayCircle,
    DollarSign,
    Upload,
    FileCheck,
    Rocket
} from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useAuth, useUser } from '@clerk/clerk-react';
import { supabase } from '../lib/supabaseClient';
import { getMentorDashboard, submitMentorApplication } from '../services/mentor';
import PageSeo from './PageSeo';
import PublicHeader from './PublicHeader';

interface MentorFormData {
    displayName: string;
    email: string;
    phoneNumber: string;
    country: string;
    bio: string;
    contentType: string;
    experience: string;
    motivation: string;
    linkedInUrl: string;
    portfolioUrl: string;
}

const MENTOR_STEPS = ['intro', 'motivation', 'details', 'review'] as const;
type MentorStep = typeof MENTOR_STEPS[number];

const COUNTRY_OPTIONS = [
    'Nigeria',
    'Ghana',
    'Kenya',
    'South Africa',
    'Uganda',
    'Rwanda',
    'Egypt',
    'United States',
    'United Kingdom',
    'Canada',
    'Australia',
    'Germany',
    'France',
    'Netherlands',
    'Italy',
    'United Arab Emirates',
    'India',
    'Other',
];

const MOTIVATION_OPTIONS = [
    { id: 'help_others', text: "I want to help others achieve what I achieved", icon: Heart },
    { id: 'mentor', text: "I enjoy mentoring and sharing knowledge", icon: Users },
    { id: 'give_back', text: "I want to give back to the community", icon: Sparkles },
    { id: 'document', text: "I want to document my journey for others", icon: BookOpen },
    { id: 'pay_forward', text: "I believe in paying it forward", icon: Zap },
];

const CONTENT_TYPES = [
    { id: 'mentorship', label: 'Mentor Support', icon: Users, accentClass: 'text-brand', tintClass: 'bg-brand/10', borderClass: 'border-brand', desc: 'Guide applicants from your lived experience' },
    { id: 'course', label: 'Success Guidance', icon: BookOpen, accentClass: 'text-violet-500', tintClass: 'bg-violet-500/10', borderClass: 'border-violet-500', desc: 'Share the preparation that helped you win' },
    { id: 'materials', label: 'Application Materials', icon: Award, accentClass: 'text-success', tintClass: 'bg-success/10', borderClass: 'border-success', desc: 'Essays, checklists, and samples' },
    { id: 'resource', label: 'Opportunity Tips', icon: Star, accentClass: 'text-warning', tintClass: 'bg-warning/10', borderClass: 'border-warning', desc: 'Practical advice for future applicants' },
];

const LANDING_OPTIONS = [
    {
        title: 'Become a Mentor',
        desc: 'Guide learners through scholarships, internships, career decisions, interviews, and applications.',
        icon: Users,
        accentClass: 'text-brand',
        tintClass: 'bg-brand/10',
        borderClass: 'border-brand/30',
    },
    {
        title: 'Share Guidance',
        desc: 'Turn your proven journey into practical guidance learners can use while applying.',
        icon: TrendingUp,
        accentClass: 'text-violet-500',
        tintClass: 'bg-violet-500/10',
        borderClass: 'border-violet-500/30',
    },
    {
        title: 'Create Resources',
        desc: 'Publish checklists, guides, study plans, and application materials that help learners move faster.',
        icon: BookOpen,
        accentClass: 'text-success',
        tintClass: 'bg-success/10',
        borderClass: 'border-success/30',
    },
];

const MENTOR_HERO_SLIDES = [
    {
        src: '/mentor/hero-library-mentor.jpg',
        alt: 'A Nigerian mentor guiding two learners through an application in a university library',
    },
    {
        src: '/mentor/hero-campus-walk.jpg',
        alt: 'A Nigerian mentor and university learner discussing a plan on campus',
    },
    {
        src: '/mentor/hero-application-review.jpg',
        alt: 'A mentor and learner reviewing an application together in a study space',
    },
] as const;

const MentorPage: React.FC = () => {
    const reduceMotion = useReducedMotion();
    const { userId, isSignedIn, getToken } = useAuth();
    const { user } = useUser();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [showApplication, setShowApplication] = useState(searchParams.get('apply') === '1' && Boolean(userId));
    const [currentStep, setCurrentStep] = useState<MentorStep>('intro');
    const [proofFile, setProofFile] = useState<File | null>(null);
    const [consentAccepted, setConsentAccepted] = useState(false);
    const [formData, setFormData] = useState<MentorFormData>({
        displayName: '',
        email: '',
        phoneNumber: '',
        country: '',
        bio: '',
        contentType: 'mentorship',
        experience: '',
        motivation: '',
        linkedInUrl: '',
        portfolioUrl: '',
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [isApprovedMentor, setIsApprovedMentor] = useState(false);
    const [activeHeroSlide, setActiveHeroSlide] = useState(0);

    const stepIndex = MENTOR_STEPS.indexOf(currentStep);

    React.useEffect(() => {
        if (searchParams.get('apply') === '1' && userId) {
            setShowApplication(true);
        }
    }, [searchParams, userId]);

    React.useEffect(() => {
        const primaryEmail = user?.primaryEmailAddress?.emailAddress;
        if (primaryEmail && !formData.email) {
            setFormData(prev => ({ ...prev, email: primaryEmail }));
        }
    }, [formData.email, user]);

    React.useEffect(() => {
        let active = true;
        (async () => {
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
        return () => { active = false; };
    }, [isSignedIn, getToken]);

    React.useEffect(() => {
        if (reduceMotion) return;

        const interval = window.setInterval(() => {
            setActiveHeroSlide((current) => (current + 1) % MENTOR_HERO_SLIDES.length);
        }, 6000);

        return () => window.clearInterval(interval);
    }, [reduceMotion]);

    const startApplication = () => {
        if (!isSignedIn) {
            navigate('/auth', { state: { from: { pathname: '/mentor', search: '?apply=1' } } });
            return;
        }

        setSearchParams({ apply: '1' });
        setShowApplication(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const updateField = (field: keyof MentorFormData, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleProofUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0] || null;
        if (!file) return;

        const isAllowed = file.type.startsWith('image/') || file.type === 'application/pdf';
        if (!isAllowed) return;

        setProofFile(file);
    };

    const uploadProofFile = async (userId: string, file: File) => {
        const fileExt = file.name.split('.').pop() || 'pdf';
        const safeBaseName = file.name
            .replace(/\.[^/.]+$/, '')
            .replace(/[^a-z0-9_-]+/gi, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 80) || 'award-proof';
        const path = `${userId}/${Date.now()}-${safeBaseName}.${fileExt}`;

        const { data, error } = await supabase.storage
            .from('creator-proofs')
            .upload(path, file, {
                cacheControl: '3600',
                upsert: false,
            });

        if (error) throw error;

        return {
            path: data.path,
        };
    };

    const canProceed = (): boolean => {
        switch (currentStep) {
            case 'intro': return true;
            case 'motivation': return !!formData.motivation;
            case 'details': return !!formData.displayName && !!formData.email && !!formData.phoneNumber && !!formData.country && !!formData.bio;
            case 'review': return true;
            default: return false;
        }
    };

    const handleSubmit = async () => {
        if (!userId) {
            navigate('/auth', { state: { from: { pathname: '/mentor', search: '?apply=1' } } });
            return;
        }

        if (!proofFile || !consentAccepted) {
            return;
        }

        setIsSubmitting(true);
        setSubmitError(null);
        try {
            const proof = await uploadProofFile(userId, proofFile);
            const token = await getToken();
            if (!token) {
                throw new Error('Your session has expired. Please sign in again.');
            }

            await submitMentorApplication(token, {
                displayName: formData.displayName,
                email: formData.email,
                phoneNumber: formData.phoneNumber,
                country: formData.country,
                bio: formData.bio,
                motivation: formData.motivation || undefined,
                contentType: formData.contentType,
                experience: formData.experience || 'Not specified',
                linkedinUrl: formData.linkedInUrl || undefined,
                portfolioUrl: formData.portfolioUrl || undefined,
                sampleContentUrl: formData.portfolioUrl || formData.linkedInUrl || undefined,
                proofPath: proof.path,
                proofFileName: proofFile.name,
                proofFileType: proofFile.type,
                proofFileSize: proofFile.size,
                consentAccepted,
            });

            setIsSubmitted(true);
        } catch (err) {
            console.error('Submission error:', err);
            // Supabase errors are plain objects (PostgrestError), not Error instances.
            const message = (err as { message?: string } | null)?.message;
            setSubmitError(
                message || 'Something went wrong while submitting your application. Please try again.',
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    const nextStep = () => {
        const idx = MENTOR_STEPS.indexOf(currentStep);
        if (idx < MENTOR_STEPS.length - 1) {
            setCurrentStep(MENTOR_STEPS[idx + 1]);
        }
    };

    const prevStep = () => {
        const idx = MENTOR_STEPS.indexOf(currentStep);
        if (idx > 0) {
            setCurrentStep(MENTOR_STEPS[idx - 1]);
        }
    };

    const stepTransition = (direction = 20) =>
        reduceMotion
            ? {}
            : {
                  initial: { opacity: 0, x: direction },
                  animate: { opacity: 1, x: 0 },
                  exit: { opacity: 0, x: -direction },
                  transition: { duration: 0.3 },
              };

    if (!showApplication) {
        return (
            <div className="min-h-[100dvh] bg-surface-body font-body text-text-primary">
                <PublicHeader fixed darkAtTop />

                <main>
                    <motion.section
                        initial={reduceMotion ? undefined : { opacity: 0 }}
                        whileInView={reduceMotion ? undefined : { opacity: 1 }}
                        viewport={{ once: true, margin: "-100px" }}
                        className="relative isolate min-h-[min(760px,100dvh)] overflow-hidden bg-slate-950 text-white"
                    >
                        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
                            {MENTOR_HERO_SLIDES.map((slide, index) => (
                                <motion.img
                                    key={slide.src}
                                    src={slide.src}
                                    alt=""
                                    aria-hidden="true"
                                    initial={false}
                                    animate={{
                                        opacity: index === activeHeroSlide ? 1 : 0,
                                        scale: index === activeHeroSlide ? 1 : 1.035,
                                    }}
                                    transition={{ duration: 1.2, ease: 'easeInOut' }}
                                    className="absolute inset-0 h-full w-full object-cover"
                                    loading={index === 0 ? 'eager' : 'lazy'}
                                    fetchPriority={index === 0 ? 'high' : 'auto'}
                                />
                            ))}
                            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,10,22,0.96)_0%,rgba(5,10,22,0.82)_38%,rgba(5,10,22,0.48)_72%,rgba(5,10,22,0.54)_100%)]" />
                            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,10,22,0.78)_0%,rgba(5,10,22,0.08)_35%,rgba(5,10,22,0.74)_100%)]" />
                        </div>
                        <div className="relative z-10 mx-auto flex min-h-[min(760px,100dvh)] max-w-[1200px] items-center px-4 pb-20 pt-32 text-center sm:px-6 md:pb-28 md:pt-36">
                            <div className="w-full">
                            <motion.div
                                initial={reduceMotion ? undefined : { opacity: 0, y: 14 }}
                                animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                                className="mb-8 inline-flex items-center gap-2 rounded-full border border-brand-300/30 bg-slate-950/35 px-4 py-2 text-brand-100 shadow-soft backdrop-blur-md"
                            >
                                <Sparkles size={14} />
                                <span className="text-xs font-semibold uppercase tracking-[0.2em]">Mentor with Edutu</span>
                            </motion.div>

                            <motion.h1
                                initial={reduceMotion ? undefined : { opacity: 0, y: 18 }}
                                animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                                transition={{ delay: 0.05 }}
                                className="mx-auto mb-7 max-w-3xl font-display text-[clamp(2rem,4.4vw,3.35rem)] font-semibold leading-[1.06] tracking-tight text-white md:text-[clamp(2.35rem,4.6vw,4rem)]"
                            >
                                Help ambitious learners turn opportunity into{' '}
                                <span className="text-brand-300">real outcomes.</span>
                            </motion.h1>

                            <motion.p
                                initial={reduceMotion ? undefined : { opacity: 0, y: 16 }}
                                animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                                transition={{ delay: 0.1 }}
                                className="mx-auto mb-10 max-w-2xl text-base leading-relaxed text-slate-200/85 md:text-lg"
                            >
                                Join Edutu as a mentor or resource expert. Share what worked for you and help students prepare stronger applications, career plans, and next steps.
                            </motion.p>

                            <motion.div
                                initial={reduceMotion ? undefined : { opacity: 0, y: 16 }}
                                animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                                transition={{ delay: 0.15 }}
                                className="flex flex-col sm:flex-row items-center justify-center gap-4"
                            >
                                {!isApprovedMentor && (
                                    <button
                                        type="button"
                                        onClick={startApplication}
                                        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand px-8 py-4 text-sm font-semibold text-white shadow-elevated transition-all duration-300 hover:-translate-y-0.5 hover:bg-brand-700 focus-visible:ring-2 focus-visible:ring-brand-300/60 sm:w-auto"
                                    >
                                        Become a Mentor <ArrowRight size={16} />
                                    </button>
                                )}
                                <a
                                    href="#options"
                                    className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/35 bg-slate-950/25 px-8 py-4 text-sm font-semibold text-white backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:border-white/60 sm:w-auto"
                                >
                                    Explore Options <PlayCircle size={16} />
                                </a>
                                {isApprovedMentor && (
                                    <button
                                        type="button"
                                        onClick={() => navigate('/mentor/dashboard')}
                                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full px-8 py-4 text-sm font-semibold bg-brand text-white shadow-elevated transition-all duration-300 hover:-translate-y-0.5 hover:bg-brand-700 focus-visible:ring-2 focus-visible:ring-brand/40"
                                    >
                                        Go to Mentor Studio <ArrowRight size={16} />
                                    </button>
                                )}
                            </motion.div>
                        </div>
                    </motion.section>

                    <motion.section
                        id="why"
                        initial={reduceMotion ? undefined : { opacity: 0, y: 20 }}
                        whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-80px" }}
                        transition={{ duration: 0.5 }}
                        className="max-w-[1200px] mx-auto px-4 sm:px-6 py-12"
                    >
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 border-y border-subtle py-10">
                            {[
                                { num: '85%', label: 'Revenue share you keep', icon: DollarSign, accentClass: 'text-success' },
                                { num: 'Free', label: 'No cost to apply', icon: Users, accentClass: 'text-brand' },
                                { num: '2–3 days', label: 'Application review time', icon: Award, accentClass: 'text-warning' },
                                { num: 'Worldwide', label: 'Open to mentors everywhere', icon: Globe, accentClass: 'text-accent' },
                            ].map((stat) => (
                                <div
                                    key={stat.label}
                                    className="text-center"
                                >
                                    <stat.icon size={22} className={`mx-auto ${stat.accentClass}`} />
                                    <div className={`mt-4 font-display text-2xl md:text-3xl font-semibold ${stat.accentClass}`}>{stat.num}</div>
                                    <div className="mt-2 text-xs font-semibold tracking-[0.16em] uppercase text-text-muted">{stat.label}</div>
                                </div>
                            ))}
                        </div>
                    </motion.section>

                    <motion.section
                        id="options"
                        initial={reduceMotion ? undefined : { opacity: 0, y: 20 }}
                        whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-80px" }}
                        transition={{ duration: 0.5 }}
                        className="max-w-[1200px] mx-auto px-4 sm:px-6 py-16"
                    >
                        <div className="text-center mb-10">
                            <h2 className="font-display text-2xl md:text-3xl font-semibold tracking-tight mb-3 text-text-primary">
                                Choose how you want to help
                            </h2>
                            <p className="max-w-xl mx-auto text-base text-text-secondary">
                                Start with mentorship, resources, or repeatable guidance. Edutu turns your expertise into structured learner support.
                            </p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                            {LANDING_OPTIONS.map((option) => (
                                <button
                                    type="button"
                                    key={option.title}
                                    onClick={startApplication}
                                    className={`group p-7 rounded-3xl border ${option.borderClass} text-left bg-surface-layer shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-elevated active:scale-[0.98]`}
                                >
                                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-7 ${option.tintClass} ${option.accentClass}`}>
                                        <option.icon size={22} />
                                    </div>
                                    <h3 className="font-display text-lg font-semibold mb-3 text-text-primary">{option.title}</h3>
                                    <p className="text-sm leading-relaxed mb-6 text-text-secondary">{option.desc}</p>
                                    <span className={`inline-flex items-center gap-2 text-sm font-bold ${option.accentClass}`}>
                                        Apply now <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
                                    </span>
                                </button>
                            ))}
                        </div>
                    </motion.section>

                    <motion.section
                        id="process"
                        initial={reduceMotion ? undefined : { opacity: 0, y: 20 }}
                        whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-80px" }}
                        transition={{ duration: 0.5 }}
                        className="max-w-[1200px] mx-auto px-4 sm:px-6 py-16"
                    >
                        <div className="rounded-3xl border border-subtle p-6 md:p-10 bg-surface-elevated">
                            <div className="grid grid-cols-1 md:grid-cols-[0.9fr_1.1fr] gap-8 items-center">
                                <div>
                                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-5 bg-brand/10 text-brand">
                                        <ShieldCheck size={14} /> Verified mentor flow
                                    </div>
                                    <h2 className="font-display text-2xl font-semibold tracking-tight mb-4 text-text-primary">Apply once. Support learners at scale.</h2>
                                    <p className="text-base leading-relaxed text-text-secondary">
                                        We review each mentor application so learners get trusted, relevant guidance. Once accepted, you can publish resources and offer mentorship inside Edutu.
                                    </p>
                                </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                {[
                                        { title: 'Sign up', desc: 'Create or access your Edutu account.', icon: Users },
                                        { title: 'Apply', desc: 'Tell us your expertise and mentoring focus.', icon: FileCheck },
                                        { title: 'Launch', desc: 'Start helping learners after approval.', icon: Rocket },
                                    ].map((step, index) => (
                                        <div key={step.title} className="p-5 rounded-2xl border border-subtle bg-surface-layer shadow-soft">
                                            <div className="w-11 h-11 rounded-2xl flex items-center justify-center mb-5 bg-brand/10 text-brand">
                                                <step.icon size={20} />
                                            </div>
                                            <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold mb-5 bg-brand text-white">{index + 1}</div>
                                            <h3 className="font-display font-semibold mb-2 text-text-primary">{step.title}</h3>
                                            <p className="text-sm leading-relaxed text-text-secondary">{step.desc}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </motion.section>

                    <motion.section
                        initial={reduceMotion ? undefined : { opacity: 0, y: 20 }}
                        whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-80px" }}
                        transition={{ duration: 0.5 }}
                        className="max-w-[1200px] mx-auto px-4 sm:px-6 py-16 text-center"
                    >
                        {/* Simple brand background (no photo) so the card stays
                            light to load and legible on small screens. */}
                        <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-brand to-brand-600 p-8 text-white shadow-elevated md:p-12">
                            <MessageCircle size={30} className="mx-auto mb-5" />
                            <h2 className="font-display text-2xl md:text-3xl font-semibold tracking-tight mb-4">Guide learners into funded opportunities</h2>
                            <p className="max-w-2xl mx-auto text-white/80 mb-8">
                                Share your journey, then guide learners with a clearer path, better tools, and more confidence.
                            </p>
                            <button
                                type="button"
                                onClick={startApplication}
                                className="inline-flex items-center gap-2 rounded-full px-8 py-4 text-sm font-bold bg-white text-brand transition-all duration-300 hover:scale-[0.98] active:scale-[0.97]"
                            >
                                Become a Mentor <ArrowRight size={16} />
                            </button>
                        </div>
                    </motion.section>
                </main>
                <footer className="max-w-[1200px] mx-auto px-4 sm:px-6 pb-10">
                    <div className="flex items-center justify-between border-t border-subtle pt-6">
                        <span className="text-sm text-text-muted">
                            Edutu mentor program
                        </span>
                    </div>
                </footer>
            </div>
        );
    }

    if (isSubmitted) {
        return (
            <div className="min-h-[100dvh] bg-surface-body font-body text-text-primary">
                <div className="max-w-[1200px] mx-auto px-4 sm:px-6 flex items-center justify-center min-h-[100dvh]">
                    <motion.div
                        initial={reduceMotion ? undefined : { opacity: 0, scale: 0.9 }}
                        animate={reduceMotion ? undefined : { opacity: 1, scale: 1 }}
                        transition={{ duration: 0.5 }}
                        className="text-center max-w-md"
                    >
                        <motion.div
                            initial={reduceMotion ? undefined : { scale: 0 }}
                            animate={reduceMotion ? undefined : { scale: 1 }}
                            transition={{ duration: 0.5, delay: 0.2, type: 'spring' }}
                            className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 bg-gradient-to-br from-brand-500 to-brand-700 shadow-elevated"
                        >
                            <CheckCircle size={40} className="text-white" />
                        </motion.div>
                        <h1 className="font-display text-2xl font-semibold tracking-tight mb-3 text-text-primary">
                            Application Sent!
                        </h1>
                        <p className="text-base leading-relaxed mb-8 text-text-secondary">
                            Thanks for applying to be a mentor. We'll review your application and get back to you within 2-3 business days.
                        </p>
                        <Link to="/" className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg bg-brand text-white transition-colors hover:bg-brand-700">
                            Back to Home <ArrowRight size={16} />
                        </Link>
                    </motion.div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-[100dvh] bg-surface-body font-body text-text-primary">
            <PageSeo path="/mentor" />
            <PublicHeader />

            <main className="max-w-[800px] mx-auto px-4 sm:px-6 py-12">
                <div className="flex items-center justify-center gap-3 mb-12">
                    {MENTOR_STEPS.map((s, i) => (
                        <React.Fragment key={s}>
                            <motion.div
                                animate={reduceMotion ? undefined : {
                                    scale: i === stepIndex ? 1.2 : 1,
                                    backgroundColor: i <= stepIndex ? 'rgb(var(--color-brand-500))' : '',
                                }}
                                className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold ${
                                    i <= stepIndex
                                        ? 'bg-brand text-white'
                                        : 'bg-surface-elevated text-text-muted'
                                }`}
                            >
                                {i < stepIndex ? <CheckCircle size={16} /> : i + 1}
                            </motion.div>
                            {i < MENTOR_STEPS.length - 1 && (
                                <div className={`w-16 h-0.5 rounded-full ${i < stepIndex ? 'bg-brand' : 'bg-surface-elevated'}`} />
                            )}
                        </React.Fragment>
                    ))}
                </div>

                <AnimatePresence mode="wait">
                    {currentStep === 'intro' && (
                        <motion.div key="intro" {...stepTransition()}>
                            <div className="text-center mb-12">
                                <div className="inline-flex items-center gap-2 px-4 py-2 mb-6 rounded-full bg-brand/10 border border-brand/20">
                                    <Sparkles size={14} className="text-brand" />
                                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">Become a Mentor</span>
                                </div>
                                <h1 className="font-display text-3xl md:text-4xl font-semibold mb-4 tracking-tight text-text-primary">
                                    Share Your <span className="text-brand">Success Story</span>
                                </h1>
                                <p className="max-w-lg mx-auto text-base leading-relaxed text-text-secondary">
                                    You've achieved something incredible. Help others get there too by sharing your knowledge and experience.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                                {[
                                    { num: '85%', label: 'You keep 85%', icon: Star, accentClass: 'text-success' },
                                    { num: 'Free', label: 'No cost to apply', icon: Users, accentClass: 'text-brand' },
                                    { num: '2–3 days', label: 'Application review', icon: Award, accentClass: 'text-violet-500' },
                                ].map((stat, i) => (
                                    <motion.div
                                        key={i}
                                        initial={reduceMotion ? undefined : { opacity: 0, y: 10 }}
                                        animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.1 }}
                                        className="p-6 rounded-2xl text-center bg-surface-elevated border border-subtle shadow-soft"
                                    >
                                        <stat.icon size={20} className={`mx-auto mb-2 ${stat.accentClass}`} />
                                        <div className={`font-display text-2xl font-bold ${stat.accentClass}`}>{stat.num}</div>
                                        <div className="text-xs font-medium text-text-muted">{stat.label}</div>
                                    </motion.div>
                                ))}
                            </div>

                            <div className="p-6 rounded-2xl mb-8 bg-brand/5 border border-brand/20">
                                <div className="flex items-start gap-4">
                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-brand">
                                        <Globe size={18} className="text-white" />
                                    </div>
                                    <div>
                                        <h3 className="font-display text-base font-semibold mb-1 text-text-primary">Global Impact</h3>
                                        <p className="text-sm leading-relaxed text-text-secondary">
                                            Reach learners wherever they are. Your experience can change someone's life anywhere in the world.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={nextStep}
                                className="w-full rounded-full px-6 py-4 font-semibold transition-all duration-300 hover:-translate-y-0.5 hover:bg-brand-700 active:scale-[0.98] bg-brand text-white flex items-center justify-center gap-2 text-sm focus-visible:ring-2 focus-visible:ring-brand/40"
                            >
                                Get Started <ArrowRight size={16} />
                            </button>
                        </motion.div>
                    )}

                    {currentStep === 'motivation' && (
                        <motion.div key="motivation" {...stepTransition()}>
                            <div className="mb-8">
                                <button onClick={prevStep} className="flex items-center gap-1 text-sm mb-6 text-text-secondary transition-colors hover:text-brand">
                                    <ArrowLeft size={14} /> Back
                                </button>
                                <h2 className="font-display text-2xl font-semibold tracking-tight mb-2 text-text-primary">What motivates you?</h2>
                                <p className="text-sm text-text-secondary">Choose the reason that best describes why you want to mentor.</p>
                            </div>

                            <div className="space-y-3 mb-8">
                                {MOTIVATION_OPTIONS.map((option) => {
                                    const isSelected = formData.motivation === option.id;
                                    return (
                                        <motion.button
                                            key={option.id}
                                            whileHover={reduceMotion ? undefined : { scale: 1.01 }}
                                            whileTap={reduceMotion ? undefined : { scale: 0.99 }}
                                            onClick={() => updateField('motivation', option.id)}
                                            className={`w-full p-5 rounded-2xl flex items-center gap-4 text-left transition-all border-2 ${
                                                isSelected
                                                    ? 'bg-brand/10 border-brand'
                                                    : 'bg-surface-elevated border-subtle'
                                            }`}
                                        >
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                                                isSelected ? 'bg-brand' : 'bg-surface-body'
                                            }`}>
                                                <option.icon size={18} className={isSelected ? 'text-white' : 'text-text-muted'} />
                                            </div>
                                            <span className={`text-sm font-medium ${
                                                isSelected ? 'text-brand' : 'text-text-primary'
                                            }`}>
                                                {option.text}
                                            </span>
                                        </motion.button>
                                    );
                                })}
                            </div>

                            <button
                                onClick={nextStep}
                                disabled={!canProceed()}
                                className={`w-full rounded-full px-6 py-4 font-semibold transition-all duration-300 hover:-translate-y-0.5 active:scale-[0.98] flex items-center justify-center gap-2 text-sm ${
                                    canProceed()
                                        ? 'bg-brand text-white hover:bg-brand-700 focus-visible:ring-2 focus-visible:ring-brand/40'
                                        : 'bg-surface-elevated text-text-muted cursor-not-allowed'
                                }`}
                            >
                                Continue <ArrowRight size={16} />
                            </button>
                        </motion.div>
                    )}

                    {currentStep === 'details' && (
                        <motion.div key="details" {...stepTransition()}>
                            <div className="mb-8">
                                <button onClick={prevStep} className="flex items-center gap-1 text-sm mb-6 text-text-secondary transition-colors hover:text-brand">
                                    <ArrowLeft size={14} /> Back
                                </button>
                                <h2 className="font-display text-2xl font-semibold tracking-tight mb-2 text-text-primary">Tell us about yourself</h2>
                                <p className="text-sm text-text-secondary">Help learners understand the opportunity you won and how you can support them.</p>
                            </div>

                            <div className="space-y-6 mb-8">
                                <div>
                                    <label className="block text-sm font-semibold mb-2 text-text-primary">Display Name</label>
                                    <input
                                        type="text"
                                        value={formData.displayName}
                                        onChange={(e) => updateField('displayName', e.target.value)}
                                        placeholder="How should learners know you?"
                                        className="w-full rounded-xl border border-subtle bg-surface-layer px-4 py-3 text-sm text-text-primary placeholder:text-text-muted transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus:border-brand/40"
                                    />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-semibold mb-2 text-text-primary">Email Address</label>
                                        <input
                                            type="email"
                                            value={formData.email}
                                            onChange={(e) => updateField('email', e.target.value)}
                                            placeholder="you@example.com"
                                            className="w-full rounded-xl border border-subtle bg-surface-layer px-4 py-3 text-sm text-text-primary placeholder:text-text-muted transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus:border-brand/40"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold mb-2 text-text-primary">Phone Number</label>
                                        <input
                                            type="tel"
                                            value={formData.phoneNumber}
                                            onChange={(e) => updateField('phoneNumber', e.target.value)}
                                            placeholder="+234 800 000 0000"
                                            className="w-full rounded-xl border border-subtle bg-surface-layer px-4 py-3 text-sm text-text-primary placeholder:text-text-muted transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus:border-brand/40"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold mb-2 text-text-primary">Country</label>
                                    <select
                                        value={formData.country}
                                        onChange={(e) => updateField('country', e.target.value)}
                                        className="w-full rounded-xl border border-subtle bg-surface-layer px-4 py-3 text-sm text-text-primary placeholder:text-text-muted transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus:border-brand/40"
                                    >
                                        <option value="">Select your country</option>
                                        {COUNTRY_OPTIONS.map((country) => (
                                            <option key={country} value={country}>{country}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold mb-2 text-text-primary">What experience can you share?</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        {CONTENT_TYPES.map((type) => {
                                            const isSelected = formData.contentType === type.id;
                                            return (
                                                <button
                                                    key={type.id}
                                                    onClick={() => updateField('contentType', type.id)}
                                                    className={`p-4 rounded-xl text-left transition-all duration-200 border-2 ${
                                                        isSelected
                                                            ? `${type.borderClass} ${type.tintClass}`
                                                            : 'border-subtle bg-surface-layer'
                                                    }`}
                                                >
                                                    <type.icon size={16} className={`mb-2 ${type.accentClass}`} />
                                                    <div className="text-sm font-semibold text-text-primary">{type.label}</div>
                                                    <div className="text-xs text-text-secondary">{type.desc}</div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold mb-2 text-text-primary">Your Bio</label>
                                    <textarea
                                        value={formData.bio}
                                        onChange={(e) => updateField('bio', e.target.value)}
                                        placeholder="Share the opportunity you benefited from, what helped you win, and how you can guide future applicants..."
                                        rows={4}
                                        className="w-full rounded-xl border border-subtle bg-surface-layer px-4 py-3 text-sm text-text-primary placeholder:text-text-muted transition-all outline-none resize-none focus-visible:ring-2 focus-visible:ring-brand/40 focus:border-brand/40"
                                    />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-semibold mb-2 text-text-primary">LinkedIn URL</label>
                                        <input
                                            type="url"
                                            value={formData.linkedInUrl}
                                            onChange={(e) => updateField('linkedInUrl', e.target.value)}
                                            placeholder="https://linkedin.com/in/..."
                                            className="w-full rounded-xl border border-subtle bg-surface-layer px-4 py-3 text-sm text-text-primary placeholder:text-text-muted transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus:border-brand/40"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold mb-2 text-text-primary">
                                            Portfolio URL <span className="font-medium text-text-muted">(optional)</span>
                                        </label>
                                        <input
                                            type="url"
                                            value={formData.portfolioUrl}
                                            onChange={(e) => updateField('portfolioUrl', e.target.value)}
                                            placeholder="https://your-portfolio.com"
                                            className="w-full rounded-xl border border-subtle bg-surface-layer px-4 py-3 text-sm text-text-primary placeholder:text-text-muted transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus:border-brand/40"
                                        />
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={nextStep}
                                disabled={!canProceed()}
                                className={`w-full rounded-full px-6 py-4 font-semibold transition-all duration-300 hover:-translate-y-0.5 active:scale-[0.98] flex items-center justify-center gap-2 text-sm ${
                                    canProceed()
                                        ? 'bg-brand text-white hover:bg-brand-700 focus-visible:ring-2 focus-visible:ring-brand/40'
                                        : 'bg-surface-elevated text-text-muted cursor-not-allowed'
                                }`}
                            >
                                Review Application <ArrowRight size={16} />
                            </button>
                        </motion.div>
                    )}

                    {currentStep === 'review' && (
                        <motion.div key="review" {...stepTransition()}>
                            <div className="mb-8">
                                <button onClick={prevStep} className="flex items-center gap-1 text-sm mb-6 text-text-secondary transition-colors hover:text-brand">
                                    <ArrowLeft size={14} /> Back
                                </button>
                                <h2 className="font-display text-2xl font-semibold tracking-tight mb-2 text-text-primary">Review your application</h2>
                                <p className="text-sm text-text-secondary">Make sure everything looks good before submitting.</p>
                            </div>

                            <div className="space-y-4 mb-8">
                                {[
                                    { label: 'Display Name', value: formData.displayName },
                                    { label: 'Email', value: formData.email },
                                    { label: 'Phone Number', value: formData.phoneNumber },
                                    { label: 'Country', value: formData.country },
                                    { label: 'Motivation', value: MOTIVATION_OPTIONS.find(m => m.id === formData.motivation)?.text || '' },
                                    { label: 'Content Type', value: CONTENT_TYPES.find(c => c.id === formData.contentType)?.label || '' },
                                    { label: 'Bio', value: formData.bio },
                                    { label: 'LinkedIn', value: formData.linkedInUrl || 'Not provided' },
                                    { label: 'Portfolio', value: formData.portfolioUrl || 'Not provided' },
                                    { label: 'Award Proof', value: proofFile?.name || 'Required before submission' },
                                ].map((item, i) => (
                                    <div key={i} className="p-4 rounded-xl bg-surface-layer border border-subtle">
                                        <div className="text-xs font-semibold tracking-wide mb-1 text-text-muted">{item.label}</div>
                                        <div className="text-sm text-text-primary">{item.value}</div>
                                    </div>
                                ))}
                            </div>

                            <div className="space-y-4 mb-8">
                                <label
                                    className={`block rounded-2xl border p-5 cursor-pointer transition-all ${
                                        proofFile
                                            ? 'border-success bg-surface-layer'
                                            : 'border-subtle bg-surface-layer'
                                    }`}
                                >
                                    <input
                                        type="file"
                                        accept="image/*,.pdf,application/pdf"
                                        className="hidden"
                                        onChange={handleProofUpload}
                                    />
                                    <div className="flex items-start gap-4">
                                        <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${
                                            proofFile ? 'bg-success/10 text-success' : 'bg-brand/10 text-brand'
                                        }`}>
                                            {proofFile ? <FileCheck size={21} /> : <Upload size={21} />}
                                        </div>
                                        <div className="flex-1">
                                            <div className="text-sm font-bold mb-1 text-text-primary">
                                                Upload proof of your award or opportunity
                                            </div>
                                            <p className="text-xs leading-relaxed text-text-muted">
                                                PDF or image showing your scholarship, fellowship, internship, grant, admission, or award confirmation.
                                            </p>
                                            {proofFile && (
                                                <p className="mt-2 text-xs font-semibold text-success">
                                                    {proofFile.name}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </label>

                                <label
                                    className={`flex items-start gap-3 rounded-2xl border p-5 cursor-pointer ${
                                        consentAccepted
                                            ? 'border-brand bg-surface-layer'
                                            : 'border-subtle bg-surface-layer'
                                    }`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={consentAccepted}
                                        onChange={(event) => setConsentAccepted(event.target.checked)}
                                        className="mt-1 h-4 w-4 rounded border-subtle text-brand focus:ring-brand/40"
                                    />
                                    <span className="text-sm leading-relaxed text-text-primary">
                                        I consent to Edutu reviewing my submitted proof and contacting me about this mentor application.
                                    </span>
                                </label>
                            </div>

                            {submitError && (
                                <div className="mb-4 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">
                                    {submitError}
                                </div>
                            )}

                            <button
                                onClick={handleSubmit}
                                disabled={isSubmitting || !proofFile || !consentAccepted}
                                className={`w-full rounded-full px-6 py-4 font-semibold transition-all duration-300 hover:-translate-y-0.5 active:scale-[0.98] flex items-center justify-center gap-2 text-sm ${
                                    isSubmitting || !proofFile || !consentAccepted
                                        ? 'bg-surface-elevated text-text-muted cursor-not-allowed'
                                        : 'bg-brand text-white hover:bg-brand-700 focus-visible:ring-2 focus-visible:ring-brand/40'
                                }`}
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 size={16} className="animate-spin" /> Submitting...
                                    </>
                                ) : (
                                    <>
                                        Submit Application <ArrowRight size={16} />
                                    </>
                                )}
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>
        </div>
    );
};

export default MentorPage;
