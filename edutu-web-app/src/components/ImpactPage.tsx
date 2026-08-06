import React from "react";
import { Link } from "react-router-dom";
import {
  motion,
  useReducedMotion,
  type Variants,
} from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Building2,
  Coins,
  Cpu,
  Download,
  FileText,
  Globe2,
  Heart,
  Lightbulb,
  Lock,
  Quote,
  Scale,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import PublicHeader from "./PublicHeader";
import SiteFooter from "./SiteFooter";
import Seo from "./Seo";

/** The downloadable flagship research report (served from /public). */
const IMPACT_REPORT_PDF = "/reports/edutu-opportunity-gap-report.pdf";
const IMPACT_REPORT_FILENAME =
  "Edutu-Research-Report-001-Opportunity-Gap.pdf";

/* ────────────────────────────────────────────────────────────────────────────
 * Motion helpers — mirrors the house style used across the marketing pages.
 * ──────────────────────────────────────────────────────────────────────────*/
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] },
  },
};

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.07, delayChildren: 0.04 },
  },
};

/* ────────────────────────────────────────────────────────────────────────────
 * Content — single source of truth. Wire these to a CMS / impact API when the
 * numbers become live; today they are the figures used across Edutu marketing.
 * ──────────────────────────────────────────────────────────────────────────*/
const GAP_FACTS = [
  {
    icon: Coins,
    chip: "bg-warning/[0.16] text-warning",
    stat: "$100M+",
    label: "in scholarships go unclaimed every year",
    body: "Not because students aren't qualified — because they never heard about them in time.",
  },
  {
    icon: Scale,
    chip: "bg-info/[0.14] text-info",
    stat: "9 in 10",
    label: "opportunities are found through who you know",
    body: "Where you were born and who's in your network still decides who gets a fair chance.",
  },
  {
    icon: Lightbulb,
    chip: "bg-accent/[0.14] text-accent",
    stat: "1 email",
    label: "can be the difference between regret and a new life",
    body: "One application discovered before the deadline can change a family for generations.",
  },
  {
    icon: Globe2,
    chip: "bg-danger/[0.12] text-danger",
    stat: "1 in 100",
    label: "ever hears about the funding meant for them",
    body: "Distance, language and paywalls keep opportunities out of reach. We bring them into one place, in plain words, on any phone.",
  },
];

const JOURNEY = [
  { year: "2021", title: "Top100 begins", body: "The Top100 Africa Future Leaders community launches — celebrating first-class graduates and connecting them to global opportunities." },
  { year: "2022", title: "The community grows", body: "Thousands of ambitious young Africans join. Word spreads that opportunity can be shared, not hoarded." },
  { year: "2023", title: "31 countries reached", body: "The network crosses borders — students, graduates and mentors span 31 countries across the continent and diaspora." },
  { year: "2024", title: "500+ graduates profiled", body: "Over 500 first-class graduates are recognised, and 78.3% go on to access global opportunities." },
  { year: "2025", title: "Edutu is founded", body: "The lessons of Top100 become a product: an AI platform to put opportunity discovery in every young person's pocket." },
  { year: "2026", title: "The Edutu Engine launches", body: "Responsible AI now scans, summarises and matches thousands of live opportunities to each learner — automatically." },
  { year: "Next", title: "An AI Coach for Africa", body: "A personal guide for every learner — in their language, on their phone — closing the opportunity gap at scale." },
];

const REACH_TREND = [
  { year: "2021", value: 5 },
  { year: "2022", value: 14 },
  { year: "2023", value: 30 },
  { year: "2024", value: 45 },
  { year: "2025", value: 58 },
  { year: "2026", value: 67 },
]; // thousands of young people reached (cumulative)

const CATEGORY_MIX = [
  { label: "Scholarships", pct: 34, bar: "bg-brand" },
  { label: "Internships", pct: 22, bar: "bg-accent" },
  { label: "Fellowships", pct: 16, bar: "bg-success" },
  { label: "Grants", pct: 12, bar: "bg-warning" },
  { label: "Jobs", pct: 9, bar: "bg-info" },
  { label: "Competitions", pct: 7, bar: "bg-danger" },
];

