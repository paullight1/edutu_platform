import React, { useState } from 'react';
import {
    ArrowRight,
    Sparkles,
    Sun,
    Moon,
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
    Menu,
    X,
    DollarSign,
    Upload,
    FileCheck,
    Rocket
} from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useDarkMode } from '../hooks/useDarkMode';
import { useAuth, useUser } from '@clerk/clerk-react';
import { supabase } from '../lib/supabaseClient';
import PublicSiteMenu from './PublicSiteMenu';

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
    { id: 'mentorship', label: 'Mentor Support', icon: Users, color: '#146ef5', desc: 'Guide applicants from your lived experience' },
    { id: 'course', label: 'Success Guidance', icon: BookOpen, color: '#7a3dff', desc: 'Share the preparation that helped you win' },
    { id: 'materials', label: 'Application Materials', icon: Award, color: '#00d722', desc: 'Essays, checklists, and samples' },
    { id: 'resource', label: 'Opportunity Tips', icon: Star, color: '#ff6b00', desc: 'Practical advice for future applicants' },
];

const LANDING_OPTIONS = [
    {
        title: 'Become a Mentor',
        desc: 'Guide learners through scholarships, internships, career decisions, interviews, and applications.',
        icon: Users,
        color: '#146ef5',
    },
    {
        title: 'Share Guidance',
        desc: 'Turn your proven journey into practical guidance learners can use while applying.',
        icon: TrendingUp,
        color: '#7a3dff',
    },
    {
        title: 'Create Resources',
        desc: 'Publish checklists, guides, study plans, and application materials that help learners move faster.',
        icon: BookOpen,
        color: '#00b86b',
    },
];

