import React from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  MessagesSquare,
  Users,
  Globe,
  Sparkles,
  Trophy,
  HeartHandshake,
  Quote,
  type LucideIcon,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import PublicHeader from "./PublicHeader";
import SiteFooter from "./SiteFooter";
import Seo from "./Seo";
import CommunityShowcase from "./CommunityShowcase";

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const },
  },
};

const stagger = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

/**
 * Hero photo cluster — a staggered magazine grid of learner portraits on
 * vivid colour cards, echoing the reference "charming" fashion hero but
 * dressed in Edutu's community story. Each card keeps its colour if the
 * remote image fails, so the layout never collapses.
 */
type HeroCard = {
  src: string;
  alt: string;
  bg: string;
  className: string;
};

const heroCards: HeroCard[] = [
  {
    src: "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=400&q=80&auto=format&fit=crop",
    alt: "Learner sharing a win with the community",
    bg: "bg-amber-300",
    className: "h-40 sm:h-44",
  },
  {
    src: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&q=80&auto=format&fit=crop",
    alt: "Member celebrating an admission",
    bg: "bg-sky-400",
    className: "h-32 sm:h-36",
  },
  {
    src: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&q=80&auto=format&fit=crop",
    alt: "Scholar in a study cohort",
    bg: "bg-rose-300",
    className: "h-32 sm:h-36",
  },
];

const centerCard: HeroCard = {
  src: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=520&q=80&auto=format&fit=crop",
  alt: "Edutu community member",
  bg: "bg-brand-500",
  className: "h-64 sm:h-80",
};

const rightCards: HeroCard[] = [
  {
    src: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&q=80&auto=format&fit=crop",
    alt: "Mentor guiding an applicant",
    bg: "bg-violet-500",
    className: "h-32 sm:h-36",
  },
  {
    src: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400&q=80&auto=format&fit=crop",
    alt: "Learner asking Edutu for help",
    bg: "bg-emerald-300",
    className: "h-32 sm:h-36",
  },
  {
    src: "https://images.unsplash.com/photo-1552058544-f2b08422138a?w=400&q=80&auto=format&fit=crop",
    alt: "Future leader from the Edutu network",
    bg: "bg-orange-300",
    className: "h-40 sm:h-44",
  },
];

