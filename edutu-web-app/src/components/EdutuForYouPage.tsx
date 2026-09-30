import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ArrowUpRight, Mail, MessageCircle } from "lucide-react";
import PageSeo from "./PageSeo";
import PublicHeader from "./PublicHeader";
import SiteFooter from "./SiteFooter";
import ImageWithFallback from "./ImageWithFallback";
import StoryCard from "./edutu-for-you/StoryCard";
import FaqAccordion from "./edutu-for-you/FaqAccordion";
import {
  GAP_STATS,
  PARTNER_MAILTO,
  PILLARS,
  PROGRAM_FAQ,
  PROGRAM_HEADLINE,
  PROGRAM_KICKER,
  WHATSAPP_JOIN_URL,
} from "../lib/edutuForYou";
import {
  STORIES as SEED_STORIES,
  STORY_ATTRIBUTION,
  type Story,
} from "../lib/edutuForYouStories";
import { fetchImpactStories } from "../services/impactStories";

const shell = "mx-auto w-full max-w-[1200px] px-5 sm:px-8 lg:px-10";
const space = "py-16 sm:py-24 lg:py-28";
const eyebrow = "text-[11px] font-semibold uppercase tracking-[0.18em] text-brand";
const title =
  "font-display text-[clamp(2.1rem,5vw,4rem)] font-semibold leading-[1.04] tracking-[-0.045em] text-text-primary";

