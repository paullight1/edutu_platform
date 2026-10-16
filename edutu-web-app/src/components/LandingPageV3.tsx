import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    ArrowRight,
    Calendar,
    Clock,
    User,
    ChevronDown,
    RefreshCw,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useOpportunities } from '../hooks/useOpportunities';
import { fetchPublishedPosts, formatPostDate, readingTime } from '../services/blog';
import PageSeo from './PageSeo';
import HomepageHeader from './HomepageHeader';
import './Homepage.css';
import SiteFooter from './SiteFooter';
import CommunityShowcase from './CommunityShowcase';
import EdutuForYouBand from './EdutuForYouBand';
import EventsHomeSection from './EventsHomeSection';
import { organizationLabel } from '../lib/organizationLabel';
import {
    createOpportunityShuffleSeed,
    shuffleOpportunityFeed,
} from '../lib/opportunityShuffle';
import {
    isOpportunityExpired,
    parseOpportunityDeadline,
} from '../services/opportunities';
import {
    DEFAULT_WEB_ANNOUNCEMENT,
    fetchWebAnnouncement,
    normalizeWebLink,
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

const countryFlagRows = [
    flags,
    [...flags.slice(flags.length / 2), ...flags.slice(0, flags.length / 2)],
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

/** Matches the image-led opportunity card while the catalogue loads. */
const OpportunityCardSkeleton: React.FC = () => (
    <li className={`${CARD} w-[82%] max-w-[320px] flex-none snap-start overflow-hidden sm:w-auto sm:max-w-none`} aria-hidden="true">
        <div className="aspect-[4/3] w-full animate-pulse bg-surface-elevated sm:aspect-[16/10]" />
        <div className="p-4 sm:p-5">
            <div className="h-3 w-24 animate-pulse rounded bg-surface-elevated" />
            <div className="mt-2.5 h-4 w-full animate-pulse rounded bg-surface-elevated" />
            <div className="mt-2 h-4 w-3/4 animate-pulse rounded bg-surface-elevated" />
            <div className="mt-3 h-3 w-1/2 animate-pulse rounded bg-surface-elevated" />
        </div>
    </li>
);

const isOpportunityCurrentlyAvailable = (
    opportunity: Opportunity,
    now: Date = new Date(),
): boolean => {
    if (isOpportunityExpired(opportunity, now)) return false;

    const opensAt = parseOpportunityDeadline(opportunity.openDate);
    return !opensAt || opensAt.getTime() <= now.getTime();
};

const LandingPageV3: React.FC<LandingPageProps> = ({ onGetStarted }) => {
    const {
        data: opportunities,
        loading: opportunitiesLoading,
        error: opportunitiesError,
        refresh: refreshOpportunities,
    } = useOpportunities();
    const reduceMotion = useReducedMotion();
    const [openFAQ, setOpenFAQ] = useState<number | null>(null);
    const [blogArticles, setBlogArticles] = useState<LandingArticle[]>([]);
    const [blogLoading, setBlogLoading] = useState(true);
    const [announcement, setAnnouncement] = useState<WebAnnouncement>(
        DEFAULT_WEB_ANNOUNCEMENT,
    );
    const impactGlobeRef = useRef<HTMLDivElement>(null);
    const [loadImpactGlobe, setLoadImpactGlobe] = useState(false);
    const [opportunitySelection] = useState(() => ({
        seed: createOpportunityShuffleSeed(),
        selectedAt: new Date(),
    }));

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
        const target = impactGlobeRef.current;
        if (!target) return;
        if (typeof IntersectionObserver === 'undefined') {
            setLoadImpactGlobe(true);
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry?.isIntersecting) return;
                setLoadImpactGlobe(true);
                observer.disconnect();
            },
            { rootMargin: '500px 0px' },
        );
        observer.observe(target);
        return () => observer.disconnect();
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

    // Generate the seed once per page load. Unrelated re-renders preserve the
    // order, while a full refresh produces a new selection.
    const selectedOpportunities = useMemo(
        () => shuffleOpportunityFeed(
            opportunities.filter((opportunity) =>
                isOpportunityCurrentlyAvailable(opportunity, opportunitySelection.selectedAt),
            ),
            opportunitySelection.seed,
        ).slice(0, 6),
        [opportunities, opportunitySelection],
    );
    const showOpportunitySkeletons = opportunitiesLoading && selectedOpportunities.length === 0;
    const opportunitiesUnavailable = !opportunitiesLoading && selectedOpportunities.length === 0;
    const showBlogSection = blogLoading || blogArticles.length > 0;
    const announcementText = announcement.text === 'Help Edutu For You reach 1 million young people with access to global opportunities.'
        ? 'Help 1 million young people find their next opportunity.'
        : announcement.text;
    const announcementUrl = normalizeWebLink(announcement.linkUrl, '/edutuforyou');
    const announcementIsExternal = announcementUrl.startsWith('https://');

    const aboutFeatures: AboutFeature[] = [
        { title: 'Opportunity Matching', desc: 'Relevant scholarships, fellowships, internships, and programs in one feed.', illustration: '/illustrations/feature-opportunity-matching.png', illustrationAlt: 'Hand-drawn compass finding an opportunity on a map', cardBg: 'linear-gradient(160deg,#d8e4fd 0%,#bcd0f9 100%)', titleColor: '#132a5c', descColor: '#42568c' },
        { title: 'Deadline Awareness', desc: 'Important dates stay visible before applications close.', illustration: '/illustrations/feature-deadline-awareness.png', illustrationAlt: 'Hand-drawn calendar and clock marking an application deadline', cardBg: 'linear-gradient(160deg,#fbe9c6 0%,#f6d79b 100%)', titleColor: '#4a3410', descColor: '#7a5f2c' },
        { title: 'Global Network', desc: 'Connect with mentors and peers building careers in your niche around the world.', illustration: '/illustrations/feature-global-network.png', illustrationAlt: 'Hand-drawn globe connecting learners across borders', cardBg: 'linear-gradient(160deg,#cbecf1 0%,#ade0e8 100%)', titleColor: '#0d3b45', descColor: '#356b76' },
        { title: 'Application Tracking', desc: 'Track saved opportunities, applications, and progress in one dashboard.', illustration: '/illustrations/feature-application-tracking.png', illustrationAlt: 'Hand-drawn checklist path showing application progress', cardBg: 'linear-gradient(160deg,#d0ead9 0%,#b3e0c5 100%)', titleColor: '#123a26', descColor: '#3a6b50' },
    ];

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
            <HomepageHeader onGetStarted={onGetStarted} />
            <main className="relative z-10">
                <section className="homepage-hero" id="platform" aria-labelledby="homepage-hero-title">
                    <div className="homepage-hero-field" aria-hidden="true"><div className="homepage-hero-dots" /><div className="homepage-hero-wave" /></div>
                    <div className="homepage-hero-content">
                        {announcement.enabled && announcement.text && (
                            <aside className="homepage-announcement" aria-label="Edutu announcement">
                                {announcementIsExternal ? (
                                    <a href={announcementUrl} target="_blank" rel="noopener noreferrer" aria-label={`${announcementText} — ${announcement.linkLabel}`}><span>{announcementText}</span><span className="homepage-announcement-arrow"><ArrowRight size={24} aria-hidden="true" /></span></a>
                                ) : (
                                    <Link to={announcementUrl} aria-label={`${announcementText} — ${announcement.linkLabel}`}><span>{announcementText}</span><span className="homepage-announcement-arrow"><ArrowRight size={24} aria-hidden="true" /></span></Link>
                                )}
                            </aside>
                        )}
                        <motion.h1 id="homepage-hero-title" initial={reduceMotion ? undefined : { opacity: 0, y: 24 }} animate={reduceMotion ? undefined : { opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }} className="homepage-hero-title">
                            Global opportunities<br /><span>at your fingertips.</span>
                        </motion.h1>
                        <motion.p initial={reduceMotion ? undefined : { opacity: 0, y: 18 }} animate={reduceMotion ? undefined : { opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.12 }} className="homepage-hero-copy">
                            Finding the right opportunity can take hours of searching. Edutu’s AI matches your goals with scholarships, internships, and career programs, then helps you prepare your next move.
                        </motion.p>
                        <motion.div initial={reduceMotion ? undefined : { opacity: 0, y: 16 }} animate={reduceMotion ? undefined : { opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.24 }} className="homepage-hero-actions">
                            <button type="button" onClick={onGetStarted} className="homepage-button homepage-button-blue">Get started free</button>
                        </motion.div>
                    </div>
                </section>

                {/* ─── Available Opportunities ──────────────────────────── */}
                {/* Six currently open records, shuffled once per visit. No countdown or
                    "Closed" chip here: a visitor who hasn't signed up yet is
                    deciding whether the catalogue is worth their time, and a
                    wall of expiry states argues the opposite. Deadlines belong
                    on the detail page, where they're actionable. */}
                {/* Deliberately tighter top pad on mobile: the hero stops at
                    84dvh so this heading is the thing peeking above the fold. */}
                <section className="border-t border-subtle px-4 pt-10 pb-20 sm:px-6 sm:pt-20 sm:pb-28">
                    <div className="mx-auto max-w-[1000px]">
                        <div className="mb-6 max-w-2xl sm:mb-10">
                            <h2 className={SECTION_TITLE}>
                                A good place to start
                            </h2>
                            <p className={SECTION_COPY}>
                                Explore open scholarships, internships, and programs. Save the ones that fit your goals.
                            </p>
                        </div>

                        {opportunitiesUnavailable ? (
                            <div className={`${CARD} p-8 text-center`}>
                                <p className="text-base text-text-secondary">
                                    {opportunitiesError
                                        ? "We couldn't load the latest opportunities just now."
                                        : 'No opportunities are listed right now — new ones are added continuously.'}
                                </p>
                                {opportunitiesError && (
                                    <button
                                        type="button"
                                        onClick={refreshOpportunities}
                                        className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-full border border-subtle bg-surface-body px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-brand/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                                    >
                                        <RefreshCw size={15} aria-hidden="true" />
                                        Try again
                                    </button>
                                )}
                                <Link
                                    to="/opportunities"
                                    className="mt-4 inline-flex items-center gap-2 text-base font-semibold text-brand no-underline"
                                >
                                    Browse the full list <ArrowRight size={16} />
                                </Link>
                            </div>
                        ) : (
                            <ul
                                aria-label="Open opportunities"
                                className="-mr-4 flex gap-3 overflow-x-auto overscroll-x-contain pb-3 pr-4 snap-x snap-mandatory scroll-px-4 sm:mr-0 sm:grid sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:pb-0 sm:pr-0 lg:grid-cols-3"
                            >
                                {showOpportunitySkeletons
                                    ? Array.from({ length: 6 }).map((_, i) => (
                                          <OpportunityCardSkeleton key={`skeleton-${i}`} />
                                      ))
                                    : selectedOpportunities.map((opportunity, index) => {
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
                                              className="w-[82%] max-w-[320px] flex-none snap-start sm:w-auto sm:max-w-none"
                                          >
                                              <Link
                                                  to={`/share/opportunity/${encodeURIComponent(opportunity.id)}`}
                                                  className={`${CARD} group flex h-full w-full flex-col overflow-hidden no-underline transition-colors duration-200 hover:border-brand/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand`}
                                              >
                                                  <div className="aspect-[4/3] w-full overflow-hidden bg-surface-elevated sm:aspect-[16/10]">
                                                      <img
                                                          src={opportunity.image || fallbackImages[index % fallbackImages.length]}
                                                          alt=""
                                                          className="h-full w-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.04]"
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
                                                  <div className="flex min-w-0 flex-1 flex-col p-4 sm:p-5">
                                                      <span className="block min-h-[1.125rem] text-xs font-semibold uppercase tracking-[0.08em] text-brand">
                                                          {opportunity.category}
                                                      </span>
                                                      <h3 className="mt-2 line-clamp-2 font-display text-base font-semibold leading-snug text-text-primary transition-colors group-hover:text-brand sm:text-lg">
                                                          {opportunity.title}
                                                      </h3>
                                                      {meta.length > 0 ? (
                                                          <p className="mt-auto truncate pt-3 text-xs text-text-secondary sm:text-sm">
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

                    <div className="relative space-y-3 overflow-hidden sm:space-y-4" aria-hidden="true" dir="ltr">
                        <div className="landing-country-fade-left pointer-events-none absolute bottom-0 left-0 top-0 z-10 hidden w-32 sm:block" />
                        <div className="landing-country-fade-right pointer-events-none absolute bottom-0 right-0 top-0 z-10 hidden w-32 sm:block" />

                        {countryFlagRows.map((rowFlags, rowIndex) => (
                            <div
                                key={rowIndex}
                                className={`landing-marquee landing-marquee--${rowIndex === 0 ? 'forward' : 'reverse'} flex w-max`}
                            >
                                {[0, 1].map((setIndex) => (
                                    <div key={setIndex} className="landing-marquee__set flex shrink-0 gap-3 pr-3 sm:gap-6 sm:pr-6">
                                        {rowFlags.map((flag) => (
                                            <div key={`${setIndex}-${flag}`} className="flex h-[52px] w-[68px] shrink-0 items-center justify-center rounded-lg border border-subtle bg-surface-elevated sm:h-[60px] sm:w-[80px]">
                                                <img src={flag} alt="" className="h-8 w-11 rounded object-cover sm:h-9 sm:w-12" loading="lazy" decoding="async" />
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        ))}
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
                            ref={impactGlobeRef}
                        >
                            <motion.img
                                src={loadImpactGlobe ? "/illustrations/edutu-global-opportunity-globe.webp" : undefined}
                                alt="Hand-drawn globe showing opportunity moving across borders"
                                className="w-full max-w-[250px] drop-shadow-[0_18px_24px_rgba(24,86,220,0.18)] sm:max-w-[310px]"
                                width={1303}
                                height={1207}
                                loading="lazy"
                                decoding="async"
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
                                From discovery to <span className="text-brand">your next step</span>
                            </h2>
                            <p className={SECTION_COPY}>
                                Find relevant opportunities, keep deadlines in view, and organise your applications in one workspace.
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
            <SiteFooter expandedOnMobile />
        </div>
    );
};

export default LandingPageV3;
