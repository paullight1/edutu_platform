import React from "react";
import { useAuth } from "@clerk/clerk-react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  FileText,
  HeartHandshake,
  LockKeyhole,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import PublicHeader from "./PublicHeader";
import SiteFooter from "./SiteFooter";
import Seo from "./Seo";
import CommunityShowcase from "./CommunityShowcase";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] as const },
  },
};

const stagger = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.08 },
  },
};

type HeroCard = {
  src: string;
  alt: string;
  className: string;
};

const HERO_CROP = "w=480&h=640&q=80&auto=format&fit=crop";

const heroCards: HeroCard[] = [
  {
    src: `https://images.unsplash.com/photo-1531123897727-8f129e1688ce?${HERO_CROP}`,
    alt: "Illustrative portrait of a learner",
    className: "h-40 sm:h-44",
  },
  {
    src: `https://images.unsplash.com/photo-1620829813573-7c9e1877706f?${HERO_CROP}`,
    alt: "Illustrative photo of a student working on a laptop",
    className: "h-32 sm:h-36",
  },
  {
    src: `https://images.unsplash.com/photo-1758525861622-f4e7ac86a2d7?${HERO_CROP}`,
    alt: "Illustrative photo of a learner studying",
    className: "h-32 sm:h-36",
  },
];

const centerCard: HeroCard = {
  src: "https://images.unsplash.com/photo-1686213011624-8578b598ef0f?w=640&h=880&q=80&auto=format&fit=crop",
  alt: "Illustrative graduation portrait",
  className: "h-64 sm:h-80",
};

const rightCards: HeroCard[] = [
  {
    src: `https://images.unsplash.com/photo-1744880034592-7c64776b2a85?${HERO_CROP}`,
    alt: "Illustrative photo of people learning together",
    className: "h-32 sm:h-36",
  },
  {
    src: `https://images.unsplash.com/photo-1694175271713-a6e2cc378980?${HERO_CROP}`,
    alt: "Illustrative portrait of a learner",
    className: "h-32 sm:h-36",
  },
  {
    src: `https://images.unsplash.com/photo-1620829813629-45478205c88f?${HERO_CROP}`,
    alt: "Illustrative portrait of a young professional",
    className: "h-40 sm:h-44",
  },
];

