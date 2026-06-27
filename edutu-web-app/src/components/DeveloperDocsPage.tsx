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
    Server,
    ShieldCheck,
    Smartphone,
    Terminal,
    Workflow,
    type LucideIcon,
} from 'lucide-react';
import { motion } from 'framer-motion';
import PublicEditorialShell from './PublicEditorialShell';

const apiSpecUrl = import.meta.env.VITE_API_OPENAPI_URL || 'https://api.edutu.org/v1/openapi.json';

type DocLink = {
    label: string;
    href: string;
};

type Endpoint = {
    method: string;
    path: string;
    title: string;
    description: string;
};

type PlatformCard = {
    icon: LucideIcon;
    title: string;
    subtitle: string;
    accent: string;
    items: string[];
};

const tocLinks: DocLink[] = [
    { label: 'Overview', href: '#overview' },
    { label: 'Endpoints', href: '#endpoints' },
    { label: 'Platform setup', href: '#platform-setup' },
    { label: 'SEO pages', href: '#seo-pages' },
    { label: 'Data contract', href: '#data-contract' },
    { label: 'Examples', href: '#examples' },
    { label: 'Support', href: '#support' },
];

const endpointGroups: Endpoint[] = [
    {
        method: 'GET',
        path: '/opportunities',
        title: 'Global opportunities API',
        description: 'Returns the canonical public feed for scholarships, fellowships, internships, and other opportunities with stable cursor-based pagination. Use it for home pages, filters, search, and list views.',
    },
    {
        method: 'GET',
        path: '/opportunities/:id',
        title: 'Scholarship detail API',
        description: 'Loads one normalized opportunity record for detail pages, SEO-friendly public shares, and application handoff screens.',
    },
    {
        method: 'GET',
        path: '/api/scraper/stats',
        title: 'Scraper health',
        description: 'Shows the current scrape coverage and sync status so your admin surface can reflect whether the inventory is fresh.',
    },
    {
        method: 'GET',
        path: '/v1/openapi.json',
        title: 'OpenAPI contract',
        description: 'Downloads the machine-readable API contract used by SDK generators and docs tools.',
    },
    {
        method: 'POST',
        path: '/api/scraper/run',
        title: 'Manual sync trigger',
        description: 'Triggers the ingestion workflow used by the admin panel and automated sources. Ideal for re-syncing after content updates.',
    },
];

const platformCards: PlatformCard[] = [
    {
        icon: Globe,
        title: 'Web app',
        subtitle: 'Public feed + SEO',
        accent: '#146ef5',
        items: [
            'Use `VITE_API_URL` or `VITE_BACKEND_URL` for the live feed',
            'Render the same normalized contract on list and detail pages',
            'Keep share pages text-first so search engines can index them cleanly',
        ],
    },
    {
        icon: Smartphone,
        title: 'Mobile app',
        subtitle: 'Expo client',
        accent: '#7a3dff',
        items: [
            '`EXPO_PUBLIC_API_URL` keeps mobile on the same source of truth',
            '`EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` handles auth',
            'Bookmark, apply, and deadline flows all use the same opportunity payload',
        ],
    },
    {
        icon: Server,
        title: 'Admin panel',
        subtitle: 'Ingestion + review',
        accent: '#00b86b',
        items: [
            '`VITE_API_URL`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY` keep the review surface connected',
            'Manual edits and scraper imports merge into the same inventory',
            'Use the sync endpoints to refresh the public feed after changes',
        ],
    },
];

