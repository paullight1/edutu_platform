import React from 'react';
import {
    Activity,
    CalendarCheck,
    Mic,
    Rocket,
    Sparkles,
    Target,
    TrendingUp,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useDarkMode } from '../hooks/useDarkMode';

type BenefitCard = {
    title: string;
    copy: string;
    eyebrow: string;
    image: string;
    accent: string;
    Icon: LucideIcon;
};

const benefitCards: BenefitCard[] = [
    {
        title: 'Smart matching',
        copy: 'See the right opportunities first.',
        eyebrow: 'AI match',
        image: 'https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg',
        accent: '#146ef5',
        Icon: Target,
    },
    {
        title: 'Live progress',
        copy: 'Track each application as it moves.',
        eyebrow: 'Status',
        image: 'https://images.pexels.com/photos/3182812/pexels-photo-3182812.jpeg',
        accent: '#00b86b',
        Icon: Activity,
    },
    {
        title: 'Deadline alerts',
        copy: 'Catch closing dates before they pass.',
        eyebrow: 'Reminders',
        image: 'https://images.pexels.com/photos/1181671/pexels-photo-1181671.jpeg',
        accent: '#ffae13',
        Icon: CalendarCheck,
    },
    {
        title: 'Study roadmap',
        copy: 'Turn one goal into clear next steps.',
        eyebrow: 'Plan',
        image: 'https://images.pexels.com/photos/1595391/pexels-photo-1595391.jpeg',
        accent: '#7a3dff',
        Icon: Rocket,
    },
    {
        title: 'Success boosts',
        copy: 'Keep every application stronger.',
        eyebrow: 'Outcome',
        image: 'https://images.pexels.com/photos/267885/pexels-photo-267885.jpeg',
        accent: '#ed52cb',
        Icon: TrendingUp,
    },
    {
        title: 'Voice help',
        copy: 'Ask questions whenever you get stuck.',
        eyebrow: 'Ask',
        image: 'https://images.pexels.com/photos/3777572/pexels-photo-3777572.jpeg',
        accent: '#00a6d6',
        Icon: Mic,
    },
];

const marqueeCards = [...benefitCards, ...benefitCards];

