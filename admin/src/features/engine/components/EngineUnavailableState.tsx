import { AlertTriangle, RefreshCw } from "lucide-react";
import type { AdminApiError } from "../../../lib/apiError";

interface EngineUnavailableStateProps {
  title: string;
  description: string;
  error?: AdminApiError | null;
  onRetry?: () => void;
  retryLabel?: string;
}

export default function EngineUnavailableState({
  title,
  description,
  error,
  onRetry,
  retryLabel = "Try again",
}: EngineUnavailableStateProps) {
  return (
    <section className="engine-state engine-state--error" role="alert">
      <span className="engine-state-icon" aria-hidden="true">
        <AlertTriangle size={22} />
      </span>
      <div className="engine-state-copy">
        <h2>{title}</h2>
        <p>{description}</p>
        {error?.requestId ? (
          <p className="engine-request-reference">
            Reference: <code>{error.requestId}</code>
          </p>
        ) : null}
      </div>
      {onRetry ? (
        <button type="button" className="engine-state-action" onClick={onRetry}>
          <RefreshCw size={16} aria-hidden="true" />
          <span>{retryLabel}</span>
        </button>
      ) : null}
    </section>
  );
}
