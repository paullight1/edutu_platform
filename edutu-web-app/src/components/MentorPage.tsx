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
    ArrowLeft
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useDarkMode } from '../hooks/useDarkMode';
import { useAuth } from '@clerk/clerk-react';
import { supabase } from '../lib/supabaseClient';

interface MentorFormData {
    displayName: string;
    bio: string;
    contentType: string;
    experience: string;
    motivation: string;
    linkedInUrl: string;
    portfolioUrl: string;
}

const MENTOR_STEPS = ['intro', 'motivation', 'details', 'review'] as const;
type MentorStep = typeof MENTOR_STEPS[number];

const MOTIVATION_OPTIONS = [
    { id: 'help_others', text: "I want to help others achieve what I achieved", icon: Heart },
    { id: 'mentor', text: "I enjoy mentoring and sharing knowledge", icon: Users },
    { id: 'give_back', text: "I want to give back to the community", icon: Sparkles },
    { id: 'document', text: "I want to document my journey for others", icon: BookOpen },
    { id: 'pay_forward', text: "I believe in paying it forward", icon: Zap },
];

const CONTENT_TYPES = [
    { id: 'mentorship', label: 'Mentorship', icon: Users, color: '#146ef5', desc: '1-on-1 guidance sessions' },
    { id: 'course', label: 'Course', icon: BookOpen, color: '#7a3dff', desc: 'Structured learning paths' },
    { id: 'template', label: 'Templates', icon: Award, color: '#00d722', desc: 'CV, roadmap & resume templates' },
    { id: 'resource', label: 'Resources', icon: Star, color: '#ff6b00', desc: 'Study guides & materials' },
];

