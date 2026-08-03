import React, { useId, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown, Quote } from 'lucide-react';
import ImageWithFallback from '../ImageWithFallback';
import { COMPOSITE_LABEL, type Story } from '../../lib/edutuForYou';

interface StoryCardProps {
    story: Story;
}

/**
 * One composite-persona card.
 *
 * The `COMPOSITE_LABEL` chip is not decoration — it is the honesty guarantee
 * for the whole section, and it renders whether or not the card is expanded.
 * Do not move it inside the collapsible region.
 */
const StoryCard: React.FC<StoryCardProps> = ({ story }) => {
    const [open, setOpen] = useState(false);
    const reduceMotion = useReducedMotion();
    const panelId = useId();

    return (
        <article className="flex flex-col overflow-hidden rounded-3xl border border-subtle bg-surface-elevated shadow-soft">
            <div className="relative h-56 w-full overflow-hidden sm:h-64">
                <ImageWithFallback
                    src={story.image}
                    alt={story.imageAlt}
                    className="h-full w-full object-cover"
                />
                <span className="absolute left-4 top-4 rounded-pill bg-[#0B0F19]/80 px-3 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-[#F8FAFC] backdrop-blur">
                    {COMPOSITE_LABEL}
                </span>
            </div>

            <div className="flex flex-1 flex-col p-6 sm:p-7">
                <h3 className="font-display text-xl font-semibold text-text-primary">
                    {story.name}, {story.age}
                </h3>
                <p className="mt-1 text-sm text-text-muted">{story.place}</p>

                <blockquote className="mt-5 flex gap-3 text-lg leading-[1.5] text-text-primary">
                    <Quote
                        size={18}
                        aria-hidden="true"
                        className="mt-1.5 shrink-0 text-brand"
                    />
                    <span>{story.quote}</span>
                </blockquote>

                <p className="mt-4 text-[0.9375rem] leading-[1.65] text-text-secondary">
                    {story.teaser}
                </p>

                <AnimatePresence initial={false}>
                    {open ? (
                        <motion.div
                            id={panelId}
                            key="body"
                            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
                            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                            className="overflow-hidden"
                        >
                            <div className="space-y-4 pt-4">
                                {story.full.map((paragraph) => (
                                    <p
                                        key={paragraph.slice(0, 32)}
                                        className="text-[0.9375rem] leading-[1.7] text-text-secondary"
                                    >
                                        {paragraph}
                                    </p>
                                ))}
                                <p className="border-l-2 border-brand pl-4 text-[0.9375rem] font-medium leading-[1.6] text-text-primary">
                                    {story.barrier}
                                </p>
                            </div>
                        </motion.div>
                    ) : null}
                </AnimatePresence>

                <button
                    type="button"
                    onClick={() => setOpen((value) => !value)}
                    aria-expanded={open}
                    aria-controls={panelId}
                    className="mt-6 inline-flex items-center gap-1.5 self-start rounded-pill text-sm font-semibold text-brand transition hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                    {open ? 'Show less' : `Read ${story.name}'s story`}
                    <ChevronDown
                        size={16}
                        aria-hidden="true"
                        className={`transition-transform ${open ? 'rotate-180' : ''}`}
                    />
                </button>
            </div>
        </article>
    );
};

export default StoryCard;
