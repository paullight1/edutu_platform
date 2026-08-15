import React from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import PageSeo from './PageSeo';
import PublicHeader from './PublicHeader';
import SiteFooter from './SiteFooter';

interface Perk {
    illustration: string;
    illustrationAlt: string;
    title: string;
    desc: string;
}

const perks: Perk[] = [
    {
        illustration: '/illustrations/careers-remote-first.png',
        illustrationAlt: 'Hand-drawn laptop and globe connected by route lines',
        title: 'Remote-first',
        desc: 'Work from anywhere in Africa and beyond. We care about impact, not location.',
    },
    {
        illustration: '/illustrations/careers-ownership.png',
        illustrationAlt: 'Hand-drawn builder holding a flag beside a rising rocket',
        title: 'Real ownership',
        desc: 'Small team, big scope. You will ship work that reaches learners on day one.',
    },
    {
        illustration: '/illustrations/careers-mission.png',
        illustrationAlt: 'Hand-drawn heart opening a doorway toward a glowing opportunity',
        title: 'Mission that matters',
        desc: 'Everything we build helps someone reach an opportunity they might have missed.',
    },
    {
        illustration: '/illustrations/careers-grow-together.png',
        illustrationAlt: 'Hand-drawn teammates watering a growing plant together',
        title: 'Grow together',
        desc: 'Mentorship, learning budgets, and a team that wants you to level up.',
    },
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
                        <div className="mb-6 inline-flex items-center rounded-full border border-brand/20 bg-brand/10 px-4 py-1.5">
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
                            {perks.map((perk, index) => (
                                <motion.div
                                    key={perk.title}
                                    {...reveal}
                                    className="group overflow-visible rounded-3xl border border-subtle bg-surface-layer p-8 shadow-soft"
                                >
                                    <div className="relative -mx-6 -mt-8 mb-2 h-48 sm:h-56">
                                        <motion.img
                                            src={perk.illustration}
                                            alt={perk.illustrationAlt}
                                            loading="lazy"
                                            decoding="async"
                                            className="absolute -inset-[10%] h-[120%] w-[120%] max-w-none object-contain transition-transform duration-500 group-hover:scale-[1.04]"
                                            animate={
                                                reduceMotion
                                                    ? undefined
                                                    : { y: [0, -7, 0], rotate: [0, index % 2 === 0 ? 1.2 : -1.2, 0] }
                                            }
                                            transition={
                                                reduceMotion
                                                    ? undefined
                                                    : { duration: 6 + index, repeat: Infinity, ease: 'easeInOut', delay: index * 0.15 }
                                            }
                                        />
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
                            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">Hiring status</span>
                            <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
                                None available at the moment
                            </h2>
                            <p className="mx-auto mt-4 max-w-[560px] text-base leading-relaxed text-text-secondary sm:text-lg">
                                There are no open roles right now. Please check back soon for the next opportunity to join the team.
                            </p>
                        </div>
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
                            className="mt-8 inline-flex rounded-xl bg-white px-8 py-3.5 text-base font-semibold text-brand shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-elevated"
                        >
                            Our story
                        </Link>
                    </div>
                </section>
            </main>

            <SiteFooter />
        </div>
    );
};

export default CareersPage;
