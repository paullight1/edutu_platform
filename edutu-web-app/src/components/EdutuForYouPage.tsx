import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    AnimatePresence,
    motion,
    useReducedMotion,
    type Variants,
} from 'framer-motion';
import {
    ArrowRight,
    ArrowUpRight,
    ChevronLeft,
    ChevronRight,
    Mail,
    MessageCircle,
} from 'lucide-react';
import PageSeo from './PageSeo';
import PublicHeader from './PublicHeader';
import SiteFooter from './SiteFooter';
import ImageWithFallback from './ImageWithFallback';
import StoryCard from './edutu-for-you/StoryCard';
import FaqAccordion from './edutu-for-you/FaqAccordion';
import {
    GAP_STATS,
    GAP_THESIS,
    HERO_PRIMARY_LABEL,
    HERO_SECONDARY_LABEL,
    JOIN_CTA_LABEL,
    JOIN_ELIGIBILITY,
    JOIN_STEPS,
    MILESTONES,
    NARRATIVE_BEAT,
    PARTNER_EMAIL,
    PARTNER_LANES,
    PARTNER_MAILTO,
    PARTNER_PITCH,
    PILLARS,
    PROGRAM_FAQ,
    PROGRAM_HEADLINE,
    PROGRAM_KICKER,
    PROGRAM_SUBHEAD,
    PROGRAM_TIMELINE,
    WHATSAPP_JOIN_URL,
} from '../lib/edutuForYou';
import {
    STORIES as SEED_STORIES,
    STORY_ATTRIBUTION,
    type Story,
} from '../lib/edutuForYouStories';
import { fetchImpactStories } from '../services/impactStories';

const HERO_PHOTO = '/community/scholarships.jpg';
const HERO_PHOTO_ALT = 'Young people working together on scholarship applications';
const MASCOT_IMAGE = '/mascot/edutu-profile-guide.png';

const PILLAR_IMAGES = [
    '/discovery/scholarships.png',
    '/illustrations/feature-application-tracking.png',
    '/community/study-support.jpg',
    '/illustrations/feature-global-network.png',
] as const;

const fadeUp: Variants = {
    hidden: { opacity: 0, y: 24 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.58, ease: [0.16, 1, 0.3, 1] },
    },
};

const stagger: Variants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.06, delayChildren: 0.04 },
    },
};

const SHELL = 'mx-auto max-w-[1240px]';
const SECTION = 'px-4 py-20 sm:px-6 sm:py-28 lg:py-32';
const EYEBROW =
    'text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-brand';
const TITLE =
    'font-display text-[2rem] font-semibold leading-[1.04] tracking-[-0.04em] text-text-primary sm:text-[3.25rem]';

const Reveal: React.FC<{ children: React.ReactNode; className?: string }> = ({
    children,
    className,
}) => (
    <motion.div
        variants={stagger}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.12 }}
        className={className}
    >
        {children}
    </motion.div>
);

