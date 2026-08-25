import { AlertTriangle, RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { engineApi } from "../api/engineApi";
import type { OpportunityQualityScorecard } from "../model/types";

type Tone = "good" | "warning" | "danger";

interface Metric {
  label: string;
  value: string;
  detail: string;
  tone: Tone;
}

function percent(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

function lowerIsBetter(rate: number, warningAt: number, dangerAt: number): Tone {
  if (rate >= dangerAt) return "danger";
  if (rate >= warningAt) return "warning";
  return "good";
}

function metrics(data: OpportunityQualityScorecard): Metric[] {
  const active = data.active;
  const missingDeadline = percent(data.active_missing_deadline, active);
  const unconfirmedDeadline = percent(data.active_unknown_confidence, active);
  const imageless = percent(data.active_imageless, active);
  const stale = percent(data.active_stale_14d, active);
  const thin = percent(data.active_thin_description, active);
  const verified = percent(data.active_verified_7d, active);

  return [
    { label: "Missing deadline", value: `${missingDeadline}%`, detail: `${data.active_missing_deadline} of ${active} active`, tone: lowerIsBetter(missingDeadline, 25, 50) },
    { label: "Unconfirmed deadline", value: `${unconfirmedDeadline}%`, detail: `${data.active_unknown_confidence} active`, tone: lowerIsBetter(unconfirmedDeadline, 25, 50) },
    { label: "Missing image", value: `${imageless}%`, detail: `${data.active_imageless} active`, tone: lowerIsBetter(imageless, 20, 40) },
    { label: "Stale for 14 days", value: `${stale}%`, detail: `${data.active_stale_14d} active`, tone: lowerIsBetter(stale, 10, 25) },
    { label: "Thin description", value: `${thin}%`, detail: `${data.active_thin_description} active`, tone: lowerIsBetter(thin, 15, 35) },
    { label: "Verified in 7 days", value: `${verified}%`, detail: `${data.active_verified_7d} active`, tone: verified >= 80 ? "good" : verified >= 50 ? "warning" : "danger" },
    { label: "Duplicates", value: String(data.duplicates), detail: "flagged records", tone: data.duplicates ? "warning" : "good" },
    { label: "Pending review", value: String(data.pending_review), detail: "awaiting moderation", tone: data.pending_review ? "warning" : "good" },
    { label: "Listing URLs", value: String(data.active_listing_urls), detail: "non-detail links", tone: data.active_listing_urls ? "danger" : "good" },
    { label: "HTML titles", value: String(data.html_titles), detail: "markup contamination", tone: data.html_titles ? "danger" : "good" },
  ];
}

export default function DataQualityScorecard() {
  const [data, setData] = useState<OpportunityQualityScorecard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await engineApi.getQualityScorecard());
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Quality metrics are unavailable.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section
      className="engine-card engine-quality-card"
      aria-label="Catalog data quality"
    >
      <header className="engine-card-header">
        <div>
          <p className="engine-card-eyebrow">Catalog governance</p>
          <h2>Data quality</h2>
          <p>
            Health of {data?.active ?? 0} active opportunities from {data?.total ?? 0} total records.
          </p>
        </div>
        <button
          type="button"
          className="engine-icon-button"
          aria-label={error ? "Retry quality metrics" : "Refresh quality metrics"}
          disabled={loading}
          onClick={() => void load()}
        >
          <RefreshCw className={loading ? "is-spinning" : ""} size={17} aria-hidden="true" />
        </button>
      </header>

      {error ? (
        <div className="engine-quality-error" role="alert">
          <AlertTriangle size={17} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : data ? (
        <div className="engine-quality-grid">
          {metrics(data).map((metric) => (
            <article
              className={`engine-quality-metric engine-quality-metric--${metric.tone}`}
              key={metric.label}
            >
              <ShieldCheck size={16} aria-hidden="true" />
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <small>{metric.detail}</small>
            </article>
          ))}
        </div>
      ) : (
        <p className="engine-quality-loading" role="status">Reading catalog quality…</p>
      )}
    </section>
  );
}
