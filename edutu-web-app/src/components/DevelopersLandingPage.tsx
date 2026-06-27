import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
    ArrowRight,
    BookOpen,
    CheckCircle,
    ChevronDown,
    Code2,
    Database,
    Layers3,
    ShieldCheck,
    Terminal,
    Workflow,
    Copy,
    Check,
    RefreshCw,
    type LucideIcon,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useDarkMode } from '../hooks/useDarkMode';
import PublicHeader from './PublicHeader';

const apiSpecUrl = import.meta.env.VITE_API_OPENAPI_URL || 'https://api.edutu.org/v1/openapi.json';
const docsUrl = import.meta.env.VITE_DOCS_URL || 'https://docs.edutu.org';

type Feature = {
    icon: LucideIcon;
    title: string;
    desc: string;
    accent: string;
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
        accent: '#146ef5',
    },
    {
        icon: Workflow,
        title: 'AI Matching Engine',
        desc: 'Ranked recommendations based on user profiles, goals, and historical patterns. Integrate intelligent matching into your own surfaces.',
        accent: '#146ef5',
    },
    {
        icon: RefreshCw,
        title: 'Scraper Pipeline',
        desc: 'Trigger ingestion workflows and sync fresh content from multiple sources. Keep your inventory current with a single API call.',
        accent: '#059669',
    },
    {
        icon: ShieldCheck,
        title: 'Billing & Auth',
        desc: 'Create projects, manage API keys with scoped permissions, and buy credits via Paystack. Full usage tracking included.',
        accent: '#d97706',
    },
];

const stats: Stat[] = [
    { value: '31+', label: 'Countries covered' },
    { value: '5', label: 'REST endpoints' },
    { value: '99.9%', label: 'Uptime SLA' },
    { value: '12K+', label: 'Active opportunities' },
];

const codeTabs: CodeTab[] = [
    {
        label: 'cURL',
        title: 'Fetch the public opportunity feed',
        code: `curl -X GET "https://api.edutu.org/v1/opportunities?status=active&limit=5" \\
  -H "Authorization: Bearer $EDUTU_API_KEY"`,
    },
    {
        label: 'JavaScript',
        title: 'Query opportunities from your app',
        code: `import { fetchOpportunities } from 'edutu-sdk';

const opportunities = await fetchOpportunities({
  status: 'active',
  category: 'Scholarships',
  limit: 12,
});`,
    },
    {
        label: 'Python',
        title: 'Sync opportunities into your system',
        code: `import requests

url = "https://api.edutu.org/v1/opportunities"
headers = {"Authorization": f"Bearer {API_KEY}"}
params = {"status": "active", "limit": 50}

response = requests.get(url, headers=headers, params=params)
data = response.json()`,
    },
];

