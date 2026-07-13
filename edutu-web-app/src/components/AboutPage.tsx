import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  Compass,
  Quote,
  Rocket,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import PublicHeader from './PublicHeader';
import SiteFooter from './SiteFooter';
import Seo from './Seo';

/* ────────────────────────────────────────────────────────────────────────
 * Assets — one decisive photo per moment, not a stock-photo grid.
 * ──────────────────────────────────────────────────────────────────────── */
const HERO_IMG =
  'https://images.pexels.com/photos/8199562/pexels-photo-8199562.jpeg?auto=compress&cs=tinysrgb&w=1600';
const STORY_IMG =
  'https://images.pexels.com/photos/3183186/pexels-photo-3183186.jpeg?auto=compress&cs=tinysrgb&w=1200';
const FOUNDER_IMG = 'https://www.top100afl.com/team/Paul%20light.jpg.png';

/* ────────────────────────────────────────────────────────────────────────
 * Content
 * ──────────────────────────────────────────────────────────────────────── */
const doTriad: { icon: LucideIcon; verb: string; body: string }[] = [
  {
    icon: Compass,
    verb: 'Find',
    body: 'Thousands of scholarships, fellowships and internships, gathered into one clear place you can actually search.',
  },
  {
    icon: ShieldCheck,
    verb: 'Trust',
    body: 'Every listing kept accurate, plain-spoken and fast to read — so eligibility and deadlines are never a guess.',
  },
  {
    icon: Rocket,
    verb: 'Act',
    body: 'Guidance that carries a learner from “I found it” to a submitted application, before the deadline slips.',
  },
];

const timeline = [
  { year: '2022', title: 'The idea', body: 'Edutu began when we watched talented African students miss life-changing opportunities — the information was scattered, slow and hard to trust.' },
  { year: '2023', title: 'First prototype', body: 'A simple matching engine that helped learners find scholarships, fellowships and internships without searching everywhere at once.' },
  { year: '2024', title: 'Public launch', body: 'Edutu opened to learners across Africa, built for the everyday phones and browsers they already carry.' },
  { year: '2025', title: 'Growing access', body: 'One shared system now helps learners discover, save and apply for opportunities across 31+ countries.' },
];

const figures = [
  { value: '50K+', label: 'Learners reached' },
  { value: '12K+', label: 'Opportunities tracked' },
  { value: '31+', label: 'Countries covered' },
  { value: '28K+', label: 'AI roadmaps built' },
  { value: '3.2K', label: 'Applications guided' },
];

const values = [
  { title: 'Clarity', body: 'We turn a scattered opportunity hunt into one clean place to search, compare and act.' },
  { title: 'Access', body: 'We build mobile-first for learners who need simple access to global opportunity, wherever they are.' },
  { title: 'Trust', body: 'We keep every listing accurate and fast to read, so people can apply with confidence.' },
  { title: 'Community', body: 'We bring learners, mentors and builders together to share what works and help more people rise.' },
];