function PhotoCard({ card }: { card: HeroCard }) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-surface-elevated ${card.className} shadow-soft`}
    >
      <img
        src={card.src}
        alt={card.alt}
        loading="lazy"
        className="h-full w-full object-cover"
        onError={(event) => {
          event.currentTarget.style.display = "none";
        }}
      />
    </div>
  );
}

type Capability = {
  icon: LucideIcon;
  title: string;
  label: string;
};

const capabilities: Capability[] = [
  { icon: Users, title: "Focused groups", label: "Find people working toward similar goals" },
  { icon: MessageCircle, title: "Group chat", label: "Ask questions and share useful context" },
  { icon: FileText, title: "Shared resources", label: "Exchange trusted images and PDFs" },
  { icon: ShieldCheck, title: "Safety controls", label: "Report, block, and moderate when needed" },
];

type Pillar = {
  icon: LucideIcon;
  title: string;
  desc: string;
  bg: string;
  iconColor: string;
  titleColor: string;
  descColor: string;
};

const pillars: Pillar[] = [
  {
    icon: HeartHandshake,
    title: "Apply with people, not alone",
    desc: "Join focused groups, compare approaches, ask specific questions, and keep each other moving when application work gets difficult.",
    bg: "linear-gradient(180deg,#fbe9c6 0%,#f6dca4 100%)",
    iconColor: "#d97706",
    titleColor: "#4a3410",
    descColor: "#7a5f2c",
  },
  {
    icon: FileText,
    title: "Share work that helps",
    desc: "Keep useful PDFs, examples, checklists, and discussion together inside the group instead of losing important context across scattered chats.",
    bg: "linear-gradient(180deg,#e4dbf7 0%,#d7cbf2 100%)",
    iconColor: "#7c3aed",
    titleColor: "#2f2154",
    descColor: "#5b4a8a",
  },
  {
    icon: LockKeyhole,
    title: "Stay in control of access",
    desc: "Groups can be public, approval-based, or invite-only. Members can report harmful content, block people, and use private message requests before a DM opens.",
    bg: "linear-gradient(180deg,#d3e8f7 0%,#c2ddf1 100%)",
    iconColor: "#0369a1",
    titleColor: "#123650",
    descColor: "#3c5b72",
  },
];

const CommunityPage: React.FC = () => {
  const reduceMotion = useReducedMotion();
  const { isSignedIn } = useAuth();
  const communityHref = isSignedIn ? "/app/community" : "/auth?mode=sign-up";
  const communityLabel = isSignedIn ? "Open Community" : "Join the community";

  return (
    <div className="min-h-[100dvh] bg-surface-body text-text-primary">
      <Seo
        title="Community — Edutu"
        description="Join focused Edutu groups to discuss opportunities, share useful resources, message peers safely, and make application progress together."
        path="/community"
      />
      <PublicHeader />

      <main>
        <section className="relative mx-auto w-full max-w-6xl px-4 pb-16 pt-10 sm:px-6 sm:pt-14 lg:px-8">
          <Sparkles
            className="pointer-events-none absolute left-4 top-24 hidden text-amber-400 sm:block"
            size={22}
            aria-hidden="true"
          />
          <Sparkles
            className="pointer-events-none absolute right-6 top-16 hidden text-rose-400 sm:block"
            size={18}
            aria-hidden="true"
          />

          <motion.div variants={stagger} initial="hidden" animate="visible" className="relative">
            <motion.div variants={fadeUp} className="mx-auto max-w-3xl text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-subtle bg-surface-layer px-3 py-1 text-xs font-semibold uppercase tracking-wider text-text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                The Edutu Community
              </span>
              <h1 className="mt-5 font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
                Opportunity journeys are
                <br className="hidden sm:block" /> better with{" "}
                <span className="text-brand">people beside you</span>
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-text-secondary sm:text-lg">
                Find focused groups, exchange useful resources, discuss applications, and message peers with clear privacy and safety controls.
              </p>
              <div className="mt-7 flex flex-wrap justify-center gap-3">
                <Link
                  to={communityHref}
                  className="inline-flex min-h-12 items-center gap-2 rounded-full bg-brand px-7 py-3 text-sm font-bold text-white shadow-elevated transition hover:-translate-y-0.5 hover:bg-brand-700"
                >
                  {communityLabel}
                  <ArrowRight size={17} />
                </Link>
                <Link
                  to="/opportunities"
                  className="inline-flex min-h-12 items-center rounded-full border border-subtle bg-surface-layer px-7 py-3 text-sm font-semibold text-text-primary transition hover:bg-surface-elevated"
                >
                  Explore opportunities
                </Link>
              </div>
            </motion.div>

            <motion.div
              variants={fadeUp}
              className="mx-auto mt-11 grid max-w-4xl grid-cols-2 items-center gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5"
            >
              <div className="hidden lg:block"><PhotoCard card={heroCards[0]} /></div>
              <div className="order-1 flex flex-col gap-3 sm:order-none sm:gap-4">
                <PhotoCard card={heroCards[1]} />
                <PhotoCard card={heroCards[2]} />
              </div>
              <div className="relative order-3 col-span-2 hidden sm:order-none sm:col-span-1 sm:block">
                <motion.span
                  aria-hidden="true"
                  animate={reduceMotion ? undefined : { rotate: 360 }}
                  transition={{ duration: 16, repeat: Infinity, ease: "linear" }}
                  className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 text-brand-700"
                >
                  <Sparkles size={26} className="fill-brand-500 text-brand-700" />
                </motion.span>
                <PhotoCard card={centerCard} />
              </div>
              <div className="order-2 flex flex-col gap-3 sm:order-none sm:gap-4">
                <PhotoCard card={rightCards[0]} />
                <PhotoCard card={rightCards[1]} />
              </div>
              <div className="hidden lg:block"><PhotoCard card={rightCards[2]} /></div>
            </motion.div>
            <p className="mt-3 text-center text-2xs font-medium uppercase tracking-[0.16em] text-text-muted">
              Illustrative photography
            </p>
          </motion.div>
        </section>

        <section className="border-y border-subtle bg-surface-layer" aria-label="Community capabilities">
          <div className="mx-auto grid max-w-6xl gap-4 px-4 py-9 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
            {capabilities.map(({ icon: Icon, title, label }) => (
              <div key={title} className="flex items-start gap-3 rounded-2xl p-2">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
                  <p className="mt-1 text-xs leading-5 text-text-secondary">{label}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="rounded-[32px] border border-subtle bg-surface-elevated p-6 shadow-soft sm:p-10 lg:p-12">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Built for useful participation</p>
              <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
                More than another noisy feed
              </h2>
              <p className="mt-4 text-base leading-relaxed text-text-secondary sm:text-lg">
                Community is organized around focused groups, useful work, and clear membership boundaries so conversation can support real progress.
              </p>
            </div>

            <div className="mt-10 grid gap-4 sm:gap-5 md:grid-cols-3">
              {pillars.map((pillar) => {
                const Icon = pillar.icon;
                return (
                  <article
                    key={pillar.title}
                    className="group relative overflow-hidden rounded-3xl p-6 transition duration-200 hover:-translate-y-1 hover:shadow-elevated sm:p-7"
                    style={{ background: pillar.bg }}
                  >
                    <Icon
                      size={130}
                      className="pointer-events-none absolute -bottom-6 -right-6 opacity-10"
                      style={{ color: pillar.iconColor }}
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                    <span className="relative flex h-11 w-11 items-center justify-center" style={{ color: pillar.iconColor }}>
                      <Icon size={30} strokeWidth={2} aria-hidden="true" />
                    </span>
                    <h3
                      className="relative mt-5 font-display text-lg font-semibold tracking-tight sm:text-xl"
                      style={{ color: pillar.titleColor }}
                    >
                      {pillar.title}
                    </h3>
                    <p className="relative mt-2 text-sm leading-relaxed" style={{ color: pillar.descColor }}>
                      {pillar.desc}
                    </p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="border-t border-subtle bg-surface-layer">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_0.9fr] lg:items-center lg:px-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Safer by design</p>
              <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                Connection should not cost you control
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-7 text-text-secondary">
                Private groups stay invite-only, approval requests stay outside group history until accepted, and private messages start with a request. Reporting and blocking controls remain available when a conversation is not useful or safe.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {[
                [LockKeyhole, "Private membership", "Invite-only groups keep discussion behind an explicit membership boundary."],
                [ShieldCheck, "Report and block", "Members can report content and block another member without needing to continue the interaction."],
              ].map(([Icon, title, copy]) => {
                const SafetyIcon = Icon as LucideIcon;
                return (
                  <div key={String(title)} className="rounded-3xl border border-subtle bg-surface-body p-5 shadow-soft">
                    <SafetyIcon size={21} className="text-brand" aria-hidden="true" />
                    <h3 className="mt-3 text-base font-semibold">{String(title)}</h3>
                    <p className="mt-2 text-sm leading-6 text-text-secondary">{String(copy)}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <CommunityShowcase
          id="community-join"
          eyebrow="Community"
          titleLead="Find people working toward"
          titleTail="the next opportunity with you"
          subtitle="Create or join focused groups, share useful resources, and keep the conversation moving from discovery to application."
          ctaLabel={communityLabel}
          ctaTo={communityHref}
        />
      </main>

      <SiteFooter />
    </div>
  );
};

export default CommunityPage;
