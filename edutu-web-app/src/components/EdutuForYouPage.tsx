import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, type Variants } from 'framer-motion';
import { ArrowRight, ArrowUpRight, Mail, MessageCircle } from 'lucide-react';
import PageSeo from './PageSeo';
import PublicHeader from './PublicHeader';
import SiteFooter from './SiteFooter';
import ImageWithFallback from './ImageWithFallback';
import StoryCard from './edutu-for-you/StoryCard';
import FaqAccordion from './edutu-for-you/FaqAccordion';
import {
    GAP_STATS,
    GAP_THESIS,
    HERO_IMAGE,
    HERO_IMAGE_ALT,
    HERO_PRIMARY_LABEL,
    HERO_SECONDARY_LABEL,
    JOIN_CTA_LABEL,
    JOIN_ELIGIBILITY,
    JOIN_STEPS,
    MILESTONES,
    MOSAIC,
    NARRATIVE_BEAT,
    PARTNER_EMAIL,
    PARTNER_LANES,
    PARTNER_MAILTO,
    PARTNER_PITCH,
    PILLARS,
    PROGRAM_FAQ,
    PROGRAM_HEADLINE,
    PROGRAM_KICKER,
    PROGRAM_NAME,
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

/**
 * /edutuforyou — the impact program page.
 *
 * Two lanes, split at the Stories section: above it the page argues why the
 * program should exist (partners and funders), below it it speaks to the
 * person it exists for (beneficiaries).
 *
 * Stories are admin-managed and fetched from the backend; the bundled seeds
 * render first so the section is never empty on a cold or failed load. The
 * research and methodology live on /impact, which this page cross-links.
 */

const fadeUp: Variants = {
    hidden: { opacity: 0, y: 28 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] },
    },
};

const stagger: Variants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.07, delayChildren: 0.04 },
    },
};

const SECTION = 'px-4 py-16 sm:px-6 sm:py-28';
const SHELL = 'mx-auto max-w-[1200px]';
const TITLE =
    'font-display text-[1.625rem] font-bold leading-[1.15] tracking-[-0.02em] text-text-primary sm:text-[2.25rem]';
const LEDE =
    'mt-3 max-w-[58ch] text-[0.9375rem] leading-[1.65] text-text-secondary sm:mt-4 sm:text-lg sm:leading-[1.7]';

const Reveal: React.FC<{ children: React.ReactNode; className?: string }> = ({
    children,
    className,
}) => (
    <motion.div
        variants={stagger}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.15 }}
        className={className}
    >
        {children}
    </motion.div>
);

