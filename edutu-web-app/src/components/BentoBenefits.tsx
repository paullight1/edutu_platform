import React from 'react';
import {
    Target,
    BarChart3,
    CalendarCheck,
    Sparkles,
    CheckCircle,
    Globe,
    Rocket,
    ArrowRight,
    User,
    Zap,
    Bell,
    Activity,
    Mic,
    Brain
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useDarkMode } from '../hooks/useDarkMode';

const BentoBenefits: React.FC = () => {
    const { isDarkMode } = useDarkMode();

    const FloatingAvatars = () => {
        const positions = [
            { x: 12, y: 18, size: 42, color: '#146ef5', delay: 0 },
            { x: 72, y: 14, size: 38, color: '#00a6d6', delay: 0.15 },
            { x: 78, y: 68, size: 42, color: '#00d722', delay: 0.3 },
            { x: 18, y: 72, size: 38, color: '#ff6b00', delay: 0.45 },
            { x: 66, y: 82, size: 42, color: '#ffae13', delay: 0.6 },
        ];
        return (
            <div className="relative w-full h-full overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="relative w-48 h-48 sm:w-40 sm:h-40">
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
                            className="absolute inset-0 rounded-full flex items-center justify-center"
                            style={{
                                background: isDarkMode ? 'rgba(20,110,245,0.1)' : 'rgba(20,110,245,0.06)',
                                border: `1px solid ${isDarkMode ? 'rgba(20,110,245,0.2)' : 'rgba(20,110,245,0.1)'}`,
                            }}
                        >
                            <Target size={76} className="text-[#146ef5]" />
                        </motion.div>
                        <motion.div
                            animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.6, 0.3] }}
                            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                            className="absolute inset-0 rounded-full"
                            style={{
                                background: 'radial-gradient(circle, rgba(20,110,245,0.15) 0%, transparent 70%)',
                            }}
                        />
                        {positions.map((pos, i) => (
                            <motion.div
                                key={i}
                                animate={{
                                    y: [0, -10, 0],
                                    x: [0, 6, 0],
                                }}
                                transition={{
                                    duration: 3.5 + i * 0.4,
                                    repeat: Infinity,
                                    ease: 'easeInOut',
                                    delay: pos.delay,
                                }}
                                className="absolute rounded-full flex items-center justify-center"
                                style={{
                                    left: `${pos.x}%`,
                                    top: `${pos.y}%`,
                                    width: pos.size,
                                    height: pos.size,
                                    backgroundColor: pos.color,
                                    opacity: 0.85,
                                    transform: 'translate(-50%, -50%)',
                                    boxShadow: `0 8px 20px ${pos.color}50`,
                                }}
                            >
                                <User size={pos.size * 0.55} className="text-white" />
                            </motion.div>
                        ))}
                    </div>
                </div>
            </div>
        );
    };

    const AnimatedBarChart = () => {
        const milestones = [
            { label: 'Shortlist', value: 72, color: '#00b86b' },
            { label: 'Essay', value: 54, color: '#ffae13' },
            { label: 'Submit', value: 88, color: '#146ef5' },
        ];
        return (
            <div className="relative flex h-full w-full flex-col items-center justify-center gap-4 overflow-hidden px-2">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                    className="absolute h-44 w-44 rounded-full sm:h-36 sm:w-36"
                    style={{ border: `1px dashed ${isDarkMode ? 'rgba(255,255,255,0.16)' : 'rgba(20,110,245,0.18)'}` }}
                />
                <motion.div
                    animate={{ opacity: [0.8, 1, 0.8] }}
                    transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                    className="relative z-10 flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em]"
                    style={{ color: '#00b86b', backgroundColor: isDarkMode ? 'rgba(0,184,107,0.12)' : 'rgba(0,184,107,0.1)' }}
                >
                    <span className="h-2 w-2 rounded-full bg-[#00b86b]" />
                    On track
                </motion.div>
                <div className="relative z-10 w-full max-w-[270px] space-y-3">
                    {milestones.map((milestone, i) => (
                        <motion.div
                            key={milestone.label}
                            initial={{ opacity: 0, x: -20 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.1 }}
                            className="rounded-2xl p-4"
                            style={{ backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.78)' }}
                        >
                            <div className="mb-2 flex items-center justify-between text-[11px] font-bold" style={{ color: isDarkMode ? '#dbeafe' : '#1f2937' }}>
                                <span>{milestone.label}</span>
                                <span>{milestone.value}%</span>
                            </div>
                            <div className="h-2.5 overflow-hidden rounded-full" style={{ backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#dce9f5' }}>
                                <motion.div
                                    animate={{ scaleX: [(milestone.value - 18) / 100, milestone.value / 100, (milestone.value - 6) / 100, milestone.value / 100] }}
                                    transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: i * 0.35 }}
                                    className="h-full origin-left rounded-full"
                                    style={{ backgroundColor: milestone.color, transformOrigin: 'left center' }}
                                />
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        );
    };

    const DeadlineReminders = () => {
        const deadlines = [
            { day: '15', month: 'Jun', title: 'DAAD Scholarship', country: 'Germany', color: '#ef4444' },
            { day: '22', month: 'Jun', title: 'Chevening Essays', country: 'United Kingdom', color: '#f59e0b' },
            { day: '28', month: 'Jun', title: 'Mandela Fellowship', country: 'United States', color: '#22c55e' },
            { day: '04', month: 'Jul', title: 'Vanier CGS', country: 'Canada', color: '#146ef5' },
        ];
        return (
            <div className="relative h-full w-full overflow-hidden px-4">
                <div className="absolute inset-x-8 top-6 h-28 rounded-full blur-2xl" style={{ backgroundColor: isDarkMode ? 'rgba(20,110,245,0.16)' : 'rgba(20,110,245,0.12)' }} />
                <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-10" style={{ background: `linear-gradient(180deg, ${isDarkMode ? '#111' : '#f8fbff'}, transparent)` }} />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-10" style={{ background: `linear-gradient(0deg, ${isDarkMode ? '#111' : '#f8fbff'}, transparent)` }} />
                <motion.div
                    animate={{ y: [0, -68, -136, -204, 0] }}
                    transition={{ duration: 9, repeat: Infinity, ease: [0.76, 0, 0.24, 1], times: [0, 0.24, 0.48, 0.72, 1] }}
                    className="space-y-4 pt-12"
                >
                    {[...deadlines, ...deadlines.slice(0, 3)].map((d, i) => (
                        <motion.div
                            key={i}
                            animate={{ scale: [0.94, 1.04, 0.94], opacity: [0.58, 1, 0.58] }}
                            transition={{ duration: 3, repeat: Infinity, delay: (i % deadlines.length) * 0.2, ease: 'easeInOut' }}
                            className="flex w-full items-center gap-3 rounded-2xl p-4"
                            style={{ backgroundColor: isDarkMode ? 'rgba(255,255,255,0.055)' : 'rgba(255,255,255,0.8)' }}
                        >
                            <div
                                className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl"
                                style={{
                                    backgroundColor: `${d.color}15`,
                                    border: `1px solid ${d.color}30`,
                                }}
                            >
                                <span className="text-sm font-bold" style={{ color: d.color }}>{d.day}</span>
                                <span className="text-[8px] font-bold uppercase" style={{ color: d.color }}>{d.month}</span>
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-[13px] font-bold" style={{ color: isDarkMode ? '#f7fbff' : '#102033' }}>{d.title}</div>
                                <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: isDarkMode ? '#7f8b98' : '#64748b' }}>{d.country}</div>
                            </div>
                            <Bell size={16} style={{ color: d.color }} />
                        </motion.div>
                    ))}
                </motion.div>
            </div>
        );
    };

    const AINodes = () => {
        const nodes = [
            { x: 16, y: 30, flag: 'ng', label: 'NG', delay: 0 },
            { x: 50, y: 20, flag: 'gb', label: 'UK', delay: 0.15, isCenter: true },
            { x: 84, y: 34, flag: 'us', label: 'US', delay: 0.3 },
            { x: 34, y: 70, flag: 'de', label: 'DE', delay: 0.45 },
            { x: 76, y: 72, flag: 'ca', label: 'CA', delay: 0.6 },
        ];
        return (
            <div className="relative h-full w-full overflow-hidden">
                <div className="absolute inset-x-10 top-6 h-32 rounded-full blur-2xl" style={{ backgroundColor: isDarkMode ? 'rgba(20,110,245,0.14)' : 'rgba(0,184,107,0.1)' }} />
                <svg className="absolute inset-0 w-full h-full">
                    <motion.line
                        x1="12%" y1="28%" x2="50%" y2="18%"
                        stroke={isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(20,110,245,0.18)'}
                        strokeWidth="2.5"
                        initial={{ pathLength: 0 }}
                        whileInView={{ pathLength: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.7, delay: 0.2 }}
                    />
                    <motion.line
                        x1="50%" y1="18%" x2="88%" y2="32%"
                        stroke={isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(20,110,245,0.18)'}
                        strokeWidth="2.5"
                        initial={{ pathLength: 0 }}
                        whileInView={{ pathLength: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.7, delay: 0.3 }}
                    />
                    <motion.line
                        x1="50%" y1="18%" x2="32%" y2="72%"
                        stroke={isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(20,110,245,0.18)'}
                        strokeWidth="2.5"
                        initial={{ pathLength: 0 }}
                        whileInView={{ pathLength: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.7, delay: 0.4 }}
                    />
                    <motion.line
                        x1="32%" y1="72%" x2="78%" y2="78%"
                        stroke={isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(20,110,245,0.18)'}
                        strokeWidth="2.5"
                        initial={{ pathLength: 0 }}
                        whileInView={{ pathLength: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.7, delay: 0.5 }}
                    />
                </svg>
                {nodes.map((n, i) => (
                    <motion.div
                        key={i}
                        animate={{ y: [0, -7, 0], scale: n.isCenter ? [1, 1.08, 1] : [1, 1.03, 1] }}
                        transition={{ duration: 3.2, repeat: Infinity, delay: n.delay, ease: 'easeInOut' }}
                        className="absolute flex items-center justify-center overflow-hidden rounded-full"
                        style={{
                            left: `${n.x}%`,
                            top: `${n.y}%`,
                            width: n.isCenter ? 56 : 44,
                            height: n.isCenter ? 56 : 44,
                            backgroundColor: isDarkMode ? '#151b22' : '#ffffff',
                            transform: 'translate(-50%, -50%)',
                            border: `2px solid ${n.isCenter ? '#146ef5' : isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(20,110,245,0.2)'}`,
                            boxShadow: n.isCenter ? '0 10px 26px rgba(20,110,245,0.4)' : '0 8px 20px rgba(0,0,0,0.12)',
                        }}
                    >
                        <img src={`https://flagcdn.com/w80/${n.flag}.png`} alt="" className="h-full w-full object-cover" loading="lazy" />
                        {n.isCenter && (
                            <span className="absolute inset-0 flex items-center justify-center text-[9px] font-black text-white" style={{ backgroundColor: 'rgba(20,110,245,0.42)' }}>
                                {n.label}
                            </span>
                        )}
                    </motion.div>
                ))}
                <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ backgroundColor: isDarkMode ? 'rgba(20,110,245,0.16)' : 'rgba(255,255,255,0.78)', color: '#146ef5' }}>
                    <Sparkles size={12} /> Roadmap
                </div>
            </div>
        );
    };

    const SuccessAnimation = () => (
        <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
            <div className="absolute h-48 w-48 rounded-full blur-2xl" style={{ backgroundColor: isDarkMode ? 'rgba(0,184,107,0.14)' : 'rgba(0,184,107,0.16)' }} />
            {[0, 1, 2].map((i) => (
                <motion.div
                    key={i}
                    animate={{ y: [14, -10, 14], rotate: [-2 + i, 2 - i, -2 + i] }}
                    transition={{ duration: 4 + i * 0.35, repeat: Infinity, ease: 'easeInOut', delay: i * 0.25 }}
                    className="absolute rounded-2xl p-3"
                    style={{
                        width: i === 1 ? 184 : 140,
                        left: i === 0 ? '12%' : i === 1 ? '26%' : '54%',
                        top: i === 0 ? '45%' : i === 1 ? '24%' : '50%',
                        backgroundColor: isDarkMode ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.9)',
                        border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.11)' : 'rgba(20,110,245,0.14)'}`,
                        boxShadow: '0 18px 40px rgba(0,0,0,0.14)',
                    }}
                >
                    <div className="mb-2 flex items-center gap-2">
                        <CheckCircle size={15} style={{ color: i === 2 ? '#00b86b' : '#146ef5' }} />
                        <span className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: isDarkMode ? '#dce8f5' : '#1f2d3d' }}>
                            {i === 0 ? 'Score' : i === 1 ? 'Application' : 'Offer'}
                        </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#e3edf7' }}>
                        <motion.div
                            animate={{ scaleX: i === 0 ? [0.54, 0.82, 0.54] : i === 1 ? [0.36, 0.68, 0.36] : [0.7, 0.96, 0.7] }}
                            transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut', delay: i * 0.2 }}
                            className="h-full origin-left rounded-full"
                            style={{ backgroundColor: i === 2 ? '#00b86b' : '#146ef5' }}
                        />
                    </div>
                </motion.div>
            ))}
            <motion.div
                animate={{ scale: [1, 1.08, 1], opacity: [0.9, 1, 0.9] }}
                transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                className="relative z-10 flex h-24 w-24 items-center justify-center rounded-full"
                style={{ background: 'linear-gradient(135deg, #146ef5 0%, #00b86b 100%)', boxShadow: '0 18px 44px rgba(20,110,245,0.35)' }}
            >
                <Rocket size={36} className="text-white" />
            </motion.div>
        </div>
    );

    const GlobeNetwork = () => {
        const dots = [
            { x: 25, y: 35 },
            { x: 48, y: 25 },
            { x: 72, y: 40 },
            { x: 42, y: 65 },
            { x: 65, y: 58 },
            { x: 35, y: 50 },
            { x: 60, y: 30 },
        ];
        return (
            <div className="relative w-full h-full flex items-center justify-center">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 35, repeat: Infinity, ease: 'linear' }}
                >
                    <Globe size={80} className="text-[#146ef5]" style={{ opacity: 0.15 }} />
                </motion.div>
                {dots.map((d, i) => (
                    <motion.div
                        key={i}
                        animate={{
                            scale: [1, 1.6, 1],
                            opacity: [0.3, 1, 0.3],
                        }}
                        transition={{
                            duration: 2.5,
                            repeat: Infinity,
                            delay: i * 0.35,
                        }}
                        className="absolute rounded-full"
                        style={{
                            left: `${d.x}%`,
                            top: `${d.y}%`,
                            width: 10,
                            height: 10,
                            backgroundColor: '#146ef5',
                            transform: 'translate(-50%, -50%)',
                            boxShadow: '0 0 12px rgba(20,110,245,0.6)',
                        }}
                    />
                ))}
            </div>
        );
    };

    const VoiceWaveform = () => {
        const bars = [20, 40, 60, 80, 100, 80, 60, 40, 20, 40, 60, 80, 60, 40, 20];
        return (
            <div className="relative flex h-full w-full flex-col items-center justify-between gap-4 overflow-hidden py-4">
                <motion.div
                    animate={{ scale: [1, 1.18, 1], opacity: [0.45, 0.78, 0.45] }}
                    transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
                    className="absolute h-52 w-52 rounded-full blur-2xl sm:h-44 sm:w-44"
                    style={{ background: isDarkMode ? 'radial-gradient(circle, rgba(20,110,245,0.42), transparent 68%)' : 'radial-gradient(circle, rgba(20,110,245,0.2), transparent 68%)' }}
                />
                <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    whileInView={{ scale: 1, opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4 }}
                    className="relative z-10 flex items-center gap-4 mb-1"
                >
                    <div
                        className="w-20 h-20 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center"
                        style={{
                            background: 'linear-gradient(135deg, #146ef5 0%, #7a3dff 100%)',
                            boxShadow: '0 8px 24px rgba(20,110,245,0.3)',
                        }}
                    >
                        <Brain size={40} className="text-white sm:scale-90" />
                    </div>
                    <div
                        className="w-20 h-20 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center"
                        style={{
                            backgroundColor: isDarkMode ? 'rgba(20,110,245,0.1)' : 'rgba(20,110,245,0.06)',
                            border: `1px solid ${isDarkMode ? 'rgba(20,110,245,0.2)' : 'rgba(20,110,245,0.1)'}`,
                        }}
                    >
                        <Mic size={40} className="text-[#146ef5] sm:scale-90" />
                    </div>
                </motion.div>
                <div className="relative z-10 flex h-28 w-full items-center justify-center gap-2 px-5">
                    {bars.map((h, i) => (
                        <motion.div
                            key={i}
                            animate={{
                                scaleY: [Math.max(0.18, h / 180), h / 100, Math.max(0.18, h / 180)],
                            }}
                            transition={{
                                duration: 1.5,
                                repeat: Infinity,
                                delay: i * 0.08,
                                ease: 'easeInOut',
                            }}
                            className="h-24 w-2.5 origin-center rounded-full sm:h-20 sm:w-2"
                            style={{
                                background: i >= 5 && i <= 9
                                    ? 'linear-gradient(180deg, #146ef5 0%, #7a3dff 100%)'
                                    : isDarkMode
                                        ? '#2a2a2a'
                                        : '#e5e5e5',
                            }}
                        />
                    ))}
                </div>
                <motion.div
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 0.6 }}
                    className="relative z-10 flex items-center gap-2 text-[13px] font-medium sm:text-sm"
                    style={{ color: '#146ef5' }}
                >
                    <motion.div
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="w-2 h-2 rounded-full bg-[#146ef5]"
                    />
                    AI Voice Assistant Active
                </motion.div>
            </div>
        );
    };

    const bentoItems = [
        {
            title: 'Smart Opportunity Matching',
            visual: <FloatingAvatars />,
            gradient: false,
        },
        {
            title: 'Real-Time Progress Tracking',
            visual: <AnimatedBarChart />,
            gradient: false,
        },
        {
            title: 'Fewer Missed Deadlines',
            visual: <DeadlineReminders />,
            gradient: false,
        },
        {
            title: 'AI Roadmap Generator',
            visual: <AINodes />,
            gradient: false,
        },
        {
            title: 'Higher Success Rate',
            visual: <SuccessAnimation />,
            gradient: false,
        },
        {
            title: 'AI Voice Assistant',
            visual: <VoiceWaveform />,
            gradient: false,
        },
    ];

    return (
        <section id="benefits" className="py-20 px-4" style={{ backgroundColor: isDarkMode ? '#0a0a0a' : '#f5f5f5' }}>
            <div className="max-w-7xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5 }}
                    className="text-center mb-16"
                >
                    <div
                        className="inline-flex items-center gap-2 px-4 py-2 mb-5 rounded-full"
                        style={{
                            backgroundColor: isDarkMode ? 'rgba(20,110,245,0.08)' : 'rgba(20,110,245,0.06)',
                            border: `1px solid ${isDarkMode ? 'rgba(20,110,245,0.15)' : 'rgba(20,110,245,0.12)'}`,
                        }}
                    >
                        <Sparkles size={14} className="text-[#146ef5]" />
                        <span className="text-xs font-bold tracking-widest text-[#146ef5]">Benefits</span>
                    </div>
                    <h2
                        className="text-4xl md:text-5xl font-bold mb-4 tracking-tight"
                        style={{ color: isDarkMode ? '#fafafa' : '#0a0a0a' }}
                    >
                        Built to Help You{' '}
                        <span className="inline-flex items-center gap-2">
                            <span className="inline-block w-10 h-10 rounded-xl bg-[#146ef5] flex items-center justify-center">
                                <Zap size={20} className="text-white" />
                            </span>
                        <span className="text-[#00b86b]">Grow</span>
                        </span>
                    </h2>
                    <p
                        className="max-w-2xl mx-auto text-base leading-relaxed"
                        style={{ color: isDarkMode ? '#888' : '#666' }}
                    >
                        Sick of missed opportunities and career confusion? We help you discover, plan, and achieve your biggest goals with AI-powered guidance.
                    </p>
                </motion.div>

                <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 md:gap-6">
                    {bentoItems.map((item, index) => (
                        <motion.div
                            key={index}
                            initial={{ opacity: 0, y: 16 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: '-50px' }}
                            transition={{ duration: 0.4, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
                            whileHover={{
                                scale: 1.01,
                                transition: { duration: 0.25, ease: 'easeOut' },
                            }}
                            className="relative overflow-hidden rounded-[24px] p-3 sm:p-5 md:p-6 min-h-[208px] sm:min-h-[320px]"
                            style={{
                                aspectRatio: '1.08 / 1',
                                background: isDarkMode
                                    ? '#111111'
                                    : index % 3 === 0
                                        ? 'linear-gradient(135deg, #f0fff8, #ffffff)'
                                        : index % 3 === 1
                                            ? 'linear-gradient(135deg, #edf7ff, #ffffff)'
                                            : 'linear-gradient(135deg, #fff8e8, #ffffff)',
                                border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.06)' : index % 3 === 0 ? 'rgba(29, 78, 216, 0.12)' : index % 3 === 1 ? 'rgba(59, 130, 246, 0.12)' : 'rgba(245, 158, 11, 0.12)'}`,
                                boxShadow: isDarkMode
                                    ? 'none'
                                    : '0 12px 28px rgba(15, 23, 42, 0.06)',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'space-between',
                                textAlign: 'center',
                            }}
                        >
                            <div
                                className="relative flex min-h-[112px] items-center justify-center origin-center scale-[0.56] sm:min-h-[180px] sm:scale-100"
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                                {item.visual}
                            </div>

                            <div className="mt-2 sm:mt-5">
                                <h3
                                    className="mx-auto max-w-[11ch] text-[12px] font-semibold leading-[1.15] text-center sm:max-w-[12ch] sm:text-base sm:font-bold"
                                    style={{
                                        color: isDarkMode ? '#fafafa' : '#0a0a0a',
                                        display: '-webkit-box',
                                        WebkitBoxOrient: 'vertical',
                                        WebkitLineClamp: 2,
                                        overflow: 'hidden',
                                    }}
                                >
                                    {item.title}
                                </h3>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default BentoBenefits;
