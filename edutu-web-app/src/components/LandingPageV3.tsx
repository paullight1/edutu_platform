import React, { useEffect, useMemo, useState } from 'react';
import {
    ArrowRight,
    Calendar,
    Clock,
    User,
    ChevronDown,
    Bell,
    X,
    Sparkles,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useOpportunities } from '../hooks/useOpportunities';
import { fetchPublishedPosts, formatPostDate, readingTime } from '../services/blog';
import PageSeo from './PageSeo';
import PublicHeader from './PublicHeader';
import SiteFooter from './SiteFooter';
import CommunityShowcase from './CommunityShowcase';
import EdutuForYouBand from './EdutuForYouBand';
import EventsHomeSection from './EventsHomeSection';
import { organizationLabel } from '../lib/organizationLabel';
import {
    DEFAULT_WEB_ANNOUNCEMENT,
    fetchWebAnnouncement,
    type WebAnnouncement,
} from '../services/webConfig';
import type { Opportunity } from '../types/opportunity';

interface LandingPageProps {
    onGetStarted: () => void;
}

interface FAQItem {
    question: string;
    answer: string;
}

/**
 * Shared heading/copy scales. Two steps only — a section title and a section
 * lede. Every section pulls from these so the page stops drifting between four
 * different heading sizes and two body sizes.
 */
const SECTION_TITLE =
    'landing-section-title font-display text-4xl font-semibold text-text-primary sm:text-5xl';
const SECTION_COPY =
    'landing-section-copy mt-4 max-w-[620px] text-base leading-[1.6] text-text-secondary sm:text-lg';
/** One radius for every content card on the page. */
const CARD = 'rounded-[22px] border border-subtle bg-surface-layer';

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

