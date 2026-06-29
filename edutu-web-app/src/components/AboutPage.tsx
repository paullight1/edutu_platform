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
    Twitter,
    Linkedin,
    Github,
    BookOpen,
    Zap
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useDarkMode } from '../hooks/useDarkMode';
import PublicHeader from './PublicHeader';

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

const stats = [
    { icon: Users, label: 'LEARNERS REACHED', value: '50K+', color: '#146ef5' },
    { icon: BookOpen, label: 'OPPORTUNITIES TRACKED', value: '12K+', color: '#7a3dff' },
    { icon: Globe, label: 'COUNTRIES COVERED', value: '31+', color: '#00d722' },
    { icon: Award, label: 'APPLICATIONS GUIDED', value: '3.2K', color: '#ff6b00' },
    { icon: Zap, label: 'AI ROADMAPS', value: '28K+', color: '#ed52cb' }
];

const founderImage = 'https://www.top100afl.com/team/Paul%20light.jpg.png';
const northStarImage = 'https://images.pexels.com/photos/3183186/pexels-photo-3183186.jpeg?auto=compress&cs=tinysrgb&w=1200';

const values = [
    { icon: Lightbulb, title: 'Clarity', desc: 'We turn scattered opportunity hunts into one clean place to search, compare, and act.', color: '#146ef5', bg: '#146ef510', image: 'https://images.pexels.com/photos/3182812/pexels-photo-3182812.jpeg' },
    { icon: Globe, title: 'Access', desc: 'We build for underprivileged African learners who need simple, mobile-first access to global opportunity.', color: '#00d722', bg: '#00d72210', image: 'https://images.pexels.com/photos/3183186/pexels-photo-3183186.jpeg' },
    { icon: Award, title: 'Trust', desc: 'We keep the platform accurate, fast, and easy to read so learners can act with confidence.', color: '#ffae13', bg: '#ffae1310', image: 'https://images.pexels.com/photos/1595391/pexels-photo-1595391.jpeg' },
    { icon: Heart, title: 'Community', desc: 'We bring learners, mentors, and builders together to share what works and help more people rise.', color: '#ed52cb', bg: '#ed52cb10', image: 'https://images.pexels.com/photos/1181391/pexels-photo-1181391.jpeg' }
];

