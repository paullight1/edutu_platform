import React from 'react';
import { Sparkles, Target, Mic, CalendarCheck, Activity } from 'lucide-react';

/* Community / status photo for the media tile. */
const STATUS_PHOTO =
    'https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg?auto=compress&cs=tinysrgb&w=900';

const BentoBenefits: React.FC = () => {
    return (
        <section
            id="benefits"
            className="relative overflow-hidden bg-surface-elevated px-4 py-16 sm:px-6 sm:py-24 lg:px-8"
        >
            <div className="pointer-events-none absolute inset-0 mesh-gradient opacity-60" />

            <div className="relative mx-auto max-w-[1120px]">
                {/* Centered heading — matches the reference layout */}
                <div className="mx-auto max-w-2xl text-center">
                    <div className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/10 px-4 py-2">
                        <Sparkles size={14} className="text-brand" />
                        <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand">
                            Benefits
                        </span>
                    </div>

                    <h2 className="mt-5 font-display text-[clamp(1.9rem,4vw,3.4rem)] font-semibold leading-[1.04] tracking-[-0.03em] text-text-primary">
                        Simple tools that
                        <span className="block text-brand">move learners forward.</span>
                    </h2>

                    <p className="mx-auto mt-4 max-w-md text-[15px] leading-[1.7] text-text-secondary sm:text-[16px]">
                        Find, track, and finish opportunities with less work and less noise.
                    </p>
                </div>

                {/* Bento grid */}
                <div className="mt-12 grid gap-4 sm:gap-5 md:grid-cols-2">
                    {/* ── Left column ─────────────────────────────── */}
                    <div className="flex flex-col gap-4 sm:gap-5">
                        {/* Smart matching — blue panel with match rows */}
                        <article className="flex min-h-[248px] flex-col justify-between overflow-hidden rounded-[26px] p-6 sm:p-7" style={{ background: 'linear-gradient(155deg,#e9f2ff 0%,#d3e4ff 100%)' }}>
                            <div>
                                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#1d4ed8]">
                                    <Target size={12} strokeWidth={2.4} /> AI match
                                </div>
                                <h3 className="font-display text-[22px] font-semibold tracking-[-0.02em] text-[#0f2a5e]">
                                    Smart matching
                                </h3>
                                <p className="mt-2 max-w-[22rem] text-[13.5px] leading-[1.6] text-[#3a5488]">
                                    Edutu ranks the opportunities that fit you — so the right ones show up first.
                                </p>
                            </div>

                            <div className="mt-5 space-y-2.5">
                                {[
                                    { t: 'Mastercard Foundation Scholars', m: '98%' },
                                    { t: 'Chevening Fellowship', m: '94%' },
                                ].map((row) => (
                                    <div key={row.t} className="flex items-center gap-3 rounded-xl bg-white/85 px-3 py-2.5 shadow-sm">
                                        <span className="h-8 w-8 shrink-0 rounded-lg bg-gradient-to-br from-[#3b82f6] to-[#1d4ed8]" />
                                        <span className="flex-1 truncate text-[13px] font-semibold text-[#0f2a5e]">{row.t}</span>
                                        <span className="shrink-0 rounded-full bg-[#1d4ed8] px-2.5 py-1 text-[11px] font-bold text-white">{row.m}</span>
                                    </div>
                                ))}
                            </div>
                        </article>

                        {/* Voice help — purple panel with chat bubbles */}
                        <article className="flex min-h-[320px] flex-col justify-between overflow-hidden rounded-[26px] p-6 sm:p-7" style={{ background: 'linear-gradient(155deg,#efe8ff 0%,#e2d3ff 100%)' }}>
                            <div>
                                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#6d28d9]">
                                    <Mic size={12} strokeWidth={2.4} /> Ask
                                </div>
                                <h3 className="font-display text-[22px] font-semibold tracking-[-0.02em] text-[#331b66]">
                                    Voice help
                                </h3>
                                <p className="mt-2 max-w-[22rem] text-[13.5px] leading-[1.6] text-[#5b4a8a]">
                                    Ask a question out loud whenever you get stuck — Edutu answers in seconds.
                                </p>
                            </div>

                            <div className="mt-5 space-y-2.5">
                                <div className="max-w-[80%] rounded-2xl rounded-tl-md bg-white/90 px-3.5 py-2.5 text-[13px] font-medium text-[#331b66] shadow-sm">
                                    How do I strengthen my essay?
                                </div>
                                <div className="ml-auto max-w-[80%] rounded-2xl rounded-tr-md bg-gradient-to-br from-[#8b5cf6] to-[#6d28d9] px-3.5 py-2.5 text-[13px] font-medium text-white shadow-sm">
                                    Lead with your impact — I'll draft an outline now.
                                </div>
                                <div className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-[12px] font-semibold text-[#6d28d9] shadow-sm">
                                    <Mic size={13} strokeWidth={2.4} /> Voice reply ready
                                </div>
                            </div>
                        </article>
                    </div>

                    {/* ── Right column ────────────────────────────── */}
                    <div className="flex flex-col gap-4 sm:gap-5">
                        {/* Live progress — photo tile */}
                        <article className="group relative flex min-h-[320px] flex-col justify-end overflow-hidden rounded-[26px]">
                            <img
                                src={STATUS_PHOTO}
                                alt="Learners tracking progress together"
                                className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.05]"
                                loading="lazy"
                                decoding="async"
                                draggable={false}
                            />
                            <div
                                className="absolute inset-0"
                                style={{ background: 'linear-gradient(180deg,rgba(4,8,16,0.05) 0%,rgba(4,8,16,0.25) 46%,rgba(4,8,16,0.86) 100%)' }}
                            />
                            <div className="absolute left-5 top-5">
                                <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white backdrop-blur">
                                    <Activity size={12} strokeWidth={2.4} /> Status
                                </div>
                            </div>
                            <div className="relative p-6 sm:p-7">
                                <h3 className="font-display text-[24px] font-semibold tracking-[-0.02em] text-white">
                                    Live progress
                                </h3>
                                <p className="mt-2 max-w-[24rem] text-[13.5px] font-medium leading-[1.6] text-white/85">
                                    Track each application as it moves — from saved to submitted to accepted.
                                </p>
                            </div>
                        </article>

                        {/* Deadline alerts — orange panel with reminder cards */}
                        <article className="flex min-h-[248px] flex-col justify-between overflow-hidden rounded-[26px] p-6 sm:p-7" style={{ background: 'linear-gradient(155deg,#fff1e2 0%,#ffdcbd 100%)' }}>
                            <div>
                                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#c2410c]">
                                    <CalendarCheck size={12} strokeWidth={2.4} /> Reminders
                                </div>
                                <h3 className="font-display text-[22px] font-semibold tracking-[-0.02em] text-[#5a2e0a]">
                                    Deadline alerts
                                </h3>
                                <p className="mt-2 max-w-[22rem] text-[13.5px] leading-[1.6] text-[#8a5320]">
                                    Catch closing dates before they pass, with nudges timed to your list.
                                </p>
                            </div>

                            <div className="mt-5 space-y-2.5">
                                {[
                                    { t: 'Rhodes Scholarship', d: '3 days left' },
                                    { t: 'Google Africa Internship', d: '1 week left' },
                                ].map((row) => (
                                    <div key={row.t} className="flex items-center gap-3 rounded-xl bg-white/85 px-3 py-2.5 shadow-sm">
                                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#fb923c] to-[#ea580c] text-white">
                                            <CalendarCheck size={15} strokeWidth={2.4} />
                                        </span>
                                        <span className="flex-1 truncate text-[13px] font-semibold text-[#5a2e0a]">{row.t}</span>
                                        <span className="shrink-0 rounded-full bg-[#ea580c] px-2.5 py-1 text-[11px] font-bold text-white">{row.d}</span>
                                    </div>
                                ))}
                            </div>
                        </article>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default BentoBenefits;
