import React from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import {
    ArrowRight,
    ArrowUpRight,
    Check,
    Info,
    Mail,
    MessageCircle,
} from 'lucide-react';
import PageSeo from './PageSeo';
import PublicHeader from './PublicHeader';
import SiteFooter from './SiteFooter';
import ImageWithFallback from './ImageWithFallback';
import StoryCard from './edutu-for-you/StoryCard';
import {
    COMPOSITE_DISCLOSURE,
    GAP_STATS,
    GAP_THESIS,
    HERO_IMAGE,
    HERO_IMAGE_ALT,
    JOIN_CTA_LABEL,
    JOIN_ELIGIBILITY,
    JOIN_STEPS,
    MILESTONES,
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
    REACH_GOAL,
    REACH_TODAY,
    STORIES,
    TIMELINE,
    WHATSAPP_JOIN_URL,
} from '../lib/edutuForYou';

/**
 * /edutuforyou — the impact program page.
 *
 * Two lanes, split at the Stories section: everything above argues why the
 * program should exist (written for partners and funders), everything below
 * speaks to the person it exists for (written for beneficiaries).
 *
 * The research and methodology live on /impact; this page cross-links there
 * rather than restating the numbers a second time.
 */

/* ────────────────────────────────────────────────────────────────────────────
 * Motion — mirrors the house style used across the marketing pages.
 * ──────────────────────────────────────────────────────────────────────────*/
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

const SECTION = 'px-4 py-20 sm:px-6 sm:py-28';
const SHELL = 'mx-auto max-w-[1200px]';
const TITLE =
    'font-display text-[1.75rem] font-bold leading-[1.15] tracking-[-0.02em] text-text-primary sm:text-[2.25rem]';
const LEDE =
    'mt-4 max-w-[62ch] text-base leading-[1.7] text-text-secondary sm:text-lg';

const PROGRESS_PERCENT = Math.round((REACH_TODAY / REACH_GOAL) * 100);

