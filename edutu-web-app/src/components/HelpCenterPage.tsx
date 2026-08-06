import React from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import {
    ArrowRight,
    BookOpen,
    Compass,
    LifeBuoy,
    Mail,
    MessageCircle,
    Search,
    Sparkles,
    type LucideIcon,
} from 'lucide-react';
import PageSeo from './PageSeo';
import PublicHeader from './PublicHeader';
import SiteFooter from './SiteFooter';
import ContactSupportForm from './ContactSupportForm';

interface HelpCategory {
    icon: LucideIcon;
    title: string;
    desc: string;
    to: string;
    external?: boolean;
}

const categories: HelpCategory[] = [
    { icon: Compass, title: 'Getting started', desc: 'Set up your profile and get matched with your first opportunities.', to: '/about' },
    { icon: Search, title: 'Finding opportunities', desc: 'Search, filter, and save scholarships, internships, and fellowships.', to: '/opportunities' },
    { icon: BookOpen, title: 'Developer & API', desc: 'Integrate the Scholarship Engine and read our developer docs.', to: '/scholarship-engine' },
];

interface Faq {
    q: string;
    a: string;
}

const faqs: Faq[] = [
    {
        q: 'Is Edutu free to use?',
        a: 'Yes. Discovering opportunities, saving them, and tracking deadlines is free for learners. We may add optional premium tools over time, but the core experience stays free.',
    },
    {
        q: 'How does Edutu find opportunities for me?',
        a: 'When you build your profile, we match you with scholarships, internships, and fellowships that fit your education level, interests, and goals, so you spend less time searching.',
    },
    {
        q: 'Are the opportunities verified?',
        a: 'We curate listings from many trusted sources and work to keep them accurate. Always confirm details on the official provider website before applying, since programs can change.',
    },
    {
        q: 'How do I reset my password or manage my account?',
        a: 'Head to your settings once signed in. You can update your profile, notification preferences, and account details there at any time.',
    },
    {
        q: 'How do I become a mentor?',
        a: 'We would love that. Visit the Become a Mentor page to learn what is involved and register your interest.',
    },
];

