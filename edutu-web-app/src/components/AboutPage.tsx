import React from 'react';
import { Link } from 'react-router-dom';
import {
    ArrowRight,
    Sparkles,
    Target,
    Eye,
    Heart,
    Globe,
    Award,
    Users,
    Lightbulb,
    BookOpen,
    Zap,
    Search,
    ShieldCheck,
    Rocket,
    type LucideIcon,
} from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import PublicHeader from './PublicHeader';
import SiteFooter from './SiteFooter';

const fadeUp = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } }
};

const staggerContainer = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.1, delayChildren: 0.2 }
    }
};

const timelineEvents = [
    { year: '2022', title: 'The Idea', desc: 'Edutu started when we saw talented African students miss global opportunities because the information was scattered, slow, and hard to trust.' },
    { year: '2023', title: 'First Prototype', desc: 'We built a simple matching engine that helped learners find scholarships, fellowships, and internships without having to search everywhere.' },
    { year: '2024', title: 'Public Launch', desc: 'Edutu opened to more learners across Africa, making global opportunities easier to reach from everyday phones and browsers.' },
    { year: '2025', title: 'Growing Access', desc: 'Edutu now helps more learners discover, save, and apply for opportunities across 31+ countries with one shared system.' }
];

interface Stat {
    icon: LucideIcon;
    label: string;
    value: string;
    accentClass: string;
    tintClass: string;
}

const stats: Stat[] = [
    { icon: Users, label: 'LEARNERS REACHED', value: '50K+', accentClass: 'text-brand', tintClass: 'bg-brand/10' },
    { icon: BookOpen, label: 'OPPORTUNITIES TRACKED', value: '12K+', accentClass: 'text-accent', tintClass: 'bg-accent/10' },
    { icon: Globe, label: 'COUNTRIES COVERED', value: '31+', accentClass: 'text-success', tintClass: 'bg-success/10' },
    { icon: Award, label: 'APPLICATIONS GUIDED', value: '3.2K', accentClass: 'text-warning', tintClass: 'bg-warning/10' },
    { icon: Zap, label: 'AI ROADMAPS', value: '28K+', accentClass: 'text-danger', tintClass: 'bg-danger/10' }
];

const founderImage = 'https://www.top100afl.com/team/Paul%20light.jpg.png';
const northStarImage = 'https://images.pexels.com/photos/3183186/pexels-photo-3183186.jpeg?auto=compress&cs=tinysrgb&w=1200';

interface Pillar {
    icon: LucideIcon;
    title: string;
    desc: string;
}

const northStarPillars: Pillar[] = [
    { icon: Search, title: 'Find', desc: 'Curate scholarships, internships, and fellowships into one clear, searchable place.' },
    { icon: ShieldCheck, title: 'Trust', desc: 'Keep every listing accurate, fast to read, and easy to act on with confidence.' },
    { icon: Rocket, title: 'Act', desc: 'Give learners the clarity they need to move from discovery to a submitted application.' },
];

interface Value {
    icon: LucideIcon;
    title: string;
    desc: string;
    accentClass: string;
    tintClass: string;
    image: string;
}

const values: Value[] = [
    { icon: Lightbulb, title: 'Clarity', desc: 'We turn scattered opportunity hunts into one clean place to search, compare, and act.', accentClass: 'text-brand', tintClass: 'bg-brand/10', image: 'https://images.pexels.com/photos/3182812/pexels-photo-3182812.jpeg' },
    { icon: Globe, title: 'Access', desc: 'We build for underprivileged African learners who need simple, mobile-first access to global opportunity.', accentClass: 'text-success', tintClass: 'bg-success/10', image: 'https://images.pexels.com/photos/3183186/pexels-photo-3183186.jpeg' },
    { icon: Award, title: 'Trust', desc: 'We keep the platform accurate, fast, and easy to read so learners can act with confidence.', accentClass: 'text-warning', tintClass: 'bg-warning/10', image: 'https://images.pexels.com/photos/1595391/pexels-photo-1595391.jpeg' },
    { icon: Heart, title: 'Community', desc: 'We bring learners, mentors, and builders together to share what works and help more people rise.', accentClass: 'text-danger', tintClass: 'bg-danger/10', image: 'https://images.pexels.com/photos/1181391/pexels-photo-1181391.jpeg' }
];

