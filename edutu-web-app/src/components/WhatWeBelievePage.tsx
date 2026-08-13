import React from 'react';
import { ArrowRight, Check, Heart } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import PageSeo from './PageSeo';
import PublicHeader from './PublicHeader';
import SiteFooter from './SiteFooter';
import { useDarkMode } from '../hooks/useDarkMode';

const illustrationSheet = '/illustrations/beliefs-sheet.png';
const darkIllustrationSheet = '/illustrations/beliefs-sheet-dark.png';

type Belief = {
    number: string;
    headline: string;
    statement: string;
    position: string;
    layout: string;
    tone: string;
};

const beliefs: Belief[] = [
    {
        number: '01',
        headline: 'Talent is everywhere.',
        statement: 'Brilliance is not owned by a postcode.',
        position: '0% 0%',
        layout: 'md:col-span-1 xl:col-span-7',
        tone: 'bg-surface-layer',
    },
    {
        number: '02',
        headline: 'Opportunity should be fair.',
        statement: 'Where you start should not decide how far you go.',
        position: '50% 0%',
        layout: 'md:col-span-1 xl:col-span-5',
        tone: 'bg-surface-brand',
    },
    {
        number: '03',
        headline: 'Information changes lives.',
        statement: 'The right link, at the right time, can change everything.',
        position: '100% 0%',
        layout: 'md:col-span-1 xl:col-span-4',
        tone: 'bg-surface-layer',
    },
    {
        number: '04',
        headline: 'AI should empower people.',
        statement: 'Technology should clear the path, not take the wheel.',
        position: '0% 50%',
        layout: 'md:col-span-1 xl:col-span-4',
        tone: 'bg-surface-layer',
    },
    {
        number: '05',
        headline: 'Confidence matters.',
        statement: 'Sometimes the first breakthrough is simply applying.',
        position: '50% 50%',
        layout: 'md:col-span-1 xl:col-span-4',
        tone: 'bg-surface-brand',
    },
    {
        number: '06',
        headline: 'Learning never ends.',
        statement: 'Every next step is still part of the journey.',
        position: '100% 50%',
        layout: 'md:col-span-1 xl:col-span-5',
        tone: 'bg-surface-layer',
    },
    {
        number: '07',
        headline: 'One opportunity can ripple outward.',
        statement: 'A single yes can reach a whole family.',
        position: '0% 100%',
        layout: 'md:col-span-1 xl:col-span-7',
        tone: 'bg-surface-layer',
    },
    {
        number: '08',
        headline: "Africa's greatest resource is its people.",
        statement: 'Invest in people and communities move forward.',
        position: '50% 100%',
        layout: 'md:col-span-1 xl:col-span-4',
        tone: 'bg-surface-brand',
    },
    {
        number: '09',
        headline: 'No dream should die from not knowing where to look.',
        statement: 'Make the next door easier to find.',
        position: '100% 100%',
        layout: 'md:col-span-2 xl:col-span-8',
        tone: 'bg-surface-layer',
    },
];

const fadeUp = {
    hidden: { opacity: 0, y: 22 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.62, ease: [0.16, 1, 0.3, 1] },
    },
};

const stagger = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.07, delayChildren: 0.08 },
    },
};

