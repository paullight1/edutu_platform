import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
    ArrowRight,
    BookOpen,
    ChevronDown,
    Code2,
    Database,
    ShieldCheck,
    Workflow,
    Copy,
    Check,
    RefreshCw,
    type LucideIcon,
} from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import PublicHeader from './PublicHeader';
import { getDocsUrl, getPublicApiBaseUrl } from '../lib/apiProductUrls';

const docsUrl = getDocsUrl();
const apiBaseUrl = getPublicApiBaseUrl();

type Feature = {
    icon: LucideIcon;
    title: string;
    desc: string;
    accentClass: string;
    tintClass: string;
};

type CodeTab = {
    label: string;
    title: string;
    code: string;
};

type Stat = {
    value: string;
    label: string;
};

const features: Feature[] = [
    {
        icon: Database,
        title: 'Opportunities API',
        desc: 'Access the canonical feed of scholarships, fellowships, internships, and programs from 31+ countries with stable cursor-based pagination.',
        accentClass: 'text-brand',
        tintClass: 'bg-brand/10',
    },
    {
        icon: Workflow,
        title: 'AI Matching Engine',
        desc: 'Ranked recommendations based on user profiles, goals, and historical patterns. Integrate intelligent matching into your own surfaces.',
        accentClass: 'text-accent',
        tintClass: 'bg-accent/10',
    },
    {
        icon: RefreshCw,
        title: 'Scraper Pipeline',
        desc: 'Trigger ingestion workflows and sync fresh content from multiple sources. Keep your inventory current with a single API call.',
        accentClass: 'text-success',
        tintClass: 'bg-success/10',
    },
    {
        icon: ShieldCheck,
        title: 'Billing & Auth',
        desc: 'Create projects, manage API keys with scoped permissions, and buy credits via Paystack. Full usage tracking included.',
        accentClass: 'text-warning',
        tintClass: 'bg-warning/10',
    },
];

const stats: Stat[] = [
    { value: '31+', label: 'Countries covered' },
    { value: '9', label: 'REST endpoints' },
    { value: '99.9%', label: 'Uptime SLA' },
    { value: '12K+', label: 'Active opportunities' },
];

const codeTabs: CodeTab[] = [
    {
        label: 'cURL',
        title: 'Fetch the public opportunity feed',
        code: `curl -X GET "${apiBaseUrl}/opportunities?limit=5" \\
  -H "Authorization: Bearer $EDUTU_API_KEY"`,
    },
    {
        label: 'JavaScript',
        title: 'Query opportunities from your app',
        code: `const res = await fetch(
  "${apiBaseUrl}/opportunities?category=scholarships&limit=12",
  { headers: { "x-edutu-api-key": process.env.EDUTU_API_KEY } },
);
const { data, meta } = await res.json();`,
    },
    {
        label: 'Python',
        title: 'Sync opportunities into your system',
        code: `import requests

url = "${apiBaseUrl}/opportunities"
headers = {"Authorization": f"Bearer {API_KEY}"}
params = {"sort": "updated_desc", "limit": 50}

response = requests.get(url, headers=headers, params=params)
data = response.json()`,
    },
];

