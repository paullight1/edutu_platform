import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Boxes,
  Check,
  ChevronDown,
  Copy,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import PublicHeader from './PublicHeader';
import SiteFooter from './SiteFooter';
import Seo from './Seo';
import { getDocsUrl } from '../lib/apiProductUrls';

const docsUrl = getDocsUrl();
// Clean vanity base for marketing examples — matches /scholarship-engine.
// The real, environment-specific base lives in the docs.
const apiBaseUrl = 'https://api.edutu.org/v1';

/* ────────────────────────────────────────────────────────────────────────
 * Content
 * ──────────────────────────────────────────────────────────────────────── */
const capabilities: {
  icon: LucideIcon;
  title: string;
  endpoint: string;
  body: string;
}[] = [
  {
    icon: Boxes,
    title: 'Opportunities API',
    endpoint: 'GET /v1/opportunities',
    body: 'The canonical feed of scholarships, fellowships, internships and grants across 31+ countries — cursor pagination, filters and one normalized shape.',
  },
  {
    icon: Sparkles,
    title: 'AI matching',
    endpoint: 'GET /v1/match',
    body: 'Ranked recommendations from a learner’s profile, goals and signals. Drop the same intelligence behind Edutu into your own surfaces.',
  },
  {
    icon: RefreshCw,
    title: 'Ingestion pipeline',
    endpoint: 'POST /v1/scraper/run',
    body: 'Trigger crawls and keep your inventory fresh from thousands of sources with a single call — no scrapers to maintain yourself.',
  },
  {
    icon: ShieldCheck,
    title: 'Keys & billing',
    endpoint: 'POST /v1/keys',
    body: 'Scoped API keys you can rotate or revoke, per-project usage tracking, and credit billing through Paystack.',
  },
];

const quicksteps: { icon: LucideIcon; title: string; body: string; hint: string }[] = [
  {
    icon: KeyRound,
    title: 'Create a key',
    body: 'Spin up a project in the developer dashboard and generate a scoped API key.',
    hint: 'sk_live_edutu_•••',
  },
  {
    icon: ShieldCheck,
    title: 'Authenticate',
    body: 'Send it as a bearer token — or the x-edutu-api-key header — on every request.',
    hint: 'Authorization: Bearer …',
  },
  {
    icon: ArrowUpRight,
    title: 'Ship',
    body: 'Call any endpoint and build. Pagination, filters and stable schemas are included.',
    hint: 'GET /v1/opportunities',
  },
];

const trust = [
  { value: '12K+', label: 'active opportunities' },
  { value: '31+', label: 'countries' },
  { value: '9', label: 'REST endpoints' },
  { value: '99.9%', label: 'uptime' },
];

/* Tabbed hero code — the same request in three languages */
type Lang = 'cURL' | 'JavaScript' | 'Python';
const codeTabs: { label: Lang; render: () => React.ReactNode; copy: string }[] = [
  {
    label: 'cURL',
    copy: `curl ${apiBaseUrl}/opportunities?limit=5 -H "Authorization: Bearer $EDUTU_API_KEY"`,
    render: () => (
      <>
        <div>
          <span className="text-sky-300">curl</span> {apiBaseUrl}/opportunities?limit=<span className="text-amber-300">5</span> <span className="text-slate-500">\</span>
        </div>
        <div>
          {'  '}-H <span className="text-emerald-300">"Authorization: Bearer $EDUTU_API_KEY"</span>
        </div>
      </>
    ),
  },
  {
    label: 'JavaScript',
    copy: `const res = await fetch(\n  "${apiBaseUrl}/opportunities?category=scholarships",\n  { headers: { "x-edutu-api-key": process.env.EDUTU_API_KEY } },\n);\nconst { data, meta } = await res.json();`,
    render: () => (
      <>
        <div>
          <span className="text-violet-300">const</span> res = <span className="text-violet-300">await</span> <span className="text-sky-300">fetch</span>(
        </div>
        <div>{'  '}<span className="text-emerald-300">"{apiBaseUrl}/opportunities?category=scholarships"</span>,</div>
        <div>{'  '}{'{'} headers: {'{'} <span className="text-emerald-300">"x-edutu-api-key"</span>: process.env.EDUTU_API_KEY {'}'} {'}'},</div>
        <div>);</div>
        <div><span className="text-violet-300">const</span> {'{'} data, meta {'}'} = <span className="text-violet-300">await</span> res.<span className="text-sky-300">json</span>();</div>
      </>
    ),
  },
  {
    label: 'Python',
    copy: `import requests\n\nres = requests.get(\n  "${apiBaseUrl}/opportunities",\n  headers={"Authorization": f"Bearer {API_KEY}"},\n  params={"sort": "updated_desc", "limit": 50},\n)\ndata = res.json()`,
    render: () => (
      <>
        <div><span className="text-violet-300">import</span> requests</div>
        <div>&nbsp;</div>
        <div>res = requests.<span className="text-sky-300">get</span>(</div>
        <div>{'  '}<span className="text-emerald-300">"{apiBaseUrl}/opportunities"</span>,</div>
        <div>{'  '}headers={'{'}<span className="text-emerald-300">"Authorization"</span>: <span className="text-emerald-300">f"Bearer {'{'}API_KEY{'}'}"</span>{'}'},</div>
        <div>{'  '}params={'{'}<span className="text-emerald-300">"sort"</span>: <span className="text-emerald-300">"updated_desc"</span>, <span className="text-emerald-300">"limit"</span>: <span className="text-amber-300">50</span>{'}'},</div>
        <div>)</div>
        <div>data = res.<span className="text-sky-300">json</span>()</div>
      </>
    ),
  },
];

