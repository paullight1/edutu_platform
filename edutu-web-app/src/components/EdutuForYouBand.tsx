import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { PROGRAM_NAME, PROGRAM_PATH } from '../lib/edutuForYou';

/** A focused introduction to the impact program on the public homepage. */
export default function EdutuForYouBand() {
    return (
        <section
            id="edutu-for-you"
            aria-labelledby="edutu-for-you-heading"
            className="px-4 py-12 sm:px-6 sm:py-20"
        >
            <div className="mx-auto grid max-w-[1200px] gap-8 overflow-hidden rounded-[28px] bg-surface-brand p-6 dark:bg-surface-layer sm:gap-10 sm:p-10 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-16 lg:p-12">
                <div className="max-w-[520px]">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand dark:text-brand-300">
                        {PROGRAM_NAME}
                    </p>
                    <h2
                        id="edutu-for-you-heading"
                        className="mt-4 text-balance font-display text-[clamp(2rem,3.5vw,3rem)] font-semibold leading-[1.08] tracking-[-0.035em] text-text-primary"
                    >
                        Opportunity should be within everyone’s reach.
                    </h2>
                    <p className="mt-5 max-w-[42ch] text-base leading-7 text-text-secondary">
                        Our impact program helps young people discover opportunities,
                        prepare stronger applications, and find support from a community.
                    </p>
                    <Link
                        to={PROGRAM_PATH}
                        className="group mt-7 inline-flex min-h-12 items-center justify-center gap-3 rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white no-underline transition-colors hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand dark:focus-visible:outline-brand-300"
                    >
                        Explore Edutu For You
                        <ArrowRight
                            size={18}
                            strokeWidth={1.75}
                            aria-hidden="true"
                            className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                        />
                    </Link>
                </div>
                <div className="aspect-[3/2] overflow-hidden rounded-[18px] bg-surface-elevated lg:aspect-[5/4]">
                    <img
                        src="/community/scholarships.webp"
                        alt="Young people studying together"
                        width={900}
                        height={600}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                    />
                </div>
            </div>
        </section>
    );
}
