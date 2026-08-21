import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { ArrowUpRight, Sparkles } from "lucide-react";
import OpportunitiesPageLegacy from "./OpportunitiesPageLegacy";

export { CARD_SURFACE } from "./OpportunitiesPageLegacy";

interface OpportunitiesPageProps {
  embedded?: boolean;
}

function OpportunitiesIntro({ embedded }: { embedded: boolean }) {
  return (
    <section className="opportunities-intro relative mb-7 overflow-hidden rounded-[28px] border border-brand/15 bg-surface-layer px-5 py-7 shadow-soft sm:px-7 sm:py-9 lg:px-9 lg:py-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          background:
            "radial-gradient(circle at 86% 8%, rgb(var(--color-brand-500) / 0.16), transparent 31%), radial-gradient(circle at 8% 94%, rgb(var(--color-brand-300) / 0.09), transparent 34%)",
        }}
      />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-brand/15 bg-brand/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand">
            <Sparkles size={13} aria-hidden="true" />
            Opportunity discovery
          </div>
          <h1 className="mt-4 max-w-[13ch] font-display text-[2.15rem] font-semibold leading-[1.02] tracking-[-0.045em] text-text-primary sm:text-5xl lg:text-[3.4rem]">
            Find your next opportunity
          </h1>
          <p className="mt-4 max-w-[640px] text-[0.98rem] leading-7 text-text-secondary sm:text-lg sm:leading-8">
            Search scholarships, internships, fellowships, and career programs — then focus on the ones that fit your goals.
          </p>
        </div>

        {embedded ? (
          <Link
            to="/app/submit-opportunity"
            className="inline-flex h-12 w-fit items-center justify-center gap-2 rounded-2xl bg-brand px-5 text-sm font-semibold text-white no-underline shadow-elevated transition hover:-translate-y-0.5 hover:bg-brand-700"
          >
            Submit an opportunity
            <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </section>
  );
}

const POLISH_STYLES = `
  .opportunities-experience main {
    display: flex;
    flex-direction: column;
  }

  .opportunities-experience .opportunities-intro {
    order: -100;
  }

  .opportunities-experience input[aria-label="Search opportunities"] {
    height: 3.5rem !important;
    border-radius: 1rem !important;
    font-size: 1rem !important;
    line-height: 1.5rem !important;
    padding-left: 3rem !important;
    box-shadow: 0 10px 30px -24px rgba(15, 23, 42, 0.55) !important;
  }

  .opportunities-experience a[href*="category="] {
    min-height: 4.25rem;
    border-radius: 1.15rem !important;
    padding: 0.8rem !important;
  }

  .opportunities-experience a[href*="category="] h3 {
    font-size: 0.94rem !important;
    line-height: 1.2 !important;
    letter-spacing: -0.01em;
  }

  .opportunities-experience article {
    border-radius: 1.35rem !important;
    box-shadow: 0 16px 42px -34px rgba(15, 23, 42, 0.62) !important;
  }

  .opportunities-experience article h2,
  .opportunities-experience article h3 {
    letter-spacing: -0.018em !important;
  }

  .opportunities-experience article h2 {
    font-size: 1.08rem !important;
    line-height: 1.38 !important;
  }

  .opportunities-experience section[aria-label] > div:first-child h2 {
    font-size: 1.08rem !important;
    line-height: 1.25 !important;
  }

  .opportunities-experience section[aria-label] {
    scroll-margin-top: 7rem;
  }

  .opportunities-experience section[aria-label] article {
    width: min(72vw, 278px) !important;
  }

  .opportunities-experience section[aria-label]:first-of-type article {
    width: min(84vw, 340px) !important;
  }

  @media (min-width: 640px) {
    .opportunities-experience input[aria-label="Search opportunities"] {
      height: 3.75rem !important;
    }

    .opportunities-experience a[href*="category="] {
      min-height: 5.75rem;
      padding: 1rem !important;
    }

    .opportunities-experience a[href*="category="] h3 {
      font-size: 1rem !important;
    }

    .opportunities-experience article h2 {
      font-size: 1.16rem !important;
    }

    .opportunities-experience section[aria-label] article {
      width: 270px !important;
    }

    .opportunities-experience section[aria-label]:first-of-type article {
      width: 360px !important;
    }
  }

  @media (max-width: 639px) {
    .opportunities-experience main {
      padding-left: 1rem !important;
      padding-right: 1rem !important;
      padding-top: 1rem !important;
    }

    .opportunities-experience .opportunities-intro {
      margin-left: -0.1rem;
      margin-right: -0.1rem;
      margin-bottom: 1.35rem;
    }

    .opportunities-experience section[aria-label] {
      margin-top: 1.8rem;
    }

    .opportunities-experience section[aria-label] > div:first-child {
      margin-bottom: 0.8rem !important;
    }

    .opportunities-experience article {
      border-radius: 1.25rem !important;
    }
  }
`;

export default function OpportunitiesPage({
  embedded = false,
}: OpportunitiesPageProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [mainTarget, setMainTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const nextTarget = rootRef.current?.querySelector<HTMLElement>("main") ?? null;
    setMainTarget(nextTarget);
  }, [embedded]);

  return (
    <div
      ref={rootRef}
      className="opportunities-experience"
      data-embedded={embedded ? "true" : "false"}
    >
      <style>{POLISH_STYLES}</style>
      <OpportunitiesPageLegacy embedded={embedded} />
      {mainTarget
        ? createPortal(<OpportunitiesIntro embedded={embedded} />, mainTarget)
        : null}
    </div>
  );
}
