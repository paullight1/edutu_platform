import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Database, Globe, Server, Smartphone } from 'lucide-react';
import { motion } from 'framer-motion';
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
  accent: string;
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
    accent: '#146ef5',
  },
  {
    icon: Smartphone,
    title: 'Mobile app',
    description: 'Expo client consumes the same backend URLs.',
    accent: '#7a3dff',
  },
  {
    icon: Server,
    title: 'Admin panel',
    description: 'Ingestion and review tools write to the same inventory.',
    accent: '#00b86b',
  },
];

const schemaFields = [
  { group: 'Identity', fields: ['id', 'title', 'organization', 'category'] },
  { group: 'Discovery', fields: ['deadline', 'location', 'image', 'match'] },
  { group: 'Application', fields: ['description', 'requirements', 'benefits', 'applyUrl'] },
];

const ScholarshipApiPage: React.FC = () => {
  return (
    <PublicEditorialShell>
      <div className="min-h-[100dvh] overflow-x-hidden bg-surface-body">
        <main className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 lg:px-8 lg:py-12">

          <section className="scroll-mt-28 border-b border-subtle pb-10 sm:pb-12">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.24em] text-brand-500">
                <Database size={14} />
                Scholarship Engine
              </div>

              <div className="mt-6 max-w-4xl space-y-5">
                <h1 className="text-[clamp(2rem,3.5vw,3.4rem)] font-medium leading-[1.06] tracking-[-0.05em] text-strong">
                  One feed for scholarships and global opportunities.
                </h1>
                <p className="max-w-3xl text-[16px] leading-[1.8] sm:text-[18px] text-soft">
                  Normalized API layer for scholarships, fellowships, internships, and programs.
                  Powers the web app, mobile client, and admin panel from a single data contract.
                </p>
              </div>

              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="#endpoints"
                  className="inline-flex items-center gap-2 rounded-full bg-brand-500 px-6 py-3 text-sm font-semibold text-white no-underline transition-all duration-300 hover:scale-[0.98] active:scale-[0.97]"
                >
                  View endpoints
                  <ArrowRight size={16} />
                </a>
                <Link
                  to="/opportunities"
                  className="inline-flex items-center gap-2 rounded-full border border-subtle bg-surface-layer px-6 py-3 text-sm font-semibold text-strong no-underline transition-all duration-300 hover:scale-[0.98] active:scale-[0.97]"
                >
                  Browse opportunities
                </Link>
              </div>
            </motion.div>
          </section>

          <motion.section
            id="endpoints"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="scroll-mt-28 py-10 sm:py-12"
          >
            <div className="max-w-3xl">
              <h2 className="text-[clamp(1.6rem,2.4vw,2.35rem)] font-medium leading-[1.05] tracking-[-0.045em] text-strong">
                Endpoints
              </h2>
              <p className="mt-4 text-[15px] leading-[1.75] text-soft">
                Public feed, detail lookup, and admin sync.
              </p>
            </div>

            <div className="mt-8 flex flex-col gap-4">
              {endpoints.map((endpoint) => (
                <div
                  key={endpoint.path}
                  className="rounded-2xl border border-subtle bg-surface-layer p-5 shadow-soft transition-colors duration-300 hover:border-brand-500/20"
                >
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full border border-brand-500/20 bg-brand-500/10 px-3 py-1 text-[11px] font-bold tracking-[0.18em] text-brand-500">
                      {endpoint.method}
                    </span>
                    <span className="text-[12px] font-semibold uppercase tracking-[0.18em] text-soft">
                      {endpoint.path}
                    </span>
                  </div>
                  <div className="mt-3 space-y-1">
                    <h3 className="text-lg font-semibold tracking-[-0.02em] text-strong">
                      {endpoint.title}
                    </h3>
                    <p className="max-w-2xl text-[15px] leading-[1.75] text-soft">
                      {endpoint.description}
                    </p>
                  </div>
                </div>
              ))}
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
            <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
              <div className="space-y-5">
                <h2 className="text-[clamp(1.6rem,2.4vw,2.35rem)] font-medium leading-[1.05] tracking-[-0.045em] text-strong">
                  Data contract
                </h2>
                <p className="max-w-xl text-[15px] leading-[1.75] text-soft">
                  Every surface reads the same opportunity object. Web, mobile, and admin share one shape — no schema translation between clients.
                </p>

                <div className="grid gap-3 sm:grid-cols-3">
                  {schemaFields.map((group) => (
                    <div
                      key={group.group}
                      className="rounded-xl border border-subtle bg-surface-layer p-4 shadow-soft"
                    >
                      <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.22em] text-brand-500">
                        {group.group}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {group.fields.map((field) => (
                          <span
                            key={field}
                            className="rounded-full border border-subtle bg-surface px-3 py-1 text-[12px] font-medium text-soft"
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
                    className="rounded-xl border border-subtle bg-surface-layer p-5 shadow-soft"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-xl"
                        style={{ backgroundColor: `${surface.accent}14`, color: surface.accent }}
                      >
                        <surface.icon size={18} />
                      </div>
                      <div>
                        <h3 className="text-[16px] font-semibold text-strong">
                          {surface.title}
                        </h3>
                        <p className="text-[14px] leading-6 text-soft">
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
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="scroll-mt-28 py-10 sm:py-12"
          >
            <div className="rounded-2xl border border-subtle bg-gradient-to-br from-brand-500/[0.06] to-surface p-6 shadow-soft sm:p-8">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="max-w-2xl space-y-2">
                  <h2 className="text-[clamp(1.6rem,2.4vw,2.25rem)] font-medium leading-[1.08] tracking-[-0.04em] text-strong">
                    Get started
                  </h2>
                  <p className="text-[15px] leading-[1.75] text-soft">
                    Documentation covers the payload shape, auth, and rate limits. The developer dashboard lets you issue API keys and monitor usage.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <a
                    href={docsUrl}
                    aria-label="Open developer docs"
                    className="inline-flex items-center gap-2 rounded-full bg-brand-500 px-6 py-3 text-sm font-semibold text-white no-underline transition-all duration-300 hover:scale-[0.98] active:scale-[0.97]"
                  >
                    Developer docs
                    <ArrowRight size={16} />
                  </a>
                  <Link
                    to="/developers"
                    aria-label="Open dashboard"
                    className="inline-flex items-center gap-2 rounded-full border border-subtle bg-surface-layer px-6 py-3 text-sm font-semibold text-strong no-underline transition-all duration-300 hover:scale-[0.98] active:scale-[0.97]"
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
