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
    Smartphone
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useDarkMode } from '../hooks/useDarkMode';
import PublicSiteMenu from './PublicSiteMenu';

const endpointCards = [
    {
        icon: Database,
        title: 'Opportunity feed',
        route: 'GET /opportunities',
        description: 'Fetch active opportunities with pagination, category filters, and cached fallback support.',
        example: 'GET /opportunities?status=active&limit=24&category=Scholarships',
    },
    {
        icon: Code2,
        title: 'Opportunity detail',
        route: 'GET /opportunities/:id',
        description: 'Load the canonical record for share pages, roadmap handoffs, and deep links.',
        example: 'GET /opportunities/opp_123',
    },
    {
        icon: RefreshCw,
        title: 'Ingestion pipeline',
        route: 'n8n -> Supabase -> cache refresh',
        description: 'Admin syncs, scraper payloads, and manual edits all converge into the same opportunity inventory.',
        example: 'processN8nWebhook(payload) + clearOpportunitiesCache()',
    },
];

const fieldGroups = [
    {
        title: 'Identity',
        fields: ['id', 'title', 'organization', 'category', 'externalId'],
    },
    {
        title: 'Discovery',
        fields: ['deadline', 'location', 'image', 'match', 'difficulty', 'tags'],
    },
    {
        title: 'Application',
        fields: ['description', 'requirements', 'benefits', 'applicationProcess', 'applyUrl'],
    },
    {
        title: 'Analytics',
        fields: ['source', 'createdAt', 'createdBy', 'viewCount', 'applyCount', 'bookmarkCount'],
    },
];

const codeSample = `import { fetchOpportunities } from '../services/opportunities';

const opportunities = await fetchOpportunities({
  status: 'active',
  limit: 24,
  category: 'Scholarships',
});

console.log(opportunities[0]?.title);`;