const faqs = [
  { q: 'How do I get an API key?', a: 'Create an Edutu account, open the developer dashboard, and start a project. Each project gets a scoped key you can rotate or revoke at any time.' },
  { q: 'Is there a free tier?', a: 'Yes — new accounts receive free credits to test the API. Current pricing and rate limits live in the developer dashboard.' },
  { q: 'What data does the API cover?', a: 'Scholarships, fellowships, internships, grants and programs from 31+ countries. Every record carries title, organization, deadline, location, eligibility, benefits and an application URL.' },
  { q: 'How fresh is the data?', a: 'The feed updates continuously as new content is ingested through the scraper pipeline and manual curation.' },
  { q: 'Can I use it in a commercial product?', a: 'Yes. The API is built for school portals, scholarship directories, career platforms and community tools alike.' },
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

/* ────────────────────────────────────────────────────────────────────────
 * Page
 * ──────────────────────────────────────────────────────────────────────── */
const DevelopersLandingPage: React.FC = () => {
  const reduceMotion = useReducedMotion();
  const [tab, setTab] = useState(0);
  const [openFaq, setOpenFaq] = useState(-1);

  const reveal = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 24 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] as const },
      };

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-surface-body font-body text-text-primary">
      <Seo
        title="Developers — build on the Edutu platform"
        description="One API for scholarships, AI matching and ingestion — the platform behind Edutu's own apps. Get a key and ship your first opportunity-data integration in minutes."
        path="/developers"
        type="website"
      />
      <PublicHeader />

      <main className="relative z-10">
        {/* ── Hero ─────────────────────────────────────────────── */}
        <section className="relative px-4 pt-32 sm:px-6 sm:pt-40">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-[460px]"
            style={{ background: 'radial-gradient(52% 60% at 50% 0%, rgb(var(--color-brand-500) / 0.15), transparent 72%)' }}
          />
          <div className="relative mx-auto grid max-w-[1180px] items-center gap-12 lg:grid-cols-[1fr_1fr]">
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
                Edutu Platform · Developer API
              </span>

              <h1 className="mt-6 font-display text-[clamp(2.3rem,4.8vw,3.9rem)] font-semibold leading-[1.02] tracking-[-0.03em] text-text-primary text-balance">
                Build on the{' '}
                <span className="text-brand">opportunity layer</span> for Africa.
              </h1>

              <p className="mt-5 max-w-xl text-base leading-[1.7] text-text-secondary sm:text-lg">
                One API for scholarships, AI matching and ingestion — the same platform behind
                Edutu&rsquo;s own apps. Get a key and ship your first integration in minutes.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  to="/auth?mode=sign-up&redirect=/dashboard/developer"
                  className="group inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3.5 text-base font-semibold text-white no-underline shadow-elevated transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-700"
                >
                  Get API access
                  <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
                <a
                  href={docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-strong bg-surface-layer px-6 py-3.5 text-base font-semibold text-text-primary no-underline transition-colors duration-200 hover:border-brand/50 hover:text-brand"
                >
                  <BookOpen size={16} />
                  Documentation
                </a>
              </div>

              <dl className="mt-9 flex flex-wrap gap-x-7 gap-y-3">
                {trust.map((t) => (
                  <div key={t.label} className="flex items-baseline gap-1.5">
                    <dd className="font-display text-lg font-semibold text-text-primary">{t.value}</dd>
                    <dt className="text-sm text-text-muted">{t.label}</dt>
                  </div>
                ))}
              </dl>
            </motion.div>

            {/* Right — tabbed multi-language code */}
            <motion.div
              className="min-w-0"
              initial={reduceMotion ? undefined : { opacity: 0, y: 24, scale: 0.98 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-[#0b1020] shadow-[0_30px_60px_-30px_rgba(2,6,23,0.7)]">
                <div className="flex items-center border-b border-white/10 pr-2">
                  <div className="flex min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {codeTabs.map((t, i) => (
                      <button
                        key={t.label}
                        type="button"
                        onClick={() => setTab(i)}
                        className={`shrink-0 border-b-2 px-4 py-3 font-mono text-xs transition-colors ${
                          tab === i
                            ? 'border-sky-400 text-slate-100'
                            : 'border-transparent text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <CopyButton value={codeTabs[tab].copy} />
                </div>
                <div className="overflow-x-auto px-4 py-4 sm:px-5 sm:py-5">
                  <pre className="font-mono text-xs leading-[1.85] text-slate-200 sm:text-sm">
                    {codeTabs[tab].render()}
                  </pre>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* ── Capabilities ─────────────────────────────────────── */}
        <section className="px-4 py-24 sm:px-6 sm:py-28">
          <div className="mx-auto max-w-[1180px]">
            <motion.div {...reveal} className="max-w-2xl">
              <h2 className="font-display text-[clamp(1.9rem,3.4vw,2.9rem)] font-semibold leading-[1.06] tracking-tight text-text-primary">
                Every building block, one platform
              </h2>
              <p className="mt-4 text-base leading-[1.7] text-text-secondary">
                The same data, matching and ingestion that power Edutu — exposed as a small,
                predictable API you can build a whole product on.
              </p>
            </motion.div>

            <motion.div {...reveal} className="mt-11 overflow-hidden rounded-2xl border border-subtle bg-surface-layer shadow-soft">
              {capabilities.map((c, i) => {
                const Icon = c.icon;
                return (
                  <div
                    key={c.title}
                    className={`grid grid-cols-1 gap-x-8 gap-y-3 p-6 sm:grid-cols-[minmax(0,300px)_1fr] sm:items-start sm:p-7 ${
                      i > 0 ? 'border-t border-subtle' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3.5">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                        <Icon size={18} />
                      </span>
                      <div className="min-w-0">
                        <div className="text-base font-semibold text-text-primary">{c.title}</div>
                        <code className="font-mono text-xs text-text-muted">{c.endpoint}</code>
                      </div>
                    </div>
                    <p className="text-base leading-[1.7] text-text-secondary">{c.body}</p>
                  </div>
                );
              })}
            </motion.div>
          </div>
        </section>

        {/* ── Quickstart (earned 3-step) ───────────────────────── */}
        <section className="border-y border-subtle bg-surface-elevated px-4 py-24 sm:px-6 sm:py-28">
          <div className="mx-auto max-w-[1180px]">
            <motion.h2
              {...reveal}
              className="max-w-2xl font-display text-[clamp(1.9rem,3.4vw,2.9rem)] font-semibold leading-[1.06] tracking-tight text-text-primary"
            >
              From zero to your first call
            </motion.h2>

            <ol className="relative mt-12 grid gap-5 md:grid-cols-3 md:gap-6">
              <div
                aria-hidden="true"
                className="absolute left-0 right-0 top-[26px] hidden h-px bg-gradient-to-r from-transparent via-border-strong to-transparent md:block"
              />
              {quicksteps.map((s, i) => {
                const Icon = s.icon;
                return (
                  <motion.li
                    key={s.title}
                    {...reveal}
                    transition={reduceMotion ? undefined : { duration: 0.55, delay: 0.08 * i, ease: [0.16, 1, 0.3, 1] }}
                    className="relative rounded-2xl border border-subtle bg-surface-layer p-6 shadow-soft"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-brand text-white shadow-elevated ring-8 ring-surface-elevated">
                        <Icon size={20} />
                      </span>
                      <span className="font-mono text-sm font-semibold text-text-muted">0{i + 1}</span>
                    </div>
                    <h3 className="mt-5 font-display text-lg font-semibold tracking-tight text-text-primary">{s.title}</h3>
                    <p className="mt-2 text-sm leading-[1.6] text-text-secondary">{s.body}</p>
                    <div className="mt-4 truncate rounded-lg border border-subtle bg-surface-body px-3 py-2 font-mono text-xs text-text-secondary">
                      {s.hint}
                    </div>
                  </motion.li>
                );
              })}
            </ol>
          </div>
        </section>

        {/* ── FAQ ──────────────────────────────────────────────── */}
        <section className="px-4 py-24 sm:px-6 sm:py-28">
          <div className="mx-auto max-w-[820px]">
            <motion.h2
              {...reveal}
              className="font-display text-[clamp(1.9rem,3.4vw,2.9rem)] font-semibold leading-[1.06] tracking-tight text-text-primary"
            >
              Questions, answered
            </motion.h2>

            <div className="mt-10 divide-y divide-subtle border-y border-subtle">
              {faqs.map((faq, i) => {
                const isOpen = openFaq === i;
                return (
                  <div key={faq.q}>
                    <button
                      type="button"
                      onClick={() => setOpenFaq(isOpen ? -1 : i)}
                      className="flex w-full items-center justify-between gap-4 py-5 text-left"
                      aria-expanded={isOpen}
                    >
                      <span className="text-base font-semibold text-text-primary">{faq.q}</span>
                      <motion.span
                        animate={reduceMotion ? undefined : { rotate: isOpen ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                        className={`shrink-0 ${isOpen ? 'text-brand' : 'text-text-muted'}`}
                      >
                        <ChevronDown size={19} />
                      </motion.span>
                    </button>
                    <motion.div
                      initial={false}
                      animate={{ height: isOpen ? 'auto' : 0, opacity: isOpen ? 1 : 0 }}
                      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden"
                    >
                      <p className="pb-5 pr-8 text-base leading-[1.7] text-text-secondary">{faq.a}</p>
                    </motion.div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Close (navy code-native) ─────────────────────────── */}
        <section className="px-4 pb-24 sm:px-6 sm:pb-28">
          <motion.div
            {...reveal}
            className="relative mx-auto max-w-[1180px] overflow-hidden rounded-[28px] border border-white/10 bg-[#0b1020] px-6 py-16 text-center shadow-elevated sm:px-10 sm:py-20"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{ background: 'radial-gradient(70% 60% at 50% 0%, rgb(var(--color-brand-500) / 0.22), transparent 65%)' }}
            />
            <div className="relative mx-auto max-w-[640px]">
              <h2 className="font-display text-[clamp(1.9rem,3.6vw,3rem)] font-semibold leading-[1.06] tracking-tight text-white text-balance">
                Ship your first integration today
              </h2>
              <p className="mx-auto mt-4 max-w-lg text-base leading-[1.7] text-slate-300">
                Get a key, read the docs, and have opportunity data flowing into your product in
                minutes.
              </p>
              <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
                <Link
                  to="/auth?mode=sign-up&redirect=/dashboard/developer"
                  className="group inline-flex items-center gap-2 rounded-xl bg-white px-7 py-3.5 text-base font-semibold text-brand-700 no-underline shadow-elevated transition-all duration-200 hover:-translate-y-0.5"
                >
                  Get API access
                  <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
                <a
                  href={docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/25 px-7 py-3.5 text-base font-semibold text-white no-underline transition-colors duration-200 hover:bg-white/10"
                >
                  Read the docs
                </a>
              </div>
            </div>
          </motion.div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
};

export default DevelopersLandingPage;