/** /edutuforyou — Edutu's impact program in six purposeful sections. */
const EdutuForYouPage: React.FC = () => {
    const [stories, setStories] = useState<Story[]>(SEED_STORIES);
    const [showAllStories, setShowAllStories] = useState(false);
    const [scholarshipSlide, setScholarshipSlide] = useState(0);
    const reduceMotion = useReducedMotion();
    const slides = NARRATIVE_BEAT.slides;
    const activeSlide = slides[scholarshipSlide];

    useEffect(() => {
        if (reduceMotion) return;
        const timer = window.setInterval(() => {
            setScholarshipSlide((current) => (current + 1) % slides.length);
        }, 7000);
        return () => window.clearInterval(timer);
    }, [reduceMotion, slides.length]);

    useEffect(() => {
        const controller = new AbortController();
        fetchImpactStories(controller.signal).then((rows) => {
            if (!controller.signal.aborted) setStories(rows);
        });
        return () => controller.abort();
    }, []);

    const hasComposites = stories.some((story) => story.isComposite);
    const visibleStories = showAllStories ? stories : stories.slice(0, 3);

    return (
        <div className="min-h-screen bg-surface-body">
            <PageSeo path="/edutuforyou" />
            <PublicHeader />

            <main>
                {/* 01 — Hero */}
                <section
                    aria-labelledby="edutu-for-you-title"
                    className="relative isolate flex min-h-[calc(100dvh-4rem)] items-end overflow-hidden bg-[#071228] px-4 pb-12 pt-24 text-white sm:px-6 sm:pb-16 lg:pb-20"
                >
                    <div className="absolute inset-0 -z-20">
                        <ImageWithFallback
                            src={HERO_PHOTO}
                            alt={HERO_PHOTO_ALT}
                            className="h-full w-full object-cover object-[54%_center]"
                        />
                    </div>
                    <div
                        aria-hidden="true"
                        className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(4,12,31,0.97)_0%,rgba(4,12,31,0.82)_46%,rgba(4,12,31,0.18)_100%)]"
                    />
                    <div
                        aria-hidden="true"
                        className="absolute inset-x-0 bottom-0 -z-10 h-44 bg-gradient-to-t from-[#071228] to-transparent"
                    />

                    <motion.div
                        variants={stagger}
                        initial="hidden"
                        animate="visible"
                        className={`${SHELL} grid w-full gap-10 lg:grid-cols-[minmax(0,1fr)_15rem] lg:items-end`}
                    >
                        <div className="max-w-[58rem]">
                            <motion.p
                                variants={fadeUp}
                                className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#b9cbff]"
                            >
                                <span className="h-px w-10 bg-[#7ea2ff]" aria-hidden="true" />
                                {PROGRAM_KICKER}
                            </motion.p>
                            <motion.h1
                                id="edutu-for-you-title"
                                variants={fadeUp}
                                className="mt-6 max-w-[13ch] text-balance font-display text-[clamp(3.25rem,8vw,7.2rem)] font-semibold leading-[0.9] tracking-[-0.065em] text-white"
                            >
                                {PROGRAM_HEADLINE}
                            </motion.h1>
                            <motion.p
                                variants={fadeUp}
                                className="mt-7 max-w-[48ch] text-pretty text-base leading-[1.7] text-white/72 sm:text-xl"
                            >
                                {PROGRAM_SUBHEAD}
                            </motion.p>
                            <motion.div
                                variants={fadeUp}
                                className="mt-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center"
                            >
                                <Link
                                    to="/signup"
                                    className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#2f6df6] px-6 py-3.5 text-base font-semibold text-white no-underline shadow-[0_14px_36px_rgba(47,109,246,0.34)] transition duration-300 hover:-translate-y-0.5 hover:bg-[#255fdd] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#8fb0ff] sm:w-auto"
                                >
                                    {HERO_SECONDARY_LABEL}
                                    <ArrowRight size={18} aria-hidden="true" />
                                </Link>
                                <a
                                    href={PARTNER_MAILTO}
                                    className="inline-flex min-h-11 items-center gap-2 border-b border-white/35 py-2 text-sm font-semibold text-white/88 no-underline transition hover:border-white hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#8fb0ff]"
                                >
                                    <Mail size={17} aria-hidden="true" />
                                    {HERO_PRIMARY_LABEL}
                                </a>
                            </motion.div>
                        </div>

                        <motion.aside
                            variants={fadeUp}
                            aria-label="Current reach"
                            className="hidden border-l border-white/20 pl-6 lg:block"
                        >
                            <span className="font-mono text-xs uppercase tracking-[0.16em] text-white/55">
                                Progress / 2030
                            </span>
                            <strong className="mt-3 block font-display text-4xl font-semibold tracking-[-0.04em]">
                                67k
                            </strong>
                            <span className="mt-1 block text-sm leading-6 text-white/62">
                                of one million young people reached
                            </span>
                        </motion.aside>
                    </motion.div>
                </section>

                {/* 02 — The access gap and goal */}
                <section
                    aria-labelledby="access-gap-title"
                    className={`${SECTION} overflow-hidden border-b border-subtle bg-[#f4f7ff] dark:bg-surface-elevated`}
                >
                    <Reveal className={`${SHELL} grid gap-14 lg:grid-cols-[0.76fr_1.24fr] lg:gap-20`}>
                        <div className="lg:sticky lg:top-28 lg:self-start">
                            <motion.p variants={fadeUp} className={EYEBROW}>
                                The access gap
                            </motion.p>
                            <motion.h2 id="access-gap-title" variants={fadeUp} className={`${TITLE} mt-4`}>
                                Talent is everywhere. Information is not.
                            </motion.h2>
                            <motion.p
                                variants={fadeUp}
                                className="mt-6 max-w-[40ch] text-pretty text-base leading-7 text-text-secondary sm:text-lg"
                            >
                                {GAP_THESIS}
                            </motion.p>
                            <motion.p variants={fadeUp} className="mt-7">
                                <Link
                                    to="/impact"
                                    className="inline-flex items-center gap-2 text-sm font-semibold text-brand no-underline underline-offset-4 hover:underline"
                                >
                                    Read the research
                                    <ArrowUpRight size={16} aria-hidden="true" />
                                </Link>
                            </motion.p>
                        </div>

                        <div>
                            <div className="grid border-y border-brand/15 sm:grid-cols-3">
                                {GAP_STATS.map((stat, index) => (
                                    <motion.article
                                        key={stat.label}
                                        variants={fadeUp}
                                        className={`py-6 sm:px-6 sm:py-8 ${
                                            index > 0 ? 'border-t border-brand/15 sm:border-l sm:border-t-0' : ''
                                        }`}
                                    >
                                        <strong className="block font-display text-[2.45rem] font-semibold leading-none tracking-[-0.045em] text-text-primary">
                                            {stat.value}
                                        </strong>
                                        <span className="mt-3 block max-w-[18ch] text-sm leading-6 text-text-secondary">
                                            {stat.label}
                                        </span>
                                        <span className="mt-4 block text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-text-muted">
                                            {stat.sourceHref ? (
                                                <a
                                                    href={stat.sourceHref}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="underline decoration-text-muted/40 underline-offset-2 hover:text-brand"
                                                >
                                                    {stat.source}
                                                </a>
                                            ) : (
                                                stat.source
                                            )}
                                        </span>
                                    </motion.article>
                                ))}
                            </div>

                            <motion.div variants={fadeUp} className="mt-12">
                                <div className="flex items-end justify-between gap-4">
                                    <div>
                                        <p className={EYEBROW}>One million / four waypoints</p>
                                        <h3 className="mt-3 font-display text-2xl font-semibold tracking-[-0.03em] text-text-primary">
                                            A goal you can audit as it grows.
                                        </h3>
                                    </div>
                                    <span className="hidden font-mono text-xs text-text-muted sm:block">
                                        67,000 → 1,000,000
                                    </span>
                                </div>
                                <ol className="mt-8 list-none border-l border-brand/25 p-0 sm:border-l-0 sm:border-t">
                                    {MILESTONES.map((milestone, index) => (
                                        <li
                                            key={milestone.phase}
                                            className="relative grid gap-2 border-b border-brand/15 py-5 pl-7 sm:grid-cols-[4rem_7rem_1fr] sm:items-baseline sm:gap-5 sm:pl-0"
                                        >
                                            <span
                                                aria-hidden="true"
                                                className={`absolute -left-[0.31rem] top-7 h-2.5 w-2.5 rounded-full border-2 border-[#f4f7ff] dark:border-surface-elevated ${
                                                    milestone.current ? 'bg-brand' : 'bg-brand/35'
                                                } sm:-top-[0.31rem] sm:left-0`}
                                            />
                                            <span className="font-mono text-xs text-text-muted">
                                                0{index + 1}
                                            </span>
                                            <strong className="font-display text-lg font-semibold text-text-primary">
                                                {milestone.reach}
                                            </strong>
                                            <span className="text-sm leading-6 text-text-secondary">
                                                {milestone.horizon} · {milestone.phase}
                                            </span>
                                        </li>
                                    ))}
                                </ol>
                            </motion.div>
                        </div>
                    </Reveal>
                </section>

                {/* 03 — The opportunity journey */}
                <section aria-labelledby="journey-title" className={`${SECTION} border-b border-subtle`}>
                    <Reveal className={SHELL}>
                        <div className="grid gap-6 lg:grid-cols-[1.04fr_0.96fr] lg:gap-8">
                            <motion.div
                                variants={fadeUp}
                                className="relative min-h-[30rem] overflow-hidden rounded-[2rem] bg-[#0a1b3f] text-white sm:min-h-[36rem]"
                            >
                                <ImageWithFallback
                                    src="/community/fellowships.jpg"
                                    alt="Young people planning their next opportunity together"
                                    className="absolute inset-0 h-full w-full object-cover"
                                />
                                <div
                                    aria-hidden="true"
                                    className="absolute inset-0 bg-gradient-to-t from-[#071228] via-[#071228]/66 to-[#071228]/5"
                                />
                                <div className="absolute inset-x-0 bottom-0 p-6 sm:p-10">
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a9c0ff]">
                                        {NARRATIVE_BEAT.label}
                                    </p>
                                    <h2
                                        id="journey-title"
                                        className="mt-4 max-w-[18ch] font-display text-[2rem] font-semibold leading-[1.02] tracking-[-0.04em] text-white sm:text-[3.15rem]"
                                    >
                                        From finding the door to submitting on time.
                                    </h2>
                                </div>
                            </motion.div>

                            <motion.div
                                variants={fadeUp}
                                role="region"
                                aria-roledescription="carousel"
                                aria-label="Scholarship journey"
                                className="flex min-h-[30rem] flex-col rounded-[2rem] bg-[#e5ecff] p-6 text-[#0c1a38] dark:bg-surface-elevated dark:text-text-primary sm:min-h-[36rem] sm:p-9"
                            >
                                <div className="flex items-center justify-between gap-4">
                                    <span className="max-w-[70%] text-xs font-semibold uppercase tracking-[0.13em] text-brand">
                                        {activeSlide.tag}
                                    </span>
                                    <span className="font-mono text-xs font-semibold text-text-muted">
                                        {String(scholarshipSlide + 1).padStart(2, '0')} /{' '}
                                        {String(slides.length).padStart(2, '0')}
                                    </span>
                                </div>
                                <div className="flex flex-1 items-center py-8" aria-live="polite">
                                    <AnimatePresence mode="wait" initial={false}>
                                        <motion.div
                                            key={activeSlide.title}
                                            initial={reduceMotion ? false : { opacity: 0, x: 18 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={reduceMotion ? undefined : { opacity: 0, x: -18 }}
                                            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                                        >
                                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">
                                                {activeSlide.eyebrow}
                                            </p>
                                            <h3 className="mt-4 max-w-[24ch] font-display text-[1.65rem] font-semibold leading-[1.08] tracking-[-0.035em] sm:text-[2.3rem]">
                                                {activeSlide.title}
                                            </h3>
                                            <p className="mt-5 max-w-[50ch] text-[0.95rem] leading-7 text-text-secondary sm:text-base">
                                                {activeSlide.body}
                                            </p>
                                        </motion.div>
                                    </AnimatePresence>
                                </div>
                                <div className="flex items-center justify-between gap-4 border-t border-brand/15 pt-5">
                                    <div className="flex items-center gap-2" role="tablist" aria-label="Choose story slide">
                                        {slides.map((slide, index) => (
                                            <button
                                                key={slide.eyebrow}
                                                type="button"
                                                role="tab"
                                                aria-selected={index === scholarshipSlide}
                                                aria-label={`Show slide ${index + 1}: ${slide.eyebrow}`}
                                                onClick={() => setScholarshipSlide(index)}
                                                className={`h-2.5 w-2.5 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                                                    index === scholarshipSlide
                                                        ? 'bg-brand'
                                                        : 'bg-text-muted/40 hover:bg-text-muted'
                                                }`}
                                            />
                                        ))}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            aria-label="Previous scholarship slide"
                                            onClick={() => setScholarshipSlide((current) => (current - 1 + slides.length) % slides.length)}
                                            className="flex h-11 w-11 items-center justify-center rounded-full border border-brand/20 text-text-primary transition hover:border-brand hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                                        >
                                            <ChevronLeft size={18} aria-hidden="true" />
                                        </button>
                                        <button
                                            type="button"
                                            aria-label="Next scholarship slide"
                                            onClick={() => setScholarshipSlide((current) => (current + 1) % slides.length)}
                                            className="flex h-11 w-11 items-center justify-center rounded-full border border-brand/20 text-text-primary transition hover:border-brand hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                                        >
                                            <ChevronRight size={18} aria-hidden="true" />
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        </div>

                        <div className="mt-16 grid gap-x-10 gap-y-4 md:grid-cols-2">
                            {PILLARS.map((pillar, index) => {
                                const Icon = pillar.icon;
                                return (
                                    <motion.article
                                        key={pillar.title}
                                        variants={fadeUp}
                                        className="group grid grid-cols-[5.25rem_1fr] gap-5 border-t border-subtle py-6 sm:grid-cols-[7rem_1fr]"
                                    >
                                        <div className="relative aspect-square overflow-hidden rounded-2xl bg-[#e5ecff]">
                                            <ImageWithFallback
                                                src={PILLAR_IMAGES[index]}
                                                alt={pillar.imageAlt}
                                                className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
                                            />
                                        </div>
                                        <div className="flex min-w-0 flex-col items-start">
                                            <Icon size={19} className="text-brand" aria-hidden="true" />
                                            <h3 className="mt-3 font-display text-lg font-semibold tracking-[-0.02em] text-text-primary sm:text-xl">
                                                {pillar.title}
                                            </h3>
                                            <p className="mt-2 text-sm leading-6 text-text-secondary">{pillar.body}</p>
                                            <Link
                                                to={pillar.ctaPath}
                                                className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand no-underline underline-offset-4 hover:underline"
                                            >
                                                {pillar.ctaLabel}
                                                <ArrowUpRight size={15} aria-hidden="true" />
                                            </Link>
                                        </div>
                                    </motion.article>
                                );
                            })}
                        </div>

                        <motion.div variants={fadeUp} className="mt-16 border-t border-subtle pt-10">
                            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                                <div>
                                    <h3 className={EYEBROW}>A year in the program</h3>
                                    <p className="mt-3 font-display text-2xl font-semibold tracking-[-0.03em] text-text-primary sm:text-3xl">
                                        Five useful moments. No extra ceremony.
                                    </p>
                                </div>
                                <Link
                                    to="/signup"
                                    className="inline-flex items-center gap-2 text-sm font-semibold text-brand no-underline underline-offset-4 hover:underline"
                                >
                                    Start with a profile
                                    <ArrowRight size={16} aria-hidden="true" />
                                </Link>
                            </div>
                            <ol className="mt-8 grid list-none gap-0 overflow-hidden rounded-2xl border border-subtle p-0 sm:grid-cols-5">
                                {PROGRAM_TIMELINE.map((stage, index) => (
                                    <li
                                        key={stage.period}
                                        className={`p-5 ${
                                            index > 0 ? 'border-t border-subtle sm:border-l sm:border-t-0' : ''
                                        }`}
                                    >
                                        <span className="font-mono text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-brand">
                                            {stage.period}
                                        </span>
                                        <strong className="mt-3 block font-display text-base font-semibold leading-5 text-text-primary">
                                            {stage.title}
                                        </strong>
                                    </li>
                                ))}
                            </ol>
                        </motion.div>
                    </Reveal>
                </section>

                {/* 04 — Stories */}
                <section
                    aria-labelledby="stories-title"
                    className={`${SECTION} overflow-hidden bg-[#0a1734] text-white`}
                >
                    <Reveal className={SHELL}>
                        <div className="grid gap-7 sm:grid-cols-[1fr_auto] sm:items-end">
                            <div>
                                <motion.p variants={fadeUp} className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9bb7ff]">
                                    The people we design for
                                </motion.p>
                                <motion.h2
                                    id="stories-title"
                                    variants={fadeUp}
                                    className="mt-4 max-w-[14ch] font-display text-[2.1rem] font-semibold leading-[1.02] tracking-[-0.04em] text-white sm:text-[3.4rem]"
                                >
                                    Different lives. The same missing information.
                                </motion.h2>
                            </div>
                            <motion.p variants={fadeUp} className="max-w-[34ch] text-sm leading-6 text-white/62 sm:text-right">
                                Composite situations from user research, shown honestly until verified alumni stories can replace them.
                            </motion.p>
                        </div>

                        <div className="mt-10 grid gap-5 md:grid-cols-3">
                            <AnimatePresence initial={false}>
                                {visibleStories.map((story) => (
                                    <StoryCard key={story.slug} story={story} />
                                ))}
                            </AnimatePresence>
                        </div>

                        <div className="mt-8 flex flex-col items-start justify-between gap-5 border-t border-white/12 pt-6 sm:flex-row sm:items-center">
                            {hasComposites && (
                                <motion.p variants={fadeUp} className="max-w-[70ch] text-xs leading-5 text-white/55">
                                    {STORY_ATTRIBUTION}
                                </motion.p>
                            )}
                            {stories.length > 3 && (
                                <button
                                    type="button"
                                    onClick={() => setShowAllStories((current) => !current)}
                                    className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-white/20 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/45 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9bb7ff]"
                                >
                                    {showAllStories ? 'Show fewer stories' : 'See more situations we design for'}
                                    <ArrowRight
                                        size={16}
                                        aria-hidden="true"
                                        className={`transition ${showAllStories ? '-rotate-90' : ''}`}
                                    />
                                </button>
                            )}
                        </div>
                    </Reveal>
                </section>

                {/* 05 — Learner and partner paths */}
                <section
                    aria-labelledby="choose-path-title"
                    className={`${SECTION} border-b border-subtle bg-[#edf2ff] dark:bg-surface-elevated`}
                >
                    <Reveal className={SHELL}>
                        <motion.p variants={fadeUp} className={EYEBROW}>Your next move</motion.p>
                        <motion.h2 id="choose-path-title" variants={fadeUp} className={`${TITLE} mt-4 max-w-[17ch]`}>
                            Choose the side of the door you are on.
                        </motion.h2>

                        <div className="mt-10 grid overflow-hidden rounded-[2rem] bg-white shadow-[0_24px_80px_rgba(24,57,130,0.13)] dark:bg-surface lg:grid-cols-[1.12fr_0.88fr]">
                            <motion.article variants={fadeUp} className="p-6 sm:p-10 lg:p-12">
                                <span className="font-mono text-xs font-semibold uppercase tracking-[0.13em] text-brand">
                                    I am looking for an opportunity
                                </span>
                                <h3 className="mt-4 max-w-[16ch] font-display text-[2rem] font-semibold leading-[1.04] tracking-[-0.04em] text-text-primary sm:text-[2.8rem]">
                                    Start with one real match.
                                </h3>
                                <p className="mt-5 max-w-[48ch] text-base leading-7 text-text-secondary">
                                    {JOIN_ELIGIBILITY}
                                </p>
                                <ol className="mt-8 list-none border-y border-subtle p-0">
                                    {JOIN_STEPS.map((step) => (
                                        <li key={step.step} className="grid grid-cols-[2.2rem_1fr] gap-3 border-b border-subtle py-4 last:border-b-0">
                                            <span className="font-mono text-xs font-semibold text-brand">{step.step}</span>
                                            <span className="font-display text-sm font-semibold text-text-primary sm:text-base">
                                                {step.title}
                                            </span>
                                        </li>
                                    ))}
                                </ol>
                                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                                    <a
                                        href={WHATSAPP_JOIN_URL}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3.5 text-sm font-semibold text-white no-underline transition hover:-translate-y-0.5 hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                                    >
                                        <MessageCircle size={18} aria-hidden="true" />
                                        {JOIN_CTA_LABEL}
                                    </a>
                                    <Link
                                        to="/opportunities"
                                        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-strong px-6 py-3.5 text-sm font-semibold text-text-primary no-underline transition hover:bg-surface-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                                    >
                                        Browse opportunities
                                        <ArrowRight size={17} aria-hidden="true" />
                                    </Link>
                                </div>
                            </motion.article>

                            <motion.article
                                variants={fadeUp}
                                className="relative isolate overflow-hidden bg-[#2367ed] p-6 text-white sm:p-10 lg:p-12"
                            >
                                <div aria-hidden="true" className="absolute -right-20 -top-20 -z-10 h-72 w-72 rounded-full bg-[#8cdcf0]/28 blur-3xl" />
                                <div className="relative z-10 max-w-[28rem]">
                                    <span className="font-mono text-xs font-semibold uppercase tracking-[0.13em] text-white/68">
                                        I can help open opportunities
                                    </span>
                                    <h3 className="mt-4 max-w-[13ch] font-display text-[2rem] font-semibold leading-[1.04] tracking-[-0.04em] text-white sm:text-[2.8rem]">
                                        Bring reach, funding, or experience.
                                    </h3>
                                    <p className="mt-5 max-w-[36ch] text-base leading-7 text-white/78">{PARTNER_PITCH}</p>
                                    <ul className="mt-7 grid list-none grid-cols-2 gap-x-4 gap-y-3 p-0">
                                        {PARTNER_LANES.map((lane) => {
                                            const Icon = lane.icon;
                                            return (
                                                <li key={lane.title} className="flex items-center gap-2 text-sm font-medium text-white/82">
                                                    <Icon size={16} aria-hidden="true" />
                                                    {lane.title}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                    <div className="mt-8 flex flex-col items-start gap-4">
                                        <a
                                            href={PARTNER_MAILTO}
                                            className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-semibold text-[#174aab] no-underline shadow-[0_14px_34px_rgba(5,26,75,0.22)] transition hover:-translate-y-0.5 hover:bg-[#f4f7ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                                        >
                                            <Mail size={18} aria-hidden="true" />
                                            Partner with us
                                        </a>
                                        <a
                                            href={PARTNER_MAILTO}
                                            className="text-sm font-semibold text-white/82 underline decoration-white/35 underline-offset-4 transition hover:text-white"
                                        >
                                            Start a partnership conversation
                                        </a>
                                    </div>
                                </div>
                                <ImageWithFallback
                                    src={MASCOT_IMAGE}
                                    alt="Edutu guide mascot pointing toward the next step"
                                    className="pointer-events-none mx-auto mt-10 w-[min(15rem,78%)] drop-shadow-[0_24px_28px_rgba(4,28,81,0.28)] sm:absolute sm:-bottom-8 sm:-right-10 sm:mt-0 sm:w-52 lg:w-60"
                                />
                            </motion.article>
                        </div>

                        <motion.p variants={fadeUp} className="mt-6 text-sm text-text-muted">
                            Prefer email?{' '}
                            <a href={PARTNER_MAILTO} className="font-semibold text-brand no-underline hover:underline">
                                {PARTNER_EMAIL}
                            </a>
                        </motion.p>
                    </Reveal>
                </section>

                {/* 06 — FAQ */}
                <section aria-labelledby="faq-title" className={SECTION}>
                    <Reveal className={`${SHELL} grid gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20`}>
                        <div>
                            <motion.p variants={fadeUp} className={EYEBROW}>Clear answers</motion.p>
                            <motion.h2 id="faq-title" variants={fadeUp} className={`${TITLE} mt-4`}>
                                Before you take the next step.
                            </motion.h2>
                            <motion.p variants={fadeUp} className="mt-6 max-w-[34ch] text-base leading-7 text-text-secondary">
                                The short version: joining is free, listings are checked, and partnership starts with a direct conversation.
                            </motion.p>
                            <motion.p variants={fadeUp} className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                                <Link to="/about" className="font-semibold text-brand no-underline hover:underline">About us</Link>
                                <Link to="/impact" className="font-semibold text-brand no-underline hover:underline">Our impact</Link>
                            </motion.p>
                        </div>
                        <motion.div variants={fadeUp}>
                            <FaqAccordion items={PROGRAM_FAQ} />
                        </motion.div>
                    </Reveal>
                </section>
            </main>

            <SiteFooter />
        </div>
    );
};

export default EdutuForYouPage;
