import React from 'react';
import { Link } from 'react-router-dom';
import {
    ArrowRight,
    BookOpen,
    CheckCircle,
    Code2,
    Database,
    Globe,
    Layers3,
    RefreshCw,
    Server,
    ShieldCheck,
    Smartphone,
    Terminal,
    Workflow,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useDarkMode } from '../hooks/useDarkMode';
import PublicSiteMenu from './PublicSiteMenu';

type CardItem = {
    icon: React.ComponentType<{ size?: number }>;
    title: string;
    description: string;
    accent: string;
};

const apiCards: CardItem[] = [
    {
        icon: Database,
        title: 'Public opportunity feed',
        description: 'Use `GET /opportunities` to power listings, search pages, and homepage sections. The client helper falls back to a local snapshot if the backend is unavailable.',
        accent: '#146ef5',
    },
    {
        icon: Code2,
        title: 'Opportunity detail endpoint',
        description: 'Use `GET /opportunities/:id` for deep links, share pages, and detail views across web and mobile.',
        accent: '#7a3dff',
    },
    {
        icon: RefreshCw,
        title: 'Admin sync pipeline',
        description: 'Scraper output and manual admin edits converge through the same opportunity inventory and cache refresh flow.',
        accent: '#00b86b',
    },
    {
        icon: Smartphone,
        title: 'Mobile-first contract',
        description: 'The Expo app reads the same backend feed, so your scholarship data stays aligned across devices.',
        accent: '#ffae13',
    },
];

const envCards: CardItem[] = [
    {
        icon: Terminal,
        title: 'Web app',
        description: '`VITE_BACKEND_URL` or `VITE_API_URL` points the public app at the opportunity backend. In local development, the helper uses the local API automatically.',
        accent: '#146ef5',
    },
    {
        icon: Smartphone,
        title: 'Mobile app',
        description: '`EXPO_PUBLIC_API_URL` keeps the Expo client on the same feed while `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` and Supabase vars handle auth.',
        accent: '#7a3dff',
    },
    {
        icon: Server,
        title: 'Admin panel',
        description: '`VITE_API_URL`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY` keep the admin workflow connected to the same source of truth.',
        accent: '#00b86b',
    },
];

const quickSteps = [
    {
        step: '01',
        title: 'Fetch the feed',
        description: 'Call `fetchOpportunities()` from `src/services/opportunities.ts` to load live opportunities by status, category, or limit.',
    },
    {
        step: '02',
        title: 'Render the contract',
        description: 'Map the normalized `Opportunity` shape directly into cards, detail pages, bookmarks, and roadmap entry points.',
    },
    {
        step: '03',
        title: 'Sync updates',
        description: 'Keep admin and scraper data fresh through the webhook pipeline handled by `processN8nWebhook()` and the manual admin helpers.',
    },
];

const codeBlocks = [
    {
        label: 'Web',
        title: 'Load the public opportunity feed',
        snippet: `import { fetchOpportunities } from '../services/opportunities';

const opportunities = await fetchOpportunities({
  status: 'active',
  limit: 12,
  category: 'Scholarships',
});

const featured = opportunities.slice(0, 3);`,
    },
    {
        label: 'Mobile',
        title: 'Use the same backend URL inside Expo',
        snippet: `const apiUrl =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3010';

const response = await fetch(\`\${apiUrl}/opportunities?status=active\`);
const opportunities = await response.json();`,
    },
    {
        label: 'Admin',
        title: 'Keep the inventory in sync',
        snippet: `await processN8nWebhook({
  action: 'bulk_sync',
  source: 'scraper',
  timestamp: new Date().toISOString(),
  opportunities: payload,
});`,
    },
];

const opportunityFields = [
    'id',
    'title',
    'organization',
    'category',
    'deadline',
    'location',
    'description',
    'requirements',
    'benefits',
    'applicationProcess',
    'image',
    'match',
    'difficulty',
];

