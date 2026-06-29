import React, { useState, useEffect } from 'react';
import {
    ArrowRight,
    Calendar,
    Clock,
    User,
    Twitter,
    Linkedin,
    Sun,
    Moon,
    Sparkles,
    Github,
    Users,
    BarChart3,
    ChevronDown,
    type LucideIcon
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useDarkMode } from '../hooks/useDarkMode';
import { useOpportunities } from '../hooks/useOpportunities';
import BentoBenefits from './BentoBenefits';
import PublicHeader from './PublicHeader';

const docsUrl = import.meta.env.VITE_DOCS_URL || 'https://docs.edutu.org';

interface LandingPageProps {
    onGetStarted: () => void;
}

interface FAQItem {
    question: string;
    answer: string;
}

const faqData: FAQItem[] = [
    {
        question: 'What is Edutu?',
        answer: 'Edutu is an AI-powered career opportunity platform that helps you discover scholarships, fellowships, internships, and programs from over 31 countries.'
    },
    {
        question: 'Is Edutu free to use?',
        answer: 'Yes. You can browse opportunities and access core tracking features for free.'
    },
    {
        question: 'How do I apply for opportunities?',
        answer: 'You need to create an account first. Once logged in, you can browse opportunities and apply directly.'
    },
    {
        question: 'Can I track my applications?',
        answer: 'Yes, our dashboard lets you track all your applications, deadlines, and progress in one place.'
    },
    {
        question: 'What countries are covered?',
        answer: 'We cover opportunities from 31+ countries including USA, UK, Germany, Australia, Canada, Japan, and many more.'
    }
];

const flags = [
    'https://flagcdn.com/w80/ng.png',
    'https://flagcdn.com/w80/ke.png',
    'https://flagcdn.com/w80/in.png',
    'https://flagcdn.com/w80/gb.png',
    'https://flagcdn.com/w80/us.png',
    'https://flagcdn.com/w80/de.png',
    'https://flagcdn.com/w80/fr.png',
    'https://flagcdn.com/w80/au.png',
    'https://flagcdn.com/w80/ca.png',
    'https://flagcdn.com/w80/jp.png',
    'https://flagcdn.com/w80/br.png',
    'https://flagcdn.com/w80/za.png',
    'https://flagcdn.com/w80/gh.png',
    'https://flagcdn.com/w80/eg.png',
    'https://flagcdn.com/w80/sg.png',
    'https://flagcdn.com/w80/cn.png',
];

const institutions = [
    { name: 'Harvard University', logo: 'https://commons.wikimedia.org/wiki/Special:FilePath/Harvard_University_logo.svg' },
    { name: 'University of Oxford', logo: 'https://commons.wikimedia.org/wiki/Special:FilePath/Oxford-University-Circlet.svg' },
    { name: 'MIT', logo: 'https://commons.wikimedia.org/wiki/Special:FilePath/MIT_logo.svg' },
    { name: 'Stanford University', logo: 'https://commons.wikimedia.org/wiki/Special:FilePath/Stanford_Cardinal_logo.svg' },
    { name: 'University of Cambridge', logo: 'https://commons.wikimedia.org/wiki/Special:FilePath/University_of_Cambridge_coat_of_arms.svg' },
    { name: 'Yale University', logo: 'https://commons.wikimedia.org/wiki/Special:FilePath/Yale_University_logo.svg' },
    { name: 'University of Toronto', logo: 'https://commons.wikimedia.org/wiki/Special:FilePath/University_of_Toronto_coat_of_arms.svg' },
    { name: 'ETH Zurich', logo: 'https://commons.wikimedia.org/wiki/Special:FilePath/ETH_Z%C3%BCrich_Logo.svg' },
];

const heroOpportunityWords = ['Opportunities', 'Scholarships', 'Internships', 'Fellowships'];



const heroBackdropImages = [
    {
        src: 'https://images.pexels.com/photos/267885/pexels-photo-267885.jpeg',
        alt: 'Graduates celebrating a milestone',
    },
    {
        src: 'https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg',
        alt: 'Students collaborating around a laptop',
    },
    {
        src: 'https://images.pexels.com/photos/1181671/pexels-photo-1181671.jpeg',
        alt: 'A student studying on campus',
    },
    {
        src: 'https://images.pexels.com/photos/1595391/pexels-photo-1595391.jpeg',
        alt: 'Learners gathering in a bright classroom',
    },
];

interface LandingArticle {
    category: string;
    title: string;
    excerpt: string;
    author: string;
    date: string;
    readTime: string;
    image: string;
}

const landingBlogArticles: LandingArticle[] = [
    {
        category: 'Scholarships',
        title: 'How to Win Scholarships in 2026: AI-Powered Strategies',
        excerpt: 'Use AI to spot the right opportunities faster, tailor stronger applications, and stay ahead of deadlines.',
        author: 'Paul Adeyemi',
        date: 'May 5, 2026',
        readTime: '5 min read',
        image: 'https://images.pexels.com/photos/267885/pexels-photo-267885.jpeg',
    },
    {
        category: 'Career',
        title: 'Building an Application Routine That Actually Works',
        excerpt: 'A simple framework for turning scattered deadlines into a weekly review habit.',
        author: 'Sarah Chen',
        date: 'Apr 28, 2026',
        readTime: '6 min read',
        image: 'https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg',
    },
    {
        category: 'Study Abroad',
        title: 'Top Global Programs Learners Are Applying To Right Now',
        excerpt: 'From fellowships to internships, see the kinds of opportunities building momentum inside Edutu today.',
        author: 'James Okafor',
        date: 'Apr 20, 2026',
        readTime: '4 min read',
        image: 'https://images.pexels.com/photos/1595391/pexels-photo-1595391.jpeg',
    },
];

