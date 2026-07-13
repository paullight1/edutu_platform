import React from 'react';
import { Link } from 'react-router-dom';
import {
    ArrowRight,
    Sparkles,
    Globe,
    Scale,
    Mail,
    Cpu,
    Heart,
    BookOpen,
    Waves,
    Users,
    Compass,
    Check,
    type LucideIcon,
} from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import PublicHeader from './PublicHeader';
import SiteFooter from './SiteFooter';

const fadeUp = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } },
};

const staggerContainer = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.08, delayChildren: 0.1 },
    },
};

interface Belief {
    icon: LucideIcon;
    headline: string;
    lines: string[];
    accentClass: string;
    tintClass: string;
}

const beliefs: Belief[] = [
    {
        icon: Globe,
        headline: 'Talent is everywhere.',
        lines: [
            'Brilliant young people live in every village, town, city, and country.',
            'Talent is not limited by geography, income, or the school someone attended.',
            "The world simply hasn't discovered everyone yet.",
        ],
        accentClass: 'text-brand',
        tintClass: 'bg-brand/10',
    },
    {
        icon: Scale,
        headline: 'Opportunity should never be a privilege.',
        lines: [
            'A scholarship should not depend on who you know.',
            'A fellowship should not depend on where you were born.',
            'A job should not be impossible because you never heard about it.',
            'Everyone deserves a fair chance.',
        ],
        accentClass: 'text-accent',
        tintClass: 'bg-accent/10',
    },
    {
        icon: Mail,
        headline: 'Information changes lives.',
        lines: [
            'Sometimes the difference between success and regret is one email.',
            'One application.',
            'One opportunity discovered before the deadline.',
            'Access to information is access to possibility.',
        ],
        accentClass: 'text-success',
        tintClass: 'bg-success/10',
    },
    {
        icon: Cpu,
        headline: 'AI should empower people.',
        lines: [
            'Artificial Intelligence should not replace dreams.',
            'It should help people pursue them.',
            'Technology should make opportunity easier to find, easier to understand, and easier to access.',
        ],
        accentClass: 'text-brand',
        tintClass: 'bg-brand/10',
    },
    {
        icon: Heart,
        headline: 'Confidence matters.',
        lines: [
            'Too many young people reject themselves before anyone else does.',
            'We want every user to believe:',
            '“Maybe this opportunity is for me.”',
            'Because courage often starts with possibility.',
        ],
        accentClass: 'text-danger',
        tintClass: 'bg-danger/10',
    },
    {
        icon: BookOpen,
        headline: 'Learning never ends.',
        lines: [
            'Getting a scholarship is not the finish line.',
            'Neither is getting a job.',
            'Growth is a lifelong journey.',
            "We're here for every step.",
        ],
        accentClass: 'text-warning',
        tintClass: 'bg-warning/10',
    },
    {
        icon: Waves,
        headline: 'One opportunity can change generations.',
        lines: [
            'A scholarship can educate a student.',
            'A graduate can support a family.',
            'A founder can employ hundreds.',
            'A teacher can inspire thousands.',
            'One opportunity rarely changes one life.',
            'It creates a ripple effect.',
        ],
        accentClass: 'text-accent',
        tintClass: 'bg-accent/10',
    },
    {
        icon: Users,
        headline: "Africa's greatest resource is its people.",
        lines: [
            'Not oil.',
            'Not minerals.',
            'Not land.',
            'People.',
            'When young Africans succeed, communities grow.',
            'When communities grow, nations prosper.',
        ],
        accentClass: 'text-success',
        tintClass: 'bg-success/10',
    },
    {
        icon: Compass,
        headline: "No dream should die because someone didn't know where to look.",
        lines: [
            'That is why Edutu exists.',
            'To make opportunity easier to find.',
            'To make applications less intimidating.',
            'To help young people believe in themselves.',
            'To open doors that once felt out of reach.',
        ],
        accentClass: 'text-brand',
        tintClass: 'bg-brand/10',
    },
];

const Eyebrow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">{children}</span>
);