interface Story {
  name: string;
  role: string;
  image: string;
  quote: string;
  impact: string;
}

const STORIES: Story[] = [
  {
    name: "Amara",
    role: "Scholarship recipient · Kenya",
    image: "https://images.pexels.com/photos/762020/pexels-photo-762020.jpeg?auto=compress&cs=tinysrgb&w=640",
    quote: "I found a fully-funded scholarship I never knew existed — three weeks before the deadline.",
    impact: "Full scholarship secured",
  },
  {
    name: "David",
    role: "Software intern · Nigeria",
    image: "https://images.pexels.com/photos/2379004/pexels-photo-2379004.jpeg?auto=compress&cs=tinysrgb&w=640",
    quote: "Edutu tracked every deadline for me. I landed my first internship at a company I admired.",
    impact: "First internship landed",
  },
  {
    name: "Zainab",
    role: "Grant winner · Ghana",
    image: "https://images.pexels.com/photos/1181690/pexels-photo-1181690.jpeg?auto=compress&cs=tinysrgb&w=640",
    quote: "The AI helped me understand what the funders actually wanted. My proposal finally clicked.",
    impact: "$10k founder grant won",
  },
  {
    name: "Kwame",
    role: "Fellowship · Rwanda",
    image: "https://images.pexels.com/photos/2182970/pexels-photo-2182970.jpeg?auto=compress&cs=tinysrgb&w=640",
    quote: "I went from confused to a focused shortlist of real fellowships, then joined a global cohort.",
    impact: "Global fellowship joined",
  },
];

const TOP100_STATS = [
  { value: "31", label: "Countries" },
  { value: "67,000", label: "People reached" },
  { value: "500+", label: "Graduates recognised" },
  { value: "78.3%", label: "Accessed global opportunities" },
];

const PARTNERS = [
  { name: "Harvard", logo: "https://commons.wikimedia.org/wiki/Special:FilePath/Harvard_University_logo.svg" },
  { name: "MIT", logo: "https://commons.wikimedia.org/wiki/Special:FilePath/MIT_logo.svg" },
  { name: "Stanford", logo: "https://commons.wikimedia.org/wiki/Special:FilePath/Stanford_wordmark_(2012).svg" },
  { name: "Oxford", logo: "https://commons.wikimedia.org/wiki/Special:FilePath/University_of_Oxford.svg" },
  { name: "Cambridge", logo: "https://commons.wikimedia.org/wiki/Special:FilePath/University_of_Cambridge_coat_of_arms.svg" },
  { name: "Yale", logo: "https://commons.wikimedia.org/wiki/Special:FilePath/Yale_University_logo.svg" },
  { name: "Berkeley", logo: "https://commons.wikimedia.org/wiki/Special:FilePath/University_of_California,_Berkeley_logo.svg" },
  { name: "Princeton", logo: "https://commons.wikimedia.org/wiki/Special:FilePath/Princeton_text_logo.svg" },
  { name: "Columbia", logo: "https://commons.wikimedia.org/wiki/Special:FilePath/Columbia_University_1754_updated.svg" },
  { name: "Imperial", logo: "https://commons.wikimedia.org/wiki/Special:FilePath/Imperial_logo.svg" },
  { name: "Cornell", logo: "https://commons.wikimedia.org/wiki/Special:FilePath/Cornell_University_logo.svg" },
  { name: "Duke", logo: "https://commons.wikimedia.org/wiki/Special:FilePath/Duke_University_logo.svg" },
];

const TRANSPARENCY = [
  { icon: ShieldCheck, title: "How we measure impact", body: "Reach counts unique young people who engaged with Edutu or Top100 programmes. Opportunities shared counts distinct listings surfaced to users. We report cumulative totals unless stated." },
  { icon: FileText, title: "Definitions", body: "\"Reached\" means an interaction with our platform, community or events. \"Success story\" means a self-reported or verified outcome — an offer, admission, grant or role." },
  { icon: Search, title: "Data sources", body: "Figures combine product analytics, verified partner reporting and the Top100 community records. Live opportunity counts are pulled directly from our public catalogue." },
  { icon: Cpu, title: "Responsible AI", body: "Our AI assists — it never decides for you. We design against bias, keep a human in the loop, and are transparent about what the models can and can't do." },
  { icon: Lock, title: "Privacy & trust", body: "We collect only what helps you find opportunities, never sell personal data, and let you export or delete your information at any time." },
  { icon: TrendingUp, title: "Kept honest", body: "Numbers are reviewed each quarter and refreshed here. Where a figure is an estimate, we say so rather than overstate our reach." },
];

