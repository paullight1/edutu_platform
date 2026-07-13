import React, { useEffect, useState } from 'react';
import {
    ArrowRight,
    Calendar,
    Clock,
    User,
    ChevronDown,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useOpportunities } from '../hooks/useOpportunities';
import { useCountUp } from '../hooks/useCountUp';
import { fetchPublishedPosts, formatPostDate, readingTime } from '../services/blog';
import PublicHeader from './PublicHeader';
import SiteFooter from './SiteFooter';
import CommunityShowcase from './CommunityShowcase';
import {
    OpportunityMatchIcon,
    DeadlineIcon,
    GlobalNetworkIcon,
    TrackingIcon,
} from './AnimatedFeatureIcons';

type FeatureIcon = (props: { size?: number; className?: string }) => JSX.Element;

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
        answer: 'Edutu is an AI-powered career opportunity platform that helps you discover scholarships, fellowships, internships, and programs from over 31 countries.',
    },
    {
        question: 'Is Edutu free to use?',
        answer: 'Yes. You can browse opportunities and access core tracking features for free.',
    },
    {
        question: 'How do I apply for opportunities?',
        answer: 'You need to create an account first. Once logged in, you can browse opportunities and apply directly.',
    },
    {
        question: 'Can I track my applications?',
        answer: 'Yes, our dashboard lets you track all your applications, deadlines, and progress in one place.',
    },
    {
        question: 'What countries are covered?',
        answer: 'We cover opportunities from 31+ countries including USA, UK, Germany, Australia, Canada, Japan, and many more.',
    },
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
    { name: 'Harvard', logo: 'https://commons.wikimedia.org/wiki/Special:FilePath/Harvard_University_logo.svg' },
    { name: 'MIT', logo: 'https://commons.wikimedia.org/wiki/Special:FilePath/MIT_logo.svg' },
    { name: 'Stanford', logo: 'https://commons.wikimedia.org/wiki/Special:FilePath/Stanford_wordmark_(2012).svg' },
    { name: 'Yale', logo: 'https://commons.wikimedia.org/wiki/Special:FilePath/Yale_University_logo.svg' },
    { name: 'Oxford', logo: 'https://commons.wikimedia.org/wiki/Special:FilePath/University_of_Oxford.svg' },
    { name: 'Cambridge', logo: 'https://commons.wikimedia.org/wiki/Special:FilePath/University_of_Cambridge_coat_of_arms.svg' },
    { name: 'ETH Zurich', logo: 'https://commons.wikimedia.org/wiki/Special:FilePath/ETH_Z%C3%BCrich_Logo.svg' },
    { name: 'Princeton', logo: 'https://commons.wikimedia.org/wiki/Special:FilePath/Princeton_text_logo.svg' },
    { name: 'Columbia', logo: 'https://commons.wikimedia.org/wiki/Special:FilePath/Columbia_University_1754_updated.svg' },
    { name: 'Berkeley', logo: 'https://commons.wikimedia.org/wiki/Special:FilePath/University_of_California,_Berkeley_logo.svg' },
    { name: 'Caltech', logo: 'https://commons.wikimedia.org/wiki/Special:FilePath/Caltech_Logo.svg' },
    { name: 'Cornell', logo: 'https://commons.wikimedia.org/wiki/Special:FilePath/Cornell_University_logo.svg' },
    { name: 'Chicago', logo: 'https://commons.wikimedia.org/wiki/Special:FilePath/University_of_Chicago_wordmark.svg' },
    { name: 'Imperial', logo: 'https://commons.wikimedia.org/wiki/Special:FilePath/Imperial_logo.svg' },
    { name: 'Penn', logo: 'https://commons.wikimedia.org/wiki/Special:FilePath/University_of_Pennsylvania_wordmark.svg' },
    { name: 'Duke', logo: 'https://commons.wikimedia.org/wiki/Special:FilePath/Duke_University_logo.svg' },
    { name: 'Tokyo', logo: 'https://commons.wikimedia.org/wiki/Special:FilePath/University_of_Tokyo_logo_(2024).svg' },
    { name: 'Michigan State', logo: 'https://commons.wikimedia.org/wiki/Special:FilePath/Michigan_State_University_wordmark.svg' },
];

