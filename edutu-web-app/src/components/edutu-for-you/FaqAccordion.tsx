import React, { useId, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Plus } from 'lucide-react';
import type { ProgramFaq } from '../../lib/edutuForYou';

interface FaqAccordionProps {
    items: ProgramFaq[];
}

/**
 * Single-open accordion for the program FAQ.
 *
 * Mirrors the pattern already used by the landing page's FAQ: a button per
 * question carrying aria-expanded/aria-controls, and the answer in a region
 * that collapses to zero height.
 */
const FaqAccordion: React.FC<FaqAccordionProps> = ({ items }) => {
    const [open, setOpen] = useState<number | null>(0);
    const reduceMotion = useReducedMotion();
    const baseId = useId();

    return (
        <div className="space-y-3">
            {items.map((item, index) => {
                const isOpen = open === index;
                const panelId = `${baseId}-panel-${index}`;
                const buttonId = `${baseId}-button-${index}`;

                return (
                    <div
                        key={item.question}
                        className="overflow-hidden rounded-2xl border border-subtle bg-surface"
                    >
                        <h3 className="m-0">
                            <button
                                type="button"
                                id={buttonId}
                                aria-expanded={isOpen}
                                aria-controls={panelId}
                                onClick={() => setOpen(isOpen ? null : index)}
                                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-display text-base font-semibold text-text-primary transition hover:bg-surface-elevated focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand sm:px-6 sm:py-5 sm:text-lg"
                            >
                                {item.question}
                                <Plus
                                    size={20}
                                    aria-hidden="true"
                                    className={`shrink-0 text-brand transition-transform duration-300 ${
                                        isOpen ? 'rotate-45' : ''
                                    }`}
                                />
                            </button>
                        </h3>

                        <AnimatePresence initial={false}>
                            {isOpen ? (
                                <motion.div
                                    id={panelId}
                                    role="region"
                                    aria-labelledby={buttonId}
                                    initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
                                    transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                                    className="overflow-hidden"
                                >
                                    <p className="px-5 pb-5 text-[0.9375rem] leading-[1.7] text-text-secondary sm:px-6 sm:pb-6">
                                        {item.answer}
                                    </p>
                                </motion.div>
                            ) : null}
                        </AnimatePresence>
                    </div>
                );
            })}
        </div>
    );
};

export default FaqAccordion;