const ScholarshipApiPage: React.FC = () => {
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
                            <Database size={14} style={{ color: '#146ef5' }} />
                            <span className="text-[12px] font-semibold tracking-[1.5px]" style={{ color: '#146ef5' }}>
                                SCHOLARSHIP API
                            </span>
                        </div>

                        <h1 className="text-[48px] sm:text-[64px] md:text-[72px] font-semibold leading-[1.04] tracking-[-0.8px] mb-6" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                            One feed for scholarships, fellowships, internships, and programs.
                        </h1>

                        <p className="max-w-[760px] mx-auto text-[18px] leading-[1.6]" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                            Edutu’s opportunity layer pulls the public feed from the backend first, falls back to a static snapshot when needed, and keeps the same data shape across web, mobile, and admin experiences.
                        </p>
                    </motion.section>

                    <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-16">
                        {endpointCards.map((card, index) => (
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
                                <div className="h-11 w-11 rounded-2xl flex items-center justify-center mb-6" style={{ backgroundColor: '#146ef510', color: '#146ef5' }}>
                                    <card.icon size={20} />
                                </div>
                                <p className="text-[11px] font-bold tracking-[0.18em] uppercase mb-3" style={{ color: '#146ef5' }}>
                                    {card.route}
                                </p>
                                <h2 className="text-[24px] font-semibold mb-3" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                                    {card.title}
                                </h2>
                                <p className="text-[15px] leading-[1.6] mb-5" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                                    {card.description}
                                </p>
                                <div className="rounded-2xl p-4" style={{ backgroundColor: isDarkMode ? '#0a0a0a' : '#f8fbff', border: `1px solid ${isDarkMode ? '#1f1f1f' : '#e5eef9'}` }}>
                                    <div className="flex items-center gap-2 text-[12px] font-semibold mb-2" style={{ color: isDarkMode ? '#f5f5f5' : '#0f172a' }}>
                                        <Code2 size={14} />
                                        Example
                                    </div>
                                    <code className="block whitespace-pre-wrap text-[12px] leading-[1.55]" style={{ color: isDarkMode ? '#d8d8d8' : '#334155' }}>
                                        {card.example}
                                    </code>
                                </div>
                            </motion.article>
                        ))}
                    </section>

                    <section className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-6 mb-16">
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
                                <BookOpen size={18} />
                                <span className="text-[11px] font-bold tracking-[0.18em] uppercase">Response contract</span>
                            </div>
                            <h2 className="text-[28px] font-semibold mb-4" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                                Opportunity objects stay predictable across every client.
                            </h2>
                            <p className="text-[15px] leading-[1.65] mb-6" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                                Web, mobile, and admin consumers all rely on the same normalized `Opportunity` shape, so UI components can render the same feed without branching logic.
                            </p>
                            <pre
                                className="overflow-x-auto rounded-[24px] p-5 text-[12px] leading-[1.6]"
                                style={{
                                    backgroundColor: isDarkMode ? '#0a0a0a' : '#ffffff',
                                    border: `1px solid ${isDarkMode ? '#1f1f1f' : '#e5eef9'}`,
                                    color: isDarkMode ? '#d8d8d8' : '#1e293b',
                                }}
                            >
{`{
  "id": "chevening-masters-scholarship",
  "title": "Chevening Masters Scholarship",
  "organization": "UK Foreign, Commonwealth & Development Office",
  "category": "Scholarships",
  "deadline": "2026-11-05",
  "location": "United Kingdom",
  "description": "...",
  "requirements": ["..."],
  "benefits": ["..."],
  "applicationProcess": ["..."],
  "image": "...",
  "match": 96,
  "difficulty": "Hard"
}`}
                            </pre>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, delay: 0.1 }}
                            className="grid grid-cols-1 gap-4"
                        >
                            {fieldGroups.map((group) => (
                                <div
                                    key={group.title}
                                    className="p-6 rounded-[24px]"
                                    style={{
                                        backgroundColor: isDarkMode ? '#111' : '#ffffff',
                                        border: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}`,
                                    }}
                                >
                                    <div className="flex items-center gap-2 mb-4 text-[#146ef5]">
                                        <ShieldCheck size={16} />
                                        <span className="text-[11px] font-bold tracking-[0.18em] uppercase">{group.title}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {group.fields.map((field) => (
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
                                </div>
                            ))}
                        </motion.div>
                    </section>

                    <section className="py-4">
                        <div className="rounded-[32px] p-8 md:p-12" style={{ background: isDarkMode ? 'linear-gradient(135deg, #111, #0a0a0a)' : 'linear-gradient(135deg, #f8fbff, #ffffff)', border: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}` }}>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
                                <div>
                                    <div className="flex items-center gap-2 mb-4 text-[#146ef5]">
                                        <Layers3 size={18} />
                                        <span className="text-[11px] font-bold tracking-[0.18em] uppercase">Who uses it</span>
                                    </div>
                                    <h2 className="text-[28px] md:text-[34px] font-semibold mb-4" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                                        The same opportunity feed powers web, mobile, and admin workflows.
                                    </h2>
                                    <p className="text-[15px] leading-[1.7] mb-8" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                                        The public site reads the feed through `useOpportunities`, the mobile app can point at the same backend base URL, and the admin workflow syncs new data into the canonical opportunity table.
                                    </p>
                                    <div className="flex flex-wrap gap-3">
                                        <Link
                                            to="/docs"
                                            className="inline-flex items-center gap-2 rounded px-5 py-3 text-sm font-semibold no-underline"
                                            style={{ backgroundColor: '#146ef5', color: '#ffffff' }}
                                        >
                                            Open developer docs <ArrowRight size={16} />
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

                                <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-4">
                                    {[
                                        { title: 'Web App', desc: 'Vite + React calls `fetchOpportunities()` and `getOpportunity()`.', icon: Globe, color: '#146ef5' },
                                        { title: 'Mobile App', desc: 'Expo uses the same backend URL through the public feed contract.', icon: Smartphone, color: '#7a3dff' },
                                        { title: 'Admin Sync', desc: 'n8n and manual admin updates keep the canonical feed fresh.', icon: Server, color: '#00b86b' },
                                    ].map((item) => (
                                        <div
                                            key={item.title}
                                            className="p-5 rounded-[24px]"
                                            style={{
                                                backgroundColor: isDarkMode ? '#111' : '#ffffff',
                                                border: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}`,
                                            }}
                                        >
                                            <div className="h-11 w-11 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: `${item.color}15`, color: item.color }}>
                                                <item.icon size={18} />
                                            </div>
                                            <h3 className="text-[18px] font-semibold mb-2" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>{item.title}</h3>
                                            <p className="text-[14px] leading-[1.6]" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>{item.desc}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
            </main>
        </div>
    );
};

export default ScholarshipApiPage;