const heroOpportunityWords = ['Programs', 'Scholarships', 'Internships', 'Fellowships'];

const heroBackdropImages = [
    'https://images.pexels.com/photos/267885/pexels-photo-267885.jpeg?auto=compress&cs=tinysrgb&w=1200',
    'https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg?auto=compress&cs=tinysrgb&w=1200',
    'https://images.pexels.com/photos/1181671/pexels-photo-1181671.jpeg?auto=compress&cs=tinysrgb&w=1200',
    'https://images.pexels.com/photos/1595391/pexels-photo-1595391.jpeg?auto=compress&cs=tinysrgb&w=1200',
];

interface LandingArticle {
    category: string;
    title: string;
    excerpt: string;
    author: string;
    date: string;
    readTime: string;
    image: string;
    slug?: string;
}

const landingBlogArticles: LandingArticle[] = [
    {
        category: 'Scholarships',
        title: 'How to Win Scholarships in 2026: AI-Powered Strategies',
        excerpt: 'Use AI to spot the right opportunities faster, tailor stronger applications, and stay ahead of deadlines.',
        author: 'Paul Adeyemi',
        date: 'May 5, 2026',
        readTime: '5 min read',
        image: 'https://images.pexels.com/photos/267885/pexels-photo-267885.jpeg?auto=compress&cs=tinysrgb&w=720',
    },
    {
        category: 'Career',
        title: 'Building an Application Routine That Actually Works',
        excerpt: 'A simple framework for turning scattered deadlines into a weekly review habit.',
        author: 'Sarah Chen',
        date: 'Apr 28, 2026',
        readTime: '6 min read',
        image: 'https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg?auto=compress&cs=tinysrgb&w=720',
    },
    {
        category: 'Study Abroad',
        title: 'Top Global Programs Learners Are Applying To Right Now',
        excerpt: 'From fellowships to internships, see the kinds of opportunities building momentum inside Edutu today.',
        author: 'James Okafor',
        date: 'Apr 20, 2026',
        readTime: '4 min read',
        image: 'https://images.pexels.com/photos/1595391/pexels-photo-1595391.jpeg?auto=compress&cs=tinysrgb&w=720',
    },
];

interface AboutFeature {
    title: string;
    desc: string;
    icon: FeatureIcon;
    cardBg: string;
    iconColor: string;
    titleColor: string;
    descColor: string;
}

const testimonials = [
    { quote: 'Edutu helped me land 3 scholarship offers in 2 months. The opportunity feed was a game changer.', name: 'Adaeze O.', role: 'Computer Science Student', country: 'Nigeria', avatar: 'https://images.pexels.com/photos/1181690/pexels-photo-1181690.jpeg?auto=compress&cs=tinysrgb&w=160' },
    { quote: 'The opportunity tracking alone saved me from missing deadlines. Now I have a clear career path.', name: 'Tunde A.', role: 'Recent Graduate', country: 'Nigeria', avatar: 'https://images.pexels.com/photos/2379004/pexels-photo-2379004.jpeg?auto=compress&cs=tinysrgb&w=160' },
    { quote: 'I went from confused about where to apply to having a focused list of real opportunities.', name: 'Fatima B.', role: 'MSc Candidate', country: 'Nigeria', avatar: 'https://images.pexels.com/photos/762020/pexels-photo-762020.jpeg?auto=compress&cs=tinysrgb&w=160' },
];

const homeImpactStats: { value: number; suffix?: string; label: string }[] = [
    { value: 31, label: 'Countries reached' },
    { value: 67000, suffix: '+', label: 'Young people reached' },
    { value: 50000, suffix: '+', label: 'Community members' },
    { value: 500, suffix: '+', label: 'First-class graduates' },
];

const SectionEyebrow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">
        {children}
    </span>
);

const HomeImpactStat: React.FC<{ value: number; suffix?: string; label: string }> = ({
    value,
    suffix,
    label,
}) => {
    const { ref, value: current } = useCountUp<HTMLDivElement>(value, { duration: 2000 });
    return (
        <div ref={ref}>
            <div className="font-display text-[32px] font-semibold leading-none tracking-tight text-text-primary sm:text-[40px]">
                {Math.round(current).toLocaleString()}
                {suffix}
            </div>
            <div className="mt-2 text-[13px] font-medium leading-snug text-text-secondary sm:text-[14px]">
                {label}
            </div>
        </div>
    );
};