function PhotoCard({ card }: { card: HeroCard }) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl ${card.bg} ${card.className} shadow-soft`}
    >
      <img
        src={card.src}
        alt={card.alt}
        loading="lazy"
        className="h-full w-full object-cover mix-blend-multiply"
        onError={(event) => {
          event.currentTarget.style.display = "none";
        }}
      />
    </div>
  );
}

interface Stat {
  icon: LucideIcon;
  value: string;
  label: string;
  accent: string;
  tint: string;
}

const stats: Stat[] = [
  {
    icon: Users,
    value: "50K+",
    label: "Members",
    accent: "text-brand",
    tint: "bg-brand/10",
  },
  {
    icon: Globe,
    value: "31+",
    label: "Countries",
    accent: "text-success",
    tint: "bg-success/10",
  },
  {
    icon: HeartHandshake,
    value: "800+",
    label: "Mentors",
    accent: "text-accent",
    tint: "bg-accent/10",
  },
  {
    icon: Trophy,
    value: "3.2K",
    label: "Wins shared",
    accent: "text-warning",
    tint: "bg-warning/10",
  },
];

interface Pillar {
  icon: LucideIcon;
  title: string;
  desc: string;
  bg: string;
  iconColor: string;
  titleColor: string;
  descColor: string;
}

const pillars: Pillar[] = [
  {
    icon: MessagesSquare,
    title: "Study & apply together",
    desc: "Join cohorts working toward the same scholarships and fellowships. Swap essays, deadlines, and honest feedback.",
    bg: "linear-gradient(180deg,#fbe9c6 0%,#f6dca4 100%)",
    iconColor: "#d97706",
    titleColor: "#4a3410",
    descColor: "#7a5f2c",
  },
  {
    icon: HeartHandshake,
    title: "Mentors who reply",
    desc: "Past awardees and professionals answer questions, review applications, and open doors that used to feel closed.",
    bg: "linear-gradient(180deg,#e4dbf7 0%,#d7cbf2 100%)",
    iconColor: "#7c3aed",
    titleColor: "#2f2154",
    descColor: "#5b4a8a",
  },
  {
    icon: Trophy,
    title: "Celebrate real wins",
    desc: "Every admission, grant, and offer gets shared — proof that opportunities are reachable from an everyday phone.",
    bg: "linear-gradient(180deg,#d3e8f7 0%,#c2ddf1 100%)",
    iconColor: "#0369a1",
    titleColor: "#123650",
    descColor: "#3c5b72",
  },
];

interface Voice {
  quote: string;
  name: string;
  role: string;
}

const voices: Voice[] = [
  {
    quote:
      "I found my Mastercard Foundation cohort here. We reviewed each other's essays until 2am — three of us got in.",
    name: "Amara O.",
    role: "Scholar, Nigeria",
  },
  {
    quote:
      "A mentor in the community read my personal statement twice. That feedback changed everything about my Chevening app.",
    name: "Kwame A.",
    role: "Fellow, Ghana",
  },
  {
    quote:
      "I used to search alone and give up. Now I have people who send me deadlines before they close.",
    name: "Lydia M.",
    role: "Member, Kenya",
  },
];

const CommunityPage: React.FC = () => {
  const reduceMotion = useReducedMotion();

  return (
    <div className="min-h-[100dvh] bg-surface-body text-text-primary">
      <Seo
        title="Community — Edutu"
        description="Join a community of 50,000+ African learners, mentors, and future leaders discovering, applying for, and winning global opportunities together."
        path="/community"
      />
      <PublicHeader />

      <main>
        {/* ── Hero ─────────────────────────────────────────────── */}
        <section className="relative mx-auto w-full max-w-6xl px-4 pt-10 pb-16 sm:px-6 sm:pt-14 lg:px-8">
          {/* decorative accents */}
          <Sparkles
            className="pointer-events-none absolute left-4 top-24 hidden text-amber-400 sm:block"
            size={22}
          />
          <Sparkles
            className="pointer-events-none absolute right-6 top-16 hidden text-rose-400 sm:block"
            size={18}
          />

          <motion.div
            variants={stagger}
            initial="hidden"
            animate="visible"
            className="relative"
          >
            {/* headline */}
            <motion.div variants={fadeUp} className="mx-auto max-w-3xl text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-subtle bg-surface-layer px-3 py-1 text-xs font-semibold uppercase tracking-wider text-text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                The Edutu Community
              </span>
              <h1 className="mt-5 font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
                Rise Together With a
                <br className="hidden sm:block" /> Community That{" "}
                <span className="text-brand">Backs You</span>
              </h1>
            </motion.div>

            {/* explore badge — top right */}
            <motion.div
              variants={fadeUp}
              className="absolute -top-2 right-0 hidden lg:block"
            >
              <div className="relative h-28 w-28">
                <motion.svg
                  viewBox="0 0 120 120"
                  className="h-full w-full"
                  animate={reduceMotion ? undefined : { rotate: 360 }}
                  transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                >
                  <defs>
                    <path
                      id="communityBadgeArc"
                      d="M60,60 m-42,0 a42,42 0 1,1 84,0 a42,42 0 1,1 -84,0"
                      fill="none"
                    />
                  </defs>
                  <text className="fill-text-secondary text-[10px] font-semibold uppercase tracking-[0.25em]">
                    <textPath href="#communityBadgeArc">
                      Join the community • meet your people •
                    </textPath>
                  </text>
                </motion.svg>
                <span className="absolute inset-0 m-auto flex h-11 w-11 items-center justify-center rounded-full bg-brand text-white shadow-elevated">
                  <ArrowUpRight size={18} />
                </span>
              </div>
            </motion.div>

            {/* left supporting copy */}
            <motion.div
              variants={fadeUp}
              className="absolute left-0 top-28 hidden w-48 lg:block"
            >
              <div className="text-xs font-semibold uppercase tracking-wider text-brand">
                Where learners meet
              </div>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                Cohorts, mentors, and honest feedback for every scholarship
                season.
              </p>
            </motion.div>

            {/* photo cluster */}
            <motion.div
              variants={fadeUp}
              className="mx-auto mt-10 grid max-w-4xl grid-cols-2 items-center gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5"
            >
              {/* far-left single card */}
              <div className="hidden lg:block">
                <PhotoCard card={heroCards[0]} />
              </div>

              {/* left stacked pair. Mobile order puts both stacked pairs on
                  the first row and the tall center card full-width beneath —
                  DOM order would leave half-empty rows on a 2-col grid. */}
              <div className="order-1 flex flex-col gap-3 sm:order-none sm:gap-4">
                <PhotoCard card={heroCards[1]} />
                <PhotoCard card={heroCards[2]} />
              </div>

              {/* center tall card */}
              <div className="relative order-3 col-span-2 sm:order-none sm:col-span-1">
                <motion.span
                  aria-hidden
                  animate={reduceMotion ? undefined : { rotate: 360 }}
                  transition={{
                    duration: 16,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                  className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 text-brand-700"
                >
                  <Sparkles size={26} className="fill-brand-500 text-brand-700" />
                </motion.span>
                <PhotoCard card={centerCard} />
              </div>

              {/* right stacked pair */}
              <div className="order-2 flex flex-col gap-3 sm:order-none sm:gap-4">
                <PhotoCard card={rightCards[0]} />
                <PhotoCard card={rightCards[1]} />
              </div>

              {/* far-right single card + tag */}
              <div className="hidden lg:block">
                <PhotoCard card={rightCards[2]} />
                <div className="mt-2 text-right text-xs font-bold tracking-wide text-text-muted">
                  #EdutuFam
                </div>
              </div>
            </motion.div>

            {/* bottom row: quote · scroll · featured */}
            <motion.div
              variants={fadeUp}
              className="mt-12 grid items-end gap-8 lg:grid-cols-3"
            >
              {/* quote + signature */}
              <div className="max-w-xs">
                <Quote className="text-text-muted" size={24} />
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                  “I stopped searching alone. The community sends me deadlines
                  before they close and reads my essays like they’re their own.”
                </p>
                <div className="mt-3 font-display text-lg italic text-text-primary">
                  Amara O.
                </div>
              </div>

              {/* join CTA — first thing under the photos on mobile, where
                  the three-column row collapses into a stack. */}
              <div className="order-first flex justify-center lg:order-none lg:-mt-8">
                <Link
                  to="/auth?mode=sign-up"
                  className="inline-flex items-center gap-2 rounded-full bg-brand px-8 py-4 text-base font-bold text-white shadow-elevated transition hover:-translate-y-0.5 hover:bg-brand-700"
                >
                  Join the community
                  <ArrowRight size={18} />
                </Link>
              </div>

              {/* featured callout */}
              <div className="flex items-center justify-between gap-4 lg:justify-end">
                <div className="text-left lg:text-right">
                  <div className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                    Since 2022 · Community
                  </div>
                  <div className="mt-1 flex items-center justify-start gap-3 lg:justify-end">
                    <span className="font-display text-3xl font-semibold text-text-primary">
                      01
                    </span>
                    <span className="max-w-[10rem] text-sm font-medium leading-snug text-text-secondary">
                      Show up, ask boldly, and win together.
                    </span>
                  </div>
                </div>
                <Link
                  to="#community-join"
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-text-primary text-surface-body transition hover:-translate-y-0.5 hover:shadow-elevated"
                  aria-label="Join the community"
                >
                  <ArrowRight size={18} />
                </Link>
              </div>
            </motion.div>
          </motion.div>
        </section>

        {/* ── Stats strip ──────────────────────────────────────── */}
        <section className="border-y border-subtle bg-surface-layer">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-10 sm:px-6 lg:grid-cols-4 lg:px-8">
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="flex items-center gap-3">
                  <span
                    className={`flex h-11 w-11 items-center justify-center rounded-xl ${stat.tint} ${stat.accent}`}
                  >
                    <Icon size={20} />
                  </span>
                  <div>
                    <div className="font-display text-2xl font-semibold text-text-primary">
                      {stat.value}
                    </div>
                    <div className="text-xs font-medium uppercase tracking-wider text-text-muted">
                      {stat.label}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Pillars ──────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="rounded-[32px] border border-subtle bg-surface-elevated p-6 shadow-soft sm:p-10 lg:p-12">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-display text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
                More than a feed — it’s people
              </h2>
              <p className="mt-4 text-base leading-relaxed text-text-secondary sm:text-lg">
                Edutu started as a search engine for opportunities. The community
                is what makes people actually apply — and get in.
              </p>
            </div>

            <div className="mt-10 grid gap-4 sm:gap-5 md:grid-cols-3">
              {pillars.map((pillar) => {
                const Icon = pillar.icon;
                return (
                  <div
                    key={pillar.title}
                    className="group relative overflow-hidden rounded-3xl p-6 transition duration-200 hover:-translate-y-1 hover:shadow-elevated sm:p-7"
                    style={{ background: pillar.bg }}
                  >
                    {/* faint decorative glyph echo, like the reference */}
                    <Icon
                      size={130}
                      className="pointer-events-none absolute -bottom-6 -right-6 opacity-10"
                      style={{ color: pillar.iconColor }}
                      strokeWidth={1.5}
                    />
                    <span
                      className="relative flex h-11 w-11 items-center justify-center"
                      style={{ color: pillar.iconColor }}
                    >
                      <Icon size={30} strokeWidth={2} />
                    </span>
                    <h3
                      className="relative mt-5 font-display text-lg font-semibold tracking-tight sm:text-xl"
                      style={{ color: pillar.titleColor }}
                    >
                      {pillar.title}
                    </h3>
                    <p
                      className="relative mt-2 text-sm leading-relaxed"
                      style={{ color: pillar.descColor }}
                    >
                      {pillar.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Voices ───────────────────────────────────────────── */}
        <section className="border-t border-subtle bg-surface-layer">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Voices from the community
            </h2>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {voices.map((voice) => (
                <figure
                  key={voice.name}
                  className="flex h-full flex-col rounded-3xl border border-subtle bg-surface-body p-7"
                >
                  <Quote className="text-brand" size={22} />
                  <blockquote className="mt-3 flex-1 text-base leading-relaxed text-text-secondary">
                    {voice.quote}
                  </blockquote>
                  <figcaption className="mt-5">
                    <div className="font-semibold text-text-primary">
                      {voice.name}
                    </div>
                    <div className="text-xs uppercase tracking-wider text-text-muted">
                      {voice.role}
                    </div>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ──────────────────────────────────────────────── */}
        <CommunityShowcase
          id="community-join"
          eyebrow="Testimonials"
          titleLead="Trusted by learners"
          titleTail="from every corner of Africa"
          subtitle="See why members choose Edutu to discover, apply for, and win global opportunities — together."
          ctaLabel="Join the community"
          ctaTo="/auth?mode=sign-up"
        />
      </main>

      <SiteFooter />
    </div>
  );
};

export default CommunityPage;
