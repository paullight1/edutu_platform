import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Database, Globe, RefreshCw, Server, ShieldCheck, Smartphone } from 'lucide-react';
import { motion } from 'framer-motion';
import { useDarkMode } from '../hooks/useDarkMode';
import PublicEditorialShell from './PublicEditorialShell';

type Endpoint = {
  method: string;
  path: string;
  title: string;
  description: string;
  example: string;
};

type ContractGroup = {
  title: string;
  fields: string[];
};

type SurfaceCard = {
  icon: React.ComponentType<{ size?: number }>;
  title: string;
  subtitle: string;
  accent: string;
  points: string[];
};

const heroImage =
  'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1600&q=80';

const endpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/opportunities',
    title: 'Global opportunities API',
    description:
      'Fetch the live public feed for scholarships, fellowships, internships, and programs. This is the shared source of truth for list pages and search.',
    example: 'status=active · category=Scholarships · limit=12',
  },
  {
    method: 'GET',
    path: '/opportunities/:id',
    title: 'Scholarship detail API',
    description:
      'Load a single normalized record for SEO pages, share pages, and the application handoff experience.',
    example: 'opp_123 · cached fallback enabled',
  },
  {
    method: 'POST',
    path: '/api/scraper/run',
    title: 'Admin sync trigger',
    description:
      'Refresh the inventory after a scraper run or manual edit so web, mobile, and admin stay aligned.',
    example: 'processN8nWebhook(payload)',
  },
  {
    method: 'GET',
    path: '/api/scraper/stats',
    title: 'Sync status',
    description:
      'Check freshness, last run time, and ingestion health before you publish or review content.',
    example: 'lastRunAt · successRate · pendingItems',
  },
];

const contractGroups: ContractGroup[] = [
  {
    title: 'Identity',
    fields: ['id', 'title', 'organization', 'category'],
  },
  {
    title: 'Discovery',
    fields: ['deadline', 'location', 'image', 'match'],
  },
  {
    title: 'Application',
    fields: ['description', 'requirements', 'benefits', 'applyUrl'],
  },
];

const surfaceCards: SurfaceCard[] = [
  {
    icon: Globe,
    title: 'Web app',
    subtitle: 'SEO-ready public pages',
    accent: '#146ef5',
    points: [
      'Render the live feed with the same contract used across the platform.',
      'Use share pages for crawlers, previews, and deep links.',
      'Keep the opportunity detail page text-first and indexable.',
    ],
  },
  {
    icon: Smartphone,
    title: 'Mobile app',
    subtitle: 'Expo client',
    accent: '#7a3dff',
    points: [
      'Point the client at the same backend base URL.',
      'Reuse the feed for bookmarks, alerts, and application flows.',
      'Keep auth and opportunity data in one place.',
    ],
  },
  {
    icon: Server,
    title: 'Admin panel',
    subtitle: 'Ingestion + review',
    accent: '#00b86b',
    points: [
      'Manual updates and scrape jobs merge into the same inventory.',
      'Refresh the public feed after syncs without changing the schema.',
      'Use the same data shape for review, edits, and publishing.',
    ],
  },
];

const quickFacts = [
  {
    title: 'One schema',
    text: 'Web, mobile, and admin all read the same opportunity object.',
  },
  {
    title: 'SEO friendly',
    text: 'Share pages stay text-first so search engines can understand them.',
  },
  {
    title: 'Fallback safe',
    text: 'A cached snapshot keeps the feed available when syncs are delayed.',
  },
];