const MentorPage: React.FC = () => {
    const { isDarkMode, toggleDarkMode } = useDarkMode();
    const { userId } = useAuth();
    const [currentStep, setCurrentStep] = useState<MentorStep>('intro');
    const [formData, setFormData] = useState<MentorFormData>({
        displayName: '',
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

    const updateField = (field: keyof MentorFormData, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const canProceed = (): boolean => {
        switch (currentStep) {
            case 'intro': return true;
            case 'motivation': return !!formData.motivation;
            case 'details': return !!formData.displayName && !!formData.bio && !!formData.experience;
            case 'review': return true;
            default: return false;
        }
    };

    const handleSubmit = async () => {
        setIsSubmitting(true);
        try {
            const currentUserId = userId || 'anonymous';

            const { error } = await supabase
                .from('creator_applications')
                .insert({
                    userId: currentUserId,
                    displayName: formData.displayName,
                    bio: formData.bio,
                    contentType: formData.contentType,
                    experience: formData.experience,
                    sampleContentUrl: formData.portfolioUrl || formData.linkedInUrl,
                    status: 'pending',
                    submittedAt: new Date().toISOString(),
                });

            if (error) throw error;
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

    if (isSubmitted) {
        return (
            <div className="min-h-screen" style={{ backgroundColor: isDarkMode ? '#0a0a0a' : '#ffffff', color: isDarkMode ? '#f5f5f5' : '#080808' }}>
                <div className="max-w-[1200px] mx-auto px-4 sm:px-6 flex items-center justify-center min-h-screen">
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
                        <h1 className="text-3xl font-bold mb-3" style={{ color: isDarkMode ? '#fafafa' : '#0a0a0a' }}>
                            Application Sent!
                        </h1>
                        <p className="text-base leading-relaxed mb-8" style={{ color: isDarkMode ? '#888' : '#666' }}>
                            Thanks for applying to be a mentor. We'll review your application and get back to you within 2-3 business days.
                        </p>
                        <Link
                            to="/"
                            className="inline-flex items-center gap-2 px-8 py-3 rounded-xl text-sm font-bold"
                            style={{
                                backgroundColor: '#146ef5',
                                color: '#ffffff',
                            }}
                        >
                            <ArrowLeft size={16} />
                            Back to Home
                        </Link>
                    </motion.div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen" style={{ backgroundColor: isDarkMode ? '#0a0a0a' : '#ffffff', color: isDarkMode ? '#f5f5f5' : '#080808' }}>
            {/* Header */}
            <header className="sticky top-0 z-50 backdrop-blur-md" style={{ backgroundColor: isDarkMode ? 'rgba(10,10,10,0.9)' : 'rgba(255,255,255,0.95)', borderBottom: `1px solid ${isDarkMode ? '#1e1e1e' : '#e8e8e8'}` }}>
                <div className="max-w-[1200px] mx-auto px-4 sm:px-6 h-[64px] flex items-center justify-between">
                    <Link to="/" className="flex items-center gap-2">
                        <img src="/edutu-logo.png" alt="Edutu" className="h-8 w-8 object-contain" />
                        <span className="font-bold text-xl tracking-tight" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>edutu</span>
                    </Link>
                    <div className="flex items-center gap-4">
                        <Link to="/" className="text-sm font-medium" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                            Back to Home
                        </Link>
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
                                <h1 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight" style={{ color: isDarkMode ? '#fafafa' : '#0a0a0a' }}>
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
                                <p className="text-sm" style={{ color: isDarkMode ? '#888' : '#666' }}>Help learners understand your expertise.</p>
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

                                <div>
                                    <label className="block text-sm font-semibold mb-2" style={{ color: isDarkMode ? '#fafafa' : '#0a0a0a' }}>What will you teach?</label>
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
                                        placeholder="Share your background, achievements, and what makes you qualified to mentor..."
                                        rows={4}
                                        className="w-full px-4 py-3 rounded-xl text-sm resize-none"
                                        style={{
                                            backgroundColor: isDarkMode ? '#111' : '#fafafa',
                                            border: `1px solid ${isDarkMode ? '#1e1e1e' : '#e8e8e8'}`,
                                            color: isDarkMode ? '#fafafa' : '#0a0a0a',
                                        }}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold mb-2" style={{ color: isDarkMode ? '#fafafa' : '#0a0a0a' }}>Years of Experience</label>
                                    <input
                                        type="text"
                                        value={formData.experience}
                                        onChange={(e) => updateField('experience', e.target.value)}
                                        placeholder="e.g., 5 years in software engineering"
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
                                        <label className="block text-sm font-semibold mb-2" style={{ color: isDarkMode ? '#fafafa' : '#0a0a0a' }}>Portfolio URL</label>
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
                                    { label: 'Motivation', value: MOTIVATION_OPTIONS.find(m => m.id === formData.motivation)?.text || '' },
                                    { label: 'Content Type', value: CONTENT_TYPES.find(c => c.id === formData.contentType)?.label || '' },
                                    { label: 'Experience', value: formData.experience },
                                    { label: 'Bio', value: formData.bio },
                                    { label: 'LinkedIn', value: formData.linkedInUrl || 'Not provided' },
                                    { label: 'Portfolio', value: formData.portfolioUrl || 'Not provided' },
                                ].map((item, i) => (
                                    <div key={i} className="p-4 rounded-xl" style={{ backgroundColor: isDarkMode ? '#111' : '#fafafa', border: `1px solid ${isDarkMode ? '#1e1e1e' : '#e8e8e8'}` }}>
                                        <div className="text-xs font-semibold tracking-wide mb-1" style={{ color: isDarkMode ? '#888' : '#666' }}>{item.label}</div>
                                        <div className="text-sm" style={{ color: isDarkMode ? '#fafafa' : '#0a0a0a' }}>{item.value}</div>
                                    </div>
                                ))}
                            </div>

                            <button
                                onClick={handleSubmit}
                                disabled={isSubmitting}
                                className="w-full py-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                                style={{ backgroundColor: '#146ef5', color: '#fff' }}
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