function Reveal({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** Public impact overview; detailed evidence and milestones live on /impact. */
export default function EdutuForYouPage() {
  const [stories, setStories] = useState<Story[]>(SEED_STORIES);
  const [showAllStories, setShowAllStories] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const controller = new AbortController();
    fetchImpactStories(controller.signal).then((rows) => {
      if (!controller.signal.aborted) setStories(rows);
    });
    return () => controller.abort();
  }, []);

  const visibleStories = showAllStories ? stories : stories.slice(0, 3);
  const hasComposites = visibleStories.some((story) => story.isComposite);

  return (
    <div className="min-h-[100dvh] bg-surface-body">
      <PageSeo path="/edutuforyou" />
      <PublicHeader />
      <main id="main-content">
        <section aria-labelledby="edutu-for-you-title" className="overflow-hidden bg-[#f4f7fd] dark:bg-[#0b1630]">
          <div className={`${shell} grid gap-10 pb-14 pt-12 sm:pb-20 sm:pt-16 lg:min-h-[640px] lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:gap-16 lg:py-20`}>
            <div className="relative z-10 max-w-[620px]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand dark:text-[#9bb8ff]">{PROGRAM_KICKER} · 2030 goal</p>
              <h1 id="edutu-for-you-title" className="mt-5 max-w-[12ch] font-display text-[clamp(3.15rem,6.2vw,5.7rem)] font-semibold leading-[0.94] tracking-[-0.065em] text-[#101d38] dark:text-white">
                {PROGRAM_HEADLINE}
              </h1>
              <p className="mt-6 max-w-[35ch] text-base leading-7 text-[#445674] dark:text-white/75 sm:text-lg sm:leading-8">
                Find opportunities. Build a stronger application. Keep moving.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
                <Link to="/signup" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white no-underline transition-colors hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand">
                  Find my opportunities <ArrowRight size={17} aria-hidden="true" />
                </Link>
                <Link to="/impact" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-[#294d96] no-underline underline-offset-4 hover:underline dark:text-[#adc4ff]">
                  See our impact <ArrowUpRight size={16} aria-hidden="true" />
                </Link>
              </div>
            </div>
            <motion.div
              initial={reduceMotion ? false : { opacity: 0.8, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
              className="relative min-h-[340px] overflow-hidden rounded-[28px] bg-[#d9e7f8] sm:min-h-[470px] lg:min-h-[540px] lg:rounded-[36px]"
            >
              <ImageWithFallback src="/community/scholarships.jpg" alt="Young people working together on scholarship applications" className="absolute inset-0 h-full w-full object-cover object-center" />
            </motion.div>
          </div>
        </section>

        <section aria-label="Reach and ambition" className="bg-[#102b62] text-white">
          <div className={`${shell} grid gap-8 py-9 sm:grid-cols-3 sm:gap-6 sm:py-11`}>
            {GAP_STATS.map((stat) => (
              <div key={stat.label} className="border-l border-white/25 pl-4 sm:pl-5">
                <strong className="block font-display text-[2.25rem] font-semibold leading-none tracking-[-0.04em] sm:text-[2.6rem]">{stat.value}</strong>
                <p className="mt-2 max-w-[23ch] text-sm leading-5 text-white/80">{stat.label}</p>
                <p className="mt-2 text-[10px] uppercase tracking-[0.1em] text-white/60">
                  {stat.sourceHref ? (
                    <a href={stat.sourceHref} target="_blank" rel="noopener noreferrer" className="underline decoration-white/40 underline-offset-2 hover:text-white">{stat.source}</a>
                  ) : stat.source}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="support-title" className={`${space} bg-surface-body`}>
          <div className={shell}>
            <Reveal className="max-w-[760px]">
              <p className={eyebrow}>How Edutu helps</p>
              <h2 id="support-title" className={`${title} mt-4`}>From the first match to the next move.</h2>
              <p className="mt-5 max-w-[48ch] text-base leading-7 text-text-secondary sm:text-lg">The right information matters most when you can act on it.</p>
            </Reveal>
            <div className="mt-10 space-y-12 sm:mt-14 sm:space-y-20">
              {PILLARS.map((pillar, index) => (
                <Reveal key={pillar.title} className={`grid items-center gap-7 lg:grid-cols-2 lg:gap-16 ${index % 2 === 1 ? "lg:[&>*:first-child]:order-2" : ""}`}>
                  <div className="relative aspect-[1.45] overflow-hidden rounded-[24px] bg-[#e7eefb] dark:bg-surface-elevated sm:aspect-[1.75]">
                    <ImageWithFallback src={pillar.image} alt={pillar.imageAlt} className={`h-full w-full ${index === 2 ? "object-cover" : "object-contain p-5 sm:p-8"}`} />
                  </div>
                  <div className="max-w-[440px]">
                    <span className="font-mono text-xs font-semibold text-brand">0{index + 1} / 03</span>
                    <h3 className="mt-3 font-display text-[clamp(1.65rem,3vw,2.45rem)] font-semibold leading-[1.08] tracking-[-0.035em] text-text-primary">{pillar.title}</h3>
                    <p className="mt-4 max-w-[42ch] text-base leading-7 text-text-secondary">{pillar.body}</p>
                    <Link to={pillar.ctaPath} className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand no-underline underline-offset-4 hover:underline">
                      {pillar.ctaLabel} <ArrowUpRight size={16} aria-hidden="true" />
                    </Link>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="stories-title" className={`${space} bg-[#0c1a38] text-white`}>
          <div className={shell}>
            <Reveal className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#a8beff]">The people we design for</p>
                <h2 id="stories-title" className="mt-4 max-w-[14ch] font-display text-[clamp(2.2rem,5vw,4rem)] font-semibold leading-[1.04] tracking-[-0.045em] text-white">Different lives. Shared barriers.</h2>
              </div>
              <p className="max-w-[33ch] text-sm leading-6 text-white/70">These situations reflect user research. Composite stories are labelled clearly.</p>
            </Reveal>
            <div
              role="region"
              aria-label="People's stories"
              tabIndex={0}
              className="mt-9 grid grid-flow-col auto-cols-[84%] snap-x snap-mandatory gap-4 overflow-x-auto pb-4 sm:mt-11 sm:auto-cols-[48%] md:grid-flow-row md:grid-cols-3 md:overflow-visible md:pb-0"
            >
              <AnimatePresence initial={false}>
                {visibleStories.map((story) => (
                  <motion.div
                    key={story.slug}
                    className="snap-start"
                    layout={!reduceMotion}
                    initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
                    transition={{ duration: 0.3 }}
                  >
                    <StoryCard story={story} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            <div className="mt-7 flex flex-col items-start justify-between gap-5 border-t border-white/20 pt-6 sm:flex-row sm:items-center">
              {hasComposites ? <p className="max-w-[70ch] text-xs leading-5 text-white/65">{STORY_ATTRIBUTION}</p> : null}
              {stories.length > 3 ? (
                <button type="button" onClick={() => setShowAllStories((current) => !current)} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-white/35 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
                  {showAllStories ? "Show fewer stories" : "See more stories"} <ArrowRight size={16} aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </div>
        </section>

        <section aria-labelledby="choose-path-title" className={`${space} bg-[#eef3fc] dark:bg-surface-elevated`}>
          <div className={shell}>
            <Reveal>
              <p className={eyebrow}>Your next move</p>
              <h2 id="choose-path-title" className={`${title} mt-4 max-w-[16ch]`}>Start somewhere real.</h2>
            </Reveal>
            <div className="mt-9 grid gap-4 lg:grid-cols-2 lg:gap-6">
              <Reveal className="relative flex min-h-[360px] flex-col overflow-hidden rounded-[26px] bg-[#2158cf] p-6 text-white sm:p-9">
                <div className="relative z-10 max-w-[26rem]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/75">For learners</p>
                  <h3 className="mt-4 max-w-[11ch] font-display text-[2rem] font-semibold leading-[1.05] tracking-[-0.04em] text-white sm:text-[2.5rem]">Find your next opportunity.</h3>
                  <p className="mt-4 max-w-[30ch] text-sm leading-6 text-white/85 sm:text-base">Start with a profile and a shortlist that fits your goals.</p>
                </div>
                <div className="relative z-10 mt-auto flex flex-wrap items-center gap-x-5 gap-y-3 pt-8">
                  <Link to="/signup" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[#1745a5] no-underline transition-colors hover:bg-[#edf3ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
                    Create my profile <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                  <a href={WHATSAPP_JOIN_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-white no-underline underline-offset-4 hover:underline">
                    <MessageCircle size={17} aria-hidden="true" /> Follow the community
                  </a>
                </div>
                <ImageWithFallback src="/mascot/edutu-profile-guide.png" alt="Edutu guide mascot pointing toward the next step" className="pointer-events-none absolute -bottom-6 -right-9 hidden w-44 opacity-85 sm:block lg:w-48" />
              </Reveal>
              <Reveal className="relative flex min-h-[360px] flex-col overflow-hidden rounded-[26px] border border-subtle bg-surface p-6 sm:p-9">
                <div className="relative z-10 max-w-[27rem]">
                  <p className={eyebrow}>For partners</p>
                  <h3 className="mt-4 max-w-[12ch] font-display text-[2rem] font-semibold leading-[1.05] tracking-[-0.04em] text-text-primary sm:text-[2.5rem]">Help open more doors.</h3>
                  <p className="mt-4 max-w-[32ch] text-sm leading-6 text-text-secondary sm:text-base">Bring funding, reach, opportunities, or mentorship.</p>
                </div>
                <a href={PARTNER_MAILTO} className="relative z-10 mt-auto inline-flex min-h-11 w-fit items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white no-underline transition-colors hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand">
                  <Mail size={17} aria-hidden="true" /> Partner with us
                </a>
                <ImageWithFallback src="/illustrations/edutu-global-opportunity-globe.png" alt="" className="pointer-events-none absolute -bottom-12 -right-12 hidden w-56 opacity-75 sm:block lg:w-64" />
              </Reveal>
            </div>
          </div>
        </section>

        <section aria-labelledby="faq-title" className={`${space} bg-surface-body`}>
          <div className={`${shell} grid gap-9 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20`}>
            <Reveal>
              <p className={eyebrow}>Clear answers</p>
              <h2 id="faq-title" className={`${title} mt-4 max-w-[12ch]`}>Before you begin.</h2>
              <Link to="/impact" className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand no-underline underline-offset-4 hover:underline">
                Read our impact report <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            </Reveal>
            <Reveal><FaqAccordion items={PROGRAM_FAQ} /></Reveal>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
