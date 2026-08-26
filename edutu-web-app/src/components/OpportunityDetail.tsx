import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import {
  ArrowLeft,
  Banknote,
  CalendarDays,
  Clock3,
  MapPin,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { Opportunity } from "../types/opportunity";
import { parseOpportunityDeadline } from "../services/opportunities";
import { organizationLabel } from "../lib/organizationLabel";
import { prepareOpportunityDescription } from "../lib/opportunityDetailPresentation";
import ImageWithFallback from "./ImageWithFallback";
import OpportunityDetailLegacy from "./OpportunityDetailLegacy";
import TrustSignal from "./opportunity/TrustSignal";

interface OpportunityDetailProps {
  opportunity: Opportunity;
  onBack: () => void;
  embedded?: boolean;
}

interface FactItem {
  label: string;
  value: string;
  icon: LucideIcon;
}

function formatDeadline(value?: string | null): string | null {
  const parsed = parseOpportunityDeadline(value);
  return parsed ? format(parsed, "d MMM yyyy") : null;
}

function formatUpdatedAt(value?: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : format(parsed, "d MMM yyyy");
}

function formatFunding(opportunity: Opportunity): string | null {
  if (
    opportunity.stipend === undefined ||
    opportunity.stipend === null ||
    !Number.isFinite(Number(opportunity.stipend))
  ) {
    return null;
  }

  const symbols: Record<string, string> = {
    NGN: "₦",
    GBP: "£",
    EUR: "€",
    USD: "$",
  };
  const currency = opportunity.currency?.toUpperCase() ?? "";
  const symbol = symbols[currency] ?? (currency ? `${currency} ` : "");

  return `${symbol}${Number(opportunity.stipend).toLocaleString()}`;
}

function OpportunityHero({
  opportunity,
  onBack,
}: {
  opportunity: Opportunity;
  onBack: () => void;
}) {
  const paragraphs = useMemo(
    () =>
      prepareOpportunityDescription({
        summary: opportunity.summary,
        description: opportunity.description,
      }),
    [opportunity.description, opportunity.summary],
  );
  const organization = organizationLabel(
    opportunity.organization,
    opportunity.title,
  );
  const deadline = formatDeadline(opportunity.deadline);
  const updatedAt = formatUpdatedAt(opportunity.lastUpdated);
  const funding = formatFunding(opportunity);

  const facts = useMemo<FactItem[]>(() => {
    const next: FactItem[] = [];
    if (deadline) {
      next.push({ label: "Deadline", value: deadline, icon: CalendarDays });
    }
    if (opportunity.location) {
      next.push({ label: "Location", value: opportunity.location, icon: MapPin });
    }
    if (funding) {
      next.push({ label: "Funding", value: funding, icon: Banknote });
    }
    if (updatedAt) {
      next.push({ label: "Updated", value: updatedAt, icon: Clock3 });
    }
    return next;
  }, [deadline, funding, opportunity.location, updatedAt]);

  return (
    <section className="opportunity-detail-hero relative mb-7 overflow-hidden rounded-[28px] border border-subtle bg-surface-layer p-5 shadow-soft sm:p-7 lg:p-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(circle at 88% 4%, rgb(var(--color-brand-500) / 0.14), transparent 30%)",
        }}
      />

      <div className="relative">
        <button
          type="button"
          onClick={onBack}
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-subtle bg-surface-elevated px-3.5 py-2 text-sm font-semibold text-text-secondary shadow-soft transition hover:border-brand/30 hover:text-brand"
        >
          <ArrowLeft size={15} aria-hidden="true" />
          Back to opportunities
        </button>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.04fr)_minmax(320px,.96fr)] lg:gap-8">
          <div className="min-w-0 py-1">
            <div className="flex flex-wrap items-center gap-2">
              {opportunity.category ? (
                <span className="inline-flex items-center rounded-full border border-brand/15 bg-brand/10 px-3 py-1.5 text-xs font-semibold text-brand">
                  {opportunity.category}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
                <Sparkles size={13} aria-hidden="true" />
                Opportunity
              </span>
            </div>

            <h1 className="mt-4 break-words font-display text-[2.15rem] font-semibold leading-[1.04] tracking-[-0.04em] text-text-primary sm:text-5xl lg:text-[3.35rem]">
              {opportunity.title}
            </h1>

            {organization ? (
              <p className="mt-3 text-base font-medium leading-7 text-text-secondary sm:text-lg">
                {organization}
              </p>
            ) : null}

            <TrustSignal trust={opportunity.trust} className="mt-3" />

            {facts.length > 0 ? (
              <dl className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
                {facts.map(({ label, value, icon: Icon }) => (
                  <div
                    key={label}
                    className="min-w-0 rounded-2xl border border-subtle bg-surface-elevated/75 px-3.5 py-3"
                  >
                    <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                      <Icon size={13} aria-hidden="true" />
                      {label}
                    </dt>
                    <dd className="mt-1.5 break-words text-sm font-semibold leading-5 text-text-primary">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>

          <div className="relative aspect-[16/9] overflow-hidden rounded-[22px] border border-subtle bg-surface-elevated sm:aspect-[16/8] lg:aspect-[4/3]">
            <ImageWithFallback
              src={opportunity.image}
              fallbackSrc={opportunity.imageFallback}
              alt={`${opportunity.title} opportunity image`}
              category={opportunity.category}
              className="h-full w-full object-cover"
              fallbackClassName="h-full w-full"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-slate-950/30 to-transparent"
            />
          </div>
        </div>

        <div className="mt-7 border-t border-subtle pt-6 sm:mt-8 sm:pt-7">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">
              About this opportunity
            </p>
            {paragraphs.length > 0 ? (
              <div className="mt-3 space-y-4 text-[0.98rem] leading-7 text-text-secondary sm:text-[1.05rem] sm:leading-8">
                {paragraphs.map((paragraph, index) => (
                  <p
                    key={`${paragraph.slice(0, 44)}-${index}`}
                    className="whitespace-pre-line"
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-base leading-7 text-text-muted">
                Full details are available on the official application page.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

const DETAIL_POLISH_STYLES = `
  .opportunity-detail-experience main {
    display: flex;
    flex-direction: column;
  }

  .opportunity-detail-experience .opportunity-detail-hero {
    order: -100;
  }

  .opportunity-detail-experience main > section > div.mb-5:first-child {
    display: none !important;
  }

  .opportunity-detail-experience main > section article > header {
    display: none !important;
  }

  .opportunity-detail-experience main > section article > section.grid {
    display: none !important;
  }

  .opportunity-detail-experience main > section article > section:not(.grid) {
    padding-top: 1.45rem;
    border-top: 1px solid rgb(var(--border-subtle));
  }

  .opportunity-detail-experience main > section article h2 {
    font-size: 1.3rem !important;
    line-height: 1.25 !important;
    letter-spacing: -0.02em !important;
  }

  .opportunity-detail-experience main > section > div.grid > aside > section {
    border-radius: 1.25rem !important;
    padding: 1.1rem !important;
  }

  .opportunity-detail-experience main > section > div.grid > aside > section a,
  .opportunity-detail-experience main > section > div.grid > aside > section button {
    min-height: 3rem;
    border-radius: 0.9rem !important;
  }

  @media (min-width: 1024px) {
    .opportunity-detail-experience main > section > div.grid > aside {
      position: sticky;
      top: 6.5rem;
      align-self: start;
    }
  }

  @media (max-width: 1023px) {
    .opportunity-detail-experience main > section > div.grid {
      display: flex !important;
      flex-direction: column;
      gap: 1.25rem !important;
    }

    .opportunity-detail-experience main > section > div.grid > aside {
      order: -1;
    }
  }

  @media (max-width: 639px) {
    .opportunity-detail-experience main {
      padding-left: 1rem !important;
      padding-right: 1rem !important;
      padding-top: 1rem !important;
    }

    .opportunity-detail-experience .opportunity-detail-hero {
      margin-bottom: 1.15rem;
      border-radius: 1.45rem;
      padding: 1.1rem;
    }

    .opportunity-detail-experience main > section article > section:not(.grid) {
      padding-top: 1.2rem;
    }
  }
`;

export default function OpportunityDetail({
  opportunity,
  onBack,
  embedded = false,
}: OpportunityDetailProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [mainTarget, setMainTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const nextTarget = rootRef.current?.querySelector<HTMLElement>("main") ?? null;
    setMainTarget(nextTarget);
  }, [embedded, opportunity.id]);

  return (
    <div
      ref={rootRef}
      className="opportunity-detail-experience"
      data-embedded={embedded ? "true" : "false"}
    >
      <style>{DETAIL_POLISH_STYLES}</style>
      <OpportunityDetailLegacy
        opportunity={opportunity}
        onBack={onBack}
        embedded={embedded}
      />
      {mainTarget
        ? createPortal(
            <OpportunityHero opportunity={opportunity} onBack={onBack} />,
            mainTarget,
          )
        : null}
    </div>
  );
}
