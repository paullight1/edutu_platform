import { AlertCircle } from "lucide-react";
import type { AdminApiError } from "../../../lib/apiError";

export interface EnginePartialDataError {
  label: string;
  error: AdminApiError;
}

export default function EnginePartialDataBanner({
  errors,
}: {
  errors: EnginePartialDataError[];
}) {
  if (errors.length === 0) return null;

  return (
    <section className="engine-partial-banner" role="status" aria-live="polite">
      <AlertCircle size={18} aria-hidden="true" />
      <div>
        <strong>
          {errors.length === 1
            ? "One Engine data source is unavailable"
            : `${errors.length} Engine data sources are unavailable`}
        </strong>
        <p>
          Available information is shown below. Missing information has not been
          replaced with zero values.
        </p>
        <ul>
          {errors.map(({ label, error }) => (
            <li key={`${label}:${error.requestId}`}>
              {label}: <code>{error.requestId}</code>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
