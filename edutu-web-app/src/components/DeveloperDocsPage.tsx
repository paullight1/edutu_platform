import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    ArrowRight,
    BookOpen,
    Check,
    CheckCircle,
    Copy,
    Database,
    FileJson,
    Globe,
    KeyRound,
    Server,
    Smartphone,
    Terminal,
    type LucideIcon,
} from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import PublicHeader from './PublicHeader';
import SiteFooter from './SiteFooter';
import Seo from './Seo';
import { getOpenApiUrl, getPublicApiBaseUrl } from '../lib/apiProductUrls';

const apiBaseUrl = getPublicApiBaseUrl();
const apiSpecUrl = getOpenApiUrl();

/* ────────────────────────────────────────────────────────────────────────
 * Content
 * ──────────────────────────────────────────────────────────────────────── */
type DocLink = { label: string; href: string };

const tocLinks: DocLink[] = [
    { label: 'Getting started', href: '#overview' },
    { label: 'Endpoints', href: '#endpoints' },
    { label: 'The opportunity object', href: '#object' },
    { label: 'Examples', href: '#examples' },
    { label: 'Platform setup', href: '#platform' },
    { label: 'SEO pages', href: '#seo' },
    { label: 'Support', href: '#support' },
];

type Method = 'GET' | 'POST';
type Endpoint = { method: Method; path: string; title: string; description: string };

const endpoints: Endpoint[] = [
    {
        method: 'GET',
        path: '/opportunities',
        title: 'Opportunity feed',
        description:
            'The canonical public feed for scholarships, fellowships, internships and grants, with stable cursor-based pagination. Use it for home pages, filters, search and list views.',
    },
    {
        method: 'GET',
        path: '/opportunities/:id',
        title: 'Opportunity detail',
        description:
            'One normalized opportunity record for detail pages, SEO-friendly public shares and application hand-off screens.',
    },
    {
        method: 'GET',
        path: '/api/scraper/stats',
        title: 'Scraper health',
        description:
            'Current scrape coverage and sync status, so your admin surface can reflect whether the inventory is fresh.',
    },
    {
        method: 'GET',
        path: '/v1/openapi.json',
        title: 'OpenAPI contract',
        description:
            'The machine-readable API contract used by SDK generators and docs tools. Point your codegen at it to stay in sync.',
    },
    {
        method: 'POST',
        path: '/api/scraper/run',
        title: 'Manual sync trigger',
        description:
            'Triggers the ingestion workflow used by the admin panel and automated sources. Ideal for re-syncing after content updates.',
    },
];

type PlatformCard = {
    icon: LucideIcon;
    title: string;
    subtitle: string;
    accentClass: string;
    tintClass: string;
    items: string[];
};

const platformCards: PlatformCard[] = [
    {
        icon: Globe,
        title: 'Web app',
        subtitle: 'Public feed + SEO',
        accentClass: 'text-brand',
        tintClass: 'bg-brand/10',
        items: [
            'Use VITE_API_URL or VITE_BACKEND_URL for the live feed',
            'Render the same normalized contract on list and detail pages',
            'Keep share pages text-first so search engines index them cleanly',
        ],
    },
    {
        icon: Smartphone,
        title: 'Mobile app',
        subtitle: 'Expo client',
        accentClass: 'text-accent',
        tintClass: 'bg-accent/10',
        items: [
            'EXPO_PUBLIC_API_URL keeps mobile on the same source of truth',
            'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY handles auth',
            'Bookmark, apply and deadline flows share one opportunity payload',
        ],
    },
    {
        icon: Server,
        title: 'Admin panel',
        subtitle: 'Ingestion + review',
        accentClass: 'text-success',
        tintClass: 'bg-success/10',
        items: [
            'VITE_API_URL, VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY keep it connected',
            'Manual edits and scraper imports merge into one inventory',
            'Use the sync endpoints to refresh the public feed after changes',
        ],
    },
];

type CodeSample = { label: string; title: string; code: string };

