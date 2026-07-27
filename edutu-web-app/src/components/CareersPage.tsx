import React from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Briefcase, Globe, Heart, Rocket, Sparkles, Users, type LucideIcon } from 'lucide-react';
import PageSeo from './PageSeo';
import PublicHeader from './PublicHeader';
import SiteFooter from './SiteFooter';

interface Perk {
    icon: LucideIcon;
    title: string;
    desc: string;
}

const perks: Perk[] = [
    { icon: Globe, title: 'Remote-first', desc: 'Work from anywhere in Africa and beyond. We care about impact, not location.' },
    { icon: Rocket, title: 'Real ownership', desc: 'Small team, big scope. You will ship work that reaches learners on day one.' },
    { icon: Heart, title: 'Mission that matters', desc: 'Everything we build helps someone reach an opportunity they might have missed.' },
    { icon: Users, title: 'Grow together', desc: 'Mentorship, learning budgets, and a team that wants you to level up.' },
];

interface Role {
    title: string;
    team: string;
    location: string;
    type: string;
}

const roles: Role[] = [
    { title: 'Senior Frontend Engineer', team: 'Product Engineering', location: 'Remote (Africa)', type: 'Full-time' },
    { title: 'AI / ML Engineer', team: 'Matching & Recommendations', location: 'Remote', type: 'Full-time' },
    { title: 'Product Designer', team: 'Design', location: 'Remote (Africa)', type: 'Full-time' },
    { title: 'Community & Partnerships Lead', team: 'Growth', location: 'Lagos / Remote', type: 'Full-time' },
];

const CareersPage: React.FC = () => {
    const reduceMotion = useReducedMotion();
    const reveal = reduceMotion
        ? {}
        : {
              initial: { opacity: 0, y: 24 } as const,
              whileInView: { opacity: 1, y: 0 } as const,
              viewport: { once: true },
              transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] as const },
          };

    return (
        <div className="min-h-[100dvh] overflow-x-hidden bg-surface-body font-body text-text-primary">
            <PageSeo path="/careers" />
            <PublicHeader />

            <main className="relative z-10">
                {/* Hero */}
                <section className="px-4 pb-16 pt-40 sm:px-6">
                    <div className="mx-auto max-w-[820px] text-center">
                        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/10 px-4 py-1.5">
                            <Sparkles size={14} className="text-brand" />
                            <span className="text-2xs font-semibold uppercase tracking-[0.2em] text-brand">Careers</span>
                        </div>
                        <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight text-text-primary sm:text-5xl md:text-6xl">
                            Help build the bridge to <span className="text-brand">global opportunity</span>
                        </h1>
                        <p className="mx-auto mt-6 max-w-[620px] text-base leading-relaxed text-text-secondary sm:text-lg">
                            We are a small, focused team on a mission to make global opportunities easy to reach for
                            every African learner. If that excites you, we would love to meet.
                        </p>
                    </div>
                </section>

                {/* Perks */}
                <section className="border-t border-subtle px-4 py-20 sm:px-6">
                    <div className="mx-auto max-w-[1000px]">
                        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                            {perks.map((perk) => (
                                <motion.div
                                    key={perk.title}
                                    {...reveal}
                                    className="rounded-3xl border border-subtle bg-surface-layer p-8 shadow-soft"
                                >
                                    <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10">
                                        <perk.icon size={22} className="text-brand" />
                                    </div>
                                    <h3 className="mb-2 font-display text-xl font-semibold tracking-tight text-text-primary">
                                        {perk.title}
                                    </h3>
                                    <p className="text-base leading-relaxed text-text-secondary">{perk.desc}</p>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Open roles */}
                <section className="border-t border-subtle bg-surface-elevated px-4 py-20 sm:px-6">
                    <div className="mx-auto max-w-[900px]">
                        <div className="mb-12 text-center">
                            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">Open Roles</span>
                            <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
                                Come build with us
                            </h2>
                        </div>

                        <div className="space-y-4">
                            {roles.map((role) => (
                                <motion.div
                                    key={role.title}
                                    {...reveal}
                                    className="group flex flex-col gap-4 rounded-2xl border border-subtle bg-surface-layer p-6 shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-elevated sm:flex-row sm:items-center sm:justify-between"
                                >
                                    <div className="flex items-start gap-4">
                                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/10">
                                            <Briefcase size={20} className="text-brand" />
                                        </div>
                                        <div>
                                            <h3 className="font-display text-lg font-semibold tracking-tight text-text-primary">
                                                {role.title}
                                            </h3>
                                            <p className="mt-1 text-sm text-text-muted">
                                                {role.team} · {role.location} · {role.type}
                                            </p>
                                        </div>
                                    </div>
                                    <a
                                        href={`mailto:careers@edutu.org?subject=${encodeURIComponent(`Application: ${role.title}`)}`}
                                        className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-brand/30 px-5 py-2.5 text-sm font-semibold text-brand transition-colors hover:bg-brand/10"
                                    >
                                        Apply <ArrowRight size={15} />
                                    </a>
                                </motion.div>
                            ))}
                        </div>

                        <p className="mt-10 text-center text-base text-text-secondary">
                            Do not see your role? We are always happy to meet great people. Email us at{' '}
                            <a href="mailto:careers@edutu.org" className="font-semibold text-brand hover:underline">
                                careers@edutu.org
                            </a>
                            .
                        </p>
                    </div>
                </section>

                {/* CTA */}
                <section className="border-t border-subtle px-4 py-24 sm:px-6">
                    <div className="mx-auto max-w-[900px] rounded-3xl bg-gradient-to-br from-brand-500 to-brand-700 p-12 text-center shadow-elevated lg:p-16">
                        <h2 className="font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                            Not a role, but want to help?
                        </h2>
                        <p className="mx-auto mt-4 max-w-[480px] text-base leading-relaxed text-white/80 sm:text-lg">
                            Learn more about the mission and the learners we serve.
                        </p>
                        <Link
                            to="/about"
                            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-8 py-3.5 text-base font-semibold text-brand shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-elevated"
                        >
                            Our story <ArrowRight size={16} />
                        </Link>
                    </div>
                </section>
            </main>

            <SiteFooter />
        </div>
    );
};

export default CareersPage;