const FUTURE_GOALS = [
  { icon: Users, title: "Reach 1 million young Africans", progress: 7, label: "67k reached so far" },
  { icon: Target, title: "Surface 100,000 live opportunities", progress: 42, label: "Growing every week" },
  { icon: Globe2, title: "Active in all 54 African countries", progress: 57, label: "31 of 54 today" },
  { icon: Cpu, title: "A personal AI Coach for every learner", progress: 30, label: "In active development" },
  { icon: BookOpen, title: "Support 15+ local languages", progress: 60, label: "9 languages live" },
  { icon: Building2, title: "200 university & employer partners", progress: 20, label: "40+ partners today" },
];

// Cycled color accents so card grids read as a deliberate spectrum instead of a
// monochrome wall. Only the icon chip + progress bar take the hue; numbers and
// labels keep ink, since amber/green fail contrast as small text on light.
const CARD_ACCENTS = [
  { chip: "bg-brand/[0.12] text-brand", bar: "bg-brand" },
  { chip: "bg-accent/[0.12] text-accent", bar: "bg-accent" },
  { chip: "bg-success/[0.14] text-success", bar: "bg-success" },
  { chip: "bg-warning/[0.16] text-warning", bar: "bg-warning" },
  { chip: "bg-info/[0.12] text-info", bar: "bg-info" },
  { chip: "bg-danger/[0.12] text-danger", bar: "bg-danger" },
];

/* ────────────────────────────────────────────────────────────────────────────
 * Small reusable pieces
 * ──────────────────────────────────────────────────────────────────────────*/
const Eyebrow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">
    {children}
  </span>
);

const SectionHeading: React.FC<{
  eyebrow: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  center?: boolean;
  reveal: Record<string, unknown>;
}> = ({ eyebrow, title, subtitle, center = false, reveal }) => (
  <div className={`mb-14 max-w-2xl ${center ? "mx-auto text-center" : ""}`}>
    <motion.div {...reveal}>
      <Eyebrow>{eyebrow}</Eyebrow>
    </motion.div>
    <motion.h2
      {...reveal}
      className="mt-4 font-display text-4xl font-semibold leading-[1.08] tracking-tight text-text-primary sm:text-5xl"
    >
      {title}
    </motion.h2>
    {subtitle ? (
      <motion.p
        {...reveal}
        className={`mt-4 text-lg leading-relaxed text-text-secondary sm:text-lg ${center ? "mx-auto" : ""} max-w-[640px]`}
      >
        {subtitle}
      </motion.p>
    ) : null}
  </div>
);

function StoryCard({
  story,
  variants,
}: {
  story: Story;
  variants?: Variants;
}) {
  return (
    <motion.article
      variants={variants}
      className="group overflow-hidden rounded-3xl border border-subtle bg-surface-layer shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-brand/40 hover:shadow-elevated"
    >
      <div className="relative h-[220px] overflow-hidden">
        <img
          src={story.image}
          alt={story.name}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
          decoding="async"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(8,18,36,0.05) 0%, rgba(8,18,36,0.55) 100%)",
          }}
        />
        <span className="absolute bottom-4 left-4 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-2xs font-semibold uppercase tracking-[0.12em] text-brand shadow-soft">
          <Sparkles size={12} /> {story.impact}
        </span>
      </div>
      <div className="p-6">
        <Quote size={22} className="text-brand/40" />
        <p className="mt-2 text-base leading-relaxed text-text-primary">
          {story.quote}
        </p>
        <div className="mt-5 border-t border-subtle pt-4">
          <div className="text-base font-semibold text-text-primary">
            {story.name}
          </div>
          <div className="text-sm text-text-muted">{story.role}</div>
        </div>
      </div>
    </motion.article>
  );
}

