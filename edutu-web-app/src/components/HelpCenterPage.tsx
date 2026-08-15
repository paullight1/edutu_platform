import React from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import {
    ArrowRight,
    LifeBuoy,
    Mail,
    MessageCircle,
    Sparkles,
} from 'lucide-react';
import PageSeo from './PageSeo';
import PublicHeader from './PublicHeader';
import SiteFooter from './SiteFooter';
import ContactSupportForm from './ContactSupportForm';

interface HelpCategory {
    illustration: string;
    illustrationAlt: string;
    title: string;
    desc: string;
    to: string;
}

const categories: HelpCategory[] = [
    {
        illustration: '/illustrations/help-getting-started.png',
        illustrationAlt: 'Hand-drawn profile notebook, compass, and path to a bright doorway',
        title: 'Getting started',
        desc: 'Set up your profile and get matched with your first opportunities.',
        to: '/about',
    },
    {
        illustration: '/illustrations/help-finding-opportunities.png',
        illustrationAlt: 'Hand-drawn magnifying glass over a world map and opportunity papers',
        title: 'Finding opportunities',
        desc: 'Search, filter, and save scholarships, internships, and fellowships.',
        to: '/opportunities',
    },
    {
        illustration: '/illustrations/help-developer-api.png',
        illustrationAlt: 'Hand-drawn hands building an API bridge between a browser and globe',
        title: 'Developer & API',
        desc: 'Integrate the Scholarship Engine and read our developer docs.',
        to: '/scholarship-engine',
    },
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
    {
        q: 'What scholarships can I find on Edutu?',
        a: 'Edutu lists scholarships, fellowships, internships, grants, and other global programs for students and early-career professionals. Use your profile and filters to narrow the feed to opportunities that fit you.',
    },
    {
        q: 'How do I create an Edutu profile?',
        a: 'Choose Get started, create your account, and answer a few questions about your education, interests, location, and goals. Your profile helps Edutu surface more relevant opportunities.',
    },
    {
        q: 'How do I save a scholarship or internship?',
        a: 'Open any opportunity and choose Save. Saved scholarships, internships, and fellowships stay in your account so you can return to them before the deadline.',
    },
    {
        q: 'Can Edutu remind me before an application deadline?',
        a: 'Yes. Save an opportunity and keep its deadline visible in your tracking view. Notification options may vary by device and account settings, so check your preferences regularly.',
    },
    {
        q: 'Does Edutu support African students applying globally?',
        a: 'Yes. Edutu is built for African learners looking for local, regional, and international scholarships, fellowships, internships, grants, and career programs.',
    },
    {
        q: 'How do I change my interests or eligibility details?',
        a: 'Open your profile or settings while signed in and update your education, interests, location, and goals. Refreshing these details improves future opportunity matching.',
    },
    {
        q: 'Can I use Edutu on my phone?',
        a: 'Yes. Edutu works in a mobile browser and is designed for smaller screens. You can also install the Edutu app where it is available for your device.',
    },
    {
        q: 'What is Edutu Pro?',
        a: 'Edutu Pro is an optional set of advanced tools for deeper application support, including AI coaching and CV help in the mobile app. The core opportunity discovery experience remains free.',
    },
    {
        q: 'How do I report an incorrect or expired opportunity?',
        a: 'Use the support form below to tell us the opportunity title, source, and issue you found. We review reports and update or remove listings when the official source confirms a change.',
    },
    {
        q: 'Is my personal data safe on Edutu?',
        a: 'We use your information to provide matching and account features, and we do not sell personal data. Read our Privacy Policy for details about access, exports, deletion, and your choices.',
    },
];

const helpFaqJsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.q,
        acceptedAnswer: {
            '@type': 'Answer',
            text: faq.a,
        },
    })),
};

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
            <PageSeo path="/help" jsonLd={helpFaqJsonLd} />
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
                        {categories.map((cat, index) => {
                            const inner = (
                                <>
                                    <div className="relative -mx-4 -mt-4 mb-3 h-44 sm:h-48">
                                        <motion.img
                                            src={cat.illustration}
                                            alt={cat.illustrationAlt}
                                            loading="lazy"
                                            decoding="async"
                                            className="absolute -inset-[10%] h-[120%] w-[120%] max-w-none object-contain transition-transform duration-500 hover:scale-[1.04]"
                                            animate={
                                                reduceMotion
                                                    ? undefined
                                                    : { y: [0, -6, 0], rotate: [0, index % 2 === 0 ? 1 : -1, 0] }
                                            }
                                            transition={
                                                reduceMotion
                                                    ? undefined
                                                    : { duration: 6 + index, repeat: Infinity, ease: 'easeInOut', delay: index * 0.15 }
                                            }
                                        />
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