const DevelopersLandingPage: React.FC = () => {
    const reduceMotion = useReducedMotion();
    const [activeCodeTab, setActiveCodeTab] = useState(0);
    const [copied, setCopied] = useState(false);
    const [openFaq, setOpenFaq] = useState(-1);

    const faqs = [
        { q: 'How do I get an API key?', a: 'Sign up for an Edutu account, go to the Developer Dashboard, and create a project. Each project gets a scoped API key you can rotate or revoke.' },
        { q: 'Is there a free tier?', a: 'Yes. New accounts receive free credits to test the API. Check the Developer Dashboard for current pricing and rate limits.' },
        { q: 'What data does the API cover?', a: 'Scholarships, fellowships, internships, grants, and programs from 31+ countries. Each record includes title, organization, deadline, location, eligibility, benefits, and application URL.' },
        { q: 'How often is the data refreshed?', a: 'The opportunity feed updates in real time as new content is ingested through the scraper pipeline and manual curation.' },
        { q: 'Can I use the API for commercial products?', a: 'Yes. The Edutu API is designed for integration into school portals, scholarship directories, career platforms, and community tools.' },
    ];

    const handleCopy = async () => {
        await navigator.clipboard.writeText(codeTabs[activeCodeTab].code);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
    };

    const fadeInView = reduceMotion
        ? {}
        : {
              initial: { opacity: 0, y: 16 },
              whileInView: { opacity: 1, y: 0 },
              viewport: { once: true, margin: '-40px' },
          };

    return (
        <div className="developers-landing min-h-[100dvh] bg-surface-body font-body text-text-primary">
            <PublicHeader fixed onPrimaryAction={() => window.location.href = '/auth?mode=sign-in'} />

            <main className="relative z-10">
                {/* Hero */}
                <section className="relative overflow-hidden px-4 sm:px-6 py-24 sm:py-32">
                    <div
                        className="pointer-events-none absolute inset-0"
                        style={{
                            background:
                                'radial-gradient(ellipse 70% 50% at 50% 20%, rgb(var(--color-brand-500) / 0.10), transparent 60%), radial-gradient(ellipse 40% 30% at 80% 60%, rgb(var(--color-brand-500) / 0.06), transparent 50%)',
                        }}
                    />
                    <div className="relative mx-auto max-w-[1200px]">
                        <motion.div
                            initial={reduceMotion ? undefined : { opacity: 0, y: 24 }}
                            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                            transition={{ duration: 0.5 }}
                            className="max-w-[720px]"
                        >
                            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/10 px-3 py-1 text-[12px] font-semibold uppercase tracking-[0.2em] text-brand">
                                <Code2 size={14} />
                                Developer API
                            </div>
                            <h1 className="mb-5 font-display text-[clamp(2.4rem,6vw,4.2rem)] font-semibold leading-[1.06] tracking-tight text-text-primary">
                                Build on the{' '}
                                <span className="text-brand">Edutu platform</span>
                            </h1>
                            <p className="mb-10 max-w-[580px] text-[18px] leading-[1.5] text-text-secondary">
                                A single API for scholarships, fellowships, internships, and global opportunities. Integrate real-time data, AI matching, and ingestion into your own products.
                            </p>
                            <div className="flex flex-col gap-3 sm:flex-row">
                                <Link
                                    to="/auth?mode=sign-up&redirect=/dashboard/developer"
                                    className="inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3 text-[15px] font-semibold text-white no-underline shadow-elevated transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-700 focus-visible:ring-2 focus-visible:ring-brand/40"
                                >
                                    Get API access <ArrowRight size={16} />
                                </Link>
                                <a
                                    href={docsUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 rounded-xl border border-strong bg-surface-layer px-6 py-3 text-[15px] font-semibold text-text-primary no-underline transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/50"
                                >
                                    <BookOpen size={16} />
                                    Documentation
                                </a>
                            </div>
                        </motion.div>

                        {/* Stats */}
                        <motion.div
                            initial={reduceMotion ? undefined : { opacity: 0, y: 20 }}
                            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: 0.2 }}
                            className="mt-20 grid grid-cols-2 gap-6 sm:mt-24 sm:grid-cols-4"
                        >
                            {stats.map((stat) => (
                                <div key={stat.label} className="text-center sm:text-left">
                                    <div className="font-display text-[28px] font-semibold tracking-tight text-brand sm:text-[34px]">
                                        {stat.value}
                                    </div>
                                    <div className="mt-1 text-[14px] text-text-secondary">
                                        {stat.label}
                                    </div>
                                </div>
                            ))}
                        </motion.div>
                    </div>
                </section>

                {/* Features */}
                <section className="border-t border-subtle px-4 py-20 sm:px-6 sm:py-24">
                    <div className="mx-auto max-w-[1200px]">
                        <div className="mb-14 max-w-[560px]">
                            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">Platform</span>
                            <h2 className="mb-4 mt-4 font-display text-[32px] font-semibold leading-[1.1] tracking-tight text-text-primary sm:text-[40px]">
                                Everything you need to build
                            </h2>
                            <p className="text-[17px] leading-[1.5] text-text-secondary">
                                From opportunity data to AI matching, the Edutu platform gives you the building blocks for any career-discovery product.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            {features.map((feature, index) => (
                                <motion.div
                                    key={feature.title}
                                    {...fadeInView}
                                    transition={{ duration: 0.4, delay: index * 0.06 }}
                                    className="group rounded-2xl border border-subtle bg-surface-layer p-6 shadow-soft transition-all duration-200 hover:-translate-y-1 hover:border-brand/40 hover:shadow-elevated sm:p-7"
                                >
                                    <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl ${feature.tintClass}`}>
                                        <feature.icon size={20} className={feature.accentClass} />
                                    </div>
                                    <h3 className="mb-2 font-display text-[18px] font-semibold text-text-primary">
                                        {feature.title}
                                    </h3>
                                    <p className="text-[15px] leading-[1.55] text-text-secondary">
                                        {feature.desc}
                                    </p>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Code Samples */}
                <section className="border-t border-subtle px-4 py-20 sm:px-6 sm:py-24">
                    <div className="mx-auto max-w-[1200px]">
                        <div className="mb-14 max-w-[560px]">
                            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">Quickstart</span>
                            <h2 className="mb-4 mt-4 font-display text-[32px] font-semibold leading-[1.1] tracking-tight text-text-primary sm:text-[40px]">
                                Ready-to-use code
                            </h2>
                            <p className="text-[17px] leading-[1.5] text-text-secondary">
                                Copy and paste. Every endpoint returns normalized data with stable schemas.
                            </p>
                        </div>

                        {/* Intentional dark code panel — fixed palette in light and dark */}
                        <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950 shadow-elevated">
                            <div className="flex items-center gap-0 border-b border-white/10">
                                {codeTabs.map((tab, i) => (
                                    <button
                                        key={tab.label}
                                        onClick={() => setActiveCodeTab(i)}
                                        className={`cursor-pointer border-b-2 px-5 py-3 text-[13px] font-medium transition-colors ${
                                            activeCodeTab === i
                                                ? 'border-brand bg-white/5 text-brand-300'
                                                : 'border-transparent text-slate-400 hover:text-slate-200'
                                        }`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                                <div className="ml-auto pr-3">
                                    <button
                                        onClick={handleCopy}
                                        className="cursor-pointer rounded-lg p-2 text-slate-400 transition-colors hover:text-slate-200"
                                        aria-label="Copy code"
                                    >
                                        {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                                    </button>
                                </div>
                            </div>
                            <div className="p-5 sm:p-6">
                                <p className="mb-3 text-[13px] font-medium text-slate-400">
                                    {codeTabs[activeCodeTab].title}
                                </p>
                                <pre className="overflow-x-auto font-mono text-[14px] leading-[1.6] text-slate-100">
                                    <code>{codeTabs[activeCodeTab].code}</code>
                                </pre>
                            </div>
                        </div>
                    </div>
                </section>

                {/* FAQ */}
                <section className="border-t border-subtle px-4 py-20 sm:px-6 sm:py-24">
                    <div className="mx-auto max-w-[800px]">
                        <div className="mb-14 max-w-[560px]">
                            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">FAQ</span>
                            <h2 className="mb-4 mt-4 font-display text-[32px] font-semibold leading-[1.1] tracking-tight text-text-primary sm:text-[40px]">
                                Frequently asked questions
                            </h2>
                        </div>

                        <div className="space-y-3">
                            {faqs.map((faq, i) => {
                                const isOpen = openFaq === i;
                                return (
                                    <div
                                        key={i}
                                        className={`overflow-hidden rounded-2xl border bg-surface-layer shadow-soft transition-colors ${isOpen ? 'border-brand' : 'border-subtle'}`}
                                    >
                                        <button
                                            onClick={() => setOpenFaq(isOpen ? -1 : i)}
                                            className="flex w-full cursor-pointer items-center justify-between px-6 py-5 text-left text-text-primary"
                                            aria-expanded={isOpen}
                                        >
                                            <span className="text-[16px] font-medium">{faq.q}</span>
                                            <motion.span
                                                animate={reduceMotion ? undefined : { rotate: isOpen ? 180 : 0 }}
                                                transition={{ duration: 0.2 }}
                                                className={`ml-4 shrink-0 ${isOpen ? 'text-brand' : 'text-text-muted'}`}
                                            >
                                                <ChevronDown size={18} />
                                            </motion.span>
                                        </button>
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: isOpen ? 'auto' : 0, opacity: isOpen ? 1 : 0 }}
                                            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                                            className="overflow-hidden"
                                        >
                                            <div className="px-6 pb-5 text-[15px] leading-[1.6] text-text-secondary">
                                                {faq.a}
                                            </div>
                                        </motion.div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </section>

                {/* CTA */}
                <section className="border-t border-subtle px-4 py-24 sm:px-6">
                    <div className="mx-auto max-w-[1200px]">
                        <motion.div
                            {...fadeInView}
                            transition={{ duration: 0.5 }}
                            className="relative overflow-hidden rounded-3xl border border-white/10 px-8 py-16 text-center sm:px-16 sm:py-20"
                            style={{ backgroundColor: '#07111f' }}
                        >
                            <div
                                className="absolute inset-0"
                                style={{
                                    background: 'radial-gradient(ellipse 80% 50% at 50% 50%, rgb(var(--color-brand-500) / 0.15), transparent 70%)',
                                }}
                            />
                            <div className="relative z-10">
                                <h2 className="mb-4 font-display text-[32px] font-semibold leading-[1.1] tracking-tight text-white sm:text-[40px]">
                                    Start building with Edutu
                                </h2>
                                <p className="mx-auto mb-8 max-w-[560px] text-[17px] leading-[1.5] text-white/70">
                                    Get your API key, explore the docs, and have your first integration running in minutes.
                                </p>
                                <div className="flex flex-col justify-center gap-3 sm:flex-row">
                                    <Link
                                        to="/auth?mode=sign-up&redirect=/dashboard/developer"
                                        className="inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3 text-[15px] font-semibold text-white no-underline shadow-elevated transition-transform duration-200 hover:scale-[1.02] hover:bg-brand-700"
                                    >
                                        Get API access <ArrowRight size={16} />
                                    </Link>
                                    <a
                                        href={docsUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-6 py-3 text-[15px] font-semibold text-white no-underline backdrop-blur transition-transform duration-200 hover:scale-[1.02]"
                                    >
                                        Read the docs
                                    </a>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </section>
            </main>

            {/* Footer */}
            <footer className="border-t border-subtle px-4 py-12 sm:px-6">
                <div className="mx-auto flex max-w-[1200px] flex-col items-center justify-between gap-4 sm:flex-row">
                    <div className="flex items-center gap-2">
                        <img src="/edutu-logo.png" alt="" className="h-7 w-7 object-contain" loading="lazy" decoding="async" />
                        <span className="text-[16px] font-semibold text-text-primary">
                            edutu
                        </span>
                    </div>
                    <div className="flex items-center gap-6 text-[13px] text-text-secondary">
                        <Link to="/about" className="transition-colors hover:text-brand">About</Link>
                        <a href={docsUrl} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-brand">Docs</a>
                        <Link to="/scholarship-engine" className="transition-colors hover:text-brand">Scholarship Engine</Link>
                    </div>
                    <span className="text-[12px] text-text-muted">
                        &copy; {new Date().getFullYear()} Edutu Inc.
                    </span>
                </div>
            </footer>
        </div>
    );
};

export default DevelopersLandingPage;