const BentoBenefits: React.FC = () => {
    const { isDarkMode } = useDarkMode();

    return (
        <section
            id="benefits"
            className="relative overflow-hidden px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
            style={{
                backgroundColor: isDarkMode ? '#07090f' : '#eef3fb',
            }}
        >
            <div
                className="pointer-events-none absolute inset-0"
                style={{
                    background: isDarkMode
                        ? 'radial-gradient(circle at top left, rgba(20,110,245,0.14), transparent 32%), radial-gradient(circle at 90% 16%, rgba(122,61,255,0.1), transparent 24%), linear-gradient(180deg, rgba(255,255,255,0.02) 0%, transparent 30%, rgba(0,0,0,0.12) 100%)'
                        : 'radial-gradient(circle at top left, rgba(20,110,245,0.09), transparent 32%), radial-gradient(circle at 90% 16%, rgba(122,61,255,0.06), transparent 24%), linear-gradient(180deg, rgba(255,255,255,0.34) 0%, transparent 30%, rgba(255,255,255,0.72) 100%)',
                }}
            />

            <div className="relative mx-auto max-w-[1280px]">
                <div className="max-w-2xl">
                    <div
                        className="inline-flex items-center gap-2 rounded-full px-4 py-2"
                        style={{
                            backgroundColor: isDarkMode ? 'rgba(20,110,245,0.12)' : 'rgba(20,110,245,0.08)',
                            border: `1px solid ${isDarkMode ? 'rgba(20,110,245,0.22)' : 'rgba(20,110,245,0.14)'}`,
                        }}
                    >
                        <Sparkles size={14} className="text-[#146ef5]" />
                        <span className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: '#146ef5' }}>
                            Benefits
                        </span>
                    </div>

                    <h2
                        className="mt-5 text-[clamp(2rem,4.2vw,4.2rem)] font-semibold leading-[1.02] tracking-[-0.04em]"
                        style={{ color: isDarkMode ? '#fafafa' : '#0a0a0a' }}
                    >
                        Simple tools that
                        <span className="block" style={{ color: '#146ef5' }}>
                            move learners forward.
                        </span>
                    </h2>

                    <p
                        className="mt-4 max-w-xl text-[15px] leading-[1.7] sm:text-[16px]"
                        style={{ color: isDarkMode ? 'rgba(255,255,255,0.68)' : '#4b5563' }}
                    >
                        Find, track, and finish opportunities with less work and less noise.
                    </p>
                </div>

                <div className="relative mt-10">
                    <div
                        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 sm:w-24"
                        style={{
                            background: isDarkMode
                                ? 'linear-gradient(90deg, #07090f 0%, rgba(7,9,15,0) 100%)'
                                : 'linear-gradient(90deg, #eef3fb 0%, rgba(238,243,251,0) 100%)',
                        }}
                    />
                    <div
                        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 sm:w-24"
                        style={{
                            background: isDarkMode
                                ? 'linear-gradient(270deg, #07090f 0%, rgba(7,9,15,0) 100%)'
                                : 'linear-gradient(270deg, #eef3fb 0%, rgba(238,243,251,0) 100%)',
                        }}
                    />

                    <div className="overflow-hidden motion-reduce:overflow-x-auto">
                        <div id="benefits-marquee" className="benefits-marquee flex w-max gap-4 sm:gap-5 py-2">
                            {marqueeCards.map((card, index) => (
                                <article
                                    key={`${card.title}-${index}`}
                                    className="group relative h-[300px] w-[220px] shrink-0 overflow-hidden rounded-[26px] border sm:h-[320px] sm:w-[250px] lg:w-[270px]"
                                    style={{
                                        borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(148,163,184,0.18)',
                                        backgroundColor: isDarkMode ? '#0b0f16' : '#ffffff',
                                        boxShadow: isDarkMode
                                            ? '0 18px 42px rgba(0,0,0,0.34)'
                                            : '0 18px 42px rgba(15,23,42,0.12)',
                                    }}
                                >
                                    <img
                                        src={card.image}
                                        alt={card.title}
                                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                                        loading="lazy"
                                        draggable={false}
                                    />

                                    <div
                                        className="absolute inset-0"
                                        style={{
                                            background:
                                                'linear-gradient(180deg, rgba(4,8,16,0.04) 0%, rgba(4,8,16,0.15) 42%, rgba(4,8,16,0.82) 100%)',
                                        }}
                                    />

                                    <div
                                        className="absolute inset-0 opacity-70"
                                        style={{
                                            background: `radial-gradient(circle at 26% 16%, ${card.accent}24, transparent 34%), radial-gradient(circle at 80% 28%, ${card.accent}16, transparent 28%)`,
                                        }}
                                    />

                                    <div className="relative flex h-full flex-col justify-between p-4 sm:p-5">
                                        <div className="flex items-start justify-between gap-3">
                                            <div
                                                className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] backdrop-blur"
                                                style={{
                                                    backgroundColor: `${card.accent}22`,
                                                    border: `1px solid ${card.accent}40`,
                                                    color: '#ffffff',
                                                }}
                                            >
                                                <card.Icon size={12} strokeWidth={2.2} />
                                                {card.eyebrow}
                                            </div>
                                        </div>

                                        <div className="max-w-[16rem]">
                                            <h3 className="text-[22px] font-semibold leading-[1.04] tracking-[-0.04em] text-white sm:text-[24px]">
                                                {card.title}
                                            </h3>
                                            <p className="mt-2 text-[13px] font-medium leading-[1.55] text-white sm:text-[14px]" style={{ textShadow: '0 1px 10px rgba(0,0,0,0.45)' }}>
                                                {card.copy}
                                            </p>
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
                #benefits-marquee {
                    animation: benefits-marquee 38s linear infinite;
                }

                #benefits-marquee:hover {
                    animation-play-state: paused;
                }

                @keyframes benefits-marquee {
                    0% {
                        transform: translate3d(0, 0, 0);
                    }
                    100% {
                        transform: translate3d(-50%, 0, 0);
                    }
                }

                @media (prefers-reduced-motion: reduce) {
                    #benefits-marquee {
                        animation: none;
                        transform: none;
                    }
                }
            `}</style>
        </section>
    );
};

export default BentoBenefits;
