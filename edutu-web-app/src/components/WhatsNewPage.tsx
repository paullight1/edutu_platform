import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  BrainCircuit,
  CheckCircle2,
  FileQuestion,
  Globe2,
  LayoutDashboard,
  RefreshCw,
  Sparkles,
  Target,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import PageSeo from "./PageSeo";
import PublicHeader from "./PublicHeader";
import SiteFooter from "./SiteFooter";

interface UpdateItem {
  number: string;
  label: string;
  title: string;
  body: string;
  icon: LucideIcon;
  accent: string;
  detail: string;
}

const updates: UpdateItem[] = [
  {
    number: "01",
    label: "The Edutu Engine",
    title: "Smarter matching, with more of you in the picture.",
    body: "Our updated AI engine uses stronger profile signals to surface opportunities that fit your goals, interests, and next step — with clearer reasons behind every recommendation.",
    icon: BrainCircuit,
    accent: "bg-brand-50 text-brand-700 dark:bg-brand-950/70 dark:text-brand-200",
    detail: "Updated AI matching",
  },
  {
    number: "02",
    label: "The opportunity feed",
    title: "A more dependable way to find your next open door.",
    body: "We strengthened the web feed so recommendations hold up better through refreshes, intermittent network issues, and inconsistent source images. Your best shots should be there when you come back.",
    icon: RefreshCw,
    accent: "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-200",
    detail: "More reliable discovery",
  },
  {
    number: "03",
    label: "Edutu web app",
    title: "A calmer dashboard and a clearer mobile experience.",
    body: "Opportunity cards, dashboard recommendations, profile completion, preferences, and responsive layouts have all been refined to make the important action easier to see and take.",
    icon: LayoutDashboard,
    accent: "bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-200",
    detail: "UI and UX refresh",
  },
  {
    number: "04",
    label: "Edutu For You",
    title: "A bigger mission, made easier to understand.",
    body: "Edutu For You introduces the people, partners, and stories behind our goal to help one million young people access global opportunities — with a simpler path to learn, partner, or get involved.",
    icon: Globe2,
    accent: "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-200",
    detail: "Impact program launch",
  },
  {
    number: "05",
    label: "Support and docs",
    title: "Less hunting. More useful answers.",
    body: "The Help Centre and developer experience are being tightened too: clearer information architecture, more practical FAQs, and simpler paths to understand how Edutu works.",
    icon: FileQuestion,
    accent: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-200",
    detail: "Clearer guidance",
  },
];

const quickFacts = [
  { value: "AI", label: "matching engine" },
  { value: "31+", label: "countries covered" },
  { value: "1M", label: "young people in view" },
];