const LandingPageV3: React.FC<LandingPageProps> = ({ onGetStarted }) => {
    const { data: opportunities } = useOpportunities();
    const reduceMotion = useReducedMotion();
    const [openFAQ, setOpenFAQ] = useState<number | null>(null);
    const [heroWordIndex, setHeroWordIndex] = useState(0);
    const [blogArticles, setBlogArticles] = useState<LandingArticle[]>(landingBlogArticles);

    useEffect(() => {
        const controller = new AbortController();
        fetchPublishedPosts({ limit: 3, signal: controller.signal })
            .then((posts) => {
                if (!posts.length) return;
                setBlogArticles(posts.slice(0, 3).map((post, i) => ({
                    category: post.category || 'Insights',
                    title: post.title,
                    excerpt: post.excerpt || '',
                    author: post.authorName || 'Edutu Team',
                    date: formatPostDate(post.publishedAt || post.createdAt),
                    readTime: readingTime(post.content),
                    image: post.coverImage || landingBlogArticles[i % landingBlogArticles.length].image,
                    slug: post.slug,
                })));
            })
            .catch(() => { /* keep fallback articles */ });
        return () => controller.abort();
    }, []);
    const latestOpportunities = opportunities.slice(0, 3);

    const aboutFeatures: AboutFeature[] = [
        { title: 'Opportunity Matching', desc: 'Relevant scholarships, fellowships, internships, and programs in one feed.', icon: OpportunityMatchIcon, cardBg: 'linear-gradient(160deg,#d8e4fd 0%,#bcd0f9 100%)', iconColor: '#2455d6', titleColor: '#132a5c', descColor: '#42568c' },
        { title: 'Deadline Awareness', desc: 'Important dates stay visible before applications close.', icon: DeadlineIcon, cardBg: 'linear-gradient(160deg,#fbe9c6 0%,#f6d79b 100%)', iconColor: '#c2740b', titleColor: '#4a3410', descColor: '#7a5f2c' },
        { title: 'Global Network', desc: 'Connect with mentors and peers in your niche across 80+ countries.', icon: GlobalNetworkIcon, cardBg: 'linear-gradient(160deg,#cbecf1 0%,#ade0e8 100%)', iconColor: '#0e7490', titleColor: '#0d3b45', descColor: '#356b76' },
        { title: 'Application Tracking', desc: 'Track saved opportunities, applications, and progress in one dashboard.', icon: TrackingIcon, cardBg: 'linear-gradient(160deg,#d0ead9 0%,#b3e0c5 100%)', iconColor: '#0f8a4d', titleColor: '#123a26', descColor: '#3a6b50' },
    ];

    useEffect(() => {
        const interval = window.setInterval(() => {
            setHeroWordIndex((current) => (current + 1) % heroOpportunityWords.length);
        }, 2400);
        return () => window.clearInterval(interval);
    }, []);

    const formatOpportunityDeadline = (deadline?: string | null) => {
        if (!deadline) return 'Open now';
        const parsed = new Date(deadline);
        if (Number.isNaN(parsed.getTime())) return deadline;
        return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const fadeUp = reduceMotion
        ? {}
        : {
              initial: { opacity: 0, y: 20 },
              whileInView: { opacity: 1, y: 0 },
              viewport: { once: true, margin: '-40px' },
          };

    return (
        <div className="landing-page min-h-[100dvh] overflow-x-hidden bg-surface-body font-body text-text-primary">
            <PublicHeader fixed onPrimaryAction={onGetStarted} />

            <main className="relative z-10">
                {/* ─── Hero ─────────────────────────────────────────────── */}
                <section
                    className="landing-hero relative flex items-center overflow-hidden px-4 pt-24 pb-12 sm:min-h-[92vh] sm:px-6 sm:pt-28 sm:pb-20 md:min-h-dvh"
                    id="platform"
                >
                    {/* Theme-aware gradient field (dark = deep navy, light = soft mesh) */}
                    <div className="mesh-gradient pointer-events-none absolute inset-0" />
                    {/* Fine grid lines add depth over the navy field */}
                    <div className="landing-hero-grid pointer-events-none absolute inset-0" />
                    {/* Soft brand glow from the top */}
                    <div
                        className="pointer-events-none absolute inset-x-0 top-0 h-[560px]"
                        style={{
                            background:
                                'radial-gradient(56% 58% at 50% 0%, rgb(var(--color-brand-500) / 0.16), transparent 72%)',
                        }}
                    />
                    <div className="landing-grain pointer-events-none absolute inset-0 opacity-[0.35]" />

                    <div className="relative z-10 mx-auto flex w-full max-w-[960px] flex-col items-center text-center">
                        <motion.h1
                            initial={reduceMotion ? undefined : { opacity: 0, y: 30 }}
                            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.1 }}
                            className="landing-hero-title font-display text-[clamp(2.6rem,8vw,5rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-balance text-text-primary sm:text-[clamp(3.8rem,7vw,5.5rem)] md:text-[82px]"
                        >
                            Your AI guide to global{' '}
                            <span className="landing-hero-highlight whitespace-nowrap sm:block">
                                <span className="landing-hero-word inline-block align-baseline">
                                    <AnimatePresence mode="wait">
                                        <motion.span
                                            key={heroOpportunityWords[heroWordIndex]}
                                            initial={reduceMotion ? undefined : { opacity: 0, y: 24, filter: 'blur(8px)' }}
                                            animate={reduceMotion ? undefined : { opacity: 1, y: 0, filter: 'blur(0px)' }}
                                            exit={reduceMotion ? undefined : { opacity: 0, y: -24, filter: 'blur(8px)' }}
                                            transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                                            className="landing-hero-word-accent inline-block"
                                        >
                                            {heroOpportunityWords[heroWordIndex]}
                                        </motion.span>
                                    </AnimatePresence>
                                </span>
                            </span>
                        </motion.h1>

                        <motion.p
                            initial={reduceMotion ? undefined : { opacity: 0, y: 20 }}
                            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.2 }}
                            className="landing-hero-copy mt-5 max-w-[600px] text-[17px] font-normal leading-[1.5] text-text-secondary sm:mt-6 sm:text-[19px] sm:leading-[1.55]"
                        >
                            Edutu finds scholarships, fellowships, and career programs matched to
                            you — globally, automatically, before the deadline.
                        </motion.p>

                        <motion.div
                            initial={reduceMotion ? undefined : { opacity: 0, y: 20 }}
                            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.3 }}
                            className="mt-5 flex w-full flex-col gap-3 sm:mt-10 sm:w-auto sm:flex-row"
                        >
                            <button
                                onClick={onGetStarted}
                                className="group inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-9 py-4 text-[16px] font-semibold text-white shadow-elevated transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-700 focus-visible:ring-2 focus-visible:ring-brand/40"
                            >
                                Get started free
                                <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-1" />
                            </button>
                            <Link
                                to="/opportunities"
                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-strong bg-surface-layer/70 px-9 py-4 text-[16px] font-semibold text-text-primary no-underline backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/50"
                            >
                                Browse opportunities
                            </Link>
                        </motion.div>

                    </div>
                </section>

                {/* ─── Latest Opportunities ─────────────────────────────── */}
                <section className="border-t border-subtle px-4 py-20 sm:px-6">
                    <div className="mx-auto max-w-[1200px]">
                        <div className="mb-12 max-w-2xl">
                            <SectionEyebrow>Latest Opportunities</SectionEyebrow>
                            <h2 className="landing-section-title mt-4 max-w-xl font-display text-[34px] font-semibold leading-[1.12] text-text-primary sm:text-[42px]">
                                Fresh opportunities worth exploring
                            </h2>
                            <p className="landing-section-copy mt-4 max-w-[640px] text-[18px] leading-[1.5] text-text-secondary">
                                A quick look at a few scholarships, fellowships, internships, and
                                programs that are ready for action.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                            {latestOpportunities.map((opportunity, index) => (
                                <motion.article
                                    key={opportunity.id}
                                    {...fadeUp}
                                    transition={{ duration: 0.45, delay: index * 0.08 }}
                                    whileHover={reduceMotion ? undefined : { y: -3 }}
                                    className="overflow-hidden rounded-[22px] border border-subtle bg-surface-layer transition-colors hover:border-brand/40"
                                >
                                    <Link
                                        to={`/share/opportunity/${encodeURIComponent(opportunity.id)}`}
                                        className="block no-underline"
                                        aria-label={`View ${opportunity.title}`}
                                    >
                                        <div className="relative h-[210px] overflow-hidden">
                                            <img
                                                src={opportunity.image || heroBackdropImages[index % heroBackdropImages.length]}
                                                alt=""
                                                className="h-full w-full object-cover"
                                                loading="lazy"
                                                decoding="async"
                                            />
                                            <div
                                                className="absolute inset-0"
                                                style={{ background: 'linear-gradient(180deg, rgba(8,18,36,0.05) 0%, rgba(8,18,36,0.2) 100%)' }}
                                            />
                                        </div>
                                        <div className="p-5 sm:p-6">
                                            <div className="flex items-center justify-between gap-3">
                                                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand">
                                                    {opportunity.category}
                                                </p>
                                                <span className="text-[12px] font-medium text-text-muted">
                                                    {formatOpportunityDeadline(opportunity.deadline)}
                                                </span>
                                            </div>
                                            <h3 className="mt-3 font-display text-[20px] font-semibold leading-[1.18] tracking-[-0.01em] text-text-primary sm:text-[22px]">
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
                                className="inline-flex items-center gap-2 rounded-xl border border-subtle px-5 py-3 text-[16px] font-medium text-text-primary no-underline transition-all duration-200 hover:translate-x-1.5 hover:border-brand/40 hover:text-brand"
                            >
                                Explore all opportunities <ArrowRight size={16} />
                            </Link>
                        </div>
                    </div>
                </section>

                {/* ─── Country reach ────────────────────────────────────── */}
                <section className="overflow-hidden border-t border-subtle px-4 py-24 sm:px-6">
                    <div className="mx-auto mb-16 max-w-[1200px] text-center">
                        <SectionEyebrow>Global Reach</SectionEyebrow>
                        <h2 className="landing-section-title mt-4 font-display text-[48px] font-semibold leading-[1.04] text-text-primary sm:text-[56px]">
                            Opportunities from <span className="text-brand">31 Countries</span>
                        </h2>
                        <p className="landing-section-copy mx-auto mt-4 max-w-[600px] text-[20px] leading-[1.4] text-text-secondary">
                            Access scholarships, fellowships, and programs from every corner of the
                            world.
                        </p>
                    </div>

                    <div className="relative">
                        <div className="landing-country-fade-left pointer-events-none absolute bottom-0 left-0 top-0 z-10 w-32" />
                        <div className="landing-country-fade-right pointer-events-none absolute bottom-0 right-0 top-0 z-10 w-32" />

                        <div className="mb-6 flex gap-6" style={{ animation: 'marquee 30s linear infinite' }}>
                            {[...flags, ...flags].map((flag, i) => (
                                <div key={i} className="flex h-[60px] w-[80px] shrink-0 items-center justify-center rounded-lg border border-subtle bg-surface-elevated">
                                    <img src={flag} alt="" className="h-[36px] w-[48px] rounded object-cover" loading="lazy" decoding="async" />
                                </div>
                            ))}
                        </div>

                        <div className="flex gap-6" style={{ animation: 'marquee-reverse 30s linear infinite' }}>
                            {[...flags.slice().reverse(), ...flags.slice().reverse()].map((flag, i) => (
                                <div key={i} className="flex h-[60px] w-[80px] shrink-0 items-center justify-center rounded-lg border border-subtle bg-surface-elevated">
                                    <img src={flag} alt="" className="h-[36px] w-[48px] rounded object-cover" loading="lazy" decoding="async" />
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
                        .landing-country-fade-left {
                            background: linear-gradient(to right, rgb(var(--surface-body)), rgb(var(--surface-body) / 0));
                        }
                        .landing-country-fade-right {
                            background: linear-gradient(to left, rgb(var(--surface-body)), rgb(var(--surface-body) / 0));
                        }
                        @media (prefers-reduced-motion: reduce) {
                            .landing-hero { }
                        }
                    `}</style>
                </section>

                {/* ─── Impact ───────────────────────────────────────────── */}
                <section className="border-t border-subtle bg-surface-elevated px-4 py-24 sm:px-6">
                    <div className="mx-auto max-w-[1200px]">
                        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
                            <div className="max-w-2xl">
                                <SectionEyebrow>Our Impact</SectionEyebrow>
                                <h2 className="landing-section-title mt-4 font-display text-[34px] font-semibold leading-[1.08] text-text-primary sm:text-[44px]">
                                    Opportunity, shared across{' '}
                                    <span className="text-brand">a continent</span>
                                </h2>
                                <p className="landing-section-copy mt-4 max-w-[620px] text-[18px] leading-[1.5] text-text-secondary">
                                    Edutu is closing Africa's opportunity gap with responsible AI. Here's
                                    the proof — and the stories behind every number.
                                </p>
                            </div>

                            <Link
                                to="/impact"
                                className="group inline-flex items-center gap-2 self-start rounded-xl border border-subtle px-5 py-3 text-[16px] font-medium text-text-primary no-underline transition-all duration-200 hover:border-brand/40 hover:text-brand"
                            >
                                View our full impact
                                <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-1" />
                            </Link>
                        </div>

                        <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-4">
                            {homeImpactStats.map((stat, index) => (
                                <motion.div
                                    key={stat.label}
                                    {...fadeUp}
                                    transition={{ duration: 0.4, delay: index * 0.08 }}
                                    className="rounded-3xl border border-subtle bg-surface-layer p-6 shadow-soft"
                                >
                                    <HomeImpactStat value={stat.value} suffix={stat.suffix} label={stat.label} />
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ─── Institutions ─────────────────────────────────────── */}
                <section className="border-t border-subtle px-4 py-16 sm:px-6 sm:py-24">
                    <div className="mx-auto mb-10 max-w-[1200px] text-center sm:mb-16">
                        <SectionEyebrow>Top Institutions</SectionEyebrow>
                        <h2 className="landing-section-title mt-4 font-display text-[48px] font-semibold leading-[1.04] text-text-primary sm:text-[56px]">
                            Scholarships from <span className="text-brand">World-Class</span> Universities
                        </h2>
                        <p className="landing-section-copy mx-auto mt-4 max-w-[600px] text-[20px] leading-[1.4] text-text-secondary">
                            Partner with leading institutions to find opportunities that match your
                            ambition.
                        </p>
                    </div>

                    <div className="mx-auto grid max-w-[1100px] grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-4 md:grid-cols-5 lg:grid-cols-6">
                        {institutions.map((inst, i) => (
                            <motion.div
                                key={i}
                                {...fadeUp}
                                transition={{ duration: 0.4, delay: Math.min(i, 8) * 0.04 }}
                                className="group flex h-[72px] items-center justify-center rounded-xl border border-subtle bg-surface-layer/60 px-2.5 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-brand/40 hover:bg-surface-layer sm:h-[120px] sm:rounded-2xl sm:px-4"
                            >
                                <img
                                    src={inst.logo}
                                    alt={inst.name}
                                    className="max-h-[24px] max-w-[72px] object-contain opacity-70 grayscale transition-all duration-300 group-hover:opacity-100 group-hover:grayscale-0 dark:opacity-80 dark:brightness-0 dark:invert dark:grayscale-0 sm:max-h-[48px] sm:max-w-[128px]"
                                    loading="lazy"
                                    decoding="async"
                                    style={{ width: 'auto', height: 'auto' }}
                                    onError={(e) => {
                                        const target = e.currentTarget;
                                        target.style.display = 'none';
                                        const parent = target.parentElement;
                                        if (parent && !parent.querySelector('[data-fallback]')) {
                                            const fallbackLabel = document.createElement('span');
                                            fallbackLabel.textContent = inst.name;
                                            fallbackLabel.setAttribute('data-fallback', 'true');
                                            fallbackLabel.className =
                                                'text-center font-display text-[12px] font-semibold leading-tight tracking-tight text-text-secondary transition-colors group-hover:text-text-primary sm:text-[15px]';
                                            parent.appendChild(fallbackLabel);
                                        }
                                    }}
                                />
                            </motion.div>
                        ))}
                    </div>
                </section>

                {/* ─── About / features ─────────────────────────────────── */}
                <section className="border-y border-subtle px-4 py-24 sm:px-6" id="about">
                    <div className="mx-auto max-w-[1200px]">
                        <div className="mb-16">
                            <SectionEyebrow>About</SectionEyebrow>
                            <h2 className="landing-section-title mb-4 mt-4 font-display text-[48px] font-semibold leading-[1.04] text-text-primary sm:text-[56px]">
                                Built for the <span className="text-brand">Ambitious</span>
                            </h2>
                            <p className="landing-section-copy max-w-[600px] text-[20px] leading-[1.4] text-text-secondary">
                                Modular tools designed to scale your career from day one.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-4">
                            {aboutFeatures.map((feature, i) => (
                                <motion.div
                                    key={i}
                                    {...fadeUp}
                                    transition={{ duration: 0.4, delay: i * 0.08 }}
                                    className="group rounded-2xl p-5 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-elevated sm:p-8"
                                    style={{ background: feature.cardBg }}
                                >
                                    <div
                                        className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/55 transition-transform duration-300 group-hover:scale-105 sm:mb-7 sm:h-[72px] sm:w-[72px]"
                                        style={{ color: feature.iconColor }}
                                    >
                                        <feature.icon size={40} />
                                    </div>
                                    <h3 className="mb-2 font-display text-[20px] font-semibold sm:mb-3 sm:text-[22px]" style={{ color: feature.titleColor }}>
                                        {feature.title}
                                    </h3>
                                    <p className="text-[14px] leading-[1.6] sm:text-[15px]" style={{ color: feature.descColor }}>
                                        {feature.desc}
                                    </p>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ─── Blog ─────────────────────────────────────────────── */}
                <section className="border-t border-subtle bg-surface-elevated px-4 py-24 sm:px-6">
                    <div className="mx-auto max-w-[1200px]">
                        <div className="mb-12 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                            <div className="max-w-2xl">
                                <SectionEyebrow>From the Blog</SectionEyebrow>
                                <h2 className="landing-section-title mt-4 font-display text-[48px] font-semibold leading-[1.04] text-text-primary sm:text-[56px]">
                                    Stories and ideas for{' '}
                                    <span className="text-brand">ambitious learners</span>
                                </h2>
                                <p className="landing-section-copy mt-4 max-w-[620px] text-[18px] leading-[1.5] text-text-secondary">
                                    Practical guides, scholarship advice, and founder notes to help
                                    you move with more clarity.
                                </p>
                            </div>

                            <Link
                                to="/blog"
                                className="inline-flex items-center gap-2 self-start rounded-xl border border-subtle px-5 py-3 text-[16px] font-medium text-text-primary no-underline transition-all duration-200 hover:border-brand/40 hover:text-brand"
                            >
                                Read the blog <ArrowRight size={16} />
                            </Link>
                        </div>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                            {blogArticles.map((article, index) => (
                                <motion.article
                                    key={article.title}
                                    {...fadeUp}
                                    transition={{ duration: 0.45, delay: index * 0.08 }}
                                    whileHover={reduceMotion ? undefined : { y: -3 }}
                                    className="overflow-hidden rounded-[22px] border border-subtle bg-surface-layer transition-colors hover:border-brand/40"
                                >
                                    <Link to={article.slug ? `/blog/${article.slug}` : '/blog'} className="block no-underline">
                                        <div className="relative h-[220px] overflow-hidden">
                                            <img src={article.image} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                                            <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(8,18,36,0.02) 0%, rgba(8,18,36,0.24) 100%)' }} />
                                        </div>
                                        <div className="p-5 sm:p-6">
                                            <span className="rounded-full bg-brand/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-brand">
                                                {article.category}
                                            </span>
                                            <h3 className="mt-4 font-display text-[20px] font-semibold leading-[1.18] tracking-[-0.01em] text-text-primary sm:text-[22px]">
                                                {article.title}
                                            </h3>
                                            <p className="mt-2 text-[15px] leading-[1.55] text-text-secondary">
                                                {article.excerpt}
                                            </p>
                                            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] font-medium text-text-muted">
                                                <span className="inline-flex items-center gap-1.5"><User size={12} />{article.author}</span>
                                                <span className="inline-flex items-center gap-1.5"><Calendar size={12} />{article.date}</span>
                                                <span className="inline-flex items-center gap-1.5"><Clock size={12} />{article.readTime}</span>
                                            </div>
                                        </div>
                                    </Link>
                                </motion.article>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ─── Testimonials ─────────────────────────────────────── */}
                <section className="border-y border-subtle bg-surface-elevated px-4 py-24 sm:px-6">
                    <div className="mx-auto max-w-[1200px] text-center">
                        <SectionEyebrow>Testimonials</SectionEyebrow>
                        <h2 className="landing-section-title mb-16 mt-4 font-display text-[48px] font-semibold leading-[1.04] text-text-primary sm:text-[56px]">
                            Trusted by <span className="text-brand">Learners</span>
                        </h2>
                        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                            {testimonials.map((testimonial, i) => (
                                <motion.div
                                    key={i}
                                    {...fadeUp}
                                    transition={{ duration: 0.4, delay: i * 0.1 }}
                                    className="rounded-2xl border border-subtle bg-surface-layer p-8 text-left shadow-soft"
                                >
                                    <div className="mb-4 flex gap-1 text-warning">
                                        {[...Array(5)].map((_, j) => (
                                            <span key={j}>★</span>
                                        ))}
                                    </div>
                                    <p className="mb-6 text-[18px] leading-[1.5] text-text-secondary">
                                        "{testimonial.quote}"
                                    </p>
                                    <div className="flex items-center gap-3">
                                        <img
                                            src={testimonial.avatar}
                                            alt=""
                                            className="h-12 w-12 rounded-full object-cover ring-2 ring-surface-layer shadow-soft"
                                            loading="lazy"
                                            decoding="async"
                                        />
                                        <div>
                                            <div className="text-[16px] font-semibold text-text-primary">{testimonial.name}</div>
                                            <div className="text-[14px] text-text-muted">{testimonial.role} · {testimonial.country}</div>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ─── FAQ ──────────────────────────────────────────────── */}
                <section className="px-4 py-24 sm:px-6" id="faq">
                    <div className="mx-auto max-w-[800px]">
                        <div className="mb-16 text-center">
                            <SectionEyebrow>FAQ</SectionEyebrow>
                            <h2 className="landing-section-title mb-4 mt-4 font-display text-[48px] font-semibold leading-[1.04] text-text-primary sm:text-[56px]">
                                Common <span className="text-brand">Questions</span>
                            </h2>
                            <p className="landing-section-copy mx-auto max-w-[600px] text-[20px] leading-[1.4] text-text-secondary">
                                Everything you need to know about Edutu.
                            </p>
                        </div>

                        <div className="space-y-4">
                            {faqData.map((item, index) => {
                                const isOpen = openFAQ === index;
                                return (
                                    <motion.div
                                        key={index}
                                        {...fadeUp}
                                        transition={{ duration: 0.4, delay: index * 0.05 }}
                                        className={`overflow-hidden rounded-2xl border bg-surface-layer shadow-soft transition-colors ${isOpen ? 'border-brand' : 'border-subtle'}`}
                                    >
                                        <button
                                            onClick={() => setOpenFAQ(isOpen ? null : index)}
                                            className="flex w-full cursor-pointer items-center justify-between p-6 text-left"
                                            aria-expanded={isOpen}
                                        >
                                            <span className="pr-4 text-[18px] font-medium text-text-primary">
                                                {item.question}
                                            </span>
                                            <motion.div
                                                animate={reduceMotion ? undefined : { rotate: isOpen ? 180 : 0 }}
                                                transition={{ duration: 0.3, ease: 'easeInOut' }}
                                            >
                                                <ChevronDown size={20} className={isOpen ? 'text-brand' : 'text-text-muted'} />
                                            </motion.div>
                                        </button>
                                        <AnimatePresence initial={false}>
                                            {isOpen && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                                                >
                                                    <div className="px-6 pb-6">
                                                        <p className="text-[16px] leading-[1.6] text-text-secondary">
                                                            {item.answer}
                                                        </p>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </div>
                </section>

                {/* ─── Community ────────────────────────────────────────── */}
                <CommunityShowcase
                    id="community"
                    bordered={false}
                    titleLead="Join a community"
                    titleTail="that moves you forward"
                    subtitle="Thousands of learners, mentors, and future leaders — discovering and winning opportunities together."
                    ctaLabel="Join community"
                    ctaTo="/community"
                />
            </main>

            {/* ─── Footer ───────────────────────────────────────────────── */}
            <SiteFooter />
        </div>
    );
};

export default LandingPageV3;