/** Shared reveal wrapper so every section animates identically. */
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
    const reduceMotion = useReducedMotion();

    return (
        <div className="min-h-screen bg-surface-body">
            <PageSeo path="/edutuforyou" />
            <PublicHeader />

            <main>
                {/* ─── Hero ─────────────────────────────────────────────── */}
                <section className="relative isolate overflow-hidden bg-[#0B0F19] px-4 pb-20 pt-24 text-[#F8FAFC] sm:px-6 sm:pb-28 sm:pt-32">
                    <div className="absolute inset-0 -z-10">
                        <ImageWithFallback
                            src={HERO_IMAGE}
                            alt={HERO_IMAGE_ALT}
                            className="h-full w-full object-cover"
                        />
                        {/* Scrim: the headline has to stay legible over any crop. */}
                        <div
                            aria-hidden="true"
                            className="absolute inset-0 bg-gradient-to-r from-[#0B0F19]/95 via-[#0B0F19]/80 to-[#0B0F19]/35"
                        />
                    </div>

                    <div className={SHELL}>
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
                                className="mt-6 font-display text-[2.25rem] font-bold leading-[1.05] tracking-[-0.025em] text-[#F8FAFC] sm:text-[3.5rem]"
                            >
                                {PROGRAM_HEADLINE}
                            </motion.h1>

                            <motion.p
                                variants={fadeUp}
                                className="mt-6 max-w-[56ch] text-lg leading-[1.65] text-[#CBD5E1]"
                            >
                                {PROGRAM_SUBHEAD}
                            </motion.p>

                            <motion.div
                                variants={fadeUp}
                                className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap"
                            >
                                <a
                                    href={PARTNER_MAILTO}
                                    className="inline-flex items-center justify-center gap-2 rounded-pill bg-brand px-6 py-3.5 text-base font-semibold text-white no-underline transition hover:bg-brand-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300"
                                >
                                    <Mail size={18} aria-hidden="true" />
                                    Partner with us
                                </a>
                                <a
                                    href={WHATSAPP_JOIN_URL}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center justify-center gap-2 rounded-pill border border-white/20 px-6 py-3.5 text-base font-semibold text-[#F8FAFC] no-underline transition hover:border-white/40 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300"
                                >
                                    <MessageCircle size={18} aria-hidden="true" />
                                    {JOIN_CTA_LABEL}
                                </a>
                            </motion.div>

                            {/* Progress toward one million. */}
                            <motion.div variants={fadeUp} className="mt-12 max-w-[30rem]">
                                <div className="flex items-baseline justify-between gap-4">
                                    <span className="font-display text-3xl font-bold tabular-nums">
                                        {REACH_TODAY.toLocaleString('en-US')}
                                    </span>
                                    <span className="text-sm text-[#94A3B8]">
                                        of {REACH_GOAL.toLocaleString('en-US')} reached
                                    </span>
                                </div>
                                <div
                                    role="progressbar"
                                    aria-valuenow={REACH_TODAY}
                                    aria-valuemin={0}
                                    aria-valuemax={REACH_GOAL}
                                    aria-label={`${REACH_TODAY.toLocaleString('en-US')} of ${REACH_GOAL.toLocaleString('en-US')} young people reached`}
                                    className="mt-3 h-2 w-full overflow-hidden rounded-pill bg-white/10"
                                >
                                    <motion.div
                                        className="h-full rounded-pill bg-gradient-to-r from-brand-400 to-accent-400"
                                        initial={reduceMotion ? false : { width: 0 }}
                                        animate={{ width: `${PROGRESS_PERCENT}%` }}
                                        transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
                                    />
                                </div>
                            </motion.div>
                        </motion.div>
                    </div>
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

                        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                            {GAP_STATS.map((stat) => (
                                <motion.div
                                    key={stat.label}
                                    variants={fadeUp}
                                    className="flex flex-col rounded-2xl border border-subtle bg-surface-elevated p-6 shadow-soft"
                                >
                                    <span className="font-display text-3xl font-bold text-text-primary">
                                        {stat.value}
                                    </span>
                                    <span className="mt-3 flex-1 text-[0.9375rem] leading-[1.55] text-text-secondary">
                                        {stat.label}
                                    </span>
                                    <span className="mt-4 border-t border-subtle pt-3 text-xs text-text-muted">
                                        {stat.source}
                                    </span>
                                </motion.div>
                            ))}
                        </div>

                        <motion.p variants={fadeUp} className="mt-8">
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
                        <motion.p variants={fadeUp} className={LEDE}>
                            A million is a slogan until you say how. This is the ladder we are
                            climbing, and where we currently stand on it.
                        </motion.p>

                        <ol className="mt-12 grid list-none gap-5 p-0 sm:grid-cols-2 lg:grid-cols-4">
                            {MILESTONES.map((milestone) => (
                                <motion.li
                                    key={milestone.phase}
                                    variants={fadeUp}
                                    className={`relative flex flex-col rounded-2xl border p-6 ${
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
                        <motion.p variants={fadeUp} className={LEDE}>
                            Four things, running on infrastructure Edutu has already built and
                            operates every day.
                        </motion.p>

                        <div className="mt-12 grid gap-6 sm:grid-cols-2">
                            {PILLARS.map((pillar) => {
                                const Icon = pillar.icon;
                                return (
                                    <motion.article
                                        key={pillar.title}
                                        variants={fadeUp}
                                        className="flex flex-col overflow-hidden rounded-3xl border border-subtle bg-surface-elevated shadow-soft"
                                    >
                                        <div className="h-44 w-full overflow-hidden sm:h-52">
                                            <ImageWithFallback
                                                src={pillar.image}
                                                alt={pillar.imageAlt}
                                                className="h-full w-full object-cover"
                                            />
                                        </div>
                                        <div className="flex flex-1 flex-col p-6 sm:p-7">
                                            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/[0.12] text-brand">
                                                <Icon size={20} aria-hidden="true" />
                                            </span>
                                            <h3 className="mt-4 font-display text-xl font-semibold text-text-primary">
                                                {pillar.title}
                                            </h3>
                                            <p className="mt-3 flex-1 text-[0.9375rem] leading-[1.65] text-text-secondary">
                                                {pillar.body}
                                            </p>
                                            <p className="mt-5 flex gap-2.5 border-t border-subtle pt-5 text-[0.9375rem] leading-[1.6] text-text-primary">
                                                <Check
                                                    size={18}
                                                    aria-hidden="true"
                                                    className="mt-0.5 shrink-0 text-brand"
                                                />
                                                <span>{pillar.youGet}</span>
                                            </p>
                                        </div>
                                    </motion.article>
                                );
                            })}
                        </div>
                    </Reveal>
                </section>

                {/* ─── Stories — the pivot from partner lane to beneficiary lane ─ */}
                <section className={`${SECTION} border-b border-subtle bg-surface-elevated`}>
                    <Reveal className={SHELL}>
                        <motion.h2 variants={fadeUp} className={TITLE}>
                            Who this is <span className="text-brand">for</span>
                        </motion.h2>

                        <motion.p
                            variants={fadeUp}
                            className="mt-5 flex max-w-[68ch] gap-3 rounded-2xl border border-subtle bg-surface p-5 text-[0.9375rem] leading-[1.65] text-text-secondary"
                        >
                            <Info
                                size={18}
                                aria-hidden="true"
                                className="mt-0.5 shrink-0 text-text-muted"
                            />
                            <span>{COMPOSITE_DISCLOSURE}</span>
                        </motion.p>

                        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                            {STORIES.map((story) => (
                                <motion.div key={story.name} variants={fadeUp}>
                                    <StoryCard story={story} />
                                </motion.div>
                            ))}
                        </div>
                    </Reveal>
                </section>

                {/* ─── A year in the program ────────────────────────────── */}
                <section className={`${SECTION} border-b border-subtle`}>
                    <Reveal className={SHELL}>
                        <motion.h2 variants={fadeUp} className={TITLE}>
                            A year in <span className="text-brand">the program</span>
                        </motion.h2>
                        <motion.p variants={fadeUp} className={LEDE}>
                            Not a course with a certificate at the end. A year of applying to
                            real things, with help at the points where people usually stop.
                        </motion.p>

                        <ol className="mt-12 grid list-none gap-0 p-0 md:grid-cols-5">
                            {TIMELINE.map((step, index) => (
                                <motion.li
                                    key={step.window}
                                    variants={fadeUp}
                                    className="relative border-subtle pb-8 pl-8 md:border-l-0 md:border-t md:pb-0 md:pl-0 md:pr-6 md:pt-8 [&:not(:last-child)]:border-l md:[&:not(:last-child)]:border-l-0"
                                >
                                    <span
                                        aria-hidden="true"
                                        className="absolute left-0 top-1 h-3 w-3 -translate-x-1/2 rounded-full bg-brand md:left-0 md:top-0 md:translate-x-0 md:-translate-y-1/2"
                                    />
                                    <span className="text-xs font-semibold uppercase tracking-[0.12em] text-brand">
                                        {step.window}
                                    </span>
                                    <h3 className="mt-2 font-display text-lg font-semibold leading-tight text-text-primary">
                                        {step.title}
                                    </h3>
                                    <p className="mt-2 text-[0.9375rem] leading-[1.6] text-text-secondary">
                                        {step.body}
                                    </p>
                                    <span className="sr-only">Step {index + 1} of {TIMELINE.length}</span>
                                </motion.li>
                            ))}
                        </ol>
                    </Reveal>
                </section>

                {/* ─── Join ─────────────────────────────────────────────── */}
                <section className={`${SECTION} border-b border-subtle bg-surface-elevated`}>
                    <Reveal className={SHELL}>
                        <motion.h2 variants={fadeUp} className={TITLE}>
                            How to <span className="text-brand">join</span>
                        </motion.h2>
                        <motion.p variants={fadeUp} className={LEDE}>
                            {JOIN_ELIGIBILITY}
                        </motion.p>

                        <div className="mt-12 grid gap-5 md:grid-cols-3">
                            {JOIN_STEPS.map((step) => (
                                <motion.div
                                    key={step.step}
                                    variants={fadeUp}
                                    className="rounded-2xl border border-subtle bg-surface p-6"
                                >
                                    <span className="font-mono text-sm font-semibold text-brand">
                                        {step.step}
                                    </span>
                                    <h3 className="mt-3 font-display text-lg font-semibold text-text-primary">
                                        {step.title}
                                    </h3>
                                    <p className="mt-2 text-[0.9375rem] leading-[1.65] text-text-secondary">
                                        {step.body}
                                    </p>
                                </motion.div>
                            ))}
                        </div>

                        <motion.div
                            variants={fadeUp}
                            className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap"
                        >
                            <a
                                href={WHATSAPP_JOIN_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center gap-2 rounded-pill bg-brand px-6 py-3.5 text-base font-semibold text-white no-underline transition hover:bg-brand-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                            >
                                <MessageCircle size={18} aria-hidden="true" />
                                {JOIN_CTA_LABEL}
                            </a>
                            <Link
                                to="/opportunities"
                                className="inline-flex items-center justify-center gap-2 rounded-pill border border-strong px-6 py-3.5 text-base font-semibold text-text-primary no-underline transition hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                            >
                                Browse opportunities
                                <ArrowRight size={18} aria-hidden="true" />
                            </Link>
                        </motion.div>
                    </Reveal>
                </section>

                {/* ─── Partner ──────────────────────────────────────────── */}
                <section className={`${SECTION} border-b border-subtle`} id="partner">
                    <Reveal className={SHELL}>
                        <motion.h2 variants={fadeUp} className={TITLE}>
                            Partner with <span className="text-brand">Edutu For You</span>
                        </motion.h2>
                        <motion.p variants={fadeUp} className={LEDE}>
                            {PARTNER_PITCH}
                        </motion.p>

                        <div className="mt-12 grid gap-5 sm:grid-cols-2">
                            {PARTNER_LANES.map((lane) => {
                                const Icon = lane.icon;
                                return (
                                    <motion.div
                                        key={lane.title}
                                        variants={fadeUp}
                                        className="flex gap-4 rounded-2xl border border-subtle bg-surface-elevated p-6 shadow-soft"
                                    >
                                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/[0.12] text-brand">
                                            <Icon size={20} aria-hidden="true" />
                                        </span>
                                        <div>
                                            <h3 className="font-display text-lg font-semibold text-text-primary">
                                                {lane.title}
                                            </h3>
                                            <p className="mt-2 text-[0.9375rem] leading-[1.65] text-text-secondary">
                                                {lane.body}
                                            </p>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>

                        <motion.div variants={fadeUp} className="mt-10">
                            <a
                                href={PARTNER_MAILTO}
                                className="inline-flex items-center justify-center gap-2 rounded-pill bg-brand px-6 py-3.5 text-base font-semibold text-white no-underline transition hover:bg-brand-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
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
                <section className={`${SECTION} bg-surface-elevated`}>
                    <Reveal className="mx-auto max-w-[800px]">
                        <motion.h2 variants={fadeUp} className={`${TITLE} text-center`}>
                            Fair <span className="text-brand">questions</span>
                        </motion.h2>

                        <dl className="mt-12 space-y-6">
                            {PROGRAM_FAQ.map((item) => (
                                <motion.div
                                    key={item.question}
                                    variants={fadeUp}
                                    className="rounded-2xl border border-subtle bg-surface p-6"
                                >
                                    <dt className="font-display text-lg font-semibold text-text-primary">
                                        {item.question}
                                    </dt>
                                    <dd className="mt-2 text-[0.9375rem] leading-[1.7] text-text-secondary">
                                        {item.answer}
                                    </dd>
                                </motion.div>
                            ))}
                        </dl>

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
