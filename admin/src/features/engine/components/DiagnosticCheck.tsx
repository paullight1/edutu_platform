import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
} from "lucide-react";
import type { EngineDiagnosticCheck } from "../hooks/useEngineDiagnostics";

const ICONS = {
  success: CheckCircle2,
  info: Info,
  warning: AlertTriangle,
  error: AlertCircle,
} as const;

export default function DiagnosticCheck({
  check,
}: {
  check: EngineDiagnosticCheck;
}) {
  const Icon = ICONS[check.severity];

  return (
    <li
      className="engine-diagnostic-check"
      data-severity={check.severity}
    >
      <span className="engine-diagnostic-icon" aria-hidden="true">
        <Icon size={19} strokeWidth={1.8} />
      </span>
      <div className="engine-diagnostic-copy">
        <strong>{check.label}</strong>
        <p>{check.message}</p>
        {check.requestId ? (
          <span className="engine-request-reference">
            Reference: <code>{check.requestId}</code>
          </span>
        ) : null}
      </div>
    </li>
  );
}