const AboutPage: React.FC = () => {
    const { isDarkMode } = useDarkMode();

    return (
        <div className={`min-h-[100dvh] overflow-x-hidden bg-surface-body ${isDarkMode ? 'dark' : ''}`}>
            <PublicHeader />

            <main className="relative z-10">
                <section className="pt-40 pb-24 px-4 sm:px-6">
                    <div className="max-w-7xl mx-auto flex flex-col items-center text-center">
                        <motion.h1
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                            className="text-4xl sm:text-5xl md:text-6xl font-medium leading-[1.08] tracking-tight mb-8 text-primary"
                        >
                            Global opportunities
                            <br />
                            <span className="text-brand-500">at your fingertips</span>
                        </motion.h1>

                        <motion.p
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
                            className="max-w-[720px] text-lg leading-relaxed text-secondary"
                        >
                            Edutu helps underprivileged African learners find scholarships, internships, and fellowships faster. We make global opportunities easier to discover, understand, and apply for from the phone or browser they already use.
                        </motion.p>
                    </div>
                </section>

                <section className="py-24 px-4 sm:px-6 border-t border-subtle">
                    <div className="max-w-7xl mx-auto lg:flex items-center gap-20">
                        <motion.div
                            initial="hidden"
                            whileInView="visible"
                            viewport={{ once: true }}
                            variants={fadeUp}
                            className="lg:w-1/2"
                        >
                            <span className="text-xs font-semibold tracking-widest text-brand-500">
                                OUR STORY
                            </span>
                            <h2 className="text-3xl sm:text-4xl font-medium leading-[1.08] mt-4 mb-8 text-primary">
                                From Frustration to <span className="text-brand-500">Mission</span>
                            </h2>
                            <p className="text-lg leading-relaxed mb-6 text-secondary">
                                Edutu came from a real problem: talented African students kept missing life-changing opportunities because the information was scattered, the deadlines were hidden, and the application steps were hard to follow.
                            </p>
                            <p className="text-lg leading-relaxed mb-6 text-secondary">
                                We realized that talent is everywhere, but access is not. Edutu closes that gap with AI, simple design, and a system that brings global opportunities into one place.
                            </p>
                            <p className="text-lg leading-relaxed text-secondary">
                                Today, we are focused on making global opportunities easier to reach for African learners, especially those with less access, less time, and less support.
                            </p>
                        </motion.div>

                        <motion.div
                            initial="hidden"
                            whileInView="visible"
                            viewport={{ once: true }}
                            variants={fadeUp}
                            transition={{ delay: 0.2 }}
                            className="lg:w-1/2 mt-16 lg:mt-0"
                        >
                            <div className="grid grid-cols-1 md:grid-cols-[1.02fr_0.98fr] overflow-hidden rounded-2xl border border-subtle bg-surface-layer shadow-soft">
                                <div className="relative min-h-[280px] md:min-h-[420px]">
                                    <img
                                        src={northStarImage}
                                        alt="African learners collaborating"
                                        className="h-full w-full object-cover"
                                        loading="lazy"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-br from-black/25 via-transparent to-brand-500/15" />
                                    <div className="absolute left-5 bottom-5 inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-xs font-semibold tracking-wider text-gray-900 shadow-lg backdrop-blur-sm dark:bg-gray-800/90 dark:text-white">
                                        <Target size={14} className="text-brand-500" />
                                        GLOBAL ACCESS
                                    </div>
                                </div>

                                <div className="flex flex-col justify-center gap-4 p-8 sm:p-10 lg:p-12">
                                    <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-brand-500/10 border border-brand-500/20">
                                        <Target size={14} className="text-brand-500" />
                                        <span className="text-xs font-semibold tracking-widest text-brand-500">
                                            OUR NORTH STAR
                                        </span>
                                    </div>
                                    <div className="text-2xl font-semibold leading-[1.08] text-primary">
                                        Global opportunities, made easy to reach.
                                    </div>
                                    <div className="text-base leading-relaxed text-secondary">
                                        Edutu exists to make global opportunities easy to find, easy to trust, and easy to act on for every African learner, no matter where they live.
                                    </div>
                                    <div className="grid gap-3 pt-2">
                                        <div className="rounded-2xl border border-subtle bg-surface-layer px-4 py-4">
                                            <div className="text-xs font-semibold tracking-wider uppercase mb-1 text-brand-500">
                                                Find
                                            </div>
                                            <div className="text-sm leading-relaxed text-secondary">
                                                Curate scholarships, internships, and fellowships in one place.
                                            </div>
                                        </div>
                                        <div className="rounded-2xl border border-subtle bg-surface-layer px-4 py-4">
                                            <div className="text-xs font-semibold tracking-wider uppercase mb-1 text-brand-500">
                                                Act
                                            </div>
                                            <div className="text-sm leading-relaxed text-secondary">
                                                Give learners the clarity they need to move from discovery to application.
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </section>

                <section className="py-24 px-4 sm:px-6 border-t border-subtle bg-surface-elevated">
                    <div className="max-w-7xl mx-auto">
                        <div className="mb-16 text-center">
                            <h2 className="text-3xl sm:text-4xl font-medium leading-[1.08] text-primary">
                                How We Got <span className="text-brand-500">Here</span>
                            </h2>
                        </div>

                        <div className="max-w-[800px] mx-auto">
                            {timelineEvents.map((event, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, x: i % 2 === 0 ? -30 : 30 }}
                                    whileInView={{ opacity: 1, x: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ duration: 0.5, delay: i * 0.15, ease: [0.16, 1, 0.3, 1] }}
                                    className="flex gap-8 items-start mb-12 last:mb-0"
                                >
                                    <div className="shrink-0">
                                        <div className="h-16 w-16 flex items-center justify-center font-bold text-lg rounded-lg bg-brand-500 text-white">
                                            {event.year}
                                        </div>
                                    </div>
                                    <div className="flex-1 pt-2 border-t-2 border-subtle">
                                        <h3 className="text-2xl font-semibold mb-2 text-primary">{event.title}</h3>
                                        <p className="text-base leading-relaxed text-secondary">{event.desc}</p>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="py-24 px-4 sm:px-6 border-t border-subtle">
                    <div className="max-w-7xl mx-auto">
                        <div className="mb-16 text-center">
                            <h2 className="text-3xl sm:text-4xl font-medium leading-[1.08] text-primary">
                                What Drives <span className="text-brand-500">Us</span>
                            </h2>
                        </div>

                        <motion.div
                            variants={staggerContainer}
                            initial="hidden"
                            whileInView="visible"
                            viewport={{ once: true }}
                            className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-[900px] mx-auto"
                        >
                            <motion.div
                                variants={fadeUp}
                                className="p-10 rounded-2xl border border-subtle bg-surface-layer shadow-soft"
                            >
                                <div className="h-14 w-14 flex items-center justify-center rounded-lg mb-6 bg-brand-500/10">
                                    <Target size={28} className="text-brand-500" />
                                </div>
                                <h3 className="text-2xl font-semibold mb-4 text-primary">Our Mission</h3>
                                <p className="text-lg leading-relaxed text-secondary">
                                To empower African learners with clear opportunity discovery, deadline awareness, and direct access to scholarships, internships, and fellowships that match their profile.
                                </p>
                            </motion.div>

                            <motion.div
                                variants={fadeUp}
                                className="p-10 rounded-2xl border border-subtle bg-surface-layer shadow-soft"
                            >
                                <div className="h-14 w-14 flex items-center justify-center rounded-lg mb-6 bg-blue-500/10">
                                    <Eye size={28} className="text-blue-500" />
                                </div>
                                <h3 className="text-2xl font-semibold mb-4 text-primary">Our Vision</h3>
                                <p className="text-lg leading-relaxed text-secondary">
                                A world where a learner in Lagos, Accra, Nairobi, or any African city can reach global opportunities as easily as anyone else.
                                </p>
                            </motion.div>
                        </motion.div>
                    </div>
                </section>

                <section className="py-24 px-4 sm:px-6 border-t border-subtle bg-surface-elevated">
                    <div className="max-w-7xl mx-auto text-center">
                        <h2 className="text-3xl sm:text-4xl font-medium leading-[1.08] mb-16 text-primary">
                            Our <span className="text-brand-500">Impact</span>
                        </h2>

                        <motion.div
                            initial="hidden"
                            whileInView="visible"
                            viewport={{ once: true }}
                            variants={staggerContainer}
                        >
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <motion.div
                                    variants={fadeUp}
                                    className="md:col-span-1 p-10 rounded-2xl border border-subtle bg-surface-layer shadow-soft flex flex-col items-start justify-center text-left"
                                >
                                    <div className="h-14 w-14 flex items-center justify-center rounded-xl mb-5" style={{ backgroundColor: '#146ef515' }}>
                                        <Users size={28} style={{ color: '#146ef5' }} />
                                    </div>
                                    <div className="text-5xl font-semibold mb-1" style={{ color: '#146ef5' }}>{stats[0].value}</div>
                                    <div className="text-xs font-semibold tracking-widest text-muted">{stats[0].label}</div>
                                </motion.div>

                                <div className="md:col-span-2 grid grid-cols-2 gap-6">
                                    {stats.slice(1).map((stat, i) => (
                                        <motion.div
                                            key={i}
                                            variants={fadeUp}
                                            className="p-6 rounded-2xl border border-subtle bg-surface-layer shadow-soft flex flex-col items-start justify-center text-left"
                                        >
                                            <div className="h-10 w-10 flex items-center justify-center rounded-lg mb-4" style={{ backgroundColor: `${stat.color}15` }}>
                                                <stat.icon size={20} style={{ color: stat.color }} />
                                            </div>
                                            <div className="text-3xl font-semibold mb-1" style={{ color: stat.color }}>{stat.value}</div>
                                            <div className="text-[10px] font-semibold tracking-widest text-muted">{stat.label}</div>
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
                            <h2 className="text-3xl sm:text-4xl font-medium leading-[1.08] text-primary">
                                What We <span className="text-brand-500">Stand For</span>
                            </h2>
                        </div>

                        <motion.div
                            variants={staggerContainer}
                            initial="hidden"
                            whileInView="visible"
                            viewport={{ once: true }}
                            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
                        >
                            {values.map((value, i) => (
                                <motion.div
                                    key={i}
                                    variants={fadeUp}
                                    className="overflow-hidden rounded-2xl border border-subtle bg-surface-layer shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-elevated"
                                    style={{ borderColor: isDarkMode ? undefined : undefined }}
                                >
                                    <div className="h-36 w-full overflow-hidden">
                                        <img
                                            src={value.image}
                                            alt={value.title}
                                            className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
                                            loading="lazy"
                                        />
                                    </div>
                                    <div className="p-6">
                                        <div className="h-12 w-12 flex items-center justify-center rounded-lg mb-5" style={{ backgroundColor: value.bg }}>
                                            <value.icon size={24} style={{ color: value.color }} />
                                        </div>
                                        <h3 className="text-xl font-semibold mb-3 text-primary">{value.title}</h3>
                                        <p className="text-sm leading-relaxed text-secondary">{value.desc}</p>
                                    </div>
                                </motion.div>
                            ))}
                        </motion.div>
                    </div>
                </section>

                <section className="py-24 px-4 sm:px-6 border-t border-subtle bg-surface-elevated">
                    <div className="max-w-7xl mx-auto">
                        <div className="mb-16 text-center">
                            <span className="text-xs font-semibold tracking-widest text-brand-500">
                                THE FOUNDER
                            </span>
                            <h2 className="text-3xl sm:text-4xl font-medium leading-[1.08] mt-4 text-primary">
                                Meet the <span className="text-brand-500">Founder</span>
                            </h2>
                            <p className="max-w-[600px] text-lg leading-relaxed mx-auto mt-4 text-secondary">
                                A focused leadership story centered on building Edutu into a reliable career discovery engine.
                            </p>
                        </div>

                        <motion.div
                            variants={staggerContainer}
                            initial="hidden"
                            whileInView="visible"
                            viewport={{ once: true }}
                            className="max-w-[1120px] mx-auto overflow-hidden"
                        >
                            <motion.div
                                variants={fadeUp}
                                className="grid grid-cols-1 lg:grid-cols-[0.94fr_1.06fr] overflow-hidden rounded-2xl border border-subtle bg-surface-layer shadow-soft"
                            >
                                <div className="relative min-h-[320px] lg:min-h-[520px]">
                                    <img
                                        src={founderImage}
                                        alt="Nwosu Paul Light working with a laptop"
                                        className="h-full w-full object-cover object-center"
                                        loading="lazy"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-br from-black/35 via-transparent to-brand-500/15" />
                                    <div className="absolute left-6 bottom-6 inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-xs font-semibold tracking-wider text-gray-900 shadow-lg backdrop-blur-sm dark:bg-gray-800/90 dark:text-white">
                                        <Sparkles size={14} className="text-brand-500" />
                                        FOUNDERS VIEW
                                    </div>
                                </div>

                                <div className="flex flex-col justify-center gap-6 p-8 sm:p-10 lg:p-12 bg-surface-layer">
                                    <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-brand-500/10 border border-brand-500/20">
                                        <Sparkles size={14} className="text-brand-500" />
                                        <span className="text-xs font-semibold tracking-widest text-brand-500">
                                            THE FOUNDER
                                        </span>
                                    </div>

                                    <div>
                                        <h3 className="text-2xl sm:text-3xl lg:text-4xl font-semibold leading-[1.05] mb-3 text-primary">
                                            Nwosu Paul Light
                                        </h3>
                                        <div className="text-xs sm:text-sm font-semibold tracking-widest uppercase mb-4 text-brand-500">
                                            Founder & CTO
                                        </div>
                                        <p className="text-lg sm:text-xl leading-relaxed text-secondary">
                                            AI & ML Systems Engineer and founder of Top100 Africa Future Leaders, building Edutu to help African learners reach global opportunities faster.
                                        </p>
                                    </div>

                                    <div className="grid gap-3">
                                        <div className="rounded-2xl border border-subtle bg-surface-layer px-4 py-4">
                                            <div className="text-xs font-semibold tracking-wider uppercase mb-1 text-brand-500">
                                                Focus
                                            </div>
                                            <div className="text-base leading-relaxed text-secondary">
                                                Using AI and a clean product flow to make scholarships and opportunities easier to discover.
                                            </div>
                                        </div>
                                        <div className="rounded-2xl border border-subtle bg-surface-layer px-4 py-4">
                                            <div className="text-xs font-semibold tracking-wider uppercase mb-1 text-brand-500">
                                                Community
                                            </div>
                                            <div className="text-base leading-relaxed text-secondary">
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
                    <div className="max-w-[1000px] mx-auto text-center p-12 lg:p-20 rounded-2xl bg-brand-500 shadow-elevated">
                        <h2 className="text-3xl md:text-4xl font-medium leading-[1.08] mb-6 text-white">
                            Ready to help more learners find opportunities?
                        </h2>
                        <p className="max-w-[500px] mx-auto text-lg leading-relaxed mb-10 text-white/80">
                            Join the mission to make global opportunities easier to reach for African learners everywhere.
                        </p>
                        <Link
                            to="/"
                            className="inline-flex items-center gap-2 px-10 py-4 text-base font-medium rounded-lg bg-white text-gray-900 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-elevated dark:bg-gray-800 dark:text-white"
                        >
                            Browse Opportunities <ArrowRight size={16} />
                        </Link>
                    </div>
                </section>
            </main>

            <footer className="py-16 px-4 sm:px-6 border-t border-subtle">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start gap-12">
                    <div className="max-w-[300px]">
                        <Link to="/" className="flex items-center gap-2 mb-4">
                            <img src="/edutu-logo.png" alt="Edutu" className="h-8 w-8 object-contain" />
                            <span className="font-bold text-xl tracking-tight text-primary">
                                edutu
                            </span>
                        </Link>
                        <p className="text-base leading-relaxed text-secondary">
                            Global opportunities at your fingertips for African learners, one step at a time.
                        </p>
                    </div>

                    <div className="flex items-center gap-6">
                        <a href="https://twitter.com/edutu" target="_blank" rel="noopener noreferrer" className="p-2 text-muted transition-colors hover:text-brand-500">
                            <Twitter size={20} />
                        </a>
                        <a href="https://linkedin.com/company/edutu" target="_blank" rel="noopener noreferrer" className="p-2 text-muted transition-colors hover:text-brand-500">
                            <Linkedin size={20} />
                        </a>
                        <a href="https://github.com/edutu" target="_blank" rel="noopener noreferrer" className="p-2 text-muted transition-colors hover:text-brand-500">
                            <Github size={20} />
                        </a>
                    </div>
                </div>
                <div className="max-w-7xl mx-auto mt-12 pt-8 flex justify-between items-center border-t border-subtle">
                    <span className="text-[10px] font-semibold tracking-widest text-muted">&copy; {new Date().getFullYear()} Edutu Inc.</span>
                    <span className="text-[10px] font-semibold tracking-widest text-muted">v3.0.4-beta</span>
                </div>
            </footer>
        </div>
    );
};

export default AboutPage;