const Eyebrow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">
        {children}
    </span>
);

const AboutPage: React.FC = () => {
    const reduceMotion = useReducedMotion();

    const reveal = reduceMotion
        ? {}
        : { variants: fadeUp, initial: 'hidden' as const, whileInView: 'visible' as const, viewport: { once: true } };
    const stagger = reduceMotion
        ? {}
        : { variants: staggerContainer, initial: 'hidden' as const, whileInView: 'visible' as const, viewport: { once: true } };
    const childVariants = reduceMotion ? undefined : fadeUp;

    return (
        <div className="min-h-[100dvh] overflow-x-hidden bg-surface-body font-body text-text-primary">
            <PublicHeader />

            <main className="relative z-10">
                <section className="pt-40 pb-24 px-4 sm:px-6">
                    <div className="max-w-7xl mx-auto flex flex-col items-center text-center">
                        <motion.div
                            initial={reduceMotion ? undefined : { opacity: 0, y: 16 }}
                            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                            transition={{ duration: 0.5 }}
                            className="mb-7 inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/10 px-4 py-1.5"
                        >
                            <Sparkles size={14} className="text-brand" />
                            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand">
                                Our mission
                            </span>
                        </motion.div>

                        <motion.h1
                            initial={reduceMotion ? undefined : { opacity: 0, y: 30 }}
                            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                            className="font-display text-4xl sm:text-5xl md:text-6xl font-semibold leading-[1.06] tracking-tight mb-8 text-text-primary"
                        >
                            Global opportunities
                            <br />
                            <span className="text-brand">at your fingertips</span>
                        </motion.h1>

                        <motion.p
                            initial={reduceMotion ? undefined : { opacity: 0, y: 20 }}
                            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
                            className="max-w-[720px] text-lg leading-relaxed text-text-secondary"
                        >
                            Edutu helps underprivileged African learners find scholarships, internships, and fellowships faster. We make global opportunities easier to discover, understand, and apply for from the phone or browser they already use.
                        </motion.p>
                    </div>
                </section>

                <section className="py-24 px-4 sm:px-6 border-t border-subtle">
                    <div className="max-w-7xl mx-auto grid gap-12 lg:grid-cols-2 lg:gap-20 lg:items-center">
                        <motion.div {...reveal}>
                            <Eyebrow>Our Story</Eyebrow>
                            <h2 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight leading-[1.1] mt-4 mb-8 text-text-primary">
                                From Frustration to <span className="text-brand">Mission</span>
                            </h2>
                            <div className="space-y-6">
                                <p className="text-lg leading-relaxed text-text-secondary">
                                    Edutu came from a real problem: talented African students kept missing life-changing opportunities because the information was scattered, the deadlines were hidden, and the application steps were hard to follow.
                                </p>
                                <p className="text-lg leading-relaxed text-text-secondary">
                                    We realized that talent is everywhere, but access is not. Edutu closes that gap with AI, simple design, and a system that brings global opportunities into one place.
                                </p>
                                <p className="text-lg leading-relaxed text-text-secondary">
                                    Today, we are focused on making global opportunities easier to reach for African learners, especially those with less access, less time, and less support.
                                </p>
                            </div>
                        </motion.div>

                        <motion.div
                            {...reveal}
                            transition={reduceMotion ? undefined : { delay: 0.15 }}
                        >
                            <div className="relative overflow-hidden rounded-[28px] border border-subtle shadow-elevated aspect-[4/3] sm:aspect-[16/10] lg:aspect-[4/5]">
                                <img
                                    src={northStarImage}
                                    alt="African learners collaborating over their applications"
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                    decoding="async"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                                <div className="absolute left-5 top-5 inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-xs font-semibold tracking-wider text-gray-900 shadow-lg backdrop-blur-sm dark:bg-gray-800/90 dark:text-white">
                                    <Target size={14} className="text-brand" />
                                    GLOBAL ACCESS
                                </div>
                                <p className="absolute inset-x-6 bottom-6 font-display text-xl sm:text-2xl font-semibold leading-snug text-white">
                                    &ldquo;Talent is everywhere, but access is not.&rdquo;
                                </p>
                            </div>
                        </motion.div>
                    </div>
                </section>

                <section className="py-24 px-4 sm:px-6 border-t border-subtle bg-surface-elevated">
                    <div className="max-w-5xl mx-auto text-center">
                        <motion.div {...reveal} className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-brand/10 border border-brand/20">
                            <Target size={14} className="text-brand" />
                            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">
                                Our North Star
                            </span>
                        </motion.div>
                        <motion.h2
                            {...reveal}
                            className="font-display text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight leading-[1.08] mt-6 mb-6 text-text-primary"
                        >
                            Global opportunities,{' '}
                            <span className="text-brand">made easy to reach.</span>
                        </motion.h2>
                        <motion.p
                            {...reveal}
                            className="max-w-[640px] mx-auto text-lg leading-relaxed text-text-secondary"
                        >
                            Edutu exists to make global opportunities easy to find, easy to trust, and easy to act on for every African learner, no matter where they live.
                        </motion.p>

                        <motion.div {...stagger} className="grid gap-6 sm:grid-cols-3 mt-14 text-left">
                            {northStarPillars.map((pillar) => (
                                <motion.div
                                    key={pillar.title}
                                    variants={childVariants}
                                    className="rounded-2xl border border-subtle bg-surface-layer p-6 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-brand/40 hover:shadow-elevated"
                                >
                                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10">
                                        <pillar.icon size={20} className="text-brand" />
                                    </div>
                                    <div className="mb-2 text-sm font-semibold uppercase tracking-wider text-brand">
                                        {pillar.title}
                                    </div>
                                    <p className="text-base leading-relaxed text-text-secondary">{pillar.desc}</p>
                                </motion.div>
                            ))}
                        </motion.div>
                    </div>
                </section>

                <section className="py-24 px-4 sm:px-6 border-t border-subtle bg-surface-elevated">
                    <div className="max-w-7xl mx-auto">
                        <div className="mb-16 text-center">
                            <Eyebrow>Timeline</Eyebrow>
                            <h2 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight leading-[1.1] mt-4 text-text-primary">
                                How We Got <span className="text-brand">Here</span>
                            </h2>
                        </div>

                        <div className="max-w-[800px] mx-auto">
                            {timelineEvents.map((event, i) => (
                                <motion.div
                                    key={i}
                                    {...(reduceMotion
                                        ? {}
                                        : {
                                              initial: { opacity: 0, x: i % 2 === 0 ? -30 : 30 },
                                              whileInView: { opacity: 1, x: 0 },
                                              viewport: { once: true },
                                              transition: { duration: 0.5, delay: i * 0.15, ease: [0.16, 1, 0.3, 1] },
                                          })}
                                    className="flex gap-8 items-start mb-12 last:mb-0"
                                >
                                    <div className="shrink-0">
                                        <div className="h-16 w-16 flex items-center justify-center font-display font-bold text-lg rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-soft">
                                            {event.year}
                                        </div>
                                    </div>
                                    <div className="flex-1 pt-2 border-t-2 border-subtle">
                                        <h3 className="font-display text-2xl font-semibold tracking-tight mb-2 text-text-primary">{event.title}</h3>
                                        <p className="text-base leading-relaxed text-text-secondary">{event.desc}</p>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="py-24 px-4 sm:px-6 border-t border-subtle">
                    <div className="max-w-7xl mx-auto">
                        <div className="mb-16 text-center">
                            <Eyebrow>Purpose</Eyebrow>
                            <h2 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight leading-[1.1] mt-4 text-text-primary">
                                What Drives <span className="text-brand">Us</span>
                            </h2>
                        </div>

                        <motion.div
                            {...stagger}
                            className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-[900px] mx-auto"
                        >
                            <motion.div
                                variants={childVariants}
                                className="p-10 rounded-3xl border border-subtle bg-surface-layer shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-brand/40 hover:shadow-elevated"
                            >
                                <div className="h-14 w-14 flex items-center justify-center rounded-2xl mb-6 bg-brand/10">
                                    <Target size={28} className="text-brand" />
                                </div>
                                <h3 className="font-display text-2xl font-semibold tracking-tight mb-4 text-text-primary">Our Mission</h3>
                                <p className="text-lg leading-relaxed text-text-secondary">
                                To empower African learners with clear opportunity discovery, deadline awareness, and direct access to scholarships, internships, and fellowships that match their profile.
                                </p>
                            </motion.div>

                            <motion.div
                                variants={childVariants}
                                className="p-10 rounded-3xl border border-subtle bg-surface-layer shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-accent/40 hover:shadow-elevated"
                            >
                                <div className="h-14 w-14 flex items-center justify-center rounded-2xl mb-6 bg-accent/10">
                                    <Eye size={28} className="text-accent" />
                                </div>
                                <h3 className="font-display text-2xl font-semibold tracking-tight mb-4 text-text-primary">Our Vision</h3>
                                <p className="text-lg leading-relaxed text-text-secondary">
                                A world where a learner in Lagos, Accra, Nairobi, or any African city can reach global opportunities as easily as anyone else.
                                </p>
                            </motion.div>
                        </motion.div>
                    </div>
                </section>

                <section className="py-24 px-4 sm:px-6 border-t border-subtle bg-surface-elevated">
                    <div className="max-w-7xl mx-auto text-center">
                        <Eyebrow>By the Numbers</Eyebrow>
                        <h2 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight leading-[1.1] mt-4 mb-16 text-text-primary">
                            Our <span className="text-brand">Impact</span>
                        </h2>

                        <motion.div {...stagger}>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <motion.div
                                    variants={childVariants}
                                    className="md:col-span-1 p-10 rounded-3xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-elevated flex flex-col items-start justify-center text-left"
                                >
                                    <div className="h-14 w-14 flex items-center justify-center rounded-2xl mb-5 bg-white/15">
                                        <Users size={28} className="text-white" />
                                    </div>
                                    <div className="font-display text-5xl font-semibold mb-1">{stats[0].value}</div>
                                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/80">{stats[0].label}</div>
                                </motion.div>

                                <div className="md:col-span-2 grid grid-cols-2 gap-6">
                                    {stats.slice(1).map((stat, i) => (
                                        <motion.div
                                            key={i}
                                            variants={childVariants}
                                            className="p-6 rounded-2xl border border-subtle bg-surface-layer shadow-soft flex flex-col items-start justify-center text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-elevated"
                                        >
                                            <div className={`h-10 w-10 flex items-center justify-center rounded-xl mb-4 ${stat.tintClass}`}>
                                                <stat.icon size={20} className={stat.accentClass} />
                                            </div>
                                            <div className={`font-display text-3xl font-semibold mb-1 ${stat.accentClass}`}>{stat.value}</div>
                                            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">{stat.label}</div>
                                        </motion.div>
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </section>

                <section className="py-24 px-4 sm:px-6 border-t border-subtle">
                    <div className="max-w-7xl mx-auto">
                        <div className="mb-16 text-center">
                            <Eyebrow>Values</Eyebrow>
                            <h2 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight leading-[1.1] mt-4 text-text-primary">
                                What We <span className="text-brand">Stand For</span>
                            </h2>
                        </div>

                        <motion.div
                            {...stagger}
                            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
                        >
                            {values.map((value, i) => (
                                <motion.div
                                    key={i}
                                    variants={childVariants}
                                    className="group overflow-hidden rounded-3xl border border-subtle bg-surface-layer shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-brand/40 hover:shadow-elevated"
                                >
                                    <div className="h-36 w-full overflow-hidden">
                                        <img
                                            src={value.image}
                                            alt={value.title}
                                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                                            loading="lazy"
                                            decoding="async"
                                        />
                                    </div>
                                    <div className="p-6">
                                        <div className={`h-12 w-12 flex items-center justify-center rounded-2xl mb-5 ${value.tintClass}`}>
                                            <value.icon size={24} className={value.accentClass} />
                                        </div>
                                        <h3 className="font-display text-xl font-semibold tracking-tight mb-3 text-text-primary">{value.title}</h3>
                                        <p className="text-sm leading-relaxed text-text-secondary">{value.desc}</p>
                                    </div>
                                </motion.div>
                            ))}
                        </motion.div>
                    </div>
                </section>

                <section className="py-24 px-4 sm:px-6 border-t border-subtle bg-surface-elevated">
                    <div className="max-w-7xl mx-auto">
                        <div className="mb-16 text-center">
                            <Eyebrow>The Founder</Eyebrow>
                            <h2 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight leading-[1.1] mt-4 text-text-primary">
                                Meet the <span className="text-brand">Founder</span>
                            </h2>
                            <p className="max-w-[600px] text-lg leading-relaxed mx-auto mt-4 text-text-secondary">
                                A focused leadership story centered on building Edutu into a reliable career discovery engine.
                            </p>
                        </div>

                        <motion.div
                            {...stagger}
                            className="max-w-[1120px] mx-auto overflow-hidden"
                        >
                            <motion.div
                                variants={childVariants}
                                className="grid grid-cols-1 lg:grid-cols-[0.94fr_1.06fr] overflow-hidden rounded-3xl border border-subtle bg-surface-layer shadow-soft"
                            >
                                <div className="relative min-h-[320px] lg:min-h-[520px]">
                                    <img
                                        src={founderImage}
                                        alt="Nwosu Paul Light working with a laptop"
                                        className="h-full w-full object-cover object-center"
                                        loading="lazy"
                                        decoding="async"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-br from-black/35 via-transparent to-brand/15" />
                                    <div className="absolute left-6 bottom-6 inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-xs font-semibold tracking-wider text-gray-900 shadow-lg backdrop-blur-sm dark:bg-gray-800/90 dark:text-white">
                                        <Sparkles size={14} className="text-brand" />
                                        FOUNDERS VIEW
                                    </div>
                                </div>

                                <div className="flex flex-col justify-center gap-6 p-8 sm:p-10 lg:p-12 bg-surface-layer">
                                    <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-brand/10 border border-brand/20 w-fit">
                                        <Sparkles size={14} className="text-brand" />
                                        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">
                                            The Founder
                                        </span>
                                    </div>

                                    <div>
                                        <h3 className="font-display text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight leading-[1.05] mb-3 text-text-primary">
                                            Nwosu Paul Light
                                        </h3>
                                        <div className="text-xs sm:text-sm font-semibold uppercase tracking-[0.2em] mb-4 text-brand">
                                            Founder & CTO
                                        </div>
                                        <p className="text-lg sm:text-xl leading-relaxed text-text-secondary">
                                            AI & ML Systems Engineer and founder of Top100 Africa Future Leaders, building Edutu to help African learners reach global opportunities faster.
                                        </p>
                                    </div>

                                    <div className="grid gap-3">
                                        <div className="rounded-2xl border border-subtle bg-surface-elevated px-4 py-4">
                                            <div className="text-xs font-semibold tracking-wider uppercase mb-1 text-brand">
                                                Focus
                                            </div>
                                            <div className="text-base leading-relaxed text-text-secondary">
                                                Using AI and a clean product flow to make scholarships and opportunities easier to discover.
                                            </div>
                                        </div>
                                        <div className="rounded-2xl border border-subtle bg-surface-elevated px-4 py-4">
                                            <div className="text-xs font-semibold tracking-wider uppercase mb-1 text-brand">
                                                Community
                                            </div>
                                            <div className="text-base leading-relaxed text-text-secondary">
                                                Top100 Africa Future Leaders amplifies young African talent and helps them grow into visible leaders.
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        </motion.div>
                    </div>
                </section>

                <section className="py-32 px-4 sm:px-6 border-t border-subtle">
                    <div className="max-w-[1000px] mx-auto text-center p-12 lg:p-20 rounded-3xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-elevated">
                        <h2 className="font-display text-3xl md:text-4xl font-semibold tracking-tight leading-[1.1] mb-6 text-white">
                            Ready to help more learners find opportunities?
                        </h2>
                        <p className="max-w-[500px] mx-auto text-lg leading-relaxed mb-10 text-white/80">
                            Join the mission to make global opportunities easier to reach for African learners everywhere.
                        </p>
                        <Link
                            to="/"
                            className="inline-flex items-center gap-2 px-10 py-4 text-base font-semibold rounded-xl bg-white text-brand shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-elevated"
                        >
                            Browse Opportunities <ArrowRight size={16} />
                        </Link>
                    </div>
                </section>
            </main>

            <SiteFooter />
        </div>
    );
};

export default AboutPage;
