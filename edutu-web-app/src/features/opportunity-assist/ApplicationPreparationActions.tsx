import { ArrowRight, FileText, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

export function ApplicationPreparationActions({ opportunityId }: { opportunityId: string }) {
  const id = encodeURIComponent(opportunityId);

  return (
    <section className="rounded-2xl border border-subtle bg-surface-layer p-5 sm:p-6 lg:col-span-2">
      <h2 className="text-lg font-semibold text-text-primary">
        Prepare your application
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-text-muted">
        Choose a starting point for your application materials.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-2.5 min-[380px]:grid-cols-2 sm:gap-3">
        <Link
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand px-3 text-xs font-semibold text-white transition hover:bg-brand-700 active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:text-sm"
          to={`/app/copilot/${id}`}
        >
          <Sparkles size={16} className="shrink-0" aria-hidden="true" />
          <span className="whitespace-nowrap">Prepare with Copilot</span>
        </Link>
        <Link
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-subtle bg-surface px-3 text-xs font-semibold text-text-primary transition hover:border-brand/60 hover:bg-surface-elevated active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:text-sm"
          to={`/app/cv?opportunityId=${id}`}
        >
          <FileText size={16} className="shrink-0" aria-hidden="true" />
          <span className="whitespace-nowrap">Tailor my CV</span>
          <ArrowRight size={14} className="shrink-0 text-text-muted" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