/** Neutral imagery used only when a real record has no image of its own. */
const fallbackImages = [
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

interface AboutFeature {
    title: string;
    desc: string;
    illustration: string;
    illustrationAlt: string;
    cardBg: string;
    titleColor: string;
    descColor: string;
}

const testimonials = [
    { quote: 'Edutu helped me land 3 scholarship offers in 2 months. The opportunity feed was a game changer.', name: 'Adaeze O.', role: 'Computer Science Student', country: 'Nigeria' },
    { quote: 'The opportunity tracking alone saved me from missing deadlines. Now I have a clear career path.', name: 'Tunde A.', role: 'Recent Graduate', country: 'Nigeria' },
    { quote: 'I went from confused about where to apply to having a focused list of real opportunities.', name: 'Fatima B.', role: 'MSc Candidate', country: 'Nigeria' },
];

const initialsOf = (name: string) =>
    name
        .split(' ')
        .map((part) => part.charAt(0))
        .join('')
        .slice(0, 2)
        .toUpperCase();

/**
 * Placeholder that matches the real card's geometry in BOTH layouts — compact
 * row on mobile, stacked card from sm — so the switch to real data doesn't
 * shift the section's height.
 */
const OpportunityCardSkeleton: React.FC = () => (
    <li className={`${CARD} flex items-center gap-4 overflow-hidden p-3 sm:block sm:p-0`}>
        <div className="h-20 w-20 shrink-0 animate-pulse rounded-xl bg-surface-elevated sm:h-auto sm:w-full sm:rounded-none sm:pb-[62.5%]" />
        <div className="min-w-0 flex-1 sm:p-5">
            <div className="h-3 w-24 animate-pulse rounded bg-surface-elevated" />
            <div className="mt-2.5 h-4 w-full animate-pulse rounded bg-surface-elevated" />
            <div className="mt-2 h-4 w-3/4 animate-pulse rounded bg-surface-elevated" />
        </div>
    </li>
);

/**
 * Most recently added first — the section promises "fresh", so it has to be
 * ordered by when we found the opportunity, not by the feed's default ranking
 * (which is shuffled for variety and would put months-old records on top).
 * Records with no timestamp sort last rather than jumping the queue.
 */
const addedAt = (opportunity: Opportunity): number => {
    const stamp = opportunity.createdAt || opportunity.lastUpdated;
    if (!stamp) return 0;
    const ms = Date.parse(stamp);
    return Number.isNaN(ms) ? 0 : ms;
};

const LandingPageV3: React.FC<LandingPageProps> = ({ onGetStarted }) => {
    const {
        data: opportunities,
        loading: opportunitiesLoading,
        error: opportunitiesError,
    } = useOpportunities();
    const reduceMotion = useReducedMotion();
    const [openFAQ, setOpenFAQ] = useState<number | null>(null);
    const [heroWordIndex, setHeroWordIndex] = useState(0);
    const [blogArticles, setBlogArticles] = useState<LandingArticle[]>([]);
    const [blogLoading, setBlogLoading] = useState(true);
    const [announcement, setAnnouncement] = useState<WebAnnouncement>(
        DEFAULT_WEB_ANNOUNCEMENT,
    );
    const [announcementDismissed, setAnnouncementDismissed] = useState(false);

    useEffect(() => {
        const controller = new AbortController();
        fetchPublishedPosts({ limit: 3, signal: controller.signal })
            .then((posts) => {
                setBlogArticles(posts.slice(0, 3).map((post, i) => ({
                    category: post.category || 'Insights',
                    title: post.title,
                    excerpt: post.excerpt || '',
                    author: post.authorName || 'Edutu Team',
                    date: formatPostDate(post.publishedAt || post.createdAt),
                    readTime: readingTime(post.content),
                    image: post.coverImage || fallbackImages[i % fallbackImages.length],
                    slug: post.slug,
                })));
            })
            .catch(() => {
                // Leave the list empty — the section hides itself rather than
                // shipping invented articles with invented authors.
            })
            .finally(() => {
                if (!controller.signal.aborted) setBlogLoading(false);
            });
        return () => controller.abort();
    }, []);

    useEffect(() => {
        let active = true;
        fetchWebAnnouncement().then((nextAnnouncement) => {
            if (active) setAnnouncement(nextAnnouncement);
        });
        return () => {
            active = false;
        };
    }, []);

    // Six, not five: the grid runs three-up on desktop, so five leaves a hole.
    const latestOpportunities = useMemo(
        () => [...opportunities].sort((a, b) => addedAt(b) - addedAt(a)).slice(0, 6),
        [opportunities],
    );
    const showOpportunitySkeletons = opportunitiesLoading && latestOpportunities.length === 0;
    const opportunitiesUnavailable = !opportunitiesLoading && latestOpportunities.length === 0;
    const showBlogSection = blogLoading || blogArticles.length > 0;
    const announcementUrl = announcement.linkUrl.trim() || '/edutuforyou';
    const announcementIsExternal = /^https?:\/\//i.test(announcementUrl);

    const aboutFeatures: AboutFeature[] = [
        { title: 'Opportunity Matching', desc: 'Relevant scholarships, fellowships, internships, and programs in one feed.', illustration: '/illustrations/feature-opportunity-matching.png', illustrationAlt: 'Hand-drawn compass finding an opportunity on a map', cardBg: 'linear-gradient(160deg,#d8e4fd 0%,#bcd0f9 100%)', titleColor: '#132a5c', descColor: '#42568c' },
        { title: 'Deadline Awareness', desc: 'Important dates stay visible before applications close.', illustration: '/illustrations/feature-deadline-awareness.png', illustrationAlt: 'Hand-drawn calendar and clock marking an application deadline', cardBg: 'linear-gradient(160deg,#fbe9c6 0%,#f6d79b 100%)', titleColor: '#4a3410', descColor: '#7a5f2c' },
        { title: 'Global Network', desc: 'Connect with mentors and peers building careers in your niche around the world.', illustration: '/illustrations/feature-global-network.png', illustrationAlt: 'Hand-drawn globe connecting learners across borders', cardBg: 'linear-gradient(160deg,#cbecf1 0%,#ade0e8 100%)', titleColor: '#0d3b45', descColor: '#356b76' },
        { title: 'Application Tracking', desc: 'Track saved opportunities, applications, and progress in one dashboard.', illustration: '/illustrations/feature-application-tracking.png', illustrationAlt: 'Hand-drawn checklist path showing application progress', cardBg: 'linear-gradient(160deg,#d0ead9 0%,#b3e0c5 100%)', titleColor: '#123a26', descColor: '#3a6b50' },
    ];

    useEffect(() => {
        // Users who asked for reduced motion get a stable headline, not an
        // un-animated hard cut every 2.4s.
        if (reduceMotion) return;
        const interval = window.setInterval(() => {
            setHeroWordIndex((current) => (current + 1) % heroOpportunityWords.length);
        }, 2400);
        return () => window.clearInterval(interval);
    }, [reduceMotion]);

    const fadeUp = reduceMotion
        ? {}
        : {
              initial: { opacity: 0, y: 20 },
              whileInView: { opacity: 1, y: 0 },
              viewport: { once: true, margin: '-40px' },
          };

    return (
        <div className="landing-page min-h-[100dvh] overflow-x-hidden bg-surface-body font-body text-text-primary">
            <PageSeo path="/" />
            <PublicHeader fixed onPrimaryAction={onGetStarted} />

            {announcement.enabled && announcement.text && !announcementDismissed ? (
                <aside
                    role="status"
                    className="relative z-20 mt-16 border-b border-brand/15 bg-brand-50/90 px-4 py-2.5 text-text-primary backdrop-blur dark:bg-brand-950/70 sm:px-6 sm:py-3"
                >
                    <div className="mx-auto flex max-w-[1200px] items-start gap-2.5 pr-8 text-xs sm:items-center sm:justify-between sm:gap-4 sm:text-[0.9375rem]">
                        <div className="flex min-w-0 items-start gap-2.5 sm:items-center">
                            <Bell
                                size={15}
                                aria-hidden="true"
                                className="shrink-0 text-brand-700 dark:text-brand-300"
                            />
                            <p className="min-w-0 leading-[1.35] text-text-secondary sm:leading-[1.45]">
                                {announcement.text}
                            </p>
                        </div>
                        {announcementIsExternal ? (
                            <a
                                href={announcementUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hidden shrink-0 font-semibold text-brand-700 no-underline transition hover:text-brand-800 hover:underline sm:inline-flex dark:text-brand-300 dark:hover:text-brand-200"
                            >
                                <span>{announcement.linkLabel}</span>
                            </a>
                        ) : (
                            <Link
                                to={announcementUrl}
                                className="hidden shrink-0 font-semibold text-brand-700 no-underline transition hover:text-brand-800 hover:underline sm:inline-flex dark:text-brand-300 dark:hover:text-brand-200"
                            >
                                <span>{announcement.linkLabel}</span>
                            </Link>
                        )}
                    </div>
                    <button
                        type="button"
                        aria-label="Dismiss announcement"
                        onClick={() => setAnnouncementDismissed(true)}
                        className="absolute right-3 top-2.5 flex h-7 w-7 items-center justify-center rounded-full text-text-secondary transition hover:bg-brand/10 hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:right-5 sm:top-1/2 sm:-translate-y-1/2"
                    >
                        <X size={16} aria-hidden="true" />
                    </button>
                </aside>
            ) : null}

            <main className="relative z-10">
                {/* ─── Hero ─────────────────────────────────────────────── */}
                <section
                    className="landing-hero relative flex items-center overflow-hidden px-4 pt-24 pb-12 sm:min-h-[88vh] sm:px-6 sm:pt-28 sm:pb-16 md:min-h-[88dvh]"
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
                            className="landing-hero-copy mt-5 max-w-[600px] text-lg font-normal leading-[1.5] text-text-secondary sm:mt-6 sm:text-lg sm:leading-[1.55]"
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
                                className="group inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-9 py-4 text-base font-semibold text-white shadow-elevated transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-700 focus-visible:ring-2 focus-visible:ring-brand/40"
                            >
                                Get started free
                                <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-1" />
                            </button>
                            <Link
                                to="/opportunities"
                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-strong bg-surface-layer/70 px-9 py-4 text-base font-semibold text-text-primary no-underline backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/50"
                            >
                                Browse opportunities
                            </Link>
                        </motion.div>

                    </div>
                </section>

                {/* ─── What's new ─────────────────────────────────────── */}
                <section className="border-t border-subtle px-4 py-8 sm:px-6 sm:py-10">
                    <div className="mx-auto max-w-[1000px]">
                        <motion.div
                            {...fadeUp}
                            className="group grid items-center gap-5 rounded-[22px] border border-brand/20 bg-brand-50 px-5 py-5 transition duration-300 hover:border-brand/40 hover:shadow-soft dark:bg-brand-950/45 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-6 sm:px-7"
                        >
                            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand text-white shadow-soft">
                                <Sparkles size={19} aria-hidden="true" />
                            </span>
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">What&apos;s new</p>
                                <h2 className="mt-1 font-display text-xl font-semibold tracking-[-0.02em] text-text-primary sm:text-2xl">
                                    Edutu just got sharper, calmer, and more dependable.
                                </h2>
                                <p className="mt-1 text-sm leading-6 text-text-secondary">
                                    Meet the updated AI engine, web app experience, and Edutu For You.
                                </p>
                            </div>
                            <Link
                                to="/whats-new"
                                className="inline-flex items-center gap-2 text-sm font-semibold text-brand no-underline transition group-hover:translate-x-0.5"
                            >
                                See what&apos;s new <ArrowRight size={16} aria-hidden="true" />
                            </Link>
                        </motion.div>
                    </div>
                </section>

                {/* ─── Latest Opportunities ─────────────────────────────── */}
                {/* The newest records we have, newest first. No countdown or
                    "Closed" chip here: a visitor who hasn't signed up yet is
                    deciding whether the catalogue is worth their time, and a
                    wall of expiry states argues the opposite. Deadlines belong
                    on the detail page, where they're actionable. */}
                {/* Deliberately tighter top pad on mobile: the hero stops at
                    84dvh so this heading is the thing peeking above the fold. */}
                <section className="border-t border-subtle px-4 pt-10 pb-20 sm:px-6 sm:pt-20 sm:pb-28">
                    <div className="mx-auto max-w-[1000px]">
                        <div className="mb-10 max-w-2xl">
                            <h2 className={SECTION_TITLE}>
                                Fresh opportunities worth exploring
                            </h2>
                            <p className={SECTION_COPY}>
                                Real scholarships, fellowships, internships, and programs — the
                                newest ones we've found, added as they open.
                            </p>
                        </div>

                        {opportunitiesUnavailable ? (
                            <div className={`${CARD} p-8 text-center`}>
                                <p className="text-base text-text-secondary">
                                    {opportunitiesError
                                        ? "We couldn't load the latest opportunities just now."
                                        : 'No opportunities are listed right now — new ones are added continuously.'}
                                </p>
                                <Link
                                    to="/opportunities"
                                    className="mt-4 inline-flex items-center gap-2 text-base font-semibold text-brand no-underline"
                                >
                                    Browse the full list <ArrowRight size={16} />
                                </Link>
                            </div>
                        ) : (
                            /* One card, two layouts. Below sm it stays a compact
                               row so six records don't turn into six screens of
                               scrolling; from sm it becomes a stacked tile in a
                               2-up / 3-up grid, where the artwork finally has
                               room to do the persuading. */
                            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
                                {showOpportunitySkeletons
                                    ? Array.from({ length: 6 }).map((_, i) => (
                                          <OpportunityCardSkeleton key={`skeleton-${i}`} />
                                      ))
                                    : latestOpportunities.map((opportunity, index) => {
                                      // Most scraped records carry a junk organization that
                                      // organizationLabel suppresses, so the meta row is often
                                      // empty — don't reserve space for nothing.
                                      const org = organizationLabel(opportunity.organization, opportunity.title);
                                      const meta = [org, opportunity.location].filter(Boolean) as string[];
                                      return (
                                          <motion.li
                                              key={opportunity.id}
                                              {...fadeUp}
                                              transition={{ duration: 0.4, delay: Math.min(index, 4) * 0.06 }}
                                              className="flex"
                                          >
                                              <Link
                                                  to={`/share/opportunity/${encodeURIComponent(opportunity.id)}`}
                                                  className={`${CARD} group flex w-full items-center gap-4 overflow-hidden p-3 no-underline transition-all duration-200 hover:border-brand/40 hover:shadow-elevated sm:block sm:p-0 sm:hover:-translate-y-1`}
                                              >
                                                  {/* The wrapper owns the geometry, not the image — an
                                                      <img> sized by its own intrinsic ratio makes every
                                                      card in the row a different height. */}
                                                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-surface-elevated sm:h-auto sm:w-full sm:rounded-none sm:aspect-[16/10]">
                                                      <img
                                                          src={opportunity.image || fallbackImages[index % fallbackImages.length]}
                                                          alt=""
                                                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                                                          loading="lazy"
                                                          decoding="async"
                                                          onError={(event) => {
                                                              // A dead image URL would otherwise leave a
                                                              // card-wide white hole. Swap once — guarding
                                                              // against a loop if the fallback also fails.
                                                              const img = event.currentTarget;
                                                              const fallback = fallbackImages[index % fallbackImages.length];
                                                              if (img.src !== fallback) img.src = fallback;
                                                          }}
                                                      />
                                                  </div>
                                                  <div className="min-w-0 flex-1 sm:p-5">
                                                      {/* Category leads the card the way an eyebrow does —
                                                          it's the fastest way to tell whether this row is
                                                          even the kind of thing you're looking for. */}
                                                      {/* Reserves its line even when a record has no
                                                          category, so titles stay aligned across a row
                                                          rather than inventing a category to fill it. */}
                                                      <span className="block min-h-[1.125rem] text-xs font-semibold uppercase tracking-[0.08em] text-brand">
                                                          {opportunity.category}
                                                      </span>
                                                      <h3 className="mt-1.5 line-clamp-2 font-display text-base font-semibold leading-snug text-text-primary transition-colors group-hover:text-brand sm:text-lg">
                                                          {opportunity.title}
                                                      </h3>
                                                      {meta.length > 0 ? (
                                                          <p className="mt-2 truncate text-xs text-text-secondary sm:text-sm">
                                                              {meta.join(' · ')}
                                                          </p>
                                                      ) : null}
                                                  </div>
                                              </Link>
                                          </motion.li>
                                      );
                                  })}
                            </ul>
                        )}

                        <div className="mt-8 flex justify-center">
                            <Link
                                to="/opportunities"
                                className="inline-flex items-center gap-2 rounded-xl border border-subtle px-5 py-3 text-base font-medium text-text-primary no-underline transition-all duration-200 hover:translate-x-1.5 hover:border-brand/40 hover:text-brand"
                            >
                                Explore all opportunities <ArrowRight size={16} />
                            </Link>
                        </div>
                    </div>
                </section>

                {/* ─── Country reach ────────────────────────────────────── */}
                <section className="overflow-hidden border-t border-subtle px-4 py-14 sm:px-6 sm:py-16">
                    <div className="mx-auto mb-10 max-w-[1200px] text-center">
                        <h2 className={SECTION_TITLE}>
                            Opportunities from <span className="text-brand">31 countries</span>
                        </h2>
                        <p className={`${SECTION_COPY} mx-auto text-center`}>
                            Access scholarships, fellowships, and programs from every corner of the
                            world.
                        </p>
                    </div>

                    <div className="relative overflow-hidden" aria-hidden="true">
                        <div className="landing-country-fade-left pointer-events-none absolute bottom-0 left-0 top-0 z-10 hidden w-32 sm:block" />
                        <div className="landing-country-fade-right pointer-events-none absolute bottom-0 right-0 top-0 z-10 hidden w-32 sm:block" />

                        <div className="landing-marquee flex gap-6">
                            {[...flags, ...flags].map((flag, i) => (
                                <div key={i} className="flex h-[60px] w-[80px] shrink-0 items-center justify-center rounded-lg border border-subtle bg-surface-elevated">
                                    <img src={flag} alt="" className="h-[36px] w-[48px] rounded object-cover" loading="lazy" decoding="async" />
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ─── Impact ───────────────────────────────────────────── */}
                <section className="border-t border-subtle bg-surface-elevated px-4 py-14 sm:px-6 sm:py-16">
                    <div className="mx-auto grid max-w-[1200px] items-center gap-8 md:grid-cols-[minmax(0,1fr)_minmax(240px,360px)] md:gap-12">
                        <div>
                            <div className="max-w-2xl">
                                <h2 className={SECTION_TITLE}>
                                    Opportunity, shared across{' '}
                                    <span className="text-brand">a continent</span>
                                </h2>
                                <p className={SECTION_COPY}>
                                    Edutu is closing Africa's opportunity gap with responsible AI.
                                    See how learners are using it, and the stories behind the work.
                                </p>
                            </div>

                            <Link
                                to="/impact"
                                className="mt-6 inline-flex items-center gap-2 rounded-xl border border-subtle bg-surface-layer px-5 py-3 text-base font-medium text-text-primary no-underline transition-all duration-200 hover:border-brand/40 hover:text-brand"
                            >
                                Read our impact story
                                <ArrowRight size={16} />
                            </Link>
                        </div>
                        <motion.div
                            {...fadeUp}
                            className="flex justify-center md:justify-end"
                        >
                            <motion.img
                                src="/illustrations/edutu-global-opportunity-globe.png"
                                alt="Hand-drawn globe showing opportunity moving across borders"
                                className="w-full max-w-[250px] drop-shadow-[0_18px_24px_rgba(24,86,220,0.18)] sm:max-w-[310px]"
                                animate={reduceMotion ? undefined : { rotate: [0, 3, -3, 0], y: [0, -5, 0] }}
                                transition={reduceMotion ? undefined : { duration: 8, repeat: Infinity, ease: 'easeInOut' }}
                            />
                        </motion.div>
                    </div>
                </section>

                {/* ─── Institutions ─────────────────────────────────────── */}
                <section className="border-t border-subtle px-4 py-14 sm:px-6 sm:py-20">
                    <div className="mx-auto mb-10 max-w-[1200px] text-center">
                        <h2 className={SECTION_TITLE}>
                            Scholarships from <span className="text-brand">world-class</span> universities
                        </h2>
                        <p className={`${SECTION_COPY} mx-auto text-center`}>
                            Opportunities sourced from institutions like these — and hundreds more
                            worldwide.
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
                                                'text-center font-display text-xs font-semibold leading-tight text-text-secondary transition-colors group-hover:text-text-primary sm:text-base';
                                            parent.appendChild(fallbackLabel);
                                        }
                                    }}
                                />
                            </motion.div>
                        ))}
                    </div>
                </section>

                {/* ─── About / features ─────────────────────────────────── */}
                <section className="border-y border-subtle px-4 py-20 sm:px-6 sm:py-28" id="about">
                    <div className="mx-auto max-w-[1200px]">
                        <div className="mb-12">
                            <h2 className={SECTION_TITLE}>
                                Built for the <span className="text-brand">ambitious</span>
                            </h2>
                            <p className={SECTION_COPY}>
                                Modular tools designed to scale your career from day one.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-4">
                            {aboutFeatures.map((feature, i) => (
                                <motion.div
                                    key={i}
                                    {...fadeUp}
                                    transition={{ duration: 0.4, delay: i * 0.08 }}
                                    className="group rounded-[22px] p-5 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-elevated sm:p-8"
                                    style={{ background: feature.cardBg }}
                                >
                                    <div className="relative -mx-3 -mt-3 mb-3 h-44 sm:-mx-5 sm:-mt-5 sm:mb-5 sm:h-52">
                                        <motion.img
                                            src={feature.illustration}
                                            alt={feature.illustrationAlt}
                                            loading="lazy"
                                            decoding="async"
                                            className="absolute -inset-[10%] h-[120%] w-[120%] max-w-none object-contain transition-transform duration-500 group-hover:scale-[1.04]"
                                            animate={
                                                reduceMotion
                                                    ? undefined
                                                    : { y: [0, -7, 0], rotate: [0, 1.5, 0] }
                                            }
                                            transition={
                                                reduceMotion
                                                    ? undefined
                                                    : {
                                                          duration: 6 + i,
                                                          repeat: Infinity,
                                                          ease: 'easeInOut',
                                                          delay: i * 0.2,
                                                      }
                                            }
                                        />
                                    </div>
                                    <h3 className="mb-2 font-display text-xl font-bold sm:mb-3 sm:text-xl" style={{ color: feature.titleColor }}>
                                        {feature.title}
                                    </h3>
                                    <p className="text-sm leading-[1.6] sm:text-base" style={{ color: feature.descColor }}>
                                        {feature.desc}
                                    </p>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ─── Events ───────────────────────────────────────────── */}
                <EventsHomeSection />

                {/* ─── Blog ─────────────────────────────────────────────── */}
                {showBlogSection ? (
                    <section className="border-t border-subtle bg-surface-elevated px-4 py-20 sm:px-6 sm:py-28">
                        <div className="mx-auto max-w-[1200px]">
                            <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                                <div className="max-w-2xl">
                                    <h2 className={SECTION_TITLE}>
                                        Stories and ideas for{' '}
                                        <span className="text-brand">ambitious learners</span>
                                    </h2>
                                    <p className={SECTION_COPY}>
                                        Practical guides, scholarship advice, and founder notes to help
                                        you move with more clarity.
                                    </p>
                                </div>

                                <Link
                                    to="/blog"
                                    className="inline-flex items-center gap-2 self-start rounded-xl border border-subtle bg-surface-layer px-5 py-3 text-base font-medium text-text-primary no-underline transition-all duration-200 hover:border-brand/40 hover:text-brand"
                                >
                                    Read the blog <ArrowRight size={16} />
                                </Link>
                            </div>

                            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                                {blogLoading && blogArticles.length === 0
                                    ? Array.from({ length: 3 }).map((_, i) => (
                                          <div key={`blog-skeleton-${i}`} className={`${CARD} overflow-hidden`}>
                                              <div className="h-[220px] animate-pulse bg-surface-elevated" />
                                              <div className="p-5 sm:p-6">
                                                  <div className="h-4 w-20 animate-pulse rounded-full bg-surface-elevated" />
                                                  <div className="mt-4 h-5 w-full animate-pulse rounded bg-surface-elevated" />
                                                  <div className="mt-2 h-5 w-2/3 animate-pulse rounded bg-surface-elevated" />
                                                  <div className="mt-6 h-3 w-1/2 animate-pulse rounded bg-surface-elevated" />
                                              </div>
                                          </div>
                                      ))
                                    : blogArticles.map((article, index) => (
                                          <motion.article
                                              key={article.title}
                                              {...fadeUp}
                                              transition={{ duration: 0.45, delay: index * 0.08 }}
                                              whileHover={reduceMotion ? undefined : { y: -3 }}
                                              className={`${CARD} overflow-hidden transition-colors hover:border-brand/40`}
                                          >
                                              <Link to={article.slug ? `/blog/${article.slug}` : '/blog'} className="block no-underline">
                                                  <div className="relative h-[220px] overflow-hidden">
                                                      <img src={article.image} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                                                      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(8,18,36,0.02) 0%, rgba(8,18,36,0.24) 100%)' }} />
                                                  </div>
                                                  <div className="p-5 sm:p-6">
                                                      <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">
                                                          {article.category}
                                                      </span>
                                                      <h3 className="mt-4 line-clamp-2 font-display text-xl font-bold leading-[1.18] tracking-[-0.01em] text-text-primary sm:text-xl">
                                                          {article.title}
                                                      </h3>
                                                      <p className="mt-2 line-clamp-3 text-base leading-[1.55] text-text-secondary">
                                                          {article.excerpt}
                                                      </p>
                                                      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium text-text-secondary">
                                                          <span className="inline-flex items-center gap-1.5 min-w-0"><User size={12} className="shrink-0" /><span className="truncate">{article.author}</span></span>
                                                          <span className="inline-flex items-center gap-1.5"><Calendar size={12} className="shrink-0" />{article.date}</span>
                                                          <span className="inline-flex items-center gap-1.5"><Clock size={12} className="shrink-0" />{article.readTime}</span>
                                                      </div>
                                                  </div>
                                              </Link>
                                          </motion.article>
                                      ))}
                            </div>
                        </div>
                    </section>
                ) : null}

                {/* ─── Testimonials ─────────────────────────────────────── */}
                <section className="border-y border-subtle bg-surface-elevated px-4 py-20 sm:px-6 sm:py-28">
                    <div className="mx-auto max-w-[1200px]">
                        <h2 className={`${SECTION_TITLE} mb-12 text-center`}>
                            Trusted by <span className="text-brand">learners</span>
                        </h2>
                        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                            {testimonials.map((testimonial, i) => (
                                <motion.figure
                                    key={i}
                                    {...fadeUp}
                                    transition={{ duration: 0.4, delay: i * 0.1 }}
                                    className={`${CARD} m-0 p-8 text-left shadow-soft`}
                                >
                                    <blockquote className="text-lg leading-[1.55] text-text-primary">
                                        "{testimonial.quote}"
                                    </blockquote>
                                    <figcaption className="mt-6 flex items-center gap-3">
                                        <span
                                            aria-hidden="true"
                                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand/10 font-display text-base font-bold text-brand"
                                        >
                                            {initialsOf(testimonial.name)}
                                        </span>
                                        <span className="min-w-0">
                                            <span className="block text-base font-semibold text-text-primary">{testimonial.name}</span>
                                            <span className="block text-sm text-text-secondary">{testimonial.role} · {testimonial.country}</span>
                                        </span>
                                    </figcaption>
                                </motion.figure>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ─── Edutu For You (impact program) ───────────────────── */}
                <EdutuForYouBand />

                {/* ─── FAQ ──────────────────────────────────────────────── */}
                <section className="px-4 py-20 sm:px-6 sm:py-28" id="faq">
                    <div className="mx-auto max-w-[800px]">
                        <div className="mb-12 text-center">
                            <h2 className={SECTION_TITLE}>
                                Common <span className="text-brand">questions</span>
                            </h2>
                            <p className={`${SECTION_COPY} mx-auto text-center`}>
                                Everything you need to know about Edutu.
                            </p>
                        </div>

                        <div className="space-y-4">
                            {faqData.map((item, index) => {
                                const isOpen = openFAQ === index;
                                const panelId = `faq-panel-${index}`;
                                const buttonId = `faq-button-${index}`;
                                return (
                                    <motion.div
                                        key={index}
                                        {...fadeUp}
                                        transition={{ duration: 0.4, delay: index * 0.05 }}
                                        className={`overflow-hidden rounded-[22px] border bg-surface-layer shadow-soft transition-colors ${isOpen ? 'border-brand' : 'border-subtle'}`}
                                    >
                                        <button
                                            id={buttonId}
                                            onClick={() => setOpenFAQ(isOpen ? null : index)}
                                            className="flex w-full cursor-pointer items-center justify-between p-6 text-left"
                                            aria-expanded={isOpen}
                                            aria-controls={panelId}
                                        >
                                            <span className="pr-4 text-lg font-medium text-text-primary">
                                                {item.question}
                                            </span>
                                            <motion.span
                                                className="shrink-0"
                                                animate={reduceMotion ? undefined : { rotate: isOpen ? 180 : 0 }}
                                                transition={{ duration: 0.3, ease: 'easeInOut' }}
                                            >
                                                <ChevronDown size={20} className={isOpen ? 'text-brand' : 'text-text-secondary'} aria-hidden="true" />
                                            </motion.span>
                                        </button>
                                        <AnimatePresence initial={false}>
                                            {isOpen && (
                                                <motion.div
                                                    id={panelId}
                                                    role="region"
                                                    aria-labelledby={buttonId}
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                                                >
                                                    <div className="px-6 pb-6">
                                                        <p className="text-base leading-[1.6] text-text-secondary">
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

                        {/* Closing ask — the page previously never re-invited signup
                            after the hero, which is exactly where a convinced
                            reader is ready to act. */}
                        <div className="mt-14 flex flex-col items-center gap-4 rounded-[22px] border border-subtle bg-surface-layer px-6 py-10 text-center shadow-soft">
                            <h3 className="font-display text-2xl font-semibold text-text-primary sm:text-3xl">
                                Start finding opportunities you can actually win
                            </h3>
                            <p className="max-w-[440px] text-base leading-[1.55] text-text-secondary">
                                Free to join. Browse everything, track your deadlines, and get
                                matches built around your profile.
                            </p>
                            <button
                                onClick={onGetStarted}
                                className="group mt-1 inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-8 py-4 text-base font-semibold text-white shadow-elevated transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-700 focus-visible:ring-2 focus-visible:ring-brand/40"
                            >
                                Get started free
                                <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-1" />
                            </button>
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
