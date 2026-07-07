import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ShieldCheck } from 'lucide-react';
import PublicHeader from './PublicHeader';
import SiteFooter from './SiteFooter';

export interface LegalSection {
    heading: string;
    /** Each entry is a paragraph. Use a string[] for a bulleted list instead. */
    body: (string | string[])[];
    /** Optional action button rendered after the body (e.g. a mailto link). */
    cta?: { label: string; href: string };
}

interface LegalDocPageProps {
    eyebrow: string;
    title: string;
    lastUpdated: string;
    intro: string;
    sections: LegalSection[];
}

const LegalDocPage: React.FC<LegalDocPageProps> = ({ eyebrow, title, lastUpdated, intro, sections }) => {
    const reduceMotion = useReducedMotion();

    return (
        <div className="min-h-[100dvh] overflow-x-hidden bg-surface-body font-body text-text-primary">
            <PublicHeader />

            <main className="relative z-10">
                <section className="px-4 pb-16 pt-40 sm:px-6">
                    <div className="mx-auto max-w-[820px]">
                        <motion.div
                            initial={reduceMotion ? undefined : { opacity: 0, y: 16 }}
                            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                            transition={{ duration: 0.5 }}
                            className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/10 px-4 py-1.5"
                        >
                            <ShieldCheck size={14} className="text-brand" />
                            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand">{eyebrow}</span>
                        </motion.div>
                        <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight text-text-primary sm:text-5xl">
                            {title}
                        </h1>
                        <p className="mt-4 text-sm font-medium text-text-muted">Last updated: {lastUpdated}</p>
                        <p className="mt-6 text-lg leading-relaxed text-text-secondary">{intro}</p>
                    </div>
                </section>

                <section className="px-4 pb-24 sm:px-6">
                    <div className="mx-auto max-w-[820px] space-y-12">
                        {sections.map((section, i) => (
                            <div key={i} className="border-t border-subtle pt-10">
                                <h2 className="mb-4 font-display text-2xl font-semibold tracking-tight text-text-primary">
                                    {section.heading}
                                </h2>
                                <div className="space-y-4">
                                    {section.body.map((block, j) =>
                                        Array.isArray(block) ? (
                                            <ul key={j} className="ml-5 list-disc space-y-2 text-base leading-relaxed text-text-secondary">
                                                {block.map((item, k) => (
                                                    <li key={k}>{item}</li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <p key={j} className="text-base leading-relaxed text-text-secondary">
                                                {block}
                                            </p>
                                        ),
                                    )}
                                    {section.cta ? (
                                        <a
                                            href={section.cta.href}
                                            className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
                                        >
                                            {section.cta.label}
                                        </a>
                                    ) : null}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </main>

            <SiteFooter />
        </div>
    );
};

export default LegalDocPage;
