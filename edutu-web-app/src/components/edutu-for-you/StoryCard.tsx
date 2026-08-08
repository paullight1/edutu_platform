import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import ImageWithFallback from '../ImageWithFallback';
import type { Story } from '../../lib/edutuForYouStories';

interface StoryCardProps {
    story: Story;
}

/**
 * One story card. The whole card is the link — the "Read the full story"
 * affordance is visual, and is marked aria-hidden so screen readers get one
 * link per card rather than two pointing at the same place.
 */
const StoryCard: React.FC<StoryCardProps> = ({ story }) => (
    <Link
        to={`/edutuforyou/stories/${story.slug}`}
        className="group flex flex-col overflow-hidden rounded-3xl border border-subtle bg-surface no-underline shadow-soft transition duration-300 hover:-translate-y-1 hover:shadow-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
        <div className="relative h-52 w-full overflow-hidden min-[420px]:h-56 sm:h-72">
            <ImageWithFallback
                src={story.portrait}
                alt={story.portraitAlt}
                className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
            />
            <span className="absolute bottom-3 left-3 rounded-pill bg-[#0B0F19]/85 px-3 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-[#F8FAFC] backdrop-blur">
                {story.outcome}
            </span>
        </div>

        <div className="flex flex-1 flex-col p-5 sm:p-6">
            <h3 className="font-display text-lg font-semibold text-text-primary sm:text-xl">
                {story.name}, {story.age}
            </h3>
            <p className="mt-1 text-sm text-text-muted">{story.place}</p>

            <blockquote className="mt-4 text-base font-medium leading-[1.5] text-text-primary sm:text-[1.0625rem]">
                “{story.quote}”
            </blockquote>

            <p className="mt-3 flex-1 text-[0.9375rem] leading-[1.6] text-text-secondary">
                {story.teaser}
            </p>

            <span
                aria-hidden="true"
                className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-brand"
            >
                Read the full story
                <ArrowRight
                    size={16}
                    className="transition-transform duration-300 group-hover:translate-x-1"
                />
            </span>
        </div>
    </Link>
);

export default StoryCard;