export default function WhatsNewPage() {
  const reduceMotion = useReducedMotion();
  const reveal = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 18 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: "-60px" },
      };

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-surface-body text-text-primary">
      <PageSeo path="/whats-new" />
      <PublicHeader darkAtTop />

      <main>
        <section className="relative overflow-hidden bg-[#091327] px-4 pb-16 pt-28 text-white sm:px-6 sm:pb-24 sm:pt-36">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{
              background:
                "radial-gradient(circle at 72% 22%, rgba(59,130,246,.28), transparent 30%), radial-gradient(circle at 8% 90%, rgba(34,211,238,.14), transparent 34%)",
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-[0.16]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.12) 1px, transparent 1px)",
              backgroundSize: "56px 56px",
              maskImage: "linear-gradient(to bottom, black, transparent 78%)",
            }}
          />

          <div className="relative mx-auto grid max-w-[1200px] items-end gap-12 lg:grid-cols-[1.05fr_.95fr] lg:gap-20">
            <motion.div
              initial={reduceMotion ? undefined : { opacity: 0, y: 18 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-blue-100">
                <Sparkles size={14} aria-hidden="true" />
                Product update
              </span>
              <h1 className="mt-6 max-w-[10ch] font-display text-5xl font-semibold leading-[0.98] tracking-[-0.045em] text-white sm:text-7xl">
                Edutu, now with more clarity.
              </h1>
              <p className="mt-6 max-w-[33rem] text-base leading-7 text-blue-100/80 sm:text-lg">
                We have been improving the way you discover, understand, and act on global opportunities.
              </p>
            </motion.div>

            <motion.div
              {...reveal}
              className="relative overflow-hidden rounded-[24px] border border-white/15 bg-white/[0.08] p-5 shadow-2xl backdrop-blur-sm sm:p-7"
            >
              <div className="absolute -right-12 -top-12 h-36 w-36 rounded-full bg-brand/30 blur-2xl" />
              <div className="relative">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm font-semibold text-white/70">The latest chapter</span>
                  <span className="rounded-full border border-white/15 px-2.5 py-1 text-xs text-white/60">2026</span>
                </div>
                <p className="mt-8 max-w-[18ch] font-display text-3xl font-semibold leading-tight tracking-[-0.03em] text-white sm:text-4xl">
                  Better signals. Better surfaces. Bigger reach.
                </p>
                <div className="mt-8 grid grid-cols-3 gap-2 border-t border-white/10 pt-5">
                  {quickFacts.map((fact) => (
                    <div key={fact.label}>
                      <p className="font-display text-xl font-semibold text-white sm:text-2xl">{fact.value}</p>
                      <p className="mt-1 text-[11px] leading-4 text-white/55 sm:text-xs">{fact.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-[1000px]">
            <motion.div {...reveal} className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.15em] text-brand">What changed</p>
              <h2 className="mt-4 font-display text-4xl font-semibold leading-tight tracking-[-0.035em] sm:text-5xl">
                A more useful Edutu, from the first tap to the final application.
              </h2>
              <p className="mt-5 max-w-[42rem] text-base leading-7 text-text-secondary sm:text-lg">
                Here is the short version of the work behind this release.
              </p>
            </motion.div>

            <div className="mt-12 space-y-4 sm:mt-16 sm:space-y-5">
              {updates.map((update) => {
                const Icon = update.icon;
                return (
                  <motion.article
                    key={update.number}
                    {...reveal}
                    className="group grid gap-6 rounded-[24px] border border-subtle bg-surface-layer p-5 shadow-soft transition duration-300 hover:-translate-y-0.5 hover:border-brand/35 hover:shadow-elevated sm:grid-cols-[72px_minmax(0,1fr)_auto] sm:items-start sm:gap-8 sm:p-7"
                  >
                    <span className="font-mono text-sm font-semibold text-text-muted">{update.number}</span>
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl ${update.accent}`}>
                          <Icon size={19} aria-hidden="true" />
                        </span>
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">{update.label}</p>
                      </div>
                      <h3 className="mt-5 max-w-[32rem] font-display text-2xl font-semibold leading-tight tracking-[-0.025em] sm:text-3xl">
                        {update.title}
                      </h3>
                      <p className="mt-3 max-w-[46rem] text-sm leading-6 text-text-secondary sm:text-base sm:leading-7">
                        {update.body}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-2 text-xs font-semibold text-brand sm:justify-self-end">
                      <CheckCircle2 size={15} aria-hidden="true" />
                      {update.detail}
                    </span>
                  </motion.article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="border-y border-subtle bg-surface-elevated px-4 py-16 sm:px-6 sm:py-24">
          <div className="mx-auto grid max-w-[1200px] items-center gap-10 lg:grid-cols-[.9fr_1.1fr] lg:gap-20">
            <motion.div {...reveal} className="relative overflow-hidden rounded-[28px] bg-[#101d38] p-7 text-white sm:p-10">
              <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-cyan-400/20 blur-3xl" />
              <div className="relative">
                <div className="flex items-center gap-3 text-blue-100">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10">
                    <UsersRound size={21} aria-hidden="true" />
                  </span>
                  <span className="text-sm font-semibold">Edutu For You</span>
                </div>
                <p className="mt-12 font-display text-4xl font-semibold leading-[1.02] tracking-[-0.035em] sm:text-5xl">
                  One million young people. One open door.
                </p>
                <Link
                  to="/edutuforyou"
                  className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#101d38] no-underline transition hover:-translate-y-0.5 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  Meet Edutu For You
                  <ArrowUpRight size={16} aria-hidden="true" />
                </Link>
              </div>
            </motion.div>

            <motion.div {...reveal}>
              <p className="text-sm font-semibold uppercase tracking-[0.15em] text-brand">The bigger picture</p>
              <h2 className="mt-4 max-w-[14ch] font-display text-4xl font-semibold leading-tight tracking-[-0.035em] sm:text-5xl">
                The product is improving because the mission is growing.
              </h2>
              <p className="mt-5 max-w-[38rem] text-base leading-7 text-text-secondary sm:text-lg">
                Edutu For You is the public impact program built around access: helping young people see opportunities earlier, and helping people who care about the future of Africa bring that access further.
              </p>
              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <div className="rounded-[20px] border border-subtle bg-surface-layer p-5">
                  <Target size={20} className="text-brand" aria-hidden="true" />
                  <h3 className="mt-4 font-display text-xl font-semibold">For learners</h3>
                  <p className="mt-2 text-sm leading-6 text-text-secondary">A clearer path from “I could” to “I applied.”</p>
                </div>
                <div className="rounded-[20px] border border-subtle bg-surface-layer p-5">
                  <Globe2 size={20} className="text-brand" aria-hidden="true" />
                  <h3 className="mt-4 font-display text-xl font-semibold">For partners</h3>
                  <p className="mt-2 text-sm leading-6 text-text-secondary">Infrastructure that helps good opportunities travel further.</p>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6 sm:py-24">
          <motion.div
            {...reveal}
            className="mx-auto flex max-w-[1000px] flex-col items-start justify-between gap-8 rounded-[28px] border border-brand/20 bg-brand-50 px-6 py-8 dark:bg-brand-950/50 sm:flex-row sm:items-center sm:px-10 sm:py-10"
          >
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.15em] text-brand">Try the update</p>
              <h2 className="mt-3 max-w-[18ch] font-display text-3xl font-semibold leading-tight tracking-[-0.03em] sm:text-4xl">
                Your next opportunity is already somewhere in the feed.
              </h2>
            </div>
            <Link
              to="/opportunities"
              className="inline-flex shrink-0 items-center gap-2 rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white no-underline transition hover:-translate-y-0.5 hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Explore opportunities
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </motion.div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
