import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CalendarClock,
  HeartHandshake,
  LockKeyhole,
  MessageCircle,
  Mic2,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import PublicHeader from './PublicHeader';
import SiteFooter from './SiteFooter';
import Seo from './Seo';

const CommunityPage: React.FC = () => {
  const reduceMotion = useReducedMotion();

  const reveal = reduceMotion
    ? undefined
    : {
        initial: { opacity: 0, y: 14 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: '-80px' },
      };

  return (
    <div className="min-h-[100dvh] bg-surface-body text-text-primary">
      <Seo
        title="Community — Edutu"
        description="Meet learners and mentors around the opportunities you are pursuing, share useful context, and join structured community conversations on Edutu."
        path="/community"
      />
      <PublicHeader />

      <main>
        <section className="relative overflow-hidden border-b border-subtle px-4 py-16 sm:px-6 md:py-24">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(20,110,245,0.12),transparent_35%),radial-gradient(circle_at_80%_80%,rgba(124,58,237,0.10),transparent_35%)]" />
          <div className="relative mx-auto max-w-[1080px] text-center">
            <motion.div {...reveal} className="mx-auto inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-brand">
              <Sparkles size={14} /> Edutu Community
            </motion.div>
            <motion.h1 {...reveal} className="mx-auto mt-6 max-w-4xl font-display text-4xl font-semibold leading-[1.04] tracking-tight sm:text-5xl md:text-6xl">
              Opportunity gets easier when you do not have to figure everything out alone.
            </motion.h1>
            <motion.p {...reveal} className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-text-secondary md:text-lg">
              Join conversations around scholarships, internships, fellowships and career goals. Ask useful questions, compare preparation strategies and learn from people navigating similar decisions.
            </motion.p>
            <motion.div {...reveal} className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Link to="/auth?mode=sign-up" className="inline-flex items-center justify-center gap-2 rounded-full bg-brand px-7 py-3.5 text-sm font-semibold text-white shadow-soft transition hover:-translate-y-0.5 hover:bg-brand-700">
                Join Edutu <ArrowRight size={16} />
              </Link>
              <Link to="/opportunities" className="inline-flex items-center justify-center gap-2 rounded-full border border-subtle bg-surface-layer px-7 py-3.5 text-sm font-semibold text-text-primary transition hover:border-brand/30">
                Explore opportunities
              </Link>
            </motion.div>
          </div>
        </section>

        <section className="mx-auto max-w-[1080px] px-4 py-16 sm:px-6 md:py-20">
          <motion.div {...reveal} className="max-w-2xl">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">What is actually available</span>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight">Community tools built around useful work, not vanity numbers.</h2>
            <p className="mt-4 text-sm leading-relaxed text-text-secondary">
              We only present capabilities that exist in the product. Member counts, country coverage, mentor counts, success rates and testimonials are not published here unless they come from a verified production source with consent.
            </p>
          </motion.div>

          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: MessageCircle,
                title: 'Focused conversations',
                body: 'Discuss deadlines, application questions and preparation in the context of the opportunity you are pursuing.',
              },
              {
                icon: Users,
                title: 'Communities and cohorts',
                body: 'Join learner spaces where participation, membership and access are governed by authenticated product state.',
              },
              {
                icon: Mic2,
                title: 'Live voice rooms',
                body: 'Supported community calls use the dedicated voice gateway, short-lived tokens and server-owned room control.',
              },
              {
                icon: HeartHandshake,
                title: 'Mentor pathways',
                body: 'Approved mentors can guide learners through a verified mentor identity rather than an unreviewed public claim.',
              },
              {
                icon: CalendarClock,
                title: 'Time-sensitive coordination',
                body: 'Use notifications, deadlines and community context together so important opportunity work does not get buried.',
              },
              {
                icon: LockKeyhole,
                title: 'Privacy-aware access',
                body: 'Private community surfaces require signed-in access and are designed to keep membership and direct interactions user-scoped.',
              },
            ].map(({ icon: Icon, title, body }) => (
              <motion.article key={title} {...reveal} className="rounded-3xl border border-subtle bg-surface-layer p-6 shadow-soft">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand/10 text-brand"><Icon size={20} /></div>
                <h3 className="mt-5 font-display text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">{body}</p>
              </motion.article>
            ))}
          </div>
        </section>

        <section className="border-y border-subtle bg-surface-layer px-4 py-16 sm:px-6 md:py-20">
          <div className="mx-auto grid max-w-[1080px] gap-8 md:grid-cols-[0.9fr_1.1fr] md:items-center">
            <motion.div {...reveal}>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-success/10 text-success"><ShieldCheck size={22} /></div>
              <h2 className="mt-5 font-display text-3xl font-semibold tracking-tight">Trust is part of the community UX.</h2>
              <p className="mt-4 text-sm leading-relaxed text-text-secondary">
                Edutu should never imply that a stock photo is a graduate, that an invented quote is a testimonial, or that an unsourced metric reflects live community scale. Community credibility is treated as product integrity.
              </p>
            </motion.div>

            <motion.div {...reveal} className="rounded-3xl border border-subtle bg-surface-body p-6 sm:p-8">
              <h3 className="font-display text-lg font-semibold">Publishing rule</h3>
              <div className="mt-5 space-y-4">
                {[
                  'Use real production metrics only when the metric definition and source are known.',
                  'Use named learner or mentor stories only with explicit permission and traceable source content.',
                  'Label illustrative visuals as illustrations or generic community imagery—not as real Edutu graduates.',
                  'Keep private conversations, voice rooms and member information behind authenticated authorization boundaries.',
                ].map((item) => (
                  <div key={item} className="flex gap-3 text-sm leading-relaxed text-text-secondary">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success/10 text-success"><ShieldCheck size={12} /></span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        <section className="mx-auto max-w-[1080px] px-4 py-16 text-center sm:px-6 md:py-20">
          <motion.div {...reveal} className="rounded-3xl bg-slate-950 px-6 py-10 text-white shadow-elevated sm:px-10 md:py-14">
            <h2 className="font-display text-3xl font-semibold">Find the opportunity first. Build your support system around it.</h2>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-slate-300">
              Start from Edutu’s opportunity catalogue, save what matters, then use goals, applications, notifications and community tools to move it forward.
            </p>
            <Link to="/opportunities" className="mt-7 inline-flex items-center gap-2 rounded-full bg-brand px-7 py-3.5 text-sm font-semibold text-white hover:bg-brand-700">
              Explore opportunities <ArrowRight size={16} />
            </Link>
          </motion.div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
};

export default CommunityPage;
