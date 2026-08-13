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
    { label: 'Access & credits', href: '#access' },
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
        path: '/health',
        title: 'Health check',
        description: 'Public runtime status. Free and available without an API key.',
    },
    {
        method: 'GET',
        path: '/opportunities',
        title: 'Opportunity feed',
        description:
            'Search and page through approved scholarships, fellowships, internships and grants. This chargeable request costs one credit.',
    },
    {
        method: 'GET',
        path: '/opportunities/:id',
        title: 'Opportunity detail',
        description:
            'Fetch one approved opportunity record. This chargeable request costs one credit.',
    },
    {
        method: 'GET',
        path: '/opportunities/stats',
        title: 'Catalog stats',
        description:
            'Inspect approved catalog coverage and freshness. This chargeable request costs one credit.',
    },
    {
        method: 'GET',
        path: '/opportunities/sync',
        title: 'Opportunity sync',
        description:
            'Pull approved rows changed since a timestamp. Requires the opportunities:sync scope and costs one credit.',
    },
    {
        method: 'GET',
        path: '/categories',
        title: 'Categories',
        description:
            'Discover stable category metadata. Free, but requires an API key with opportunities:read.',
    },
    {
        method: 'GET',
        path: '/usage',
        title: 'Usage',
        description:
            'Inspect quota and credit balance. Free and does not consume a credit.',
    },
    {
        method: 'POST',
        path: '/recommendations',
        title: 'Recommendations',
        description:
            'Retrieve ranked approved opportunities for a supplied profile. This chargeable request costs one credit.',
    },
    {
        method: 'POST',
        path: '/events',
        title: 'Partner events',
        description:
            'Record impressions, clicks, saves, and conversions. This chargeable request costs one credit.',
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
        title: 'Server application',
        subtitle: 'Recommended integration',
        accentClass: 'text-brand',
        tintClass: 'bg-brand/10',
        items: [
            'Keep EDUTU_API_KEY in server-side environment variables',
            'Proxy browser requests through your backend when the key must remain secret',
            'Render only approved opportunities from the normalized contract',
        ],
    },
    {
        icon: Smartphone,
        title: 'Workers and agents',
        subtitle: 'Server-to-server',
        accentClass: 'text-accent',
        tintClass: 'bg-accent/10',
        items: [
            'Use curl, fetch, Python, or an SDK from a trusted server environment',
            'Send x-edutu-api-key or Authorization: Bearer with the Edutu API key',
            'Use cursor pagination and /opportunities/sync for durable ingestion',
        ],
    },
    {
        icon: Server,
        title: 'Browser integrations',
        subtitle: 'CORS trade-off',
        accentClass: 'text-success',
        tintClass: 'bg-success/10',
        items: [
            'Direct browser calls require an approved CORS origin',
            'A browser-visible API key is not secret and can be copied by users',
            'Prefer a server proxy for production integrations',
        ],
    },
];

type CodeSample = { label: string; title: string; code: string };