const ScholarshipApiPage: React.FC = () => {
  const { isDarkMode } = useDarkMode();

  const pageStyles = {
    backgroundColor: isDarkMode ? '#080808' : '#f7f9fc',
    color: isDarkMode ? '#f5f5f5' : '#080808',
  } as const;

  const panelStyles = {
    backgroundColor: isDarkMode ? '#111111' : '#ffffff',
    borderColor: isDarkMode ? '#232323' : '#dbe3ed',
    boxShadow: isDarkMode ? '0 24px 70px rgba(0,0,0,0.3)' : '0 20px 60px rgba(15, 23, 42, 0.06)',
  } as const;

  const mutedText = isDarkMode ? '#aab2c0' : '#5c6677';
  const headingText = isDarkMode ? '#fafafa' : '#0b1220';

  return (
    <PublicEditorialShell>
      <div className="px-4 py-10 sm:px-6 lg:px-8" style={pageStyles}>
        <div className="mx-auto max-w-[1200px] space-y-10 lg:space-y-14">
          <section className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45 }}
              className="space-y-6"
            >
              <div className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[11px] font-bold uppercase tracking-[0.24em] text-[#146ef5]"
                style={{ borderColor: isDarkMode ? '#253f67' : '#cfe0fb', backgroundColor: isDarkMode ? 'rgba(20, 110, 245, 0.08)' : '#eff6ff' }}
              >
                <Database size={14} />
                Scholarship API
              </div>

              <div className="space-y-4">
                <h1
                  className="max-w-3xl text-[clamp(2.2rem,4.8vw,4.7rem)] font-semibold leading-[0.96] tracking-[-0.06em]"
                  style={{ color: headingText }}
                >
                  One feed for scholarships and global opportunities.
                </h1>
                <p className="max-w-2xl text-[16px] leading-[1.8] sm:text-[18px]" style={{ color: mutedText }}>
                  The Edutu API keeps scholarships, fellowships, internships, and programs in one normalized layer.
                  Use it for SEO pages, mobile screens, admin syncs, and any surface that needs the same data contract.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <a
                  href="#endpoints"
                  className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold no-underline"
                  style={{ backgroundColor: '#146ef5', color: '#ffffff' }}
                >
                  View endpoints
                  <ArrowRight size={16} />
                </a>
                <Link
                  to="/docs"
                  className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold no-underline"
                  style={{
                    backgroundColor: isDarkMode ? '#0b0b0b' : '#ffffff',
                    color: headingText,
                    border: `1px solid ${isDarkMode ? '#2a2a2a' : '#d7e0eb'}`,
                  }}
                >
                  Open developer docs
                </Link>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {quickFacts.map((fact) => (
                  <div
                    key={fact.title}
                    className="rounded-[20px] border p-4"
                    style={panelStyles}
                  >
                    <div className="mb-2 flex items-center gap-2 text-[#146ef5]">
                      <CheckCircle2 size={15} />
                      <span className="text-[11px] font-bold uppercase tracking-[0.22em]">{fact.title}</span>
                    </div>
                    <p className="text-sm leading-6" style={{ color: mutedText }}>
                      {fact.text}
                    </p>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.05 }}
              className="rounded-[32px] border p-3 sm:p-4"
              style={panelStyles}
            >
              <div className="overflow-hidden rounded-[24px]">
                <img
                  src={heroImage}
                  alt="People collaborating around a laptop in a modern workspace"
                  className="h-[320px] w-full object-cover sm:h-[380px] lg:h-[460px]"
                />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {['Public feed', 'SEO pages', 'Mobile app', 'Admin sync'].map((item) => (
                  <span
                    key={item}
                    className="rounded-full border px-3 py-1 text-[12px] font-medium"
                    style={{
                      backgroundColor: isDarkMode ? '#0b0b0b' : '#f8fbff',
                      borderColor: isDarkMode ? '#262626' : '#dbe3ed',
                      color: mutedText,
                    }}
                  >
                    {item}
                  </span>
                ))}
              </div>
            </motion.div>
          </section>

          <section
            id="endpoints"
            className="scroll-mt-28 rounded-[28px] border p-5 sm:p-7"
            style={panelStyles}
          >
            <div className="max-w-3xl space-y-3">
              <div className="inline-flex items-center gap-2 text-[#146ef5]">
                <Database size={16} />
                <span className="text-[11px] font-bold uppercase tracking-[0.22em]">Core endpoints</span>
              </div>
              <h2 className="text-[clamp(1.7rem,2.5vw,2.5rem)] font-semibold tracking-[-0.04em]" style={{ color: headingText }}>
                Keep the public feed, share pages, and sync tools on one clean API surface.
              </h2>
              <p className="max-w-3xl text-[15px] leading-7 sm:text-[16px]" style={{ color: mutedText }}>
                The public API is intentionally small. Start with the live opportunities feed, load a single record when
                needed, and let the admin sync endpoints keep the inventory fresh.
              </p>
            </div>

            <div className="mt-6 divide-y" style={{ borderColor: isDarkMode ? '#232323' : '#dbe3ed' }}>
              {endpoints.map((endpoint) => (
                <div key={endpoint.path} className="grid gap-4 py-5 md:grid-cols-[180px_minmax(0,1fr)_240px] md:items-start">
                  <div className="space-y-2">
                    <div className="inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-bold tracking-[0.18em] text-[#146ef5]"
                      style={{ borderColor: isDarkMode ? '#253f67' : '#cfe0fb', backgroundColor: isDarkMode ? 'rgba(20, 110, 245, 0.08)' : '#eff6ff' }}
                    >
                      {endpoint.method}
                    </div>
                    <div className="text-[12px] font-semibold uppercase tracking-[0.18em]" style={{ color: mutedText }}>
                      {endpoint.path}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-[20px] font-semibold" style={{ color: headingText }}>
                      {endpoint.title}
                    </h3>
                    <p className="max-w-2xl text-[14px] leading-7 sm:text-[15px]" style={{ color: mutedText }}>
                      {endpoint.description}
                    </p>
                  </div>

                  <div
                    className="rounded-[20px] border px-4 py-3"
                    style={{
                      backgroundColor: isDarkMode ? '#0b0b0b' : '#f8fbff',
                      borderColor: isDarkMode ? '#262626' : '#dbe3ed',
                    }}
                  >
                    <div className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: mutedText }}>
                      Example
                    </div>
                    <p className="mt-1 text-sm leading-7" style={{ color: headingText }}>
                      {endpoint.example}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section id="data-contract" className="scroll-mt-28 grid gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4 }}
              className="space-y-5"
            >
              <div className="inline-flex items-center gap-2 text-[#146ef5]">
                <ShieldCheck size={16} />
                <span className="text-[11px] font-bold uppercase tracking-[0.22em]">Shared contract</span>
              </div>
              <h2 className="text-[clamp(1.7rem,2.6vw,2.6rem)] font-semibold tracking-[-0.04em]" style={{ color: headingText }}>
                One opportunity shape powers every Edutu surface.
              </h2>
              <p className="max-w-xl text-[15px] leading-7 sm:text-[16px]" style={{ color: mutedText }}>
                The same normalized object keeps the web feed, mobile app, and admin panel aligned. That makes the UI simpler,
                the SEO pages cleaner, and the sync pipeline easier to maintain.
              </p>

              <div className="space-y-3">
                {[
                  'Use the live feed first, then fall back to a cached snapshot when syncs are delayed.',
                  'Keep SEO share pages text-first so search engines can read the canonical opportunity details.',
                  'Push admin and scraper changes into the same inventory instead of forking data models.',
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-start gap-3 rounded-[18px] border p-4"
                    style={panelStyles}
                  >
                    <div className="mt-0.5 text-[#146ef5]">
                      <CheckCircle2 size={16} />
                    </div>
                    <p className="text-sm leading-6" style={{ color: mutedText }}>
                      {item}
                    </p>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: 0.05 }}
              className="grid gap-3 sm:grid-cols-3"
            >
              {contractGroups.map((group) => (
                <div
                  key={group.title}
                  className="rounded-[22px] border p-5"
                  style={panelStyles}
                >
                  <div className="mb-4 text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: '#146ef5' }}>
                    {group.title}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {group.fields.map((field) => (
                      <span
                        key={field}
                        className="rounded-full border px-3 py-1 text-[12px] font-medium"
                        style={{
                          backgroundColor: isDarkMode ? '#0b0b0b' : '#f8fbff',
                          borderColor: isDarkMode ? '#262626' : '#dbe3ed',
                          color: mutedText,
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

          <section id="platform-setup" className="scroll-mt-28 rounded-[28px] border p-5 sm:p-7" style={panelStyles}>
            <div className="max-w-3xl space-y-3">
              <WorkflowIcon />
              <h2 className="text-[clamp(1.7rem,2.6vw,2.6rem)] font-semibold tracking-[-0.04em]" style={{ color: headingText }}>
                The same opportunity layer powers web, mobile, and admin workflows.
              </h2>
              <p className="max-w-3xl text-[15px] leading-7 sm:text-[16px]" style={{ color: mutedText }}>
                Edutu keeps the public app, Expo client, and admin panel on one feed so every update ships with less friction.
              </p>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              {surfaceCards.map((card) => (
                <div
                  key={card.title}
                  className="rounded-[22px] border p-5"
                  style={{
                    backgroundColor: isDarkMode ? '#111111' : '#ffffff',
                    borderColor: isDarkMode ? '#232323' : '#dbe3ed',
                  }}
                >
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl" style={{ backgroundColor: `${card.accent}14`, color: card.accent }}>
                    <card.icon size={18} />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-[20px] font-semibold" style={{ color: headingText }}>
                      {card.title}
                    </h3>
                    <p className="text-[13px] font-medium uppercase tracking-[0.18em]" style={{ color: card.accent }}>
                      {card.subtitle}
                    </p>
                  </div>
                  <ul className="mt-4 space-y-3">
                    {card.points.map((point) => (
                      <li key={point} className="flex items-start gap-2 text-sm leading-6" style={{ color: mutedText }}>
                        <span className="mt-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#146ef5]/10 text-[#146ef5]">
                          <CheckCircle2 size={12} />
                        </span>
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section
            id="support"
            className="scroll-mt-28 rounded-[28px] border p-6 sm:p-8"
            style={{
              ...panelStyles,
              background: isDarkMode
                ? 'linear-gradient(135deg, rgba(20,110,245,0.08), rgba(17,17,17,0.96))'
                : 'linear-gradient(135deg, #f8fbff, #ffffff)',
            }}
          >
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-2xl space-y-3">
                <div className="inline-flex items-center gap-2 text-[#146ef5]">
                  <RefreshCw size={16} />
                  <span className="text-[11px] font-bold uppercase tracking-[0.22em]">Support</span>
                </div>
                <h2 className="text-[clamp(1.5rem,2.4vw,2.3rem)] font-semibold tracking-[-0.04em]" style={{ color: headingText }}>
                  Need the payload shape or sync flow? The docs and live feed stay in sync.
                </h2>
                <p className="text-[15px] leading-7 sm:text-[16px]" style={{ color: mutedText }}>
                  Open the developer docs for implementation notes, then jump to the public opportunities feed to see the same
                  data in action.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  to="/docs"
                  className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold no-underline"
                  style={{ backgroundColor: '#146ef5', color: '#ffffff' }}
                >
                  Open developer docs
                  <ArrowRight size={16} />
                </Link>
                <Link
                  to="/opportunities"
                  className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold no-underline"
                  style={{
                    backgroundColor: isDarkMode ? '#0b0b0b' : '#ffffff',
                    color: headingText,
                    border: `1px solid ${isDarkMode ? '#2a2a2a' : '#d7e0eb'}`,
                  }}
                >
                  Browse opportunities
                </Link>
              </div>
            </div>
          </section>
        </div>
      </div>
    </PublicEditorialShell>
  );
};

const WorkflowIcon = () => (
  <div className="inline-flex items-center gap-2 text-[#146ef5]">
    <Server size={16} />
    <span className="text-[11px] font-bold uppercase tracking-[0.22em]">Platform setup</span>
  </div>
);

export default ScholarshipApiPage;
