import { FileText, Upload } from "lucide-react";
import { Link } from "react-router-dom";

interface OpportunityDocument {
  id: string;
  fileName: string;
  parseStatus: string;
}

export function OpportunityDocumentContext({
  documents,
  selectedId,
  isOpen,
  isLoading,
  onToggle,
  onChange,
}: {
  documents: OpportunityDocument[];
  selectedId: string;
  isOpen: boolean;
  isLoading: boolean;
  onToggle: () => void;
  onChange: (id: string) => void;
}) {
  return (
    <section className="mt-4 rounded-xl border border-subtle bg-surface/60 p-3.5 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-layer text-text-secondary">
            <FileText size={16} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="text-xs font-semibold text-text-primary sm:text-sm">
              Add document context
            </h3>
            <p className="mt-0.5 text-xs text-text-muted">
              Optional, for more specific feedback
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            className="text-xs font-semibold text-brand underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60"
            disabled={isLoading}
            onClick={onToggle}
          >
            {isLoading ? "Loading…" : isOpen ? "Hide documents" : "Choose a document"}
          </button>
          <Link
            to="/app/documents"
            aria-label="Upload a document"
            className="inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-text-secondary underline-offset-4 hover:text-text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <Upload size={14} aria-hidden="true" />
            Upload
          </Link>
        </div>
      </div>

      {isOpen && (
        <div className="mt-4 border-t border-subtle pt-4">
          <label
            className="block text-xs font-medium text-text-secondary"
            htmlFor="opportunity-document-context"
          >
            Document for AI guidance
          </label>
          <select
            id="opportunity-document-context"
            className="feature-input mt-2 w-full"
            disabled={isLoading}
            value={selectedId}
            onChange={(event) => onChange(event.target.value)}
          >
            <option value="">
              {isLoading ? "Loading your documents…" : "Use my profile only"}
            </option>
            {documents.map((document) => (
              <option key={document.id} value={document.id}>
                {document.fileName}
              </option>
            ))}
          </select>
          {!isLoading && documents.length === 0 && (
            <p className="mt-2 text-xs leading-relaxed text-text-muted">
              No parsed documents yet. Upload a file to get document-specific advice.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
