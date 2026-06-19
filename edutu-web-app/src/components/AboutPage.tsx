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
import { motion, useScroll, useTransform } from 'framer-motion';
import { useDarkMode } from '../hooks/useDarkMode';
import PublicSiteMenu from './PublicSiteMenu';

const AboutPage: React.FC = () => {
    const { isDarkMode } = useDarkMode();
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

    const founderImage = 'https://images.pexels.com/photos/5647656/pexels-photo-5647656.jpeg?cs=srgb&dl=pexels-ono-kosuki-5647656.jpg&fm=jpg';
    const northStarImage = 'https://images.pexels.com/photos/3183186/pexels-photo-3183186.jpeg?auto=compress&cs=tinysrgb&w=1200';

    const values = [
        { icon: Lightbulb, title: 'Clarity', desc: 'We turn scattered opportunity hunts into one clean place to search, compare, and act.', color: '#146ef5', bg: '#146ef510', image: 'https://images.pexels.com/photos/3182812/pexels-photo-3182812.jpeg' },
        { icon: Globe, title: 'Access', desc: 'We build for underprivileged African learners who need simple, mobile-first access to global opportunity.', color: '#00d722', bg: '#00d72210', image: 'https://images.pexels.com/photos/3183186/pexels-photo-3183186.jpeg' },
        { icon: Award, title: 'Trust', desc: 'We keep the platform accurate, fast, and easy to read so learners can act with confidence.', color: '#ffae13', bg: '#ffae1310', image: 'https://images.pexels.com/photos/1595391/pexels-photo-1595391.jpeg' },
        { icon: Heart, title: 'Community', desc: 'We bring learners, mentors, and builders together to share what works and help more people rise.', color: '#ed52cb', bg: '#ed52cb10', image: 'https://images.pexels.com/photos/1181391/pexels-photo-1181391.jpeg' }
    ];

    return (
        <div className={`min-h-[100dvh] overflow-x-hidden ${isDarkMode ? 'dark' : ''}`} style={{ backgroundColor: isDarkMode ? '#080808' : '#ffffff', color: isDarkMode ? '#f5f5f5' : '#080808', fontFamily: "'Inter', 'Arial', sans-serif" }}>
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

                    <PublicSiteMenu />
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
                            className="text-[40px] sm:text-[48px] md:text-[56px] font-medium leading-[1.08] tracking-[-0.4px] mb-8"
                            style={{ color: isDarkMode ? '#ffffff' : '#080808' }}
                        >
                            Global opportunities
                            <br />
                            <span style={{ color: '#146ef5' }}>at your fingertips</span>
                        </motion.h1>

                        <motion.p
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.2 }}
                            className="max-w-[720px] text-[17px] leading-[1.6] font-normal"
                            style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}
                        >
                            Edutu helps underprivileged African learners find scholarships, internships, and fellowships faster. We make global opportunities easier to discover, understand, and apply for from the phone or browser they already use.
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
                            <h2 className="text-[34px] sm:text-[42px] font-medium leading-[1.08] mt-4 mb-8" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                                From Frustration to <span style={{ color: '#146ef5' }}>Mission</span>
                            </h2>
                            <p className="text-[18px] leading-[1.7] mb-6" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                                Edutu came from a real problem: talented African students kept missing life-changing opportunities because the information was scattered, the deadlines were hidden, and the application steps were hard to follow.
                            </p>
                            <p className="text-[18px] leading-[1.7] mb-6" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                                We realized that talent is everywhere, but access is not. Edutu closes that gap with AI, simple design, and a system that brings global opportunities into one place.
                            </p>
                            <p className="text-[18px] leading-[1.7]" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
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
                            <div
                                className="grid grid-cols-1 md:grid-cols-[1.02fr_0.98fr] overflow-hidden"
                                style={{
                                    backgroundColor: isDarkMode ? '#111' : '#f8f8f8',
                                    border: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}`,
                                    borderRadius: '20px',
                                    boxShadow: webflowShadow
                                }}
                            >
                                <div className="relative min-h-[280px] md:min-h-[420px]">
                                    <img
                                        src={northStarImage}
                                        alt="African learners collaborating"
                                        className="h-full w-full object-cover"
                                        loading="lazy"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-br from-[#08080840] via-transparent to-[#146ef520]" />
                                    <div className="absolute left-5 bottom-5 inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-[12px] font-semibold tracking-[1.2px] text-[#080808] shadow-lg backdrop-blur-sm">
                                        <Target size={14} className="text-[#146ef5]" />
                                        GLOBAL ACCESS
                                    </div>
                                </div>

                                <div className="flex flex-col justify-center gap-4 p-8 sm:p-10 lg:p-12">
                                    <div className="inline-flex items-center gap-2.4 px-4 py-2 rounded" style={{ backgroundColor: '#146ef510', border: `1px solid ${isDarkMode ? '#146ef530' : '#146ef530'}`, borderRadius: '999px' }}>
                                        <Target size={14} style={{ color: '#146ef5' }} />
                                        <span className="text-[12px] font-semibold tracking-[1.5px]" style={{ color: '#146ef5' }}>
                                            OUR NORTH STAR
                                        </span>
                                    </div>
                                    <div className="text-[28px] font-semibold leading-[1.08]" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                                        Global opportunities, made easy to reach.
                                    </div>
                                    <div className="text-[16px] leading-[1.7]" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                                        Edutu exists to make global opportunities easy to find, easy to trust, and easy to act on for every African learner, no matter where they live.
                                    </div>
                                    <div className="grid gap-3 pt-2">
                                        <div className="rounded-2xl border px-4 py-4" style={{ backgroundColor: isDarkMode ? '#121212' : '#ffffff', borderColor: isDarkMode ? '#222' : '#d8d8d8' }}>
                                            <div className="text-[13px] font-semibold tracking-[1.2px] uppercase mb-1" style={{ color: '#146ef5' }}>
                                                Find
                                            </div>
                                            <div className="text-[15px] leading-[1.6]" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                                                Curate scholarships, internships, and fellowships in one place.
                                            </div>
                                        </div>
                                        <div className="rounded-2xl border px-4 py-4" style={{ backgroundColor: isDarkMode ? '#121212' : '#ffffff', borderColor: isDarkMode ? '#222' : '#d8d8d8' }}>
                                            <div className="text-[13px] font-semibold tracking-[1.2px] uppercase mb-1" style={{ color: '#146ef5' }}>
                                                Act
                                            </div>
                                            <div className="text-[15px] leading-[1.6]" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                                                Give learners the clarity they need to move from discovery to application.
                                            </div>
                                        </div>
                                    </div>
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
                            <h2 className="text-[34px] sm:text-[42px] font-medium leading-[1.08] mt-4" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
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
                            <h2 className="text-[34px] sm:text-[42px] font-medium leading-[1.08] mt-4" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
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
                                To empower African learners with clear opportunity discovery, deadline awareness, and direct access to scholarships, internships, and fellowships that match their profile.
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
                                A world where a learner in Lagos, Accra, Nairobi, or any African city can reach global opportunities as easily as anyone else.
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
                        <h2 className="text-[34px] sm:text-[42px] font-medium leading-[1.08] mt-4 mb-16" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
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
                            <h2 className="text-[34px] sm:text-[42px] font-medium leading-[1.08] mt-4" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
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
                                    className="overflow-hidden cursor-pointer transition-all duration-300"
                                    style={{
                                        backgroundColor: isDarkMode ? '#111' : value.bg,
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
                                    <div className="h-36 w-full overflow-hidden">
                                        <img
                                            src={value.image}
                                            alt={value.title}
                                            className="h-full w-full object-cover"
                                            loading="lazy"
                                        />
                                    </div>
                                    <div className="p-6">
                                        <div className="h-12 w-12 flex items-center justify-center rounded mb-5" style={{ backgroundColor: value.bg, borderRadius: '8px' }}>
                                            <value.icon size={24} style={{ color: value.color }} />
                                        </div>
                                        <h3 className="text-[22px] font-semibold mb-3" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>{value.title}</h3>
                                        <p className="text-[15px] leading-[1.6]" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>{value.desc}</p>
                                    </div>
                                </motion.div>
                            ))}
                        </motion.div>
                    </div>
                </section>

                <section className="py-24 px-4 sm:px-6" style={{ borderTop: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}`, backgroundColor: isDarkMode ? '#0a0a0a' : '#fafafa' }}>
                    <div className="max-w-[1200px] mx-auto">
                        <div className="mb-16 text-center">
                            <span className="text-[12.8px] font-semibold tracking-[1.5px]" style={{ color: '#146ef5' }}>
                                THE FOUNDER
                            </span>
                            <h2 className="text-[34px] sm:text-[42px] font-medium leading-[1.08] mt-4" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                                Meet the <span style={{ color: '#146ef5' }}>Founder</span>
                            </h2>
                            <p className="max-w-[600px] text-[18px] leading-[1.5] mx-auto mt-4" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
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
                                className="grid grid-cols-1 lg:grid-cols-[0.94fr_1.06fr] overflow-hidden"
                                style={{
                                    backgroundColor: isDarkMode ? '#111' : '#ffffff',
                                    border: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}`,
                                    borderRadius: '20px',
                                    boxShadow: cardShadow
                                }}
                            >
                                <div className="relative min-h-[320px] lg:min-h-[520px]">
                                    <img
                                        src={founderImage}
                                        alt="Nwosu Paul Light working with a laptop"
                                        className="h-full w-full object-cover object-center"
                                        loading="lazy"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-br from-[#08080855] via-transparent to-[#146ef520]" />
                                    <div className="absolute left-6 bottom-6 inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-[12px] font-semibold tracking-[1.2px] text-[#080808] shadow-lg backdrop-blur-sm">
                                        <Sparkles size={14} className="text-[#146ef5]" />
                                        FOUNDERS VIEW
                                    </div>
                                </div>

                                <div className="flex flex-col justify-center gap-6 p-8 sm:p-10 lg:p-12" style={{ backgroundColor: isDarkMode ? '#0f0f0f' : '#f8fbff' }}>
                                    <div className="inline-flex items-center gap-2.4 px-4 py-2 rounded" style={{ backgroundColor: '#146ef510', border: `1px solid ${isDarkMode ? '#146ef530' : '#146ef530'}`, borderRadius: '999px' }}>
                                        <Sparkles size={14} style={{ color: '#146ef5' }} />
                                        <span className="text-[12px] font-semibold tracking-[1.5px]" style={{ color: '#146ef5' }}>
                                            THE FOUNDER
                                        </span>
                                    </div>

                                    <div>
                                        <h3 className="text-[28px] sm:text-[34px] lg:text-[40px] font-semibold leading-[1.05] mb-3" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                                            Nwosu Paul Light
                                        </h3>
                                        <div className="text-[13px] sm:text-[14px] font-semibold tracking-[1.5px] uppercase mb-4" style={{ color: '#146ef5' }}>
                                            Founder & CTO
                                        </div>
                                        <p className="text-[18px] sm:text-[19px] leading-[1.7]" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                                            AI & ML Systems Engineer and founder of Top100 Africa Future Leaders, building Edutu to help African learners reach global opportunities faster.
                                        </p>
                                    </div>

                                    <div className="grid gap-3">
                                        <div className="rounded-2xl border px-4 py-4" style={{ backgroundColor: isDarkMode ? '#121212' : '#ffffff', borderColor: isDarkMode ? '#222' : '#d8d8d8' }}>
                                            <div className="text-[13px] font-semibold tracking-[1.2px] uppercase mb-1" style={{ color: '#146ef5' }}>
                                                Focus
                                            </div>
                                            <div className="text-[16px] leading-[1.6]" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                                                Using AI and a clean product flow to make scholarships and opportunities easier to discover.
                                            </div>
                                        </div>
                                        <div className="rounded-2xl border px-4 py-4" style={{ backgroundColor: isDarkMode ? '#121212' : '#ffffff', borderColor: isDarkMode ? '#222' : '#d8d8d8' }}>
                                            <div className="text-[13px] font-semibold tracking-[1.2px] uppercase mb-1" style={{ color: '#146ef5' }}>
                                                Community
                                            </div>
                                            <div className="text-[16px] leading-[1.6]" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                                                Top100 Africa Future Leaders amplifies young African talent and helps them grow into visible leaders.
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        </motion.div>
                    </div>
                </section>

                <section className="py-32 px-4 sm:px-6" style={{ borderTop: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}` }}>
                    <div className="max-w-[1000px] mx-auto text-center p-12 lg:p-20" style={{ backgroundColor: '#146ef5', borderRadius: '8px', boxShadow: webflowShadow }}>
                        <h2 className="text-[32px] md:text-[42px] font-medium leading-[1.08] mb-6 text-white">
                            Ready to help more learners find opportunities?
                        </h2>
                        <p className="max-w-[500px] mx-auto text-[18px] leading-[1.5] mb-10" style={{ color: '#ffffffcc' }}>
                            Join the mission to make global opportunities easier to reach for African learners everywhere.
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
                            Browse Opportunities <ArrowRight size={16} />
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
                            Global opportunities at your fingertips for African learners, one step at a time.
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