/* ────────────────────────────────────────────────────────────────────────
 * Motion — mount-triggered so nothing is gated behind a scroll a crawler
 * or backgrounded tab may never fire. Reduced-motion resolves instantly.
 * ──────────────────────────────────────────────────────────────────────── */
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 26 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } },
};
const stagger: Variants = {
  hidden: { opacity: 1 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const AboutPage: React.FC = () => {
  const reduceMotion = useReducedMotion();

  const reveal = reduceMotion
    ? {}
    : { initial: { opacity: 0, y: 26 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const } };
  const group = reduceMotion ? {} : { initial: 'hidden' as const, animate: 'visible' as const, variants: stagger };
  const item = reduceMotion ? undefined : fadeUp;

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-surface-body font-body text-text-primary">
      <Seo
        title="About Edutu — talent is everywhere, opportunity isn't"
        description="Edutu helps underprivileged African learners discover and reach scholarships, internships and fellowships. Our story, our belief, and the team closing the opportunity gap with responsible AI."
        path="/about"
        type="website"
      />
      <PublicHeader />

      <main className="relative z-10">
        {/* ── Hero: the belief ─────────────────────────────────── */}
        <section className="relative px-4 pt-32 sm:px-6 sm:pt-40">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-[460px]"
            style={{ background: 'radial-gradient(52% 60% at 50% 0%, rgb(var(--color-brand-500) / 0.14), transparent 72%)' }}
          />
          <div className="relative mx-auto max-w-[1100px]">
            <motion.p
              initial={reduceMotion ? undefined : { opacity: 0, y: 14 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="text-[15px] font-semibold text-brand"
            >
              About Edutu
            </motion.p>
            <motion.h1
              initial={reduceMotion ? undefined : { opacity: 0, y: 26 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
              className="mt-4 font-display text-[clamp(2.6rem,7vw,5.25rem)] font-semibold leading-[0.98] tracking-[-0.03em] text-text-primary text-balance"
            >
              Talent is everywhere.
              <br />
              <span className="text-brand">Opportunity isn&rsquo;t.</span>
            </motion.h1>
            <motion.p
              initial={reduceMotion ? undefined : { opacity: 0, y: 20 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.12 }}
              className="mt-7 max-w-2xl text-[17px] leading-[1.7] text-text-secondary sm:text-[19px]"
            >
              Edutu helps underprivileged African learners discover scholarships, internships and
              fellowships — and actually reach them — from the phone or browser they already use.
            </motion.p>
            <motion.div
              initial={reduceMotion ? undefined : { opacity: 0, y: 16 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.22 }}
              className="mt-9 flex flex-wrap items-center gap-3"
            >
              <Link
                to="/opportunities"
                className="group inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3.5 text-[15px] font-semibold text-white no-underline shadow-elevated transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-700"
              >
                Explore opportunities
                <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
              <Link
                to="/what-we-believe"
                className="inline-flex items-center gap-2 text-[15px] font-semibold text-text-primary no-underline transition-colors hover:text-brand"
              >
                Read what we believe <ArrowUpRight size={16} />
              </Link>
            </motion.div>
          </div>

          {/* Decisive photo band */}
          <motion.figure
            initial={reduceMotion ? undefined : { opacity: 0, y: 30 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="relative mx-auto mt-16 max-w-[1180px] overflow-hidden rounded-[28px] border border-subtle shadow-elevated sm:mt-20"
          >
            <img
              src={HERO_IMG}
              alt="Young African graduates celebrating together in their caps and gowns"
              className="h-[280px] w-full object-cover object-center sm:h-[440px]"
              loading="eager"
              decoding="async"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/10 to-transparent" />
            <figcaption className="absolute inset-x-6 bottom-6 max-w-xl sm:inset-x-10 sm:bottom-8">
              <p className="font-display text-[18px] font-medium leading-snug text-white sm:text-[22px]">
                Edutu grew out of Top100 Africa Future Leaders — a community that proved when you
                show young Africans the door, they walk through it.
              </p>
            </figcaption>
          </motion.figure>
        </section>

        {/* ── Origin story ─────────────────────────────────────── */}
        <section className="px-4 py-24 sm:px-6 sm:py-28">
          <div className="mx-auto grid max-w-[1100px] gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16">
            <motion.div {...reveal} className="min-w-0">
              <h2 className="font-display text-[clamp(1.9rem,3.4vw,2.9rem)] font-semibold leading-[1.06] tracking-tight text-text-primary">
                Why we built Edutu
              </h2>
              <div className="mt-6 space-y-5 text-[16.5px] leading-[1.75] text-text-secondary text-pretty">
                <p>
                  Edutu came from a real problem: brilliant African students kept missing
                  life-changing opportunities because the information was scattered, the deadlines
                  were hidden, and the application steps were hard to follow.
                </p>
                <p>
                  We realized that talent is everywhere, but access is not. Edutu closes that gap
                  with responsible AI, plain design, and a system that brings global opportunities
                  into one trusted place.
                </p>
                <p>
                  Today we focus on the learners who need it most — those with less access, less
                  time and less support — and on making the next opportunity easier to reach.
                </p>
              </div>
            </motion.div>

            <motion.div {...reveal} className="min-w-0">
              <figure className="relative overflow-hidden rounded-[26px] border border-subtle shadow-soft">
                <img
                  src={STORY_IMG}
                  alt="African learners collaborating over their applications on a laptop"
                  className="aspect-[4/3] w-full object-cover lg:aspect-[4/5]"
                  loading="lazy"
                  decoding="async"
                />
              </figure>
            </motion.div>
          </div>
        </section>

        {/* ── What we do: Find / Trust / Act ───────────────────── */}
        <section className="border-y border-subtle bg-surface-elevated px-4 py-24 sm:px-6 sm:py-28">
          <div className="mx-auto max-w-[1100px]">
            <motion.div {...reveal} className="max-w-2xl">
              <h2 className="font-display text-[clamp(1.9rem,3.4vw,2.9rem)] font-semibold leading-[1.06] tracking-tight text-text-primary">
                Three jobs, done well
              </h2>
              <p className="mt-4 text-[16.5px] leading-[1.7] text-text-secondary">
                Everything Edutu does comes back to helping a learner move from a scattered search to
                a submitted application.
              </p>
            </motion.div>

            <motion.div
              {...group}
              className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-subtle bg-border-subtle sm:grid-cols-3"
            >
              {doTriad.map((c) => {
                const Icon = c.icon;
                return (
                  <motion.div key={c.verb} variants={item} className="bg-surface-layer p-7 sm:p-8">
                    <Icon size={22} className="text-brand" />
                    <h3 className="mt-5 font-display text-[26px] font-semibold tracking-tight text-text-primary">
                      {c.verb}
                    </h3>
                    <p className="mt-2.5 text-[15px] leading-[1.7] text-text-secondary">{c.body}</p>
                  </motion.div>
                );
              })}
            </motion.div>
          </div>
        </section>

        {/* ── Timeline ─────────────────────────────────────────── */}
        <section className="px-4 py-24 sm:px-6 sm:py-28">
          <div className="mx-auto max-w-[820px]">
            <motion.h2
              {...reveal}
              className="font-display text-[clamp(1.9rem,3.4vw,2.9rem)] font-semibold leading-[1.06] tracking-tight text-text-primary"
            >
              How we got here
            </motion.h2>

            <motion.ol {...group} className="relative mt-12">
              <div aria-hidden="true" className="absolute left-[15px] top-3 bottom-3 w-px bg-border-subtle sm:left-[71px]" />
              {timeline.map((e) => (
                <motion.li key={e.year} variants={item} className="relative flex gap-5 pb-11 last:pb-0 sm:gap-8">
                  <div className="hidden w-16 shrink-0 pt-1 text-right font-display text-[17px] font-semibold text-brand sm:block">
                    {e.year}
                  </div>
                  <div className="relative z-10 mt-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-brand/30 bg-surface-body">
                    <span className="h-2.5 w-2.5 rounded-full bg-brand" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="font-display text-[15px] font-semibold text-brand sm:hidden">{e.year}</span>
                    <h3 className="font-display text-[20px] font-semibold tracking-tight text-text-primary">{e.title}</h3>
                    <p className="mt-2 text-[15.5px] leading-[1.7] text-text-secondary text-pretty">{e.body}</p>
                  </div>
                </motion.li>
              ))}
            </motion.ol>
          </div>
        </section>

        {/* ── Impact figures (editorial band) ──────────────────── */}
        <section className="border-y border-subtle bg-surface-elevated px-4 py-20 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-[1100px]">
            <motion.h2
              {...reveal}
              className="mb-12 max-w-xl font-display text-[clamp(1.9rem,3.4vw,2.9rem)] font-semibold leading-[1.06] tracking-tight text-text-primary"
            >
              The reach we&rsquo;ve built together
            </motion.h2>
            <motion.dl
              {...group}
              className="grid grid-cols-2 gap-x-6 gap-y-10 border-t border-subtle pt-10 sm:grid-cols-3 lg:grid-cols-5 lg:gap-x-0"
            >
              {figures.map((f) => (
                <motion.div key={f.label} variants={item} className="lg:border-l lg:border-subtle lg:pl-6 lg:first:border-l-0">
                  <dd className="font-display text-[clamp(2.2rem,4vw,3rem)] font-semibold leading-none tracking-tight text-brand">
                    {f.value}
                  </dd>
                  <dt className="mt-2.5 text-[13.5px] font-medium leading-snug text-text-secondary">{f.label}</dt>
                </motion.div>
              ))}
            </motion.dl>
          </div>
        </section>

        {/* ── Founder ──────────────────────────────────────────── */}
        <section className="px-4 py-24 sm:px-6 sm:py-28">
          <div className="mx-auto grid max-w-[1100px] gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:gap-14">
            <motion.figure {...reveal} className="min-w-0">
              <div className="relative overflow-hidden rounded-[26px] border border-subtle shadow-soft">
                <img
                  src={FOUNDER_IMG}
                  alt="Nwosu Paul Light, founder of Edutu"
                  className="aspect-[4/5] w-full object-cover object-center"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            </motion.figure>

            <motion.div {...reveal} className="min-w-0">
              <Quote size={34} className="text-brand/30" aria-hidden="true" />
              <blockquote className="mt-3 font-display text-[clamp(1.5rem,2.6vw,2.15rem)] font-semibold leading-[1.2] tracking-tight text-text-primary text-balance">
                Talent is everywhere. Our whole job is making sure opportunity finally reaches it.
              </blockquote>
              <div className="mt-7 flex items-center gap-4">
                <div>
                  <div className="font-display text-[18px] font-semibold text-text-primary">Nwosu Paul Light</div>
                  <div className="text-[14px] text-text-muted">Founder &amp; CTO · Top100 Africa Future Leaders</div>
                </div>
              </div>
              <p className="mt-6 max-w-xl text-[16px] leading-[1.75] text-text-secondary text-pretty">
                An AI &amp; ML systems engineer, Paul founded Top100 Africa Future Leaders to make young
                African talent visible — then built Edutu so the opportunities that talent deserves
                are only a search away.
              </p>
            </motion.div>
          </div>
        </section>

        {/* ── Values ───────────────────────────────────────────── */}
        <section className="border-t border-subtle px-4 py-24 sm:px-6 sm:py-28">
          <div className="mx-auto max-w-[1100px]">
            <motion.h2
              {...reveal}
              className="font-display text-[clamp(1.9rem,3.4vw,2.9rem)] font-semibold leading-[1.06] tracking-tight text-text-primary"
            >
              What we stand for
            </motion.h2>
            <motion.div {...group} className="mt-12 grid gap-x-14 gap-y-11 sm:grid-cols-2">
              {values.map((v) => (
                <motion.div key={v.title} variants={item} className="border-t border-subtle pt-6">
                  <h3 className="font-display text-[22px] font-semibold tracking-tight text-text-primary">{v.title}</h3>
                  <p className="mt-2.5 max-w-md text-[16px] leading-[1.7] text-text-secondary text-pretty">{v.body}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ── Close (brand-drenched) ───────────────────────────── */}
        <section className="relative overflow-hidden bg-gradient-to-br from-brand-600 to-brand-800 px-4 py-24 text-center sm:px-6 sm:py-28">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{ background: 'radial-gradient(60% 80% at 50% 0%, rgb(255 255 255 / 0.14), transparent 60%)' }}
          />
          <motion.div {...reveal} className="relative mx-auto max-w-[720px]">
            <h2 className="font-display text-[clamp(2rem,4vw,3.25rem)] font-semibold leading-[1.05] tracking-tight text-white text-balance">
              Talent is everywhere. Help us reach it.
            </h2>
            <p className="mx-auto mt-5 max-w-lg text-[17px] leading-[1.7] text-white/85">
              Discover the next opportunity, or help a learner find theirs.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/opportunities"
                className="group inline-flex items-center gap-2 rounded-xl bg-white px-7 py-3.5 text-[15px] font-semibold text-brand-700 no-underline shadow-elevated transition-all duration-200 hover:-translate-y-0.5"
              >
                Browse opportunities
                <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
              <Link
                to="/mentor"
                className="inline-flex items-center gap-2 rounded-xl border border-white/30 px-7 py-3.5 text-[15px] font-semibold text-white no-underline transition-colors duration-200 hover:bg-white/10"
              >
                Become a mentor
              </Link>
            </div>
          </motion.div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
};

export default AboutPage;
