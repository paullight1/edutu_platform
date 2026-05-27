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
            { x: 12, y: 18, size: 36, color: '#146ef5', delay: 0 },
            { x: 72, y: 14, size: 32, color: '#00a6d6', delay: 0.15 },
            { x: 78, y: 68, size: 36, color: '#00d722', delay: 0.3 },
            { x: 18, y: 72, size: 32, color: '#ff6b00', delay: 0.45 },
            { x: 66, y: 82, size: 36, color: '#ffae13', delay: 0.6 },
        ];
        return (
            <div className="relative w-full h-full overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="relative w-40 h-40">
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
                            className="absolute inset-0 rounded-full flex items-center justify-center"
                            style={{
                                background: isDarkMode ? 'rgba(20,110,245,0.1)' : 'rgba(20,110,245,0.06)',
                                border: `1px solid ${isDarkMode ? 'rgba(20,110,245,0.2)' : 'rgba(20,110,245,0.1)'}`,
                            }}
                        >
                            <Target size={64} className="text-[#146ef5]" />
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
            <div className="relative flex h-full w-full flex-col items-center justify-center gap-5 overflow-hidden">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
                    className="absolute h-48 w-48 rounded-full"
                    style={{ border: `1px dashed ${isDarkMode ? 'rgba(255,255,255,0.16)' : 'rgba(20,110,245,0.18)'}` }}
                />
                <motion.div
                    initial={{ scale: 0.8, opacity: 0.5 }}
                    whileInView={{ scale: 1, opacity: 1 }}
                    viewport={{ once: true }}
                    className="relative z-10 flex h-28 w-28 flex-col items-center justify-center rounded-full text-center"
                    style={{
                        background: isDarkMode ? 'linear-gradient(135deg, #0f2f28, #10243b)' : 'linear-gradient(135deg, #e8fff4, #eaf4ff)',
                        border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.14)' : 'rgba(20,110,245,0.18)'}`,
                        boxShadow: isDarkMode ? '0 18px 48px rgba(0,184,107,0.14)' : '0 18px 48px rgba(20,110,245,0.12)',
                    }}
                >
                    <motion.div
                        animate={{ scale: [1, 1.18, 1], opacity: [0.75, 1, 0.75] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="mb-1 h-3 w-3 rounded-full bg-[#00b86b]"
                        style={{ boxShadow: '0 0 18px rgba(0,184,107,0.7)' }}
                    />
                    <span className="text-2xl font-black" style={{ color: isDarkMode ? '#ffffff' : '#0f1720' }}>84%</span>
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: '#00b86b' }}>On Track</span>
                </motion.div>
                <div className="relative z-10 w-full space-y-3 px-5">
                    {milestones.map((milestone, i) => (
                        <motion.div
                            key={milestone.label}
                            initial={{ opacity: 0, x: -20 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.1 }}
                            className="rounded-2xl p-3"
                            style={{ backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.78)' }}
                        >
                            <div className="mb-2 flex items-center justify-between text-xs font-bold" style={{ color: isDarkMode ? '#dbeafe' : '#1f2937' }}>
                                <span>{milestone.label}</span>
                                <span>{milestone.value}%</span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#dce9f5' }}>
                                <motion.div
                                    animate={{ width: [`${Math.max(12, milestone.value - 24)}%`, `${milestone.value}%`, `${milestone.value - 8}%`, `${milestone.value}%`] }}
                                    transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: i * 0.35 }}
                                    className="h-full rounded-full"
                                    style={{ backgroundColor: milestone.color }}
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
            { day: '15', month: 'JUN', color: '#ef4444', delay: 0 },
            { day: '22', month: 'JUN', color: '#f59e0b', delay: 0.2 },
            { day: '28', month: 'JUN', color: '#22c55e', delay: 0.4 },
        ];
        return (
            <div className="relative w-full h-full flex flex-col items-center justify-center gap-4">
                <div className="flex flex-col items-center gap-3 w-full px-4">
                    {deadlines.map((d, i) => (
                        <motion.div
                            key={i}
                            initial={{ x: -30, opacity: 0 }}
                            whileInView={{ x: 0, opacity: 1 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.4, delay: d.delay }}
                            className="w-full flex items-center gap-3"
                        >
                            <div
                                className="w-12 h-12 rounded-xl flex flex-col items-center justify-center flex-shrink-0"
                                style={{
                                    backgroundColor: `${d.color}15`,
                                    border: `1px solid ${d.color}30`,
                                }}
                            >
                                <span className="text-sm font-bold" style={{ color: d.color }}>{d.day}</span>
                                <span className="text-[8px] font-medium" style={{ color: d.color }}>{d.month}</span>
                            </div>
                            <div className="flex-1">
                                <div
                                    className="h-2 rounded-full w-full"
                                    style={{
                                        backgroundColor: isDarkMode ? '#2a2a2a' : '#e5e5e5',
                                        overflow: 'hidden',
                                    }}
                                >
                                    <motion.div
                                        initial={{ width: 0 }}
                                        whileInView={{ width: i === 2 ? '100%' : i === 1 ? '70%' : '40%' }}
                                        viewport={{ once: true }}
                                        transition={{ duration: 0.6, delay: d.delay + 0.2 }}
                                        className="h-full rounded-full"
                                        style={{ backgroundColor: d.color }}
                                    />
                                </div>
                            </div>
                            <motion.div
                                animate={{ scale: i === 0 ? [1, 1.2, 1] : 1, opacity: i === 0 ? [0.5, 1, 0.5] : 1 }}
                                transition={{ duration: 2, repeat: Infinity }}
                            >
                                <Bell size={18} style={{ color: d.color }} />
                            </motion.div>
                        </motion.div>
                    ))}
                </div>
            </div>
        );
    };

    const AINodes = () => {
        const nodes = [
            { x: 12, y: 28, size: 20, delay: 0 },
            { x: 50, y: 18, size: 36, delay: 0.15, isCenter: true },
            { x: 88, y: 32, size: 20, delay: 0.3 },
            { x: 32, y: 72, size: 20, delay: 0.45 },
            { x: 78, y: 78, size: 20, delay: 0.6 },
        ];
        return (
            <div className="relative w-full h-full">
                <svg className="absolute inset-0 w-full h-full">
                    <motion.line
                        x1="12%" y1="28%" x2="50%" y2="18%"
                        stroke={isDarkMode ? '#2a2a2a' : '#e5e5e5'}
                        strokeWidth="2.5"
                        initial={{ pathLength: 0 }}
                        whileInView={{ pathLength: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.7, delay: 0.2 }}
                    />
                    <motion.line
                        x1="50%" y1="18%" x2="88%" y2="32%"
                        stroke={isDarkMode ? '#2a2a2a' : '#e5e5e5'}
                        strokeWidth="2.5"
                        initial={{ pathLength: 0 }}
                        whileInView={{ pathLength: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.7, delay: 0.3 }}
                    />
                    <motion.line
                        x1="50%" y1="18%" x2="32%" y2="72%"
                        stroke={isDarkMode ? '#2a2a2a' : '#e5e5e5'}
                        strokeWidth="2.5"
                        initial={{ pathLength: 0 }}
                        whileInView={{ pathLength: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.7, delay: 0.4 }}
                    />
                    <motion.line
                        x1="32%" y1="72%" x2="78%" y2="78%"
                        stroke={isDarkMode ? '#2a2a2a' : '#e5e5e5'}
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
                        initial={{ scale: 0 }}
                        whileInView={{ scale: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.35, delay: n.delay, ease: 'easeOut' }}
                        animate={n.isCenter ? { scale: [1, 1.12, 1] } : {}}
                        className="absolute rounded-full flex items-center justify-center"
                        style={{
                            left: `${n.x}%`,
                            top: `${n.y}%`,
                            width: n.size,
                            height: n.size,
                            backgroundColor: n.isCenter ? '#146ef5' : isDarkMode ? '#2a2a2a' : '#e5e5e5',
                            transform: 'translate(-50%, -50%)',
                            boxShadow: n.isCenter ? '0 6px 20px rgba(20,110,245,0.5)' : '0 2px 8px rgba(0,0,0,0.1)',
                        }}
                    >
                        {n.isCenter && <Sparkles size={18} className="text-white" />}
                    </motion.div>
                ))}
            </div>
        );
    };

    const SuccessAnimation = () => (
        <div className="flex flex-col items-center justify-center gap-5 h-full">
            <div className="flex items-center justify-center gap-4">
                <motion.div
                    initial={{ scale: 0.8, opacity: 0.5 }}
                    whileInView={{ scale: 1, opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.3 }}
                    className="w-16 h-16 rounded-2xl flex items-center justify-center"
                    style={{
                        backgroundColor: isDarkMode ? '#1a1a1a' : '#f5f5f5',
                        border: `1px solid ${isDarkMode ? '#2a2a2a' : '#e5e5e5'}`,
                    }}
                >
                    <Activity size={28} className="text-[#146ef5]" />
                </motion.div>
                <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    whileInView={{ scale: 1, rotate: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 0.3, ease: 'easeOut' }}
                    className="w-24 h-24 rounded-full flex items-center justify-center"
                    style={{
                        background: 'linear-gradient(135deg, #146ef5 0%, #7a3dff 100%)',
                        boxShadow: '0 12px 32px rgba(20,110,245,0.4)',
                    }}
                >
                    <CheckCircle size={40} className="text-white" />
                </motion.div>
            </div>
            <motion.div
                initial={{ width: 0 }}
                whileInView={{ width: 120 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.5 }}
                className="h-2 rounded-full"
                style={{ background: 'linear-gradient(90deg, #146ef5, #7a3dff)' }}
            />
            <div className="flex items-center gap-2">
                {[1, 2, 3].map((i) => (
                    <motion.div
                        key={i}
                        initial={{ scale: 0 }}
                        whileInView={{ scale: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.3, delay: 0.6 + i * 0.1 }}
                        className="flex items-center gap-1"
                    >
                        <CheckCircle size={16} className="text-[#22c55e]" />
                        <span className="text-[10px] font-medium" style={{ color: '#22c55e' }}>
                            {i === 1 ? 'CV Optimized' : i === 2 ? 'Applied' : 'Interview'}
                        </span>
                    </motion.div>
                ))}
            </div>
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
            <div className="relative w-full h-full flex flex-col items-center justify-center gap-4">
                <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    whileInView={{ scale: 1, opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4 }}
                    className="flex items-center gap-3 mb-2"
                >
                    <div
                        className="w-16 h-16 rounded-2xl flex items-center justify-center"
                        style={{
                            background: 'linear-gradient(135deg, #146ef5 0%, #7a3dff 100%)',
                            boxShadow: '0 8px 24px rgba(20,110,245,0.3)',
                        }}
                    >
                        <Brain size={32} className="text-white" />
                    </div>
                    <div
                        className="w-16 h-16 rounded-2xl flex items-center justify-center"
                        style={{
                            backgroundColor: isDarkMode ? 'rgba(20,110,245,0.1)' : 'rgba(20,110,245,0.06)',
                            border: `1px solid ${isDarkMode ? 'rgba(20,110,245,0.2)' : 'rgba(20,110,245,0.1)'}`,
                        }}
                    >
                        <Mic size={32} className="text-[#146ef5]" />
                    </div>
                </motion.div>
                <div className="flex items-end justify-center gap-1.5 w-full px-4">
                    {bars.map((h, i) => (
                        <motion.div
                            key={i}
                            animate={{
                                height: [`${h * 0.5}%`, `${h}%`, `${h * 0.5}%`],
                            }}
                            transition={{
                                duration: 1.5,
                                repeat: Infinity,
                                delay: i * 0.08,
                                ease: 'easeInOut',
                            }}
                            className="w-2 rounded-full"
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
                    className="flex items-center gap-2 text-sm font-medium"
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
            desc: 'Personalized recommendations based on your skills and goals.',
            visual: <FloatingAvatars />,
            gradient: false,
        },
        {
            title: 'Real-Time Progress Tracking',
            desc: 'Track applications, deadlines, and milestones.',
            visual: <AnimatedBarChart />,
            gradient: false,
        },
        {
            title: 'Fewer Missed Deadlines',
            desc: 'Smart reminders for every application window.',
            visual: <DeadlineReminders />,
            gradient: false,
        },
        {
            title: 'AI Roadmap Generator',
            desc: 'Step-by-step preparation plans powered by AI.',
            visual: <AINodes />,
            gradient: false,
        },
        {
            title: 'Higher Success Rate',
            desc: 'AI-powered CV optimization and guidance.',
            visual: <SuccessAnimation />,
            gradient: false,
        },
        {
            title: 'AI Voice Assistant',
            desc: 'Hands-free career guidance with voice commands.',
            visual: <VoiceWaveform />,
            gradient: false,
        },
    ];

    return (
        <section className="py-20 px-4" style={{ backgroundColor: isDarkMode ? '#0a0a0a' : '#f5f5f5' }}>
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

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
                            className="relative overflow-hidden rounded-3xl"
                            style={{
                                aspectRatio: '1 / 1',
                                background: isDarkMode
                                    ? '#111111'
                                    : index % 3 === 0
                                        ? 'linear-gradient(135deg, #f0fff8, #ffffff)'
                                        : index % 3 === 1
                                            ? 'linear-gradient(135deg, #edf7ff, #ffffff)'
                                            : 'linear-gradient(135deg, #fff8e8, #ffffff)',
                                border: `1px solid ${isDarkMode ? '#1e1e1e' : index % 3 === 0 ? '#bdebd6' : index % 3 === 1 ? '#c8ddff' : '#ffe2a8'}`,
                                boxShadow: isDarkMode
                                    ? '0 4px 12px rgba(0,0,0,0.3), 0 12px 36px rgba(0,0,0,0.2)'
                                    : '0 4px 12px rgba(0,0,0,0.05), 0 12px 36px rgba(0,0,0,0.08)',
                                padding: '24px',
                                display: 'flex',
                                flexDirection: 'column',
                            }}
                        >
                            <div
                                className="flex-1 min-h-0 mb-5 relative"
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                                {item.visual}
                            </div>

                            <div className="mt-auto">
                                <h3
                                    className="text-base font-bold mb-1.5 leading-tight"
                                    style={{ color: isDarkMode ? '#fafafa' : '#0a0a0a' }}
                                >
                                    {item.title}
                                </h3>

                                <p
                                    className="text-xs leading-relaxed"
                                    style={{ color: isDarkMode ? '#888' : '#666' }}
                                >
                                    {item.desc}
                                </p>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default BentoBenefits;
