import React, { useState, useEffect } from 'react';
import {
    ArrowRight,
    Brain,
    Twitter,
    Linkedin,
    Sun,
    Moon,
    Sparkles,
    Zap,
    Github,
    Users,
    Target,
    Globe,
    BarChart3,
    ChevronDown,
    Menu,
    X
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import { useDarkMode } from '../hooks/useDarkMode';
import BentoBenefits from './BentoBenefits';

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
        question: 'How does the AI coach work?',
        answer: 'Our AI coach analyzes your profile, interests, and goals to provide personalized recommendations and career guidance.'
    },
    {
        question: 'Is Edutu free to use?',
        answer: 'Yes! Browse opportunities and access basic features for free. Upgrade to Pro for unlimited AI roadmaps and advanced features.'
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

const LandingPageV3: React.FC<LandingPageProps> = ({ onGetStarted }) => {
    const { isDarkMode, toggleDarkMode } = useDarkMode();
    const { scrollYProgress } = useScroll();
    const [activeNav, setActiveNav] = useState<string | null>(null);
    const [openFAQ, setOpenFAQ] = useState<number | null>(null);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [heroWordIndex, setHeroWordIndex] = useState(0);

    useEffect(() => {
        const interval = window.setInterval(() => {
            setHeroWordIndex((current) => (current + 1) % heroOpportunityWords.length);
        }, 2400);

        return () => window.clearInterval(interval);
    }, []);

    const headerBg = useTransform(
        scrollYProgress,
        [0, 0.05],
        [isDarkMode ? 'rgba(8, 8, 8, 0)' : 'rgba(255, 255, 255, 0)', isDarkMode ? 'rgba(8, 8, 8, 0.9)' : 'rgba(255, 255, 255, 0.95)']
    );

    const webflowShadow = isDarkMode
        ? '0 84px 24px rgba(0,0,0,0.3), 0 54px 22px rgba(0,0,0,0.2), 0 30px 18px rgba(0,0,0,0.15), 0 13px 13px rgba(0,0,0,0.1), 0 3px 7px rgba(0,0,0,0.08)'
        : '0 84px 24px rgba(0,0,0,0), 0 54px 22px rgba(0,0,0,0.01), 0 30px 18px rgba(0,0,0,0.04), 0 13px 13px rgba(0,0,0,0.08), 0 3px 7px rgba(0,0,0,0.09)';

    const cardShadow = isDarkMode
        ? '0 1px 0 rgba(255,255,255,0.1), 0 13px 13px rgba(0,0,0,0.2), 0 3px 7px rgba(0,0,0,0.1)'
        : '0 1px 0 #d8d8d8, 0 13px 13px rgba(0,0,0,0.04), 0 3px 7px rgba(0,0,0,0.08)';

    const navItems = [
        { label: 'Opportunities', to: '/opportunities' },
        { label: 'Mentor', to: '/mentor' },
        { label: 'About', to: '/about' },
        { label: 'Blog', to: '/blog' }
    ];

    return (
        <div className={`landing-page min-h-screen overflow-x-hidden ${isDarkMode ? 'dark' : ''}`} style={{ backgroundColor: isDarkMode ? '#080808' : '#ffffff', color: isDarkMode ? '#f5f5f5' : '#080808', fontFamily: "'Inter', 'Arial', sans-serif" }}>
            {/* Navigation */}
            <motion.header
                style={{ backgroundColor: headerBg }}
                className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md transition-colors duration-300"
            >
                <div className="max-w-[1200px] mx-auto px-4 sm:px-6 h-[64px] flex items-center justify-between" style={{ borderBottom: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}` }}>
                    <Link to="/" className="flex items-center gap-2.4 cursor-pointer">
                        <img src="/edutu-logo.png" alt="Edutu" className="h-8 w-8 object-contain" />
                        <span className="font-bold text-xl tracking-tight" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                            edutu
                        </span>
                    </Link>

                    <nav className="hidden md:flex items-center gap-8">
                        {navItems.map((item) => (
                            <Link
                                key={item.label}
                                to={item.to}
                                className="text-[15px] font-medium tracking-[1.5px] cursor-pointer transition-all duration-200 relative no-underline"
                                style={{
                                    color: activeNav === item.label ? '#146ef5' : isDarkMode ? '#ababab' : '#5a5a5a',
                                    background: 'none',
                                    border: 'none',
                                    padding: 0,
                                    minHeight: 'auto'
                                }}
                                onClick={() => {
                                    setActiveNav(item.label);
                                    setTimeout(() => setActiveNav(null), 2000);
                                }}
                            >
                                {item.label}
                            </Link>
                        ))}
                    </nav>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={onGetStarted}
                            className="hidden sm:inline-flex items-center gap-2 px-5 py-2.4 text-[16px] font-medium rounded cursor-pointer transition-all duration-200"
                            style={{
                                backgroundColor: '#146ef5',
                                color: '#ffffff',
                                borderRadius: '4px',
                                boxShadow: webflowShadow
                            }}
                            onMouseEnter={(e) => {
                                (e.target as HTMLElement).style.transform = 'translateY(-2px)';
                                (e.target as HTMLElement).style.backgroundColor = '#0055d4';
                            }}
                            onMouseLeave={(e) => {
                                (e.target as HTMLElement).style.transform = 'translateY(0)';
                                (e.target as HTMLElement).style.backgroundColor = '#146ef5';
                            }}
                        >
                            Get Started <ArrowRight size={16} />
                        </button>

                        {/* Hamburger Menu Button (mobile only) */}
                        <button
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            className="md:hidden p-2 rounded cursor-pointer transition-all duration-200"
                            style={{
                                border: `1px solid ${isDarkMode ? '#363636' : '#d8d8d8'}`,
                                backgroundColor: isDarkMode ? '#222' : 'transparent',
                                color: isDarkMode ? '#f5f5f5' : '#080808'
                            }}
                        >
                            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
                        </button>
                    </div>
                </div>

                {/* Mobile Menu Dropdown */}
                <AnimatePresence>
                    {mobileMenuOpen && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: 'easeInOut' }}
                            className="md:hidden overflow-hidden"
                            style={{ borderBottom: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}` }}
                        >
                            <nav className="px-4 py-4 space-y-1">
                                {navItems.map((item) => (
                                    <Link
                                        key={item.label}
                                        to={item.to}
                                        onClick={() => setMobileMenuOpen(false)}
                                        className="block text-[16px] font-medium py-3 px-4 rounded cursor-pointer transition-all duration-200"
                                        style={{
                                            color: isDarkMode ? '#f5f5f5' : '#080808',
                                            backgroundColor: 'transparent'
                                        }}
                                    >
                                        {item.label}
                                    </Link>
                                ))}
                                <button
                                    onClick={() => {
                                        setMobileMenuOpen(false);
                                        onGetStarted();
                                    }}
                                    className="w-full mt-2 py-3 text-[16px] font-medium rounded cursor-pointer transition-all duration-200"
                                    style={{
                                        backgroundColor: '#146ef5',
                                        color: '#ffffff',
                                        borderRadius: '4px'
                                    }}
                                >
                                    Get Started
                                </button>
                            </nav>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.header>

            <main className="relative z-10">
                {/* Hero Section */}
                <section
                    className="landing-hero relative overflow-hidden pt-[120px] pb-[96px] px-4 sm:px-6"
                    id="platform"
                    style={{
                        background: isDarkMode
                            ? 'radial-gradient(circle at 50% 12%, rgba(20,110,245,0.16), transparent 34%), radial-gradient(circle at 86% 30%, rgba(0,184,107,0.09), transparent 30%), linear-gradient(180deg, #0b0d10 0%, #080808 78%)'
                            : 'radial-gradient(circle at 50% 12%, rgba(20,110,245,0.12), transparent 34%), radial-gradient(circle at 86% 30%, rgba(0,184,107,0.08), transparent 30%), linear-gradient(180deg, #f7fbff 0%, #ffffff 78%)',
                    }}
                >
                    <div className="absolute inset-0 opacity-[0.18]" style={{ backgroundImage: 'linear-gradient(rgba(20,110,245,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(20,110,245,0.16) 1px, transparent 1px)', backgroundSize: '72px 72px', maskImage: 'radial-gradient(circle at center, black, transparent 74%)' }} />
                    <div className="relative z-10 max-w-[1200px] mx-auto flex flex-col items-center text-center">
                        <motion.h1
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.1 }}
                            className="landing-hero-title text-[56px] sm:text-[72px] md:text-[80px] font-semibold leading-[1.04] tracking-[-0.8px] mb-8"
                            style={{ color: isDarkMode ? '#ffffff' : '#080808' }}
                        >
                            Your AI Guide to{' '}
                            <span className="landing-hero-highlight" style={{ color: 'inherit', whiteSpace: 'nowrap' }}>
                                Global{' '}
                                <span
                                    className="landing-hero-word"
                                    style={{
                                        color: '#146ef5',
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
                                            style={{ display: 'inline-block' }}
                                        >
                                            {heroOpportunityWords[heroWordIndex]}.
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
                            style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}
                        >
                            Edutu maps your ambition to global opportunities. We build automated paths to mastery through intelligence-driven career orchestration.
                        </motion.p>

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.3 }}
                            className="flex flex-col sm:flex-row gap-4"
                        >
                            <button
                                onClick={onGetStarted}
                                className="inline-flex items-center gap-2 px-10 py-4 text-[16px] font-medium rounded cursor-pointer transition-all duration-200"
                                style={{
                                    backgroundColor: '#146ef5',
                                    color: '#ffffff',
                                    borderRadius: '4px',
                                    boxShadow: webflowShadow
                                }}
                                onMouseEnter={(e) => {
                                    (e.target as HTMLElement).style.transform = 'translateY(-2px)';
                                    (e.target as HTMLElement).style.backgroundColor = '#0055d4';
                                }}
                                onMouseLeave={(e) => {
                                    (e.target as HTMLElement).style.transform = 'translateY(0)';
                                    (e.target as HTMLElement).style.backgroundColor = '#146ef5';
                                }}
                            >
                                Get Started <ArrowRight size={16} />
                            </button>
                            <Link
                                to="/mentor"
                                className="inline-flex items-center gap-2 px-10 py-4 text-[16px] font-medium rounded cursor-pointer transition-all duration-200"
                                style={{
                                    backgroundColor: 'transparent',
                                    color: isDarkMode ? '#f5f5f5' : '#080808',
                                    border: `1px solid ${isDarkMode ? '#363636' : '#d8d8d8'}`,
                                    borderRadius: '4px',
                                    textDecoration: 'none'
                                }}
                                onMouseEnter={(e) => {
                                    (e.target as HTMLElement).style.borderColor = '#898989';
                                    (e.target as HTMLElement).style.transform = 'translateX(6px)';
                                }}
                                onMouseLeave={(e) => {
                                    (e.target as HTMLElement).style.borderColor = isDarkMode ? '#363636' : '#d8d8d8';
                                    (e.target as HTMLElement).style.transform = 'translateX(0)';
                                }}
                            >
                                Become a Mentor <ArrowRight size={16} />
                            </Link>
                        </motion.div>

                        {/* Hero Stats */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.4 }}
                            className="landing-hero-stats grid grid-cols-3 gap-6 mt-16 max-w-[800px] w-full"
                        >
                            {[
                                { label: 'ACTIVE LEARNERS', value: '50K+', color: '#146ef5' },
                                { label: 'OPPORTUNITIES', value: '12K+', color: '#7a3dff' },
                                { label: 'COUNTRIES', value: '80+', color: '#00d722' }
                            ].map((stat, i) => (
                                <div key={i} className="text-center p-6 rounded" style={{ border: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}`, borderRadius: '8px' }}>
                                    <div className="text-[32px] font-semibold" style={{ color: stat.color }}>{stat.value}</div>
                                    <div className="text-[10px] font-semibold tracking-[1.5px] mt-2" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>{stat.label}</div>
                                </div>
                            ))}
                        </motion.div>
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
                        <h2 className="text-[48px] sm:text-[56px] font-semibold leading-[1.04] mt-4" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                            Opportunities from <span style={{ color: '#146ef5' }}>31 Countries</span>
                        </h2>
                        <p className="max-w-[600px] text-[20px] leading-[1.4] mx-auto mt-4" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
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
                        <h2 className="text-[48px] sm:text-[56px] font-semibold leading-[1.04] mt-4" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                            Scholarships from <span style={{ color: '#146ef5' }}>World-Class</span> Universities
                        </h2>
                        <p className="max-w-[600px] text-[20px] leading-[1.4] mx-auto mt-4" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                            Partner with leading institutions to find opportunities that match your ambition.
                        </p>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-[1000px] mx-auto">
                        {institutions.map((inst, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.4, delay: i * 0.05 }}
                                className="p-4 sm:p-5 flex items-center justify-center cursor-pointer transition-all duration-300"
                                style={{
                                    background: isDarkMode
                                        ? 'linear-gradient(135deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03))'
                                        : 'linear-gradient(135deg, #f8fbff, #ffffff)',
                                    border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.12)' : '#d6e4f2'}`,
                                    borderRadius: '8px',
                                    boxShadow: cardShadow,
                                    aspectRatio: '3/2'
                                }}
                                onMouseEnter={(e) => {
                                    (e.currentTarget as HTMLElement).style.borderColor = '#146ef5';
                                    (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)';
                                }}
                                onMouseLeave={(e) => {
                                    (e.currentTarget as HTMLElement).style.borderColor = isDarkMode ? '#222' : '#d8d8d8';
                                    (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                                }}
                            >
                            <div
                                className="flex h-full w-full items-center justify-center rounded-md p-4"
                                style={{ backgroundColor: '#ffffff', border: '1px solid rgba(15,23,42,0.08)' }}
                            >
                                <img 
                                    src={inst.logo} 
                                    alt={inst.name} 
                                    className="max-h-[74px] max-w-[150px] object-contain" 
                                    loading="lazy"
                                    style={{ width: 'auto', height: 'auto' }}
                                    onError={(e) => {
                                        const target = e.currentTarget;
                                        target.style.display = 'none';
                                        const parent = target.parentElement;
                                        if (parent) {
                                            const fallbackLabel = document.createElement('span');
                                            fallbackLabel.textContent = inst.name.split(' ')[0];
                                            fallbackLabel.style.fontSize = '14px';
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
                            <h2 className="text-[48px] sm:text-[56px] font-semibold leading-[1.04] mt-4 mb-4" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                                Built for the <span style={{ color: '#146ef5' }}>Ambitious</span>
                            </h2>
                            <p className="max-w-[600px] text-[20px] leading-[1.4]" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                                Modular tools designed to scale your career from day one.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
                            {[
                                { title: 'AI Mentorship', desc: 'Personalized guidance based on your specific career context and goals.', icon: Brain, color: '#7a3dff', bg: '#7a3dff10', surface: '#f2edff', darkSurface: 'rgba(122,61,255,0.13)' },
                                { title: 'Automated Roadmaps', desc: 'Milestones that shift based on market conditions and your progress.', icon: Zap, color: '#ff6b00', bg: '#ff6b0010', surface: '#fff3ea', darkSurface: 'rgba(255,107,0,0.12)' },
                                { title: 'Global Network', desc: 'Connect with mentors and peers in your niche across 80+ countries.', icon: Users, color: '#146ef5', bg: '#146ef510', surface: '#eaf3ff', darkSurface: 'rgba(20,110,245,0.14)' },
                                { title: 'CV Intelligence', desc: 'AI-powered CV analysis and optimization for every application.', icon: Target, color: '#ed52cb', bg: '#ed52cb10', surface: '#fff0fb', darkSurface: 'rgba(237,82,203,0.13)' },
                                { title: 'Opportunity Tracking', desc: 'Track deadlines, applications, and progress in one dashboard.', icon: BarChart3, color: '#00b86b', bg: '#00b86b12', surface: '#eafff5', darkSurface: 'rgba(0,184,107,0.13)' },
                                { title: 'Creator Marketplace', desc: 'Build and share learning roadmaps. Earn from your expertise.', icon: Globe, color: '#ffae13', bg: '#ffae1310', surface: '#fff8e8', darkSurface: 'rgba(255,174,19,0.13)' }
                            ].map((feature, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ duration: 0.4, delay: i * 0.1 }}
                                    className="p-5 sm:p-8 cursor-pointer transition-all duration-300"
                                    style={{
                                        background: isDarkMode
                                            ? `linear-gradient(135deg, ${feature.darkSurface}, rgba(255,255,255,0.035) 76%)`
                                            : `linear-gradient(135deg, ${feature.surface}, #ffffff 76%)`,
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

                {/* Testimonials / Social Proof */}
                <section className="py-24 px-4 sm:px-6" style={{ borderTop: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}`, borderBottom: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}`, backgroundColor: isDarkMode ? '#0a0a0a' : '#fafafa' }}>
                    <div className="max-w-[1200px] mx-auto text-center">
                        <span className="text-[12.8px] font-semibold tracking-[1.5px]" style={{ color: '#146ef5' }}>
                            TESTIMONIALS
                        </span>
                        <h2 className="text-[48px] sm:text-[56px] font-semibold leading-[1.04] mt-4 mb-16" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                            Trusted by <span style={{ color: '#146ef5' }}>Learners</span>
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {[
                                { quote: 'Edutu helped me land 3 scholarship offers in 2 months. The AI roadmap was a game changer.', name: 'Adaeze O.', role: 'Computer Science Student', country: 'Nigeria', avatar: 'https://images.pexels.com/photos/1181690/pexels-photo-1181690.jpeg' },
                                { quote: 'The opportunity tracking alone saved me from missing deadlines. Now I have a clear career path.', name: 'Tunde A.', role: 'Recent Graduate', country: 'Nigeria', avatar: 'https://images.pexels.com/photos/2379004/pexels-photo-2379004.jpeg' },
                                { quote: 'I went from confused about my career to having a personalized roadmap with real opportunities.', name: 'Fatima B.', role: 'MSc Candidate', country: 'Nigeria', avatar: 'https://images.pexels.com/photos/762020/pexels-photo-762020.jpeg' }
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
                            <h2 className="text-[48px] sm:text-[56px] font-semibold leading-[1.04] mt-4 mb-4" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                                Common <span style={{ color: '#146ef5' }}>Questions</span>
                            </h2>
                            <p className="max-w-[600px] text-[20px] leading-[1.4] mx-auto" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
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
                            className="relative overflow-hidden rounded-3xl py-16 px-8 sm:px-16"
                            style={{
                                backgroundColor: isDarkMode ? '#111111' : '#ffffff',
                                border: `1px solid ${isDarkMode ? '#1e1e1e' : '#e8e8e8'}`,
                                boxShadow: isDarkMode
                                    ? '0 4px 12px rgba(0,0,0,0.3), 0 12px 36px rgba(0,0,0,0.2)'
                                    : '0 4px 12px rgba(0,0,0,0.05), 0 12px 36px rgba(0,0,0,0.08)',
                            }}
                        >
                            <motion.div
                                animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.5, 0.3] }}
                                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                                className="absolute -left-16 top-1/2 -translate-y-1/2 w-32 h-32 rounded-full"
                                style={{ background: 'radial-gradient(circle, rgba(20,110,245,0.2) 0%, transparent 70%)' }}
                            />
                            <motion.div
                                animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.5, 0.3] }}
                                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
                                className="absolute -right-16 top-1/2 -translate-y-1/2 w-32 h-32 rounded-full"
                                style={{ background: 'radial-gradient(circle, rgba(122,61,255,0.2) 0%, transparent 70%)' }}
                            />
                            <div className="relative z-10 flex flex-col lg:flex-row items-center gap-12">
                                <div className="flex-1 text-center lg:text-left">
                                    <div
                                        className="inline-flex items-center gap-2 px-3 py-1.5 mb-5 rounded-full"
                                        style={{
                                            backgroundColor: isDarkMode ? 'rgba(20,110,245,0.08)' : 'rgba(20,110,245,0.06)',
                                            border: `1px solid ${isDarkMode ? 'rgba(20,110,245,0.15)' : 'rgba(20,110,245,0.12)'}`,
                                        }}
                                    >
                                        <Sparkles size={12} className="text-[#146ef5]" />
                                        <span className="text-[10px] font-bold tracking-widest text-[#146ef5]">Global Matches</span>
                                    </div>
                                    <h2
                                        className="text-3xl md:text-4xl font-bold mb-3 tracking-tight"
                                        style={{ color: isDarkMode ? '#fafafa' : '#0a0a0a' }}
                                    >
                                        Find scholarships
                                        <br />
                                        and <span style={{ color: '#146ef5' }}>global opportunities</span>
                                    </h2>
                                    <p
                                        className="text-sm leading-relaxed"
                                        style={{ color: isDarkMode ? '#888' : '#666' }}
                                    >
                                        Explore scholarships, fellowships, internships, and funded programs matched to your goals before deadlines pass.
                                    </p>
                                </div>
                                <div className="flex flex-col sm:flex-row gap-3 flex-shrink-0">
                                    <motion.button
                                        onClick={onGetStarted}
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl text-sm font-bold"
                                        style={{
                                            backgroundColor: '#146ef5',
                                            color: '#ffffff',
                                            boxShadow: '0 2px 8px rgba(20,110,245,0.25)',
                                        }}
                                    >
                                        Get Scholarship Matches
                                        <ArrowRight size={14} />
                                    </motion.button>
                                    <motion.button
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl text-sm font-bold"
                                        style={{
                                            backgroundColor: isDarkMode ? '#1a1a1a' : '#fafafa',
                                            color: isDarkMode ? '#fafafa' : '#0a0a0a',
                                            border: `1px solid ${isDarkMode ? '#2a2a2a' : '#e5e5e5'}`,
                                        }}
                                    >
                                        Browse Opportunities
                                    </motion.button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </section>
            </main>

            {/* Footer */}
            <footer className="py-16 px-4 sm:px-6" style={{ borderTop: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}` }}>
                <div className="max-w-[1200px] mx-auto">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
                        <div className="md:col-span-1">
                            <div className="flex items-center gap-2 mb-4">
                                <img src="/edutu-logo.png" alt="Edutu" className="h-8 w-8 object-contain" />
                                <span className="font-bold text-xl tracking-tight" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                                    edutu
                                </span>
                            </div>
                            <p className="text-[14px] leading-[1.7]" style={{ color: isDarkMode ? '#888' : '#666' }}>
                                Find scholarships, jobs, and programs from around the world. We help you plan your next big step.
                            </p>
                        </div>

                        <div>
                            <h4 className="text-[12px] font-bold tracking-widest mb-4" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                                Product
                            </h4>
                            <div className="space-y-3">
                                <Link to="/opportunities" className="block text-[14px] transition-colors" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>Opportunities</Link>
                                <a href="#platform" className="block text-[14px] transition-colors" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>Platform</a>
                                <Link to="/mentor" className="block text-[14px] transition-colors" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>Become a Mentor</Link>
                                <a href="#faq" className="block text-[14px] transition-colors" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>FAQ</a>
                            </div>
                        </div>

                        <div>
                            <h4 className="text-[12px] font-bold tracking-widest mb-4" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                                Company
                            </h4>
                            <div className="space-y-3">
                                <Link to="/about" className="block text-[14px] transition-colors" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>About</Link>
                                <Link to="/mentor" className="block text-[14px] transition-colors" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>Become a Mentor</Link>
                                <Link to="/opportunities" className="block text-[14px] transition-colors" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>Opportunities</Link>
                                <Link to="/blog" className="block text-[14px] transition-colors" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>Blog</Link>
                                <Link to="/about" className="block text-[14px] transition-colors" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>Careers</Link>
                            </div>
                        </div>

                        <div>
                            <h4 className="text-[12px] font-bold tracking-widest mb-4" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                                Resources
                            </h4>
                            <div className="space-y-3">
                                <Link to="/app/help" className="block text-[14px] transition-colors" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>Help Center</Link>
                                <Link to="/admin" className="block text-[14px] transition-colors" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>Admin</Link>
                                <Link to="/about" className="block text-[14px] transition-colors" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>Privacy Policy</Link>
                                <Link to="/about" className="block text-[14px] transition-colors" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>Terms of Service</Link>
                                <Link to="/opportunities" className="block text-[14px] transition-colors" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>Community</Link>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col md:flex-row justify-between items-center pt-8" style={{ borderTop: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}` }}>
                        <span className="text-[12px]" style={{ color: isDarkMode ? '#5a5a5a' : '#ababab' }}>
                            © {new Date().getFullYear()} Edutu Inc. All rights reserved.
                        </span>
                        <div className="flex items-center gap-6 mt-4 md:mt-0">
                            <a href="https://twitter.com/edutu" target="_blank" rel="noopener noreferrer" className="p-2 transition-colors" style={{ color: isDarkMode ? '#5a5a5a' : '#5a5a5a' }} onMouseEnter={(e) => (e.currentTarget.style.color = '#146ef5')} onMouseLeave={(e) => (e.currentTarget.style.color = isDarkMode ? '#5a5a5a' : '#5a5a5a')}>
                                <Twitter size={18} />
                            </a>
                            <a href="https://linkedin.com/company/edutu" target="_blank" rel="noopener noreferrer" className="p-2 transition-colors" style={{ color: isDarkMode ? '#5a5a5a' : '#5a5a5a' }} onMouseEnter={(e) => (e.currentTarget.style.color = '#146ef5')} onMouseLeave={(e) => (e.currentTarget.style.color = isDarkMode ? '#5a5a5a' : '#5a5a5a')}>
                                <Linkedin size={18} />
                            </a>
                            <a href="https://github.com/edutu" target="_blank" rel="noopener noreferrer" className="p-2 transition-colors" style={{ color: isDarkMode ? '#5a5a5a' : '#5a5a5a' }} onMouseEnter={(e) => (e.currentTarget.style.color = '#146ef5')} onMouseLeave={(e) => (e.currentTarget.style.color = isDarkMode ? '#5a5a5a' : '#5a5a5a')}>
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