const DeveloperDocsPage: React.FC = () => {
    const { isDarkMode } = useDarkMode();

    return (
        <div
            className="min-h-[100dvh] overflow-x-hidden"
            style={{ backgroundColor: isDarkMode ? '#080808' : '#ffffff', color: isDarkMode ? '#f5f5f5' : '#080808', fontFamily: "'Inter', 'Arial', sans-serif" }}
        >
            <header
                className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md transition-colors duration-300"
                style={{ backgroundColor: isDarkMode ? 'rgba(8, 8, 8, 0.95)' : 'rgba(255, 255, 255, 0.95)', borderBottom: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}` }}
            >
                <div className="max-w-[1200px] mx-auto px-4 sm:px-6 h-[64px] flex items-center justify-between">
                    <Link to="/" className="flex items-center gap-2" style={{ textDecoration: 'none' }}>
                        <img src="/edutu-logo.png" alt="Edutu" className="h-8 w-8 object-contain" />
                        <span className="font-bold text-xl tracking-tight" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                            edutu
                        </span>
                    </Link>

                    <PublicSiteMenu />
                </div>
            </header>

            <main className="pt-[120px] pb-[96px] px-4 sm:px-6">
                <div className="max-w-[1200px] mx-auto">
                    <motion.section
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                        className="text-center mb-16"
                    >
                        <div
                            className="inline-flex items-center gap-2 px-4 py-2 mb-8 rounded"
                            style={{
                                backgroundColor: '#146ef510',
                                border: '1px solid rgba(20,110,245,0.2)',
                                borderRadius: '4px',
                            }}
                        >
                            <BookOpen size={14} style={{ color: '#146ef5' }} />
                            <span className="text-[12px] font-semibold tracking-[1.5px]" style={{ color: '#146ef5' }}>
                                DEVELOPER DOCS
                            </span>
                        </div>

                        <h1 className="text-[48px] sm:text-[64px] md:text-[72px] font-semibold leading-[1.05] tracking-[-0.8px] mb-6" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                            Integrate Edutu into your product stack.
                        </h1>

                        <p className="max-w-[820px] mx-auto text-[18px] leading-[1.65]" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                            This guide shows how the public opportunity feed, the mobile client, and the admin ingestion pipeline fit together. The same scholarship data contract powers every surface in the platform.
                        </p>
                    </motion.section>

                    <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-16">
                        {envCards.map((card, index) => (
                            <motion.article
                                key={card.title}
                                initial={{ opacity: 0, y: 16 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.45, delay: index * 0.08 }}
                                className="p-6 rounded-[24px]"
                                style={{
                                    backgroundColor: isDarkMode ? '#111' : '#ffffff',
                                    border: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}`,
                                    boxShadow: '0 13px 13px rgba(0,0,0,0.04)',
                                }}
                            >
                                <div className="h-11 w-11 rounded-2xl flex items-center justify-center mb-6" style={{ backgroundColor: `${card.accent}15`, color: card.accent }}>
                                    <card.icon size={20} />
                                </div>
                                <h2 className="text-[20px] font-semibold mb-3" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                                    {card.title}
                                </h2>
                                <p className="text-[15px] leading-[1.65]" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                                    {card.description}
                                </p>
                            </motion.article>
                        ))}
                    </section>

                    <section className="mb-16">
                        <div className="max-w-[820px] mb-8">
                            <span className="text-[12px] font-semibold tracking-[1.5px]" style={{ color: '#146ef5' }}>
                                API SURFACE
                            </span>
                            <h2 className="text-[32px] md:text-[40px] font-semibold leading-[1.08] mt-4 mb-4" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                                The same opportunity contract powers the public app, mobile, and admin tooling.
                            </h2>
                            <p className="text-[15px] leading-[1.7]" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                                Build against the backend first, then let each client read the same normalized data. That keeps scholarship pages, mobile views, and admin workflows synchronized without extra mapping layers.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {apiCards.map((card, index) => (
                                <motion.article
                                    key={card.title}
                                    initial={{ opacity: 0, y: 16 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ duration: 0.45, delay: index * 0.08 }}
                                    className="p-6 rounded-[24px]"
                                    style={{
                                        backgroundColor: isDarkMode ? '#111' : '#ffffff',
                                        border: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}`,
                                        boxShadow: '0 13px 13px rgba(0,0,0,0.04)',
                                    }}
                                >
                                    <div className="flex items-start gap-4">
                                        <div className="h-11 w-11 shrink-0 rounded-2xl flex items-center justify-center" style={{ backgroundColor: `${card.accent}15`, color: card.accent }}>
                                            <card.icon size={20} />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[11px] font-bold tracking-[0.18em] uppercase mb-2" style={{ color: card.accent }}>
                                                {card.title}
                                            </p>
                                            <p className="text-[15px] leading-[1.65] mb-4" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                                                {card.description}
                                            </p>
                                            <div className="rounded-[18px] px-4 py-3" style={{ backgroundColor: isDarkMode ? '#0a0a0a' : '#f8fbff', border: `1px solid ${isDarkMode ? '#1f1f1f' : '#e5eef9'}` }}>
                                                <div className="flex items-center gap-2 text-[12px] font-semibold" style={{ color: isDarkMode ? '#f5f5f5' : '#0f172a' }}>
                                                    <Terminal size={14} />
                                                    <span>{card.accent === '#00b86b' ? 'Sync flow' : 'Endpoint'}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </motion.article>
                            ))}
                        </div>
                    </section>

                    <section className="grid grid-cols-1 lg:grid-cols-[0.95fr_1.05fr] gap-6 mb-16">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5 }}
                            className="p-8 rounded-[28px]"
                            style={{
                                backgroundColor: isDarkMode ? '#111' : '#fafafa',
                                border: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}`,
                            }}
                        >
                            <div className="flex items-center gap-2 mb-4 text-[#146ef5]">
                                <Layers3 size={18} />
                                <span className="text-[11px] font-bold tracking-[0.18em] uppercase">Quick start</span>
                            </div>
                            <h2 className="text-[30px] font-semibold mb-4" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                                Build once, consume everywhere.
                            </h2>
                            <p className="text-[15px] leading-[1.7] mb-6" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                                The public web app, Expo mobile app, and admin workflows all depend on the same normalized opportunity contract. That keeps your components simple and your data consistent.
                            </p>

                            <div className="space-y-4">
                                {quickSteps.map((item) => (
                                    <div
                                        key={item.step}
                                        className="flex gap-4 p-4 rounded-[20px]"
                                        style={{
                                            backgroundColor: isDarkMode ? '#0a0a0a' : '#ffffff',
                                            border: `1px solid ${isDarkMode ? '#1f1f1f' : '#e5eef9'}`,
                                        }}
                                    >
                                        <div className="h-12 w-12 shrink-0 rounded-2xl flex items-center justify-center font-bold text-[14px]" style={{ backgroundColor: '#146ef510', color: '#146ef5' }}>
                                            {item.step}
                                        </div>
                                        <div>
                                            <h3 className="text-[16px] font-semibold mb-1" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                                                {item.title}
                                            </h3>
                                            <p className="text-[14px] leading-[1.65]" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                                                {item.description}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, delay: 0.1 }}
                            className="p-8 rounded-[28px]"
                            style={{
                                backgroundColor: isDarkMode ? '#111' : '#ffffff',
                                border: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}`,
                            }}
                        >
                            <div className="flex items-center gap-2 mb-4 text-[#146ef5]">
                                <Code2 size={18} />
                                <span className="text-[11px] font-bold tracking-[0.18em] uppercase">Code samples</span>
                            </div>
                            <h2 className="text-[30px] font-semibold mb-4" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                                Ready-to-drop snippets for web, mobile, and admin.
                            </h2>

                            <div className="grid grid-cols-1 gap-4">
                                {codeBlocks.map((block) => (
                                    <div
                                        key={block.label}
                                        className="rounded-[24px] p-5"
                                        style={{
                                            backgroundColor: isDarkMode ? '#0a0a0a' : '#f8fbff',
                                            border: `1px solid ${isDarkMode ? '#1f1f1f' : '#e5eef9'}`,
                                        }}
                                    >
                                        <div className="flex items-center gap-2 mb-3 text-[#146ef5]">
                                            <ShieldCheck size={14} />
                                            <span className="text-[11px] font-bold tracking-[0.18em] uppercase">{block.label}</span>
                                        </div>
                                        <h3 className="text-[18px] font-semibold mb-3" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                                            {block.title}
                                        </h3>
                                        <pre
                                            className="overflow-x-auto rounded-[18px] p-4 text-[12px] leading-[1.6] whitespace-pre-wrap"
                                            style={{
                                                backgroundColor: isDarkMode ? '#050505' : '#ffffff',
                                                border: `1px solid ${isDarkMode ? '#1a1a1a' : '#dfe9f4'}`,
                                                color: isDarkMode ? '#d8d8d8' : '#1e293b',
                                            }}
                                        >
{block.snippet}
                                        </pre>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    </section>

                    <section className="grid grid-cols-1 lg:grid-cols-[1fr_0.9fr] gap-6 mb-16">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5 }}
                            className="p-8 rounded-[28px]"
                            style={{
                                backgroundColor: isDarkMode ? '#111' : '#ffffff',
                                border: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}`,
                            }}
                        >
                            <div className="flex items-center gap-2 mb-4 text-[#146ef5]">
                                <Database size={18} />
                                <span className="text-[11px] font-bold tracking-[0.18em] uppercase">Opportunity schema</span>
                            </div>
                            <h2 className="text-[30px] font-semibold mb-4" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                                The feed is normalized for predictable rendering.
                            </h2>
                            <p className="text-[15px] leading-[1.7] mb-6" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                                Each opportunity carries the same core fields, so cards, detail pages, bookmarks, and roadmap builders can all render from one contract.
                            </p>

                            <div className="flex flex-wrap gap-2">
                                {opportunityFields.map((field) => (
                                    <span
                                        key={field}
                                        className="rounded-full px-3 py-1 text-[12px] font-medium"
                                        style={{
                                            backgroundColor: isDarkMode ? '#0a0a0a' : '#f8fbff',
                                            color: isDarkMode ? '#d8d8d8' : '#334155',
                                            border: `1px solid ${isDarkMode ? '#1f1f1f' : '#e5eef9'}`,
                                        }}
                                    >
                                        {field}
                                    </span>
                                ))}
                            </div>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, delay: 0.1 }}
                            className="p-8 rounded-[28px]"
                            style={{
                                backgroundColor: isDarkMode ? '#111' : '#fafafa',
                                border: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}`,
                            }}
                        >
                            <div className="flex items-center gap-2 mb-4 text-[#146ef5]">
                                <Workflow size={18} />
                                <span className="text-[11px] font-bold tracking-[0.18em] uppercase">Integration flow</span>
                            </div>
                            <h2 className="text-[30px] font-semibold mb-4" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                                One pipeline from source to screen.
                            </h2>
                            <div className="space-y-4">
                                {[
                                    { icon: Globe, title: 'Public web', text: 'The public site reads through `fetchOpportunities()` and `getOpportunity()` from the backend feed.' },
                                    { icon: Smartphone, title: 'Mobile app', text: 'The Expo client uses the same API base URL so scholarship cards and detail pages stay in sync.' },
                                    { icon: Server, title: 'Admin panel', text: 'n8n imports and manual admin edits update the canonical feed, then clear the cache.' },
                                ].map((item) => (
                                    <div
                                        key={item.title}
                                        className="flex gap-4 p-4 rounded-[20px]"
                                        style={{
                                            backgroundColor: isDarkMode ? '#0a0a0a' : '#ffffff',
                                            border: `1px solid ${isDarkMode ? '#1f1f1f' : '#e5eef9'}`,
                                        }}
                                    >
                                        <div className="h-11 w-11 shrink-0 rounded-2xl flex items-center justify-center" style={{ backgroundColor: '#146ef510', color: '#146ef5' }}>
                                            <item.icon size={18} />
                                        </div>
                                        <div>
                                            <h3 className="text-[16px] font-semibold mb-1" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                                                {item.title}
                                            </h3>
                                            <p className="text-[14px] leading-[1.65]" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                                                {item.text}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    </section>

                    <section className="py-4">
                        <div
                            className="rounded-[32px] p-8 md:p-12"
                            style={{
                                background: isDarkMode ? 'linear-gradient(135deg, #111, #0a0a0a)' : 'linear-gradient(135deg, #f8fbff, #ffffff)',
                                border: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}`,
                            }}
                        >
                            <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-10 items-center">
                                <div>
                                    <div className="flex items-center gap-2 mb-4 text-[#146ef5]">
                                        <ShieldCheck size={18} />
                                        <span className="text-[11px] font-bold tracking-[0.18em] uppercase">Need help</span>
                                    </div>
                                    <h2 className="text-[32px] md:text-[40px] font-semibold leading-[1.08] mb-4" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                                        Build with Edutu, then move faster with the same opportunity engine.
                                    </h2>
                                    <p className="text-[15px] leading-[1.7] mb-8" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                                        If you are wiring Edutu into a product, school portal, or community platform, the public feed, mobile client, and admin console are all designed around the same opportunity model.
                                    </p>

                                    <div className="flex flex-wrap gap-3">
                                        <Link
                                            to="/scholarship-api"
                                            className="inline-flex items-center gap-2 rounded px-5 py-3 text-sm font-semibold no-underline"
                                            style={{ backgroundColor: '#146ef5', color: '#ffffff' }}
                                        >
                                            Open Scholarship API <ArrowRight size={16} />
                                        </Link>
                                        <Link
                                            to="/opportunities"
                                            className="inline-flex items-center gap-2 rounded px-5 py-3 text-sm font-semibold no-underline"
                                            style={{
                                                backgroundColor: 'transparent',
                                                color: isDarkMode ? '#f5f5f5' : '#080808',
                                                border: `1px solid ${isDarkMode ? '#363636' : '#d8d8d8'}`,
                                            }}
                                        >
                                            Browse opportunities
                                        </Link>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 gap-4">
                                    <div
                                        className="p-5 rounded-[24px]"
                                        style={{
                                            backgroundColor: isDarkMode ? '#111' : '#ffffff',
                                            border: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}`,
                                        }}
                                    >
                                        <div className="flex items-center gap-2 mb-3 text-[#146ef5]">
                                            <BookOpen size={16} />
                                            <span className="text-[11px] font-bold tracking-[0.18em] uppercase">Key files</span>
                                        </div>
                                        <p className="text-[14px] leading-[1.65]" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                                            `src/services/opportunities.ts`, `src/services/admin/opportunitiesWebhook.ts`, and `src/types/opportunity.ts` define the exact contract behind the public feed and the admin sync pipeline.
                                        </p>
                                    </div>
                                    <div
                                        className="p-5 rounded-[24px]"
                                        style={{
                                            backgroundColor: isDarkMode ? '#111' : '#ffffff',
                                            border: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}`,
                                        }}
                                    >
                                        <div className="flex items-center gap-2 mb-3 text-[#146ef5]">
                                            <CheckCircle size={16} />
                                            <span className="text-[11px] font-bold tracking-[0.18em] uppercase">What to expect</span>
                                        </div>
                                        <p className="text-[14px] leading-[1.65]" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                                            Consistent field names, simple list rendering, and a fallback snapshot make the integration resilient even when the live backend is unavailable.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
            </main>
        </div>
    );
};

export default DeveloperDocsPage;
