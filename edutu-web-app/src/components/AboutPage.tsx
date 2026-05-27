import React from 'react';
import { Link } from 'react-router-dom';
import {
    ArrowRight,
    Sparkles,
    Sun,
    Moon,
    Target,
    Eye,
    Heart,
    Globe,
    Award,
    Users,
    Lightbulb,
    TrendingUp,
    MapPin,
    Calendar,
    ChevronRight,
    Twitter,
    Linkedin,
    Github,
    BookOpen,
    Zap,
    Shield
} from 'lucide-react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useDarkMode } from '../hooks/useDarkMode';

const AboutPage: React.FC = () => {
    const { isDarkMode, toggleDarkMode } = useDarkMode();
    const { scrollYProgress } = useScroll();

    const headerBg = useTransform(
        scrollYProgress,
        [0, 0.05],
        [isDarkMode ? 'rgba(8, 8, 8, 0)' : 'rgba(255, 255, 255, 0)', isDarkMode ? 'rgba(8, 8, 8, 0.9)' : 'rgba(255, 255, 255, 0.95)']
    );

    const webflowShadow = isDarkMode
        ? '0 84px 24px rgba(0,0,0,0.3), 0 54px 22px rgba(0,0,0,0.2), 0 30px 18px rgba(0,0,0,0.15), 0 13px 13px rgba(0,0,0,0.1), 0 3px 7px rgba(0,0,0,0.08)'
        : '0 84px 24px rgba(0,0,0,0), 0 54px 22px rgba(0,0,0,0.01), 0 30px 18px rgba(0,0,0,0.04), 0 13px 13px rgba(0,0,0,0.08), 0 3px 7px rgba(0,0,0,0.09)';

    const cardShadow = isDarkMode
        ? '0 1px 0 rgba(255,255,255,0.1), 0 13px 13px rgba(0,0,0,0.2), 0 3px 7px rgba(0,0,0,0.1)'
        : '0 1px 0 #d8d8d8, 0 13px 13px rgba(0,0,0,0.04), 0 3px 7px rgba(0,0,0,0.08)';

    const fadeUp = {
        hidden: { opacity: 0, y: 30 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.6 } }
    };

    const staggerContainer = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: { staggerChildren: 0.1, delayChildren: 0.2 }
        }
    };

    const timelineEvents = [
        { year: '2022', title: 'The Idea', desc: 'Edutu was born from a simple observation: talented students worldwide were missing opportunities simply because they did not know where to look.' },
        { year: '2023', title: 'First Prototype', desc: 'We built our first AI-powered opportunity matching engine, connecting learners with scholarships, fellowships, and programs across 15 countries.' },
        { year: '2024', title: 'Community Launch', desc: 'Edutu opened to the public, reaching 10K learners in the first quarter. The creator marketplace launched, enabling mentors to share roadmaps.' },
        { year: '2025', title: 'Global Scale', desc: '50K+ active learners, 12K+ opportunities catalogued, and presence in 31+ countries. The Intelligence Career OS is here.' }
    ];

    const stats = [
        { icon: Users, label: 'ACTIVE LEARNERS', value: '50K+', color: '#146ef5' },
        { icon: BookOpen, label: 'OPPORTUNITIES', value: '12K+', color: '#7a3dff' },
        { icon: Globe, label: 'COUNTRIES', value: '31+', color: '#00d722' },
        { icon: Award, label: 'SUCCESS STORIES', value: '3.2K', color: '#ff6b00' },
        { icon: Zap, label: 'AI ROADMAPS', value: '28K+', color: '#ed52cb' }
    ];

    const teamMembers = [
        { name: 'Paul Adeyemi', role: 'Founder & CEO', initials: 'PA', bio: 'Building the future of career discovery' },
        { name: 'Sarah Chen', role: 'Head of AI', initials: 'SC', bio: 'Making intelligence accessible to all' },
        { name: 'James Okafor', role: 'Lead Engineer', initials: 'JO', bio: 'Architecting scalable systems' },
        { name: 'Maria Santos', role: 'Community Lead', initials: 'MS', bio: 'Connecting learners globally' }
    ];

    const values = [
        { icon: Lightbulb, title: 'Innovation', desc: 'We push boundaries with AI-driven solutions that transform how learners discover and pursue opportunities.', color: '#146ef5', bg: '#146ef510' },
        { icon: Globe, title: 'Accessibility', desc: 'Every learner deserves access to global opportunities regardless of location, background, or resources.', color: '#00d722', bg: '#00d72210' },
        { icon: Award, title: 'Excellence', desc: 'We hold ourselves to the highest standards in design, performance, and user experience.', color: '#ffae13', bg: '#ffae1310' },
        { icon: Heart, title: 'Community', desc: 'Learning is better together. We build spaces where mentors, peers, and creators thrive.', color: '#ed52cb', bg: '#ed52cb10' }
    ];

    return (
        <div className={`min-h-screen overflow-x-hidden ${isDarkMode ? 'dark' : ''}`} style={{ backgroundColor: isDarkMode ? '#080808' : '#ffffff', color: isDarkMode ? '#f5f5f5' : '#080808', fontFamily: "'Inter', 'Arial', sans-serif" }}>
            <motion.header
                style={{ backgroundColor: headerBg }}
                className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md transition-colors duration-300"
            >
                <div className="max-w-[1200px] mx-auto px-4 sm:px-6 h-[64px] flex items-center justify-between" style={{ borderBottom: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}` }}>
                    <Link to="/" className="flex items-center gap-2.4 cursor-pointer">
                        <img src="/edutu-logo.png" alt="Edutu" className="h-8 w-8 object-contain" />
                        <span className="font-bold text-xl tracking-tight" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                            edutu
                        </span>
                    </Link>

                    <div className="flex items-center gap-4">
                        <Link
                            to="/"
                            className="inline-flex items-center gap-2 px-5 py-2.4 text-[16px] font-medium rounded cursor-pointer transition-all duration-200"
                            style={{
                                backgroundColor: '#146ef5',
                                color: '#ffffff',
                                borderRadius: '4px',
                                boxShadow: webflowShadow
                            }}
                            onMouseEnter={(e) => {
                                (e.target as HTMLElement).style.transform = 'translateY(-2px)';
                                (e.target as HTMLElement).style.backgroundColor = '#0055d4';
                            }}
                            onMouseLeave={(e) => {
                                (e.target as HTMLElement).style.transform = 'translateY(0)';
                                (e.target as HTMLElement).style.backgroundColor = '#146ef5';
                            }}
                        >
                            Back to Home <ArrowRight size={16} />
                        </Link>
                    </div>
                </div>
            </motion.header>

            <main className="relative z-10">
                <section className="pt-[160px] pb-[96px] px-4 sm:px-6">
                    <div className="max-w-[1200px] mx-auto flex flex-col items-center text-center">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6 }}
                            className="inline-flex items-center gap-2.4 px-4 py-2 mb-8 rounded"
                            style={{
                                backgroundColor: isDarkMode ? '#146ef510' : '#146ef510',
                                border: `1px solid ${isDarkMode ? '#146ef530' : '#146ef530'}`,
                                borderRadius: '4px'
                            }}
                        >
                            <Sparkles size={14} style={{ color: '#146ef5' }} />
                            <span className="text-[12.8px] font-semibold tracking-[1.5px]" style={{ color: '#146ef5' }}>
                                ABOUT EDUTU
                            </span>
                        </motion.div>

                        <motion.h1
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.1 }}
                            className="text-[56px] sm:text-[72px] md:text-[80px] font-semibold leading-[1.04] tracking-[-0.8px] mb-8"
                            style={{ color: isDarkMode ? '#ffffff' : '#080808' }}
                        >
                            Mapping Ambition
                            <br />
                            <span style={{ color: '#146ef5' }}>To Progress</span>
                        </motion.h1>

                        <motion.p
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.2 }}
                            className="max-w-[720px] text-[20px] leading-[1.5] font-normal"
                            style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}
                        >
                            Edutu is the Intelligence Career OS that automates your path to global opportunities. We believe every learner deserves a clear roadmap from where they are to where they want to be.
                        </motion.p>
                    </div>
                </section>

                <section className="py-24 px-4 sm:px-6" style={{ borderTop: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}` }}>
                    <div className="max-w-[1200px] mx-auto lg:flex items-center gap-[80px]">
                        <motion.div
                            initial="hidden"
                            whileInView="visible"
                            viewport={{ once: true }}
                            variants={fadeUp}
                            className="lg:w-1/2"
                        >
                            <span className="text-[12.8px] font-semibold tracking-[1.5px]" style={{ color: '#146ef5' }}>
                                OUR STORY
                            </span>
                            <h2 className="text-[48px] sm:text-[56px] font-semibold leading-[1.04] mt-4 mb-8" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                                From Frustration to <span style={{ color: '#146ef5' }}>Mission</span>
                            </h2>
                            <p className="text-[18px] leading-[1.7] mb-6" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                                The idea for Edutu came from a personal experience. Our founder watched brilliant friends miss life-changing scholarships because they did not know about them, missed deadlines, or could not navigate complex application processes.
                            </p>
                            <p className="text-[18px] leading-[1.7] mb-6" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                                We realized that talent is distributed equally but opportunity is not. Edutu was built to close that gap using AI, automation, and community-driven knowledge sharing.
                            </p>
                            <p className="text-[18px] leading-[1.7]" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                                Today, we are a growing team of builders, educators, and dreamers committed to making global opportunities accessible to every learner on the planet.
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
                            <div className="w-full p-12" style={{ backgroundColor: isDarkMode ? '#111' : '#f8f8f8', border: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}`, borderRadius: '8px', boxShadow: webflowShadow }}>
                                <div className="h-20 w-20 flex items-center justify-center text-white mb-8" style={{ backgroundColor: '#146ef5', borderRadius: '8px', boxShadow: '0 0 40px rgba(20, 110, 245, 0.3)' }}>
                                    <Target size={32} />
                                </div>
                                <div className="text-[28px] font-semibold mb-3" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>Our North Star</div>
                                <div className="text-[16px] leading-[1.6]" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                                    To democratize access to global educational and career opportunities through intelligent automation and community-powered discovery.
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </section>

                <section className="py-24 px-4 sm:px-6" style={{ borderTop: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}`, backgroundColor: isDarkMode ? '#0a0a0a' : '#fafafa' }}>
                    <div className="max-w-[1200px] mx-auto">
                        <div className="mb-16 text-center">
                            <span className="text-[12.8px] font-semibold tracking-[1.5px]" style={{ color: '#146ef5' }}>
                                TIMELINE
                            </span>
                            <h2 className="text-[48px] sm:text-[56px] font-semibold leading-[1.04] mt-4" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                                How We Got <span style={{ color: '#146ef5' }}>Here</span>
                            </h2>
                        </div>

                        <div className="max-w-[800px] mx-auto">
                            {timelineEvents.map((event, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, x: i % 2 === 0 ? -30 : 30 }}
                                    whileInView={{ opacity: 1, x: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ duration: 0.5, delay: i * 0.15 }}
                                    className="flex gap-8 items-start mb-12 last:mb-0"
                                >
                                    <div className="shrink-0">
                                        <div className="h-16 w-16 flex items-center justify-center font-bold text-[18px] rounded" style={{ backgroundColor: '#146ef5', color: '#ffffff', borderRadius: '4px' }}>
                                            {event.year}
                                        </div>
                                    </div>
                                    <div className="flex-1 pt-2" style={{ borderTop: `2px solid ${isDarkMode ? '#222' : '#d8d8d8'}` }}>
                                        <h3 className="text-[24px] font-semibold mb-2" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>{event.title}</h3>
                                        <p className="text-[16px] leading-[1.6]" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>{event.desc}</p>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="py-24 px-4 sm:px-6" style={{ borderTop: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}` }}>
                    <div className="max-w-[1200px] mx-auto">
                        <div className="mb-16 text-center">
                            <span className="text-[12.8px] font-semibold tracking-[1.5px]" style={{ color: '#146ef5' }}>
                                MISSION & VISION
                            </span>
                            <h2 className="text-[48px] sm:text-[56px] font-semibold leading-[1.04] mt-4" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                                What Drives <span style={{ color: '#146ef5' }}>Us</span>
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
                                className="p-10"
                                style={{
                                    backgroundColor: isDarkMode ? '#111' : '#ffffff',
                                    border: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}`,
                                    borderRadius: '8px',
                                    boxShadow: cardShadow
                                }}
                            >
                                <div className="h-14 w-14 flex items-center justify-center rounded mb-6" style={{ backgroundColor: '#146ef510', borderRadius: '8px' }}>
                                    <Target size={28} style={{ color: '#146ef5' }} />
                                </div>
                                <h3 className="text-[28px] font-semibold mb-4" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>Our Mission</h3>
                                <p className="text-[17px] leading-[1.7]" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                                    To empower every learner with AI-driven career intelligence, automated roadmaps, and direct access to global opportunities that match their unique potential and ambitions.
                                </p>
                            </motion.div>

                            <motion.div
                                variants={fadeUp}
                                className="p-10"
                                style={{
                                    backgroundColor: isDarkMode ? '#111' : '#ffffff',
                                    border: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}`,
                                    borderRadius: '8px',
                                    boxShadow: cardShadow
                                }}
                            >
                                <div className="h-14 w-14 flex items-center justify-center rounded mb-6" style={{ backgroundColor: '#7a3dff10', borderRadius: '8px' }}>
                                    <Eye size={28} style={{ color: '#7a3dff' }} />
                                </div>
                                <h3 className="text-[28px] font-semibold mb-4" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>Our Vision</h3>
                                <p className="text-[17px] leading-[1.7]" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                                    A world where no opportunity goes undiscovered and no learner is left behind. We envision a future where AI bridges the gap between ambition and achievement for everyone.
                                </p>
                            </motion.div>
                        </motion.div>
                    </div>
                </section>

                <section className="py-24 px-4 sm:px-6" style={{ borderTop: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}`, backgroundColor: isDarkMode ? '#0a0a0a' : '#fafafa' }}>
                    <div className="max-w-[1200px] mx-auto text-center">
                        <span className="text-[12.8px] font-semibold tracking-[1.5px]" style={{ color: '#146ef5' }}>
                            BY THE NUMBERS
                        </span>
                        <h2 className="text-[48px] sm:text-[56px] font-semibold leading-[1.04] mt-4 mb-16" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                            Our <span style={{ color: '#146ef5' }}>Impact</span>
                        </h2>

                        <motion.div
                            variants={staggerContainer}
                            initial="hidden"
                            whileInView="visible"
                            viewport={{ once: true }}
                            className="grid grid-cols-2 md:grid-cols-5 gap-6"
                        >
                            {stats.map((stat, i) => (
                                <motion.div
                                    key={i}
                                    variants={fadeUp}
                                    className="p-8 rounded"
                                    style={{
                                        backgroundColor: isDarkMode ? '#111' : '#ffffff',
                                        border: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}`,
                                        borderRadius: '8px',
                                        boxShadow: cardShadow
                                    }}
                                >
                                    <div className="h-10 w-10 flex items-center justify-center mx-auto mb-4 rounded" style={{ backgroundColor: `${stat.color}15`, borderRadius: '8px' }}>
                                        <stat.icon size={20} style={{ color: stat.color }} />
                                    </div>
                                    <div className="text-[36px] font-semibold mb-2" style={{ color: stat.color }}>{stat.value}</div>
                                    <div className="text-[10px] font-semibold tracking-[1.5px]" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>{stat.label}</div>
                                </motion.div>
                            ))}
                        </motion.div>
                    </div>
                </section>

                <section className="py-24 px-4 sm:px-6" style={{ borderTop: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}` }}>
                    <div className="max-w-[1200px] mx-auto">
                        <div className="mb-16 text-center">
                            <span className="text-[12.8px] font-semibold tracking-[1.5px]" style={{ color: '#146ef5' }}>
                                OUR VALUES
                            </span>
                            <h2 className="text-[48px] sm:text-[56px] font-semibold leading-[1.04] mt-4" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                                What We <span style={{ color: '#146ef5' }}>Stand For</span>
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
                                    className="p-8 cursor-pointer transition-all duration-300"
                                    style={{
                                        backgroundColor: isDarkMode ? '#111' : '#ffffff',
                                        border: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}`,
                                        borderRadius: '8px',
                                        boxShadow: cardShadow
                                    }}
                                    onMouseEnter={(e) => {
                                        (e.currentTarget as HTMLElement).style.borderColor = value.color;
                                        (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)';
                                    }}
                                    onMouseLeave={(e) => {
                                        (e.currentTarget as HTMLElement).style.borderColor = isDarkMode ? '#222' : '#d8d8d8';
                                        (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                                    }}
                                >
                                    <div className="h-12 w-12 flex items-center justify-center rounded mb-6" style={{ backgroundColor: value.bg, borderRadius: '8px' }}>
                                        <value.icon size={24} style={{ color: value.color }} />
                                    </div>
                                    <h3 className="text-[22px] font-semibold mb-3" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>{value.title}</h3>
                                    <p className="text-[15px] leading-[1.6]" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>{value.desc}</p>
                                </motion.div>
                            ))}
                        </motion.div>
                    </div>
                </section>

                <section className="py-24 px-4 sm:px-6" style={{ borderTop: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}`, backgroundColor: isDarkMode ? '#0a0a0a' : '#fafafa' }}>
                    <div className="max-w-[1200px] mx-auto">
                        <div className="mb-16 text-center">
                            <span className="text-[12.8px] font-semibold tracking-[1.5px]" style={{ color: '#146ef5' }}>
                                THE TEAM
                            </span>
                            <h2 className="text-[48px] sm:text-[56px] font-semibold leading-[1.04] mt-4" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                                Meet the <span style={{ color: '#146ef5' }}>Builders</span>
                            </h2>
                            <p className="max-w-[600px] text-[18px] leading-[1.5] mx-auto mt-4" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                                A passionate team dedicated to transforming how learners navigate their careers.
                            </p>
                        </div>

                        <motion.div
                            variants={staggerContainer}
                            initial="hidden"
                            whileInView="visible"
                            viewport={{ once: true }}
                            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
                        >
                            {teamMembers.map((member, i) => (
                                <motion.div
                                    key={i}
                                    variants={fadeUp}
                                    className="p-8 text-center cursor-pointer transition-all duration-300"
                                    style={{
                                        backgroundColor: isDarkMode ? '#111' : '#ffffff',
                                        border: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}`,
                                        borderRadius: '8px',
                                        boxShadow: cardShadow
                                    }}
                                    onMouseEnter={(e) => {
                                        (e.currentTarget as HTMLElement).style.borderColor = '#146ef5';
                                        (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)';
                                    }}
                                    onMouseLeave={(e) => {
                                        (e.currentTarget as HTMLElement).style.borderColor = isDarkMode ? '#222' : '#d8d8d8';
                                        (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                                    }}
                                >
                                    <div className="h-20 w-20 flex items-center justify-center mx-auto mb-6 rounded-full font-bold text-[20px]" style={{ backgroundColor: '#146ef5', color: '#ffffff', borderRadius: '50%' }}>
                                        {member.initials}
                                    </div>
                                    <h3 className="text-[20px] font-semibold mb-1" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>{member.name}</h3>
                                    <div className="text-[13px] font-semibold tracking-[1.5px] mb-3" style={{ color: '#146ef5' }}>{member.role}</div>
                                    <p className="text-[14px]" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>{member.bio}</p>
                                </motion.div>
                            ))}
                        </motion.div>
                    </div>
                </section>

                <section className="py-32 px-4 sm:px-6" style={{ borderTop: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}` }}>
                    <div className="max-w-[1000px] mx-auto text-center p-12 lg:p-20" style={{ backgroundColor: '#146ef5', borderRadius: '8px', boxShadow: webflowShadow }}>
                        <h2 className="text-[40px] md:text-[56px] font-semibold leading-[1.04] mb-6 text-white">
                            Ready to start your journey?
                        </h2>
                        <p className="max-w-[500px] mx-auto text-[18px] leading-[1.5] mb-10" style={{ color: '#ffffffcc' }}>
                            Join thousands of learners already using Edutu to discover opportunities and build their future.
                        </p>
                        <Link
                            to="/"
                            className="inline-flex items-center gap-2 px-10 py-4 text-[16px] font-medium rounded cursor-pointer transition-all duration-200"
                            style={{
                                backgroundColor: '#ffffff',
                                color: '#080808',
                                borderRadius: '4px',
                                boxShadow: '0 1px 0 rgba(0,0,0,0.1), 0 13px 13px rgba(0,0,0,0.2), 0 3px 7px rgba(0,0,0,0.15)'
                            }}
                            onMouseEnter={(e) => {
                                (e.target as HTMLElement).style.transform = 'translateY(-2px)';
                            }}
                            onMouseLeave={(e) => {
                                (e.target as HTMLElement).style.transform = 'translateY(0)';
                            }}
                        >
                            Get Started <ArrowRight size={16} />
                        </Link>
                    </div>
                </section>
            </main>

            <footer className="py-16 px-4 sm:px-6" style={{ borderTop: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}` }}>
                <div className="max-w-[1200px] mx-auto flex flex-col md:flex-row justify-between items-start gap-12">
                    <div className="max-w-[300px]">
                        <Link to="/" className="flex items-center gap-2 mb-4">
                            <img src="/edutu-logo.png" alt="Edutu" className="h-8 w-8 object-contain" />
                            <span className="font-bold text-xl tracking-tight" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                                edutu
                            </span>
                        </Link>
                        <p className="text-[16px] leading-[1.6]" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                            Modular career operating system. Mapping potential to progress, one milestone at a time.
                        </p>
                    </div>

                    <div className="flex items-center gap-6">
                        <a href="https://twitter.com/edutu" target="_blank" rel="noopener noreferrer" className="p-2 transition-colors" style={{ color: isDarkMode ? '#5a5a5a' : '#5a5a5a' }} onMouseEnter={(e) => (e.currentTarget.style.color = '#146ef5')} onMouseLeave={(e) => (e.currentTarget.style.color = isDarkMode ? '#5a5a5a' : '#5a5a5a')}>
                            <Twitter size={20} />
                        </a>
                        <a href="https://linkedin.com/company/edutu" target="_blank" rel="noopener noreferrer" className="p-2 transition-colors" style={{ color: isDarkMode ? '#5a5a5a' : '#5a5a5a' }} onMouseEnter={(e) => (e.currentTarget.style.color = '#146ef5')} onMouseLeave={(e) => (e.currentTarget.style.color = isDarkMode ? '#5a5a5a' : '#5a5a5a')}>
                            <Linkedin size={20} />
                        </a>
                        <a href="https://github.com/edutu" target="_blank" rel="noopener noreferrer" className="p-2 transition-colors" style={{ color: isDarkMode ? '#5a5a5a' : '#5a5a5a' }} onMouseEnter={(e) => (e.currentTarget.style.color = '#146ef5')} onMouseLeave={(e) => (e.currentTarget.style.color = isDarkMode ? '#5a5a5a' : '#5a5a5a')}>
                            <Github size={20} />
                        </a>
                    </div>
                </div>
                <div className="max-w-[1200px] mx-auto mt-12 pt-8 flex justify-between items-center" style={{ borderTop: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}` }}>
                    <span className="text-[10px] font-semibold tracking-[1.5px]" style={{ color: isDarkMode ? '#5a5a5a' : '#ababab' }}>© {new Date().getFullYear()} Edutu Inc.</span>
                    <span className="text-[10px] font-semibold tracking-[1.5px]" style={{ color: isDarkMode ? '#5a5a5a' : '#ababab' }}>v3.0.4-beta</span>
                </div>
            </footer>
        </div>
    );
};

export default AboutPage;