const codeSamples = [
    {
        label: 'Web',
        title: 'Load the public opportunity feed',
        code: `import { fetchOpportunities } from '../services/opportunities';

const opportunities = await fetchOpportunities({
  status: 'active',
  category: 'Scholarships',
  limit: 12,
});`,
    },
    {
        label: 'Mobile',
        title: 'Point Expo at the same backend',
        code: `const apiUrl =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

const response = await fetch(\`\${apiUrl}/opportunities?status=active\`);
const opportunities = await response.json();`,
    },
    {
        label: 'Admin',
        title: 'Refresh the inventory after scraping',
        code: `await processN8nWebhook({
  action: 'bulk_sync',
  source: 'scraper',
  timestamp: new Date().toISOString(),
  opportunities: payload,
});`,
    },
    {
        label: 'OpenAPI',
        title: 'Fetch the machine-readable contract',
        code: `curl "${apiSpecUrl}"`,
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

const quickRefs = [
    {
        title: 'Scholarship Engine',
        text: 'Use `/opportunities` and `/opportunities/:id` for live scholarship and global opportunities data. The default feed is cursor-paginated for stable syncs.',
    },
    {
        title: 'Billing & credits',
        text: 'Open `/dashboard/developer` to create a project, buy API credits with Paystack, review invoices, and watch usage and renewal state update in real time.',
    },
    {
        title: 'SEO-ready pages',
        text: 'Keep share pages descriptive, text-first, and canonical so crawlers can understand each opportunity.',
    },
    {
        title: 'Shared schema',
        text: 'The public feed, mobile app, and admin panel all consume the same normalized opportunity contract.',
    },
    {
        title: 'OpenAPI spec',
        text: `Generate clients and keep docs in sync from ${apiSpecUrl}.`,
    },
];

const DeveloperDocsPage: React.FC = () => {
    return (
        <PublicEditorialShell>
            <div className="min-h-[100dvh] overflow-x-hidden bg-surface-body">
                <main className="mx-auto max-w-[1480px] px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
                    <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)_240px]">
                        <aside className="hidden lg:block">
                            <div className="sticky top-24 rounded-2xl border border-subtle bg-surface-layer p-4 shadow-soft">
                                <div className="mb-4 flex items-center gap-2 text-brand-500">
                                    <BookOpen size={16} />
                                    <span className="text-[11px] font-bold uppercase tracking-[0.24em]">On this page</span>
                                </div>
                                <nav className="space-y-1">
                                    {tocLinks.map((link) => (
                                        <a
                                            key={link.href}
                                            href={link.href}
                                            className="block rounded-xl px-3 py-2 text-sm font-medium text-soft transition-colors hover:bg-surface-elevated"
                                        >
                                            {link.label}
                                        </a>
                                    ))}
                                </nav>

                                <div className="mt-5 rounded-xl border border-subtle bg-surface-layer p-4">
                                    <div className="flex items-center gap-2 text-brand-500">
                                        <ShieldCheck size={14} />
                                        <span className="text-[10px] font-bold uppercase tracking-[0.22em]">Quick ref</span>
                                    </div>
                                    <p className="mt-3 text-sm leading-6 text-muted">
                                        The Edutu API powers the public app, the Expo mobile client, and the admin ingest flow.
                                    </p>
                                </div>
                            </div>
                        </aside>

                        <div className="min-w-0">
                            <section id="overview" className="scroll-mt-28 border-b border-subtle pb-10 sm:pb-12">
                                <motion.div
                                    initial={{ opacity: 0, y: 16 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                                >
                                    <div className="inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.26em] text-brand-500">
                                        <Code2 size={14} />
                                        edutu-api
                                    </div>

                                    <div className="mt-6 max-w-4xl space-y-5">
                                        <h1 className="text-[clamp(2rem,3.5vw,3.4rem)] font-medium leading-[1.06] tracking-[-0.05em] text-strong">
                                            Integrate Edutu with a clean, predictable API contract.
                                        </h1>
                                        <p className="max-w-3xl text-[16px] leading-[1.8] sm:text-[18px] text-soft">
                                            The same scholarship and global opportunities data powers the public web feed, the mobile client, and the admin ingestion pipeline. Start with the live feed, then layer on SEO pages, mobile views, and sync tooling.
                                        </p>
                                    </div>

                                    <div className="mt-8 grid gap-3 sm:grid-cols-3">
                                        {quickRefs.map((item) => (
                                            <div
                                                key={item.title}
                                                className="rounded-xl border border-subtle bg-surface-layer p-4 shadow-soft transition-colors duration-300 hover:border-brand-500/20"
                                            >
                                                <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-brand-500">
                                                    {item.title}
                                                </p>
                                                <p className="mt-2 text-sm leading-6 text-soft">
                                                    {item.text}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </motion.div>
                            </section>

                            <section
                                id="endpoints"
                                className="scroll-mt-28 py-10 sm:py-12"
                            >
                                <div className="max-w-3xl">
                                    <h2 className="text-[clamp(1.6rem,2.4vw,2.35rem)] font-medium leading-[1.05] tracking-[-0.045em] text-strong">
                                        Scholarship and global opportunities endpoints.
                                    </h2>
                                    <p className="mt-4 text-[15px] leading-[1.75] text-soft">
                                        Build against the backend once, then let every surface consume the same normalized opportunity object. That keeps lists, share pages, detail pages, and admin tools aligned.
                                    </p>
                                </div>

                                <div className="mt-8 grid gap-4">
                                    {endpointGroups.map((endpoint, index) => (
                                        <motion.article
                                            key={endpoint.path}
                                            initial={{ opacity: 0, y: 14 }}
                                            whileInView={{ opacity: 1, y: 0 }}
                                            viewport={{ once: true, margin: '-40px' }}
                                            transition={{ duration: 0.35, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
                                            className="rounded-2xl border border-subtle bg-surface-layer p-5 shadow-soft transition-colors duration-300 hover:border-brand-500/20 grid gap-4 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-start"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div
                                                    className="flex h-12 w-12 items-center justify-center rounded-2xl"
                                                    style={{
                                                        backgroundColor: endpoint.method === 'GET' ? 'rgba(20,110,245,0.12)' : 'rgba(0,184,107,0.12)',
                                                        color: endpoint.method === 'GET' ? '#146ef5' : '#00b86b',
                                                    }}
                                                >
                                                    <Terminal size={18} />
                                                </div>
                                                <div>
                                                    <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-brand-500">
                                                        {endpoint.method}
                                                    </div>
                                                    <div className="mt-1 font-mono text-[13px] text-soft">
                                                        {endpoint.path}
                                                    </div>
                                                </div>
                                            </div>

                                            <div>
                                                <h3 className="text-lg font-semibold tracking-[-0.02em] text-strong">
                                                    {endpoint.title}
                                                </h3>
                                                <p className="mt-2 max-w-3xl text-[15px] leading-[1.75] text-soft">
                                                    {endpoint.description}
                                                </p>
                                            </div>
                                        </motion.article>
                                    ))}
                                </div>
                            </section>

                            <motion.section
                                id="platform-setup"
                                initial={{ opacity: 0, y: 24 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, margin: '-60px' }}
                                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                                className="scroll-mt-28 border-y border-subtle py-10 sm:py-12"
                            >
                                <div className="max-w-3xl">
                                    <h2 className="text-[clamp(1.6rem,2.4vw,2.35rem)] font-medium leading-[1.05] tracking-[-0.045em] text-strong">
                                        One opportunity source, three clients.
                                    </h2>
                                    <p className="mt-4 text-[15px] leading-[1.75] text-soft">
                                        The web app, Expo mobile app, and admin panel all point at the same contract. That is the simplest way to keep scholarship data, editorial pages, and sync jobs in agreement.
                                    </p>
                                </div>

                                <div className="mt-8 grid gap-4 lg:grid-cols-3">
                                    {platformCards.map((card, index) => (
                                        <motion.article
                                            key={card.title}
                                            initial={{ opacity: 0, y: 14 }}
                                            whileInView={{ opacity: 1, y: 0 }}
                                            viewport={{ once: true, margin: '-40px' }}
                                            transition={{ duration: 0.35, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
                                            className="rounded-2xl border border-subtle bg-surface-layer p-5 shadow-soft transition-colors duration-300 hover:border-brand-500/20"
                                        >
                                            <div
                                                className="flex h-11 w-11 items-center justify-center rounded-2xl"
                                                style={{ backgroundColor: `${card.accent}12`, color: card.accent }}
                                            >
                                                <card.icon size={20} />
                                            </div>
                                            <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.24em]" style={{ color: card.accent }}>
                                                {card.subtitle}
                                            </p>
                                            <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-strong">
                                                {card.title}
                                            </h3>
                                            <ul className="mt-4 space-y-2">
                                                {card.items.map((item) => (
                                                    <li key={item} className="flex items-start gap-2 text-sm leading-6 text-soft">
                                                        <CheckCircle size={15} className="mt-0.5 shrink-0" style={{ color: card.accent }} />
                                                        <span>{item}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </motion.article>
                                    ))}
                                </div>
                            </motion.section>

                            <motion.section
                                id="seo-pages"
                                initial={{ opacity: 0, y: 24 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, margin: '-60px' }}
                                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                                className="scroll-mt-28 py-10 sm:py-12"
                            >
                                <div className="max-w-3xl">
                                    <h2 className="text-[clamp(1.6rem,2.4vw,2.35rem)] font-medium leading-[1.05] tracking-[-0.045em] text-strong">
                                        Make public pages readable, crawlable, and useful.
                                    </h2>
                                    <p className="mt-4 text-[15px] leading-[1.75] text-soft">
                                        Opportunity share pages should read like a concise article: descriptive title, plain summary, source details, deadline, and a clear action. That structure helps scholarship pages rank and makes previews look trustworthy when shared.
                                    </p>
                                </div>

                                <div className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                                    <div className="rounded-2xl border border-subtle bg-surface-layer p-5 shadow-soft transition-colors duration-300 hover:border-brand-500/20">
                                        <div className="flex items-center gap-2 text-brand-500">
                                            <Globe size={16} />
                                            <span className="text-[11px] font-bold uppercase tracking-[0.24em]">Public routes</span>
                                        </div>
                                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                            {[
                                                { route: '/opportunities', text: 'Browseable global opportunities' },
                                                { route: '/share/opportunity/:id', text: 'SEO-friendly share page' },
                                                { route: '/opportunities/:id', text: 'Detail page for applications' },
                                                { route: '/blog', text: 'Supporting editorial content' },
                                            ].map((item) => (
                                                <div
                                                    key={item.route}
                                                    className="rounded-xl border border-subtle bg-surface-layer px-4 py-3"
                                                >
                                                    <p className="font-mono text-[12px] text-brand-500">{item.route}</p>
                                                    <p className="mt-1 text-sm leading-6 text-soft">
                                                        {item.text}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-subtle bg-surface-layer p-5 shadow-soft transition-colors duration-300 hover:border-brand-500/20">
                                        <div className="flex items-center gap-2 text-brand-500">
                                            <Database size={16} />
                                            <span className="text-[11px] font-bold uppercase tracking-[0.24em]">Metadata tips</span>
                                        </div>
                                        <ul className="mt-4 space-y-3 text-sm leading-6 text-soft">
                                            <li>• Keep title, summary, organization, and location visible in the first screen.</li>
                                            <li>• Use descriptive headings and consistent field names across pages.</li>
                                            <li>• Treat the share page as a public article, not a dense dashboard card.</li>
                                        </ul>
                                    </div>
                                </div>
                            </motion.section>

                            <motion.section
                                id="data-contract"
                                initial={{ opacity: 0, y: 24 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, margin: '-60px' }}
                                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                                className="scroll-mt-28 border-y border-subtle py-10 sm:py-12"
                            >
                                <div className="max-w-3xl">
                                    <h2 className="text-[clamp(1.6rem,2.4vw,2.35rem)] font-medium leading-[1.05] tracking-[-0.045em] text-strong">
                                        The same normalized fields power every surface.
                                    </h2>
                                    <p className="mt-4 text-[15px] leading-[1.75] text-soft">
                                        Once an opportunity is normalized, the public web app, the mobile app, and the admin panel all read the same keys without extra mapping layers.
                                    </p>
                                </div>

                                <div className="mt-6 flex flex-wrap gap-2">
                                    {opportunityFields.map((field) => (
                                        <span
                                            key={field}
                                            className="rounded-full border border-subtle bg-surface-layer px-3 py-1 text-[12px] font-medium text-soft"
                                        >
                                            {field}
                                        </span>
                                    ))}
                                </div>
                            </motion.section>

                            <motion.section
                                id="examples"
                                initial={{ opacity: 0, y: 24 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, margin: '-60px' }}
                                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                                className="scroll-mt-28 py-10 sm:py-12"
                            >
                                <div className="max-w-3xl">
                                    <h2 className="text-[clamp(1.6rem,2.4vw,2.35rem)] font-medium leading-[1.05] tracking-[-0.045em] text-strong">
                                        Copy-paste starts for web, mobile, and admin.
                                    </h2>
                                </div>

                                <div className="mt-8 grid gap-4">
                                    {codeSamples.map((sample) => (
                                        <div
                                            key={sample.label}
                                            className="rounded-2xl border border-subtle bg-surface-layer p-5 shadow-soft transition-colors duration-300 hover:border-brand-500/20"
                                        >
                                            <div className="flex items-center gap-2 text-brand-500">
                                                <Layers3 size={14} />
                                                <span className="text-[10px] font-bold uppercase tracking-[0.24em]">{sample.label}</span>
                                            </div>
                                            <h3 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-strong">
                                                {sample.title}
                                            </h3>
                                            <pre className="mt-4 overflow-x-auto rounded-xl border border-subtle bg-surface-layer p-4 text-[12px] leading-[1.7] whitespace-pre-wrap text-soft">
{sample.code}
                                            </pre>
                                        </div>
                                    ))}
                                </div>
                            </motion.section>

                            <motion.section
                                id="support"
                                initial={{ opacity: 0, y: 24 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, margin: '-60px' }}
                                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                                className="scroll-mt-28 py-10 sm:py-12"
                            >
                                <div className="rounded-2xl border border-subtle bg-gradient-to-br from-brand-500/[0.06] to-surface p-6 shadow-soft sm:p-8">
                                    <h2 className="text-[clamp(1.6rem,2.4vw,2.25rem)] font-medium leading-[1.08] tracking-[-0.04em] text-strong">
                                        Build with Edutu, then ship faster with one opportunity engine.
                                    </h2>
                                    <p className="mt-4 max-w-3xl text-[15px] leading-[1.75] text-soft">
                                        If you are wiring Edutu into a school portal, a scholarship directory, or a community platform, keep every surface pointed at the same backend and the same opportunity schema.
                                    </p>

                                    <div className="mt-6 flex flex-wrap gap-3">
                                        <Link
                                            to="/scholarship-engine"
                                            className="inline-flex items-center gap-2 rounded-full bg-brand-500 px-6 py-3 text-sm font-semibold text-white no-underline transition-all duration-300 hover:scale-[0.98] active:scale-[0.97]"
                                        >
                                            Open Scholarship Engine
                                            <ArrowRight size={16} />
                                        </Link>
                                        <Link
                                            to="/dashboard/developer"
                                            className="inline-flex items-center gap-2 rounded-full border border-subtle bg-surface-layer px-6 py-3 text-sm font-semibold text-strong no-underline transition-all duration-300 hover:scale-[0.98] active:scale-[0.97]"
                                        >
                                            Open dashboard
                                        </Link>
                                    </div>
                                </div>
                            </motion.section>
                        </div>

                        <aside className="hidden xl:block">
                            <div className="sticky top-24 space-y-4">
                                <div className="rounded-2xl border border-subtle bg-surface-layer p-4 shadow-soft">
                                    <div className="flex items-center gap-2 text-brand-500">
                                        <Workflow size={15} />
                                        <span className="text-[11px] font-bold uppercase tracking-[0.24em]">Quick refs</span>
                                    </div>
                                    <div className="mt-4 space-y-3">
                                        <div className="rounded-xl border border-subtle bg-surface-layer px-3 py-3">
                                            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-500">
                                                Base URL
                                            </p>
                                            <p className="mt-1 font-mono text-[13px] text-strong">
                                                http://localhost:3000
                                            </p>
                                        </div>
                                        <div className="rounded-xl border border-subtle bg-surface-layer px-3 py-3">
                                            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-500">
                                                Public pages
                                            </p>
                                            <p className="mt-1 text-sm leading-6 text-soft">
                                                `share/opportunity/:id`, `/opportunities`, `/blog`
                                            </p>
                                        </div>
                                        <div className="rounded-xl border border-subtle bg-surface-layer px-3 py-3">
                                            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-500">
                                                Integrations
                                            </p>
                                            <p className="mt-1 text-sm leading-6 text-soft">
                                                Web, Expo mobile, admin sync, and scraper ingestion all read the same contract.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </aside>
                    </div>
                </main>
            </div>
        </PublicEditorialShell>
    );
};

export default DeveloperDocsPage;
