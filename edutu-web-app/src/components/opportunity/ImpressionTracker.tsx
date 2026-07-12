import React, { useEffect, useRef } from "react";
import type { ClerkTokenGetter } from "../../lib/clerkToken";
import { recordOpportunitySignal } from "../../services/opportunitySignals";

/**
 * Fires one `impression` signal the first time the wrapped card is ≥60%
 * visible for ~500ms. One shared IntersectionObserver serves every tracked
 * card; per-session dedupe keeps re-renders and scroll wiggles from spamming
 * the queue. Impressions are what let the engine compute CTR, position bias,
 * and "shown N times, never opened" fatigue.
 */

type Meta = {
  opportunityId: string;
  surface: string;
  position: number;
  getToken?: ClerkTokenGetter;
  timer?: ReturnType<typeof setTimeout>;
};

const seenThisSession = new Set<string>();
const metaByElement = new WeakMap<Element, Meta>();

let observer: IntersectionObserver | null = null;

function getObserver(): IntersectionObserver | null {
  if (typeof window === "undefined" || !("IntersectionObserver" in window)) return null;
  if (observer) return observer;
  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const meta = metaByElement.get(entry.target);
        if (!meta) return;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
          // Require the card to stay visible briefly — a fast scroll-through
          // is not an impression.
          meta.timer = setTimeout(() => {
            const key = `${meta.surface}:${meta.opportunityId}`;
            if (seenThisSession.has(key)) return;
            seenThisSession.add(key);
            if (meta.getToken) {
              void recordOpportunitySignal(
                {
                  opportunityId: meta.opportunityId,
                  signalType: "impression",
                  context: meta.surface,
                  details: { surface: meta.surface, position: meta.position },
                },
                meta.getToken,
              );
            }
            observer?.unobserve(entry.target);
          }, 500);
        } else if (meta.timer) {
          clearTimeout(meta.timer);
          meta.timer = undefined;
        }
      });
    },
    { threshold: [0, 0.6] },
  );
  return observer;
}

export function ImpressionTracker({
  opportunityId,
  surface,
  position,
  getToken,
  className,
  children,
}: {
  opportunityId: string;
  surface: string;
  position: number;
  getToken?: ClerkTokenGetter;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    const io = getObserver();
    if (!element || !io) return;
    if (seenThisSession.has(`${surface}:${opportunityId}`)) return;

    metaByElement.set(element, { opportunityId, surface, position, getToken });
    io.observe(element);
    return () => {
      const meta = metaByElement.get(element);
      if (meta?.timer) clearTimeout(meta.timer);
      metaByElement.delete(element);
      io.unobserve(element);
    };
  }, [opportunityId, surface, position, getToken]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