/** SVG area chart — cumulative young people reached, animated on view. */
function GrowthChart({ reveal }: { reveal: Record<string, unknown> }) {
  const reduceMotion = useReducedMotion();
  const W = 640;
  const H = 260;
  const PAD_X = 8;
  const PAD_TOP = 24;
  const PAD_BOTTOM = 34;
  const max = 72;

  const pts = REACH_TREND.map((d, i) => {
    const x = PAD_X + (i / (REACH_TREND.length - 1)) * (W - PAD_X * 2);
    const y =
      H - PAD_BOTTOM - (d.value / max) * (H - PAD_TOP - PAD_BOTTOM);
    return { ...d, x, y };
  });

  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const area = `${line} L${pts[pts.length - 1].x},${H - PAD_BOTTOM} L${pts[0].x},${H - PAD_BOTTOM} Z`;

  return (
    <motion.div
      {...reveal}
      className="rounded-3xl border border-subtle bg-surface-layer p-6 shadow-soft sm:p-8"
    >
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-text-muted">
            Young people reached
          </div>
          <div className="font-display text-3xl font-semibold text-text-primary">
            67,000+
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success">
          <TrendingUp size={13} /> +1,240% since 2021
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label="Cumulative young people reached from 2021 to 2026, rising to 67,000"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="impactArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--color-brand-500))" stopOpacity="0.35" />
            <stop offset="100%" stopColor="rgb(var(--color-brand-500))" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0.25, 0.5, 0.75, 1].map((g) => {
          const y = H - PAD_BOTTOM - g * (H - PAD_TOP - PAD_BOTTOM);
          return (
            <line
              key={g}
              x1={PAD_X}
              x2={W - PAD_X}
              y1={y}
              y2={y}
              stroke="rgb(var(--border-subtle))"
              strokeWidth="1"
              strokeDasharray="4 6"
            />
          );
        })}

        <motion.path
          d={area}
          fill="url(#impactArea)"
          initial={reduceMotion ? undefined : { opacity: 0 }}
          whileInView={reduceMotion ? undefined : { opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.5 }}
        />
        <motion.path
          d={line}
          fill="none"
          stroke="rgb(var(--color-brand-500))"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={reduceMotion ? undefined : { pathLength: 0 }}
          whileInView={reduceMotion ? undefined : { pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.3, ease: "easeInOut" }}
        />

        {pts.map((p, i) => (
          <g key={p.year}>
            <motion.circle
              cx={p.x}
              cy={p.y}
              r="4.5"
              fill="rgb(var(--surface-layer))"
              stroke="rgb(var(--color-brand-500))"
              strokeWidth="3"
              initial={reduceMotion ? undefined : { scale: 0, opacity: 0 }}
              whileInView={reduceMotion ? undefined : { scale: 1, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4 + i * 0.12 }}
            />
            <text
              x={p.x}
              y={H - 10}
              textAnchor="middle"
              style={{
                fontSize: 13,
                fontWeight: 600,
                fill: "rgb(var(--text-muted))",
              }}
            >
              {p.year}
            </text>
          </g>
        ))}
      </svg>
    </motion.div>
  );
}

