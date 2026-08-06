import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Braces,
  Check,
  Copy,
  Globe,
  Radar,
  Server,
  Smartphone,
  Sparkles,
  Terminal,
  Zap,
} from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import PublicEditorialShell from './PublicEditorialShell';
import Seo from './Seo';
import { getDocsUrl } from '../lib/apiProductUrls';

const docsUrl = getDocsUrl();
const API_BASE = 'https://api.edutu.org/v1';

/* ────────────────────────────────────────────────────────────────────────
 * Data
 * ──────────────────────────────────────────────────────────────────────── */
type Endpoint = {
  method: 'GET' | 'POST';
  path: string;
  title: string;
  description: string;
};

const endpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/opportunities',
    title: 'List opportunities',
    description:
      'Paginated public feed of scholarships, fellowships, internships and programs — with filters for category, country and deadline.',
  },
  {
    method: 'GET',
    path: '/opportunities/:id',
    title: 'Get one opportunity',
    description: 'A single normalized record — everything a detail page or share card needs.',
  },
  {
    method: 'POST',
    path: '/scraper/run',
    title: 'Sync inventory',
    description: 'Trigger a refresh after a scraper run or a manual edit in the admin.',
  },
  {
    method: 'GET',
    path: '/scraper/stats',
    title: 'Check freshness',
    description: 'Last run time, source health and ingestion counts for status dashboards.',
  },
];

const surfaces: { icon: React.ElementType; title: string; description: string }[] = [
  { icon: Globe, title: 'Web app', description: 'SEO-ready public pages render straight from the feed.' },
  { icon: Smartphone, title: 'Mobile app', description: 'The Expo client reads the exact same URLs.' },
  { icon: Server, title: 'Admin panel', description: 'Ingestion and review tools write back to one inventory.' },
];

const pipeline: { icon: React.ElementType; step: string; title: string; description: string }[] = [
  {
    icon: Radar,
    step: '01',
    title: 'Crawl',
    description: 'We scan thousands of scholarship, fellowship and job sources every single day.',
  },
  {
    icon: Sparkles,
    step: '02',
    title: 'Normalize',
    description: 'AI cleans, de-duplicates and categorizes each listing into one opportunity shape.',
  },
  {
    icon: Zap,
    step: '03',
    title: 'Serve',
    description: 'A cached, paginated feed reaches every client in milliseconds — worldwide.',
  },
];

/* ────────────────────────────────────────────────────────────────────────
 * Primitives
 * ──────────────────────────────────────────────────────────────────────── */
function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — no-op */
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? 'Copied' : label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50"
    >
      {copied ? <Check size={15} className="text-emerald-400" /> : <Copy size={15} />}
    </button>
  );
}

const methodStyles: Record<Endpoint['method'], string> = {
  GET: 'text-sky-700 bg-sky-500/10 ring-sky-500/25 dark:text-sky-300',
  POST: 'text-emerald-700 bg-emerald-500/10 ring-emerald-500/25 dark:text-emerald-300',
};

function MethodBadge({ method }: { method: Endpoint['method'] }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md px-2 py-1 font-mono text-2xs font-semibold tracking-wider ring-1 ring-inset ${methodStyles[method]}`}
    >
      {method}
    </span>
  );
}

/** Dark "code surface" window — the brand's navy moment, consistent in both themes. */
function CodeWindow({
  label,
  children,
  copyValue,
  className = '',
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  copyValue?: string;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-white/10 bg-[#0b1020] shadow-[0_30px_60px_-30px_rgba(2,6,23,0.7)] ${className}`}
    >
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          <span className="h-3 w-3 rounded-full bg-white/15" />
          <span className="h-3 w-3 rounded-full bg-white/15" />
          <span className="h-3 w-3 rounded-full bg-white/15" />
        </div>
        <div className="ml-1 truncate font-mono text-xs text-slate-400">{label}</div>
        {copyValue ? (
          <div className="ml-auto">
            <CopyButton value={copyValue} />
          </div>
        ) : null}
      </div>
      <div className="overflow-x-auto px-4 py-4 sm:px-5 sm:py-5">{children}</div>
    </div>
  );
}