const codeSamples: CodeSample[] = [
    {
        label: 'cURL',
        title: 'Call from your server',
        code: `curl "${apiBaseUrl}/opportunities?limit=5" \\
  -H "x-edutu-api-key: $EDUTU_API_KEY"`,
    },
    {
        label: 'JavaScript',
        title: 'Use a server-side key',
        code: `const response = await fetch("${apiBaseUrl}/opportunities?limit=5", {
  headers: { "x-edutu-api-key": process.env.EDUTU_API_KEY },
});
const { data, meta } = await response.json();`,
    },
    {
        label: '402',
        title: 'Handle exhausted credits',
        code: `{
  "error": {
    "status": 402,
    "code": "credits_exhausted"
  },
  "requestId": "req_..."
}`,
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
                <span className="font-mono text-xs text-slate-400">{language}</span>
                <CopyButton value={copyValue} />
            </div>
            <div className="overflow-x-auto px-4 py-4 sm:px-5">
                <pre className="font-mono text-xs leading-[1.85] text-slate-200 sm:text-sm">
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
            className={`inline-flex h-6 shrink-0 items-center rounded-md border px-2 font-mono text-2xs font-semibold tracking-wide ${styles}`}
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
                        <span className="inline-flex items-center gap-2 rounded-full border border-subtle bg-surface-layer px-3.5 py-1.5 font-mono text-xs text-text-secondary shadow-soft">
                            <Terminal size={14} className="text-brand" />
                            Developer API · Reference
                        </span>

                        <h1 className="mt-6 max-w-3xl font-display text-[clamp(2.1rem,4.2vw,3.4rem)] font-semibold leading-[1.04] tracking-[-0.03em] text-text-primary text-balance">
                            The Edutu API, end to end.
                        </h1>
                        <p className="mt-5 max-w-2xl text-base leading-[1.7] text-text-secondary sm:text-lg">
                            One normalized opportunity contract powers the web feed, the Expo mobile
                            client and the admin ingestion pipeline. Authenticate, call an endpoint,
                            and read the same shape everywhere.
                        </p>

                        <div className="mt-8 flex flex-wrap items-center gap-3">
                            <Link
                                to="/auth?mode=sign-up&redirect=/dashboard/developer"
                                className="group inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 text-base font-semibold text-white no-underline shadow-elevated transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-700"
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
                                className="inline-flex items-center gap-2 rounded-xl border border-strong bg-surface-layer px-5 py-3 text-base font-semibold text-text-primary no-underline transition-colors duration-200 hover:border-brand/50 hover:text-brand"
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
                                    <span className="text-2xs font-semibold uppercase tracking-[0.22em]">
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
                                                className={`block rounded-lg px-3 py-1.5 text-sm transition-colors ${
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
                                        <span className="block text-sm font-semibold text-text-primary">
                                            Developer dashboard
                                        </span>
                                        <span className="block text-xs text-text-muted">
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
                                <p className="mt-4 max-w-2xl text-base leading-[1.75] text-text-secondary">
                                    Every request goes to one versioned base URL and returns the same
                                    normalized envelope. Authenticate with a scoped key from the
                                    developer dashboard, then read <code className="rounded bg-surface-elevated px-1.5 py-0.5 font-mono text-sm text-brand">data</code>{' '}
                                    and <code className="rounded bg-surface-elevated px-1.5 py-0.5 font-mono text-sm text-brand">meta</code> off the response.
                                </p>

                                {/* Base URL */}
                                <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-subtle bg-surface-layer p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between">
                                    <div className="min-w-0">
                                        <p className="text-2xs font-semibold uppercase tracking-[0.2em] text-text-muted">
                                            Base URL
                                        </p>
                                        <p className="mt-1 truncate font-mono text-sm text-text-primary">
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
                                            <h3 className="text-base font-semibold">Authentication</h3>
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
                                        <p className="mt-2.5 text-sm leading-[1.65] text-text-muted">
                                            Send your key as a bearer token, or as the{' '}
                                            <code className="font-mono text-xs text-text-secondary">
                                                x-edutu-api-key
                                            </code>{' '}
                                            header. Keys are scoped per project and can be rotated any
                                            time.
                                        </p>
                                    </div>

                                    <div className="min-w-0">
                                        <div className="mb-3 flex items-center gap-2 text-text-primary">
                                            <FileJson size={16} className="text-brand" />
                                            <h3 className="text-base font-semibold">Response envelope</h3>
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
                                        <p className="mt-2.5 text-sm leading-[1.65] text-text-muted">
                                            Lists are cursor-paginated — pass{' '}
                                            <code className="font-mono text-xs text-text-secondary">
                                                meta.next_cursor
                                            </code>{' '}
                                            back as{' '}
                                            <code className="font-mono text-xs text-text-secondary">
                                                ?cursor=
                                            </code>{' '}
                                            for stable syncs.
                                        </p>
                                    </div>
                                </div>
                            </section>

                            {/* ── Access + credits ───────────────────────── */}
                            <section id="access" className="scroll-mt-28 pt-14 sm:pt-16">
                                <h2 className="font-display text-[clamp(1.5rem,2.4vw,2.1rem)] font-semibold leading-[1.1] tracking-[-0.02em] text-text-primary">
                                    Access, credits and visibility
                                </h2>
                                <p className="mt-4 max-w-2xl text-base leading-[1.75] text-text-secondary">
                                    Clerk signs you into Edutu and protects the developer dashboard. The
                                    API itself uses a separate project key, so a Clerk session token cannot
                                    be used as an API credential.
                                </p>
                                <div className="mt-7 grid gap-4 lg:grid-cols-2">
                                    <div className="rounded-2xl border border-subtle bg-surface-layer p-5 shadow-soft">
                                        <div className="flex items-center gap-2 text-text-primary">
                                            <KeyRound size={16} className="text-brand" />
                                            <h3 className="text-base font-semibold">Create access</h3>
                                        </div>
                                        <ul className="mt-4 space-y-3 text-sm leading-[1.65] text-text-secondary">
                                            <li>Sign in with Clerk and open <Link to="/dashboard/developer" className="font-semibold text-brand underline-offset-2 hover:underline">/dashboard/developer</Link>.</li>
                                            <li>Create a project and key immediately; no credit purchase is required.</li>
                                            <li>The raw key is shown once. Store it server-side and rotate or revoke it from the dashboard.</li>
                                        </ul>
                                    </div>
                                    <div className="rounded-2xl border border-subtle bg-surface-layer p-5 shadow-soft">
                                        <div className="flex items-center gap-2 text-text-primary">
                                            <Database size={16} className="text-brand" />
                                            <h3 className="text-base font-semibold">Credit policy</h3>
                                        </div>
                                        <ul className="mt-4 space-y-3 text-sm leading-[1.65] text-text-secondary">
                                            <li>New accounts start at 0 credits. Top-ups are one-time purchases and never expire.</li>
                                            <li>Health, usage and categories are free. Each other live API request costs 1 credit.</li>
                                            <li>A chargeable call at zero returns <code className="font-mono text-xs text-brand">402 credits_exhausted</code> before the operation runs.</li>
                                            <li>Only approved opportunities are visible. Approved user submissions become global catalog records for Edutu users and API customers.</li>
                                        </ul>
                                    </div>
                                </div>
                            </section>

                            {/* ── Endpoints ────────────────────────────────── */}
                            <section id="endpoints" className="scroll-mt-28 pt-14 sm:pt-16">
                                <h2 className="font-display text-[clamp(1.5rem,2.4vw,2.1rem)] font-semibold leading-[1.1] tracking-[-0.02em] text-text-primary">
                                    Endpoints
                                </h2>
                                <p className="mt-4 max-w-2xl text-base leading-[1.75] text-text-secondary">
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
                                                <code className="min-w-0 break-all font-mono text-sm text-text-primary">
                                                    {endpoint.path}
                                                </code>
                                            </div>
                                            <div className="min-w-0">
                                                <h3 className="text-base font-semibold text-text-primary">
                                                    {endpoint.title}
                                                </h3>
                                                <p className="mt-1.5 text-sm leading-[1.7] text-text-secondary">
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
                                <p className="mt-4 max-w-2xl text-base leading-[1.75] text-text-secondary">
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
                                            <span className="text-sm font-semibold">
                                                All fields
                                            </span>
                                        </div>
                                        <div className="mt-4 flex flex-wrap gap-2">
                                            {opportunityFields.map((field) => (
                                                <span
                                                    key={field}
                                                    className="rounded-md border border-subtle bg-surface-elevated px-2.5 py-1 font-mono text-xs text-text-secondary"
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
                                <p className="mt-4 max-w-2xl text-base leading-[1.75] text-text-secondary">
                                    Copy-paste starts for web, mobile and admin — each hits the same
                                    opportunity contract.
                                </p>

                                <div className="mt-7 grid gap-4 md:grid-cols-2">
                                    {codeSamples.map((sample) => (
                                        <div key={sample.label} className="min-w-0">
                                            <h3 className="mb-3 text-sm font-semibold text-text-primary">
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
                                <p className="mt-4 max-w-2xl text-base leading-[1.75] text-text-secondary">
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
                                                    <div className="text-base font-semibold text-text-primary">
                                                        {card.title}
                                                    </div>
                                                    <div
                                                        className={`text-xs font-medium ${card.accentClass}`}
                                                    >
                                                        {card.subtitle}
                                                    </div>
                                                </div>
                                            </div>
                                            <ul className="space-y-2.5">
                                                {card.items.map((item) => (
                                                    <li
                                                        key={item}
                                                        className="flex items-start gap-2.5 text-sm leading-[1.6] text-text-secondary"
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
                                <p className="mt-4 max-w-2xl text-base leading-[1.75] text-text-secondary">
                                    Opportunity share pages should read like a concise article:
                                    descriptive title, plain summary, source details, deadline and a
                                    clear action. That structure helps pages rank and makes previews
                                    look trustworthy when shared.
                                </p>

                                <div className="mt-7 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                                    <div className="rounded-2xl border border-subtle bg-surface-layer p-5 shadow-soft">
                                        <div className="flex items-center gap-2 text-text-primary">
                                            <Globe size={15} className="text-brand" />
                                            <span className="text-sm font-semibold">
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
                                                    <p className="break-all font-mono text-xs text-brand">
                                                        {item.route}
                                                    </p>
                                                    <p className="mt-1 text-sm leading-[1.55] text-text-secondary">
                                                        {item.text}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-subtle bg-surface-layer p-5 shadow-soft">
                                        <div className="flex items-center gap-2 text-text-primary">
                                            <Database size={15} className="text-brand" />
                                            <span className="text-sm font-semibold">
                                                Metadata tips
                                            </span>
                                        </div>
                                        <ul className="mt-4 space-y-3 text-sm leading-[1.6] text-text-secondary">
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
                                        <p className="mt-4 max-w-xl text-base leading-[1.7] text-slate-300">
                                            Wiring Edutu into a school portal, a scholarship directory
                                            or a community platform? Keep every surface pointed at the
                                            same backend and the same opportunity schema.
                                        </p>

                                        <div className="mt-8 flex flex-wrap gap-3">
                                            <Link
                                                to="/scholarship-engine"
                                                className="group inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-base font-semibold text-brand-700 no-underline shadow-elevated transition-all duration-200 hover:-translate-y-0.5"
                                            >
                                                Scholarship Engine
                                                <ArrowRight
                                                    size={15}
                                                    className="transition-transform duration-200 group-hover:translate-x-0.5"
                                                />
                                            </Link>
                                            <Link
                                                to="/dashboard/developer"
                                                className="inline-flex items-center gap-2 rounded-xl border border-white/25 px-6 py-3 text-base font-semibold text-white no-underline transition-colors duration-200 hover:bg-white/10"
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