function CategoryBars({ reveal }: { reveal: Record<string, unknown> }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      {...reveal}
      className="rounded-3xl border border-subtle bg-surface-layer p-6 shadow-soft sm:p-8"
    >
      <div className="mb-6">
        <div className="text-sm font-medium text-text-muted">
          What we surface
        </div>
        <div className="font-display text-xl font-semibold text-text-primary">
          Opportunity mix
        </div>
      </div>
      <div className="space-y-4">
        {CATEGORY_MIX.map((c, i) => (
          <div key={c.label}>
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="font-medium text-text-primary">{c.label}</span>
              <span className="font-semibold text-text-muted">{c.pct}%</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-surface-elevated">
              <motion.div
                className={`h-full rounded-full ${c.bar}`}
                initial={reduceMotion ? { width: `${c.pct}%` } : { width: 0 }}
                whileInView={{ width: `${c.pct}%` }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.9, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Page
 * ──────────────────────────────────────────────────────────────────────────*/
const ImpactPage: React.FC = () => {
  const reduceMotion = useReducedMotion();

  const reveal = reduceMotion
    ? {}
    : {
        variants: fadeUp,
        initial: "hidden" as const,
        whileInView: "visible" as const,
        viewport: { once: true, margin: "-80px" },
      };
  const stagger = reduceMotion
    ? {}
    : {
        variants: staggerContainer,
        initial: "hidden" as const,
        whileInView: "visible" as const,
        viewport: { once: true, margin: "-80px" },
      };
  const childVariants = reduceMotion ? undefined : fadeUp;


  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-surface-body font-body text-text-primary">
      <Seo
        title="Our Impact — Edutu"
        description="Proof, not promises. See how Edutu is closing Africa's opportunity gap with responsible AI — countries reached, young people served, scholarships shared, and the stories behind the numbers."
        path="/impact"
      />
      <PublicHeader />

      <main className="relative z-10">
        {/* ── Hero ─────────────────────────────────────────────── */}
        <section className="relative flex items-center overflow-hidden px-4 pt-32 pb-20 sm:px-6 sm:pt-40 sm:pb-28">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-[620px]"
            style={{
              background:
                "radial-gradient(58% 60% at 50% 0%, rgb(var(--color-brand-500) / 0.18), transparent 72%)",
            }}
          />
          <div className="relative z-10 mx-auto flex w-full max-w-[900px] flex-col items-center text-center">
            <motion.div
              initial={reduceMotion ? undefined : { opacity: 0, y: 16 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mb-7 inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/10 px-4 py-1.5"
            >
              <Sparkles size={14} className="text-brand" />
              <span className="text-2xs font-semibold uppercase tracking-[0.2em] text-brand">
                Our Impact
              </span>
            </motion.div>

            <motion.h1
              initial={reduceMotion ? undefined : { opacity: 0, y: 30 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="font-display text-[clamp(2.5rem,7vw,4.5rem)] font-semibold leading-[1.03] tracking-[-0.03em] text-balance text-text-primary"
            >
              Every opportunity has the power to{" "}
              <span className="text-brand">change a life.</span>
            </motion.h1>

            <motion.p
              initial={reduceMotion ? undefined : { opacity: 0, y: 20 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.15 }}
              className="mt-6 max-w-[640px] text-base leading-relaxed text-text-secondary sm:text-lg"
            >
              Edutu exists to close Africa's opportunity gap with responsible AI.
              This is not a marketing page — it's the evidence. Real reach, real
              numbers, and the young people behind them.
            </motion.p>

            <motion.div
              initial={reduceMotion ? undefined : { opacity: 0, y: 20 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="mt-9 flex w-full flex-col gap-3 sm:w-auto sm:flex-row"
            >
              <a
                href="#impact-glance"
                className="group inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-8 py-4 text-base font-semibold text-white shadow-elevated transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-700"
              >
                Explore our impact
                <ArrowRight
                  size={16}
                  className="transition-transform duration-200 group-hover:translate-x-1"
                />
              </a>
              <Link
                to="/auth?mode=sign-in"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-strong bg-surface-layer/70 px-8 py-4 text-base font-semibold text-text-primary no-underline backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/50"
              >
                Join our mission
              </Link>
            </motion.div>

            <motion.div
              initial={reduceMotion ? undefined : { opacity: 0 }}
              animate={reduceMotion ? undefined : { opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.45 }}
              className="mt-14 grid w-full grid-cols-2 gap-px overflow-hidden rounded-2xl border border-subtle bg-border-subtle sm:grid-cols-4"
            >
              {TOP100_STATS.map((s) => (
                <div key={s.label} className="bg-surface-layer px-4 py-5">
                  <div className="font-display text-2xl font-semibold text-text-primary sm:text-3xl">
                    {s.value}
                  </div>
                  <div className="mt-1 text-xs font-medium leading-tight text-text-muted">
                    {s.label}
                  </div>
                </div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ── Why our work matters (opportunity gap) ───────────── */}
        <section className="border-t border-subtle bg-surface-elevated px-4 py-24 sm:px-6">
          <div className="mx-auto max-w-[1200px]">
            <div className="grid gap-14 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
              <div>
                <SectionHeading
                  eyebrow="Why our work matters"
                  title={
                    <>
                      Talent is everywhere.{" "}
                      <span className="text-brand">Opportunity isn't.</span>
                    </>
                  }
                  subtitle="Across Africa, brilliant young people miss life-changing opportunities — not for lack of talent, but for lack of information. This is the gap we close."
                  reveal={reveal}
                />
                <motion.div {...reveal}>
                  <Link
                    to="/what-we-believe"
                    className="inline-flex items-center gap-2 rounded-xl border border-subtle px-5 py-3 text-base font-semibold text-text-primary no-underline transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/40 hover:text-brand"
                  >
                    Read what we believe <ArrowUpRight size={16} />
                  </Link>
                </motion.div>
              </div>

              <motion.div {...stagger} className="grid gap-4">
                {GAP_FACTS.map((fact) => {
                  const Icon = fact.icon;
                  return (
                    <motion.div
                      key={fact.label}
                      variants={childVariants}
                      className="flex gap-5 rounded-3xl border border-subtle bg-surface-layer p-6 shadow-soft"
                    >
                      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${fact.chip}`}>
                        <Icon size={22} />
                      </div>
                      <div>
                        <div className="font-display text-3xl font-semibold leading-none text-text-primary">
                          {fact.stat}
                        </div>
                        <div className="mt-1 text-base font-semibold text-text-primary">
                          {fact.label}
                        </div>
                        <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                          {fact.body}
                        </p>
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            </div>
          </div>
        </section>

        {/* ── By the numbers (charts) ──────────────────────────── */}
        <section className="border-t border-subtle bg-surface-elevated px-4 py-24 sm:px-6">
          <div className="mx-auto max-w-[1200px]">
            <SectionHeading
              eyebrow="By the numbers"
              title={
                <>
                  Growth you can{" "}
                  <span className="text-brand">see</span>
                </>
              }
              subtitle="Reach compounding year over year, and the balanced mix of opportunities we surface for every kind of ambition."
              reveal={reveal}
            />
            <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
              <GrowthChart reveal={reveal} />
              <CategoryBars reveal={reveal} />
            </div>
          </div>
        </section>

        {/* ── Stories that inspire ─────────────────────────────── */}
        <section className="border-t border-subtle bg-surface-elevated px-4 py-24 sm:px-6">
          <div className="mx-auto max-w-[1200px]">
            <SectionHeading
              eyebrow="Stories that inspire"
              title={
                <>
                  Behind every number,{" "}
                  <span className="text-brand">a person</span>
                </>
              }
              subtitle="The reach only matters because of what it means for real young people. Here are a few of them."
              reveal={reveal}
            />
            <motion.div
              {...stagger}
              className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4"
            >
              {STORIES.map((story) => (
                <StoryCard key={story.name} story={story} variants={childVariants} />
              ))}
            </motion.div>
          </div>
        </section>

        {/* ── Journey timeline ─────────────────────────────────── */}
        <section className="border-t border-subtle px-4 py-24 sm:px-6">
          <div className="mx-auto max-w-[880px]">
            <SectionHeading
              eyebrow="Our journey"
              title={
                <>
                  From a community to a{" "}
                  <span className="text-brand">continent-wide movement</span>
                </>
              }
              subtitle="Edutu didn't start as an app. It started as a promise to recognise talent and share opportunity."
              center
              reveal={reveal}
            />

            <motion.div {...stagger} className="relative">
              <div
                className="absolute left-[19px] top-2 bottom-2 w-px bg-border-subtle sm:left-1/2 sm:-ml-px"
                aria-hidden="true"
              />
              <div className="space-y-8">
                {JOURNEY.map((item, i) => (
                  <motion.div
                    key={item.year}
                    variants={childVariants}
                    className={`relative flex items-start gap-6 sm:gap-8 ${
                      i % 2 === 0 ? "sm:flex-row" : "sm:flex-row-reverse"
                    }`}
                  >
                    <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-4 border-surface-body bg-brand text-xs font-semibold text-white shadow-soft sm:absolute sm:left-1/2 sm:-ml-5">
                      {i + 1}
                    </div>
                    <div
                      className={`flex-1 rounded-3xl border border-subtle bg-surface-layer p-6 shadow-soft sm:max-w-[calc(50%-2.5rem)] ${
                        i % 2 === 0 ? "sm:mr-auto sm:text-right" : "sm:ml-auto"
                      }`}
                    >
                      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">
                        {item.year}
                      </span>
                      <h3 className="mt-1 font-display text-xl font-semibold text-text-primary">
                        {item.title}
                      </h3>
                      <p className="mt-2 text-base leading-relaxed text-text-secondary">
                        {item.body}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        {/* ── Top100 origin ────────────────────────────────────── */}
        <section className="border-t border-subtle bg-surface-elevated px-4 py-24 sm:px-6">
          <div className="mx-auto max-w-[1200px]">
            <div className="overflow-hidden rounded-[36px] border border-subtle bg-surface-layer shadow-soft">
              <div className="grid lg:grid-cols-2">
                <div className="p-8 sm:p-12 lg:p-14">
                  <Eyebrow>Where it began</Eyebrow>
                  <h2 className="mt-4 font-display text-3xl font-semibold text-text-primary sm:text-4xl">
                    Top100 Africa{" "}
                    <span className="text-brand">Future Leaders</span>
                  </h2>
                  <p className="mt-4 text-base leading-relaxed text-text-secondary">
                    Edutu grew out of Top100 — a movement that recognised
                    first-class graduates and connected them to global
                    opportunities. It proved something simple and powerful: when
                    you show young Africans the door, they walk through it.
                  </p>
                  <div className="mt-8 grid grid-cols-2 gap-4">
                    {TOP100_STATS.map((s) => (
                      <div
                        key={s.label}
                        className="rounded-2xl border border-subtle bg-surface-body p-4"
                      >
                        <div className="font-display text-2xl font-semibold text-text-primary">
                          {s.value}
                        </div>
                        <div className="mt-0.5 text-xs font-medium leading-tight text-text-muted">
                          {s.label}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="relative min-h-[280px] lg:min-h-full">
                  <img
                    src="https://images.pexels.com/photos/8199562/pexels-photo-8199562.jpeg?auto=compress&cs=tinysrgb&w=1000"
                    alt="Young African graduates celebrating together"
                    className="absolute inset-0 h-full w-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                  <div
                    className="absolute inset-0"
                    style={{
                      background:
                        "linear-gradient(120deg, rgba(20,25,38,0.35) 0%, rgba(20,25,38,0) 55%)",
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Partners & recognition ───────────────────────────── */}
        <section className="border-t border-subtle bg-surface-elevated px-4 py-24 sm:px-6">
          <div className="mx-auto max-w-[1200px]">
            <SectionHeading
              eyebrow="Where opportunities come from"
              title={
                <>
                  Opportunities from the world's{" "}
                  <span className="text-brand">top institutions</span>
                </>
              }
              center
              reveal={reveal}
            />

            <motion.div
              {...stagger}
              className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-4 lg:grid-cols-6"
            >
              {PARTNERS.map((partner) => (
                <motion.div
                  key={partner.name}
                  variants={childVariants}
                  className="group flex h-[84px] items-center justify-center rounded-2xl border border-subtle bg-white px-3 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-brand/40 hover:shadow-elevated"
                >
                  <img
                    src={partner.logo}
                    alt={partner.name}
                    className="max-h-[30px] max-w-[100px] object-contain transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                    decoding="async"
                    style={{ width: "auto", height: "auto" }}
                    onError={(e) => {
                      const target = e.currentTarget;
                      target.style.display = "none";
                      const parent = target.parentElement;
                      if (parent && !parent.querySelector("[data-fallback]")) {
                        const label = document.createElement("span");
                        label.textContent = partner.name;
                        label.setAttribute("data-fallback", "true");
                        label.className =
                          "text-center font-display text-sm font-semibold text-text-secondary";
                        parent.appendChild(label);
                      }
                    }}
                  />
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ── Transparency & methodology ───────────────────────── */}
        <section className="border-t border-subtle px-4 py-24 sm:px-6">
          <div className="mx-auto max-w-[1200px]">
            <SectionHeading
              eyebrow="Transparency"
              title={
                <>
                  How we hold ourselves{" "}
                  <span className="text-brand">accountable</span>
                </>
              }
              subtitle="Impact claims mean nothing without method. Here's exactly how we count, what our words mean, and the principles we won't compromise."
              reveal={reveal}
            />
            <motion.div
              {...stagger}
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            >
              {TRANSPARENCY.map((item, i) => {
                const Icon = item.icon;
                const accent = CARD_ACCENTS[i % CARD_ACCENTS.length];
                return (
                  <motion.div
                    key={item.title}
                    variants={childVariants}
                    className="rounded-3xl border border-subtle bg-surface-layer p-7 shadow-soft"
                  >
                    <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-2xl ${accent.chip}`}>
                      <Icon size={20} />
                    </div>
                    <h3 className="font-display text-lg font-semibold text-text-primary">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                      {item.body}
                    </p>
                  </motion.div>
                );
              })}
            </motion.div>
          </div>
        </section>

        {/* ── Future goals ─────────────────────────────────────── */}
        <section className="border-t border-subtle bg-surface-elevated px-4 py-24 sm:px-6">
          <div className="mx-auto max-w-[1200px]">
            <SectionHeading
              eyebrow="Where we're going"
              title={
                <>
                  Our goals for the{" "}
                  <span className="text-brand">next chapter</span>
                </>
              }
              subtitle="Ambitious, measurable, and public — so you can hold us to them."
              reveal={reveal}
            />
            <motion.div
              {...stagger}
              className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
            >
              {FUTURE_GOALS.map((goal, i) => {
                const Icon = goal.icon;
                const accent = CARD_ACCENTS[i % CARD_ACCENTS.length];
                return (
                  <motion.div
                    key={goal.title}
                    variants={childVariants}
                    className="rounded-3xl border border-subtle bg-surface-layer p-7 shadow-soft"
                  >
                    <div className="flex items-start gap-4">
                      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${accent.chip}`}>
                        <Icon size={20} />
                      </div>
                      <h3 className="font-display text-lg font-semibold leading-snug text-text-primary">
                        {goal.title}
                      </h3>
                    </div>
                    <div className="mt-5">
                      <div className="mb-1.5 flex items-center justify-between text-xs font-semibold">
                        <span className="text-text-muted">{goal.label}</span>
                        <span className="text-text-primary">{goal.progress}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-surface-elevated">
                        <motion.div
                          className={`h-full rounded-full ${accent.bar}`}
                          initial={
                            reduceMotion
                              ? { width: `${goal.progress}%` }
                              : { width: 0 }
                          }
                          whileInView={{ width: `${goal.progress}%` }}
                          viewport={{ once: true, margin: "-40px" }}
                          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                        />
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          </div>
        </section>

        {/* ── Final CTA ────────────────────────────────────────── */}
        <section className="px-4 py-28 sm:px-6">
          <div className="mx-auto max-w-[1000px] overflow-hidden rounded-[36px] bg-gradient-to-br from-brand-500 to-brand-700 p-10 text-center shadow-elevated sm:p-16 lg:p-20">
            <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15">
              <Heart size={26} className="text-white" />
            </div>
            <h2 className="mx-auto max-w-[720px] font-display text-3xl font-semibold leading-[1.1] tracking-tight text-white sm:text-5xl">
              Help us close Africa's opportunity gap
            </h2>
            <p className="mx-auto mt-5 max-w-[560px] text-lg leading-relaxed text-white/85 sm:text-lg">
              The full story behind our mission is on the record — read the
              flagship research, then join us. One opportunity really can change
              a life.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href={IMPACT_REPORT_PDF}
                download={IMPACT_REPORT_FILENAME}
                className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-8 py-4 text-base font-semibold text-brand no-underline shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-elevated sm:w-auto"
              >
                <Download size={18} /> Download the report (PDF)
              </a>
              <Link
                to="/auth?mode=sign-in"
                className="group inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/40 bg-white/10 px-8 py-4 text-base font-semibold text-white no-underline backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/20 sm:w-auto"
              >
                Join Edutu
                <ArrowRight
                  size={16}
                  className="transition-transform duration-200 group-hover:translate-x-1"
                />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
};

export default ImpactPage;
