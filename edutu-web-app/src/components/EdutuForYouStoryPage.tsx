import React, { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowRight, MessageCircle } from 'lucide-react';
import Seo from './Seo';
import PublicHeader from './PublicHeader';
import SiteFooter from './SiteFooter';
import ImageWithFallback from './ImageWithFallback';
import {
    JOIN_CTA_LABEL,
    PROGRAM_NAME,
    PROGRAM_PATH,
    WHATSAPP_JOIN_URL,
} from '../lib/edutuForYou';
import {
    STORIES as SEED_STORIES,
    STORY_ATTRIBUTION,
    findStory,
    type Story,
} from '../lib/edutuForYouStories';
import { fetchImpactStories } from '../services/impactStories';

/**
 * /edutuforyou/stories/:slug — one beneficiary story at full length.
 *
 * Unlike the other program routes this one is not in `scripts/page-seo.mjs`:
 * the registry drives per-path prerendering, and nine near-identical entries
 * (plus nine vercel rewrites and nine captured OG images) would cost more than
 * it returns. Metadata is set at runtime via <Seo> with the story's own hero,
 * the same approach BlogPostPage uses for per-item pages.
 */

const EdutuForYouStoryPage: React.FC = () => {
    const { slug } = useParams<{ slug: string }>();
    const reduceMotion = useReducedMotion();

    // Seeded rows render immediately; the admin-managed set replaces them once
    // it arrives. Fetching the whole list rather than one story keeps the
    // "next story" link consistent with the order set in the admin panel.
    const [stories, setStories] = useState<Story[]>(SEED_STORIES);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        const controller = new AbortController();
        fetchImpactStories(controller.signal).then((rows) => {
            if (controller.signal.aborted) return;
            setStories(rows);
            setLoaded(true);
        });
        return () => controller.abort();
    }, []);

    const story =
        stories.find((item) => item.slug === slug) ?? findStory(slug) ?? null;

    // Only redirect once the live set has arrived — bouncing on the seed list
    // alone would throw away a story an admin has since added.
    if (!story) {
        return loaded ? <Navigate to={PROGRAM_PATH} replace /> : null;
    }

    const index = stories.findIndex((item) => item.slug === story.slug);
    const next = stories[(index + 1) % stories.length] ?? story;

    const fade = reduceMotion
        ? {}
        : {
              initial: { opacity: 0, y: 20 },
              animate: { opacity: 1, y: 0 },
              transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const },
          };

    return (
        <div className="min-h-screen bg-surface-body">
            <Seo
                title={`${story.name}, ${story.age} — ${story.place} | ${PROGRAM_NAME}`}
                description={story.teaser}
                path={`/edutuforyou/stories/${story.slug}`}
                image={story.heroImage}
                imageAlt={story.heroAlt}
                type="article"
            />
            <PublicHeader />

            <main>
                {/* ─── Hero ─────────────────────────────────────────────── */}
                <section className="relative isolate overflow-hidden bg-[#0B0F19] px-4 pb-16 pt-24 text-[#F8FAFC] sm:px-6 sm:pb-20 sm:pt-32">
                    <div className="absolute inset-0 -z-10">
                        <ImageWithFallback
                            src={story.heroImage}
                            alt={story.heroAlt}
                            className="h-full w-full object-cover"
                        />
                        <div
                            aria-hidden="true"
                            className="absolute inset-0 bg-gradient-to-r from-[#0B0F19]/95 via-[#0B0F19]/80 to-[#0B0F19]/35"
                        />
                    </div>

                    <div className="mx-auto max-w-[880px]">
                        <Link
                            to={PROGRAM_PATH}
                            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#C7D2FE] no-underline transition hover:text-white"
                        >
                            <ArrowLeft size={16} aria-hidden="true" />
                            {PROGRAM_NAME}
                        </Link>

                        <motion.div {...fade}>
                            <span className="mt-6 inline-flex rounded-pill border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#C7D2FE]">
                                {story.outcome}
                            </span>

                            <h1 className="mt-5 font-display text-[2rem] font-bold leading-[1.1] tracking-[-0.025em] text-[#F8FAFC] sm:text-[3rem]">
                                {story.name}, {story.age}
                            </h1>
                            <p className="mt-2 text-lg text-[#94A3B8]">{story.place}</p>

                            <blockquote className="mt-8 border-l-2 border-brand pl-5 font-display text-xl leading-[1.4] text-[#F8FAFC] sm:text-2xl">
                                “{story.quote}”
                            </blockquote>
                        </motion.div>
                    </div>
                </section>

                {/* ─── Stats ────────────────────────────────────────────── */}
                <section className="border-b border-subtle px-4 py-10 sm:px-6">
                    <dl className="mx-auto grid max-w-[880px] grid-cols-1 gap-6 sm:grid-cols-3">
                        {story.stats.map((stat) => (
                            <div key={stat.label}>
                                <dt className="sr-only">{stat.label}</dt>
                                <dd className="m-0">
                                    <span className="block font-display text-3xl font-bold text-brand">
                                        {stat.value}
                                    </span>
                                    <span className="mt-1 block text-[0.9375rem] leading-[1.5] text-text-secondary">
                                        {stat.label}
                                    </span>
                                </dd>
                            </div>
                        ))}
                    </dl>
                </section>

                {/* ─── The story ────────────────────────────────────────── */}
                <article className="px-4 py-16 sm:px-6 sm:py-20">
                    <div className="mx-auto flex max-w-[720px] flex-col gap-12">
                        {story.chapters.map((chapter) => (
                            <section key={chapter.heading}>
                                <h2 className="font-display text-2xl font-bold leading-[1.2] text-text-primary">
                                    {chapter.heading}
                                </h2>
                                {chapter.body.map((paragraph) => (
                                    <p
                                        key={paragraph.slice(0, 40)}
                                        className="mt-4 text-[1.0625rem] leading-[1.75] text-text-secondary"
                                    >
                                        {paragraph}
                                    </p>
                                ))}
                            </section>
                        ))}

                        <p className="border-l-2 border-brand pl-5 font-display text-xl leading-[1.45] text-text-primary">
                            {story.barrier}
                        </p>

                        {story.isComposite ? (
                            <p className="text-sm leading-[1.6] text-text-muted">
                                {STORY_ATTRIBUTION}
                            </p>
                        ) : null}
                    </div>
                </article>

                {/* ─── Next + CTA ───────────────────────────────────────── */}
                <section className="border-t border-subtle bg-surface-elevated px-4 py-16 sm:px-6 sm:py-20">
                    <div className="mx-auto grid max-w-[880px] gap-6 md:grid-cols-2">
                        <Link
                            to={`/edutuforyou/stories/${next.slug}`}
                            className="group flex items-center gap-5 rounded-3xl border border-subtle bg-surface p-5 no-underline transition hover:shadow-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                        >
                            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl">
                                <ImageWithFallback
                                    src={next.portrait}
                                    alt={next.portraitAlt}
                                    className="h-full w-full object-cover"
                                />
                            </div>
                            <div className="min-w-0">
                                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
                                    Next story
                                </span>
                                <span className="mt-1 block font-display text-lg font-semibold text-text-primary">
                                    {next.name}, {next.age}
                                </span>
                                <span className="block truncate text-sm text-text-secondary">
                                    {next.place}
                                </span>
                            </div>
                            <ArrowRight
                                size={20}
                                aria-hidden="true"
                                className="ml-auto shrink-0 text-brand transition-transform duration-300 group-hover:translate-x-1"
                            />
                        </Link>

                        <div className="flex flex-col justify-center gap-3 rounded-3xl border border-subtle bg-surface p-6">
                            <p className="text-[0.9375rem] leading-[1.6] text-text-secondary">
                                Stories like this are why {PROGRAM_NAME} exists.
                            </p>
                            <div className="flex flex-wrap gap-3">
                                <a
                                    href={WHATSAPP_JOIN_URL}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 rounded-pill bg-brand px-5 py-2.5 text-sm font-semibold text-white no-underline transition hover:bg-brand-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                                >
                                    <MessageCircle size={16} aria-hidden="true" />
                                    {JOIN_CTA_LABEL}
                                </a>
                                <Link
                                    to={PROGRAM_PATH}
                                    className="inline-flex items-center gap-2 rounded-pill border border-strong px-5 py-2.5 text-sm font-semibold text-text-primary no-underline transition hover:bg-surface-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                                >
                                    All stories
                                </Link>
                            </div>
                        </div>
                    </div>
                </section>
            </main>

            <SiteFooter />
        </div>
    );
};

export default EdutuForYouStoryPage;