const WhatWeBelievePage: React.FC = () => {
    const reduceMotion = useReducedMotion();
    const { isDarkMode } = useDarkMode();
    const activeIllustrationSheet = isDarkMode ? darkIllustrationSheet : illustrationSheet;
    const reveal = reduceMotion
        ? {}
        : {
              variants: fadeUp,
              initial: 'hidden' as const,
              whileInView: 'visible' as const,
              viewport: { once: true, margin: '-72px' },
          };
    const listReveal = reduceMotion
        ? {}
        : {
              variants: stagger,
              initial: 'hidden' as const,
              whileInView: 'visible' as const,
              viewport: { once: true, margin: '-72px' },
          };

    return (
        <div className="min-h-[100dvh] overflow-x-hidden bg-surface-body font-body text-text-primary">
            <PageSeo path="/what-we-believe" />
            <PublicHeader />

            <main>
                <section className="relative overflow-hidden border-b border-subtle px-4 pb-20 pt-24 sm:px-6 sm:pb-28 sm:pt-32">
                    <div className="pointer-events-none absolute left-1/2 top-0 h-[24rem] w-[44rem] -translate-x-1/2 rounded-full bg-brand/10 blur-3xl" />
                    <div className="mx-auto flex max-w-[900px] flex-col items-center text-center">
                        <motion.div {...reveal} className="flex flex-col items-center">
                            <span className="inline-flex items-center rounded-full border border-brand/20 bg-brand/10 px-3 py-1.5 text-2xs font-semibold uppercase tracking-[0.18em] text-brand">
                                A note from Edutu
                            </span>
                            <h1 className="mt-7 max-w-[860px] font-display text-[clamp(2.9rem,7vw,5.5rem)] font-semibold leading-[0.98] tracking-[-0.045em] text-text-primary text-balance">
                                Talent is everywhere.
                                <br />
                                <span className="text-brand">Opportunity should be too.</span>
                            </h1>
                            <p className="mx-auto mt-7 max-w-[620px] text-lg leading-[1.65] text-text-secondary sm:text-xl">
                                These are the ideas behind the product: fewer closed doors, clearer next steps,
                                and more people seeing a future they can act on.
                            </p>
                            <div className="mt-9 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm font-medium text-text-muted">
                                <span className="font-display text-base font-semibold text-text-primary">09 beliefs</span>
                                <span aria-hidden="true" className="h-1 w-1 rounded-full bg-brand/60" />
                                <span>that shape the work</span>
                            </div>
                        </motion.div>
                    </div>
                </section>

                <section className="relative px-4 py-20 sm:px-6 sm:py-28">
                    <div className="mx-auto max-w-[1200px]">
                        <motion.div {...reveal} className="mb-12 max-w-[620px] sm:mb-16">
                            <h2 className="font-display text-[clamp(2rem,4vw,3.25rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-text-primary text-balance">
                                What guides the way
                            </h2>
                            <p className="mt-5 max-w-[560px] text-base leading-[1.7] text-text-secondary sm:text-lg">
                                Short answers to a big question: what should opportunity feel like?
                            </p>
                        </motion.div>

                        <motion.div {...listReveal} className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-12">
                            {beliefs.map((belief) => (
                                <motion.article
                                    key={belief.number}
                                    variants={reduceMotion ? undefined : fadeUp}
                                    className={`group flex flex-col rounded-3xl border border-subtle p-3 shadow-soft transition duration-300 hover:-translate-y-1 hover:border-brand/40 hover:shadow-elevated ${belief.layout} ${belief.tone}`}
                                >
                                    <div
                                        role="img"
                                        aria-label={`${belief.headline} illustration`}
                                        className="aspect-[1.35] w-full overflow-hidden rounded-[1.35rem] border border-black/5 bg-surface-elevated bg-cover bg-no-repeat transition duration-500 group-hover:scale-[0.985] dark:border-white/10"
                                        style={{
                                            backgroundImage: `url(${activeIllustrationSheet})`,
                                            backgroundPosition: belief.position,
                                            backgroundSize: '300% 300%',
                                        }}
                                    />
                                    <div className="flex flex-1 flex-col px-3 pb-3 pt-5 sm:px-4 sm:pb-4 sm:pt-6">
                                        <div className="mb-4 flex items-center justify-between">
                                            <span className="font-mono text-2xs font-medium tracking-[0.16em] text-brand">
                                                {belief.number}
                                            </span>
                                            <span className="h-px w-12 bg-brand/25" aria-hidden="true" />
                                        </div>
                                        <h3 className="max-w-[25rem] font-display text-2xl font-semibold leading-[1.08] tracking-[-0.025em] text-text-primary sm:text-[1.7rem]">
                                            {belief.headline}
                                        </h3>
                                        <p className="mt-4 max-w-[30rem] text-base leading-[1.65] text-text-secondary">
                                            {belief.statement}
                                        </p>
                                    </div>
                                </motion.article>
                            ))}
                        </motion.div>
                    </div>
                </section>

                <section className="border-y border-subtle bg-surface-elevated px-4 py-20 sm:px-6 sm:py-28">
                    <div className="mx-auto grid max-w-[1200px] items-center gap-10 lg:grid-cols-[0.7fr_1.3fr] lg:gap-20">
                        <motion.div {...reveal}>
                            <span className="font-mono text-2xs font-medium uppercase tracking-[0.18em] text-brand">Our promise</span>
                            <h2 className="mt-5 max-w-[440px] font-display text-[clamp(2rem,4vw,3.2rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-text-primary text-balance">
                                Keep asking who this helps.
                            </h2>
                        </motion.div>

                        <motion.div {...reveal} className="rounded-3xl bg-brand-700 p-7 text-white shadow-elevated sm:p-10 dark:bg-brand-800">
                            <Heart size={24} strokeWidth={1.8} aria-hidden="true" />
                            <p className="mt-7 max-w-[700px] font-display text-[clamp(1.55rem,3vw,2.45rem)] font-medium leading-[1.14] tracking-[-0.025em]">
                                “Will this help one more young person discover an opportunity that could change their life?”
                            </p>
                            <div className="mt-9 grid gap-3 border-t border-white/20 pt-6 sm:grid-cols-2">
                                <div className="flex items-center gap-3 text-sm font-semibold text-white/95">
                                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15">
                                        <Check size={16} aria-hidden="true" />
                                    </span>
                                    If yes, build it.
                                </div>
                                <div className="flex items-center gap-3 text-sm font-semibold text-white/90">
                                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15">—</span>
                                    If not, leave it.
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </section>

                <section className="px-4 py-20 sm:px-6 sm:py-28">
                    <motion.div
                        {...reveal}
                        className="mx-auto flex max-w-[1200px] flex-col items-start justify-between gap-8 overflow-hidden rounded-3xl bg-brand-700 px-7 py-10 text-white shadow-elevated sm:px-12 sm:py-14 lg:flex-row lg:items-center lg:px-16 dark:bg-brand-800"
                    >
                        <div className="relative z-10 max-w-[620px]">
                            <h2 className="font-display text-[clamp(2rem,4vw,3.45rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-balance">
                                Maybe the next opportunity is for you.
                            </h2>
                            <p className="mt-4 max-w-[500px] text-base leading-[1.65] text-white/90 sm:text-lg">
                                Start with one search. See what opens up.
                            </p>
                        </div>
                        <Link
                            to="/opportunities"
                            className="relative z-10 inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-5 py-3.5 text-sm font-semibold text-brand-800 shadow-soft transition duration-200 hover:-translate-y-0.5 hover:shadow-elevated focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-700 dark:text-brand-900 dark:focus-visible:ring-offset-brand-800"
                        >
                            Browse opportunities <ArrowRight size={16} aria-hidden="true" />
                        </Link>
                        <div
                            aria-hidden="true"
                            className="absolute -bottom-28 -right-16 hidden h-72 w-72 rounded-full border-[22px] border-white/10 sm:block"
                        />
                    </motion.div>
                </section>
            </main>

            <SiteFooter />
        </div>
    );
};

export default WhatWeBelievePage;