const HelpCenterPage: React.FC = () => {
    const reduceMotion = useReducedMotion();
    const reveal = reduceMotion
        ? {}
        : {
              initial: { opacity: 0, y: 24 } as const,
              whileInView: { opacity: 1, y: 0 } as const,
              viewport: { once: true },
              transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] as const },
          };

    return (
        <div className="min-h-[100dvh] overflow-x-hidden bg-surface-body font-body text-text-primary">
            <PageSeo path="/help" />
            <PublicHeader />

            <main className="relative z-10">
                {/* Hero */}
                <section className="px-4 pb-16 pt-40 sm:px-6">
                    <div className="mx-auto max-w-[820px] text-center">
                        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/10 px-4 py-1.5">
                            <LifeBuoy size={14} className="text-brand" />
                            <span className="text-2xs font-semibold uppercase tracking-[0.2em] text-brand">Help Center</span>
                        </div>
                        <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight text-text-primary sm:text-5xl md:text-6xl">
                            How can we <span className="text-brand">help?</span>
                        </h1>
                        <p className="mx-auto mt-6 max-w-[560px] text-base leading-relaxed text-text-secondary sm:text-lg">
                            Answers to common questions and quick links to get the most out of Edutu.
                        </p>
                    </div>
                </section>

                {/* Categories */}
                <section className="px-4 pb-8 sm:px-6">
                    <div className="mx-auto grid max-w-[1000px] grid-cols-1 gap-6 sm:grid-cols-3">
                        {categories.map((cat) => {
                            const inner = (
                                <>
                                    <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10">
                                        <cat.icon size={22} className="text-brand" />
                                    </div>
                                    <h3 className="mb-2 font-display text-lg font-semibold tracking-tight text-text-primary">
                                        {cat.title}
                                    </h3>
                                    <p className="text-sm leading-relaxed text-text-secondary">{cat.desc}</p>
                                </>
                            );
                            const className =
                                'block rounded-3xl border border-subtle bg-surface-layer p-8 no-underline shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-brand/40 hover:shadow-elevated';
                            return (
                                <motion.div key={cat.title} {...reveal}>
                                    <Link to={cat.to} className={className}>
                                        {inner}
                                    </Link>
                                </motion.div>
                            );
                        })}
                    </div>
                </section>

                {/* FAQ */}
                <section className="px-4 py-20 sm:px-6">
                    <div className="mx-auto max-w-[820px]">
                        <div className="mb-12 text-center">
                            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">FAQ</span>
                            <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
                                Frequently asked questions
                            </h2>
                        </div>

                        <div className="space-y-3">
                            {faqs.map((faq, i) => (
                                <details
                                    key={i}
                                    className="group rounded-2xl border border-subtle bg-surface-layer px-6 py-5 shadow-soft [&_summary::-webkit-details-marker]:hidden"
                                >
                                    <summary className="flex cursor-pointer items-center justify-between gap-4 font-display text-base font-semibold text-text-primary">
                                        {faq.q}
                                        <ArrowRight
                                            size={18}
                                            className="shrink-0 text-brand transition-transform duration-300 group-open:rotate-90"
                                        />
                                    </summary>
                                    <p className="mt-4 text-base leading-relaxed text-text-secondary">{faq.a}</p>
                                </details>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Contact */}
                <section className="border-t border-subtle bg-surface-elevated px-4 py-24 sm:px-6">
                    <div className="mx-auto max-w-[900px]">
                        <div className="mb-10 text-center">
                            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/10 px-4 py-1.5">
                                <Sparkles size={14} className="text-brand" />
                                <span className="text-2xs font-semibold uppercase tracking-[0.2em] text-brand">Still stuck?</span>
                            </div>
                            <h2 className="font-display text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
                                Get in touch
                            </h2>
                        </div>

                        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                            <a
                                href="mailto:my.edutu@gmail.com"
                                className="flex items-start gap-4 rounded-3xl border border-subtle bg-surface-layer p-8 no-underline shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-brand/40 hover:shadow-elevated"
                            >
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand/10">
                                    <Mail size={22} className="text-brand" />
                                </div>
                                <div>
                                    <h3 className="mb-1 font-display text-lg font-semibold tracking-tight text-text-primary">
                                        Email support
                                    </h3>
                                    <p className="text-sm leading-relaxed text-text-secondary">
                                        my.edutu@gmail.com — we usually reply within a day.
                                    </p>
                                </div>
                            </a>
                            <Link
                                to="/mentor"
                                className="flex items-start gap-4 rounded-3xl border border-subtle bg-surface-layer p-8 no-underline shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-brand/40 hover:shadow-elevated"
                            >
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand/10">
                                    <MessageCircle size={22} className="text-brand" />
                                </div>
                                <div>
                                    <h3 className="mb-1 font-display text-lg font-semibold tracking-tight text-text-primary">
                                        Talk to a mentor
                                    </h3>
                                    <p className="text-sm leading-relaxed text-text-secondary">
                                        Connect with someone who has been there before.
                                    </p>
                                </div>
                            </Link>
                        </div>

                        {/* Contact / bug-report form — emails the support inbox */}
                        <div className="mt-10">
                            <div className="mb-6 text-center">
                                <h3 className="font-display text-2xl font-semibold tracking-tight text-text-primary">
                                    Send us a message
                                </h3>
                                <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                                    Ask a question or report a bug and we&apos;ll reply by email.
                                </p>
                            </div>
                            <div className="mx-auto max-w-[640px]">
                                <ContactSupportForm />
                            </div>
                        </div>
                    </div>
                </section>
            </main>

            <SiteFooter />
        </div>
    );
};

export default HelpCenterPage;