interface HeroStat {
    label: string;
    value: number;
    suffix: string;
    color: string;
}

interface AboutFeature {
    title: string;
    desc: string;
    icon: LucideIcon;
    color: string;
    bg: string;
    surface: string;
    darkSurface: string;
}

const AnimatedStatValue: React.FC<{ value: number; suffix: string; color: string; delayMs?: number }> = ({
    value,
    suffix,
    color,
    delayMs = 0,
}) => {
    const [displayValue, setDisplayValue] = useState(0);

    useEffect(() => {
        let frame = 0;
        const duration = 1250;
        const startAt = performance.now() + delayMs;

        const tick = (now: number) => {
            if (now < startAt) {
                frame = window.requestAnimationFrame(tick);
                return;
            }

            const progress = Math.min((now - startAt) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setDisplayValue(Math.round(value * eased));

            if (progress < 1) {
                frame = window.requestAnimationFrame(tick);
            }
        };

        frame = window.requestAnimationFrame(tick);

        return () => window.cancelAnimationFrame(frame);
    }, [delayMs, value]);

    return (
        <span style={{ color }}>
            {displayValue}
            {suffix}
        </span>
    );
};

const LandingPageV3: React.FC<LandingPageProps> = ({ onGetStarted }) => {
    const { isDarkMode } = useDarkMode();
    const { data: opportunities } = useOpportunities();
    const [openFAQ, setOpenFAQ] = useState<number | null>(null);
    const [heroWordIndex, setHeroWordIndex] = useState(0);
    const latestOpportunities = opportunities.slice(0, 3);
    const heroStats: HeroStat[] = [
        { label: 'ACTIVE LEARNERS', value: 50, suffix: 'K+', color: '#146ef5' },
        { label: 'OPPORTUNITIES', value: 12, suffix: 'K+', color: '#7a3dff' },
        { label: 'COUNTRIES', value: 80, suffix: '+', color: '#00d722' },
    ];
    const aboutFeatures: AboutFeature[] = [
        { title: 'Opportunity Matching', desc: 'Relevant scholarships, fellowships, internships, and programs in one feed.', icon: Sparkles, color: '#7a3dff', bg: '#7a3dff10', surface: '#f2edff', darkSurface: 'rgba(122,61,255,0.13)' },
        { title: 'Deadline Awareness', desc: 'Important dates stay visible before applications close.', icon: Calendar, color: '#ff6b00', bg: '#ff6b0010', surface: '#fff3ea', darkSurface: 'rgba(255,107,0,0.12)' },
        { title: 'Global Network', desc: 'Connect with mentors and peers in your niche across 80+ countries.', icon: Users, color: '#146ef5', bg: '#146ef510', surface: '#eaf3ff', darkSurface: 'rgba(20,110,245,0.14)' },
        { title: 'Application Tracking', desc: 'Track saved opportunities, applications, and progress in one dashboard.', icon: BarChart3, color: '#00b86b', bg: '#00b86b12', surface: '#eafff5', darkSurface: 'rgba(0,184,107,0.13)' },
    ];

    useEffect(() => {
        const interval = window.setInterval(() => {
            setHeroWordIndex((current) => (current + 1) % heroOpportunityWords.length);
        }, 2400);

        return () => window.clearInterval(interval);
    }, []);

    const webflowShadow = isDarkMode
        ? '0 84px 24px rgba(0,0,0,0.3), 0 54px 22px rgba(0,0,0,0.2), 0 30px 18px rgba(0,0,0,0.15), 0 13px 13px rgba(0,0,0,0.1), 0 3px 7px rgba(0,0,0,0.08)'
        : '0 84px 24px rgba(0,0,0,0), 0 54px 22px rgba(0,0,0,0.01), 0 30px 18px rgba(0,0,0,0.04), 0 13px 13px rgba(0,0,0,0.08), 0 3px 7px rgba(0,0,0,0.09)';

    const cardShadow = isDarkMode
        ? '0 1px 0 rgba(255,255,255,0.1), 0 13px 13px rgba(0,0,0,0.2), 0 3px 7px rgba(0,0,0,0.1)'
        : '0 1px 0 #d8d8d8, 0 13px 13px rgba(0,0,0,0.04), 0 3px 7px rgba(0,0,0,0.08)';

    const formatOpportunityDeadline = (deadline?: string | null) => {
        if (!deadline) {
            return 'Open now';
        }

        const parsed = new Date(deadline);
        if (Number.isNaN(parsed.getTime())) {
            return deadline;
        }

        return parsed.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    };

    return (
        <div className={`landing-page min-h-[100dvh] overflow-x-hidden ${isDarkMode ? 'dark' : ''}`} style={{ backgroundColor: isDarkMode ? '#080808' : '#ffffff', color: isDarkMode ? '#f5f5f5' : '#080808', fontFamily: "'Inter', 'Arial', sans-serif" }}>
            <PublicHeader fixed onPrimaryAction={onGetStarted} />

            <main className="relative z-10">
                {/* Hero Section */}
                <section
                    className="landing-hero relative h-[55vh] overflow-hidden px-4 sm:px-6 md:min-h-dvh"
                    id="platform"
                    style={{
                        backgroundColor: isDarkMode ? '#080808' : '#f7fbff',
                    }}
                >
                    <div
                        className="absolute inset-0 bg-cover bg-center"
                        style={{
                            backgroundImage: `url('https://i.pinimg.com/736x/41/69/d9/4169d952f479236822aa971619a36a7f.jpg')`,
                        }}
                    />
                    <div className="absolute inset-0 bg-white/40" />
                    <div className="relative z-10 mx-auto flex h-full max-w-[1200px] flex-col items-center justify-center pb-6 pt-24 text-center sm:pb-24 sm:pt-28">
                        <motion.h1
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.1 }}
                            className="landing-hero-title text-[clamp(2.6rem,8vw,5rem)] sm:text-[clamp(3.8rem,7vw,5.5rem)] md:text-[80px] font-semibold leading-[1.04] tracking-[-0.8px] mb-8 text-balance"
                            style={{ color: '#1a1a2e' }}
                        >
                            Your AI Guide to{' '}
                            <span className="landing-hero-highlight" style={{ color: 'inherit', whiteSpace: 'nowrap' }}>
                                Global{' '}
                                <span
                                    className="landing-hero-word"
                                    style={{
                                        color: '#1a1a2e',
                                        display: 'inline-block',
                                        minWidth: '6.8em',
                                        textAlign: 'left',
                                        verticalAlign: 'baseline',
                                    }}
                                >
                                    <AnimatePresence mode="wait">
                                        <motion.span
                                            key={heroOpportunityWords[heroWordIndex]}
                                            initial={{ opacity: 0, y: 24, filter: 'blur(8px)' }}
                                            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                                            exit={{ opacity: 0, y: -24, filter: 'blur(8px)' }}
                                            transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                                            style={{ display: 'inline-block', color: '#146ef5' }}
                                        >
                                            {heroOpportunityWords[heroWordIndex]}
                                        </motion.span>
                                    </AnimatePresence>
                                </span>
                            </span>
                        </motion.h1>

                        <motion.p
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.2 }}
                            className="landing-hero-copy max-w-[680px] text-[20px] leading-[1.4] font-normal mb-12"
                            style={{ color: '#1a1a2e' }}
                        >
                            Edutu finds scholarships, fellowships, and career programs matched to you — globally, automatically, before the deadline.
                        </motion.p>

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.3 }}
                            className="flex flex-col sm:flex-row gap-4"
                        >
                            <button
                                onClick={onGetStarted}
                                className="inline-flex items-center gap-2 px-10 py-4 text-[16px] font-medium rounded-xl cursor-pointer transition-all duration-200 bg-brand-600 text-white hover:bg-brand-700 hover:-translate-y-0.5"
                                style={{
                                    boxShadow: webflowShadow
                                }}
                            >
                                Get Started <ArrowRight size={16} />
                            </button>
                        </motion.div>
                    </div>
                </section>

                {/* Latest Opportunities */}
                <section
                    className="py-20 px-4 sm:px-6"
                    style={{ borderTop: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}` }}
                >
                    <div className="max-w-[1200px] mx-auto">
                        <div className="flex flex-col gap-6 mb-12">
                            <div className="max-w-2xl">
                                <span className="text-[12.8px] font-semibold tracking-[1.5px]" style={{ color: '#146ef5' }}>
                                    LATEST OPPORTUNITIES
                                </span>
                                <h2 className="landing-section-title text-[34px] sm:text-[42px] font-medium leading-[1.12] mt-4 max-w-xl" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                                    Fresh opportunities worth exploring
                                </h2>
                                <p className="landing-section-copy max-w-[640px] text-[18px] leading-[1.45] mt-4" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                                    A quick look at a few scholarships, fellowships, internships, and programs that are ready for action.
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                            {latestOpportunities.map((opportunity, index) => (
                                <motion.article
                                    key={opportunity.id}
                                    initial={{ opacity: 0, y: 16 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true, margin: '-40px' }}
                                    transition={{ duration: 0.45, delay: index * 0.08 }}
                                    whileHover={{ y: -3 }}
                                    className="overflow-hidden rounded-[22px]"
                                    style={{
                                        backgroundColor: isDarkMode ? 'rgba(255,255,255,0.035)' : '#ffffff',
                                        border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.09)' : '#dfe7f2'}`,
                                        boxShadow: 'none',
                                    }}
                                >
                                    <Link
                                        to={`/share/opportunity/${encodeURIComponent(opportunity.id)}`}
                                        className="block no-underline"
                                        aria-label={`View ${opportunity.title}`}
                                    >
                                        <div className="relative h-[210px] overflow-hidden">
                                            <img
                                                src={opportunity.image || heroBackdropImages[index % heroBackdropImages.length].src}
                                                alt=""
                                                className="h-full w-full object-cover"
                                                loading="lazy"
                                            />
                                            <div
                                                className="absolute inset-0"
                                                style={{
                                                    background: 'linear-gradient(180deg, rgba(8,18,36,0.05) 0%, rgba(8,18,36,0.2) 100%)',
                                                }}
                                            />
                                        </div>
                                        <div className="p-5 sm:p-6">
                                            <p className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: '#146ef5' }}>
                                                {opportunity.category}
                                            </p>
                                            <h3 className="mt-3 text-[20px] font-semibold leading-[1.18] tracking-[-0.02em] sm:text-[22px]" style={{ color: isDarkMode ? '#fafafa' : '#0a0a0a' }}>
                                                {opportunity.title}
                                            </h3>
                                        </div>
                                    </Link>
                                </motion.article>
                            ))}
                        </div>

                        <div className="mt-10 flex justify-center">
                            <Link
                                to="/opportunities"
                                className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-[16px] font-medium no-underline transition-all duration-200 text-[#080808] dark:text-[#f5f5f5] border border-[#d8d8d8] dark:border-[#363636] hover:border-[#898989] hover:translate-x-1.5"
                            >
                                Explore all opportunities <ArrowRight size={16} />
                            </Link>
                        </div>
                    </div>
                </section>

                {/* Bento Benefits Section */}
                <BentoBenefits />

                {/* Country Flags Marquee */}
                <section className="py-24 px-4 sm:px-6 overflow-hidden" style={{ borderTop: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}` }}>
                    <div className="max-w-[1200px] mx-auto text-center mb-16">
                        <span className="text-[12.8px] font-semibold tracking-[1.5px]" style={{ color: '#146ef5' }}>
                            GLOBAL REACH
                        </span>
                        <h2 className="landing-section-title text-[48px] sm:text-[56px] font-semibold leading-[1.04] mt-4" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                            Opportunities from <span style={{ color: '#146ef5' }}>31 Countries</span>
                        </h2>
                        <p className="landing-section-copy max-w-[600px] text-[20px] leading-[1.4] mx-auto mt-4" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                            Access scholarships, fellowships, and programs from every corner of the world.
                        </p>
                    </div>

                    <div className="relative">
                        <div className="absolute left-0 top-0 bottom-0 w-32 z-10" style={{ background: `linear-gradient(to right, ${isDarkMode ? '#080808' : '#ffffff'}, transparent)` }} />
                        <div className="absolute right-0 top-0 bottom-0 w-32 z-10" style={{ background: `linear-gradient(to left, ${isDarkMode ? '#080808' : '#ffffff'}, transparent)` }} />

                        <div className="flex gap-6 mb-6" style={{ animation: 'marquee 30s linear infinite' }}>
                            {[...flags, ...flags].map((flag, i) => (
                                <div key={i} className="shrink-0 w-[80px] h-[60px] flex items-center justify-center rounded" style={{ border: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}`, borderRadius: '8px', backgroundColor: isDarkMode ? '#111' : '#fafafa' }}>
                                    <img src={flag} alt="" className="w-[48px] h-[36px] object-cover rounded" style={{ borderRadius: '4px' }} loading="lazy" />
                                </div>
                            ))}
                        </div>

                        <div className="flex gap-6" style={{ animation: 'marquee-reverse 30s linear infinite' }}>
                            {[...flags.slice().reverse(), ...flags.slice().reverse()].map((flag, i) => (
                                <div key={i} className="shrink-0 w-[80px] h-[60px] flex items-center justify-center rounded" style={{ border: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}`, borderRadius: '8px', backgroundColor: isDarkMode ? '#111' : '#fafafa' }}>
                                    <img src={flag} alt="" className="w-[48px] h-[36px] object-cover rounded" style={{ borderRadius: '4px' }} loading="lazy" />
                                </div>
                            ))}
                        </div>
                    </div>

                    <style>{`
                        @keyframes marquee {
                            0% { transform: translateX(0); }
                            100% { transform: translateX(-50%); }
                        }
                        @keyframes marquee-reverse {
                            0% { transform: translateX(-50%); }
                            100% { transform: translateX(0); }
                        }
                    `}</style>
                </section>

                {/* Top Institutions */}
                <section className="py-24 px-4 sm:px-6" style={{ borderTop: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}` }}>
                    <div className="max-w-[1200px] mx-auto text-center mb-16">
                        <span className="text-[12.8px] font-semibold tracking-[1.5px]" style={{ color: '#146ef5' }}>
                            TOP INSTITUTIONS
                        </span>
                        <h2 className="landing-section-title text-[48px] sm:text-[56px] font-semibold leading-[1.04] mt-4" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                            Scholarships from <span style={{ color: '#146ef5' }}>World-Class</span> Universities
                        </h2>
                        <p className="landing-section-copy max-w-[600px] text-[20px] leading-[1.4] mx-auto mt-4" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                            Partner with leading institutions to find opportunities that match your ambition.
                        </p>
                    </div>

                    <div className="landing-institution-grid grid grid-cols-3 md:grid-cols-4 gap-2 sm:gap-4 md:gap-6 max-w-[860px] mx-auto">
                        {institutions.map((inst, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.4, delay: i * 0.05 }}
                                className="landing-institution-card p-2 sm:p-4 flex items-center justify-center transition-all duration-300"
                                style={{
                                    background: 'transparent',
                                    border: '0',
                                    borderRadius: '0',
                                    boxShadow: 'none',
                                    aspectRatio: '1 / 1'
                                }}
                                onMouseEnter={(e) => {
                                    (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
                                }}
                                onMouseLeave={(e) => {
                                    (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                                }}
                            >
                            <div className="landing-institution-shell flex h-full w-full items-center justify-center rounded-md">
                                <img 
                                    src={inst.logo} 
                                    alt={inst.name} 
                                    className="landing-institution-logo max-h-[28px] sm:max-h-[58px] max-w-[70px] sm:max-w-[130px] object-contain" 
                                    loading="lazy"
                                    style={{ width: 'auto', height: 'auto' }}
                                    onError={(e) => {
                                        const target = e.currentTarget;
                                        target.style.display = 'none';
                                        const parent = target.parentElement;
                                        if (parent) {
                                            const fallbackLabel = document.createElement('span');
                                            fallbackLabel.textContent = inst.name.split(' ')[0];
                                            fallbackLabel.style.fontSize = '11px';
                                            fallbackLabel.style.fontWeight = '600';
                                            fallbackLabel.style.color = '#334155';
                                            fallbackLabel.style.textAlign = 'center';
                                            parent.appendChild(fallbackLabel);
                                        }
                                    }}
                                />
                            </div>
                            </motion.div>
                        ))}
                    </div>
                </section>

                {/* About Section */}
                <section className="py-24 px-4 sm:px-6" id="about" style={{ borderTop: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}`, borderBottom: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}` }}>
                    <div className="max-w-[1200px] mx-auto">
                        <div className="mb-16">
                            <span className="text-[12.8px] font-semibold tracking-[1.5px]" style={{ color: '#146ef5' }}>
                                ABOUT
                            </span>
                            <h2 className="landing-section-title text-[48px] sm:text-[56px] font-semibold leading-[1.04] mt-4 mb-4" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                                Built for the <span style={{ color: '#146ef5' }}>Ambitious</span>
                            </h2>
                            <p className="landing-section-copy max-w-[600px] text-[20px] leading-[1.4]" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                                Modular tools designed to scale your career from day one.
                            </p>
                        </div>

                        <div className="md:hidden mx-auto mt-6 grid w-full max-w-[520px] grid-cols-1 gap-3">
                            {aboutFeatures.map((feature, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true, amount: 0.35 }}
                                    transition={{
                                        type: 'spring',
                                        stiffness: 140,
                                        damping: 20,
                                        mass: 0.7,
                                        delay: i * 0.05,
                                    }}
                                    className="cursor-pointer overflow-hidden rounded-[24px] px-4 py-4 transition-transform duration-300 sm:px-5 sm:py-5"
                                    style={{
                                        backgroundColor: isDarkMode ? feature.darkSurface : feature.surface,
                                        border: `1px solid ${isDarkMode ? `${feature.color}34` : `${feature.color}26`}`,
                                        borderRadius: '8px',
                                        boxShadow: cardShadow
                                    }}
                                >
                                    <div className="flex items-start gap-3 sm:gap-4">
                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl sm:h-12 sm:w-12" style={{ backgroundColor: feature.bg, borderRadius: '14px' }}>
                                            <feature.icon size={20} style={{ color: feature.color }} />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <h3 className="text-[16px] font-semibold leading-tight sm:text-[18px]" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>{feature.title}</h3>
                                            <p
                                                className="mt-1 text-[12px] leading-[1.4] sm:mt-2 sm:text-[13px]"
                                                style={{
                                                    color: isDarkMode ? '#ababab' : '#5a5a5a',
                                                    display: '-webkit-box',
                                                    WebkitBoxOrient: 'vertical',
                                                    WebkitLineClamp: 2,
                                                    overflow: 'hidden',
                                                }}
                                            >
                                                {feature.desc}
                                            </p>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>

                        <div className="hidden md:grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
                            {aboutFeatures.map((feature, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ duration: 0.4, delay: i * 0.1 }}
                                    className="p-5 sm:p-8 cursor-pointer transition-all duration-300"
                                    style={{
                                        backgroundColor: isDarkMode ? feature.darkSurface : feature.surface,
                                        border: `1px solid ${isDarkMode ? `${feature.color}38` : `${feature.color}30`}`,
                                        borderRadius: '8px',
                                        boxShadow: cardShadow
                                    }}
                                    onMouseEnter={(e) => {
                                        (e.currentTarget as HTMLElement).style.borderColor = feature.color;
                                        (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)';
                                    }}
                                    onMouseLeave={(e) => {
                                        (e.currentTarget as HTMLElement).style.borderColor = isDarkMode ? `${feature.color}38` : `${feature.color}30`;
                                        (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                                    }}
                                >
                                    <div className="h-10 w-10 sm:h-12 sm:w-12 flex items-center justify-center rounded mb-4 sm:mb-6" style={{ backgroundColor: feature.bg, borderRadius: '8px' }}>
                                        <feature.icon size={22} style={{ color: feature.color }} />
                                    </div>
                                    <h3 className="text-[20px] sm:text-[24px] font-semibold mb-2 sm:mb-3" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>{feature.title}</h3>
                                    <p className="text-[14px] sm:text-[16px] leading-[1.55] sm:leading-[1.6]" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>{feature.desc}</p>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Blog Preview */}
                <section className="py-24 px-4 sm:px-6" style={{ borderTop: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}`, backgroundColor: isDarkMode ? '#0a0a0a' : '#fafafa' }}>
                    <div className="max-w-[1200px] mx-auto">
                        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-12">
                            <div className="max-w-2xl">
                                <span className="text-[12.8px] font-semibold tracking-[1.5px]" style={{ color: '#146ef5' }}>
                                    FROM THE BLOG
                                </span>
                                <h2 className="landing-section-title text-[48px] sm:text-[56px] font-semibold leading-[1.04] mt-4" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                                    Stories and ideas for{' '}
                                    <span style={{ color: '#146ef5' }}>ambitious learners</span>
                                </h2>
                                <p className="landing-section-copy max-w-[620px] text-[18px] leading-[1.45] mt-4" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                                    Practical guides, scholarship advice, and founder notes to help you move with more clarity.
                                </p>
                            </div>

                            <Link
                                to="/blog"
                                className="inline-flex items-center gap-2 self-start rounded-xl px-5 py-3 text-[16px] font-medium no-underline transition-all duration-200 text-[#080808] dark:text-[#f5f5f5] border border-[#d8d8d8] dark:border-[#363636]"
                            >
                                Read the blog <ArrowRight size={16} />
                            </Link>
                        </div>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                            {landingBlogArticles.map((article, index) => (
                                <motion.article
                                    key={article.title}
                                    initial={{ opacity: 0, y: 16 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true, margin: '-40px' }}
                                    transition={{ duration: 0.45, delay: index * 0.08 }}
                                    whileHover={{ y: -3 }}
                                    className="overflow-hidden rounded-[22px]"
                                    style={{
                                        backgroundColor: isDarkMode ? '#111' : '#ffffff',
                                        border: `1px solid ${isDarkMode ? '#222' : '#dfe7f2'}`,
                                        boxShadow: 'none',
                                    }}
                                >
                                    <Link to="/blog" className="block no-underline">
                                        <div className="relative h-[220px] overflow-hidden">
                                            <img
                                                src={article.image}
                                                alt=""
                                                className="h-full w-full object-cover"
                                                loading="lazy"
                                            />
                                            <div
                                                className="absolute inset-0"
                                                style={{
                                                    background: 'linear-gradient(180deg, rgba(8,18,36,0.02) 0%, rgba(8,18,36,0.24) 100%)',
                                                }}
                                            />
                                        </div>
                                        <div className="p-5 sm:p-6">
                                            <span className="rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em]" style={{ backgroundColor: isDarkMode ? 'rgba(20,110,245,0.12)' : '#edf5ff', color: '#146ef5' }}>
                                                {article.category}
                                            </span>
                                            <h3 className="mt-4 text-[20px] font-semibold leading-[1.18] tracking-[-0.02em] sm:text-[22px]" style={{ color: isDarkMode ? '#fafafa' : '#0a0a0a' }}>
                                                {article.title}
                                            </h3>
                                            <p className="mt-2 text-[15px] leading-[1.55]" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                                                {article.excerpt}
                                            </p>
                                            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] font-medium" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                                                <span className="inline-flex items-center gap-1.5">
                                                    <User size={12} />
                                                    {article.author}
                                                </span>
                                                <span className="inline-flex items-center gap-1.5">
                                                    <Calendar size={12} />
                                                    {article.date}
                                                </span>
                                                <span className="inline-flex items-center gap-1.5">
                                                    <Clock size={12} />
                                                    {article.readTime}
                                                </span>
                                            </div>
                                        </div>
                                    </Link>
                                </motion.article>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Testimonials / Social Proof */}
                <section className="py-24 px-4 sm:px-6" style={{ borderTop: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}`, borderBottom: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}`, backgroundColor: isDarkMode ? '#0a0a0a' : '#fafafa' }}>
                    <div className="max-w-[1200px] mx-auto text-center">
                        <span className="text-[12.8px] font-semibold tracking-[1.5px]" style={{ color: '#146ef5' }}>
                            TESTIMONIALS
                        </span>
                        <h2 className="landing-section-title text-[48px] sm:text-[56px] font-semibold leading-[1.04] mt-4 mb-16" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                            Trusted by <span style={{ color: '#146ef5' }}>Learners</span>
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {[
                                { quote: 'Edutu helped me land 3 scholarship offers in 2 months. The opportunity feed was a game changer.', name: 'Adaeze O.', role: 'Computer Science Student', country: 'Nigeria', avatar: 'https://images.pexels.com/photos/1181690/pexels-photo-1181690.jpeg' },
                                { quote: 'The opportunity tracking alone saved me from missing deadlines. Now I have a clear career path.', name: 'Tunde A.', role: 'Recent Graduate', country: 'Nigeria', avatar: 'https://images.pexels.com/photos/2379004/pexels-photo-2379004.jpeg' },
                                { quote: 'I went from confused about where to apply to having a focused list of real opportunities.', name: 'Fatima B.', role: 'MSc Candidate', country: 'Nigeria', avatar: 'https://images.pexels.com/photos/762020/pexels-photo-762020.jpeg' }
                            ].map((testimonial, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ duration: 0.4, delay: i * 0.1 }}
                                    className="p-8 text-left"
                                    style={{
                                        backgroundColor: isDarkMode ? '#111' : '#ffffff',
                                        border: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}`,
                                        borderRadius: '8px',
                                        boxShadow: cardShadow
                                    }}
                                >
                                    <div className="flex gap-1 mb-4">
                                        {[...Array(5)].map((_, j) => (
                                            <span key={j} style={{ color: '#ffae13' }}>★</span>
                                        ))}
                                    </div>
                                    <p className="text-[18px] leading-[1.5] mb-6" style={{ color: isDarkMode ? '#d8d8d8' : '#222' }}>"{testimonial.quote}"</p>
                                    <div className="flex items-center gap-3">
                                        <img
                                            src={testimonial.avatar}
                                            alt=""
                                            className="h-12 w-12 rounded-full object-cover"
                                            loading="lazy"
                                            style={{ border: `2px solid ${isDarkMode ? '#222' : '#ffffff'}`, boxShadow: '0 10px 24px rgba(0,0,0,0.18)' }}
                                        />
                                        <div>
                                            <div className="text-[16px] font-medium" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>{testimonial.name}</div>
                                            <div className="text-[14px]" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>{testimonial.role} · {testimonial.country}</div>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* FAQ Section */}
                <section className="py-24 px-4 sm:px-6" id="faq">
                    <div className="max-w-[800px] mx-auto">
                        <div className="text-center mb-16">
                            <span className="text-[12.8px] font-semibold tracking-[1.5px]" style={{ color: '#146ef5' }}>
                                FAQ
                            </span>
                            <h2 className="landing-section-title text-[48px] sm:text-[56px] font-semibold leading-[1.04] mt-4 mb-4" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                                Common <span style={{ color: '#146ef5' }}>Questions</span>
                            </h2>
                            <p className="landing-section-copy max-w-[600px] text-[20px] leading-[1.4] mx-auto" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                                Everything you need to know about Edutu.
                            </p>
                        </div>

                        <div className="space-y-4">
                            {faqData.map((item, index) => (
                                <motion.div
                                    key={index}
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ duration: 0.4, delay: index * 0.05 }}
                                    className="overflow-hidden"
                                    style={{
                                        backgroundColor: isDarkMode ? '#111' : '#ffffff',
                                        border: `1px solid ${openFAQ === index ? '#146ef5' : isDarkMode ? '#222' : '#d8d8d8'}`,
                                        borderRadius: '8px',
                                        boxShadow: cardShadow
                                    }}
                                >
                                    <button
                                        onClick={() => setOpenFAQ(openFAQ === index ? null : index)}
                                        className="w-full flex items-center justify-between p-6 text-left cursor-pointer transition-all duration-200"
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            padding: '24px'
                                        }}
                                    >
                                        <span className="text-[18px] font-medium pr-4" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                                            {item.question}
                                        </span>
                                        <motion.div
                                            animate={{ rotate: openFAQ === index ? 180 : 0 }}
                                            transition={{ duration: 0.3, ease: 'easeInOut' }}
                                        >
                                            <ChevronDown size={20} style={{ color: openFAQ === index ? '#146ef5' : isDarkMode ? '#ababab' : '#5a5a5a', flexShrink: 0 }} />
                                        </motion.div>
                                    </button>
                                    <AnimatePresence>
                                        {openFAQ === index && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.3, ease: 'easeInOut' }}
                                            >
                                                <div className="px-6 pb-6" style={{ paddingTop: 0 }}>
                                                    <p className="text-[16px] leading-[1.6]" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                                                        {item.answer}
                                                    </p>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* CTA Section */}
                <section className="py-24 px-4 sm:px-6">
                    <div className="max-w-[1200px] mx-auto">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5 }}
                            className="relative overflow-hidden rounded-3xl px-6 py-16 sm:px-16 sm:py-20"
                            style={{
                                backgroundColor: '#07111f',
                                border: '1px solid rgba(255,255,255,0.16)',
                                boxShadow: 'none',
                            }}
                        >
                            <img
                                src={heroBackdropImages[0].src}
                                alt=""
                                aria-hidden="true"
                                className="absolute inset-0 h-full w-full object-cover"
                                style={{ filter: 'saturate(0.76) contrast(0.94) brightness(0.5)' }}
                                loading="lazy"
                                draggable={false}
                            />
                            <div
                                className="absolute inset-0"
                                style={{
                                    background: 'linear-gradient(180deg, rgba(3,8,18,0.74) 0%, rgba(3,8,18,0.62) 46%, rgba(3,8,18,0.78) 100%), radial-gradient(circle at 50% 18%, rgba(20,110,245,0.22), transparent 38%)',
                                }}
                            />
                            <div className="relative z-10 mx-auto flex max-w-[820px] flex-col items-center gap-8 text-center">
                                <div>
                                    <div
                                        className="inline-flex items-center gap-2 px-3 py-1.5 mb-5 rounded-full"
                                        style={{
                                            backgroundColor: 'rgba(255,255,255,0.08)',
                                            border: '1px solid rgba(255,255,255,0.18)',
                                        }}
                                    >
                                        <Sparkles size={12} className="text-white" />
                                        <span className="text-[10px] font-bold tracking-widest text-white">Global Matches</span>
                                    </div>
                                    <h2
                                        className="text-3xl md:text-4xl font-bold mb-3 tracking-tight"
                                        style={{ color: '#ffffff' }}
                                    >
                                        Find scholarships
                                        <br />
                                        and <span style={{ color: '#69a8ff' }}>global opportunities</span>
                                    </h2>
                                    <p
                                        className="mx-auto max-w-[620px] text-center text-sm leading-relaxed sm:text-base"
                            style={{ color: 'rgba(26,26,46,0.7)' }}
                                    >
                                        <span className="block">Explore scholarships, fellowships, internships, and funded programs</span>
              <span className="block">matched to your profile before deadlines pass.</span>
                                    </p>
                                </div>
                                <div className="flex w-full max-w-[560px] flex-col gap-3 sm:flex-row sm:justify-center">
                                    <motion.button
                                        onClick={onGetStarted}
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        className="inline-flex items-center justify-center gap-2 rounded-xl px-8 py-3.5 text-sm font-bold bg-brand-600 text-white hover:bg-brand-700"
                                        style={{
                                            boxShadow: '0 2px 8px rgba(79,70,229,0.25)',
                                        }}
                                    >
                                        Get Scholarship Matches
                                        <ArrowRight size={14} />
                                    </motion.button>
                                    <Link
                                        to="/opportunities"
                                        className="inline-flex items-center justify-center gap-2 rounded-xl px-8 py-3.5 text-sm font-bold no-underline transition-transform duration-200 hover:scale-[1.02]"
                                        style={{
                                            backgroundColor: 'rgba(255,255,255,0.08)',
                                            color: '#ffffff',
                                            border: '1px solid rgba(255,255,255,0.28)',
                                        }}
                                    >
                                        Browse Opportunities
                                    </Link>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </section>
            </main>

            {/* Footer */}
            <footer className="py-10 sm:py-16 px-4 sm:px-6" style={{ borderTop: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}` }}>
                <div className="max-w-[1200px] mx-auto">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-8 md:gap-12 mb-10 md:mb-16">
                        <div className="col-span-2 md:col-span-1">
                            <div className="flex items-center gap-2 mb-3">
                                <img src="/edutu-logo.png" alt="Edutu" className="h-8 w-8 object-contain" />
                                <span className="font-bold text-xl tracking-tight" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                                    edutu
                                </span>
                            </div>
                            <p className="text-[13px] leading-[1.5] md:text-[14px] md:leading-[1.7] max-w-[20rem]" style={{ color: isDarkMode ? '#888' : '#666' }}>
                                Find scholarships, jobs, and programs from around the world. We help you plan your next big step.
                            </p>
                        </div>

                        <div>
                            <h4 className="text-[11px] md:text-[12px] font-bold tracking-widest mb-3 md:mb-4" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                                Product
                            </h4>
                            <div className="space-y-2 md:space-y-3">
                                <Link to="/opportunities" className="block text-[13px] md:text-[14px] transition-colors" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>Opportunities</Link>
                                <a href="#platform" className="block text-[13px] md:text-[14px] transition-colors" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>Platform</a>
                                <Link to="/mentor" className="block text-[13px] md:text-[14px] transition-colors" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>Become a Mentor</Link>
                                <a href="#faq" className="block text-[13px] md:text-[14px] transition-colors" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>FAQ</a>
                            </div>
                        </div>

                        <div>
                            <h4 className="text-[11px] md:text-[12px] font-bold tracking-widest mb-3 md:mb-4" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                                Company
                            </h4>
                            <div className="space-y-2 md:space-y-3">
                                <Link to="/about" className="block text-[13px] md:text-[14px] transition-colors" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>About</Link>
                                <Link to="/mentor" className="block text-[13px] md:text-[14px] transition-colors" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>Become a Mentor</Link>
                                <Link to="/opportunities" className="block text-[13px] md:text-[14px] transition-colors" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>Opportunities</Link>
                                <Link to="/blog" className="block text-[13px] md:text-[14px] transition-colors" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>Blog</Link>
                                <Link to="/about" className="block text-[13px] md:text-[14px] transition-colors" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>Careers</Link>
                            </div>
                        </div>

                        <div>
                            <h4 className="text-[11px] md:text-[12px] font-bold tracking-widest mb-3 md:mb-4" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                                Resources
                            </h4>
                            <div className="space-y-2 md:space-y-3">
                                <Link to="/app/help" className="block text-[13px] md:text-[14px] transition-colors" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>Help Center</Link>
                                <a href={docsUrl} className="block text-[13px] md:text-[14px] transition-colors" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>Developer Docs</a>
                                <Link to="/scholarship-engine" className="block text-[13px] md:text-[14px] transition-colors" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>Scholarship Engine</Link>
                                <Link to="/admin" className="block text-[13px] md:text-[14px] transition-colors" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>Admin</Link>
                                <Link to="/about" className="block text-[13px] md:text-[14px] transition-colors" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>Privacy Policy</Link>
                                <Link to="/about" className="block text-[13px] md:text-[14px] transition-colors" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>Terms of Service</Link>
                                <Link to="/opportunities" className="block text-[13px] md:text-[14px] transition-colors" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>Community</Link>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col md:flex-row justify-between items-center pt-6 md:pt-8" style={{ borderTop: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}` }}>
                        <span className="text-[11px] md:text-[12px]" style={{ color: isDarkMode ? '#5a5a5a' : '#ababab' }}>
                            © {new Date().getFullYear()} Edutu Inc. All rights reserved. v0.1.2
                        </span>
                        <div className="flex items-center gap-4 md:gap-6 mt-3 md:mt-0">
                            <a href="https://twitter.com/edutu" target="_blank" rel="noopener noreferrer" className="p-1.5 md:p-2 transition-colors" style={{ color: isDarkMode ? '#5a5a5a' : '#5a5a5a' }} onMouseEnter={(e) => (e.currentTarget.style.color = '#146ef5')} onMouseLeave={(e) => (e.currentTarget.style.color = isDarkMode ? '#5a5a5a' : '#5a5a5a')}>
                                <Twitter size={18} />
                            </a>
                            <a href="https://linkedin.com/company/edutu" target="_blank" rel="noopener noreferrer" className="p-1.5 md:p-2 transition-colors" style={{ color: isDarkMode ? '#5a5a5a' : '#5a5a5a' }} onMouseEnter={(e) => (e.currentTarget.style.color = '#146ef5')} onMouseLeave={(e) => (e.currentTarget.style.color = isDarkMode ? '#5a5a5a' : '#5a5a5a')}>
                                <Linkedin size={18} />
                            </a>
                            <a href="https://github.com/edutu" target="_blank" rel="noopener noreferrer" className="p-1.5 md:p-2 transition-colors" style={{ color: isDarkMode ? '#5a5a5a' : '#5a5a5a' }} onMouseEnter={(e) => (e.currentTarget.style.color = '#146ef5')} onMouseLeave={(e) => (e.currentTarget.style.color = isDarkMode ? '#5a5a5a' : '#5a5a5a')}>
                                <Github size={18} />
                            </a>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default LandingPageV3;