const codeSamples: CodeSample[] = [
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

/* ────────────────────────────────────────────────────────────────────────
 * Primitives (dark "code surface" — the brand's navy developer moment)
 * ──────────────────────────────────────────────────────────────────────── */
function CopyButton({ value }: { value: string }) {
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
        } catch {
            /* clipboard unavailable */
        }
    };
    return (
        <button
            type="button"
            onClick={copy}
            aria-label={copied ? 'Copied' : 'Copy code'}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50"
        >
            {copied ? <Check size={15} className="text-emerald-400" /> : <Copy size={15} />}
        </button>
    );
}

function CodeSurface({
    language,
    copyValue,
    children,
}: {
    language: string;
    copyValue: string;
    children: React.ReactNode;
}) {
    return (
        <div className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-[#0b1020] shadow-[0_30px_60px_-30px_rgba(2,6,23,0.7)]">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
                <span className="font-mono text-[12px] text-slate-400">{language}</span>
                <CopyButton value={copyValue} />
            </div>
            <div className="overflow-x-auto px-4 py-4 sm:px-5">
                <pre className="font-mono text-[12.5px] leading-[1.85] text-slate-200 sm:text-[13px]">
                    {children}
                </pre>
            </div>
        </div>
    );
}

function MethodBadge({ method }: { method: Method }) {
    const styles =
        method === 'GET'
            ? 'border-sky-500/25 bg-sky-500/10 text-sky-500'
            : 'border-amber-500/25 bg-amber-500/10 text-amber-600';
    return (
        <span
            className={`inline-flex h-6 shrink-0 items-center rounded-md border px-2 font-mono text-[11px] font-bold tracking-wide ${styles}`}
        >
            {method}
        </span>
    );
}

/* ────────────────────────────────────────────────────────────────────────
 * Page
 * ──────────────────────────────────────────────────────────────────────── */
const DeveloperDocsPage: React.FC = () => {
    const reduceMotion = useReducedMotion();
    const [activeId, setActiveId] = useState('overview');

    // Scroll-spy: highlight the section currently in view in the sidebar.
    useEffect(() => {
        const els = tocLinks
            .map((l) => document.getElementById(l.href.slice(1)))
            .filter((el): el is HTMLElement => Boolean(el));
        if (!els.length) return;

        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((e) => e.isIntersecting)
                    .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
                if (visible[0]) setActiveId(visible[0].target.id);
            },
            { rootMargin: '-96px 0px -62% 0px', threshold: 0 },
        );
        els.forEach((el) => observer.observe(el));
        return () => observer.disconnect();
    }, []);

    const reveal = reduceMotion
        ? {}
        : {
              initial: { opacity: 0, y: 18 },
              whileInView: { opacity: 1, y: 0 },
              viewport: { once: true, margin: '-60px' },
              transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const },
          };

    return (
        <div className="min-h-[100dvh] overflow-x-hidden bg-surface-body font-body text-text-primary">
            <Seo
                title="API reference — Edutu Developer docs"
                description="Reference for the Edutu opportunity API: authentication, endpoints, the normalized opportunity object, and copy-paste examples for web, mobile and admin."
                path="/developers/docs"
                type="website"
            />
            <PublicHeader />

            <main className="relative z-10">
                {/* ── Masthead ─────────────────────────────────────────── */}
                <section className="relative px-4 pt-28 sm:px-6 sm:pt-32">
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-x-0 top-0 h-[360px]"
                        style={{
                            background:
                                'radial-gradient(48% 60% at 50% 0%, rgb(var(--color-brand-500) / 0.12), transparent 72%)',
                        }}
                    />
                    <motion.div
                        className="relative mx-auto max-w-[1200px]"
                        initial={reduceMotion ? undefined : { opacity: 0, y: 16 }}
                        animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    >
                        <span className="inline-flex items-center gap-2 rounded-full border border-subtle bg-surface-layer px-3.5 py-1.5 font-mono text-[12.5px] text-text-secondary shadow-soft">
                            <Terminal size={14} className="text-brand" />
                            Developer API · Reference
                        </span>

                        <h1 className="mt-6 max-w-3xl font-display text-[clamp(2.1rem,4.2vw,3.4rem)] font-semibold leading-[1.04] tracking-[-0.03em] text-text-primary text-balance">
                            The Edutu API, end to end.
                        </h1>
                        <p className="mt-5 max-w-2xl text-[16px] leading-[1.7] text-text-secondary sm:text-[17px]">
                            One normalized opportunity contract powers the web feed, the Expo mobile
                            client and the admin ingestion pipeline. Authenticate, call an endpoint,
                            and read the same shape everywhere.
                        </p>

                        <div className="mt-8 flex flex-wrap items-center gap-3">
                            <Link
                                to="/auth?mode=sign-up&redirect=/dashboard/developer"
                                className="group inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 text-[15px] font-semibold text-white no-underline shadow-elevated transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-700"
                            >
                                <KeyRound size={16} />
                                Get an API key
                                <ArrowRight
                                    size={15}
                                    className="transition-transform duration-200 group-hover:translate-x-0.5"
                                />
                            </Link>
                            <a
                                href={apiSpecUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 rounded-xl border border-strong bg-surface-layer px-5 py-3 text-[15px] font-semibold text-text-primary no-underline transition-colors duration-200 hover:border-brand/50 hover:text-brand"
                            >
                                <FileJson size={16} />
                                OpenAPI spec
                            </a>
                        </div>
                    </motion.div>
                </section>

                {/* ── Docs body: sticky TOC + content ──────────────────── */}
                <div className="mx-auto max-w-[1200px] px-4 pb-4 pt-14 sm:px-6 sm:pt-16">
                    <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[212px_minmax(0,1fr)]">
                        {/* TOC */}
                        <aside className="hidden lg:block">
                            <div className="sticky top-24">
                                <div className="mb-3 flex items-center gap-2 px-3 text-text-muted">
                                    <BookOpen size={14} />
                                    <span className="text-[11px] font-bold uppercase tracking-[0.22em]">
                                        On this page
                                    </span>
                                </div>
                                <nav className="space-y-0.5">
                                    {tocLinks.map((link) => {
                                        const isActive = activeId === link.href.slice(1);
                                        return (
                                            <a
                                                key={link.href}
                                                href={link.href}
                                                className={`block rounded-lg px-3 py-1.5 text-[13.5px] transition-colors ${
                                                    isActive
                                                        ? 'bg-brand/10 font-semibold text-brand'
                                                        : 'font-medium text-text-secondary hover:bg-surface-elevated hover:text-text-primary'
                                                }`}
                                            >
                                                {link.label}
                                            </a>
                                        );
                                    })}
                                </nav>

                                <Link
                                    to="/dashboard/developer"
                                    className="mt-6 flex items-center justify-between gap-2 rounded-xl border border-subtle bg-surface-layer px-3.5 py-3 no-underline shadow-soft transition-colors hover:border-brand/40"
                                >
                                    <span className="min-w-0">
                                        <span className="block text-[13px] font-semibold text-text-primary">
                                            Developer dashboard
                                        </span>
                                        <span className="block text-[12px] text-text-muted">
                                            Keys, usage &amp; billing
                                        </span>
                                    </span>
                                    <ArrowRight size={15} className="shrink-0 text-brand" />
                                </Link>
                            </div>
                        </aside>

                        {/* Content */}
                        <div className="min-w-0">
                            {/* ── Getting started ──────────────────────────── */}
                            <section id="overview" className="scroll-mt-28">
                                <h2 className="font-display text-[clamp(1.5rem,2.4vw,2.1rem)] font-semibold leading-[1.1] tracking-[-0.02em] text-text-primary">
                                    Getting started
                                </h2>
                                <p className="mt-4 max-w-2xl text-[15.5px] leading-[1.75] text-text-secondary">
                                    Every request goes to one versioned base URL and returns the same
                                    normalized envelope. Authenticate with a scoped key from the
                                    developer dashboard, then read <code className="rounded bg-surface-elevated px-1.5 py-0.5 font-mono text-[13px] text-brand">data</code>{' '}
                                    and <code className="rounded bg-surface-elevated px-1.5 py-0.5 font-mono text-[13px] text-brand">meta</code> off the response.
                                </p>

                                {/* Base URL */}
                                <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-subtle bg-surface-layer p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between">
                                    <div className="min-w-0">
                                        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-text-muted">
                                            Base URL
                                        </p>
                                        <p className="mt-1 truncate font-mono text-[14px] text-text-primary">
                                            {apiBaseUrl}
                                        </p>
                                    </div>
                                    <div className="shrink-0 rounded-lg border border-white/10 bg-[#0b1020]">
                                        <CopyButton value={apiBaseUrl} />
                                    </div>
                                </div>

                                {/* Auth + envelope */}
                                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                                    <div className="min-w-0">
                                        <div className="mb-3 flex items-center gap-2 text-text-primary">
                                            <KeyRound size={16} className="text-brand" />
                                            <h3 className="text-[15px] font-semibold">Authentication</h3>
                                        </div>
                                        <CodeSurface
                                            language="cURL"
                                            copyValue={`curl ${apiBaseUrl}/opportunities?limit=12 \\\n  -H "Authorization: Bearer $EDUTU_API_KEY"`}
                                        >
                                            <div>
                                                <span className="text-sky-300">curl</span> {apiBaseUrl}
                                                /opportunities?limit=<span className="text-amber-300">12</span>{' '}
                                                <span className="text-slate-500">\</span>
                                            </div>
                                            <div>
                                                {'  '}-H{' '}
                                                <span className="text-emerald-300">
                                                    "Authorization: Bearer $EDUTU_API_KEY"
                                                </span>
                                            </div>
                                        </CodeSurface>
                                        <p className="mt-2.5 text-[13.5px] leading-[1.65] text-text-muted">
                                            Send your key as a bearer token, or as the{' '}
                                            <code className="font-mono text-[12.5px] text-text-secondary">
                                                x-edutu-api-key
                                            </code>{' '}
                                            header. Keys are scoped per project and can be rotated any
                                            time.
                                        </p>
                                    </div>

                                    <div className="min-w-0">
                                        <div className="mb-3 flex items-center gap-2 text-text-primary">
                                            <FileJson size={16} className="text-brand" />
                                            <h3 className="text-[15px] font-semibold">Response envelope</h3>
                                        </div>
                                        <CodeSurface
                                            language="JSON"
                                            copyValue={`{\n  "data": [ /* opportunity objects */ ],\n  "meta": { "next_cursor": "…", "count": 12 }\n}`}
                                        >
                                            <div>{'{'}</div>
                                            <div>
                                                {'  '}
                                                <span className="text-sky-300">"data"</span>:{' '}
                                                <span className="text-slate-400">
                                                    [ /* opportunity objects */ ]
                                                </span>
                                                ,
                                            </div>
                                            <div>
                                                {'  '}
                                                <span className="text-sky-300">"meta"</span>: {'{'}{' '}
                                                <span className="text-sky-300">"next_cursor"</span>:{' '}
                                                <span className="text-emerald-300">"…"</span>,{' '}
                                                <span className="text-sky-300">"count"</span>:{' '}
                                                <span className="text-amber-300">12</span> {'}'}
                                            </div>
                                            <div>{'}'}</div>
                                        </CodeSurface>
                                        <p className="mt-2.5 text-[13.5px] leading-[1.65] text-text-muted">
                                            Lists are cursor-paginated — pass{' '}
                                            <code className="font-mono text-[12.5px] text-text-secondary">
                                                meta.next_cursor
                                            </code>{' '}
                                            back as{' '}
                                            <code className="font-mono text-[12.5px] text-text-secondary">
                                                ?cursor=
                                            </code>{' '}
                                            for stable syncs.
                                        </p>
                                    </div>
                                </div>
                            </section>

                            {/* ── Endpoints ────────────────────────────────── */}
                            <section id="endpoints" className="scroll-mt-28 pt-14 sm:pt-16">
                                <h2 className="font-display text-[clamp(1.5rem,2.4vw,2.1rem)] font-semibold leading-[1.1] tracking-[-0.02em] text-text-primary">
                                    Endpoints
                                </h2>
                                <p className="mt-4 max-w-2xl text-[15.5px] leading-[1.75] text-text-secondary">
                                    Build against the backend once, then let every surface consume the
                                    same normalized object — lists, share pages, detail pages and
                                    admin tools stay in agreement.
                                </p>

                                <motion.div
                                    {...reveal}
                                    className="mt-7 overflow-hidden rounded-2xl border border-subtle bg-surface-layer shadow-soft"
                                >
                                    {endpoints.map((endpoint, i) => (
                                        <div
                                            key={endpoint.path}
                                            className={`grid grid-cols-1 gap-x-8 gap-y-3 p-5 sm:grid-cols-[minmax(0,280px)_1fr] sm:items-start sm:p-6 ${
                                                i > 0 ? 'border-t border-subtle' : ''
                                            }`}
                                        >
                                            <div className="flex min-w-0 items-center gap-2.5">
                                                <MethodBadge method={endpoint.method} />
                                                <code className="min-w-0 break-all font-mono text-[13px] text-text-primary">
                                                    {endpoint.path}
                                                </code>
                                            </div>
                                            <div className="min-w-0">
                                                <h3 className="text-[15px] font-semibold text-text-primary">
                                                    {endpoint.title}
                                                </h3>
                                                <p className="mt-1.5 text-[14.5px] leading-[1.7] text-text-secondary">
                                                    {endpoint.description}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </motion.div>
                            </section>

                            {/* ── The opportunity object ───────────────────── */}
                            <section id="object" className="scroll-mt-28 pt-14 sm:pt-16">
                                <h2 className="font-display text-[clamp(1.5rem,2.4vw,2.1rem)] font-semibold leading-[1.1] tracking-[-0.02em] text-text-primary">
                                    The opportunity object
                                </h2>
                                <p className="mt-4 max-w-2xl text-[15.5px] leading-[1.75] text-text-secondary">
                                    Once an opportunity is normalized, the web app, the mobile app and
                                    the admin panel all read the same keys — no extra mapping layers.
                                </p>

                                <div className="mt-7 grid gap-4 lg:grid-cols-[1fr_0.9fr]">
                                    <CodeSurface
                                        language="opportunity.json"
                                        copyValue={`{
  "id": "opp_8f21c4",
  "title": "Mastercard Foundation Scholars Program",
  "organization": "Mastercard Foundation",
  "category": "Scholarships",
  "deadline": "2026-08-31",
  "location": "Pan-African",
  "match": 0.92,
  "difficulty": "medium"
}`}
                                    >
                                        <div>{'{'}</div>
                                        <div>
                                            {'  '}
                                            <span className="text-sky-300">"id"</span>:{' '}
                                            <span className="text-emerald-300">"opp_8f21c4"</span>,
                                        </div>
                                        <div>
                                            {'  '}
                                            <span className="text-sky-300">"title"</span>:{' '}
                                            <span className="text-emerald-300">
                                                "Mastercard Foundation Scholars Program"
                                            </span>
                                            ,
                                        </div>
                                        <div>
                                            {'  '}
                                            <span className="text-sky-300">"organization"</span>:{' '}
                                            <span className="text-emerald-300">"Mastercard Foundation"</span>,
                                        </div>
                                        <div>
                                            {'  '}
                                            <span className="text-sky-300">"category"</span>:{' '}
                                            <span className="text-emerald-300">"Scholarships"</span>,
                                        </div>
                                        <div>
                                            {'  '}
                                            <span className="text-sky-300">"deadline"</span>:{' '}
                                            <span className="text-emerald-300">"2026-08-31"</span>,
                                        </div>
                                        <div>
                                            {'  '}
                                            <span className="text-sky-300">"location"</span>:{' '}
                                            <span className="text-emerald-300">"Pan-African"</span>,
                                        </div>
                                        <div>
                                            {'  '}
                                            <span className="text-sky-300">"match"</span>:{' '}
                                            <span className="text-amber-300">0.92</span>,
                                        </div>
                                        <div>
                                            {'  '}
                                            <span className="text-sky-300">"difficulty"</span>:{' '}
                                            <span className="text-emerald-300">"medium"</span>
                                        </div>
                                        <div>{'}'}</div>
                                    </CodeSurface>

                                    <div className="min-w-0 rounded-2xl border border-subtle bg-surface-layer p-5 shadow-soft">
                                        <div className="flex items-center gap-2 text-text-primary">
                                            <Database size={15} className="text-brand" />
                                            <span className="text-[13px] font-semibold">
                                                All fields
                                            </span>
                                        </div>
                                        <div className="mt-4 flex flex-wrap gap-2">
                                            {opportunityFields.map((field) => (
                                                <span
                                                    key={field}
                                                    className="rounded-md border border-subtle bg-surface-elevated px-2.5 py-1 font-mono text-[12px] text-text-secondary"
                                                >
                                                    {field}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </section>

                            {/* ── Examples ─────────────────────────────────── */}
                            <section id="examples" className="scroll-mt-28 pt-14 sm:pt-16">
                                <h2 className="font-display text-[clamp(1.5rem,2.4vw,2.1rem)] font-semibold leading-[1.1] tracking-[-0.02em] text-text-primary">
                                    Examples
                                </h2>
                                <p className="mt-4 max-w-2xl text-[15.5px] leading-[1.75] text-text-secondary">
                                    Copy-paste starts for web, mobile and admin — each hits the same
                                    opportunity contract.
                                </p>

                                <div className="mt-7 grid gap-4 md:grid-cols-2">
                                    {codeSamples.map((sample) => (
                                        <div key={sample.label} className="min-w-0">
                                            <h3 className="mb-3 text-[14.5px] font-semibold text-text-primary">
                                                {sample.title}
                                            </h3>
                                            <CodeSurface language={sample.label} copyValue={sample.code}>
                                                {sample.code}
                                            </CodeSurface>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            {/* ── Platform setup ───────────────────────────── */}
                            <section id="platform" className="scroll-mt-28 pt-14 sm:pt-16">
                                <h2 className="font-display text-[clamp(1.5rem,2.4vw,2.1rem)] font-semibold leading-[1.1] tracking-[-0.02em] text-text-primary">
                                    Platform setup
                                </h2>
                                <p className="mt-4 max-w-2xl text-[15.5px] leading-[1.75] text-text-secondary">
                                    The web app, Expo mobile app and admin panel all point at the same
                                    contract. That is the simplest way to keep data, editorial pages
                                    and sync jobs in agreement.
                                </p>

                                <motion.div
                                    {...reveal}
                                    className="mt-7 overflow-hidden rounded-2xl border border-subtle bg-surface-layer shadow-soft"
                                >
                                    {platformCards.map((card, i) => (
                                        <div
                                            key={card.title}
                                            className={`grid grid-cols-1 gap-x-8 gap-y-4 p-6 sm:grid-cols-[minmax(0,240px)_1fr] sm:items-start sm:p-7 ${
                                                i > 0 ? 'border-t border-subtle' : ''
                                            }`}
                                        >
                                            <div className="flex items-start gap-3.5">
                                                <span
                                                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${card.tintClass}`}
                                                >
                                                    <card.icon size={18} className={card.accentClass} />
                                                </span>
                                                <div className="min-w-0">
                                                    <div className="text-[15px] font-semibold text-text-primary">
                                                        {card.title}
                                                    </div>
                                                    <div
                                                        className={`text-[12.5px] font-medium ${card.accentClass}`}
                                                    >
                                                        {card.subtitle}
                                                    </div>
                                                </div>
                                            </div>
                                            <ul className="space-y-2.5">
                                                {card.items.map((item) => (
                                                    <li
                                                        key={item}
                                                        className="flex items-start gap-2.5 text-[14px] leading-[1.6] text-text-secondary"
                                                    >
                                                        <CheckCircle
                                                            size={15}
                                                            className={`mt-0.5 shrink-0 ${card.accentClass}`}
                                                        />
                                                        <span>{item}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    ))}
                                </motion.div>
                            </section>

                            {/* ── SEO pages ────────────────────────────────── */}
                            <section id="seo" className="scroll-mt-28 pt-14 sm:pt-16">
                                <h2 className="font-display text-[clamp(1.5rem,2.4vw,2.1rem)] font-semibold leading-[1.1] tracking-[-0.02em] text-text-primary">
                                    SEO-ready public pages
                                </h2>
                                <p className="mt-4 max-w-2xl text-[15.5px] leading-[1.75] text-text-secondary">
                                    Opportunity share pages should read like a concise article:
                                    descriptive title, plain summary, source details, deadline and a
                                    clear action. That structure helps pages rank and makes previews
                                    look trustworthy when shared.
                                </p>

                                <div className="mt-7 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                                    <div className="rounded-2xl border border-subtle bg-surface-layer p-5 shadow-soft">
                                        <div className="flex items-center gap-2 text-text-primary">
                                            <Globe size={15} className="text-brand" />
                                            <span className="text-[13px] font-semibold">
                                                Public routes
                                            </span>
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
                                                    className="rounded-xl border border-subtle bg-surface-elevated px-3.5 py-3"
                                                >
                                                    <p className="break-all font-mono text-[12px] text-brand">
                                                        {item.route}
                                                    </p>
                                                    <p className="mt-1 text-[13.5px] leading-[1.55] text-text-secondary">
                                                        {item.text}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-subtle bg-surface-layer p-5 shadow-soft">
                                        <div className="flex items-center gap-2 text-text-primary">
                                            <Database size={15} className="text-brand" />
                                            <span className="text-[13px] font-semibold">
                                                Metadata tips
                                            </span>
                                        </div>
                                        <ul className="mt-4 space-y-3 text-[14px] leading-[1.6] text-text-secondary">
                                            <li className="flex gap-2.5">
                                                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                                                Keep title, summary, organization and location visible
                                                in the first screen.
                                            </li>
                                            <li className="flex gap-2.5">
                                                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                                                Use descriptive headings and consistent field names
                                                across pages.
                                            </li>
                                            <li className="flex gap-2.5">
                                                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                                                Treat the share page as a public article, not a dense
                                                dashboard card.
                                            </li>
                                        </ul>
                                    </div>
                                </div>
                            </section>

                            {/* ── Support / close ──────────────────────────── */}
                            <section id="support" className="scroll-mt-28 pt-14 sm:pt-16">
                                <motion.div
                                    {...reveal}
                                    className="relative overflow-hidden rounded-[24px] border border-white/10 bg-[#0b1020] px-6 py-12 shadow-elevated sm:px-10 sm:py-14"
                                >
                                    <div
                                        aria-hidden="true"
                                        className="pointer-events-none absolute inset-0"
                                        style={{
                                            background:
                                                'radial-gradient(70% 70% at 50% 0%, rgb(var(--color-brand-500) / 0.22), transparent 65%)',
                                        }}
                                    />
                                    <div className="relative max-w-2xl">
                                        <h2 className="font-display text-[clamp(1.6rem,3vw,2.4rem)] font-semibold leading-[1.08] tracking-[-0.03em] text-white text-balance">
                                            Build with one opportunity engine.
                                        </h2>
                                        <p className="mt-4 max-w-xl text-[15.5px] leading-[1.7] text-slate-300">
                                            Wiring Edutu into a school portal, a scholarship directory
                                            or a community platform? Keep every surface pointed at the
                                            same backend and the same opportunity schema.
                                        </p>

                                        <div className="mt-8 flex flex-wrap gap-3">
                                            <Link
                                                to="/scholarship-engine"
                                                className="group inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-[15px] font-semibold text-brand-700 no-underline shadow-elevated transition-all duration-200 hover:-translate-y-0.5"
                                            >
                                                Scholarship Engine
                                                <ArrowRight
                                                    size={15}
                                                    className="transition-transform duration-200 group-hover:translate-x-0.5"
                                                />
                                            </Link>
                                            <Link
                                                to="/dashboard/developer"
                                                className="inline-flex items-center gap-2 rounded-xl border border-white/25 px-6 py-3 text-[15px] font-semibold text-white no-underline transition-colors duration-200 hover:bg-white/10"
                                            >
                                                Open dashboard
                                            </Link>
                                        </div>
                                    </div>
                                </motion.div>
                            </section>
                        </div>
                    </div>
                </div>
            </main>

            <SiteFooter />
        </div>
    );
};

export default DeveloperDocsPage;
