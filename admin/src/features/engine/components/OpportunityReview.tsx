import { Check, ExternalLink, Sparkles, TriangleAlert } from "lucide-react";
import type { ReviewedOpportunity } from "../hooks/useEngineRuns";

interface OpportunityReviewProps {
  entry: ReviewedOpportunity;
  index: number;
  onToggle(index: number): void;
}

function descriptionFor(value: ReviewedOpportunity["current"]): string {
  return value.description || value.summary || "No description was returned.";
}

function sourceUrlFor(value: ReviewedOpportunity["current"]): string | null {
  return (
    value.sourceUrl ||
    value.source_url ||
    value.applyUrl ||
    value.apply_url ||
    value.application_url ||
    null
  );
}

export default function OpportunityReview({
  entry,
  index,
  onToggle,
}: OpportunityReviewProps) {
  const fields = [
    "title",
    "organization",
    "summary",
    "description",
    "deadline",
    "requirements",
    "benefits",
    "application_process",
    "funding_type",
    "target_region",
  ] as const;
  const changedFields = fields.filter(
    (field) =>
      JSON.stringify(entry.current[field] ?? null) !==
      JSON.stringify(entry.original[field] ?? null),
  );
  const improved = changedFields.length > 0;
  const attempted = entry.current !== entry.original;
  const display = (value: unknown) =>
    Array.isArray(value) ? value.join(" • ") : String(value ?? "Not stated");
  const sourceUrl = sourceUrlFor(entry.current);

  return (
    <article
      className="engine-opportunity-review"
      data-selected={entry.selected}
    >
      <header className="engine-opportunity-review-header">
        <label>
          <input
            type="checkbox"
            checked={entry.selected}
            aria-label={`Select ${entry.current.title}`}
            onChange={() => onToggle(index)}
          />
          <span aria-hidden="true">
            <Check size={13} />
          </span>
        </label>
        <div>
          <h4>{entry.current.title}</h4>
          <p>
            {entry.current.organization ||
              entry.current.source ||
              "Unknown organization"}
            {entry.current.deadline
              ? ` · Deadline ${entry.current.deadline}`
              : ""}
          </p>
        </div>
        {entry.improving ? (
          <span className="engine-status-chip engine-status-chip--warning">
            <Sparkles size={12} aria-hidden="true" /> Improving
          </span>
        ) : improved ? (
          <span className="engine-status-chip engine-status-chip--success">
            <Sparkles size={12} aria-hidden="true" /> {changedFields.length}{" "}
            fields changed
          </span>
        ) : null}
        {sourceUrl ? (
          <a
            className="engine-icon-button"
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open source for ${entry.current.title}`}
          >
            <ExternalLink size={15} aria-hidden="true" />
          </a>
        ) : null}
      </header>

      {entry.error ? (
        <p className="engine-form-error" role="alert">
          <TriangleAlert size={14} aria-hidden="true" />
          {entry.error}
        </p>
      ) : null}

      {attempted && !improved ? (
        <p role="status">
          No content changes were returned. The original is preserved.
        </p>
      ) : null}
      {improved ? (
        <p>
          Changed:{" "}
          {changedFields.map((field) => field.replaceAll("_", " ")).join(", ")}
        </p>
      ) : null}
      <div
        className={`engine-opportunity-compare ${improved ? "" : "engine-opportunity-compare--single"}`}
      >
        <section>
          <span>Original</span>
          <p>{descriptionFor(entry.original)}</p>
          {changedFields
            .filter((field) => field !== "description")
            .map((field) => (
              <p key={field}>
                <strong>{field.replaceAll("_", " ")}:</strong>{" "}
                {display(entry.original[field])}
              </p>
            ))}
        </section>
        {improved ? (
          <section>
            <span>Improved preview</span>
            <p>{descriptionFor(entry.current)}</p>
            {changedFields
              .filter((field) => field !== "description")
              .map((field) => (
                <p key={field}>
                  <strong>{field.replaceAll("_", " ")}:</strong>{" "}
                  {display(entry.current[field])}
                </p>
              ))}
          </section>
        ) : null}
      </div>
    </article>
  );
}
