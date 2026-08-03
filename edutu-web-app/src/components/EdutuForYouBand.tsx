import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import ImageWithFallback from './ImageWithFallback';
import {
    BAND_BODY,
    MOSAIC,
    PROGRAM_HEADLINE,
    PROGRAM_KICKER,
    PROGRAM_NAME,
    PROGRAM_PATH,
    REACH_GOAL,
    REACH_TODAY,
} from '../lib/edutuForYou';

/**
 * The Edutu For You band on the public landing page.
 *
 * Deliberately breaks the page's light editorial rhythm by going dark and
 * full-bleed, so the program reads as an institution rather than one more
 * product feature. The dark treatment is a fixed literal palette rather than
 * surface tokens, because it must stay dark in both light and dark themes.
 */

const PROGRESS_PERCENT = Math.round((REACH_TODAY / REACH_GOAL) * 100);

/**
 * Counts up to `REACH_TODAY` once the band scrolls into view. Returns the
 * final value immediately when the user prefers reduced motion — the number
 * is information, so it must never depend on an animation to be readable.
 */
function useCountUp(target: number, active: boolean, enabled: boolean) {
    const [value, setValue] = useState(enabled ? 0 : target);

    useEffect(() => {
        if (!enabled) {
            setValue(target);
            return;
        }
        if (!active) return;

        const durationMs = 1400;
        let raf = 0;
        const start = performance.now();

        const tick = (now: number) => {
            const progress = Math.min((now - start) / durationMs, 1);
            // Ease-out cubic: fast off the line, settles onto the real number.
            const eased = 1 - Math.pow(1 - progress, 3);
            setValue(Math.round(target * eased));
            if (progress < 1) {
                raf = requestAnimationFrame(tick);
            }
        };

        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [target, active, enabled]);

    return value;
}

const EdutuForYouBand: React.FC = () => {
    const reduceMotion = useReducedMotion();
    const sectionRef = useRef<HTMLElement | null>(null);
    const inView = useInView(sectionRef, { once: true, amount: 0.3 });
    const reached = useCountUp(REACH_TODAY, inView, !reduceMotion);

    const fade = reduceMotion
        ? {}
        : {
              initial: { opacity: 0, y: 24 },
              whileInView: { opacity: 1, y: 0 },
              viewport: { once: true, amount: 0.2 },
              transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const },
          };

    return (
        <section
            ref={sectionRef}
            id="edutu-for-you"
            aria-labelledby="edutu-for-you-heading"
            className="relative overflow-hidden bg-[#0B0F19] px-4 py-20 text-[#F8FAFC] sm:px-6 sm:py-28"
        >
            {/* Ambient brand wash — decorative only. */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute -left-32 top-0 h-[420px] w-[420px] rounded-full bg-brand/20 blur-[120px]"
            />
            <div
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-40 right-0 h-[380px] w-[380px] rounded-full bg-accent/15 blur-[120px]"
            />

            <div className="relative mx-auto grid max-w-[1200px] items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
                {/* ─── Copy ─────────────────────────────────────────────── */}
                <motion.div {...fade}>
                    <span className="inline-flex items-center gap-2 rounded-pill border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#C7D2FE]">
                        {PROGRAM_NAME} · {PROGRAM_KICKER}
                    </span>

                    <h2
                        id="edutu-for-you-heading"
                        className="mt-6 font-display text-[2rem] font-bold leading-[1.1] tracking-[-0.02em] text-[#F8FAFC] sm:text-[2.75rem]"
                    >
                        {PROGRAM_HEADLINE}
                    </h2>

                    <p className="mt-5 max-w-[52ch] text-base leading-[1.65] text-[#CBD5E1] sm:text-lg">
                        {BAND_BODY}
                    </p>

                    {/* ─── Progress toward one million ──────────────────── */}
                    <div className="mt-9 max-w-[30rem]">
                        <div className="flex items-baseline justify-between gap-4">
                            <span className="font-display text-3xl font-bold tabular-nums sm:text-4xl">
                                {reached.toLocaleString('en-US')}
                            </span>
                            <span className="text-sm text-[#94A3B8]">
                                of {REACH_GOAL.toLocaleString('en-US')} reached
                            </span>
                        </div>
                        <div
                            role="progressbar"
                            aria-valuenow={REACH_TODAY}
                            aria-valuemin={0}
                            aria-valuemax={REACH_GOAL}
                            aria-label={`${REACH_TODAY.toLocaleString('en-US')} of ${REACH_GOAL.toLocaleString('en-US')} young people reached`}
                            className="mt-3 h-2 w-full overflow-hidden rounded-pill bg-white/10"
                        >
                            <motion.div
                                className="h-full rounded-pill bg-gradient-to-r from-brand-400 to-accent-400"
                                initial={reduceMotion ? false : { width: 0 }}
                                whileInView={{ width: `${PROGRESS_PERCENT}%` }}
                                viewport={{ once: true, amount: 0.4 }}
                                transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
                                style={reduceMotion ? { width: `${PROGRESS_PERCENT}%` } : undefined}
                            />
                        </div>
                    </div>

                    {/* ─── CTAs ─────────────────────────────────────────── */}
                    <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                        <Link
                            to={PROGRAM_PATH}
                            className="inline-flex items-center justify-center gap-2 rounded-pill bg-brand px-6 py-3 text-base font-semibold text-white no-underline transition hover:bg-brand-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300"
                        >
                            Read more
                            <ArrowRight size={18} aria-hidden="true" />
                        </Link>
                    </div>
                </motion.div>

                {/* ─── Portrait mosaic ──────────────────────────────────── */}
                <motion.div
                    {...fade}
                    transition={
                        reduceMotion
                            ? undefined
                            : { duration: 0.6, delay: 0.12, ease: [0.16, 1, 0.3, 1] }
                    }
                    // Five images across three columns: the first spans both
                    // rows, so the remaining four fill the other two columns
                    // exactly. A plain 3-col flow would leave a hole bottom-right.
                    className="grid auto-rows-[minmax(0,1fr)] grid-cols-3 grid-rows-2 gap-3 sm:gap-4"
                >
                    {MOSAIC.map((image, index) => (
                        <div
                            key={image.src}
                            className={[
                                'overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]',
                                // The lead portrait runs the full height of the block.
                                index === 0 ? 'row-span-2 h-full min-h-[18rem] sm:min-h-[24rem]' : '',
                                index > 0 ? 'h-36 sm:h-[11.5rem]' : '',
                            ]
                                .filter(Boolean)
                                .join(' ')}
                        >
                            <ImageWithFallback
                                src={image.src}
                                alt={image.alt}
                                className="h-full w-full object-cover"
                            />
                        </div>
                    ))}
                </motion.div>
            </div>
        </section>
    );
};

export default EdutuForYouBand;
