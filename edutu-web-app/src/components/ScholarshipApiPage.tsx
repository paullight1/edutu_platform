import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Database, Globe, Server, Smartphone } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import PublicEditorialShell from './PublicEditorialShell';

const docsUrl = import.meta.env.VITE_DOCS_URL || 'https://docs.edutu.org';

type Endpoint = {
  method: string;
  path: string;
  title: string;
  description: string;
};

type Surface = {
  icon: React.ElementType;
  title: string;
  description: string;
  tintClass: string;
  accentClass: string;
};

const endpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/opportunities',
    title: 'List opportunities',
    description: 'Paginated public feed of scholarships, fellowships, internships, and programs.',
  },
  {
    method: 'GET',
    path: '/opportunities/:id',
    title: 'Get opportunity',
    description: 'Single normalized record for detail pages and share cards.',
  },
  {
    method: 'POST',
    path: '/api/scraper/run',
    title: 'Sync inventory',
    description: 'Trigger a refresh after scraper runs or manual edits.',
  },
  {
    method: 'GET',
    path: '/api/scraper/stats',
    title: 'Sync status',
    description: 'Check freshness, last run time, and ingestion health.',
  },
];

const surfaces: Surface[] = [
  {
    icon: Globe,
    title: 'Web app',
    description: 'SEO-ready public pages render from the same feed.',
    tintClass: 'bg-brand/10',
    accentClass: 'text-brand',
  },
  {
    icon: Smartphone,
    title: 'Mobile app',
    description: 'Expo client consumes the same backend URLs.',
    tintClass: 'bg-accent/10',
    accentClass: 'text-accent',
  },
  {
    icon: Server,
    title: 'Admin panel',
    description: 'Ingestion and review tools write to the same inventory.',
    tintClass: 'bg-success/10',
    accentClass: 'text-success',
  },
];

const schemaFields = [
  { group: 'Identity', fields: ['id', 'title', 'organization', 'category'] },
  { group: 'Discovery', fields: ['deadline', 'location', 'image', 'match'] },
  { group: 'Application', fields: ['description', 'requirements', 'benefits', 'applyUrl'] },
];