const MentorPage: React.FC = () => {
    const { isDarkMode, toggleDarkMode } = useDarkMode();
    const { userId, isSignedIn } = useAuth();
    const { user } = useUser();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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

    const startApplication = () => {
        if (!isSignedIn) {
            navigate('/auth', { state: { from: { pathname: '/mentor', search: '?apply=1' } } });
            return;
        }

        setSearchParams({ apply: '1' });
        setShowApplication(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const showLandingPage = () => {
        setSearchParams({});
        setShowApplication(false);
        setCurrentStep('intro');
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

        const { data: urlData } = supabase.storage
            .from('creator-proofs')
            .getPublicUrl(data.path);

        return {
            path: data.path,
            url: urlData.publicUrl,
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
        try {
            const proof = await uploadProofFile(userId, proofFile);
            const contentTypeLabel = CONTENT_TYPES.find(c => c.id === formData.contentType)?.label || formData.contentType;
            const now = new Date().toISOString();
            const creatorMetadata = {
                expertise: contentTypeLabel,
                bio: formData.bio,
                portfolioUrl: formData.portfolioUrl,
                linkedin_url: formData.linkedInUrl,
                opportunity_type: contentTypeLabel,
                opportunity_title: `${contentTypeLabel} from ${formData.displayName}`,
                kyc_image_url: proof.url,
                proof_file_name: proofFile.name,
                proof_file_type: proofFile.type,
                proof_file_size: proofFile.size,
                proof_file_path: proof.path,
                phone_number: formData.phoneNumber,
                country: formData.country,
                email: formData.email,
                consent_accepted: consentAccepted,
                appliedAt: now,
            };

            const { error: profileError } = await supabase
                .from('profiles')
                .upsert({
                    user_id: userId,
                    full_name: formData.displayName,
                    email: formData.email,
                    country: formData.country,
                    role: 'user',
                    creator_status: 'pending',
                    creator_metadata: creatorMetadata,
                    updated_at: now,
                }, { onConflict: 'user_id' });

            if (profileError) throw profileError;

            const { error } = await supabase
                .from('creator_applications')
                .insert({
                    user_id: userId,
                    display_name: formData.displayName,
                    email: formData.email,
                    phoneNumber: formData.phoneNumber,
                    country: formData.country,
                    bio: formData.bio,
                    content_type: formData.contentType,
                    experience: formData.experience || 'Not specified',
                    sample_content_url: formData.portfolioUrl || formData.linkedInUrl,
                    proof_file_name: proofFile?.name || null,
                    proof_file_type: proofFile?.type || null,
                    proof_file_size: proofFile?.size || null,
                    proof_url: proof.url,
                    proof_path: proof.path,
                    consent_accepted: consentAccepted,
                    status: 'pending',
                    submitted_at: now,
                });

            if (error) {
                console.warn('Creator application audit insert failed after profile submission', error);
            }
            setIsSubmitted(true);
        } catch (err) {
            console.error('Submission error:', err);
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

    if (!showApplication) {
        return (
            <div className="min-h-[100dvh] bg-surface-body" style={{ backgroundColor: isDarkMode ? '#0a0a0a' : '#ffffff', color: isDarkMode ? '#f5f5f5' : '#080808' }}>
                <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md transition-colors duration-300" style={{ backgroundColor: isDarkMode ? 'rgba(10,10,10,0.92)' : 'rgba(255,255,255,0.95)', borderBottom: `1px solid ${isDarkMode ? '#1e1e1e' : '#e8e8e8'}` }}>
                    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 h-[64px] flex items-center justify-between">
                        <Link to="/" className="flex items-center gap-2">
                            <img src="/edutu-logo.png" alt="Edutu" className="h-8 w-8 object-contain" />
                            <span className="font-bold text-xl tracking-tight" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>edutu</span>
                        </Link>
                        <PublicSiteMenu />
                    </div>
                </header>

                <main>
                    <section className="relative overflow-hidden">
                        <div className="absolute inset-0" style={{ background: isDarkMode ? 'radial-gradient(circle at 50% 10%, rgba(20,110,245,0.16), transparent 34%)' : 'radial-gradient(circle at 50% 10%, rgba(20,110,245,0.08), transparent 35%)' }} />
                        <div className="relative max-w-[1200px] mx-auto px-4 sm:px-6 pt-32 pb-20 md:pt-36 md:pb-28 text-center">
                            <motion.div
                                initial={{ opacity: 0, y: 14 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="inline-flex items-center gap-2 px-4 py-2 mb-8 rounded-full"
                                style={{
                                    backgroundColor: isDarkMode ? 'rgba(20,110,245,0.08)' : 'rgba(20,110,245,0.06)',
                                    border: `1px solid ${isDarkMode ? 'rgba(20,110,245,0.18)' : 'rgba(20,110,245,0.14)'}`,
                                    color: '#146ef5',
                                }}
                            >
                                <Sparkles size={14} />
                                <span className="text-xs font-bold tracking-widest">MENTOR WITH EDUTU</span>
                            </motion.div>

                            <motion.h1
                                initial={{ opacity: 0, y: 18 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.05 }}
                                className="max-w-3xl mx-auto text-[clamp(2rem,4.4vw,3.35rem)] md:text-[clamp(2.35rem,4.6vw,4rem)] font-medium tracking-[-0.03em] leading-[1.06] mb-7"
                                style={{ color: isDarkMode ? '#fafafa' : '#080808' }}
                            >
                                Help ambitious learners turn opportunity into{' '}
                                <span style={{ color: '#146ef5' }}>real outcomes.</span>
                            </motion.h1>

                            <motion.p
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1 }}
                                className="max-w-2xl mx-auto text-base md:text-lg leading-relaxed mb-10"
                                style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}
                            >
                                Join Edutu as a mentor or resource expert. Share what worked for you and help students prepare stronger applications, career plans, and next steps.
                            </motion.p>

                            <motion.div
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.15 }}
                                className="flex flex-col sm:flex-row items-center justify-center gap-4"
                            >
                                <button
                                    type="button"
                                    onClick={startApplication}
                                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl text-sm font-bold shadow-xl shadow-blue-600/20"
                                    style={{ backgroundColor: '#146ef5', color: '#ffffff' }}
                                >
                                    Become a Mentor <ArrowRight size={16} />
                                </button>
                                <a
                                    href="#options"
                                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl text-sm font-bold border"
                                    style={{ borderColor: isDarkMode ? '#2a2a2a' : '#d8d8d8', color: isDarkMode ? '#fafafa' : '#080808' }}
                                >
                                    Explore Options <PlayCircle size={16} />
                                </a>
                            </motion.div>
                        </div>
                    </section>

                    <section id="why" className="max-w-[1200px] mx-auto px-4 sm:px-6 py-12">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 border-y py-10" style={{ borderColor: isDarkMode ? '#1e1e1e' : '#e8e8e8' }}>
                            {[
                                { num: '$1,070,304', label: 'Funding opportunities', icon: DollarSign, color: '#00b86b' },
                                { num: '20+', label: 'Verified mentors', icon: Users, color: '#146ef5' },
                                { num: '8,400+', label: 'Learner impacts', icon: Award, color: '#ffae13' },
                                { num: '31+', label: 'Countries reached', icon: Globe, color: '#00a6d6' },
                            ].map((stat) => (
                                <div
                                    key={stat.label}
                                    className="text-center"
                                >
                                    <stat.icon size={22} className="mx-auto" style={{ color: stat.color }} />
                                    <div className="mt-4 text-2xl md:text-3xl font-semibold" style={{ color: stat.color }}>{stat.num}</div>
                                    <div className="mt-2 text-xs font-bold tracking-[0.16em] uppercase" style={{ color: isDarkMode ? '#888' : '#666' }}>{stat.label}</div>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section id="options" className="max-w-[1200px] mx-auto px-4 sm:px-6 py-16">
                        <div className="text-center mb-10">
                            <h2 className="text-2xl md:text-3xl font-semibold mb-3" style={{ color: isDarkMode ? '#fafafa' : '#080808' }}>
                                Choose how you want to help
                            </h2>
                            <p className="max-w-xl mx-auto text-base" style={{ color: isDarkMode ? '#888' : '#666' }}>
                                Start with mentorship, resources, or repeatable guidance. Edutu turns your expertise into structured learner support.
                            </p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                            {LANDING_OPTIONS.map((option, index) => (
                                <button
                                    type="button"
                                    key={option.title}
                                    onClick={startApplication}
                                    className="group p-7 rounded-3xl border text-left transition-all hover:-translate-y-1"
                                    style={{
                                        background: isDarkMode
                                            ? `linear-gradient(135deg, ${option.color}20, #111 52%)`
                                            : index === 0
                                                ? 'linear-gradient(135deg, #eaf3ff, #ffffff)'
                                                : index === 1
                                                    ? 'linear-gradient(135deg, #fff7df, #ffffff)'
                                                    : 'linear-gradient(135deg, #eafff5, #ffffff)',
                                        borderColor: `${option.color}35`,
                                    }}
                                >
                                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-7" style={{ backgroundColor: `${option.color}14`, color: option.color }}>
                                        <option.icon size={22} />
                                    </div>
                                    <h3 className="text-lg font-semibold mb-3" style={{ color: isDarkMode ? '#fafafa' : '#080808' }}>{option.title}</h3>
                                    <p className="text-sm leading-relaxed mb-6" style={{ color: isDarkMode ? '#888' : '#666' }}>{option.desc}</p>
                                    <span className="inline-flex items-center gap-2 text-sm font-bold" style={{ color: option.color }}>
                                        Apply now <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
                                    </span>
                                </button>
                            ))}
                        </div>
                    </section>

                    <section id="process" className="max-w-[1200px] mx-auto px-4 sm:px-6 py-16">
                        <div className="rounded-[28px] border p-6 md:p-10" style={{ backgroundColor: isDarkMode ? '#111' : '#fafafa', borderColor: isDarkMode ? '#1e1e1e' : '#e8e8e8' }}>
                            <div className="grid grid-cols-1 md:grid-cols-[0.9fr_1.1fr] gap-8 items-center">
                                <div>
                                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold mb-5" style={{ backgroundColor: '#146ef510', color: '#146ef5' }}>
                                        <ShieldCheck size={14} /> Verified mentor flow
                                    </div>
                                    <h2 className="text-2xl font-semibold mb-4" style={{ color: isDarkMode ? '#fafafa' : '#080808' }}>Apply once. Support learners at scale.</h2>
                                    <p className="text-base leading-relaxed" style={{ color: isDarkMode ? '#888' : '#666' }}>
                                        We review each mentor application so learners get trusted, relevant guidance. Once accepted, you can publish resources and offer mentorship inside Edutu.
                                    </p>
                                </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                {[
                                        { title: 'Sign up', desc: 'Create or access your Edutu account.', icon: Users },
                                        { title: 'Apply', desc: 'Tell us your expertise and mentoring focus.', icon: FileCheck },
                                        { title: 'Launch', desc: 'Start helping learners after approval.', icon: Rocket },
                                    ].map((step, index) => (
                                        <div key={step.title} className="p-5 rounded-2xl border" style={{ backgroundColor: isDarkMode ? '#0a0a0a' : '#ffffff', borderColor: isDarkMode ? '#1e1e1e' : '#e8e8e8' }}>
                                            <div className="w-11 h-11 rounded-2xl flex items-center justify-center mb-5" style={{ backgroundColor: '#146ef510', color: '#146ef5' }}>
                                                <step.icon size={20} />
                                            </div>
                                            <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold mb-5" style={{ backgroundColor: '#146ef5', color: '#fff' }}>{index + 1}</div>
                                            <h3 className="font-bold mb-2" style={{ color: isDarkMode ? '#fafafa' : '#080808' }}>{step.title}</h3>
                                            <p className="text-sm leading-relaxed" style={{ color: isDarkMode ? '#888' : '#666' }}>{step.desc}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </section>

                    <section className="max-w-[1200px] mx-auto px-4 sm:px-6 py-16 text-center">
                        <div
                            className="relative overflow-hidden rounded-[28px] p-8 md:p-12"
                            style={{
                                backgroundImage: "linear-gradient(135deg, rgba(8,8,8,0.78), rgba(20,110,245,0.64)), url('https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg')",
                                backgroundSize: 'cover',
                                backgroundPosition: 'center',
                                color: '#ffffff',
                            }}
                        >
                            <div className="relative z-10">
                                <MessageCircle size={30} className="mx-auto mb-5" />
                                <h2 className="text-2xl md:text-3xl font-semibold mb-4">Guide learners into funded opportunities</h2>
                                <p className="max-w-2xl mx-auto text-white/80 mb-8">
                                    Share your journey, then guide learners with a clearer path, better tools, and more confidence.
                                </p>
                                <div className="mb-8 flex flex-wrap items-center justify-center gap-3">
                                    {[
                                        { label: 'Scholarships', icon: BookOpen },
                                        { label: 'Applications', icon: FileCheck },
                                        { label: 'Global Reach', icon: Globe },
                                    ].map((item) => (
                                        <div key={item.label} className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold" style={{ backgroundColor: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.16)' }}>
                                            <item.icon size={14} />
                                            {item.label}
                                        </div>
                                    ))}
                                </div>
                                <button
                                    type="button"
                                    onClick={startApplication}
                                    className="inline-flex items-center gap-2 px-8 py-4 rounded-xl text-sm font-bold bg-white text-[#146ef5]"
                                >
                                    Become a Mentor <ArrowRight size={16} />
                                </button>
                            </div>
                        </div>
                    </section>
                </main>
                <footer className="max-w-[1200px] mx-auto px-4 sm:px-6 pb-10">
                    <div className="flex items-center justify-between border-t pt-6" style={{ borderColor: isDarkMode ? '#1e1e1e' : '#e8e8e8' }}>
                        <span className="text-sm" style={{ color: isDarkMode ? '#888' : '#666' }}>
                            Edutu mentor program
                        </span>
                        <button
                            type="button"
                            onClick={toggleDarkMode}
                            className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold"
                            style={{
                                borderColor: isDarkMode ? '#2a2a2a' : '#e8e8e8',
                                color: isDarkMode ? '#fafafa' : '#080808',
                                backgroundColor: isDarkMode ? '#111' : '#ffffff',
                            }}
                            aria-label="Toggle theme"
                        >
                            {isDarkMode ? <Sun size={17} /> : <Moon size={17} />}
                            {isDarkMode ? 'Light mode' : 'Dark mode'}
                        </button>
                    </div>
                </footer>
            </div>
        );
    }

    if (isSubmitted) {
        return (
            <div className="min-h-[100dvh]" style={{ backgroundColor: isDarkMode ? '#0a0a0a' : '#ffffff', color: isDarkMode ? '#f5f5f5' : '#080808' }}>
                <div className="max-w-[1200px] mx-auto px-4 sm:px-6 flex items-center justify-center min-h-[100dvh]">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.5 }}
                        className="text-center max-w-md"
                    >
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ duration: 0.5, delay: 0.2, type: 'spring' }}
                            className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
                            style={{
                                background: 'linear-gradient(135deg, #146ef5, #7a3dff)',
                                boxShadow: '0 8px 32px rgba(20,110,245,0.3)',
                            }}
                        >
                            <CheckCircle size={40} className="text-white" />
                        </motion.div>
                        <h1 className="text-2xl font-semibold mb-3" style={{ color: isDarkMode ? '#fafafa' : '#0a0a0a' }}>
                            Application Sent!
                        </h1>
                        <p className="text-base leading-relaxed mb-8" style={{ color: isDarkMode ? '#888' : '#666' }}>
                            Thanks for applying to be a mentor. We'll review your application and get back to you within 2-3 business days.
                        </p>
                        <div className="flex justify-center">
                            <PublicSiteMenu />
                        </div>
                    </motion.div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-[100dvh]" style={{ backgroundColor: isDarkMode ? '#0a0a0a' : '#ffffff', color: isDarkMode ? '#f5f5f5' : '#080808' }}>
            {/* Header */}
            <header className="sticky top-0 z-50 backdrop-blur-md" style={{ backgroundColor: isDarkMode ? 'rgba(10,10,10,0.9)' : 'rgba(255,255,255,0.95)', borderBottom: `1px solid ${isDarkMode ? '#1e1e1e' : '#e8e8e8'}` }}>
                <div className="max-w-[1200px] mx-auto px-4 sm:px-6 h-[64px] flex items-center justify-between">
                    <Link to="/" className="flex items-center gap-2">
                        <img src="/edutu-logo.png" alt="Edutu" className="h-8 w-8 object-contain" />
                        <span className="font-bold text-xl tracking-tight" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>edutu</span>
                    </Link>
                    <div className="flex items-center gap-4">
                        <button onClick={showLandingPage} className="text-sm font-medium" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                            Mentor Overview
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-[800px] mx-auto px-4 sm:px-6 py-12">
                {/* Step Progress */}
                <div className="flex items-center justify-center gap-3 mb-12">
                    {MENTOR_STEPS.map((s, i) => (
                        <React.Fragment key={s}>
                            <motion.div
                                animate={{
                                    scale: i === stepIndex ? 1.2 : 1,
                                    backgroundColor: i <= stepIndex ? '#146ef5' : isDarkMode ? '#2a2a2a' : '#e5e5e5',
                                }}
                                className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold"
                                style={{ color: i <= stepIndex ? '#fff' : isDarkMode ? '#666' : '#888' }}
                            >
                                {i < stepIndex ? <CheckCircle size={16} /> : i + 1}
                            </motion.div>
                            {i < MENTOR_STEPS.length - 1 && (
                                <div className="w-16 h-0.5 rounded-full" style={{ backgroundColor: i < stepIndex ? '#146ef5' : isDarkMode ? '#2a2a2a' : '#e5e5e5' }} />
                            )}
                        </React.Fragment>
                    ))}
                </div>

                <AnimatePresence mode="wait">
                    {/* STEP 1: INTRO */}
                    {currentStep === 'intro' && (
                        <motion.div
                            key="intro"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.3 }}
                        >
                            <div className="text-center mb-12">
                                <div className="inline-flex items-center gap-2 px-4 py-2 mb-6 rounded-full" style={{
                                    backgroundColor: isDarkMode ? 'rgba(20,110,245,0.08)' : 'rgba(20,110,245,0.06)',
                                    border: `1px solid ${isDarkMode ? 'rgba(20,110,245,0.15)' : 'rgba(20,110,245,0.12)'}`,
                                }}>
                                    <Sparkles size={14} className="text-[#146ef5]" />
                                    <span className="text-xs font-bold tracking-widest text-[#146ef5]">Become a Mentor</span>
                                </div>
                                <h1 className="text-3xl md:text-4xl font-semibold mb-4 tracking-tight" style={{ color: isDarkMode ? '#fafafa' : '#0a0a0a' }}>
                                    Share Your <span style={{ color: '#146ef5' }}>Success Story</span>
                                </h1>
                                <p className="max-w-lg mx-auto text-base leading-relaxed" style={{ color: isDarkMode ? '#888' : '#666' }}>
                                    You've achieved something incredible. Help others get there too by sharing your knowledge and experience.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                                {[
                                    { num: '10K+', label: 'Learners Helped', icon: Users, color: '#146ef5' },
                                    { num: '500+', label: 'Mentors Active', icon: Award, color: '#7a3dff' },
                                    { num: '85%', label: 'Revenue Share', icon: Star, color: '#00d722' },
                                ].map((stat, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.1 }}
                                        className="p-6 rounded-2xl text-center"
                                        style={{
                                            backgroundColor: isDarkMode ? '#111' : '#fafafa',
                                            border: `1px solid ${isDarkMode ? '#1e1e1e' : '#e8e8e8'}`,
                                        }}
                                    >
                                        <stat.icon size={20} style={{ color: stat.color, margin: '0 auto 8px' }} />
                                        <div className="text-2xl font-bold" style={{ color: stat.color }}>{stat.num}</div>
                                        <div className="text-xs font-medium" style={{ color: isDarkMode ? '#888' : '#666' }}>{stat.label}</div>
                                    </motion.div>
                                ))}
                            </div>

                            <div className="p-6 rounded-2xl mb-8" style={{
                                backgroundColor: isDarkMode ? 'rgba(20,110,245,0.05)' : 'rgba(20,110,245,0.04)',
                                border: `1px solid ${isDarkMode ? 'rgba(20,110,245,0.15)' : 'rgba(20,110,245,0.1)'}`,
                            }}>
                                <div className="flex items-start gap-4">
                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#146ef5' }}>
                                        <Globe size={18} className="text-white" />
                                    </div>
                                    <div>
                                        <h3 className="text-base font-semibold mb-1" style={{ color: isDarkMode ? '#fafafa' : '#0a0a0a' }}>Global Impact</h3>
                                        <p className="text-sm leading-relaxed" style={{ color: isDarkMode ? '#888' : '#666' }}>
                                            Reach learners from 31+ countries. Your experience can change someone's life anywhere in the world.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={nextStep}
                                className="w-full py-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                                style={{ backgroundColor: '#146ef5', color: '#fff' }}
                            >
                                Get Started <ArrowRight size={16} />
                            </button>
                        </motion.div>
                    )}

                    {/* STEP 2: MOTIVATION */}
                    {currentStep === 'motivation' && (
                        <motion.div
                            key="motivation"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.3 }}
                        >
                            <div className="mb-8">
                                <button onClick={prevStep} className="flex items-center gap-1 text-sm mb-6" style={{ color: isDarkMode ? '#888' : '#666' }}>
                                    <ArrowLeft size={14} /> Back
                                </button>
                                <h2 className="text-2xl font-bold mb-2" style={{ color: isDarkMode ? '#fafafa' : '#0a0a0a' }}>What motivates you?</h2>
                                <p className="text-sm" style={{ color: isDarkMode ? '#888' : '#666' }}>Choose the reason that best describes why you want to mentor.</p>
                            </div>

                            <div className="space-y-3 mb-8">
                                {MOTIVATION_OPTIONS.map((option) => {
                                    const isSelected = formData.motivation === option.id;
                                    return (
                                        <motion.button
                                            key={option.id}
                                            whileHover={{ scale: 1.01 }}
                                            whileTap={{ scale: 0.99 }}
                                            onClick={() => updateField('motivation', option.id)}
                                            className="w-full p-5 rounded-2xl flex items-center gap-4 text-left transition-all"
                                            style={{
                                                backgroundColor: isSelected
                                                    ? isDarkMode ? 'rgba(20,110,245,0.12)' : 'rgba(20,110,245,0.06)'
                                                    : isDarkMode ? '#111' : '#fafafa',
                                                border: `2px solid ${isSelected ? '#146ef5' : isDarkMode ? '#1e1e1e' : '#e8e8e8'}`,
                                            }}
                                        >
                                            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{
                                                backgroundColor: isSelected ? '#146ef5' : isDarkMode ? '#1e1e1e' : '#e5e5e5',
                                            }}>
                                                <option.icon size={18} className={isSelected ? 'text-white' : ''} style={{ color: isSelected ? '#fff' : isDarkMode ? '#888' : '#666' }} />
                                            </div>
                                            <span className="text-sm font-medium" style={{ color: isSelected ? '#146ef5' : isDarkMode ? '#fafafa' : '#0a0a0a' }}>
                                                {option.text}
                                            </span>
                                        </motion.button>
                                    );
                                })}
                            </div>

                            <button
                                onClick={nextStep}
                                disabled={!canProceed()}
                                className="w-full py-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all"
                                style={{
                                    backgroundColor: canProceed() ? '#146ef5' : isDarkMode ? '#1e1e1e' : '#e5e5e5',
                                    color: canProceed() ? '#fff' : isDarkMode ? '#666' : '#888',
                                    cursor: canProceed() ? 'pointer' : 'not-allowed',
                                }}
                            >
                                Continue <ArrowRight size={16} />
                            </button>
                        </motion.div>
                    )}

                    {/* STEP 3: DETAILS */}
                    {currentStep === 'details' && (
                        <motion.div
                            key="details"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.3 }}
                        >
                            <div className="mb-8">
                                <button onClick={prevStep} className="flex items-center gap-1 text-sm mb-6" style={{ color: isDarkMode ? '#888' : '#666' }}>
                                    <ArrowLeft size={14} /> Back
                                </button>
                                <h2 className="text-2xl font-bold mb-2" style={{ color: isDarkMode ? '#fafafa' : '#0a0a0a' }}>Tell us about yourself</h2>
                                <p className="text-sm" style={{ color: isDarkMode ? '#888' : '#666' }}>Help learners understand the opportunity you won and how you can support them.</p>
                            </div>

                            <div className="space-y-6 mb-8">
                                <div>
                                    <label className="block text-sm font-semibold mb-2" style={{ color: isDarkMode ? '#fafafa' : '#0a0a0a' }}>Display Name</label>
                                    <input
                                        type="text"
                                        value={formData.displayName}
                                        onChange={(e) => updateField('displayName', e.target.value)}
                                        placeholder="How should learners know you?"
                                        className="w-full px-4 py-3 rounded-xl text-sm"
                                        style={{
                                            backgroundColor: isDarkMode ? '#111' : '#fafafa',
                                            border: `1px solid ${isDarkMode ? '#1e1e1e' : '#e8e8e8'}`,
                                            color: isDarkMode ? '#fafafa' : '#0a0a0a',
                                        }}
                                    />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-semibold mb-2" style={{ color: isDarkMode ? '#fafafa' : '#0a0a0a' }}>Email Address</label>
                                        <input
                                            type="email"
                                            value={formData.email}
                                            onChange={(e) => updateField('email', e.target.value)}
                                            placeholder="you@example.com"
                                            className="w-full px-4 py-3 rounded-xl text-sm"
                                            style={{
                                                backgroundColor: isDarkMode ? '#111' : '#fafafa',
                                                border: `1px solid ${isDarkMode ? '#1e1e1e' : '#e8e8e8'}`,
                                                color: isDarkMode ? '#fafafa' : '#0a0a0a',
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold mb-2" style={{ color: isDarkMode ? '#fafafa' : '#0a0a0a' }}>Phone Number</label>
                                        <input
                                            type="tel"
                                            value={formData.phoneNumber}
                                            onChange={(e) => updateField('phoneNumber', e.target.value)}
                                            placeholder="+234 800 000 0000"
                                            className="w-full px-4 py-3 rounded-xl text-sm"
                                            style={{
                                                backgroundColor: isDarkMode ? '#111' : '#fafafa',
                                                border: `1px solid ${isDarkMode ? '#1e1e1e' : '#e8e8e8'}`,
                                                color: isDarkMode ? '#fafafa' : '#0a0a0a',
                                            }}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold mb-2" style={{ color: isDarkMode ? '#fafafa' : '#0a0a0a' }}>Country</label>
                                    <select
                                        value={formData.country}
                                        onChange={(e) => updateField('country', e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl text-sm"
                                        style={{
                                            backgroundColor: isDarkMode ? '#111' : '#fafafa',
                                            border: `1px solid ${isDarkMode ? '#1e1e1e' : '#e8e8e8'}`,
                                            color: isDarkMode ? '#fafafa' : '#0a0a0a',
                                        }}
                                    >
                                        <option value="">Select your country</option>
                                        {COUNTRY_OPTIONS.map((country) => (
                                            <option key={country} value={country}>{country}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold mb-2" style={{ color: isDarkMode ? '#fafafa' : '#0a0a0a' }}>What experience can you share?</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        {CONTENT_TYPES.map((type) => {
                                            const isSelected = formData.contentType === type.id;
                                            return (
                                                <button
                                                    key={type.id}
                                                    onClick={() => updateField('contentType', type.id)}
                                                    className="p-4 rounded-xl text-left transition-all"
                                                    style={{
                                                        backgroundColor: isSelected
                                                            ? isDarkMode ? 'rgba(20,110,245,0.12)' : 'rgba(20,110,245,0.06)'
                                                            : isDarkMode ? '#111' : '#fafafa',
                                                        border: `2px solid ${isSelected ? type.color : isDarkMode ? '#1e1e1e' : '#e8e8e8'}`,
                                                    }}
                                                >
                                                    <type.icon size={16} style={{ color: type.color, marginBottom: 8 }} />
                                                    <div className="text-sm font-semibold" style={{ color: isDarkMode ? '#fafafa' : '#0a0a0a' }}>{type.label}</div>
                                                    <div className="text-xs" style={{ color: isDarkMode ? '#888' : '#666' }}>{type.desc}</div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold mb-2" style={{ color: isDarkMode ? '#fafafa' : '#0a0a0a' }}>Your Bio</label>
                                    <textarea
                                        value={formData.bio}
                                        onChange={(e) => updateField('bio', e.target.value)}
                                        placeholder="Share the opportunity you benefited from, what helped you win, and how you can guide future applicants..."
                                        rows={4}
                                        className="w-full px-4 py-3 rounded-xl text-sm resize-none"
                                        style={{
                                            backgroundColor: isDarkMode ? '#111' : '#fafafa',
                                            border: `1px solid ${isDarkMode ? '#1e1e1e' : '#e8e8e8'}`,
                                            color: isDarkMode ? '#fafafa' : '#0a0a0a',
                                        }}
                                    />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-semibold mb-2" style={{ color: isDarkMode ? '#fafafa' : '#0a0a0a' }}>LinkedIn URL</label>
                                        <input
                                            type="url"
                                            value={formData.linkedInUrl}
                                            onChange={(e) => updateField('linkedInUrl', e.target.value)}
                                            placeholder="https://linkedin.com/in/..."
                                            className="w-full px-4 py-3 rounded-xl text-sm"
                                            style={{
                                                backgroundColor: isDarkMode ? '#111' : '#fafafa',
                                                border: `1px solid ${isDarkMode ? '#1e1e1e' : '#e8e8e8'}`,
                                                color: isDarkMode ? '#fafafa' : '#0a0a0a',
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold mb-2" style={{ color: isDarkMode ? '#fafafa' : '#0a0a0a' }}>Portfolio URL <span style={{ color: isDarkMode ? '#888' : '#666', fontWeight: 500 }}>(optional)</span></label>
                                        <input
                                            type="url"
                                            value={formData.portfolioUrl}
                                            onChange={(e) => updateField('portfolioUrl', e.target.value)}
                                            placeholder="https://your-portfolio.com"
                                            className="w-full px-4 py-3 rounded-xl text-sm"
                                            style={{
                                                backgroundColor: isDarkMode ? '#111' : '#fafafa',
                                                border: `1px solid ${isDarkMode ? '#1e1e1e' : '#e8e8e8'}`,
                                                color: isDarkMode ? '#fafafa' : '#0a0a0a',
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={nextStep}
                                disabled={!canProceed()}
                                className="w-full py-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all"
                                style={{
                                    backgroundColor: canProceed() ? '#146ef5' : isDarkMode ? '#1e1e1e' : '#e5e5e5',
                                    color: canProceed() ? '#fff' : isDarkMode ? '#666' : '#888',
                                    cursor: canProceed() ? 'pointer' : 'not-allowed',
                                }}
                            >
                                Review Application <ArrowRight size={16} />
                            </button>
                        </motion.div>
                    )}

                    {/* STEP 4: REVIEW */}
                    {currentStep === 'review' && (
                        <motion.div
                            key="review"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.3 }}
                        >
                            <div className="mb-8">
                                <button onClick={prevStep} className="flex items-center gap-1 text-sm mb-6" style={{ color: isDarkMode ? '#888' : '#666' }}>
                                    <ArrowLeft size={14} /> Back
                                </button>
                                <h2 className="text-2xl font-bold mb-2" style={{ color: isDarkMode ? '#fafafa' : '#0a0a0a' }}>Review your application</h2>
                                <p className="text-sm" style={{ color: isDarkMode ? '#888' : '#666' }}>Make sure everything looks good before submitting.</p>
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
                                    <div key={i} className="p-4 rounded-xl" style={{ backgroundColor: isDarkMode ? '#111' : '#fafafa', border: `1px solid ${isDarkMode ? '#1e1e1e' : '#e8e8e8'}` }}>
                                        <div className="text-xs font-semibold tracking-wide mb-1" style={{ color: isDarkMode ? '#888' : '#666' }}>{item.label}</div>
                                        <div className="text-sm" style={{ color: isDarkMode ? '#fafafa' : '#0a0a0a' }}>{item.value}</div>
                                    </div>
                                ))}
                            </div>

                            <div className="space-y-4 mb-8">
                                <label
                                    className="block rounded-2xl border p-5 cursor-pointer transition-all"
                                    style={{
                                        backgroundColor: isDarkMode ? '#111' : '#fafafa',
                                        borderColor: proofFile ? '#00b86b' : isDarkMode ? '#1e1e1e' : '#e8e8e8',
                                    }}
                                >
                                    <input
                                        type="file"
                                        accept="image/*,.pdf,application/pdf"
                                        className="hidden"
                                        onChange={handleProofUpload}
                                    />
                                    <div className="flex items-start gap-4">
                                        <div className="h-11 w-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: proofFile ? '#00b86b18' : '#146ef510', color: proofFile ? '#00b86b' : '#146ef5' }}>
                                            {proofFile ? <FileCheck size={21} /> : <Upload size={21} />}
                                        </div>
                                        <div className="flex-1">
                                            <div className="text-sm font-bold mb-1" style={{ color: isDarkMode ? '#fafafa' : '#0a0a0a' }}>
                                                Upload proof of your award or opportunity
                                            </div>
                                            <p className="text-xs leading-relaxed" style={{ color: isDarkMode ? '#888' : '#666' }}>
                                                PDF or image showing your scholarship, fellowship, internship, grant, admission, or award confirmation.
                                            </p>
                                            {proofFile && (
                                                <p className="mt-2 text-xs font-bold" style={{ color: '#00b86b' }}>
                                                    {proofFile.name}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </label>

                                <label
                                    className="flex items-start gap-3 rounded-2xl border p-5 cursor-pointer"
                                    style={{
                                        backgroundColor: isDarkMode ? '#111' : '#fafafa',
                                        borderColor: consentAccepted ? '#146ef5' : isDarkMode ? '#1e1e1e' : '#e8e8e8',
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={consentAccepted}
                                        onChange={(event) => setConsentAccepted(event.target.checked)}
                                        className="mt-1 h-4 w-4"
                                    />
                                    <span className="text-sm leading-relaxed" style={{ color: isDarkMode ? '#d8d8d8' : '#222' }}>
                                        I consent to Edutu reviewing my submitted proof and contacting me about this mentor application.
                                    </span>
                                </label>
                            </div>

                            <button
                                onClick={handleSubmit}
                                disabled={isSubmitting || !proofFile || !consentAccepted}
                                className="w-full py-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                                style={{
                                    backgroundColor: isSubmitting || !proofFile || !consentAccepted ? isDarkMode ? '#1e1e1e' : '#e5e5e5' : '#146ef5',
                                    color: isSubmitting || !proofFile || !consentAccepted ? isDarkMode ? '#666' : '#888' : '#fff',
                                    cursor: isSubmitting || !proofFile || !consentAccepted ? 'not-allowed' : 'pointer',
                                }}
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