/* Tiny syntax helpers for the sample payloads */
const k = (s: string) => <span className="text-sky-300">{s}</span>;
const str = (s: string) => <span className="text-emerald-300">{s}</span>;
const num = (s: string) => <span className="text-amber-300">{s}</span>;
const pun = (s: string) => <span className="text-slate-500">{s}</span>;
const typ = (s: string) => <span className="text-violet-300">{s}</span>;
const com = (s: string) => <span className="text-slate-500">{s}</span>;

/* ────────────────────────────────────────────────────────────────────────
 * Page
 * ──────────────────────────────────────────────────────────────────────── */
const ScholarshipApiPage: React.FC = () => {
  const reduceMotion = useReducedMotion();

  // Mount-triggered (not whileInView): the reveal resolves to visible on load,
  // so content is never gated behind a scroll that a crawler, prerender or
  // backgrounded tab may never fire. Motion is pure enhancement.
  const reveal = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 22 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] as const },
      };

  const jsonLines = [
    <>{pun('{')}</>,
    <>{'  '}{k('"data"')}{pun(': [')}</>,
    <>{'    '}{pun('{')}</>,
    <>{'      '}{k('"id"')}{pun(': ')}{str('"opp_7Qk29f"')}{pun(',')}</>,
    <>{'      '}{k('"title"')}{pun(': ')}{str('"Mastercard Foundation Scholars"')}{pun(',')}</>,
    <>{'      '}{k('"organization"')}{pun(': ')}{str('"University of Cape Town"')}{pun(',')}</>,
    <>{'      '}{k('"category"')}{pun(': ')}{str('"scholarship"')}{pun(',')}</>,
    <>{'      '}{k('"location"')}{pun(': ')}{str('"Cape Town, ZA"')}{pun(',')}</>,
    <>{'      '}{k('"deadline"')}{pun(': ')}{str('"2026-08-15"')}{pun(',')}</>,
    <>{'      '}{k('"match"')}{pun(': ')}{num('0.94')}</>,
    <>{'    '}{pun('}')}</>,
    <>{'  '}{pun('],')}</>,
    <>{'  '}{k('"page"')}{pun(': ')}{num('1')}{pun(',')}</>,
    <>{'  '}{k('"total"')}{pun(': ')}{num('12480')}</>,
    <>{pun('}')}</>,
  ];

  const schemaLines = [
    <>{typ('type')} <span className="text-slate-100">Opportunity</span> {pun('= {')}</>,
    <>{'  '}{k('id')}{pun(':')} {typ('string')}</>,
    <>{'  '}{k('title')}{pun(':')} {typ('string')}</>,
    <>{'  '}{k('organization')}{pun(':')} {typ('string')}</>,
    <>{'  '}{k('category')}{pun(':')} {typ('Category')}</>,
    <>{'  '}{k('location')}{pun(':')} {typ('string')}</>,
    <>{'  '}{k('deadline')}{pun(':')} {typ('string')}   {com('// ISO 8601')}</>,
    <>{'  '}{k('image')}{pun(':')} {typ('string')}</>,
    <>{'  '}{k('match')}{pun(':')} {typ('number')}      {com('// 0–1')}</>,
    <>{'  '}{k('description')}{pun(':')} {typ('string')}</>,
    <>{'  '}{k('requirements')}{pun(':')} {typ('string[]')}</>,
    <>{'  '}{k('benefits')}{pun(':')} {typ('string[]')}</>,
    <>{'  '}{k('applyUrl')}{pun(':')} {typ('string')}</>,
    <>{pun('}')}</>,
  ];

  return (
    <PublicEditorialShell>
      <Seo
        title="Scholarship Engine — one API for scholarships & opportunities | Edutu"
        description="A normalized API for scholarships, fellowships, internships and grants. One data contract powers Edutu's web app, mobile client and admin — ingested from thousands of sources, refreshed daily."
        path="/scholarship-engine"
        type="website"
      />

      <div className="overflow-x-hidden bg-surface-body">
        <main className="mx-auto max-w-[1180px] px-4 sm:px-6 lg:px-8">
          {/* ── Hero ─────────────────────────────────────────────── */}
          <section className="relative py-14 sm:py-20 lg:py-24">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-24 left-1/2 h-[440px] w-[820px] -translate-x-1/2 opacity-70"
              style={{
                background:
                  'radial-gradient(50% 60% at 50% 0%, rgb(var(--color-brand-500) / 0.16), transparent 72%)',
              }}
            />
            <div className="relative grid items-center gap-12 lg:grid-cols-[1.04fr_0.96fr]">
              {/* Left */}
              <motion.div
                className="min-w-0"
                initial={reduceMotion ? undefined : { opacity: 0, y: 18 }}
                animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              >
                <span className="inline-flex items-center gap-2 rounded-full border border-subtle bg-surface-layer px-3.5 py-1.5 text-sm font-medium text-text-secondary shadow-soft">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                  Scholarship Engine · Public API
                </span>

                <h1 className="mt-6 font-display text-[clamp(2.15rem,4.6vw,3.6rem)] font-semibold leading-[1.04] tracking-tight text-text-primary text-balance">
                  Every scholarship and global opportunity, through{' '}
                  <span className="text-brand">one clean API.</span>
                </h1>

                <p className="mt-5 max-w-xl text-base leading-[1.7] text-text-secondary sm:text-lg">
                  The Edutu Scholarship Engine ingests thousands of sources daily and serves
                  scholarships, fellowships, internships and grants as a single normalized feed —
                  the same contract behind our web app, mobile client and admin.
                </p>

                {/* base URL */}
                <div className="mt-7 flex w-full min-w-0 items-center gap-2 rounded-xl border border-subtle bg-surface-layer py-1.5 pl-4 pr-1.5 shadow-soft sm:w-auto sm:max-w-full">
                  <span className="shrink-0 font-mono text-sm text-text-muted">GET</span>
                  <span className="min-w-0 truncate font-mono text-sm text-text-primary">{API_BASE}/opportunities</span>
                  <span className="ml-auto shrink-0 rounded-md text-text-muted">
                    <CopyButtonLight value={`${API_BASE}/opportunities`} />
                  </span>
                </div>

                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <a
                    href={docsUrl}
                    className="group inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3.5 text-base font-semibold text-white no-underline shadow-elevated transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-700"
                  >
                    Read the docs
                    <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-0.5" />
                  </a>
                  <Link
                    to="/opportunities"
                    className="inline-flex items-center gap-2 rounded-xl border border-strong bg-surface-layer px-6 py-3.5 text-base font-semibold text-text-primary no-underline transition-colors duration-200 hover:border-brand/50 hover:text-brand"
                  >
                    Browse the feed
                  </Link>
                </div>

                <div className="mt-8 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-text-muted">
                  <span className="font-semibold text-text-secondary">12,480+</span> live opportunities
                  <span aria-hidden="true" className="text-border-strong">·</span>
                  <span className="font-semibold text-text-secondary">31</span> countries
                  <span aria-hidden="true" className="text-border-strong">·</span>
                  refreshed daily
                </div>
              </motion.div>

              {/* Right — the API, made visible */}
              <motion.div
                className="min-w-0"
                initial={reduceMotion ? undefined : { opacity: 0, y: 24, scale: 0.98 }}
                animate={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.6, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
              >
                <CodeWindow
                  className="min-w-0"
                  label={
                    <span>
                      <span className="text-sky-300">GET</span> /v1/opportunities?category=scholarship
                    </span>
                  }
                  copyValue={`curl ${API_BASE}/opportunities?category=scholarship -H "Authorization: Bearer sk_live_..."`}
                >
                  <pre className="font-mono text-xs leading-[1.85] text-slate-200 sm:text-sm">
                    {jsonLines.map((line, i) => (
                      <motion.div
                        key={i}
                        initial={reduceMotion ? undefined : { opacity: 0, x: 6 }}
                        animate={reduceMotion ? undefined : { opacity: 1, x: 0 }}
                        transition={{ duration: 0.3, delay: 0.35 + i * 0.045 }}
                      >
                        {line}
                      </motion.div>
                    ))}
                  </pre>
                </CodeWindow>
              </motion.div>
            </div>
          </section>

          {/* ── Endpoints ────────────────────────────────────────── */}
          <motion.section {...reveal} className="scroll-mt-28 border-t border-subtle py-16 sm:py-20">
            <div className="max-w-2xl">
              <h2 className="font-display text-[clamp(1.7rem,2.6vw,2.5rem)] font-semibold leading-[1.05] tracking-tight text-text-primary">
                A small, honest API
              </h2>
              <p className="mt-4 text-base leading-[1.7] text-text-secondary">
                No SDK to learn and no surprises. A public read feed, a detail lookup, and two
                admin sync routes — every response is the same opportunity object.
              </p>
            </div>

            <div className="mt-9 overflow-hidden rounded-2xl border border-subtle bg-surface-layer shadow-soft">
              {endpoints.map((endpoint, i) => (
                <div
                  key={endpoint.path}
                  className={`group grid grid-cols-1 gap-x-8 gap-y-2 p-5 transition-colors duration-200 hover:bg-surface-elevated/70 sm:grid-cols-[minmax(0,300px)_1fr] sm:items-center sm:p-6 ${
                    i > 0 ? 'border-t border-subtle' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <MethodBadge method={endpoint.method} />
                    <code className="truncate font-mono text-sm font-medium text-text-primary">
                      {endpoint.path}
                    </code>
                  </div>
                  <div>
                    <div className="text-base font-semibold text-text-primary">{endpoint.title}</div>
                    <p className="mt-0.5 text-sm leading-[1.6] text-text-secondary">
                      {endpoint.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </motion.section>

          {/* ── One shape, every surface ─────────────────────────── */}
          <motion.section {...reveal} className="scroll-mt-28 border-t border-subtle py-16 sm:py-20">
            <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
              <div>
                <h2 className="font-display text-[clamp(1.7rem,2.6vw,2.5rem)] font-semibold leading-[1.05] tracking-tight text-text-primary">
                  One shape.
                  <br className="hidden sm:block" /> Every surface.
                </h2>
                <p className="mt-4 max-w-lg text-base leading-[1.7] text-text-secondary">
                  Web, mobile and admin all read the exact same opportunity object. Define the
                  fields once; render them anywhere — no per-client schema translation, ever.
                </p>

                <div className="mt-8 overflow-hidden rounded-2xl border border-subtle bg-surface-layer shadow-soft">
                  {surfaces.map((surface, i) => (
                    <div
                      key={surface.title}
                      className={`flex items-start gap-4 p-5 ${i > 0 ? 'border-t border-subtle' : ''}`}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                        <surface.icon size={18} />
                      </span>
                      <div>
                        <div className="text-base font-semibold text-text-primary">{surface.title}</div>
                        <p className="mt-0.5 text-sm leading-[1.55] text-text-secondary">
                          {surface.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <CodeWindow
                className="min-w-0"
                label={
                  <span className="inline-flex items-center gap-1.5">
                    <Braces size={13} className="text-slate-400" /> opportunity.ts
                  </span>
                }
              >
                <pre className="font-mono text-xs leading-[1.9] text-slate-200 sm:text-sm">
                  {schemaLines.map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </pre>
              </CodeWindow>
            </div>
          </motion.section>

          {/* ── Freshness pipeline (an earned sequence) ──────────── */}
          <motion.section {...reveal} className="scroll-mt-28 border-t border-subtle py-16 sm:py-20">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-xl">
                <h2 className="font-display text-[clamp(1.7rem,2.6vw,2.5rem)] font-semibold leading-[1.05] tracking-tight text-text-primary">
                  Fresh every single day
                </h2>
                <p className="mt-4 text-base leading-[1.7] text-text-secondary">
                  The feed you call is never stale. Behind every request is a pipeline that runs
                  around the clock so opportunities surface before their deadlines.
                </p>
              </div>
              <span className="inline-flex items-center gap-2 self-start rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-300 sm:self-auto">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Last sync · 4 min ago
              </span>
            </div>

            <ol className="relative mt-10 grid gap-5 md:grid-cols-3 md:gap-6">
              <div
                aria-hidden="true"
                className="absolute left-0 right-0 top-[34px] hidden h-px bg-gradient-to-r from-transparent via-border-strong to-transparent md:block"
              />
              {pipeline.map((stage) => (
                <li
                  key={stage.step}
                  className="relative rounded-2xl border border-subtle bg-surface-layer p-6 shadow-soft"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-brand text-white shadow-elevated ring-8 ring-surface-body">
                      <stage.icon size={22} />
                    </span>
                    <span className="font-mono text-sm font-semibold text-text-muted">{stage.step}</span>
                  </div>
                  <h3 className="mt-5 font-display text-lg font-semibold tracking-tight text-text-primary">
                    {stage.title}
                  </h3>
                  <p className="mt-2 text-sm leading-[1.6] text-text-secondary">
                    {stage.description}
                  </p>
                </li>
              ))}
            </ol>
          </motion.section>

          {/* ── Quickstart ───────────────────────────────────────── */}
          <motion.section {...reveal} className="scroll-mt-28 border-t border-subtle py-16 sm:py-20">
            <div className="grid items-center gap-10 lg:grid-cols-[0.95fr_1.05fr]">
              <div>
                <h2 className="font-display text-[clamp(1.7rem,2.6vw,2.5rem)] font-semibold leading-[1.05] tracking-tight text-text-primary">
                  Start in one request
                </h2>
                <p className="mt-4 max-w-md text-base leading-[1.7] text-text-secondary">
                  Generate a key in the developer dashboard, add it as a bearer token, and call
                  the feed. The docs cover pagination, filters, auth and rate limits.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <a
                    href={docsUrl}
                    aria-label="Open developer docs"
                    className="group inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3.5 text-base font-semibold text-white no-underline shadow-elevated transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-700"
                  >
                    Developer docs
                    <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-0.5" />
                  </a>
                  <Link
                    to="/developers"
                    aria-label="Open the developer dashboard"
                    className="inline-flex items-center gap-2 rounded-xl border border-strong bg-surface-layer px-6 py-3.5 text-base font-semibold text-text-primary no-underline transition-colors duration-200 hover:border-brand/50 hover:text-brand"
                  >
                    Get an API key
                  </Link>
                </div>
              </div>

              <CodeWindow
                className="min-w-0"
                label={
                  <span className="inline-flex items-center gap-1.5">
                    <Terminal size={13} className="text-slate-400" /> bash
                  </span>
                }
                copyValue={`curl ${API_BASE}/opportunities \\\n  -H "Authorization: Bearer sk_live_edutu"`}
              >
                <pre className="font-mono text-xs leading-[1.9] text-slate-200 sm:text-sm">
                  <div>
                    <span className="text-slate-500">$</span> <span className="text-sky-300">curl</span>{' '}
                    {API_BASE}/opportunities <span className="text-slate-500">\</span>
                  </div>
                  <div>
                    {'  '}-H <span className="text-emerald-300">"Authorization: Bearer sk_live_edutu"</span>
                  </div>
                  <div className="mt-3 text-slate-500"># → 200 OK · application/json</div>
                  <div className="text-slate-400">
                    {'{ '}
                    <span className="text-sky-300">"data"</span>: [ … ], <span className="text-sky-300">"total"</span>:{' '}
                    <span className="text-amber-300">12480</span>
                    {' }'}
                  </div>
                </pre>
              </CodeWindow>
            </div>
          </motion.section>
        </main>
      </div>
    </PublicEditorialShell>
  );
};

/** Copy button tuned for light chips (the base-URL pill). */
function CopyButtonLight({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* no-op */
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? 'Copied' : 'Copy request URL'}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition hover:bg-surface-elevated hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
    >
      {copied ? <Check size={15} className="text-emerald-500" /> : <Copy size={15} />}
    </button>
  );
}

export default ScholarshipApiPage;