const EdutuForYouPage: React.FC = () => {
    const [stories, setStories] = useState<Story[]>(SEED_STORIES);
    const [showAllStories, setShowAllStories] = useState(false);

    useEffect(() => {
        const controller = new AbortController();
        // fetchImpactStories never rejects — it resolves to the seeds on failure.
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
                {/* ─── Hero ─────────────────────────────────────────────── */}
                <section className="relative isolate overflow-hidden bg-[#0B0F19] px-4 pb-16 pt-20 text-[#F8FAFC] sm:px-6 sm:pb-28 sm:pt-28">
                    <div className="absolute inset-0 z-0">
                        <ImageWithFallback
                            src={HERO_IMAGE}
                            alt={HERO_IMAGE_ALT}
                            className="h-full w-full object-cover object-center"
                        />
                        <div
                            aria-hidden="true"
                            className="absolute inset-0 bg-gradient-to-r from-[#0B0F19]/95 via-[#0B0F19]/75 to-[#0B0F19]/25"
                        />
                    </div>

                    <div className={`${SHELL} relative z-20`}>
                        <motion.div
                            variants={stagger}
                            initial="hidden"
                            animate="visible"
                            className="max-w-[46rem]"
                        >
                            <motion.span
                                variants={fadeUp}
                                className="inline-flex items-center gap-2 rounded-pill border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#C7D2FE]"
                            >
                                {PROGRAM_KICKER}
                            </motion.span>

                            <motion.h1
                                variants={fadeUp}
                                className="mt-5 font-display text-[2rem] font-bold leading-[1.05] tracking-[-0.025em] text-[#F8FAFC] sm:mt-6 sm:text-[3.5rem]"
                            >
                                {PROGRAM_HEADLINE}
                            </motion.h1>

                            <motion.p
                                variants={fadeUp}
                                className="mt-5 max-w-[52ch] text-base leading-[1.65] text-[#CBD5E1] sm:mt-6 sm:text-lg sm:leading-[1.6]"
                            >
                                {PROGRAM_SUBHEAD}
                            </motion.p>

                            <motion.div
                                variants={fadeUp}
                                className="mt-8 flex flex-col gap-3 sm:mt-9 sm:flex-row sm:flex-wrap"
                            >
                                <a
                                    href={PARTNER_MAILTO}
                                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-pill bg-brand-700 px-6 py-3.5 text-base font-semibold text-white no-underline transition hover:bg-brand-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300 sm:w-auto dark:bg-brand-800 dark:hover:bg-brand-900"
                                >
                                    <Mail size={18} aria-hidden="true" />
                                    {HERO_PRIMARY_LABEL}
                                </a>
                                <Link
                                    to="/signup"
                                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-pill border border-white/20 px-6 py-3.5 text-base font-semibold text-[#F8FAFC] no-underline transition hover:border-white/40 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300 sm:w-auto"
                                >
                                    <ArrowRight size={18} aria-hidden="true" />
                                    {HERO_SECONDARY_LABEL}
                                </Link>
                            </motion.div>

                        </motion.div>
                    </div>
                </section>

                {/* ─── The human moment ────────────────────────────────── */}
                <section className="border-b border-subtle bg-surface-elevated px-4 py-14 sm:px-6 sm:py-20">
                    <Reveal className="mx-auto max-w-[900px]">
                        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">
                            {NARRATIVE_BEAT.label}
                        </span>
                        <motion.blockquote
                            variants={fadeUp}
                            className="mt-5 max-w-[780px] font-display text-[1.75rem] font-semibold leading-[1.2] tracking-[-0.02em] text-text-primary sm:text-[2.75rem]"
                        >
                            “{NARRATIVE_BEAT.quote}”
                        </motion.blockquote>
                        <motion.p
                            variants={fadeUp}
                            className="mt-5 max-w-[54ch] text-base leading-[1.7] text-text-secondary sm:text-lg"
                        >
                            {NARRATIVE_BEAT.body}
                        </motion.p>
                    </Reveal>
                </section>

                {/* ─── The gap ──────────────────────────────────────────── */}
                <section className={`${SECTION} border-b border-subtle`}>
                    <Reveal className={SHELL}>
                        <motion.h2 variants={fadeUp} className={TITLE}>
                            The gap is <span className="text-brand">information</span>, not ability
                        </motion.h2>
                        <motion.p variants={fadeUp} className={LEDE}>
                            {GAP_THESIS}
                        </motion.p>

                        <div className="mt-9 grid grid-cols-1 gap-x-6 gap-y-8 min-[420px]:grid-cols-2 sm:mt-10 lg:grid-cols-4">
                            {GAP_STATS.map((stat) => (
                                <motion.div
                                    key={stat.label}
                                    variants={fadeUp}
                                    className="border-t-2 border-brand/35 pt-4 sm:pt-5"
                                >
                                    <span className="font-display text-[2rem] font-bold leading-none tracking-[-0.03em] text-text-primary sm:text-[2.25rem]">
                                        {stat.value}
                                    </span>
                                    <span className="mt-3 block max-w-[18ch] text-[0.9375rem] leading-[1.45] text-text-secondary">
                                        {stat.label}
                                    </span>
                                    <span className="mt-4 block text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-text-muted">
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
                                </motion.div>
                            ))}
                        </div>

                        {/* Image strip — carries the section's weight now that the
                            prose is cut back to two sentences. */}
                        <motion.div
                            variants={fadeUp}
                            className="mt-8 grid grid-cols-2 gap-3 min-[420px]:grid-cols-3 sm:mt-10 sm:grid-cols-5 sm:gap-4"
                        >
                            {MOSAIC.map((image, index) => (
                                <div
                                    key={image.src}
                                    className={`h-24 overflow-hidden rounded-2xl min-[420px]:h-28 sm:h-36 ${
                                        index >= 3 ? 'hidden sm:block' : ''
                                    }`}
                                >
                                    <ImageWithFallback
                                        src={image.src}
                                        alt={image.alt}
                                        className="h-full w-full object-cover"
                                    />
                                </div>
                            ))}
                        </motion.div>

                        <motion.p variants={fadeUp} className="mt-7">
                            <Link
                                to="/impact"
                                className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand no-underline hover:underline"
                            >
                                Read the research behind this
                                <ArrowUpRight size={16} aria-hidden="true" />
                            </Link>
                        </motion.p>
                    </Reveal>
                </section>

                {/* ─── The aim ──────────────────────────────────────────── */}
                <section className={`${SECTION} border-b border-subtle bg-surface-elevated`}>
                    <Reveal className={SHELL}>
                        <motion.h2 variants={fadeUp} className={TITLE}>
                            One million, in <span className="text-brand">four steps</span>
                        </motion.h2>

                        <ol className="mt-8 grid list-none gap-4 p-0 min-[520px]:grid-cols-2 sm:mt-10 sm:gap-5 lg:grid-cols-4">
                            {MILESTONES.map((milestone) => (
                                <motion.li
                                    key={milestone.phase}
                                    variants={fadeUp}
                                    className={`flex flex-col rounded-2xl border p-5 sm:p-6 ${
                                        milestone.current
                                            ? 'border-brand bg-brand/[0.06]'
                                            : 'border-subtle bg-surface'
                                    }`}
                                >
                                    <span className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
                                        {milestone.horizon}
                                    </span>
                                    <span className="mt-3 font-display text-2xl font-bold text-text-primary">
                                        {milestone.reach}
                                    </span>
                                    <span className="mt-1 text-sm font-semibold text-brand">
                                        {milestone.phase}
                                    </span>
                                    <p className="mt-3 text-[0.9375rem] leading-[1.6] text-text-secondary">
                                        {milestone.body}
                                    </p>
                                </motion.li>
                            ))}
                        </ol>
                    </Reveal>
                </section>

                {/* ─── Pillars ──────────────────────────────────────────── */}
                <section className={`${SECTION} border-b border-subtle`}>
                    <Reveal className={SHELL}>
                        <motion.h2 variants={fadeUp} className={TITLE}>
                            What the program actually <span className="text-brand">does</span>
                        </motion.h2>

                        <div className="mt-8 grid gap-4 sm:mt-10 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4">
                            {PILLARS.map((pillar) => {
                                const Icon = pillar.icon;
                                return (
                                    <motion.article
                                        key={pillar.title}
                                        variants={fadeUp}
                                        className="flex flex-col overflow-hidden rounded-3xl border border-subtle bg-surface-elevated"
                                    >
                                        <div className="h-32 w-full overflow-hidden sm:h-36">
                                            <ImageWithFallback
                                                src={pillar.image}
                                                alt={pillar.imageAlt}
                                                className="h-full w-full object-cover"
                                            />
                                        </div>
                                        <div className="flex flex-1 flex-col p-5 sm:p-5">
                                            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/[0.12] text-brand">
                                                <Icon size={18} aria-hidden="true" />
                                            </span>
                                            <h3 className="mt-3 font-display text-lg font-semibold leading-tight text-text-primary">
                                                {pillar.title}
                                            </h3>
                                            <p className="mt-3 text-[0.9375rem] leading-[1.5] text-text-secondary">
                                                {pillar.body}
                                            </p>
                                            <Link
                                                to={pillar.ctaPath}
                                                className="mt-6 inline-flex min-h-10 items-center justify-between gap-3 rounded-pill border border-brand/30 px-4 py-2 text-sm font-semibold text-brand no-underline transition hover:border-brand hover:bg-brand/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                                            >
                                                {pillar.ctaLabel}
                                                <ArrowRight size={16} aria-hidden="true" />
                                            </Link>
                                        </div>
                                    </motion.article>
                                );
                            })}
                        </div>
                    </Reveal>
                </section>

                {/* ─── A year in the program ────────────────────────────── */}
                <section className={`${SECTION} border-b border-subtle bg-surface-elevated`}>
                    <Reveal className={SHELL}>
                        <motion.h2 variants={fadeUp} className={TITLE}>
                            A year in the program, turning access into <span className="text-brand">momentum</span>
                        </motion.h2>
                        <motion.p variants={fadeUp} className={LEDE}>
                            The program is not a single download or a single match. It is a year of small, supported steps toward a real application outcome.
                        </motion.p>

                        <ol className="mt-9 grid list-none gap-4 p-0 sm:mt-12 md:grid-cols-5 md:gap-0">
                            {PROGRAM_TIMELINE.map((stage, index) => (
                                <motion.li
                                    key={stage.period}
                                    variants={fadeUp}
                                    className="relative border-l-2 border-brand/25 pl-5 md:border-l-0 md:border-t-2 md:pl-0 md:pt-6 md:pr-5"
                                >
                                    <span className="text-xs font-semibold uppercase tracking-[0.12em] text-brand">
                                        {stage.period}
                                    </span>
                                    <span className="mt-3 block font-display text-lg font-semibold leading-tight text-text-primary">
                                        {stage.title}
                                    </span>
                                    <p className="mt-2 text-[0.9375rem] leading-[1.6] text-text-secondary">
                                        {stage.body}
                                    </p>
                                    <span
                                        aria-hidden="true"
                                        className="absolute -left-[7px] top-4 h-3 w-3 rounded-full bg-brand ring-4 ring-surface-elevated md:left-0 md:top-[-7px]"
                                    />
                                    {index < PROGRAM_TIMELINE.length - 1 ? (
                                        <ArrowRight
                                            aria-hidden="true"
                                            size={16}
                                            className="absolute -bottom-7 left-[-8px] rotate-90 text-brand/50 md:bottom-auto md:left-auto md:right-1 md:top-[-9px] md:rotate-0"
                                        />
                                    ) : null}
                                </motion.li>
                            ))}
                        </ol>

                        <motion.div variants={fadeUp} className="mt-9">
                            <Link
                                to="/signup"
                                className="inline-flex min-h-11 items-center gap-2 rounded-pill bg-brand-700 px-6 py-3.5 text-base font-semibold text-white no-underline transition hover:bg-brand-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:w-auto dark:bg-brand-800 dark:hover:bg-brand-900"
                            >
                                Start with a profile
                                <ArrowRight size={18} aria-hidden="true" />
                            </Link>
                        </motion.div>
                    </Reveal>
                </section>

                {/* ─── Stories — the pivot to the beneficiary lane ───────── */}
                <section
                    id="stories"
                    className={`${SECTION} border-b border-subtle bg-surface-elevated`}
                >
                    <Reveal className={SHELL}>
                        <motion.h2 variants={fadeUp} className={TITLE}>
                            Who this is <span className="text-brand">for</span>
                        </motion.h2>
                        <motion.p variants={fadeUp} className={LEDE}>
                            Three situations, three different doors, and the same underlying problem: the opportunity is real, but access is uneven.
                        </motion.p>

                        <div className="mt-8 grid gap-4 sm:mt-10 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
                            {visibleStories.map((story) => (
                                <motion.div key={story.slug} variants={fadeUp}>
                                    <StoryCard story={story} />
                                </motion.div>
                            ))}
                        </div>

                        {stories.length > 3 ? (
                            <motion.div variants={fadeUp} className="mt-8">
                                <button
                                    type="button"
                                    onClick={() => setShowAllStories((current) => !current)}
                                    className="inline-flex min-h-11 items-center gap-2 rounded-pill border border-strong px-5 py-3 text-sm font-semibold text-text-primary transition hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                                >
                                    {showAllStories
                                        ? "Show fewer situations"
                                        : "See more situations we design for"}
                                    <ArrowRight
                                        size={16}
                                        aria-hidden="true"
                                        className={showAllStories ? "rotate-180" : ""}
                                    />
                                </button>
                            </motion.div>
                        ) : null}

                        {/* Rendered only while at least one story is still a
                            composite — an admin swapping all nine for real,
                            consented stories retires this line automatically. */}
                        {hasComposites ? (
                            <motion.p
                                variants={fadeUp}
                                className="mt-8 max-w-[70ch] text-sm leading-[1.6] text-text-muted"
                            >
                                {STORY_ATTRIBUTION}
                            </motion.p>
                        ) : null}
                    </Reveal>
                </section>

                {/* ─── Join ─────────────────────────────────────────────── */}
                <section className={`${SECTION} border-b border-subtle`}>
                    <Reveal className={SHELL}>
                        <motion.h2 variants={fadeUp} className={TITLE}>
                            How to <span className="text-brand">join</span>
                        </motion.h2>
                        <motion.p variants={fadeUp} className={LEDE}>
                            {JOIN_ELIGIBILITY}
                        </motion.p>

                        <div className="mt-8 grid gap-4 sm:mt-10 md:grid-cols-3 md:gap-5">
                            {JOIN_STEPS.map((step) => (
                                <motion.div
                                    key={step.step}
                                    variants={fadeUp}
                                    className="rounded-2xl border border-subtle bg-surface-elevated p-5 sm:p-6"
                                >
                                    <span className="font-mono text-sm font-semibold text-brand">
                                        {step.step}
                                    </span>
                                    <h3 className="mt-3 font-display text-lg font-semibold text-text-primary">
                                        {step.title}
                                    </h3>
                                    <p className="mt-2 text-[0.9375rem] leading-[1.6] text-text-secondary">
                                        {step.body}
                                    </p>
                                </motion.div>
                            ))}
                        </div>

                        <motion.div
                            variants={fadeUp}
                            className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap"
                        >
                            <a
                                href={WHATSAPP_JOIN_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-pill bg-brand-700 px-6 py-3.5 text-base font-semibold text-white no-underline transition hover:bg-brand-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:w-auto dark:bg-brand-800 dark:hover:bg-brand-900"
                            >
                                <MessageCircle size={18} aria-hidden="true" />
                                {JOIN_CTA_LABEL}
                            </a>
                            <Link
                                to="/opportunities"
                                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-pill border border-strong px-6 py-3.5 text-base font-semibold text-text-primary no-underline transition hover:bg-surface-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:w-auto"
                            >
                                Browse opportunities
                                <ArrowRight size={18} aria-hidden="true" />
                            </Link>
                        </motion.div>
                    </Reveal>
                </section>

                {/* ─── Partner ──────────────────────────────────────────── */}
                <section className={`${SECTION} border-b border-subtle bg-surface-elevated`} id="partner">
                    <Reveal className={SHELL}>
                        <motion.h2 variants={fadeUp} className={TITLE}>
                            Partner with <span className="text-brand">{PROGRAM_NAME}</span>
                        </motion.h2>
                        <motion.p variants={fadeUp} className={LEDE}>
                            {PARTNER_PITCH}
                        </motion.p>

                        <div className="mt-8 grid gap-4 sm:mt-10 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4">
                            {PARTNER_LANES.map((lane) => {
                                const Icon = lane.icon;
                                return (
                                    <motion.div
                                        key={lane.title}
                                        variants={fadeUp}
                                        className="rounded-2xl border border-subtle bg-surface p-5 sm:p-6"
                                    >
                                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/[0.12] text-brand">
                                            <Icon size={18} aria-hidden="true" />
                                        </span>
                                        <h3 className="mt-4 font-display text-lg font-semibold leading-tight text-text-primary">
                                            {lane.title}
                                        </h3>
                                        <p className="mt-2 text-[0.9375rem] leading-[1.6] text-text-secondary">
                                            {lane.body}
                                        </p>
                                    </motion.div>
                                );
                            })}
                        </div>

                        <motion.div variants={fadeUp} className="mt-8">
                            <a
                                href={PARTNER_MAILTO}
                                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-pill bg-brand-700 px-6 py-3.5 text-base font-semibold text-white no-underline transition hover:bg-brand-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:w-auto dark:bg-brand-800 dark:hover:bg-brand-900"
                            >
                                <Mail size={18} aria-hidden="true" />
                                Partner with us
                            </a>
                            <p className="mt-3 text-sm text-text-muted">
                                Or email{' '}
                                <a
                                    href={PARTNER_MAILTO}
                                    className="font-medium text-brand no-underline hover:underline"
                                >
                                    {PARTNER_EMAIL}
                                </a>{' '}
                                directly.
                            </p>
                        </motion.div>
                    </Reveal>
                </section>

                {/* ─── FAQ ──────────────────────────────────────────────── */}
                <section className={SECTION}>
                    <Reveal className="mx-auto max-w-[800px]">
                        <motion.h2 variants={fadeUp} className={`${TITLE} text-center`}>
                            Questions, <span className="text-brand">answered</span>
                        </motion.h2>

                        <motion.div variants={fadeUp} className="mt-8 sm:mt-10">
                            <FaqAccordion items={PROGRAM_FAQ} />
                        </motion.div>

                        <motion.p
                            variants={fadeUp}
                            className="mt-10 text-center text-sm text-text-muted"
                        >
                            {PROGRAM_NAME} is run by Edutu.{' '}
                            <Link
                                to="/about"
                                className="font-medium text-brand no-underline hover:underline"
                            >
                                About us
                            </Link>{' '}
                            ·{' '}
                            <Link
                                to="/impact"
                                className="font-medium text-brand no-underline hover:underline"
                            >
                                Our impact
                            </Link>
                        </motion.p>
                    </Reveal>
                </section>
            </main>

            <SiteFooter />
        </div>
    );
};

export default EdutuForYouPage;