const ScholarshipApiPage: React.FC = () => {
  const reduceMotion = useReducedMotion();

  const fadeUp = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 24 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: '-60px' },
      };

  return (
    <PublicEditorialShell>
      <div className="min-h-[100dvh] overflow-x-hidden bg-surface-body">
        <main className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 lg:px-8 lg:py-12">

          <section className="scroll-mt-28 border-b border-subtle pb-10 sm:pb-12">
            <motion.div
              initial={reduceMotion ? undefined : { opacity: 0, y: 16 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-brand/40 bg-brand/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-brand">
                <Database size={14} />
                Scholarship Engine
              </div>

              <div className="mt-6 max-w-4xl space-y-5">
                <h1 className="font-display text-[clamp(2rem,3.5vw,3.4rem)] font-semibold leading-[1.06] tracking-tight text-text-primary">
                  One feed for scholarships and global opportunities.
                </h1>
                <p className="max-w-3xl text-[16px] leading-[1.8] text-text-secondary sm:text-[18px]">
                  Normalized API layer for scholarships, fellowships, internships, and programs.
                  Powers the web app, mobile client, and admin panel from a single data contract.
                </p>
              </div>

              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="#endpoints"
                  className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white no-underline shadow-elevated transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-700"
                >
                  View endpoints
                  <ArrowRight size={16} />
                </a>
                <Link
                  to="/opportunities"
                  className="inline-flex items-center gap-2 rounded-full border border-strong bg-surface-layer px-6 py-3 text-sm font-semibold text-text-primary no-underline transition-colors hover:border-brand/50"
                >
                  Browse opportunities
                </Link>
              </div>
            </motion.div>
          </section>

          <motion.section
            id="endpoints"
            {...fadeUp}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="scroll-mt-28 py-10 sm:py-12"
          >
            <div className="max-w-3xl">
              <h2 className="font-display text-[clamp(1.6rem,2.4vw,2.35rem)] font-semibold leading-[1.05] tracking-tight text-text-primary">
                Endpoints
              </h2>
              <p className="mt-4 text-[15px] leading-[1.75] text-text-secondary">
                Public feed, detail lookup, and admin sync.
              </p>
            </div>

            <div className="mt-8 flex flex-col gap-4">
              {endpoints.map((endpoint) => (
                <div
                  key={endpoint.path}
                  className="rounded-2xl border border-subtle bg-surface-layer p-5 shadow-soft transition-colors duration-300 hover:border-brand/40"
                >
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full border border-brand/40 bg-brand/10 px-3 py-1 text-[11px] font-bold tracking-[0.18em] text-brand">
                      {endpoint.method}
                    </span>
                    <span className="text-[12px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                      {endpoint.path}
                    </span>
                  </div>
                  <div className="mt-3 space-y-1">
                    <h3 className="text-lg font-semibold tracking-tight text-text-primary">
                      {endpoint.title}
                    </h3>
                    <p className="max-w-2xl text-[15px] leading-[1.75] text-text-secondary">
                      {endpoint.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </motion.section>

          <motion.section
            id="data-contract"
            {...fadeUp}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="scroll-mt-28 border-y border-subtle py-10 sm:py-12"
          >
            <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
              <div className="space-y-5">
                <h2 className="font-display text-[clamp(1.6rem,2.4vw,2.35rem)] font-semibold leading-[1.05] tracking-tight text-text-primary">
                  Data contract
                </h2>
                <p className="max-w-xl text-[15px] leading-[1.75] text-text-secondary">
                  Every surface reads the same opportunity object. Web, mobile, and admin share one shape — no schema translation between clients.
                </p>

                <div className="grid gap-3 sm:grid-cols-3">
                  {schemaFields.map((group) => (
                    <div
                      key={group.group}
                      className="rounded-2xl border border-subtle bg-surface-layer p-4 shadow-soft"
                    >
                      <div className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-brand">
                        {group.group}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {group.fields.map((field) => (
                          <span
                            key={field}
                            className="rounded-full border border-subtle bg-surface-elevated px-3 py-1 text-[12px] font-medium text-text-secondary"
                          >
                            {field}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-3">
                {surfaces.map((surface) => (
                  <div
                    key={surface.title}
                    className="rounded-2xl border border-subtle bg-surface-layer p-5 shadow-soft transition-colors duration-300 hover:border-brand/40"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${surface.tintClass} ${surface.accentClass}`}>
                        <surface.icon size={18} />
                      </div>
                      <div>
                        <h3 className="text-[16px] font-semibold text-text-primary">
                          {surface.title}
                        </h3>
                        <p className="text-[14px] leading-6 text-text-secondary">
                          {surface.description}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.section>

          <motion.section
            {...fadeUp}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="scroll-mt-28 py-10 sm:py-12"
          >
            <div className="rounded-3xl border border-subtle bg-gradient-to-br from-brand/[0.08] to-surface-layer p-6 shadow-soft sm:p-8">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="max-w-2xl space-y-2">
                  <h2 className="font-display text-[clamp(1.6rem,2.4vw,2.25rem)] font-semibold leading-[1.08] tracking-tight text-text-primary">
                    Get started
                  </h2>
                  <p className="text-[15px] leading-[1.75] text-text-secondary">
                    Documentation covers the payload shape, auth, and rate limits. The developer dashboard lets you issue API keys and monitor usage.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <a
                    href={docsUrl}
                    aria-label="Open developer docs"
                    className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white no-underline shadow-elevated transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-700"
                  >
                    Developer docs
                    <ArrowRight size={16} />
                  </a>
                  <Link
                    to="/developers"
                    aria-label="Open dashboard"
                    className="inline-flex items-center gap-2 rounded-full border border-strong bg-surface-layer px-6 py-3 text-sm font-semibold text-text-primary no-underline transition-colors hover:border-brand/50"
                  >
                    Dashboard
                  </Link>
                </div>
              </div>
            </div>
          </motion.section>
        </main>
      </div>
    </PublicEditorialShell>
  );
};

export default ScholarshipApiPage;