const DevelopersLandingPage: React.FC = () => {
    const { isDarkMode } = useDarkMode();
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

    return (
        <div className={`developers-landing min-h-[100dvh] ${isDarkMode ? 'dark' : ''}`}
            style={{ backgroundColor: isDarkMode ? '#080808' : '#ffffff', color: isDarkMode ? '#f5f5f5' : '#080808' }}
        >
            <PublicHeader fixed onPrimaryAction={() => window.location.href = '/auth?mode=sign-in'} />

            <main className="relative z-10">
                {/* Hero */}
                <section className="relative overflow-hidden px-4 sm:px-6 py-24 sm:py-32">
                    <div className="absolute inset-0"
                        style={{
                            background: isDarkMode
                                ? 'radial-gradient(ellipse 70% 50% at 50% 20%, rgba(20,110,245,0.10), transparent 60%), radial-gradient(ellipse 40% 30% at 80% 60%, rgba(20,110,245,0.06), transparent 50%)'
                                : 'radial-gradient(ellipse 70% 50% at 50% 20%, rgba(20,110,245,0.04), transparent 60%)'
                        }}
                    />
                    <div className="relative mx-auto max-w-[1200px]">
                        <motion.div
                            initial={{ opacity: 0, y: 24 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5 }}
                            className="max-w-[720px]"
                        >
                            <div className="inline-flex items-center gap-2 px-3 py-1 mb-6 rounded-full text-[12px] font-medium tracking-wide"
                                style={{
                                    backgroundColor: isDarkMode ? 'rgba(20,110,245,0.12)' : 'rgba(20,110,245,0.08)',
                                    color: '#146ef5',
                                    border: `1px solid ${isDarkMode ? 'rgba(20,110,245,0.2)' : 'rgba(20,110,245,0.15)'}`,
                                }}
                            >
                                <Code2 size={14} />
                                Developer API
                            </div>
                            <h1 className="text-[clamp(2.4rem,6vw,4.2rem)] font-semibold leading-[1.06] tracking-[-0.8px] mb-5"
                                style={{ color: isDarkMode ? '#ffffff' : '#080808' }}
                            >
                                Build on the{' '}
                                <span className="text-[#146ef5]">Edutu platform</span>
                            </h1>
                            <p className="text-[18px] leading-[1.5] max-w-[580px] mb-10"
                                style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}
                            >
                                A single API for scholarships, fellowships, internships, and global opportunities. Integrate real-time data, AI matching, and ingestion into your own products.
                            </p>
                            <div className="flex flex-col sm:flex-row gap-3">
                                <Link
                                    to="/auth?mode=sign-up&redirect=/dashboard/developer"
                                    className="inline-flex items-center gap-2 px-6 py-3 text-[15px] font-semibold rounded-lg no-underline transition-all duration-200 hover:scale-[1.02]"
                                    style={{
                                        backgroundColor: '#146ef5',
                                        color: '#ffffff',
                                    }}
                                >
                                    Get API access <ArrowRight size={16} />
                                </Link>
                                <a
                                    href={docsUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 px-6 py-3 text-[15px] font-semibold rounded-lg no-underline transition-all duration-200 hover:scale-[1.02]"
                                    style={{
                                        backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#f5f5f5',
                                        color: isDarkMode ? '#f5f5f5' : '#080808',
                                        border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.12)' : '#d8d8d8'}`,
                                    }}
                                >
                                    <BookOpen size={16} />
                                    Documentation
                                </a>
                            </div>
                        </motion.div>

                        {/* Stats */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: 0.2 }}
                            className="grid grid-cols-2 sm:grid-cols-4 gap-6 mt-20 sm:mt-24"
                        >
                            {stats.map((stat) => (
                                <div key={stat.label} className="text-center sm:text-left">
                                    <div className="text-[28px] sm:text-[34px] font-semibold tracking-tight text-[#146ef5]">
                                        {stat.value}
                                    </div>
                                    <div className="text-[14px] mt-1" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                                        {stat.label}
                                    </div>
                                </div>
                            ))}
                        </motion.div>
                    </div>
                </section>

                {/* Features */}
                <section className="py-20 sm:py-24 px-4 sm:px-6"
                    style={{ borderTop: `1px solid ${isDarkMode ? '#222' : '#e8e8e8'}` }}
                >
                    <div className="max-w-[1200px] mx-auto">
                        <div className="max-w-[560px] mb-14">
                            <h2 className="text-[32px] sm:text-[40px] font-semibold leading-[1.1] tracking-[-0.4px] mb-4"
                                style={{ color: isDarkMode ? '#ffffff' : '#080808' }}
                            >
                                Everything you need to build
                            </h2>
                            <p className="text-[17px] leading-[1.5]" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                                From opportunity data to AI matching, the Edutu platform gives you the building blocks for any career-discovery product.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {features.map((feature, index) => (
                                <motion.div
                                    key={feature.title}
                                    initial={{ opacity: 0, y: 16 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true, margin: '-40px' }}
                                    transition={{ duration: 0.4, delay: index * 0.06 }}
                                    className="p-6 sm:p-7 rounded-2xl transition-all duration-200"
                                    style={{
                                        backgroundColor: isDarkMode ? 'rgba(255,255,255,0.03)' : '#fafbfc',
                                        border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.07)' : '#e8ecf0'}`,
                                    }}
                                >
                                    <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
                                        style={{ backgroundColor: `${feature.accent}15`, color: feature.accent }}
                                    >
                                        <feature.icon size={20} />
                                    </div>
                                    <h3 className="text-[18px] font-semibold mb-2" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                                        {feature.title}
                                    </h3>
                                    <p className="text-[15px] leading-[1.55]" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                                        {feature.desc}
                                    </p>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Code Samples */}
                <section className="py-20 sm:py-24 px-4 sm:px-6"
                    style={{ borderTop: `1px solid ${isDarkMode ? '#222' : '#e8e8e8'}` }}
                >
                    <div className="max-w-[1200px] mx-auto">
                        <div className="max-w-[560px] mb-14">
                            <h2 className="text-[32px] sm:text-[40px] font-semibold leading-[1.1] tracking-[-0.4px] mb-4"
                                style={{ color: isDarkMode ? '#ffffff' : '#080808' }}
                            >
                                Ready-to-use code
                            </h2>
                            <p className="text-[17px] leading-[1.5]" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                                Copy and paste. Every endpoint returns normalized data with stable schemas.
                            </p>
                        </div>

                        <div className="rounded-2xl overflow-hidden"
                            style={{
                                backgroundColor: isDarkMode ? '#0d0d0d' : '#f5f5f5',
                                border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.08)' : '#e0e0e0'}`,
                            }}
                        >
                            <div className="flex items-center gap-0 border-b"
                                style={{ borderColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#e0e0e0' }}
                            >
                                {codeTabs.map((tab, i) => (
                                    <button
                                        key={tab.label}
                                        onClick={() => setActiveCodeTab(i)}
                                        className="px-5 py-3 text-[13px] font-medium transition-colors cursor-pointer"
                                        style={{
                                            backgroundColor: activeCodeTab === i
                                                ? (isDarkMode ? 'rgba(255,255,255,0.04)' : '#ffffff')
                                                : 'transparent',
                                            color: activeCodeTab === i
                                                ? '#146ef5'
                                                : (isDarkMode ? '#ababab' : '#5a5a5a'),
                                            borderBottom: activeCodeTab === i ? '2px solid #146ef5' : '2px solid transparent',
                                        }}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                                <div className="ml-auto pr-3">
                                    <button
                                        onClick={handleCopy}
                                        className="p-2 rounded-lg transition-colors cursor-pointer"
                                        style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}
                                        aria-label="Copy code"
                                    >
                                        {copied ? <Check size={16} style={{ color: '#059669' }} /> : <Copy size={16} />}
                                    </button>
                                </div>
                            </div>
                            <div className="p-5 sm:p-6">
                                <p className="text-[13px] font-medium mb-3" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                                    {codeTabs[activeCodeTab].title}
                                </p>
                                <pre className="text-[14px] leading-[1.6] overflow-x-auto font-mono"
                                    style={{ color: isDarkMode ? '#e0e0e0' : '#1a1a1a' }}
                                >
                                    <code>{codeTabs[activeCodeTab].code}</code>
                                </pre>
                            </div>
                        </div>
                    </div>
                </section>

                {/* FAQ */}
                <section className="py-20 sm:py-24 px-4 sm:px-6"
                    style={{ borderTop: `1px solid ${isDarkMode ? '#222' : '#e8e8e8'}` }}
                >
                    <div className="max-w-[800px] mx-auto">
                        <div className="max-w-[560px] mb-14">
                            <h2 className="text-[32px] sm:text-[40px] font-semibold leading-[1.1] tracking-[-0.4px] mb-4"
                                style={{ color: isDarkMode ? '#ffffff' : '#080808' }}
                            >
                                Frequently asked questions
                            </h2>
                        </div>

                        <div className="space-y-3">
                            {faqs.map((faq, i) => (
                                <div key={i}
                                    className="rounded-2xl overflow-hidden transition-all duration-200"
                                    style={{
                                        backgroundColor: isDarkMode ? 'rgba(255,255,255,0.03)' : '#fafbfc',
                                        border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.07)' : '#e8ecf0'}`,
                                    }}
                                >
                                    <button
                                        onClick={() => setOpenFaq(openFaq === i ? -1 : i)}
                                        className="w-full flex items-center justify-between px-6 py-5 text-left cursor-pointer"
                                        style={{ color: isDarkMode ? '#ffffff' : '#080808' }}
                                    >
                                        <span className="text-[16px] font-medium">{faq.q}</span>
                                        <motion.span
                                            animate={{ rotate: openFaq === i ? 180 : 0 }}
                                            transition={{ duration: 0.2 }}
                                            className="shrink-0 ml-4"
                                            style={{ color: '#146ef5' }}
                                        >
                                            <ChevronDown size={18} />
                                        </motion.span>
                                    </button>
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: openFaq === i ? 'auto' : 0, opacity: openFaq === i ? 1 : 0 }}
                                        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                                        className="overflow-hidden"
                                    >
                                        <div className="px-6 pb-5 text-[15px] leading-[1.6]"
                                            style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}
                                        >
                                            {faq.a}
                                        </div>
                                    </motion.div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* CTA */}
                <section className="py-24 px-4 sm:px-6"
                    style={{ borderTop: `1px solid ${isDarkMode ? '#222' : '#e8e8e8'}` }}
                >
                    <div className="max-w-[1200px] mx-auto">
                        <motion.div
                            initial={{ opacity: 0, y: 16 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5 }}
                            className="relative overflow-hidden rounded-3xl px-8 py-16 sm:px-16 sm:py-20 text-center"
                            style={{
                                backgroundColor: '#07111f',
                                border: '1px solid rgba(255,255,255,0.10)',
                            }}
                        >
                            <div className="absolute inset-0"
                                style={{
                                    background: 'radial-gradient(ellipse 80% 50% at 50% 50%, rgba(20,110,245,0.15), transparent 70%)',
                                }}
                            />
                            <div className="relative z-10">
                                <h2 className="text-[32px] sm:text-[40px] font-semibold leading-[1.1] tracking-[-0.4px] mb-4 text-white">
                                    Start building with Edutu
                                </h2>
                                <p className="text-[17px] leading-[1.5] max-w-[560px] mx-auto mb-8"
                                    style={{ color: 'rgba(255,255,255,0.7)' }}
                                >
                                    Get your API key, explore the docs, and have your first integration running in minutes.
                                </p>
                                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                                    <Link
                                        to="/auth?mode=sign-up&redirect=/dashboard/developer"
                                        className="inline-flex items-center gap-2 px-6 py-3 text-[15px] font-semibold rounded-lg no-underline transition-all duration-200 hover:scale-[1.02]"
                                        style={{ backgroundColor: '#146ef5', color: '#ffffff' }}
                                    >
                                        Get API access <ArrowRight size={16} />
                                    </Link>
                                    <a
                                        href={docsUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 px-6 py-3 text-[15px] font-semibold rounded-lg no-underline transition-all duration-200 hover:scale-[1.02]"
                                        style={{
                                            backgroundColor: 'rgba(255,255,255,0.06)',
                                            color: '#ffffff',
                                            border: '1px solid rgba(255,255,255,0.15)',
                                        }}
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
            <footer className="py-12 px-4 sm:px-6"
                style={{ borderTop: `1px solid ${isDarkMode ? '#222' : '#e8e8e8'}` }}
            >
                <div className="max-w-[1200px] mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-2">
                        <img src="/edutu-logo.png" alt="" className="h-7 w-7 object-contain" />
                        <span className="font-semibold text-[16px]" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                            edutu
                        </span>
                    </div>
                    <div className="flex items-center gap-6 text-[13px]" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                        <Link to="/about" className="hover:text-[#146ef5] transition-colors">About</Link>
                        <a href={docsUrl} target="_blank" rel="noopener noreferrer" className="hover:text-[#146ef5] transition-colors">Docs</a>
                        <Link to="/scholarship-engine" className="hover:text-[#146ef5] transition-colors">Scholarship Engine</Link>
                    </div>
                    <span className="text-[12px]" style={{ color: isDarkMode ? '#5a5a5a' : '#ababab' }}>
                        &copy; {new Date().getFullYear()} Edutu Inc.
                    </span>
                </div>
            </footer>
        </div>
    );
};

export default DevelopersLandingPage;
