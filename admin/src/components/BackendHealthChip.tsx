import { useEffect, useRef, useState } from "react";
import { getBackendBaseUrl } from "../lib/backend";

type HealthState = "checking" | "healthy" | "unreachable";

const POLL_INTERVAL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 8_000;

function getBackendHost(): string {
  try {
    return new URL(getBackendBaseUrl()).host;
  } catch {
    return getBackendBaseUrl();
  }
}

const STATUS_COLORS: Record<HealthState, string> = {
  healthy: "var(--success, #34c759)",
  checking: "var(--warning, #ff9f0a)",
  unreachable: "var(--danger, #ff3b30)",
};

const BackendHealthChip = () => {
  const [status, setStatus] = useState<HealthState>("checking");
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;

    const checkHealth = async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const timeout = setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT_MS,
      );

      const started = performance.now();
      try {
        const response = await fetch(`${getBackendBaseUrl()}/health`, {
          signal: controller.signal,
        });
        if (cancelled) return;
        setLatencyMs(Math.round(performance.now() - started));
        setStatus(response.ok ? "healthy" : "unreachable");
      } catch {
        if (cancelled) return;
        setLatencyMs(null);
        setStatus("unreachable");
      } finally {
        clearTimeout(timeout);
        if (!cancelled) setLastChecked(new Date());
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
      abortRef.current?.abort();
    };
  }, []);

  const host = getBackendHost();

  const statusLabel =
    status === "healthy"
      ? "Backend healthy"
      : status === "checking"
        ? "Checking backend…"
        : "Backend unreachable — retrying (cold starts can take up to a minute)";

  const details = [
    latencyMs !== null ? `${latencyMs}ms` : null,
    lastChecked
      ? `last checked ${lastChecked.toLocaleTimeString()}`
      : "not checked yet",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className="nav-link backend-health-chip"
      title={`${statusLabel} — ${host} — ${details}`}
    >
      <span
        className="health-dot"
        style={{ background: STATUS_COLORS[status] }}
      />
      <span className="nav-label health-host">{host}</span>

      <style>{`
        .backend-health-chip {
          cursor: default;
          font-size: 12px;
        }

        .backend-health-chip:hover {
          background: var(--bg-tertiary);
          color: var(--text-primary);
        }

        .health-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
          /* Center within the 18px slot the nav icons occupy */
          margin: 0 5px;
        }

        .health-host {
          color: var(--text-tertiary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      `}</style>
    </div>
  );
};

export default BackendHealthChip;