const WhatWeBelievePage: React.FC = () => {
    const reduceMotion = useReducedMotion();

    const reveal = reduceMotion
        ? {}
        : {
              variants: fadeUp,
              initial: 'hidden' as const,
              whileInView: 'visible' as const,
              viewport: { once: true, margin: '-80px' },
          };
    const stagger = reduceMotion
        ? {}
        : {
              variants: staggerContainer,
              initial: 'hidden' as const,
              whileInView: 'visible' as const,
              viewport: { once: true, margin: '-80px' },
          };
    const childVariants = reduceMotion ? undefined : fadeUp;

    return (
        <div className="min-h-[100dvh] overflow-x-hidden bg-surface-body font-body text-text-primary">
            <PublicHeader />

            <main className="relative z-10">
                {/* Hero */}
                <section className="pt-40 pb-24 px-4 sm:px-6">
                    <div className="max-w-7xl mx-auto flex flex-col items-center text-center">
                        <motion.div
                            initial={reduceMotion ? undefined : { opacity: 0, y: 16 }}
                            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                            transition={{ duration: 0.5 }}
                            className="mb-7 inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/10 px-4 py-1.5"
                        >
                            <Sparkles size={14} className="text-brand" />
                            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand">
                                What we believe
                            </span>
                        </motion.div>

                        <motion.h1
                            initial={reduceMotion ? undefined : { opacity: 0, y: 30 }}
                            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                            className="font-display text-4xl sm:text-5xl md:text-6xl font-semibold leading-[1.06] tracking-tight mb-8 text-text-primary"
                        >
                            Talent is everywhere.
                            <br />
                            <span className="text-brand">Opportunity should be too.</span>
                        </motion.h1>

                        <motion.p
                            initial={reduceMotion ? undefined : { opacity: 0, y: 20 }}
                            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
                            className="max-w-[720px] text-lg leading-relaxed text-text-secondary"
                        >
                            These are the beliefs behind everything we build. They shape how we design,
                            what we prioritise, and the promise we make to every young person who opens
                            Edutu.
                        </motion.p>
                    </div>
                </section>

                {/* Beliefs */}
                <section className="pb-24 px-4 sm:px-6 border-t border-subtle">
                    <div className="max-w-[1000px] mx-auto pt-16">
                        <div className="mb-16 text-center">
                            <Eyebrow>Our Beliefs</Eyebrow>
                            <h2 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight leading-[1.1] mt-4 text-text-primary">
                                Nine things we hold <span className="text-brand">to be true</span>
                            </h2>
                        </div>

                        <motion.div {...stagger} className="grid gap-6 md:grid-cols-2">
                            {beliefs.map((belief, i) => (
                                <motion.article
                                    key={belief.headline}
                                    variants={childVariants}
                                    className={`group flex flex-col rounded-3xl border border-subtle bg-surface-layer p-8 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-brand/40 hover:shadow-elevated ${
                                        i === beliefs.length - 1 && beliefs.length % 2 === 1
                                            ? 'md:col-span-2'
                                            : ''
                                    }`}
                                >
                                    <div className="mb-6 flex items-start gap-4">
                                        <div
                                            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${belief.tintClass}`}
                                        >
                                            <belief.icon size={22} className={belief.accentClass} />
                                        </div>
                                        <h3 className="font-display text-xl sm:text-2xl font-semibold tracking-tight leading-snug text-text-primary">
                                            <span className="text-text-muted">We believe </span>
                                            {belief.headline}
                                        </h3>
                                    </div>

                                    <ul className="space-y-3">
                                        {belief.lines.map((line) => (
                                            <li
                                                key={line}
                                                className="flex gap-3 text-base leading-relaxed text-text-secondary"
                                            >
                                                <span
                                                    className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${belief.tintClass.replace(
                                                        '/10',
                                                        '/60',
                                                    )}`}
                                                    aria-hidden="true"
                                                />
                                                <span>{line}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </motion.article>
                            ))}
                        </motion.div>
                    </div>
                </section>

                {/* Our Promise */}
                <section className="py-24 px-4 sm:px-6 border-t border-subtle bg-surface-elevated">
                    <div className="max-w-[820px] mx-auto text-center">
                        <motion.div
                            {...reveal}
                            className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-brand/10 border border-brand/20"
                        >
                            <Heart size={14} className="text-brand" />
                            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">
                                Our Promise
                            </span>
                        </motion.div>

                        <motion.h2
                            {...reveal}
                            className="font-display text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight leading-[1.08] mt-6 mb-6 text-text-primary"
                        >
                            Every decision comes back to{' '}
                            <span className="text-brand">one question.</span>
                        </motion.h2>

                        <motion.p
                            {...reveal}
                            className="mx-auto max-w-[640px] text-xl sm:text-2xl font-display font-medium leading-relaxed text-text-primary"
                        >
                            “Will this help one more young person discover an opportunity that could
                            change their life?”
                        </motion.p>

                        <motion.div {...stagger} className="mt-12 grid gap-4 sm:grid-cols-2 text-left">
                            <motion.div
                                variants={childVariants}
                                className="flex items-center gap-4 rounded-2xl border border-subtle bg-surface-layer p-6 shadow-soft"
                            >
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-success/10">
                                    <Check size={20} className="text-success" />
                                </div>
                                <p className="text-base leading-relaxed text-text-secondary">
                                    If the answer is yes,{' '}
                                    <span className="font-semibold text-text-primary">we'll build it.</span>
                                </p>
                            </motion.div>
                            <motion.div
                                variants={childVariants}
                                className="flex items-center gap-4 rounded-2xl border border-subtle bg-surface-layer p-6 shadow-soft"
                            >
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-danger/10">
                                    <ArrowRight size={20} className="text-danger rotate-180" />
                                </div>
                                <p className="text-base leading-relaxed text-text-secondary">
                                    If not,{' '}
                                    <span className="font-semibold text-text-primary">we won't.</span>
                                </p>
                            </motion.div>
                        </motion.div>
                    </div>
                </section>

                {/* CTA */}
                <section className="py-32 px-4 sm:px-6 border-t border-subtle">
                    <div className="max-w-[1000px] mx-auto text-center p-12 lg:p-20 rounded-3xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-elevated">
                        <h2 className="font-display text-3xl md:text-4xl font-semibold tracking-tight leading-[1.1] mb-6 text-white">
                            Maybe this opportunity is for you.
                        </h2>
                        <p className="max-w-[520px] mx-auto text-lg leading-relaxed mb-10 text-white/80">
                            Courage often starts with possibility. Start exploring the opportunities
                            waiting to be discovered.
                        </p>
                        <Link
                            to="/opportunities"
                            className="inline-flex items-center gap-2 px-10 py-4 text-base font-semibold rounded-xl bg-white text-brand shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-elevated"
                        >
                            Browse Opportunities <ArrowRight size={16} />
                        </Link>
                    </div>
                </section>
            </main>

            <SiteFooter />
        </div>
    );
};

export default WhatWeBelievePage;
