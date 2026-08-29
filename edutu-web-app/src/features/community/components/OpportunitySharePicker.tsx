import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Loader2, Search, X } from "lucide-react";
import { Link } from "react-router-dom";
import {
  fetchOpportunities,
  getCachedOpportunitiesSync,
  searchOpportunityCatalog,
} from "../../../services/opportunities";
import type { Opportunity } from "../../../types/opportunity";

export default function OpportunitySharePicker({
  open,
  sending,
  onClose,
  onShare,
}: {
  open: boolean;
  sending: boolean;
  onClose: () => void;
  onShare: (opportunity: Opportunity) => void;
}) {
  const [rows, setRows] = useState<Opportunity[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialRows = useRef<Opportunity[]>([]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const cached = getCachedOpportunitiesSync() ?? [];
    initialRows.current = cached;
    setRows(cached);
    setLoading(cached.length === 0);
    setError(null);
    void fetchOpportunities({ limit: 60, force: true })
      .then((opportunities) => {
        if (active) {
          initialRows.current = opportunities;
          setRows(opportunities);
          setError(null);
        }
      })
      .catch(() => {
        if (active && cached.length === 0) {
          setError("Opportunities could not be loaded. Try again.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !sending) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open, sending]);

  useEffect(() => {
    const term = query.trim();
    if (!open || term.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void searchOpportunityCatalog(term, controller.signal)
        .then((opportunities) => {
          setRows(opportunities);
          setError(null);
        })
        .catch((caught) => {
          if ((caught as { name?: string })?.name !== "AbortError") {
            setError("Search could not be loaded. Try again.");
          }
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return rows
      .filter((row) => {
        if (!term) return true;
        return `${row.title} ${row.organization} ${row.category}`
          .toLocaleLowerCase()
          .includes(term);
      })
      .slice(0, 60);
  }, [query, rows]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="opportunity-picker-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !sending) onClose();
      }}
      className="fixed inset-0 z-[70] flex items-end bg-black/50 p-0 sm:items-center sm:justify-center sm:p-6"
    >
      <div className="flex max-h-[82dvh] w-full flex-col rounded-t-[28px] bg-white shadow-2xl sm:max-w-xl sm:rounded-[28px] dark:bg-surface-layer">
        <div className="flex items-start justify-between border-b border-[#ece6e2] px-5 py-4 dark:border-subtle">
          <div>
            <h2 id="opportunity-picker-title" className="text-lg font-bold">
              Share an opportunity
            </h2>
            <p className="mt-1 text-sm text-[#746c67] dark:text-text-secondary">
              Choose a verified listing. It will post immediately.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close opportunity picker"
            disabled={sending}
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-[#f3f1ef] disabled:opacity-50 dark:hover:bg-surface-elevated"
          >
            <X size={20} />
          </button>
        </div>
        <label className="mx-5 mt-4 flex min-h-11 items-center gap-2 rounded-2xl bg-[#f3f1ef] px-3 dark:bg-surface-elevated">
          <Search size={17} className="text-[#817a76]" />
          <span className="sr-only">Search opportunities</span>
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              const next = event.target.value;
              setQuery(next);
              if (next.trim().length < 2) {
                setRows(initialRows.current);
                setError(null);
              }
            }}
            placeholder="Search title or organization"
            className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none"
          />
        </label>
        <Link
          to="/app/submit-opportunity"
          onClick={onClose}
          className="mx-5 mt-3 flex min-h-11 items-center justify-center rounded-xl border border-[#e8e2de] px-3 text-sm font-bold text-[#6b4538] transition hover:border-[#f45b16]/45 hover:text-[#f45b16] dark:border-subtle dark:text-text-secondary"
        >
          Can’t find it? Submit or import an opportunity
        </Link>
        <div className="min-h-48 overflow-y-auto px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3">
          {loading ? (
            <div className="flex min-h-48 items-center justify-center">
              <Loader2 className="animate-spin text-[#f45b16]" />
            </div>
          ) : error ? (
            <p role="alert" className="py-10 text-center text-sm text-red-600">
              {error}
            </p>
          ) : visible.length === 0 ? (
            <p className="py-10 text-center text-sm text-[#817a76]">
              No matching opportunities.
            </p>
          ) : (
            <ul className="space-y-2">
              {visible.map((opportunity) => (
                <li key={opportunity.id}>
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => onShare(opportunity)}
                    className="flex min-h-20 w-full items-center gap-3 rounded-2xl border border-[#e8e2de] p-3 text-start transition hover:border-[#f45b16]/45 hover:bg-[#fff8f4] disabled:opacity-55 dark:border-subtle dark:hover:bg-brand/5"
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#fff0e8] text-[#f45b16] dark:bg-brand/10 dark:text-brand">
                      <CalendarDays size={19} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block line-clamp-2 font-bold">
                        {opportunity.title}
                      </span>
                      <span className="mt-1 block truncate text-xs text-[#746c67] dark:text-text-secondary">
                        {[opportunity.organization, opportunity.deadline]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
